# Changelog

Each release needs a `## [X.Y.Z]` section with user-facing `- ` bullets before its tag is pushed.
The release workflow publishes this section as the GitHub release notes and the Discord "What's New" field.
Write plain-English changes, not commit subjects.

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
