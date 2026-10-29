// SPDX-License-Identifier: AGPL-3.0-only
// The servers this app knows (connectivity.md): names and addresses, kept as plain app data in
// `servers.json` in the app's data folder; their tokens are in the keychain (keychain.rs). Choosing
// a server probes its addresses as the SDK's ServerConnection does: a LAN address that answers
// wins, the fastest if several, else the fastest remote one.
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::keychain::Tokens;

pub const PUBLIC_INFO: &str = "/api/v1/system/info/public";
const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    pub url: String,
    /// "local" or "remote"
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnownServer {
    pub id: String,
    pub name: String,
    pub addresses: Vec<Address>,
    /// When this app last reached it, in seconds since 1970.
    pub last_seen: u64,
}

/// A known server as the page sees it: whether this device is signed in, never the token.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerView {
    #[serde(flatten)]
    pub server: KnownServer,
    pub signed_in: bool,
    pub current: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Current {
    pub id: String,
    pub name: String,
    /// The address in use, without a trailing slash.
    pub base: String,
    pub kind: String,
}

pub struct Servers {
    file: PathBuf,
    known: Mutex<Vec<KnownServer>>,
    current: Mutex<Option<Current>>,
    pub tokens: Arc<dyn Tokens>,
    pub http: reqwest::Client,
}

/// What someone typed, as an address: `harbor.example.net` is https, `192.168.1.20:3000` http.
pub fn normalize(input: &str) -> Result<String, String> {
    let t = input.trim().trim_end_matches('/');
    if t.is_empty() {
        return Err("empty".into());
    }
    let rest = t
        .strip_prefix("http://")
        .or_else(|| t.strip_prefix("https://"))
        .unwrap_or(t);
    if rest.is_empty() || rest.starts_with(':') || t == "http:" || t == "https:" {
        return Err("invalid".into());
    }
    let with_scheme = if t.starts_with("http://") || t.starts_with("https://") {
        t.to_owned()
    } else if looks_local(t) {
        format!("http://{t}")
    } else {
        format!("https://{t}")
    };
    let url = reqwest::Url::parse(&with_scheme).map_err(|_| "invalid".to_string())?;
    if url.host_str().is_none() {
        return Err("invalid".into());
    }
    Ok(with_scheme)
}

/// An IP address, `localhost` or a `.local` name: reached on the LAN, usually without TLS.
fn looks_local(host_and_port: &str) -> bool {
    let host = host_and_port.split(':').next().unwrap_or("");
    host == "localhost" || host.ends_with(".local") || host.parse::<std::net::Ipv4Addr>().is_ok()
}

/// A server's addresses from its public info: every LAN address, then its remote one.
pub fn addresses_of(info: &serde_json::Value, reached: &str) -> Vec<Address> {
    let mut out: Vec<Address> = Vec::new();
    let mut push = |url: &str, kind: &str| {
        let url = url.trim_end_matches('/').to_owned();
        if !out.iter().any(|a| a.url == url) {
            out.push(Address {
                url,
                kind: kind.into(),
            });
        }
    };
    if let Some(list) = info["localAddresses"].as_array() {
        for a in list.iter().filter_map(|a| a.as_str()) {
            push(a, "local");
        }
    }
    if let Some(remote) = info["publicUrl"].as_str() {
        push(remote, "remote");
    }
    let reached_kind = if looks_local(reached.split("://").nth(1).unwrap_or("")) {
        "local"
    } else {
        "remote"
    };
    push(reached, reached_kind);
    out
}

impl Servers {
    pub fn new(file: PathBuf, tokens: Arc<dyn Tokens>) -> Self {
        let known = std::fs::read(&file)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let http = reqwest::Client::builder()
            .user_agent(concat!("highsea-desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("an HTTP client");
        Self {
            file,
            known: Mutex::new(known),
            current: Mutex::new(None),
            tokens,
            http,
        }
    }

    fn save(&self, known: &[KnownServer]) {
        if let Some(dir) = self.file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec_pretty(known) {
            // written whole, then renamed over the old file, so a crash leaves one or the other
            let tmp = self.file.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, &self.file);
            }
        }
    }

    pub fn list(&self) -> Vec<ServerView> {
        let current = self.current().map(|c| c.id);
        self.known
            .lock()
            .unwrap()
            .iter()
            .map(|s| ServerView {
                signed_in: self.tokens.get(&s.id).is_some(),
                current: current.as_deref() == Some(s.id.as_str()),
                server: s.clone(),
            })
            .collect()
    }

    pub fn current(&self) -> Option<Current> {
        self.current.lock().unwrap().clone()
    }

    /// Adds or updates a server from its public info, keeping the addresses it already had.
    pub fn remember(&self, info: &serde_json::Value, reached: &str, now: u64) -> KnownServer {
        let id = info["id"].as_str().unwrap_or_default().to_owned();
        let name = info["name"].as_str().unwrap_or("highsea").to_owned();
        let mut known = self.known.lock().unwrap();
        let fresh = addresses_of(info, reached);
        let server = match known.iter_mut().find(|s| s.id == id) {
            Some(s) => {
                s.name = name;
                for a in fresh {
                    if !s.addresses.iter().any(|b| b.url == a.url) {
                        s.addresses.push(a);
                    }
                }
                s.last_seen = now;
                s.clone()
            }
            None => {
                let s = KnownServer {
                    id,
                    name,
                    addresses: fresh,
                    last_seen: now,
                };
                known.push(s.clone());
                s
            }
        };
        self.save(&known);
        server
    }

