//! New windows are always denied. A real click on a link to another site is handed off by the page
//! script (ui/chrome.js) and opened here in the default browser. WebView2's IsUserInitiated cannot tell
//! a script popup inside a click's activation window from a click, so it is not used.
use crate::blocker::Blocker;
use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::{atomic::Ordering, Arc},
};
use url::Url;
use webview2_com::NewWindowRequestedEventHandler;
use windows::{
    core::{w, HSTRING, PCWSTR},
    Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
};

fn web_url(uri: &str) -> Option<Url> {
    let url = Url::parse(uri).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    blocker: Arc<Blocker>,
) -> windows::core::Result<()> {
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let mut token = 0;
        core.add_NewWindowRequested(
            &NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    let _ = args.SetHandled(true);
                    blocker.popups.fetch_add(1, Ordering::Relaxed);
                }
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

/// `source` is the trusted Everglow page that sent the click.
pub fn open_external(uri: &str, source: &str, blocker: &Blocker, verify: bool) {
    let Some(url) = web_url(uri) else { return };
    if blocker.blocks(url.as_str(), source, "popup") {
        return;
    }
    if verify {
        // Verification records the handoff instead of launching a browser.
        if let Some(dir) = std::env::var_os("EVERGLOW_VERIFY_DATA_DIR") {
            let _ = OpenOptions::new()
                .create(true)
                .append(true)
                .open(PathBuf::from(dir).join("external-links.txt"))
                .and_then(|mut file| writeln!(file, "{url}"));
        }
        return;
    }
    let file = HSTRING::from(url.as_str());
    let launched = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            &file,
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if launched.0 as isize <= 32 {
        log_error!(
            "Open external link: ShellExecute returned {}",
            launched.0 as isize
        );
    }
}

#[cfg(test)]
mod tests {
    use super::web_url;

    #[test]
    fn only_web_links_leave_the_app() {
        assert!(web_url("https://example.com/a?b=c").is_some());
        assert!(web_url("http://example.com/").is_some());
        for uri in [
            "file:///C:/Windows/win.ini",
            "javascript:alert(1)",
            "mailto:someone@example.com",
            "ms-settings:",
            "not a url",
        ] {
            assert!(web_url(uri).is_none(), "{uri}");
        }
    }
}
