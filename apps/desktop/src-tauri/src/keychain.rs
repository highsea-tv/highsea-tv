// SPDX-License-Identifier: AGPL-3.0-only
// Device tokens, one per server, in the OS's own store (ADR 0058): Keychain on macOS, Credential
// Manager on Windows, the Secret Service on Linux, through keyring's `v1` mode
// (https://docs.rs/keyring/4.2.0/keyring/). The page never sees a token: the Rust side adds it to
// each request. Behind a trait, so tests use the memory store.
#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

/// The keychain's service name; each server's id is the account.
const SERVICE: &str = "tv.highsea.desktop";

pub trait Tokens: Send + Sync {
    fn get(&self, server: &str) -> Option<String>;
    fn set(&self, server: &str, token: &str) -> Result<(), String>;
    fn delete(&self, server: &str);
}

pub struct Keychain;

impl Tokens for Keychain {
    fn get(&self, server: &str) -> Option<String> {
        keyring::Entry::new(SERVICE, server)
            .and_then(|e| e.get_password())
            .ok()
    }

    fn set(&self, server: &str, token: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, server)
            .and_then(|e| e.set_password(token))
            .map_err(|e| e.to_string())
    }

    fn delete(&self, server: &str) {
        // nothing to delete is as good as deleted
        if let Ok(e) = keyring::Entry::new(SERVICE, server) {
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
}
