# Everglow Desktop

Windows Tauri 2 app loading https://everglow-1c6db.web.app/ in its own window.

## Use
Open **Everglow Desktop** on the desktop or Start menu. Sign in normally; this app has its own persistent browser profile and does not borrow browser cookies.

Menu: **Everglow â†’ Block ads and trackers** pauses/resumes both blocking layers (and reloads the page). Popups and external top-level redirects remain denied even when ad blocking is paused. **F11** toggles fullscreen; **Refresh Everglow** reloads the site.

## Blocking
- Brave's open-source `adblock-rust` matcher with bundled EasyList and EasyPrivacy.
- The native lists refresh over HTTPS on every normal launch; failed downloads retain the last usable rules.
- uBlock Origin Lite **Complete** mode adds generic/site-specific cosmetic filtering, procedural filtering, scriptlets and resource replacements.
- Native interception covers document/iframe/service-worker/shared-worker request sources.
- Only our bundled extension is enabled/disabled by the menu, not WebView2's built-in PDF extension.
- The app waits for the extension's initial filter/script registration before opening Everglow.
- Remote pages receive no Tauri capabilities. A main-document WebView2 bridge accepts only a fixed update-check message from the exact production Everglow origin. It accepts no installer URLs or other native commands. Navigation remains limited to Everglow and installed extension pages; the extension startup handshake is unchanged.

**This is strong layered ad blocking, not an identical implementation of Brave Shields.** WebView2 is not Brave. Browser-level fingerprint protection, CNAME uncloaking, all Brave-specific heuristics and every streaming site's anti-adblock behavior are not guaranteed.

## Updates
Everglow loads from the live website, not a frozen Flutter bundle. Its existing update banner still works: restart/refresh when it offers a newer build; movies are not forcefully interrupted.

The desktop app itself updates natively since 0.2.0. Version 0.3.0 connects the website entrance and Dashboard to that same updater. It checks about 10 seconds after launch, or on demand through **Everglow > Check for Updates** and the website's **Check for desktop updates** button.

The user approves the download first. Progress appears in the window title. After signature verification, **Restart to update** installs it; **Later** keeps the verified download in memory for this session, without interrupting playback. Check for Updates offers the prepared update again. Closing the app discards that staged download; next launch checks afresh. Duplicate requests cannot start simultaneous downloads. An unsuccessful download never runs an installer.

Desktop and website versions are separate. The desktop bridge reports the native package version, not the live website version. Only the top-level production page gets the bridge; player frames, local verification pages and third-party origins cannot use it. Verification mode never checks the real update feed.

Releases build and sign in GitHub Actions on a `v*` tag. Keep `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json` and their lockfiles in sync; `node --test scripts/release-contract.test.mjs` checks this. Push the reviewed release tag after merging. The workflow prepares a draft, adds `Everglow-Desktop-Setup.exe`, verifies required assets, then publishes. Updater packages keep their versioned filenames and signatures.

After publishing, the release workflow posts the version, release notes link and version-specific Windows installer link to Discord. Set the repository Actions secret `DISCORD_WEBHOOK_URL` to the channel's webhook URL; never commit it. Notifications disable mentions. If delivery fails, the workflow fails but the published release stays available. This runs in the tag-release workflow (including releases published with `GITHUB_TOKEN`), not on manual GitHub releases. To retry only the notification, rerun its script with the same release repository/tag and webhook environment variables; rerunning the entire workflow republishes and may send a duplicate.

Stable website download: https://github.com/khentmoba/Everglow-Desktop/releases/latest/download/Everglow-Desktop-Setup.exe

### Installer updates (0.3.1)

Opening a newer Windows installer detects the existing installation and shows one **Update** button. It replaces the app files in the registered location without launching the old uninstaller or asking for the folder again. Sign-in data and existing shortcuts stay in place. The same version offers **Repair**; an older installer refuses to downgrade. In-app updates retain the existing passive progress flow and signature verification. Uninstall remains available through Windows Settings.

The custom NSIS template is based on `tauri-bundler 2.10.1`, shipped with the pinned Tauri CLI `2.12.1`. Changes are marked `EVERGLOW`. When upgrading the CLI, compare its bundled template with `src-tauri/windows/installer.nsi`; keep upstream fixes and re-run the installer checks. Tauri's MIT license is included beside the template.

Test the installer without touching the real installation:

```powershell
npm run build -- --config scripts/installer-test.json
./scripts/test-installer.ps1 -Installer 'src-tauri/target/release/bundle/nsis/Everglow Installer Test_0.3.1_x64-setup.exe'
```

This uses a separate product name, installation folder and fake data. It checks fresh install, passive upgrade without a usable old uninstaller, same-version repair, preserved data/shortcuts/location, and silent downgrade refusal. It never launches the installed app or reads a real session. Desktop PR CI builds and runs this fixture too.

**Rollout order:** merge and release desktop 0.3.0 first; verify that the stable installer and `latest.json` are anonymously accessible; then merge the website buttons. Existing 0.2.0 users get 0.3.0 through the native menu/startup updater. Version 0.1.0 has no updater and needs one manual installation. The updater signature is separate from Windows Authenticode; this project does not claim a Windows-code-signed installer. Preserve the existing signing key in the repository secret; never rotate it as part of this feature.

## Source/build
Source is independent of the Everglow website at `C:\APPLICATIONS\Everglow-Desktop`; no live website files were changed.

Prerequisites: Node.js, Rust MSVC toolchain, Visual Studio C++ build tools, current Microsoft Edge WebView2 Runtime.

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
npm ci
cd src-tauri
cargo test
cargo clippy -- -D warnings
cargo build
cd ..
npm test
npm run build
```

Installer: `src-tauri/target/release/bundle/nsis/*-setup.exe`; releases also include the stable download filename above.

The installer is a local unsigned build, not a public Windows-code-signed release.

## Verification
`npm test` launches fake pages in a new isolated WebView2 profile and checks native request blocking, cross-origin iframe cosmetic filtering, a real bundled filemoon.* anti-ad scriptlet, popup/redirect denial, unprivileged remote content, fullscreen, and the native menu's pause/resume behavior.

`node scripts/verify-live.mjs` checks the unauthenticated live Everglow startup and captures `evidence/live-login.png`. Both runners accept `DESKTOP_EXE` to test the installed release rather than the debug build. Debugging is exposed only with explicit verification flags, with isolated profiles; normal runs expose no debug port.

Evidence: `evidence/native-verification.json`, `evidence/live-startup.json`, `evidence/live-login.png`.
Authenticated movie playback and real streaming-site compatibility have not been verified. No login codes or private account data were read.

## Third-party sources and changes
- Tauri: https://github.com/tauri-apps/tauri (MIT/Apache-2.0).
- Brave adblock-rust: https://github.com/brave/adblock-rust (MPL-2.0).
- EasyList/EasyPrivacy: https://easylist.to/ ; bundled lists include their notices.
- uBlock Origin Lite **2026.930.1227**, Chromium release: https://github.com/uBlockOrigin/uBOL-home/releases/tag/2026.930.1227 (GPL-3.0; see `vendor/ubol/LICENSE.txt`).

The full bundled extension source is in `vendor/ubol`. Everglow-specific changes: initial Complete-mode default, a readiness message in the background worker, and two local readiness-page files. All upstream notices are retained. This distribution is not endorsed by Brave or uBlock Origin.
