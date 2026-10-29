// SPDX-License-Identifier: AGPL-3.0-only
// How the page reaches the server (ADR 0058). The page is the app's own, not the server's, so
// everything goes through the Rust side, which adds this device's token from the keychain: the
// page never holds it.
//
// - API calls: the `api` command, answered whole; a token in a sign-in's answer is kept in the
//   keychain and taken out of what the page gets.
// - The event stream: `stream_open` sends the body to the page through a channel as it arrives
//   (https://v2.tauri.app/develop/calling-frontend/#channels).
// - Anything the page loads by URL (posters, trickplay, subtitles, the streams): the `server`
//   scheme, `server://localhost/<path>` (`http://server.localhost/<path>` on Windows), forwarded
//   as GET with the token. A scheme's answer is one buffer (Builder::register_asynchronous_uri_scheme_protocol),
//   so an open-ended byte range is answered a part at a time, which media players ask for anyway
//   (RFC 9110 § 14.4: the answer's Content-Range says which part it is).
use std::collections::HashMap;
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::http::{Request, Response, StatusCode};
use tauri::ipc::Channel;

use crate::servers::Servers;

/// The most one answer through the scheme carries.
pub const CHUNK: u64 = 8 * 1024 * 1024;

#[derive(Deserialize)]
pub struct ApiRequest {
    pub method: String,
    /// The path and query, from `/api/`.
    pub path: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    /// 0 when the server couldn't be reached.
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

/// Only these go to the server from the page; the token is the Rust side's to add.
fn forwarded(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "accept" | "content-type" | "last-event-id" | "accept-language" | "if-none-match"
    )
}

/// Paths the page may ask for: the API and the streams, never another host.
fn allowed(path: &str) -> bool {
    (path.starts_with("/api/") || path.starts_with("/stream/")) && !path.contains("..")
}

fn unreachable() -> ApiResponse {
    ApiResponse {
        status: 0,
        headers: vec![],
        body: String::new(),
    }
}

/// A sign-in's answer carries the device token once: kept, and taken out of the page's copy.
pub fn keep_token(body: &str) -> (Option<String>, String) {
    let Ok(mut json) = serde_json::from_str::<serde_json::Value>(body) else {
        return (None, body.to_owned());
    };
    let token = json
        .as_object_mut()
        .and_then(|o| o.remove("token"))
        .and_then(|t| t.as_str().map(str::to_owned));
    match token {
        Some(t) => (Some(t), json.to_string()),
        None => (None, body.to_owned()),
    }
}

pub async fn api(servers: &Servers, req: ApiRequest) -> ApiResponse {
    let Some(current) = servers.current() else {
        return unreachable();
    };
    if !allowed(&req.path) {
        return ApiResponse {
            status: 400,
            headers: vec![],
            body: String::new(),
        };
    }
    let method = reqwest::Method::from_bytes(req.method.as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut r = servers
        .http
        .request(method, format!("{}{}", current.base, req.path));
    for (k, v) in req.headers.iter().filter(|(k, _)| forwarded(k)) {
        r = r.header(k, v);
    }
    if let Some(token) = servers.tokens.get(&current.id) {
        r = r.bearer_auth(token);
    }
    if let Some(body) = req.body {
        r = r.body(body);
    }
    let Ok(res) = r.send().await else {
        return unreachable();
    };
    let status = res.status().as_u16();
    let headers = res
        .headers()
        .iter()
        .filter(|(k, _)| k.as_str() != "set-cookie")
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_owned())))
        .collect();
    let body = res.text().await.unwrap_or_default();
    let body = if req.path.starts_with("/api/v1/auth/") && (200..300).contains(&status) {
        let (token, rest) = keep_token(&body);
        if let Some(t) = token
            && servers.tokens.set(&current.id, &t).is_err()
        {
            // without the keychain the app can't stay signed in; the page says so
            return ApiResponse {
                status: 500,
                headers: vec![],
                body: r#"{"code":"keychain","message":"keychain"}"#.into(),
            };
        }
        rest
    } else {
        body
    };
    // signing out ends the token on the server; it's no use kept here
    if req.path == "/api/v1/auth/sign-out" && (200..300).contains(&status) {
        servers.tokens.delete(&current.id);
    }
    if status == 401
        && servers.tokens.get(&current.id).is_some()
        && !req.path.starts_with("/api/v1/auth/")
    {
        // the server ended this device's token (signed out from elsewhere)
        servers.tokens.delete(&current.id);
    }
    ApiResponse {
        status,
        headers,
        body,
    }
}

/// A streamed answer's head; the body follows on the channel, then an empty message at its end.
#[derive(Serialize)]
pub struct StreamHead {
    pub status: u16,
    pub headers: Vec<(String, String)>,
}

#[derive(Default)]
pub struct Streams(pub Mutex<HashMap<u32, tauri::async_runtime::JoinHandle<()>>>);

