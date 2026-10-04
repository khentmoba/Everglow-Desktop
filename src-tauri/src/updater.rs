//! Native auto-updates for Everglow Desktop.
//!
//! The app checks the GitHub release feed on startup and offers to download
//! and install new versions, so nobody has to pass installers around by hand.
//! Installs are signature-verified against the public key in
//! `tauri.conf.json` before they run.

use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// Seconds to wait after startup before checking, so the app is visible first.
const STARTUP_DELAY_SECS: u64 = 10;

fn tell<R: Runtime>(app: &AppHandle<R>, message: &str) {
    app.dialog()
        .message(message)
        .title("Everglow Desktop update")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::Ok)
        .blocking_show();
}

/// Check for updates. When `interactive` the user always hears back
/// (menu clicks); the silent startup check only speaks when an update exists.
pub fn check_for_updates<R: Runtime>(app: &AppHandle<R>, interactive: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let update = match app.updater() {
            Ok(updater) => match updater.check().await {
                Ok(found) => found,
                Err(err) => {
                    eprintln!("Update check failed: {err}");
                    if interactive {
                        tell(&app, "Could not check for updates. Please try again later.");
                    }
                    return;
                }
            },
            Err(err) => {
                eprintln!("Updater unavailable: {err}");
                if interactive {
                    tell(&app, "Updates are not available in this build.");
                }
                return;
            }
        };
        let Some(update) = update else {
            if interactive {
                tell(&app, "You're on the latest version.");
            }
            return;
        };
        let notes = update.body.as_deref().unwrap_or("Bug fixes and improvements.");
        let install = app
            .dialog()
            .message(format!(
                "Everglow Desktop {} is available.\n\n{notes}\n\nDownload and install it now?",
                update.version
            ))
            .title("Everglow Desktop update")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Install now".to_owned(),
                "Later".to_owned(),
            ))
            .blocking_show();
        if !install {
            return;
        }
        if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
            eprintln!("Update install failed: {err}");
            tell(
                &app,
                "The update could not be installed. Please try again later.",
            );
            return;
        }
        // On Windows `install` already exits into the NSIS installer, which
        // relaunches the app when done. This is the fallback for other paths.
        app.restart();
    });
}

/// Silent startup check. Verification runs use fake pages and isolated
/// profiles, so they never phone home.
pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>, verify: bool) {
    if verify {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(STARTUP_DELAY_SECS));
        check_for_updates(&app, false);
    });
}
