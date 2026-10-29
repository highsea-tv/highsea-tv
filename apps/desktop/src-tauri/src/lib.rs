// SPDX-License-Identifier: AGPL-3.0-only
// highsea's desktop app (ADR 0058): apps/web's build in a Tauri 2 window, with what only an app
// can do on the Rust side. The page calls these commands through `src/host.ts` in apps/web.
mod discovery;
mod keychain;
mod oidc;
mod proxy;
mod servers;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::proxy::{ApiRequest, ApiResponse, StreamHead, Streams};
use crate::servers::{Current, KnownServer, ServerView, Servers};

/// How long C1 looks on the network each time.
const LOOK_FOR: Duration = Duration::from_secs(4);

/// A sign-in through the browser waiting to come back: the server and its PKCE verifier.
#[derive(Default)]
struct Pending(Mutex<Option<(String, String)>>);

/// Seconds since 1970: enough for "last used", which the page words.
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// This computer's name as its owner set it: "Ines's MacBook Pro", not "Ines-MBP.local".
fn computer_name() -> String {
    #[cfg(target_os = "macos")]
    if let Ok(out) = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
    {
        let name = String::from_utf8_lossy(&out.stdout).trim().to_owned();
        if !name.is_empty() {
            return name;
        }
    }
    let host = tauri_plugin_os::hostname();
    host.trim_end_matches(".local").to_owned()
}

/// What the app signs in as (DeviceInput in the API).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    name: String,
    client: &'static str,
    app_version: String,
}

fn device(app: &AppHandle) -> Device {
    Device {
        name: computer_name().chars().take(100).collect(),
        client: "desktop",
        app_version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
fn app_device(app: AppHandle) -> Device {
    device(&app)
}

#[tauri::command]
fn servers_list(servers: State<'_, Servers>) -> Vec<ServerView> {
    servers.list()
}

#[tauri::command]
fn server_current(servers: State<'_, Servers>) -> Option<Current> {
    servers.current()
}

/// A typed address: its server's public info, remembered, and connected to.
#[tauri::command]
async fn server_add(servers: State<'_, Servers>, address: String) -> Result<KnownServer, String> {
    let base = servers::normalize(&address)?;
    let info = servers.info_at(&base).await?;
    let server = servers.remember(&info, &base, now());
    servers.connect(&server.id).await.ok_or("unreachable")?;
    Ok(server)
}

#[tauri::command]
async fn server_use(servers: State<'_, Servers>, id: String) -> Result<Current, String> {
    servers
        .connect(&id)
        .await
        .ok_or_else(|| "unreachable".into())
}

#[tauri::command]
fn server_leave(servers: State<'_, Servers>) {
    servers.set_current(None);
}

#[tauri::command]
fn server_forget(servers: State<'_, Servers>, id: String) {
    servers.forget(&id);
}

#[tauri::command]
async fn api(servers: State<'_, Servers>, request: ApiRequest) -> Result<ApiResponse, ()> {
    Ok(proxy::api(&servers, request).await)
}

#[tauri::command]
async fn stream_open(
    servers: State<'_, Servers>,
    streams: State<'_, Streams>,
    id: u32,
    request: ApiRequest,
    on_chunk: Channel<Vec<u8>>,
) -> Result<StreamHead, ()> {
    Ok(proxy::stream_open(&servers, &streams, id, request, on_chunk).await)
}

#[tauri::command]
fn stream_close(streams: State<'_, Streams>, id: u32) {
    proxy::stream_close(&streams, id);
}

#[tauri::command]
async fn discover(on_found: Channel<discovery::Found>) -> Result<(), ()> {
    discovery::discover(LOOK_FOR, on_found).await;
    Ok(())
}

/// Opens the server's single sign-on in the system browser (oidc.rs).
#[tauri::command]
fn oidc_start(
    app: AppHandle,
    servers: State<'_, Servers>,
    pending: State<'_, Pending>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let current = servers.current().ok_or("unreachable")?;
    let (verifier, challenge) = oidc::pkce();
    *pending.0.lock().unwrap() = Some((current.id.clone(), verifier));
    let url = format!(
        "{}{}?app=desktop&challenge={challenge}",
        current.base,
        oidc::START
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// What the page hears when a browser sign-in comes back.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
enum OidcDone {
    SignedIn,
    Failed { reason: String },
}

async fn oidc_finish(app: AppHandle, back: oidc::Back) {
    let done = match back {
        oidc::Back::Error(reason) => OidcDone::Failed { reason },
        oidc::Back::Code(code) => exchange(&app, code).await,
    };
    let _ = app.emit("highsea://oidc", done);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
}

async fn exchange(app: &AppHandle, code: String) -> OidcDone {
    let servers = app.state::<Servers>();
    let failed = |reason: &str| OidcDone::Failed {
        reason: reason.into(),
    };
    let Some((server, verifier)) = app.state::<Pending>().0.lock().unwrap().take() else {
        return failed("not-started");
    };
    let Some(current) = servers.current().filter(|c| c.id == server) else {
        return failed("unreachable");
    };
    let body = serde_json::json!({ "code": code, "verifier": verifier, "device": device(app) });
    let res = servers
        .http
        .post(format!("{}{}", current.base, oidc::EXCHANGE))
        .json(&body)
        .send()
        .await;
    let Ok(res) = res else {
        return failed("unreachable");
    };
    if !res.status().is_success() {
        return failed("invalid");
    }
    let text = res.text().await.unwrap_or_default();
    match proxy::keep_token(&text).0 {
        Some(token) if servers.tokens.set(&current.id, &token).is_ok() => OidcDone::SignedIn,
        Some(_) => failed("keychain"),
        None => failed("invalid"),
    }
}

/// `highsea://` links: `oidc` finishes a browser sign-in; `connect?server=…` opens C1 with it.
fn open_links(app: &AppHandle, urls: Vec<String>) {
    for url in urls {
        if let Some(back) = oidc::read_back(&url) {
            let app = app.clone();
            tauri::async_runtime::spawn(oidc_finish(app, back));
        } else if let Ok(u) = reqwest::Url::parse(&url)
            && u.scheme() == "highsea"
            && u.host_str() == Some("connect")
            && let Some((_, server)) = u.query_pairs().find(|(k, _)| k == "server")
        {
            let _ = app.emit("highsea://connect", server.into_owned());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // first, so a second launch only hands its links to this one (https://v2.tauri.app/plugin/single-instance/)
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("server", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let servers = app.state::<Servers>();
                responder.respond(proxy::media(&servers, request).await);
            });
        })
        .setup(|app| {
            let file = app.path().app_data_dir()?.join("servers.json");
            app.manage(Servers::new(file, Arc::new(keychain::Keychain)));
            app.manage(Streams::default());
            app.manage(Pending::default());

            use tauri_plugin_deep_link::DeepLinkExt;
            // Linux, and Windows in development, register the scheme when the app runs
            // (https://v2.tauri.app/plugin/deep-linking/#registering-desktop-deep-links-at-runtime)
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                open_links(
                    &handle,
                    event.urls().iter().map(|u| u.to_string()).collect(),
                );
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_device,
            servers_list,
            server_current,
            server_add,
            server_use,
            server_leave,
            server_forget,
            api,
            stream_open,
            stream_close,
            discover,
            oidc_start,
        ])
        .run(tauri::generate_context!())
        .expect("highsea's window");
}
