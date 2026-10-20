use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use webview2_com::{
    take_pwstr, Microsoft::Web::WebView2::Win32::*, NavigationCompletedEventHandler,
    WebMessageReceivedEventHandler,
};
use windows::core::{Interface, BOOL, PWSTR};

#[derive(Clone, Serialize)]
struct Status {
    phase: &'static str,
    message: String,
}

pub struct StartupState {
    status: Mutex<Status>,
    protected: AtomicBool,
    opened: AtomicBool,
    generation: AtomicU64,
    target: String,
}

impl StartupState {
    pub fn new(target: String) -> Self {
        Self {
            status: Mutex::new(Status {
                phase: "loading",
                message: "Preparing your protected window…".into(),
            }),
            protected: false.into(),
            opened: false.into(),
            generation: AtomicU64::new(0),
            target,
        }
    }

    pub fn is_ready(&self) -> bool {
        self.status.lock().unwrap().phase == "ready"
    }
}

fn sync(app: &AppHandle) {
    let state = app.state::<StartupState>();
    let status = state.status.lock().unwrap().clone();
    if let Some(window) = app.get_webview_window("startup") {
        let _ = window.eval(format!(
            "window.dispatchEvent(new CustomEvent('everglow-startup-state', {{detail:{}}}))",
            serde_json::json!(status)
        ));
    }
}

pub fn fail(app: &AppHandle, message: &str) {
    *app.state::<StartupState>().status.lock().unwrap() = Status {
        phase: "error",
        message: message.into(),
    };
    sync(app);
    if let Some(window) = app.get_webview_window("startup") {
        let _ = window.show();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn connect(window: &WebviewWindow) -> tauri::Result<()> {
    let state = window.state::<StartupState>();
    state.protected.store(true, Ordering::Release);
    *state.status.lock().unwrap() = Status {
        phase: "loading",
        message: "Connecting to Everglow…".into(),
    };
    sync(window.app_handle());
    window.navigate(state.target.parse().expect("fixed Everglow URL"))?;
    watch_timeout(window.app_handle());
    Ok(())
}

fn retry(app: &AppHandle) {
    let state = app.state::<StartupState>();
    if state.protected.load(Ordering::Acquire) {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(error) = connect(&window) {
                eprintln!("Retry Everglow: {error}");
                fail(
                    app,
                    "Could not reconnect to Everglow. Check your connection and try again.",
                );
            }
        }
    } else {
        app.restart();
    }
}

fn watch_timeout(app: &AppHandle) {
    let generation = app
        .state::<StartupState>()
        .generation
        .fetch_add(1, Ordering::AcqRel)
        + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let state = app.state::<StartupState>();
        if state.generation.load(Ordering::Acquire) == generation
            && state.status.lock().unwrap().phase == "loading"
        {
            fail(&app, "Everglow is taking longer than expected. Check your internet connection, then try again.");
        }
    });
}

pub fn create(app: &AppHandle, profile: &std::path::Path, verify: bool) -> tauri::Result<()> {
    let page = if verify {
        format!("index.html?verifyPid={}", std::process::id())
    } else {
        "index.html".into()
    };
    let mut builder = WebviewWindowBuilder::new(app, "startup", WebviewUrl::App(page.into()))
        .title("Everglow Desktop")
        .inner_size(520.0, 360.0)
        .min_inner_size(420.0, 320.0)
        .data_directory(profile.to_path_buf())
        .browser_extensions_enabled(true)
        .resizable(false)
        .center()
        .background_color(tauri::webview::Color(16, 16, 17, 255))
        .on_navigation(|url| {
            matches!(
                url.origin().ascii_serialization().as_str(),
                "http://tauri.localhost" | "tauri://localhost"
            )
        })
        .on_page_load(|window, _| sync(window.app_handle()));
    if verify {
        builder = builder.additional_browser_args(crate::VERIFY_BROWSER_ARGS);
    }
    let window = builder.build()?;
    let app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            app.exit(0);
        }
    });
    let handle = window.app_handle().clone();
    window.with_webview(move |view| unsafe {
        let result = (|| -> windows::core::Result<()> {
            let mut token = 0;
            view.controller().CoreWebView2()?.add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut source = PWSTR::null();
                    args.Source(&mut source)?;
                    if !local_source(&take_pwstr(source)) {
                        return Ok(());
                    }
                    let mut message = PWSTR::null();
                    if args.TryGetWebMessageAsString(&mut message).is_err() {
                        return Ok(());
                    }
                    match take_pwstr(message).as_str() {
                        "everglow-startup:retry" => retry(&handle),
                        "everglow-startup:close" => handle.exit(0),
                        "everglow-startup:state" => sync(&handle),
                        _ => {}
                    }
                    Ok(())
                })),
                &mut token,
            )
        })();
        if let Err(error) = result {
            eprintln!("Startup controls: {error}");
        }
    })?;
    watch_timeout(window.app_handle());
    Ok(())
}

fn local_source(source: &str) -> bool {
    url::Url::parse(source).is_ok_and(|url| {
        matches!(
            url.origin().ascii_serialization().as_str(),
            "http://tauri.localhost" | "tauri://localhost"
        )
    })
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    window: WebviewWindow,
    verify: bool,
) -> windows::core::Result<()> {
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let source_core = core.clone();
        let mut token = 0;
        core.add_NavigationCompleted(&NavigationCompletedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()); };
            let mut source = PWSTR::null(); source_core.Source(&mut source)?;
            let Ok(url) = url::Url::parse(&take_pwstr(source)) else { return Ok(()); };
            if !matches!(url.scheme(), "http" | "https") || !crate::blocker::allow_navigation(&url, verify) { return Ok(()); }
            let mut success = BOOL::default(); args.IsSuccess(&mut success)?;
            let mut status = 0;
            args.cast::<ICoreWebView2NavigationCompletedEventArgs2>()?.HttpStatusCode(&mut status)?;
            if !success.as_bool() || status >= 400 {
                let mut error = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
                args.WebErrorStatus(&mut error)?;
                if error != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                    fail(window.app_handle(), "Could not load Everglow. Check your internet connection, then try again.");
                }
                return Ok(());
            }
            let state = window.state::<StartupState>();
            *state.status.lock().unwrap() = Status { phase: "ready", message: String::new() };
            state.generation.fetch_add(1, Ordering::AcqRel);
            if !state.opened.swap(true, Ordering::AcqRel) {
                if let Err(error) = crate::desktop::restore_layout(&window) { eprintln!("Restore layout: {error}"); }
            }
            let _ = window.show();
            if let Some(startup) = window.app_handle().get_webview_window("startup") { let _ = startup.hide(); }
            Ok(())
        })), &mut token)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::local_source;
    #[test]
    fn recovery_controls_only_accept_the_bundled_page() {
        assert!(local_source("http://tauri.localhost/index.html"));
        for source in [
            crate::blocker::HOME,
            "http://tauri.localhost.evil.test/",
            "http://127.0.0.1:18765/",
            "about:blank",
        ] {
            assert!(!local_source(source));
        }
    }
}
