//! Updates stay in the desktop menu; only an explicit action downloads or installs.
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Default, Serialize)]
pub struct Status {
    pub phase: &'static str,
    pub version: Option<String>,
    pub progress: Option<u64>,
    pub message: String,
    pub action: &'static str,
}

#[derive(Default)]
pub struct UpdateState {
    busy: Arc<AtomicBool>,
    status: Mutex<Status>,
    available: Mutex<Option<Update>>,
    // Only signature-verified bytes enter this slot. Closing the app discards them.
    ready: Mutex<Option<(Update, Vec<u8>)>>,
}

impl UpdateState {
    pub fn status(&self) -> Status {
        let mut status = self.status.lock().unwrap().clone();
        status.action = if self.ready.lock().unwrap().is_some() {
            "install"
        } else if self.available.lock().unwrap().is_some() {
            "download"
        } else {
            "check"
        };
        status
    }
}

struct BusyGuard(Arc<AtomicBool>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn publish<R: Runtime>(
    app: &AppHandle<R>,
    phase: &'static str,
    version: Option<String>,
    progress: Option<u64>,
    message: String,
) {
    *app.state::<UpdateState>().status.lock().unwrap() = Status {
        phase,
        version,
        progress,
        message,
        action: "check",
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = crate::chrome::sync_window(&window);
    }
}

pub fn check_for_updates<R: Runtime>(app: &AppHandle<R>, interactive: bool) {
    if interactive {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("window.dispatchEvent(new Event('everglow-open-update'))");
        }
    }
    run(app, "check");
}

pub fn run<R: Runtime>(app: &AppHandle<R>, action: &'static str) {
    let state = app.state::<UpdateState>();
    if state.busy.swap(true, Ordering::AcqRel) {
        return;
    }
    let guard = BusyGuard(state.busy.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let result = match action {
            "download" => download(&app).await,
            "install" => install(&app),
            _ => check(&app).await,
        };
        if let Err(error) = result {
            eprintln!("Desktop update: {error}");
            publish(&app, "error", None, None, "Could not complete the update. Your current app is unchanged. Try again when you’re ready.".into());
        }
    });
}

type UpdateResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

async fn check<R: Runtime>(app: &AppHandle<R>) -> UpdateResult {
    let state = app.state::<UpdateState>();
    if state.ready.lock().unwrap().is_some() || state.available.lock().unwrap().is_some() {
        return Ok(());
    }
    publish(
        app,
        "checking",
        None,
        None,
        "Checking for desktop updates…".into(),
    );
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()?
        .check()
        .await?;
    if let Some(update) = update {
        let version = update.version.clone();
        *state.available.lock().unwrap() = Some(update);
        publish(
            app,
            "available",
            Some(version.clone()),
            None,
            format!("Desktop {version} is available. Download when you’re ready."),
        );
    } else {
        publish(
            app,
            "current",
            None,
            None,
            "You’re on the latest desktop version.".into(),
        );
    }
    Ok(())
}

async fn download<R: Runtime>(app: &AppHandle<R>) -> UpdateResult {
    let state = app.state::<UpdateState>();
    let update = state.available.lock().unwrap().clone();
    let Some(mut update) = update else {
        return Ok(());
    };
    update.timeout = Some(Duration::from_secs(15 * 60));
    let version = update.version.clone();
    publish(
        app,
        "downloading",
        Some(version.clone()),
        None,
        "Downloading update… Keep watching; nothing will restart.".into(),
    );
    let mut downloaded = 0_u64;
    let mut last_percent = None;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let percent = total
                    .filter(|n| *n > 0)
                    .map(|n| (downloaded.saturating_mul(100) / n).min(100));
                if percent != last_percent || percent.is_none() {
                    last_percent = percent;
                    let progress = percent
                        .map_or_else(|| format!("{} KB", downloaded / 1024), |n| format!("{n}%"));
                    publish(
                        app,
                        "downloading",
                        Some(version.clone()),
                        percent,
                        format!("Downloading update: {progress}. Keep watching."),
                    );
                }
            },
            || {},
        )
        .await?;
    *state.ready.lock().unwrap() = Some((update, bytes));
    *state.available.lock().unwrap() = None;
    publish(
        app,
        "ready",
        Some(version.clone()),
        Some(100),
        format!("Desktop {version} is verified and ready. Restart when you’re ready."),
    );
    Ok(())
}

fn install<R: Runtime>(app: &AppHandle<R>) -> UpdateResult {
    let ready = app.state::<UpdateState>().ready.lock().unwrap().take();
    let Some((update, bytes)) = ready else {
        return Ok(());
    };
    publish(
        app,
        "installing",
        Some(update.version.clone()),
        None,
        "Installing the verified update…".into(),
    );
    if let Some(window) = app.get_webview_window("main") {
        crate::desktop::save_layout(&window);
    }
    if let Err(error) = update.install(&bytes) {
        *app.state::<UpdateState>().ready.lock().unwrap() = Some((update, bytes));
        return Err(error.into());
    }
    app.restart();
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
        assert!(!state.busy.swap(true, Ordering::AcqRel));
        let guard = BusyGuard(state.busy.clone());
        assert!(state.busy.swap(true, Ordering::AcqRel));
        drop(guard);
        assert!(!state.busy.load(Ordering::Acquire));
        assert!(state.ready.lock().unwrap().is_none());
    }
}
