# Changelog

Each release needs a `## [X.Y.Z]` section with user-facing `- ` bullets before its tag is pushed.
The release workflow publishes this section as the GitHub release notes and the Discord "What's New" field.
Write plain-English changes, not commit subjects.

## [Unreleased]

## [0.6.1] - 2026-11-17

- Fullscreen transitions no longer flicker or resize the window through intermediate sizes.
- Startup timers and update checks now shut down with the app instead of running in detached threads.
- Backend hosts required for sign-in are defined in one place and covered by tests.
- CI runs the full native WebView2 verification suite on every pull request.
- Generated test screenshots no longer overwrite the tracked evidence files.

## [0.6.0] - 2026-11-07

- **Desktop updates:** Added an in-app update banner and download dialog that matches Everglow styling.
- **External links:** Clicking web links now opens them in your default browser.
- **Fullscreen playback:** Fullscreening from a maximized window now fills the entire display without taskbar borders.
- **Diagnostics:** Startup errors now write to desktop.log and show technical details on the recovery screen.
- Reduced background CPU usage when the mouse cursor is outside the window.

## [0.5.0] - 2026-10-21

- Fixed dragging the desktop window from the title bar.
- Added settings to pin the title bar and remember window size and position.
- Added a cache-clearing option that preserves sign-in data.
- Added a startup recovery screen with a Retry button when the site cannot load.
- Opening the app again now focuses the existing window.
- Desktop updates now use menu controls for downloading and restarting, without interrupting playback with dialogs.

## [0.4.1] - 2026-10-20

- Fixed release publication so GitHub release notes are set correctly.
- Release announcements in Discord now show the changelog and a richer release card.

## [0.4.0] - 2026-10-20

- Added a smooth, auto-hiding title bar that appears when the pointer moves to the top edge.

## [0.3.2] - 2026-10-19

- The native menu now stays hidden while a video is fullscreen.

## [0.3.1] - 2026-10-14

- Newer installers update an existing Windows installation in place without downgrading or deleting saved sign-in data.

## [0.3.0] - 2026-10-14

- Website update buttons now hand off to the native updater, and restarts wait until you choose them.

## [0.2.0] - 2026-10-05

- Added signed native auto-updates through GitHub releases.
