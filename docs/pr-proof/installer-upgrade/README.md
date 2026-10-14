# Installer update flow — Windows 11, 2026-10-14

All screenshots use the isolated `Everglow Installer Test` identity from
`scripts/installer-test.json`. No real installation, login or couple data was used.

- `before.png`: actual Tauri CLI 2.12.1 stock NSIS maintenance page, opening
  a 0.3.0 installer over an installed 0.3.0 test fixture. Shows Add/Reinstall
  and Uninstall choices, reproducing the reported experience.
- `after.png`: actual custom 0.3.1 installer over that installed 0.3.0 fixture.
  Opens directly to one Update button, with both versions visible.
- `repair.png`: reopening 0.3.1 over the now-updated 0.3.1 fixture shows Repair.
- `complete.png`: clicking Repair copies files, then goes straight to
  “Everglow Desktop is ready,” without the stock extra Next step.

The baseline installer used the stock template from `tauri-bundler 2.10.1`.
Only its installer metadata was 0.3.0; the payload was the current test binary.
The fixture app was never launched normally. Update and Repair buttons were
clicked in the real NSIS window, and the registered version became 0.3.1.

## Checks

- `cargo test --manifest-path src-tauri/Cargo.toml`: 5 passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`: passed.
- `node --test scripts/release-contract.test.mjs`: 1 passed.
- `npm run build -- --config scripts/installer-test.json`: optimized app and
  real NSIS installer built successfully; updater artifacts disabled only for
  this separate test identity, without accessing signing secrets.
- `./scripts/test-installer.ps1 -Installer <isolated 0.3.1 installer>`:
  14 assertions passed, zero skips, including fresh install, passive upgrade,
  same-version repair, preserved fake data/shortcut/location, and rejected
  silent downgrade. Passed again after the completion-screen change.
- `DESKTOP_EXE=<optimized executable> npm test`: 12 WebView2 checks passed,
  including blocking, fullscreen, native menu and trusted update bridge.
- Native screenshots and Update/Repair interaction: passed.
- Flutter, website browser and service-worker checks: N/A, website unchanged.

The Windows UI helper briefly returned `foreground window did not report a
process id`; resetting its session restored capture. A local rebundle initially
failed with `Access is denied` while the test installer was open; closing only
that fixture allowed the build. Rebundling an already-patched local executable
also warns about the consumed Tauri bundle-type marker; clean CI builds do not
reuse that patched executable. The optimized test binary passed all 12 native
checks. The automated regression suite passed after the final rebundle.

An existing authenticated user profile was not upgraded. Fake data preservation
and actual installer execution were verified instead. Production signing and
publication still require the merged v0.3.1 release workflow.
