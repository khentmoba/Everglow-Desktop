//! One main-document message, no Tauri permissions for remote content.
use tauri::{Manager, WebviewWindow};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::core::PWSTR;

pub const SCRIPT: &str = r#"
if (window === window.top && location.origin === 'https://everglow-1c6db.web.app') {
  Object.defineProperty(window, '__everglowDesktopVersion', { value: '__VERSION__' });
  Object.defineProperty(window, '__everglowCheckForUpdates', {
    value: () => window.chrome.webview.postMessage('everglow-desktop-check-updates')
  });
}
"#;

fn accepts(source: &str, message: &str) -> bool {
    let Ok(url) = url::Url::parse(source) else {
        return false;
    };
    url.origin().ascii_serialization() == "https://everglow-1c6db.web.app"
        && message == "everglow-desktop-check-updates"
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    window: WebviewWindow,
    verify: bool,
) -> windows::core::Result<()> {
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let mut token = 0;
        // WebView2's main-document event does not subscribe to frame messages.
        core.add_WebMessageReceived(
            &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut source = PWSTR::null();
                args.Source(&mut source)?;
                let source = take_pwstr(source);
                let mut message = PWSTR::null();
                if args.TryGetWebMessageAsString(&mut message).is_ok()
                    && accepts(&source, &take_pwstr(message))
                    && !verify
                {
                    crate::updater::check_for_updates(window.app_handle(), true);
                }
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::accepts;

    #[test]
    fn only_exact_production_origin_and_fixed_action() {
        assert!(accepts(
            "https://everglow-1c6db.web.app/?agent=1",
            "everglow-desktop-check-updates"
        ));
        for source in [
            "https://everglow-1c6db.web.app.evil.test/",
            "https://everglow-1c6db.web.app@evil.test/",
            "http://everglow-1c6db.web.app/",
            "https://everglow-1c6db.web.app:444/",
            "http://127.0.0.1:18765/",
            "chrome-extension://example/desktop-ready.html",
            "not a URL",
        ] {
            assert!(
                !accepts(source, "everglow-desktop-check-updates"),
                "{source}"
            );
        }
        assert!(!accepts(
            "https://everglow-1c6db.web.app/",
            "https://evil.test/setup.exe"
        ));
    }
}
