//! The single source of truth for the app origins trusted by native handlers and page scripts.
//! Host checks and origin checks are both exposed because navigation/subresource filters need a
//! hostname while WebView2 message sources need the full serialized origin (scheme and port).
use url::Url;

pub const PRIMARY: &str = "https://everglow-1c6db.web.app";
pub const ALTERNATE: &str = "https://everglow-1c6db.firebaseapp.com";
pub const HOME: &str = "https://everglow-1c6db.web.app/";

pub const ORIGINS: [&str; 2] = [PRIMARY, ALTERNATE];
pub const HOSTS: [&str; 2] = ["everglow-1c6db.web.app", "everglow-1c6db.firebaseapp.com"];

pub fn allows_host(url: &Url) -> bool {
    url.host_str().is_some_and(|host| HOSTS.contains(&host))
}

pub fn allows_origin(url: &Url) -> bool {
    ORIGINS.contains(&url.origin().ascii_serialization().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_hosts_and_origins_only() {
        let home = Url::parse(HOME).unwrap();
        assert!(allows_host(&home));
        assert!(allows_origin(&home));
        assert!(allows_origin(&Url::parse(ALTERNATE).unwrap()));

        assert!(!allows_host(
            &Url::parse("https://everglow-1c6db.web.app.evil.test/").unwrap()
        ));
        assert!(!allows_origin(
            &Url::parse("https://everglow-1c6db.web.app:444/").unwrap()
        ));
        assert!(!allows_origin(
            &Url::parse("http://everglow-1c6db.web.app/").unwrap()
        ));
    }
}
