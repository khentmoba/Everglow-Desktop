# Everglow Desktop

Desktop companion app for Everglow built with Tauri v2, Rust, Microsoft Edge WebView2, and embedded ad blocking.

## Shipping & Pull Requests

Follow the local PR skill at `.agents/skills/everglow-desktop-pr/SKILL.md` for all commits and pull requests.
Always verify locally with:
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- `node --test scripts/release-contract.test.mjs`
- `npm test`
