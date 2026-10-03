await chrome.runtime.sendMessage({ what: 'everglowDesktopReady' });
window.chrome.webview.postMessage('everglow-desktop-protection-ready');
