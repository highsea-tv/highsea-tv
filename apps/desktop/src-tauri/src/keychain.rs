// SPDX-License-Identifier: AGPL-3.0-only
// Device tokens, one per server, in the OS's own store (ADR 0058): Keychain on macOS, Credential
// Manager on Windows, the Secret Service on Linux, through keyring's `v1` mode
// (https://docs.rs/keyring/4.2.0/keyring/). The page never sees a token: the Rust side adds it to
// each request. Behind a trait, so tests use the memory store.
//
// The keychain's service is the app's identifier, read at runtime (lib.rs: `Manager::config()`'s
// `identifier`, https://docs.rs/tauri/2.12.4/tauri/trait.Manager.html#method.config), the same
// identifier the app's data folder is named after
// (https://docs.rs/tauri/2.12.4/tauri/path/struct.PathResolver.html#method.app_data_dir). So a
// build run with `--config '{"identifier":"tv.highsea.desktop.test"}'` keeps its tokens apart
// from the app's: keyring names an entry by its service and user
// (https://docs.rs/keyring/4.2.0/keyring/struct.Entry.html#method.new), and only an entry with
// both the same is the same credential. The released app's identifier is `tv.highsea.desktop`,
// the service it has always used, so its tokens stay where they are.
#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

pub trait Tokens: Send + Sync {
    fn get(&self, server: &str) -> Option<String>;
    fn set(&self, server: &str, token: &str) -> Result<(), String>;
    fn delete(&self, server: &str);
}

/// The OS's store, under the app's identifier as the service; each server's id is the account.
pub struct Keychain {
    service: String,
}

impl Keychain {
    pub fn new(identifier: &str) -> Self {
        Self {
            service: identifier.to_owned(),
        }
    }
}

impl Tokens for Keychain {
    fn get(&self, server: &str) -> Option<String> {
        keyring::Entry::new(&self.service, server)
            .and_then(|e| e.get_password())
            .ok()
    }

    fn set(&self, server: &str, token: &str) -> Result<(), String> {
        keyring::Entry::new(&self.service, server)
            .and_then(|e| e.set_password(token))
            .map_err(|e| e.to_string())
    }

    fn delete(&self, server: &str) {
        // nothing to delete is as good as deleted
        if let Ok(e) = keyring::Entry::new(&self.service, server) {
            let _ = e.delete_credential();
        }
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct Memory(Mutex<HashMap<String, String>>);

#[cfg(test)]
impl Tokens for Memory {
    fn get(&self, server: &str) -> Option<String> {
        self.0.lock().unwrap().get(server).cloned()
    }

    fn set(&self, server: &str, token: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(server.to_owned(), token.to_owned());
        Ok(())
    }

    fn delete(&self, server: &str) {
        self.0.lock().unwrap().remove(server);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_one_token_per_server() {
        let m = Memory::default();
        m.set("srv_a", "one").unwrap();
        m.set("srv_b", "two").unwrap();
        m.set("srv_a", "three").unwrap();
        assert_eq!(m.get("srv_a").as_deref(), Some("three"));
        assert_eq!(m.get("srv_b").as_deref(), Some("two"));
        m.delete("srv_a");
        assert_eq!(m.get("srv_a"), None);
        m.delete("srv_a");
    }

    /// A test build's tokens stay apart from the app's, which keeps the service it always had.
    /// Only names are compared: nothing here reads or writes the OS's store.
    #[test]
    fn the_service_is_the_apps_identifier() {
        let app: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let released = Keychain::new(app["identifier"].as_str().unwrap());
        assert_eq!(released.service, "tv.highsea.desktop");
        let test = Keychain::new("tv.highsea.desktop.test");
        assert_eq!(test.service, "tv.highsea.desktop.test");
        assert_ne!(test.service, released.service);
    }
}
