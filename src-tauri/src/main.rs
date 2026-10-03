#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod blocker;
mod extension;
use blocker::{allow_navigation, Blocker, HOME};
use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use webview2_com::{
    take_pwstr, ContainsFullScreenElementChangedEventHandler, Microsoft::Web::WebView2::Win32::*,
    WebResourceRequestedEventHandler,
};
use windows::core::{w, Interface, BOOL, PWSTR};

fn request_kind(context: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> &'static str {
    match context {
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => "subdocument",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => "script",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => "stylesheet",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => "image",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => "media",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => "font",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST
        | COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH => "xmlhttprequest",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => "websocket",
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING => "ping",
        _ => "other",
    }
}

fn install_blocking(
    view: &tauri::webview::PlatformWebview,
    blocker: Arc<Blocker>,
    window: tauri::WebviewWindow,
) -> windows::core::Result<()> {
    // WebView2 interfaces are accessed only on Tauri's UI thread.
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let environment = view.environment();
        // Include child frames, service workers and shared workers, not only the top page.
        core.cast::<ICoreWebView2_22>()?
            .AddWebResourceRequestedFilterWithRequestSourceKinds(
                w!("*"),
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )?;
        let mut token = 0;
        core.add_WebResourceRequested(
            &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let request = args.Request()?;
                let mut uri = PWSTR::null();
                request.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                let mut referer = PWSTR::null();
                let headers = request.Headers()?;
                let source = if headers.GetHeader(w!("Referer"), &mut referer).is_ok() {
                    let source = take_pwstr(referer);
                    if source.is_empty() {
                        HOME.to_owned()
                    } else {
                        source
                    }
                } else {
                    HOME.to_owned()
                };
                let mut context = COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
                args.ResourceContext(&mut context)?;
                if blocker.blocks(&uri, &source, request_kind(context)) {
                    let response = environment.CreateWebResourceResponse(
                        None,
                        204,
                        w!("Blocked by Everglow Desktop"),
                        w!("Access-Control-Allow-Origin: *\r\n"),
                    )?;
                    args.SetResponse(&response)?;
                }
                Ok(())
            })),
            &mut token,
        )?;
        let fullscreen_window = window.clone();
        core.add_ContainsFullScreenElementChanged(
            &ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
                if let Some(sender) = sender {
                    let mut fullscreen = BOOL::default();
                    sender.ContainsFullScreenElement(&mut fullscreen)?;
                    if let Err(err) = fullscreen_window.set_fullscreen(fullscreen.as_bool()) {
                        eprintln!("Fullscreen: {err}");
                    }
                }
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

fn main() {
    // Verification uses fake local pages and a separate profile; normal runs expose no debug port.
    let verify_live = std::env::args().any(|arg| arg == "--verify-live");
    let verify = verify_live || std::env::args().any(|arg| arg == "--verify");
    tauri::Builder::default().setup(move |app| {
        let data = app.path().app_local_data_dir()?;
        std::fs::create_dir_all(&data)?;
        let cache = data.join("adblock-lists.txt");
        let blocker = Blocker::new(&cache, verify);
        let adblock = CheckMenuItem::with_id(app, "adblock", "Block ads and trackers", true, true, Some("Ctrl+Shift+B"))?;
        let home = MenuItem::with_id(app, "home", "Home", true, Some("Alt+Home"))?;
        let reload = MenuItem::with_id(app, "reload", "Refresh Everglow", true, Some("Ctrl+R"))?;
        let fullscreen = MenuItem::with_id(app, "fullscreen", "Fullscreen", true, Some("F11"))?;
        let status = MenuItem::with_id(app, "status", "Protection status", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let quit = PredefinedMenuItem::quit(app, Some("Close Everglow"))?;
        let submenu = Submenu::with_items(app, "Everglow", true, &[&home, &reload, &fullscreen, &separator, &adblock, &status, &quit])?;
        let menu = Menu::with_items(app, &[&submenu])?;
        let popup_blocker = Arc::clone(&blocker);
        let extension_path = if cfg!(debug_assertions) {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor/ubol")
        } else { app.path().resource_dir()?.join("ubol") };
        let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse()?))
            .title("Everglow Desktop — protected")
            .inner_size(1280.0, 850.0).min_inner_size(420.0, 600.0)
            .menu(menu).visible(false).browser_extensions_enabled(true)
            .data_directory(data.join(if verify { format!("verification-profile-{}", std::process::id()) } else { "profile".to_owned() }))
            .on_navigation(move |url| allow_navigation(url, verify))
            .on_new_window(move |_, _| {
                popup_blocker.popups.fetch_add(1, Ordering::Relaxed);
                tauri::webview::NewWindowResponse::Deny
            });
        if verify { builder = builder.additional_browser_args("--remote-debugging-port=18766 --remote-debugging-address=127.0.0.1 --host-resolver-rules=\"MAP filemoon.test 127.0.0.1\""); }
        let window = builder.build()?;
        let menu_blocker = Arc::clone(&blocker);
        window.on_menu_event(move |native_window, event| {
            let Some(window) = native_window.app_handle().get_webview_window("main") else { return; };
            let result = match event.id().as_ref() {
                "home" => window.navigate(HOME.parse().expect("home URL")),
                "reload" => window.reload(),
                "fullscreen" => window.is_fullscreen().and_then(|value| window.set_fullscreen(!value)),
                "adblock" => {
                    let enabled = adblock.is_checked().unwrap_or(true);
                    menu_blocker.enabled.store(enabled, Ordering::Relaxed);
                    let title = if enabled { "Everglow Desktop — protected" } else { "Everglow Desktop — adblock paused" };
                    window.set_title(title).and_then(|_| extension::set_enabled(window.clone(), enabled))
                },
                "status" => window.set_title(&format!("Everglow Desktop — {} requests blocked · {} popups stopped",
                    menu_blocker.blocked.load(Ordering::Relaxed), menu_blocker.popups.load(Ordering::Relaxed))),
                _ => Ok(()),
            };
            if let Err(err) = result { eprintln!("Desktop menu: {err}"); }
        });
        let updater = Arc::clone(&blocker);
        let start_window = window.clone();
        let app_handle = app.handle().clone();
        window.with_webview(move |view| {
            let result = install_blocking(&view, blocker, start_window.clone());
            // Never load remote content before native protection is installed.
            if let Err(err) = result {
                eprintln!("Unable to enable WebView2 adblock: {err}. Update Microsoft Edge WebView2 Runtime.");
                app_handle.exit(1);
                return;
            }
            let target = if verify && !verify_live { "http://127.0.0.1:18765/" } else { HOME };
            if let Err(err) = extension::install(&view, extension_path, start_window, target) {
                eprintln!("Install extension: {err}"); app_handle.exit(1);
            }
        })?;
        if !verify { updater.refresh(cache); }
        Ok(())
    }).run(tauri::generate_context!()).expect("Everglow Desktop could not start");
}
