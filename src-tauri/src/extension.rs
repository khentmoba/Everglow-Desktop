use std::sync::OnceLock;
use tauri::{Manager, WebviewWindow};
static EXTENSION_ID: OnceLock<String> = OnceLock::new();
use webview2_com::{
    take_pwstr, BrowserExtensionEnableCompletedHandler, Microsoft::Web::WebView2::Win32::*,
    ProfileAddBrowserExtensionCompletedHandler, ProfileGetBrowserExtensionsCompletedHandler,
    WebMessageReceivedEventHandler,
};
use windows::core::{Interface, HSTRING, PWSTR};

fn wait_for_protection(
    core: ICoreWebView2,
    extension: ICoreWebView2BrowserExtension,
    window: WebviewWindow,
    target: String,
) -> windows::core::Result<()> {
    unsafe {
        let mut id = PWSTR::null();
        extension.Id(&mut id)?;
        let ready_url = format!("chrome-extension://{}/desktop-ready.html", take_pwstr(id));
        let expected_source = ready_url.clone();
        let ready_core = core.clone();
        let mut token = 0;
        // Each startup installs one handler, removed after its single-use ready message.
        let handler_token = std::rc::Rc::new(std::cell::Cell::new(0));
        let remove_token = handler_token.clone();
        core.add_WebMessageReceived(
            &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut source = PWSTR::null();
                args.Source(&mut source)?;
                // No general-purpose IPC: only our local extension's exact ready page is accepted.
                if take_pwstr(source) != expected_source {
                    return Ok(());
                }
                let mut message = PWSTR::null();
                if args.TryGetWebMessageAsString(&mut message).is_ok()
                    && take_pwstr(message) == "everglow-desktop-protection-ready"
                {
                    ready_core.remove_WebMessageReceived(remove_token.get())?;
                    ready_core.Navigate(&HSTRING::from(&target))?;
                    if let Err(err) = window.show() {
                        eprintln!("Show Everglow: {err}");
                    }
                }
                Ok(())
            })),
            &mut token,
        )?;
        handler_token.set(token);
        core.Navigate(&HSTRING::from(ready_url))?;
    }
    Ok(())
}

pub fn install(
    view: &tauri::webview::PlatformWebview,
    path: std::path::PathBuf,
    window: WebviewWindow,
    target: &'static str,
) -> windows::core::Result<()> {
    unsafe {
        let core = view.controller().CoreWebView2()?;
        let profile = core
            .cast::<ICoreWebView2_13>()?
            .Profile()?
            .cast::<ICoreWebView2Profile7>()?;
        profile.AddBrowserExtension(
            &HSTRING::from(path.as_path()),
            &ProfileAddBrowserExtensionCompletedHandler::create(Box::new(
                move |result, extension| {
                    if result.is_err() || extension.is_none() {
                        eprintln!("Unable to load cosmetic/scriptlet blocker: {result:?}");
                        window.app_handle().exit(1);
                        return Ok(());
                    }
                    let extension = extension.expect("checked extension");
                    let mut id = PWSTR::null();
                    extension.Id(&mut id)?;
                    let _ = EXTENSION_ID.set(take_pwstr(id));
                    let ready_extension = extension.clone();
                    let core = core.clone();
                    let window = window.clone();
                    // Pausing protection is session-only: restore BOTH layers on next launch.
                    extension.Enable(
                        true,
                        &BrowserExtensionEnableCompletedHandler::create(Box::new(move |result| {
                            result?;
                            wait_for_protection(
                                core.clone(),
                                ready_extension.clone(),
                                window.clone(),
                                target.to_owned(),
                            )
                        })),
                    )?;
                    Ok(())
                },
            )),
        )?;
    }
    Ok(())
}

pub fn set_enabled(window: WebviewWindow, enabled: bool) -> tauri::Result<()> {
    let reload_window = window.clone();
    window.with_webview(move |view| unsafe {
        let result = (|| -> windows::core::Result<()> {
            let core = view.controller().CoreWebView2()?;
            let profile = core
                .cast::<ICoreWebView2_13>()?
                .Profile()?
                .cast::<ICoreWebView2Profile7>()?;
            profile.GetBrowserExtensions(&ProfileGetBrowserExtensionsCompletedHandler::create(
                Box::new(move |result, list| {
                    result?;
                    if let Some(list) = list {
                        let mut count = 0;
                        list.Count(&mut count)?;
                        for index in 0..count {
                            let extension = list.GetValueAtIndex(index)?;
                            let mut id = PWSTR::null();
                            extension.Id(&mut id)?;
                            if EXTENSION_ID.get() != Some(&take_pwstr(id)) {
                                continue;
                            }
                            let window = reload_window.clone();
                            extension.Enable(
                                enabled,
                                &BrowserExtensionEnableCompletedHandler::create(Box::new(
                                    move |result| {
                                        result?;
                                        if let Err(err) = window.reload() {
                                            eprintln!("Reload after adblock toggle: {err}");
                                        }
                                        Ok(())
                                    },
                                )),
                            )?;
                        }
                    }
                    Ok(())
                }),
            ))?;
            Ok(())
        })();
        if let Err(err) = result {
            eprintln!("Toggle extension blocker: {err}");
        }
    })
}
