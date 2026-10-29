// SPDX-License-Identifier: AGPL-3.0-only
// Finding servers on this network (ADR 0020), both ways at once for a few seconds: the UDP
// broadcast `highsea:discover:1` to port 7368, answered with the server's public info, and mDNS
// `_highsea._tcp` through mdns-sd (https://docs.rs/mdns-sd/0.21.5/), whose TXT record carries the
// server's id. Each server is sent to the page once, as it answers, by id.
//
// macOS 15 asks the person before an app may do either (Apple TN3179). While refused, sends fail
// with "no route to host" (EHOSTUNREACH), which the page shows as the refused state.
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tokio::net::UdpSocket;

pub const MESSAGE: &[u8] = b"highsea:discover:1";
pub const PORT: u16 = 7368;
pub const MDNS_TYPE: &str = "_highsea._tcp.local.";

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Found {
    /// A server, by the address it answered from.
    Server {
        id: String,
        name: String,
        address: String,
    },
    /// The OS refused this app the local network.
    Refused,
    /// Done looking.
    Done,
}

/// Sends each server once.
#[derive(Clone)]
struct Once {
    seen: Arc<Mutex<HashSet<String>>>,
    to: Channel<Found>,
}

impl Once {
    fn send(&self, found: Found) {
        if let Found::Server { id, .. } = &found
            && !self.seen.lock().unwrap().insert(id.clone())
        {
            return;
        }
        let _ = self.to.send(found);
    }
}

/// A UDP answer: the server's public info, with the address it came from.
pub fn read_answer(bytes: &[u8], from: SocketAddr) -> Option<Found> {
    let info: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let id = info["id"].as_str()?.to_owned();
    let name = info["name"].as_str().unwrap_or("highsea").to_owned();
    // the server lists the address it serves on; an answer from it is the surest one to use
    let ip = from.ip().to_string();
    let address = info["localAddresses"]
        .as_array()
        .and_then(|l| {
            l.iter()
                .filter_map(|a| a.as_str())
                .find(|a| a.contains(&ip))
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("http://{ip}:3000"));
    Some(Found::Server { id, name, address })
}

async fn broadcast(target: SocketAddr, how_long: Duration, out: Once) {
    let Ok(socket) = UdpSocket::bind("0.0.0.0:0").await else {
        return;
    };
    let _ = socket.set_broadcast(true);
    let deadline = tokio::time::Instant::now() + how_long;
    let mut buf = vec![0u8; 64 * 1024];
    // UDP may lose a packet, so ask once a second until the time's up
    let mut ask = tokio::time::interval(Duration::from_secs(1));
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => return,
            _ = ask.tick() => {
                if let Err(e) = socket.send_to(MESSAGE, target).await
                    && cfg!(target_os = "macos") && e.kind() == std::io::ErrorKind::HostUnreachable {
                        out.send(Found::Refused);
                        return;
                    }
            }
            got = socket.recv_from(&mut buf) => {
                if let Ok((n, from)) = got
                    && let Some(found) = read_answer(&buf[..n], from) {
                        out.send(found);
                    }
            }
        }
    }
}

fn browse(how_long: Duration, out: Once) {
    let Ok(daemon) = mdns_sd::ServiceDaemon::new() else {
        return;
    };
    let Ok(events) = daemon.browse(MDNS_TYPE) else {
        return;
    };
    let deadline = std::time::Instant::now() + how_long;
    while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
        match events.recv_timeout(left) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(s)) => {
                let Some(id) = s.get_property_val_str("id") else {
                    continue;
                };
                let Some(ip) = s.get_addresses_v4().into_iter().next() else {
                    continue;
                };
                // the instance name is the server's name: "Harbor._highsea._tcp.local."
                let name = s
                    .get_fullname()
                    .trim_end_matches(MDNS_TYPE)
                    .trim_end_matches('.')
                    .to_owned();
                out.send(Found::Server {
                    id: id.to_owned(),
                    name: if name.is_empty() {
                        "highsea".into()
                    } else {
                        name
                    },
                    address: format!("http://{ip}:{}", s.get_port()),
                });
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = daemon.shutdown();
}

/// Looks for `how_long`, sending each server as it answers, then `Done`.
pub async fn discover(how_long: Duration, to: Channel<Found>) {
    let out = Once {
        seen: Arc::default(),
        to,
    };
    let target = SocketAddr::from(([255, 255, 255, 255], PORT));
    let mdns = {
        let out = out.clone();
        tokio::task::spawn_blocking(move || browse(how_long, out))
    };
    broadcast(target, how_long, out.clone()).await;
    let _ = mdns.await;
    let _ = out.to.send(Found::Done);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_answer() {
        let from: SocketAddr = "192.168.1.20:7368".parse().unwrap();
        let body = br#"{"id":"srv_a","name":"Harbor","localAddresses":["http://10.0.0.5:3000","http://192.168.1.20:3000"]}"#;
        assert_eq!(
            read_answer(body, from),
            Some(Found::Server {
                id: "srv_a".into(),
                name: "Harbor".into(),
                address: "http://192.168.1.20:3000".into()
            })
        );
        assert_eq!(read_answer(b"not json", from), None);
        assert_eq!(read_answer(br#"{"name":"no id"}"#, from), None);
    }

    /// A server answering on loopback, as the server's own responder does (packages/network).
    #[tokio::test]
    async fn finds_a_server_answering_on_udp() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let target = server.local_addr().unwrap();
        tokio::spawn(async move {
            let mut buf = [0u8; 64];
            loop {
                let (n, from) = server.recv_from(&mut buf).await.unwrap();
                if &buf[..n] == MESSAGE {
                    let answer = br#"{"id":"srv_a","name":"Harbor","localAddresses":["http://127.0.0.1:3000"]}"#;
                    server.send_to(answer, from).await.unwrap();
                }
            }
        });
        let found = Arc::new(Mutex::new(Vec::new()));
        let sink = found.clone();
        let channel = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(json) = body {
                sink.lock().unwrap().push(json);
            }
            Ok(())
        });
        let out = Once {
            seen: Arc::default(),
            to: channel,
        };
        broadcast(target, Duration::from_millis(2200), out).await;
        let found = found.lock().unwrap();
        // asked twice, sent once
        assert_eq!(found.len(), 1);
        assert!(found[0].contains("\"srv_a\""));
        assert!(found[0].contains("http://127.0.0.1:3000"));
    }
}
