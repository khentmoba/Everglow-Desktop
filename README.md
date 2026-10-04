# Everglow Desktop

Windows Tauri 2 app loading https://everglow-1c6db.web.app/ in its own window.

## Use
Open **Everglow Desktop** on the desktop or Start menu. Sign in normally; this app has its own persistent browser profile and does not borrow browser cookies.

Menu: **Everglow → Block ads and trackers** pauses/resumes both blocking layers (and reloads the page). Popups and external top-level redirects remain denied even when ad blocking is paused. **F11** toggles fullscreen; **Refresh Everglow** reloads the site.

## Blocking
- Brave's open-source `adblock-rust` matcher with bundled EasyList and EasyPrivacy.
- The native lists refresh over HTTPS on every normal launch; failed downloads retain the last usable rules.
- uBlock Origin Lite **Complete** mode adds generic/site-specific cosmetic filtering, procedural filtering, scriptlets and resource replacements.
- Native interception covers document/iframe/service-worker/shared-worker request sources.
- Only our bundled extension is enabled/disabled by the menu, not WebView2's built-in PDF extension.
- The app waits for the extension's initial filter/script registration before opening Everglow.
- Remote pages receive no Tauri capabilities. Navigation is limited to Everglow and installed extension pages. The startup handshake accepts only the exact local extension page, not messages from the website.

**This is strong layered ad blocking, not an identical implementation of Brave Shields.** WebView2 is not Brave. Browser-level fingerprint protection, CNAME uncloaking, all Brave-specific heuristics and every streaming site's anti-adblock behavior are not guaranteed.

## Updates
Everglow loads from the live website, not a frozen Flutter bundle. Its existing update banner still works: restart/refresh when it offers a newer build; movies are not forcefully interrupted.

The desktop app itself updates natively since 0.2.0: about 10 seconds after launch it checks the GitHub release feed for a newer signed version and asks whether to install it (passive installer, the app restarts itself when done). **Everglow → Check for Updates…** checks on demand. Installs are signature-verified before they run.

Releases are built and signed by GitHub Actions when a `v*` tag is pushed (`git tag v0.2.0 && git push origin v0.2.0`). To ship an update: bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` (all three must match), commit, then tag and push the tag. The private signing key lives only in the `TAURI_SIGNING_PRIVATE_KEY` repo secret plus a local backup at `.tauri-signing.key` (gitignored, never commit it); the public key is baked into `src-tauri/tauri.conf.json`. Note: 0.1.0 installs predate the updater, so they need one last manual install of 0.2.0+ — every install after that updates itself.

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

Installer: `src-tauri/target/release/bundle/nsis/Everglow Desktop_0.1.0_x64-setup.exe`.

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
