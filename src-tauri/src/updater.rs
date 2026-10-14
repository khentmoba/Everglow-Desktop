//! Native, signature-verified updates. Download first; restart only by choice.
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: Arc<AtomicBool>,
    // Session-only: a restart discards the staged download and checks again.
    ready: Mutex<Option<(Update, Vec<u8>)>>,
}

struct BusyGuard(Arc<AtomicBool>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn tell<R: Runtime>(app: &AppHandle<R>, message: &str) {
    app.dialog()
        .message(message)
        .title("Everglow Desktop update")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::Ok)
        .blocking_show();
}

fn ask<R: Runtime>(app: &AppHandle<R>, message: String, accept: &str) -> bool {
    app.dialog()
        .message(message)
        .title("Everglow Desktop update")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            accept.to_owned(),
            "Later".to_owned(),
        ))
        .blocking_show()
}

pub fn check_for_updates<R: Runtime>(app: &AppHandle<R>, interactive: bool) {
    let state = app.state::<UpdateState>();
    if state
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    let guard = BusyGuard(state.busy.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let window = app.get_webview_window("main");
        let original_title = window.as_ref().and_then(|w| w.title().ok());
        if let Err(err) = prepare_update(&app, interactive).await {
            eprintln!("Desktop update failed: {err}");
            if interactive {
                tell(&app, "Could not prepare the update. Your current app is unchanged. Please try again.");
            }
        }
        let state = app.state::<UpdateState>();
        let ready = state.ready.lock().unwrap().take();
        if let Some((update, bytes)) = ready {
            if ask(&app, format!("Everglow Desktop {} is downloaded and verified. Restart to install it?\n\nChoose Later to keep watching. Use Check for Updates when you are ready.", update.version), "Restart to update") {
                if let Err(err) = update.install(&bytes) {
                    eprintln!("Update install failed: {err}");
                    tell(&app, "Could not install the update. Your download is still ready; please try again.");
                    *state.ready.lock().unwrap() = Some((update, bytes));
                } else {
                    // Windows exits into NSIS; other paths need an explicit relaunch.
                    app.restart();
                }
            } else {
                *state.ready.lock().unwrap() = Some((update, bytes));
            }
        }
        if let Some(window) = window {
            let title = if state.ready.lock().unwrap().is_some() {
                "Everglow Desktop - update ready".to_owned()
            } else {
                original_title.unwrap_or_else(|| "Everglow Desktop - protected".to_owned())
            };
            if let Err(err) = window.set_title(&title) {
                eprintln!("Update title: {err}");
            }
        }
    });
}

async fn prepare_update<R: Runtime>(
    app: &AppHandle<R>,
    interactive: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if app.state::<UpdateState>().ready.lock().unwrap().is_some() {
        return Ok(());
    }
    let Some(update) = app
        .updater_builder()
        .timeout(Duration::from_secs(15 * 60))
        .build()?
        .check()
        .await?
    else {
        if interactive {
            tell(app, "You're on the latest desktop version.");
        }
        return Ok(());
    };
    let notes = update
        .body
        .as_deref()
        .unwrap_or("Bug fixes and improvements.");
    if !ask(app, format!("Everglow Desktop {} is available.\n\n{notes}\n\nDownload it now? You can choose when to restart.", update.version), "Download update") {
        return Ok(());
    }
    let mut downloaded = 0_u64;
    let mut last_percent = None;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let percent = total
                    .filter(|n| *n > 0)
                    .map(|n| (downloaded.saturating_mul(100) / n).min(100));
                if percent != last_percent || last_percent.is_none() {
                    last_percent = percent;
                    if let Some(window) = app.get_webview_window("main") {
                        let progress = percent.map_or_else(
                            || format!("{} KB", downloaded / 1024),
                            |n| format!("{n}%"),
                        );
                        if let Err(err) = window
                            .set_title(&format!("Everglow Desktop - downloading update {progress}"))
                        {
                            eprintln!("Download progress: {err}");
                        }
                    }
                }
            },
            || {},
        )
        .await?;
    // download() verifies the Tauri signature before returning these bytes.
    *app.state::<UpdateState>().ready.lock().unwrap() = Some((update, bytes));
    Ok(())
}

pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>, verify: bool) {
    if verify {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(10));
        check_for_updates(&app, false);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_one_update_flow_runs_and_errors_release_the_lock() {
        let state = UpdateState::default();
        assert!(state
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok());
        let guard = BusyGuard(state.busy.clone());
        assert!(state
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err());
        drop(guard);
        assert!(!state.busy.load(Ordering::Acquire));
    }
}
