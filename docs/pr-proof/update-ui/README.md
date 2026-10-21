# In-App Desktop Update UI Proof

Verification of the custom in-app update UI matching Everglow's dark plum theme.

## Evidence

- `after.png`: Custom update dialog rendered inside `<everglow-titlebar>` Shadow DOM across all three lifecycle states:
  1. **Update Available**: Prompt with glowing chip, rose gradient primary `Download update` action, and `Later` button.
  2. **Downloading**: Live animated gradient progress bar (`0%`–`100%`) with `Keep watching in background`.
  3. **Update Ready**: Signature-verified restart prompt with `Restart to update` and `Later` (replacing the native Win32 dialog).
