use adblock::{lists::ParseOptions, request::Request, Engine};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, RwLock,
    },
    time::Duration,
};
use url::Url;

pub use crate::origins::HOME;

fn env_port(name: &str, default: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(default)
}

pub fn verification_port() -> u16 {
    env_port("EVERGLOW_VERIFY_PORT", 18765)
}

pub fn verification_debug_port() -> u16 {
    env_port("EVERGLOW_VERIFY_DEBUG_PORT", 18766)
}

pub fn verify_browser_args() -> String {
    format!(
        "--remote-debugging-port={} --remote-debugging-address=127.0.0.1 --host-resolver-rules=\"MAP filemoon.test 127.0.0.1\"",
        verification_debug_port()
    )
}
const EASYLIST: &str = include_str!("../lists/easylist.txt");
const EASYPRIVACY: &str = include_str!("../lists/easyprivacy.txt");
const LIST_URLS: [&str; 2] = [
    "https://easylist.to/easylist/easylist.txt",
    "https://easylist.to/easylist/easyprivacy.txt",
];

pub struct Blocker {
    engine: RwLock<Engine>,
    pub enabled: AtomicBool,
    pub blocked: AtomicUsize,
    pub popups: AtomicUsize,
}

fn engine(text: &str) -> Engine {
    Engine::from_rules(text.lines(), ParseOptions::default())
}

fn valid_list(text: &str) -> bool {
    text.starts_with("[Adblock Plus") && text.lines().count() > 1000 && text.len() < 8_000_000
}

impl Blocker {
    pub fn new(cache: &Path, verify: bool) -> Arc<Self> {
        let mut text = format!("{EASYLIST}\n{EASYPRIVACY}");
        if let Ok(cached) = std::fs::read_to_string(cache) {
            if valid_list(&cached) {
                text = cached;
            }
        }
        if verify {
            text.push_str("\n/desktop-ad-probe\n");
        }
        Arc::new(Self {
            engine: RwLock::new(engine(&text)),
            enabled: AtomicBool::new(true),
            blocked: AtomicUsize::new(0),
            popups: AtomicUsize::new(0),
        })
    }

    pub fn blocks(&self, uri: &str, source: &str, kind: &str) -> bool {
        if !self.enabled.load(Ordering::Relaxed) {
            return false;
        }
        let Ok(url) = Url::parse(uri) else {
            return false;
        };
        if !matches!(url.scheme(), "http" | "https") || crate::origins::is_essential_host(&url) {
            return false;
        }
        let Ok(request) = Request::new(uri, source, kind) else {
            return false;
        };
        let blocked = self
            .engine
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .check_network_request(&request)
            .matched;
        if blocked {
            self.blocked.fetch_add(1, Ordering::Relaxed);
        }
        blocked
    }

    pub fn refresh(self: &Arc<Self>, cache: PathBuf) {
        let blocker = Arc::clone(self);
        std::thread::spawn(move || {
            let result = (|| -> Result<(), Box<dyn std::error::Error>> {
                let agent: ureq::Agent = ureq::Agent::config_builder()
                    .timeout_global(Some(Duration::from_secs(20)))
                    .build()
                    .into();
                let mut lists = Vec::new();
                for uri in LIST_URLS {
                    let text = agent
                        .get(uri)
                        .call()?
                        .body_mut()
                        .with_config()
                        .limit(8_000_000)
                        .read_to_string()?;
                    if !valid_list(&text) {
                        return Err("invalid adblock list; keeping previous rules".into());
                    }
                    lists.push(text);
                }
                let text = lists.join("\n");
                let updated = engine(&text);
                // Build outside the lock so list downloads/parsing never stall the player.
                *blocker
                    .engine
                    .write()
                    .unwrap_or_else(|error| error.into_inner()) = updated;
                write_cache(&cache, &text)?;
                Ok(())
            })();
            if let Err(err) = result {
                log_error!("Adblock refresh: {err}");
            }
        });
    }
}

/// Replace the cached rules atomically: a crash mid-write must never leave a truncated list
/// that would silently disable the freshly downloaded rules on the next launch.
fn write_cache(cache: &Path, text: &str) -> std::io::Result<()> {
    if let Some(parent) = cache.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = cache.with_extension("txt.tmp");
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, cache)
}

pub fn allow_navigation(url: &Url, verify: bool) -> bool {
    url.as_str() == "about:blank"
        || url.scheme() == "chrome-extension"
        || (url.scheme() == "https" && crate::origins::allows_host(url))
        || (verify
            && url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(verification_port()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_lists_block_ads_but_keep_everglow_and_login() {
        let b = Blocker::new(&PathBuf::from("missing-test-cache"), false);
        assert!(b.blocks("https://ad.doubleclick.net/ad.js", HOME, "script"));
        assert!(!b.blocks(HOME, HOME, "document"));
        assert!(!b.blocks(
            "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel",
            HOME,
            "xmlhttprequest"
        ));
        assert!(!b.blocks(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken",
            HOME,
            "xmlhttprequest"
        ));
        assert!(!b.blocks(
            "https://securetoken.googleapis.com/v1/token",
            HOME,
            "xmlhttprequest"
        ));
        assert!(!b.blocks("https://player.videasy.net/movie/123", HOME, "subdocument"));
        b.enabled.store(false, Ordering::Relaxed);
        assert!(!b.blocks("https://ad.doubleclick.net/ad.js", HOME, "script"));
    }
    #[test]
    fn navigation_is_exact_origin_not_lookalike() {
        for uri in [
            HOME,
            "https://everglow-1c6db.web.app/#/cinema",
            "about:blank",
        ] {
            assert!(allow_navigation(&Url::parse(uri).unwrap(), false));
        }
        for uri in [
            "https://everglow-1c6db.web.app.evil.invalid/",
            "http://everglow-1c6db.web.app/",
            "file:///C:/",
            "https://evil.invalid/",
            "http://127.0.0.1:18765/",
        ] {
            assert!(!allow_navigation(&Url::parse(uri).unwrap(), false));
        }
    }
    #[test]
    fn rejects_error_pages_as_rule_updates() {
        assert!(!valid_list("<html>blocked</html>"));
        assert!(valid_list(EASYLIST));
        assert!(valid_list(EASYPRIVACY));
    }

    #[test]
    fn cache_replacement_is_atomic() {
        let dir = std::env::temp_dir().join(format!("everglow-cache-test-{}", std::process::id()));
        let cache = dir.join("adblock-lists.txt");
        write_cache(&cache, "first").unwrap();
        write_cache(&cache, "second").unwrap();
        assert_eq!(std::fs::read_to_string(&cache).unwrap(), "second");
        assert!(!cache.with_extension("txt.tmp").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
