#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod blocker;
mod chrome;
mod desktop;
mod extension;
mod startup;
mod updater;
mod website_bridge;
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
pub(crate) const VERIFY_BROWSER_ARGS: &str = "--remote-debugging-port=18766 --remote-debugging-address=127.0.0.1 --host-resolver-rules=\"MAP filemoon.test 127.0.0.1\"";

pub(crate) fn set_fullscreen(window: &tauri::WebviewWindow, fullscreen: bool) -> tauri::Result<()> {
    if fullscreen {
        desktop::save_layout(window);
    }
    window.set_fullscreen(fullscreen)?;
    chrome::sync_window(window)
}

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
                    if let Err(err) = set_fullscreen(&fullscreen_window, fullscreen.as_bool()) {
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
    let mut context = tauri::generate_context!();
    if verify {
        use std::hash::{Hash, Hasher};
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        std::env::var("EVERGLOW_VERIFY_DATA_DIR")
            .unwrap_or_else(|_| std::process::id().to_string())
            .hash(&mut hash);
        context.config_mut().identifier =
            format!("com.everglow.desktop.verify-{:x}", hash.finish());
    }
    tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
        let label = if app.try_state::<startup::StartupState>().is_some_and(|state| state.is_ready()) { "main" } else { "startup" };
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(updater::UpdateState::default())
    .setup(move |app| {
        let data = app.path().app_local_data_dir()?;
        std::fs::create_dir_all(&data)?;
        let settings_dir = if verify { std::env::var_os("EVERGLOW_VERIFY_DATA_DIR").map(std::path::PathBuf::from).unwrap_or_else(|| data.clone()) } else { data.clone() };
        std::fs::create_dir_all(&settings_dir)?;
        app.manage(desktop::DesktopState::load(settings_dir.join("desktop-settings.json")));
        let target = if verify && !verify_live { format!("http://127.0.0.1:{}/", blocker::verification_port()) } else { HOME.to_owned() };
        app.manage(startup::StartupState::new(target));
        let profile = data.join(if verify { format!("verification-profile-{}", std::process::id()) } else { "profile".to_owned() });
        startup::create(app.handle(), &profile, verify)?;
        let cache = data.join("adblock-lists.txt");
        let blocker = Blocker::new(&cache, verify);
        let adblock = CheckMenuItem::with_id(app, "adblock", "Block ads and trackers", true, true, Some("Ctrl+Shift+B"))?;
        let home = MenuItem::with_id(app, "home", "Home", true, Some("Alt+Home"))?;
        let reload = MenuItem::with_id(app, "reload", "Refresh Everglow", true, Some("Ctrl+R"))?;
        let fullscreen = MenuItem::with_id(app, "fullscreen", "Fullscreen", true, Some("F11"))?;
        let status = MenuItem::with_id(app, "status", "Protection status", true, None::<&str>)?;
        let check_updates = MenuItem::with_id(app, "check_updates", "Check for Updates…", true, None::<&str>)?;
        let settings = MenuItem::with_id(app, "settings", "Desktop settings…", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let separator2 = PredefinedMenuItem::separator(app)?;
        let quit = PredefinedMenuItem::quit(app, Some("Close Everglow"))?;
        let submenu = Submenu::with_items(app, "Everglow", true, &[&home, &reload, &fullscreen, &separator, &adblock, &status, &check_updates, &settings, &separator2, &quit])?;
        let menu = Menu::with_items(app, &[&submenu])?;
        let popup_blocker = Arc::clone(&blocker);
        let extension_path = if cfg!(debug_assertions) {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor/ubol")
        } else { app.path().resource_dir()?.join("ubol") };
        let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External("about:blank".parse()?))
            .title("Everglow Desktop — protected")
            .inner_size(1280.0, 850.0).min_inner_size(420.0, 600.0)
            .menu(menu).decorations(false).visible(false).browser_extensions_enabled(true)
            .initialization_script(website_bridge::SCRIPT.replace("__VERSION__", env!("CARGO_PKG_VERSION")))
            .initialization_script(chrome::script(verify))
            .on_page_load(|window, _| { let _ = chrome::sync_window(&window); })
            .data_directory(profile)
            .on_navigation(move |url| allow_navigation(url, verify))
            .on_new_window(move |_, _| {
                popup_blocker.popups.fetch_add(1, Ordering::Relaxed);
                tauri::webview::NewWindowResponse::Deny
            });
        if verify { builder = builder.additional_browser_args(VERIFY_BROWSER_ARGS); }
        let window = match builder.build() {
            Ok(window) => window,
            Err(error) => {
                eprintln!("Create Everglow window: {error}");
                startup::fail(app.handle(), "Could not create the Everglow window. Update Microsoft Edge WebView2 Runtime, then retry.");
                return Ok(());
            }
        };
        window.hide_menu()?;
        chrome::watch_top_edge(&window);
        let resized_window = window.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                desktop::save_layout(&resized_window);
                resized_window.app_handle().exit(0);
            }
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                let _ = chrome::sync_window(&resized_window);
            }
        });
        let menu_blocker = Arc::clone(&blocker);
        let menu_adblock = adblock.clone();
        window.on_menu_event(move |native_window, event| {
            let Some(window) = native_window.app_handle().get_webview_window("main") else { return; };
            let result = match event.id().as_ref() {
                "home" => window.navigate(HOME.parse().expect("home URL")),
                "reload" => window.reload(),
                "fullscreen" => window.is_fullscreen().and_then(|value| set_fullscreen(&window, !value)),
                "adblock" => {
                    let enabled = menu_adblock.is_checked().unwrap_or(true);
                    menu_blocker.enabled.store(enabled, Ordering::Relaxed);
                    let title = if enabled { "Everglow Desktop — protected" } else { "Everglow Desktop — adblock paused" };
                    chrome::set_title(&window, title).and_then(|_| extension::set_enabled(window.clone(), enabled))
                },
                "status" => chrome::set_title(&window, &format!("Everglow Desktop — {} requests blocked · {} popups stopped",
                    menu_blocker.blocked.load(Ordering::Relaxed), menu_blocker.popups.load(Ordering::Relaxed))),
                "check_updates" => {
                    if !verify { updater::check_for_updates(native_window.app_handle(), true); }
                    Ok(())
                },
                "settings" => window.eval("window.dispatchEvent(new Event('everglow-open-settings'))"),
                _ => Ok(()),
            };
            if let Err(err) = result { eprintln!("Desktop menu: {err}"); }
        });
        let lists = Arc::clone(&blocker);
        let start_window = window.clone();
        let app_handle = app.handle().clone();
        let install_blocker = Arc::clone(&blocker);
        let install_adblock = adblock.clone();
        window.with_webview(move |view| {
            if let Err(err) = chrome::install(&view, start_window.clone(), submenu, install_blocker, install_adblock, verify) {
                eprintln!("Unable to install desktop top bar: {err}");
                startup::fail(&app_handle, "Could not prepare the desktop controls. Please retry.");
                return;
            }
            if let Err(err) = website_bridge::install(&view, start_window.clone(), verify) {
                eprintln!("Unable to install desktop update bridge: {err}");
                startup::fail(&app_handle, "Could not prepare desktop updates. Please retry.");
                return;
            }
            let result = install_blocking(&view, blocker, start_window.clone());
            // Never load remote content before native protection is installed.
            if let Err(err) = result {
                eprintln!("Unable to enable WebView2 adblock: {err}. Update Microsoft Edge WebView2 Runtime.");
                startup::fail(&app_handle, "Could not enable protection. Update Microsoft Edge WebView2 Runtime, then retry.");
                return;
            }
            if let Err(err) = startup::install(&view, start_window.clone(), verify) {
                eprintln!("Startup recovery: {err}");
                startup::fail(&app_handle, "Could not prepare startup recovery. Please retry.");
                return;
            }
            if let Err(err) = extension::install(&view, extension_path, start_window) {
                eprintln!("Install extension: {err}");
                startup::fail(&app_handle, "Could not load protection. Please retry.");
            }
        })?;
        if !verify { lists.refresh(cache); }
        updater::check_on_startup(app.handle(), verify);
        Ok(())
    }).build(context).expect("Everglow Desktop could not start").run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            if let Some(window) = app.get_webview_window("main") { desktop::save_layout(&window); }
        }
    });
}
