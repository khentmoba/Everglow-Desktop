use crate::{
    actions::{self, Action, Controls},
    popups,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{ContextMenu, Submenu},
    Manager, WebviewWindow,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{HWND, POINT, RECT},
        Graphics::Gdi::ClientToScreen,
        UI::{
            HiDpi::GetDpiForWindow,
            WindowsAndMessaging::{
                GetAncestor, GetClientRect, GetCursorPos, IsIconic, IsWindow, WindowFromPoint,
                GA_ROOT,
            },
        },
    },
};

const NEAR_POLL: std::time::Duration = std::time::Duration::from_millis(80);
const FAR_POLL: std::time::Duration = std::time::Duration::from_millis(200);

struct Reading {
    at_edge: bool,
    over_window: bool,
}

/// Plain Win32 calls: Tauri's window getters each round-trip to the UI thread.
/// Returns None once the window is gone.
fn read_pointer(hwnd: HWND, was_at_edge: bool, suppressed: bool) -> Option<Reading> {
    let idle = Reading {
        at_edge: false,
        over_window: false,
    };
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return None;
        }
        if suppressed || IsIconic(hwnd).as_bool() {
            return Some(idle);
        }
        let mut cursor = POINT::default();
        if GetCursorPos(&mut cursor).is_err() {
            return Some(idle);
        }
        if GetAncestor(WindowFromPoint(cursor), GA_ROOT) != hwnd {
            return Some(idle);
        }
        let mut origin = POINT::default();
        let mut client = RECT::default();
        if !ClientToScreen(hwnd, &mut origin).as_bool() || GetClientRect(hwnd, &mut client).is_err()
        {
            return Some(Reading {
                at_edge: false,
                over_window: true,
            });
        }
        let scale = f64::from(GetDpiForWindow(hwnd)) / 96.0;
        let x = f64::from(cursor.x - origin.x);
        let y = f64::from(cursor.y - origin.y);
        let width = f64::from(client.right - client.left);
        let height = if was_at_edge { 44.0 } else { 8.0 } * scale;
        Some(Reading {
            at_edge: x >= 0.0 && x < width && y >= 0.0 && y < height,
            over_window: true,
        })
    }
}

pub fn script(verify: bool) -> String {
    include_str!("../../ui/chrome.js")
        .replace(
            "__VERIFY_ORIGIN__",
            &if verify {
                format!("http://127.0.0.1:{}", crate::blocker::verification_port())
            } else {
                String::new()
            },
        )
        .replace("__VERSION__", env!("CARGO_PKG_VERSION"))
}

pub(crate) fn trusted(source: &str, verify: bool) -> bool {
    let Ok(url) = url::Url::parse(source) else {
        return false;
    };
    matches!(
        url.origin().ascii_serialization().as_str(),
        "https://everglow-1c6db.web.app" | "https://everglow-1c6db.firebaseapp.com"
    ) || (verify
        && url.origin().ascii_serialization()
            == format!("http://127.0.0.1:{}", crate::blocker::verification_port()))
}

pub fn set_title<R: tauri::Runtime>(window: &WebviewWindow<R>, title: &str) -> tauri::Result<()> {
    window.set_title(title)?;
    sync_window(window)
}

pub fn sync_window<R: tauri::Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let fullscreen = window.is_fullscreen()?;
    let maximized = window.is_maximized()?;
    let title = window.title()?;
    let adblock = window
        .state::<Arc<crate::blocker::Blocker>>()
        .enabled
        .load(Ordering::Relaxed);
    let preferences = window.state::<crate::desktop::DesktopState>().preferences();
    let update = window.state::<crate::updater::UpdateState>().status();
    let state = serde_json::json!({
        "fullscreen": fullscreen,
        "maximized": maximized,
        "title": title,
        "adblock": adblock,
        "preferences": preferences,
        "update": update
    });
    window.eval(format!(
        "window.dispatchEvent(new CustomEvent('everglow-window-state', {{detail:{state}}}))"
    ))
}

