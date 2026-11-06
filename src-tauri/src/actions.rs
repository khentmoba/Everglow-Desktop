//! One path for menu actions, whether they come from the native menu or the in-page title bar.
use crate::{
    blocker::{Blocker, HOME},
    chrome, extension, set_fullscreen, updater,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::{menu::CheckMenuItem, Manager, WebviewWindow, Wry};

const PROTECTED: &str = "Everglow Desktop — protected";
const PAUSED: &str = "Everglow Desktop — adblock paused";

#[derive(Clone, Copy)]
pub enum Action {
    Home,
    Reload,
    Fullscreen,
    Adblock,
    Status,
    CheckUpdates,
    Settings,
}

impl Action {
    pub fn from_menu_id(id: &str) -> Option<Self> {
        Some(match id {
            "home" => Self::Home,
            "reload" => Self::Reload,
            "fullscreen" => Self::Fullscreen,
            "adblock" => Self::Adblock,
            "status" => Self::Status,
            "check_updates" => Self::CheckUpdates,
            "settings" => Self::Settings,
            _ => return None,
        })
    }
}

/// Both menus share these, so the checkmark, window title, and blocker state move together.
#[derive(Clone)]
pub struct Controls {
    pub blocker: Arc<Blocker>,
    pub adblock: CheckMenuItem<Wry>,
}

pub fn run(
    window: &WebviewWindow,
    controls: &Controls,
    action: Action,
    verify: bool,
) -> tauri::Result<()> {
    match action {
        Action::Home => window.navigate(HOME.parse().expect("home URL")),
        Action::Reload => window.reload(),
        Action::Fullscreen => window
            .is_fullscreen()
            .and_then(|value| set_fullscreen(window, !value)),
        Action::Adblock => {
            let enabled = !controls.blocker.enabled.load(Ordering::Relaxed);
            controls.blocker.enabled.store(enabled, Ordering::Relaxed);
            controls.adblock.set_checked(enabled)?;
            chrome::set_title(window, if enabled { PROTECTED } else { PAUSED })?;
            extension::set_enabled(window.clone(), enabled)
        }
        Action::Status => chrome::set_title(
            window,
            &format!(
                "Everglow Desktop — {} requests blocked · {} popups stopped",
                controls.blocker.blocked.load(Ordering::Relaxed),
                controls.blocker.popups.load(Ordering::Relaxed)
            ),
        ),
        Action::CheckUpdates => {
            if !verify {
                updater::check_for_updates(window.app_handle(), true);
            }
            Ok(())
        }
        Action::Settings => {
            window.eval("window.dispatchEvent(new Event('everglow-open-settings'))")
        }
    }
}