    pub fn forget(&self, id: &str) {
        self.tokens.delete(id);
        let mut known = self.known.lock().unwrap();
        known.retain(|s| s.id != id);
        self.save(&known);
        let mut current = self.current.lock().unwrap();
        if current.as_ref().is_some_and(|c| c.id == id) {
            *current = None;
        }
    }

    pub fn find(&self, id: &str) -> Option<KnownServer> {
        self.known
            .lock()
            .unwrap()
            .iter()
            .find(|s| s.id == id)
            .cloned()
    }

    pub fn set_current(&self, current: Option<Current>) {
        *self.current.lock().unwrap() = current;
    }

    /// The server's public info at an address, if it answers in time.
    pub async fn info_at(&self, base: &str) -> Result<serde_json::Value, String> {
        let res = self
            .http
            .get(format!("{base}{PUBLIC_INFO}"))
            .header("accept", "application/json")
            .timeout(PROBE_TIMEOUT)
            .send()
            .await
            .map_err(|_| "unreachable".to_string())?;
        if !res.status().is_success() {
            return Err("not-highsea".into());
        }
        let info: serde_json::Value = res.json().await.map_err(|_| "not-highsea".to_string())?;
        if info["id"].as_str().is_none() {
            return Err("not-highsea".into());
        }
        Ok(info)
    }

    /// Probes every address of a known server and picks one, as the SDK's ServerConnection does.
    pub async fn connect(&self, id: &str) -> Option<Current> {
        let server = self.find(id)?;
        let probes = server.addresses.iter().map(|a| async move {
            let started = Instant::now();
            match self.info_at(&a.url).await {
                Ok(info) if info["id"].as_str() == Some(id) => Some((a.clone(), started.elapsed())),
                _ => None,
            }
        });
        let answered: Vec<(Address, Duration)> = futures_util::future::join_all(probes)
            .await
            .into_iter()
            .flatten()
            .collect();
        let fastest = |kind: &str| {
            answered
                .iter()
                .filter(|(a, _)| a.kind == kind)
                .min_by_key(|(_, t)| *t)
                .map(|(a, _)| a.clone())
        };
        let best = fastest("local").or_else(|| fastest("remote"))?;
        let current = Current {
            id: server.id.clone(),
            name: server.name.clone(),
            base: best.url,
            kind: best.kind,
        };
        self.set_current(Some(current.clone()));
        Some(current)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keychain::Memory;
    use serde_json::json;

    #[test]
    fn reads_typed_addresses() {
        assert_eq!(
            normalize("harbor.example.net").unwrap(),
            "https://harbor.example.net"
        );
        assert_eq!(
            normalize("192.168.1.20:3000").unwrap(),
            "http://192.168.1.20:3000"
        );
        assert_eq!(
            normalize("nas.local:3000/").unwrap(),
            "http://nas.local:3000"
        );
        assert_eq!(
            normalize("http://harbor.example.net").unwrap(),
            "http://harbor.example.net"
        );
        assert!(normalize("  ").is_err());
        assert!(normalize("http://").is_err());
    }

    #[test]
    fn remembers_servers_and_merges_their_addresses() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("servers.json");
        let servers = Servers::new(file.clone(), Arc::new(Memory::default()));
        let info = json!({
            "id": "srv_a", "name": "Harbor",
            "localAddresses": ["http://192.168.1.20:3000"],
            "publicUrl": "https://harbor.example.net/"
        });
        let s = servers.remember(&info, "http://192.168.1.20:3000", 1_793_000_000);
        assert_eq!(s.addresses.len(), 2);
        assert_eq!(
            s.addresses[1],
            Address {
                url: "https://harbor.example.net".into(),
                kind: "remote".into()
            }
        );

        // reached at a new address later: added, not replacing
        servers.remember(
            &json!({ "id": "srv_a", "name": "Harbour", "localAddresses": [], "publicUrl": null }),
            "http://nas.local:3000",
            1_793_086_400,
        );
        let again = Servers::new(file, Arc::new(Memory::default()));
        let list = again.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].server.name, "Harbour");
        assert_eq!(list[0].server.addresses.len(), 3);
        assert!(!list[0].signed_in);
    }

    #[test]
    fn forgetting_a_server_drops_its_token() {
        let dir = tempfile::tempdir().unwrap();
        let tokens = Arc::new(Memory::default());
        let servers = Servers::new(dir.path().join("servers.json"), tokens.clone());
        servers.remember(
            &json!({ "id": "srv_a", "name": "Harbor" }),
            "http://10.0.0.2:3000",
            1,
        );
        tokens.set("srv_a", "secret").unwrap();
        assert!(servers.list()[0].signed_in);
        servers.forget("srv_a");
        assert!(servers.list().is_empty());
        assert_eq!(tokens.get("srv_a"), None);
    }
}
