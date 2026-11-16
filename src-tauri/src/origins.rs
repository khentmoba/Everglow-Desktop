//! The single source of truth for the app origins trusted by native handlers and page scripts.
//! Host checks and origin checks are both exposed because navigation/subresource filters need a
//! hostname while WebView2 message sources need the full serialized origin (scheme and port).
use url::Url;

pub const PRIMARY: &str = "https://everglow-1c6db.web.app";
pub const ALTERNATE: &str = "https://everglow-1c6db.firebaseapp.com";
pub const HOME: &str = "https://everglow-1c6db.web.app/";

pub const ORIGINS: [&str; 2] = [PRIMARY, ALTERNATE];
pub const HOSTS: [&str; 2] = ["everglow-1c6db.web.app", "everglow-1c6db.firebaseapp.com"];

/// Backend hosts needed for sign-in and data access. Requests to these are never ad-blocked;
/// keep this list in sync with the services the live site actually calls.
pub const ESSENTIAL_HOSTS: [&str; 4] = [
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "securetoken.googleapis.com",
    "us-central1-everglow-1c6db.cloudfunctions.net",
];

pub fn allows_host(url: &Url) -> bool {
    url.host_str().is_some_and(|host| HOSTS.contains(&host))
}

pub fn allows_origin(url: &Url) -> bool {
    ORIGINS.contains(&url.origin().ascii_serialization().as_str())
}

pub fn is_essential_host(url: &Url) -> bool {
    allows_host(url)
        || url
            .host_str()
            .is_some_and(|host| ESSENTIAL_HOSTS.contains(&host))
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

    #[test]
    fn essential_hosts_cover_the_backend_without_lookalikes() {
        for host in ESSENTIAL_HOSTS {
            assert!(is_essential_host(
                &Url::parse(&format!("https://{host}/")).unwrap()
            ));
        }
        for url in [
            "https://firestore.googleapis.com.evil.test/",
            "https://us-central1-everglow-1c6db.cloudfunctions.net.evil.test/",
            "https://evil.test/",
        ] {
            assert!(!is_essential_host(&Url::parse(url).unwrap()), "{url}");
        }
    }
}
