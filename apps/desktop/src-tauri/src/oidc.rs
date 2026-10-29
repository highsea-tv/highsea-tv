// SPDX-License-Identifier: AGPL-3.0-only
// Signing in with the server's single sign-on from the app (ADR 0024's 4.4 section), as RFC 8252
// has native apps do it: in the system browser, never a webview the app controls (§ 8.12), coming
// back through the app's own scheme, `highsea://oidc` (§ 7.1). The server hands back a one-time
// code, which only this app can exchange for a device token: it sent the code's PKCE challenge
// when it started, and proves it with the verifier (RFC 7636, as § 8.1 asks).
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

pub const START: &str = "/api/v1/auth/oidc/start";
pub const EXCHANGE: &str = "/api/v1/auth/oidc/exchange";

/// A PKCE verifier (32 random bytes, RFC 7636 § 4.1) and its S256 challenge (§ 4.2).
pub fn pkce() -> (String, String) {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS's random numbers");
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    (verifier.clone(), challenge(&verifier))
}

pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// What came back through `highsea://oidc`: a code to exchange, or the reason it failed.
#[derive(Debug, PartialEq)]
pub enum Back {
    Code(String),
    Error(String),
}

pub fn read_back(url: &str) -> Option<Back> {
    let url = reqwest::Url::parse(url).ok()?;
    if url.scheme() != "highsea" || url.host_str() != Some("oidc") {
        return None;
    }
    let get = |k: &str| {
        url.query_pairs()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.into_owned())
    };
    match (get("code"), get("error")) {
        (Some(code), _) if !code.is_empty() => Some(Back::Code(code)),
        (_, Some(e)) => Some(Back::Error(e)),
        _ => Some(Back::Error("invalid".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_rfc_7636s_challenge() {
        // RFC 7636 appendix B's example
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let (v, c) = pkce();
        assert_eq!(v.len(), 43);
        assert_eq!(challenge(&v), c);
    }

    #[test]
    fn reads_what_comes_back() {
        assert_eq!(
            read_back("highsea://oidc?code=abc"),
            Some(Back::Code("abc".into()))
        );
        assert_eq!(
            read_back("highsea://oidc?error=denied"),
            Some(Back::Error("denied".into()))
        );
        assert_eq!(read_back("highsea://connect?server=x"), None);
        assert_eq!(read_back("https://oidc?code=abc"), None);
    }
}
