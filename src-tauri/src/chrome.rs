use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{CheckMenuItem, ContextMenu, Submenu},
    Manager, WebviewWindow,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::core::PWSTR;
use windows::Win32::{
    Foundation::POINT,
    UI::WindowsAndMessaging::{GetAncestor, WindowFromPoint, GA_ROOT},
};

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

fn trusted(source: &str, verify: bool) -> bool {
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
    let adblock = !title.contains("adblock paused");
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
    let window = window.clone();
    std::thread::spawn(move || {
        let mut was_at_edge = false;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let state = (|| -> tauri::Result<bool> {
                if window.is_minimized()? || window.is_fullscreen()? {
                    return Ok(false);
                }
                let origin = window.inner_position()?;
                let cursor = window.cursor_position()?;
                let width = window.inner_size()?.width;
                let x = cursor.x - f64::from(origin.x);
                let y = cursor.y - f64::from(origin.y);
                let height = if was_at_edge { 44.0 } else { 8.0 } * window.scale_factor()?;
                let under_pointer = unsafe {
                    GetAncestor(
                        WindowFromPoint(POINT {
                            x: cursor.x as i32,
                            y: cursor.y as i32,
                        }),
                        GA_ROOT,
                    )
                };
                Ok(under_pointer == window.hwnd()?
                    && x >= 0.0
                    && x < f64::from(width)
                    && y >= 0.0
                    && y < height)
            })();
            let at_edge = match state {
                Ok(at_edge) => at_edge,
                Err(error) => {
                    eprintln!("Watch desktop top edge: {error}");
                    break;
                }
            };
            if at_edge != was_at_edge {
                if window.eval(format!("window.dispatchEvent(new CustomEvent('everglow-top-edge', {{detail:{at_edge}}}))")).is_err() { break; }
                was_at_edge = at_edge;
            }
        }
    });
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    window: WebviewWindow,
    menu: Submenu<tauri::Wry>,
    blocker: Arc<crate::blocker::Blocker>,
    adblock: CheckMenuItem<tauri::Wry>,
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
                if !trusted(&take_pwstr(source), verify) {
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
                            eprintln!("Save desktop settings: {error}");
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
                    "everglow-window:menu:home" => window.navigate(crate::blocker::HOME.parse().expect("home URL")),
                    "everglow-window:menu:reload" => window.reload(),
                    "everglow-window:menu:fullscreen" => window.is_fullscreen().and_then(|value| crate::set_fullscreen(&window, !value)),
                    "everglow-window:menu:adblock" => {
                        let current = blocker.enabled.load(Ordering::Relaxed);
                        let enabled = !current;
                        blocker.enabled.store(enabled, Ordering::Relaxed);
                        let _ = adblock.set_checked(enabled);
                        let title = if enabled { "Everglow Desktop — protected" } else { "Everglow Desktop — adblock paused" };
                        set_title(&window, title).and_then(|_| crate::extension::set_enabled(window.clone(), enabled))
                    },
                    "everglow-window:menu:status" => {
                        set_title(&window, &format!("Everglow Desktop — {} requests blocked · {} popups stopped",
                            blocker.blocked.load(Ordering::Relaxed), blocker.popups.load(Ordering::Relaxed)))
                    },
                    "everglow-window:menu:check_updates" => {
                        if !verify { crate::updater::check_for_updates(window.app_handle(), true); }
                        Ok(())
                    },
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
                    _ => return Ok(()),
                };
                if let Err(error) = result {
                    eprintln!("Desktop top bar: {error}");
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