pub fn watch_top_edge(window: &WebviewWindow) {
    let Ok(handle) = window.hwnd() else { return };
    let raw = handle.0 as isize;
    let window = window.clone();
    std::thread::spawn(move || {
        let mut was_at_edge = false;
        loop {
            let fullscreen = window
                .state::<crate::desktop::DesktopState>()
                .fullscreen
                .load(Ordering::Relaxed);
            let Some(reading) = read_pointer(HWND(raw as *mut _), was_at_edge, fullscreen) else {
                break;
            };
            if reading.at_edge != was_at_edge {
                let at_edge = reading.at_edge;
                if window.eval(format!("window.dispatchEvent(new CustomEvent('everglow-top-edge', {{detail:{at_edge}}}))")).is_err() { break; }
                was_at_edge = at_edge;
            }
            std::thread::sleep(if reading.over_window {
                NEAR_POLL
            } else {
                FAR_POLL
            });
        }
    });
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    window: WebviewWindow,
    menu: Submenu<tauri::Wry>,
    controls: Controls,
    verify: bool,
) -> windows::core::Result<()> {
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let mut token = 0;
        // Only main-document messages from the app origin reach window controls.
        core.add_WebMessageReceived(
            &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut source = PWSTR::null();
                args.Source(&mut source)?;
                let source = take_pwstr(source);
                if !trusted(&source, verify) {
                    return Ok(());
                }
                let mut message = PWSTR::null();
                if args.TryGetWebMessageAsString(&mut message).is_err() {
                    return Ok(());
                }
                let msg = take_pwstr(message);
                let result = match msg.as_str() {
                    "everglow-window:drag" => window.start_dragging(),
                    "everglow-window:state" => sync_window(&window),
                    "everglow-window:settings:titlebar" | "everglow-window:settings:layout" => {
                        if let Err(error) = window.state::<crate::desktop::DesktopState>().toggle(msg.ends_with(":titlebar")) {
                            log_error!("Save desktop settings: {error}");
                            let _ = window.eval("window.dispatchEvent(new CustomEvent('everglow-settings-error', {detail:'Could not save settings. Please try again.'}))");
                        }
                        sync_window(&window)
                    },
                    "everglow-window:settings:clear-cache" => crate::desktop::clear_cache(&window),
                    "everglow-window:minimize" => window.minimize(),
                    "everglow-window:maximize" => window.is_maximized().and_then(|maximized| {
                        if maximized {
                            window.unmaximize()
                        } else {
                            window.maximize()
                        }
                    }),
                    "everglow-window:close" | "everglow-window:menu:close" => window.close(),
                    "everglow-window:update:download" | "everglow-window:update:install" => {
                        if !verify {
                            crate::updater::run(window.app_handle(), if msg.ends_with(":install") { "install" } else { "download" });
                        }
                        Ok(())
                    },
                    "everglow-window:menu" => {
                        let result = menu.popup(window.as_ref().window());
                        let _ =
                            window.eval("window.dispatchEvent(new Event('everglow-menu-closed'))");
                        result
                    }
                    other if other.starts_with("everglow-window:external:") => {
                        popups::open_external(
                            &other["everglow-window:external:".len()..],
                            &source,
                            &controls.blocker,
                            verify,
                        );
                        Ok(())
                    }
                    other => match other.strip_prefix("everglow-window:menu:").and_then(Action::from_menu_id) {
                        Some(action) => actions::run(&window, &controls, action, verify),
                        None => return Ok(()),
                    },
                };
                if let Err(error) = result {
                    log_error!("Desktop top bar: {error}");
                }
                let _ = sync_window(&window);
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::trusted;

    #[test]
    fn window_controls_require_the_exact_app_origin() {
        assert!(trusted("https://everglow-1c6db.web.app/#/cinema", false));
        for source in [
            "https://everglow-1c6db.web.app.evil.test/",
            "https://everglow-1c6db.web.app@evil.test/",
            "http://everglow-1c6db.web.app/",
            "https://everglow-1c6db.web.app:444/",
            "http://127.0.0.1:18765/",
            "chrome-extension://example/",
            "not a URL",
        ] {
            assert!(!trusted(source, false), "{source}");
        }
    }
}