pub async fn stream_open(
    servers: &Servers,
    streams: &Streams,
    id: u32,
    req: ApiRequest,
    on_chunk: Channel<Vec<u8>>,
) -> StreamHead {
    let Some(current) = servers.current() else {
        return StreamHead {
            status: 0,
            headers: vec![],
        };
    };
    if !allowed(&req.path) {
        return StreamHead {
            status: 400,
            headers: vec![],
        };
    }
    let mut r = servers.http.get(format!("{}{}", current.base, req.path));
    for (k, v) in req.headers.iter().filter(|(k, _)| forwarded(k)) {
        r = r.header(k, v);
    }
    if let Some(token) = servers.tokens.get(&current.id) {
        r = r.bearer_auth(token);
    }
    let Ok(res) = r.send().await else {
        return StreamHead {
            status: 0,
            headers: vec![],
        };
    };
    let head = StreamHead {
        status: res.status().as_u16(),
        headers: res
            .headers()
            .iter()
            .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_owned())))
            .collect(),
    };
    let task = tauri::async_runtime::spawn(async move {
        let mut body = res.bytes_stream();
        while let Some(Ok(bytes)) = body.next().await {
            if bytes.is_empty() {
                continue;
            }
            if on_chunk.send(bytes.to_vec()).is_err() {
                return;
            }
        }
        let _ = on_chunk.send(Vec::new());
    });
    streams.0.lock().unwrap().insert(id, task);
    head
}

pub fn stream_close(streams: &Streams, id: u32) {
    if let Some(task) = streams.0.lock().unwrap().remove(&id) {
        task.abort();
    }
}

/// An open-ended or oversized range, narrowed to at most CHUNK bytes from its start.
pub fn narrow_range(range: Option<&str>) -> Option<String> {
    let r = range?.trim();
    let spec = r.strip_prefix("bytes=")?;
    // several ranges at once aren't narrowed: media players don't ask for them
    if spec.contains(',') {
        return Some(r.to_owned());
    }
    let (start, end) = spec.split_once('-')?;
    let Ok(start) = start.parse::<u64>() else {
        return Some(r.to_owned());
    };
    let last = start + CHUNK - 1;
    let end = match end.parse::<u64>() {
        Ok(e) if e <= last => e,
        _ => last,
    };
    Some(format!("bytes={start}-{end}"))
}

/// Headers passed back to the page from a media answer.
const MEDIA_HEADERS: [&str; 7] = [
    "content-type",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
    "content-length",
];

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("access-control-allow-origin", "*")
        .body(Vec::new())
        .unwrap()
}

/// The `server` scheme: `/api/…` and `/stream/…` from the current server, with the token.
pub async fn media(servers: &Servers, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(current) = servers.current() else {
        return empty(StatusCode::BAD_GATEWAY);
    };
    let uri = request.uri();
    let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
    if !allowed(path) {
        return empty(StatusCode::NOT_FOUND);
    }
    let head = request.method() == tauri::http::Method::HEAD;
    let mut r = servers.http.request(
        if head {
            reqwest::Method::HEAD
        } else {
            reqwest::Method::GET
        },
        format!("{}{path}", current.base),
    );
    if let Some(range) = narrow_range(request.headers().get("range").and_then(|v| v.to_str().ok()))
    {
        r = r.header("range", range);
    }
    if let Some(v) = request
        .headers()
        .get("if-none-match")
        .and_then(|v| v.to_str().ok())
    {
        r = r.header("if-none-match", v);
    }
    if let Some(token) = servers.tokens.get(&current.id) {
        r = r.bearer_auth(token);
    }
    let Ok(res) = r.send().await else {
        return empty(StatusCode::BAD_GATEWAY);
    };
    let mut out = Response::builder()
        .status(res.status().as_u16())
        .header("access-control-allow-origin", "*")
        .header(
            "access-control-expose-headers",
            "content-range, content-length, accept-ranges",
        );
    for name in MEDIA_HEADERS {
        if let Some(v) = res.headers().get(name).and_then(|v| v.to_str().ok()) {
            out = out.header(name, v);
        }
    }
    // a whole file asked for without a range is still answered a part at a time
    let body = if head {
        Vec::new()
    } else {
        res.bytes().await.map(|b| b.to_vec()).unwrap_or_default()
    };
    out.body(body)
        .unwrap_or_else(|_| empty(StatusCode::BAD_GATEWAY))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn narrows_open_ranges() {
        assert_eq!(
            narrow_range(Some("bytes=0-")).unwrap(),
            format!("bytes=0-{}", CHUNK - 1)
        );
        assert_eq!(narrow_range(Some("bytes=0-1")).unwrap(), "bytes=0-1");
        assert_eq!(
            narrow_range(Some("bytes=100-999999999")).unwrap(),
            format!("bytes=100-{}", 100 + CHUNK - 1)
        );
        assert_eq!(narrow_range(Some("bytes=-500")).unwrap(), "bytes=-500");
        assert_eq!(narrow_range(None), None);
    }

    #[test]
    fn keeps_a_sign_ins_token_from_the_page() {
        let (t, rest) = keep_token(r#"{"status":"signed-in","token":"abc","session":{"id":"s"}}"#);
        assert_eq!(t.as_deref(), Some("abc"));
        assert!(!rest.contains("abc"));
        assert!(rest.contains("\"session\""));
        let (none, same) = keep_token(r#"{"status":"two-factor","challenge":"c"}"#);
        assert_eq!(none, None);
        assert!(same.contains("challenge"));
    }

    #[test]
    fn only_the_api_and_streams_go_through() {
        assert!(allowed("/api/v1/items"));
        assert!(allowed("/stream/files/t"));
        assert!(!allowed("/admin"));
        assert!(!allowed("/api/../admin"));
        assert!(!forwarded("Authorization"));
        assert!(!forwarded("cookie"));
        assert!(forwarded("Content-Type"));
    }
}
