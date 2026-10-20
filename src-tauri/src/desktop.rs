use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, WebviewWindow};
use webview2_com::{ClearBrowsingDataCompletedHandler, Microsoft::Web::WebView2::Win32::*};
use windows::{
    core::Interface,
    Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, SetWindowPlacement, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, WINDOWPLACEMENT,
    },
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub always_show_titlebar: bool,
    pub remember_layout: bool,
    pub layout: Option<Layout>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            always_show_titlebar: false,
            remember_layout: true,
            layout: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Layout {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

pub struct DesktopState {
    path: PathBuf,
    preferences: Mutex<Preferences>,
    pub cache_busy: std::sync::atomic::AtomicBool,
}

impl DesktopState {
    pub fn load(path: PathBuf) -> Self {
        let preferences = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            preferences: Mutex::new(preferences),
            cache_busy: false.into(),
        }
    }

    pub fn preferences(&self) -> Preferences {
        self.preferences.lock().unwrap().clone()
    }

    fn write(&self, preferences: &Preferences) -> Result<(), Box<dyn std::error::Error>> {
        let temporary = self.path.with_extension("tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(preferences)?)?;
        std::fs::rename(temporary, &self.path)?;
        Ok(())
    }

    pub fn toggle(&self, titlebar: bool) -> Result<(), Box<dyn std::error::Error>> {
        let mut preferences = self.preferences.lock().unwrap();
        let mut next = preferences.clone();
        if titlebar {
            next.always_show_titlebar = !next.always_show_titlebar;
        } else {
            next.remember_layout = !next.remember_layout;
        }
        self.write(&next)?;
        *preferences = next;
        Ok(())
    }
}

impl Layout {
    fn fit(&self, areas: &[(i32, i32, u32, u32)]) -> Option<Self> {
        let &(left, top, area_width, area_height) = areas
            .iter()
            .find(|&&(x, y, w, h)| {
                i64::from(self.left) < i64::from(x) + i64::from(w)
                    && i64::from(self.left) + i64::from(self.width) > i64::from(x)
                    && i64::from(self.top) < i64::from(y) + i64::from(h)
                    && i64::from(self.top) + i64::from(self.height) > i64::from(y)
            })
            .or_else(|| areas.first())?;
        let width = self.width.max(420).min(area_width);
        let height = self.height.max(600).min(area_height);
        Some(Self {
            left: self
                .left
                .clamp(left, left.saturating_add((area_width - width) as i32)),
            top: self
                .top
                .clamp(top, top.saturating_add((area_height - height) as i32)),
            width,
            height,
            maximized: self.maximized,
        })
    }
}

pub fn save_layout<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let state = window.state::<DesktopState>();
    let mut preferences = state.preferences.lock().unwrap();
    if !preferences.remember_layout || window.is_fullscreen().unwrap_or(true) {
        return;
    }
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut placement = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        unsafe {
            GetWindowPlacement(window.hwnd()?, &mut placement)?;
        }
        let rect = placement.rcNormalPosition;
        preferences.layout = Some(Layout {
            left: rect.left,
            top: rect.top,
            width: (rect.right - rect.left).max(420) as u32,
            height: (rect.bottom - rect.top).max(600) as u32,
            maximized: placement.showCmd == SW_SHOWMAXIMIZED.0 as u32 || placement.flags.0 & 2 != 0,
        });
        state.write(&preferences)
    })();
    if let Err(error) = result {
        eprintln!("Save window layout: {error}");
    }
}

pub fn restore_layout(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let preferences = window.state::<DesktopState>().preferences();
    if !preferences.remember_layout {
        return Ok(());
    }
    let mut monitors = window.available_monitors()?;
    if let Some(primary) = window.primary_monitor()? {
        monitors.sort_by_key(|m| m.position() != primary.position());
    }
    let areas: Vec<_> = monitors
        .iter()
        .map(|m| {
            let area = m.work_area();
            (
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
            )
        })
        .collect();
    let Some(layout) = preferences.layout.and_then(|layout| layout.fit(&areas)) else {
        return Ok(());
    };
    let mut placement = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    unsafe {
        GetWindowPlacement(window.hwnd()?, &mut placement)?;
        placement.rcNormalPosition.left = layout.left;
        placement.rcNormalPosition.top = layout.top;
        placement.rcNormalPosition.right = layout.left.saturating_add(layout.width as i32);
        placement.rcNormalPosition.bottom = layout.top.saturating_add(layout.height as i32);
        placement.showCmd = if layout.maximized {
            SW_SHOWMAXIMIZED.0
        } else {
            SW_SHOWNORMAL.0
        } as u32;
        SetWindowPlacement(window.hwnd()?, &placement)?;
    }
    Ok(())
}

fn cache_status(window: &WebviewWindow, message: &str) {
    let _ = window.eval(format!(
        "window.dispatchEvent(new CustomEvent('everglow-cache-status', {{detail:{}}}))",
        serde_json::json!(message)
    ));
}

pub fn clear_cache(window: &WebviewWindow) -> tauri::Result<()> {
    use std::sync::atomic::Ordering;
    if window
        .state::<DesktopState>()
        .cache_busy
        .swap(true, Ordering::AcqRel)
    {
        return Ok(());
    }
    cache_status(window, "Clearing cached files…");
    let callback_window = window.clone();
    let result = window.with_webview(move |view| unsafe {
        let result = (|| -> windows::core::Result<()> {
            let profile = view
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_13>()?
                .Profile()?
                .cast::<ICoreWebView2Profile2>()?;
            let completed_window = callback_window.clone();
            profile.ClearBrowsingData(
                COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE,
                &ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
                    completed_window
                        .state::<DesktopState>()
                        .cache_busy
                        .store(false, Ordering::Release);
                    cache_status(
                        &completed_window,
                        if result.is_ok() {
                            "Cached files cleared. You’re still signed in."
                        } else {
                            "Could not clear cached files. Please try again."
                        },
                    );
                    Ok(())
                })),
            )
        })();
        if let Err(error) = result {
            eprintln!("Clear cache: {error}");
            callback_window
                .state::<DesktopState>()
                .cache_busy
                .store(false, Ordering::Release);
            cache_status(
                &callback_window,
                "Could not clear cached files. Please try again.",
            );
        }
    });
    if result.is_err() {
        window
            .state::<DesktopState>()
            .cache_busy
            .store(false, Ordering::Release);
        cache_status(window, "Could not clear cached files. Please try again.");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn layout_fits_disconnected_smaller_and_negative_monitors() {
        let layout = Layout {
            left: 4000,
            top: -2000,
            width: 2500,
            height: 1800,
            maximized: true,
        };
        assert_eq!(
            layout.fit(&[(0, 0, 1920, 1040)]),
            Some(Layout {
                left: 0,
                top: 0,
                width: 1920,
                height: 1040,
                maximized: true
            })
        );
        let layout = Layout {
            left: -1800,
            top: 40,
            width: 900,
            height: 700,
            maximized: false,
        };
        assert!(layout.fit(&[]).is_none());
        assert_eq!(
            layout.fit(&[(0, 0, 1920, 1040), (-1920, 0, 1920, 1040)]),
            Some(layout)
        );
    }
    #[test]
    fn preferences_keep_defaults_for_missing_fields_and_reject_invalid_json() {
        let preferences: Preferences = serde_json::from_str("{}").unwrap();
        assert!(preferences.remember_layout);
        assert!(!preferences.always_show_titlebar);
        assert!(serde_json::from_str::<Preferences>("{\"rememberLayout\":\"yes\"}").is_err());
    }
}
