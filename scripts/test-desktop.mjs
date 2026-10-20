import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

let adHits = 0;
let cacheHits = 0;
const port = Number(process.env.EVERGLOW_VERIFY_PORT || 18765);
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/desktop-ad-probe')) { adHits++; res.end('window.adExecuted=true'); return; }
  if (req.url === '/cache-probe') { cacheHits++; res.setHeader('Cache-Control', 'public, max-age=3600'); res.end('cached fixture'); return; }
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/unavailable') { res.writeHead(503); res.end('<h1>Temporarily unavailable</h1>'); return; }
  if (req.url === '/frame') {
    res.end('<script src="/desktop-ad-probe.js?iframe"></script><p>Fake player frame</p><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",()=>{let aborted=false;try{window.FMPoopS}catch{aborted=true}parent.postMessage({frameCosmetic:getComputedStyle(document.getElementById("cosmetic-ad")).display,scriptletAbortedAdAccess:aborted},"*")});</script>');
    return;
  }
  res.end(`<!doctype html><title>Everglow desktop verification</title><h1>Fake-data protection test</h1><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",e=>{if(e.data.frameCosmetic)window.frameProof=e.data});</script><script src="/desktop-ad-probe.js?top"></script><iframe src="http://filemoon.test:${port}/frame"></iframe><video id="video" controls></video>`);
});
await new Promise((r, j) => { server.once('error', j); server.listen(port, '127.0.0.1', r); });
const exe = resolve(process.env.DESKTOP_EXE || 'src-tauri/target/debug/everglow-desktop.exe');
const settingsDir = mkdtempSync(resolve(tmpdir(), 'everglow-desktop-'));
const appEnvironment = { ...process.env, EVERGLOW_VERIFY_DATA_DIR: settingsDir };
const launch = () => spawn(exe, ['--verify'], { stdio: 'inherit', windowsHide: true, env: appEnvironment });
let child;
let ws;
let id = 0;
const pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error('CDP timed out: ' + method)); }, 15000);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression, extra = {}) {
  const value = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...extra });
  if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function connectTarget(target) {
  ws?.close();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data), waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id); clearTimeout(waiter.timer);
    data.error ? waiter.reject(Error(JSON.stringify(data.error))) : waiter.resolve(data.result);
  });
  await cdp('Page.enable');
}
async function waitForTarget(matches) {
  for (let n = 0; n < 200; n++) {
    try {
      const targets = await (await fetch('http://127.0.0.1:18766/json/list')).json();
      const target = targets.find(t => t.type === 'page' && matches(t));
      if (target) return target;
    } catch {}
    await delay(200);
  }
  assert.fail('Expected verification webview did not start');
}
async function waitForDebuggerExit() {
  for (let n = 0; n < 100; n++) {
    try { await fetch('http://127.0.0.1:18766/json/version'); } catch { return; }
    await delay(100);
  }
  assert.fail('Verification debug port 18766 is still in use');
}
const results = [];
try {
  await waitForDebuggerExit();
  child = launch();
  const startupTarget = await waitForTarget(t => t.url.startsWith('http://tauri.localhost/') && t.url.includes(`verifyPid=${child.pid}`));
  await connectTarget(startupTarget);
  for (let n = 0; n < 50 && !await evaluate('!!document.getElementById("heading")'); n++) await delay(100);
  assert.equal(await evaluate('document.getElementById("heading").textContent'), 'Opening Everglow…');
  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/startup-loading.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  results.push('Bundled startup screen renders while protection initializes');
  const target = await waitForTarget(t => t.url.startsWith(`http://127.0.0.1:${port}/`));
  await connectTarget(target);
  assert.equal(await evaluate('typeof window.__everglowCheckForUpdates'), 'undefined');
  assert.equal(await evaluate('typeof window.__everglowDesktopVersion'), 'undefined');
  results.push('Untrusted local page receives no desktop update bridge');
  await delay(1600);
  assert.equal(await evaluate("getComputedStyle(document.getElementById('cosmetic-ad')).display"), 'none', 'Complete mode must hide generic ad elements');
  await evaluate("document.querySelector('iframe').contentWindow.postMessage('inspect','*')");
  await delay(400);
  const frameProof = await evaluate('window.frameProof');
  assert.equal(frameProof?.frameCosmetic, 'none', 'Cross-origin iframe cosmetics must work');
  assert.equal(frameProof.scriptletAbortedAdAccess, true, 'Real filemoon.* scriptlet must abort the ad script property access');
  results.push('uBO Complete mode: cosmetic ads hidden in top page and cross-origin iframe');
  results.push('Real bundled filemoon.* scriptlet aborted an ad-script property access in cross-origin iframe');
  assert.equal(adHits, 0, 'top-level and cross-origin iframe ads must never reach the server');
  assert.equal(await evaluate('window.adExecuted === true'), false);
  results.push('Native blocking: top-page and cross-origin iframe ad scripts blocked before network');

  const probe = await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>({status:r.status,body:r.headers.get('content-length')}))");
  assert.equal(probe.status, 204);
  assert.equal(adHits, 0);
  results.push('Native blocking: fetch replaced by HTTP 204; no server request');

  await evaluate("window.open('https://popup-test.invalid', '_blank'); 'attempted'");
  await delay(400);
  const targets = await (await fetch('http://127.0.0.1:18766/json/list')).json();
  assert(!targets.some(t => t.url.includes('popup-test.invalid')));
  results.push('Popup denied: no new browser/webview target');

  await evaluate("chrome.webview.postMessage('everglow-desktop-protection-ready'); 'attempted'");
  await delay(100);
  assert.equal(await evaluate('location.origin'), `http://127.0.0.1:${port}`);
  results.push('Remote page cannot forge the trusted extension startup message');

  await evaluate("location.href='https://navigation-test.invalid'; 'attempted'");
  await delay(400);
  assert.equal(await evaluate('location.origin'), `http://127.0.0.1:${port}`);
  results.push('External top-level navigation denied');

  assert.equal(await evaluate("window.__TAURI_INTERNALS__.invoke(\'plugin:window|set_title\', {label:\'main\',title:\'UNAUTHORIZED\'}).then(()=>false,()=>true)"), true);
  results.push('Remote page cannot invoke privileged Tauri commands');

  const nativeWindow = (toggle = false) => {
    const output = execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), ...(toggle ? ['-Toggle'] : [])], { encoding: 'utf8', windowsHide: true });
    return toggle ? undefined : JSON.parse(output);
  };
  const movePointer = async position => {
    execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-Pointer', position], { windowsHide: true });
    const state = await chromeState();
    const visible = !state.fullscreen && (state.pinned || position === 'Top' || position === 'Bar');
    for (let n = 0; n < 20; n++) {
      if ((await chromeState()).captionVisible === visible) break;
      await delay(100);
    }
    await delay(300);
  };
  const chromeState = () => evaluate(`(() => {
    const host = document.querySelector('everglow-titlebar');
    const bar = host?.shadowRoot.querySelector('.bar');
    const style = bar && getComputedStyle(bar);
    return { captionVisible: !!host?.hasAttribute('open') && getComputedStyle(host).display !== 'none', opacity: Number(style?.opacity), transform: style?.transform, height: innerHeight, fullscreen: host?.hasAttribute('fullscreen'), hover: host?.matches(':hover'), focus: host?.shadowRoot.activeElement?.outerHTML, focusVisible: host?.shadowRoot.activeElement?.matches(':focus-visible'), pinned: host?.shadowRoot.querySelector('[name=titlebar]').checked };
  })()`);
  await movePointer('Content');
  assert.equal(nativeWindow().menuVisible, false, 'Native menu stays hidden');
  const initialChrome = await chromeState();
  assert.equal(initialChrome.captionVisible, false, 'Title bar starts hidden: ' + JSON.stringify(initialChrome));
  for (let n = 0; n < 2; n++) {
    await movePointer('Top');
    const revealed = await chromeState();
    if (!revealed.captionVisible) assert.fail('Top-edge hover reveals title bar: ' + JSON.stringify({ revealed, native: JSON.parse(execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Inspect'], { encoding: 'utf8', windowsHide: true })) }));
    await movePointer('Bar');
    assert.equal((await chromeState()).captionVisible, true, 'Controls stay visible while hovered');
    await movePointer(n === 0 ? 'Content' : 'Outside');
    assert.equal((await chromeState()).captionVisible, false, 'Leaving the bar hides title bar');
  }
  results.push('Animated title bar reveals at the top edge, stays usable on hover, and hides over content or outside the window');
  await delay(200);
  const heightBeforeReveal = (await chromeState()).height;
  const midAnimation = await evaluate(`new Promise(resolve => {
    const host = document.querySelector('everglow-titlebar');
    const bar = host.shadowRoot.querySelector('.bar');
    host.dispatchEvent(new PointerEvent('pointerenter'));
    getComputedStyle(bar).opacity;
    const animation = bar.getAnimations().find(animation => animation.transitionProperty === 'opacity');
    if (!animation) { resolve(null); return; }
    animation.pause();
    animation.currentTime = animation.effect.getTiming().duration / 2;
    const opacity = Number(getComputedStyle(bar).opacity);
    animation.play();
    resolve(opacity);
  })`);
  assert(midAnimation > 0 && midAnimation < 1, 'Reveal must animate through intermediate opacity');
  await delay(250);
  assert.equal((await chromeState()).opacity, 1);
  assert.equal((await chromeState()).height, heightBeforeReveal, 'Revealing the overlay never resizes the page');
  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/topbar-shown.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await evaluate("document.querySelector('everglow-titlebar').dispatchEvent(new PointerEvent('pointerleave')); true");
  await delay(450);
  assert.equal((await chromeState()).opacity, 0, 'Exit fades completely');
  writeFileSync('evidence/topbar-hidden.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('everglow-titlebar').shadowRoot.querySelector('.bar')).transform"), 'none', 'Reduced motion avoids sliding');
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'M', code: 'KeyM', modifiers: 10 });
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.activeElement?.dataset.action"), 'menu', 'Keyboard shortcut reveals and focuses menu');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await delay(200);
  assert.equal((await chromeState()).captionVisible, false, 'Escape dismisses the bar');
  results.push('Smooth reveal and exit, no page resize, reduced-motion fallback, keyboard reveal and Escape verified');
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Maximize'], { windowsHide: true });
  await movePointer('Top');
  assert.equal((await chromeState()).captionVisible, true, 'Maximized windows reveal their title bar');
  await movePointer('Content');
  assert.equal((await chromeState()).captionVisible, false, 'Maximized windows hide their title bar');
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Restore'], { windowsHide: true });
  results.push('Auto-hide works in maximized and restored windows');
  let nativeHandle;
  const windowState = () => JSON.parse(execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Inspect', ...(nativeHandle ? ['-NativeWindowHandle', String(nativeHandle)] : [])], { encoding: 'utf8', windowsHide: true }));
  nativeHandle = windowState().handle;
  await movePointer('Top');
  const beforeDrag = windowState();
  const defaultBounds = beforeDrag;
  await evaluate(`window.dragEvents = []; document.querySelector('everglow-titlebar').shadowRoot.querySelector('.drag').addEventListener('pointerdown', event => window.dragEvents.push({ detail: event.detail, trusted: event.isTrusted })); true`);
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-Drag'], { windowsHide: true });
  await delay(300);
  assert.deepEqual(await evaluate('window.dragEvents'), [{ detail: 0, trusted: true }], 'Real mouse input reaches the drag region with zero pointer click count');
  const afterDrag = windowState();
  assert(Math.abs(afterDrag.left - beforeDrag.left) >= 40 && Math.abs(afterDrag.top - beforeDrag.top) >= 20, 'Dragging the title bar moves the native window');
  results.push('Real mouse drag on the title bar moves the restored native window');
  const clickControl = action => evaluate(`(() => { const host = document.querySelector('everglow-titlebar'); host.dispatchEvent(new PointerEvent('pointerenter')); host.shadowRoot.querySelector('[data-action=${action}]').click(); return true; })()`);
  await clickControl('maximize');
  await delay(300);
  assert.equal(windowState().maximized, true, 'Maximize button maximizes the native window');
  await clickControl('maximize');
  await delay(300);
  assert.equal(windowState().maximized, false, 'Restore button restores the native window');
  await clickControl('minimize');
  await delay(300);
  assert.equal(windowState().minimized, true, 'Minimize button minimizes the native window');
  const duplicate = launch();
  await new Promise((resolve, reject) => { duplicate.once('error', reject); duplicate.once('exit', code => { try { assert.equal(code, 0); resolve(); } catch (error) { reject(error); } }); });
  await delay(300);
  assert.equal(windowState().minimized, false, 'Second launch restores the existing window');
  assert.equal(windowState().focused, true, 'Second launch focuses the existing window');
  results.push('Second launch exits without creating another app and restores/focuses the existing window');
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Restore', '-NativeWindowHandle', String(nativeHandle)], { windowsHide: true });
  results.push('Custom maximize, restore, and minimize buttons operate the native window');
  await clickControl('menu');
  await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-menu=settings]').click(); true");
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.settings').open"), true);
  const setting = name => evaluate(`document.querySelector('everglow-titlebar').shadowRoot.querySelector('[name=${name}]').click(); true`);
  await setting('titlebar');
  await delay(200);
  assert.equal(JSON.parse(readFileSync(resolve(settingsDir, 'desktop-settings.json'))).alwaysShowTitlebar, true);
  await evaluate("document.cookie='session_probe=preserved; path=/'; localStorage.setItem('session_probe','preserved'); true");
  await evaluate("fetch('/cache-probe').then(r=>r.text())");
  await evaluate("fetch('/cache-probe').then(r=>r.text())");
  assert.equal(cacheHits, 1, 'Fixture is cached before clearing');
  await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.clear-cache').click(); true");
  for (let n = 0; n < 50; n++) {
    if (await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.feedback').textContent.startsWith('Cached files cleared')")) break;
    await delay(100);
  }
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.feedback').textContent"), 'Cached files cleared. You’re still signed in.');
  assert.equal(await evaluate("document.cookie.includes('session_probe=preserved') && localStorage.getItem('session_probe') === 'preserved'"), true);
  await evaluate("fetch('/cache-probe').then(r=>r.text())");
  assert.equal(cacheHits, 2, 'Clearing cached files forces a fresh network request');
  writeFileSync('evidence/desktop-settings.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  const settingsBounds = windowState();
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Place', '-Width', '420', '-Height', '600'], { windowsHide: true });
  await delay(200);
  assert.equal(await evaluate("(() => { const dialog = document.querySelector('everglow-titlebar').shadowRoot.querySelector('.settings'); return dialog.scrollWidth <= dialog.clientWidth; })()"), true, 'Settings fit the minimum window width');
  writeFileSync('evidence/desktop-settings-narrow.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Place', '-Left', String(settingsBounds.left), '-Top', String(settingsBounds.top), '-Width', String(settingsBounds.width), '-Height', String(settingsBounds.height)], { windowsHide: true });
  await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.settings-done').click(); true");
  await movePointer('Content');
  assert.equal((await chromeState()).captionVisible, true, 'Pinned title bar stays visible over content');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.equal((await chromeState()).captionVisible, true, 'Escape keeps a pinned title bar visible');
  await setting('titlebar');
  await delay(100);
  await movePointer('Content');
  results.push('Desktop settings persist; pinned title bar stays visible; clearing real disk cache preserves cookies and local storage');
  await evaluate("window.addEventListener('everglow-window-state', event => window.nativeDesktopState = event.detail); chrome.webview.postMessage('everglow-window:state'); true");
  await delay(100);
  const showUpdate = update => evaluate(`window.dispatchEvent(new CustomEvent('everglow-window-state', {detail:{...window.nativeDesktopState,update:${JSON.stringify(update)}}})); true`);
  await showUpdate({ phase: 'available', version: '9.9.9', action: 'download', message: 'Desktop 9.9.9 is available. Download when you’re ready.' });
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.update-dot').hidden"), false);
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-menu=check_updates] .label').textContent"), 'Download update');
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('.settings').open"), false, 'Background update status opens no dialog');
  await clickControl('menu');
  await showUpdate({ phase: 'downloading', action: 'download', progress: 42, message: 'Downloading update: 42%. Keep watching.' });
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-menu=check_updates]').disabled"), true);
  await showUpdate({ phase: 'ready', action: 'install', message: 'Desktop 9.9.9 is verified and ready. Restart when you’re ready.' });
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-menu=check_updates] .label').textContent"), 'Restart to update');
  await delay(200);
  writeFileSync('evidence/update-menu.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await evaluate("chrome.webview.postMessage('everglow-window:state'); true");
  await clickControl('menu');
  results.push('Synthetic update states show a menu badge, download progress, and explicit restart action without opening dialogs');
  await movePointer('Content');
  for (let n = 0; n < 2; n++) {
    await evaluate("document.getElementById('video').requestFullscreen().then(()=>true)", { userGesture: true });
    await delay(400);
    assert.equal(await evaluate('!!document.fullscreenElement'), true);
    assert.deepEqual(nativeWindow(), { menuVisible: false, fillsMonitor: true }, 'Video fullscreen must hide the native menu and fill the monitor');
    await evaluate('document.exitFullscreen().then(()=>true)');
    await delay(400);
    assert.equal(nativeWindow().menuVisible, false, 'Exiting video fullscreen returns to hidden chrome');
    await movePointer('Top');
    assert.equal((await chromeState()).captionVisible, true, 'Hover reveal resumes after video fullscreen');
    await movePointer('Content');
  }
  results.push('Repeated video fullscreen fills the monitor and restores auto-hide on exit');
  for (let n = 0; n < 2; n++) {
    nativeWindow(true);
    await delay(400);
    assert.deepEqual(nativeWindow(), { menuVisible: false, fillsMonitor: true }, 'F11 fullscreen must hide the native menu and fill the monitor');
    await movePointer('Top');
    assert.equal((await chromeState()).captionVisible, false, 'Hover must not expose the title bar in fullscreen');
    await movePointer('Content');
    nativeWindow(true);
    await delay(400);
    assert.equal(nativeWindow().menuVisible, false, 'F11 returns to hidden chrome');
    await movePointer('Top');
    assert.equal((await chromeState()).captionVisible, true, 'Hover reveal resumes after F11');
    await movePointer('Content');
  }
  results.push('Repeated F11 fullscreen suppresses hover reveal and restores auto-hide on exit');

  await movePointer('Top');
  await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-action=menu]').click()");
  await delay(200);
  const dropdownInfo = await evaluate(`(() => {
    const host = document.querySelector('everglow-titlebar');
    const dropdown = host?.shadowRoot.querySelector('.dropdown');
    const bar = host?.shadowRoot.querySelector('.bar');
    const adblock = host?.shadowRoot.querySelector('[data-menu="adblock"]');
    return {
      isOpen: host?.hasAttribute('menu-open') && dropdown?.hasAttribute('open'),
      dropdownBg: dropdown && getComputedStyle(dropdown).backgroundColor,
      barBg: bar && getComputedStyle(bar).backgroundColor,
      dropdownFont: dropdown && getComputedStyle(dropdown).fontFamily,
      barFont: bar && getComputedStyle(bar).fontFamily,
      adblockChecked: adblock?.getAttribute('aria-checked'),
      itemCount: host?.shadowRoot.querySelectorAll('.menu-item').length
    };
  })()`);
  assert.equal(dropdownInfo.isOpen, true, 'Dropdown opens on menu click');
  assert.equal(dropdownInfo.dropdownBg, dropdownInfo.barBg, 'Dropdown background matches top bar UI');
  assert.equal(dropdownInfo.dropdownFont, dropdownInfo.barFont, 'Dropdown typography matches top bar UI');
  assert.equal(dropdownInfo.adblockChecked, 'true', 'Adblock checkmark is visible initially');
  assert.equal(dropdownInfo.itemCount, 8, 'Dropdown includes desktop settings alongside the existing menu items');
  writeFileSync('evidence/dropdown-shown.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await delay(150);
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').hasAttribute('menu-open')"), false, 'Escape dismisses dropdown');
  results.push('Dropdown matches top bar UI styling, typography, items, and dismisses on Escape');

  const toggle = async () => {
    await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[data-action=menu]').click(); true");
    await delay(300);
    execFileSync('powershell', ['-NoProfile', '-File', 'scripts/toggle-adblock.ps1', '-AppProcessId', String(child.pid)], { windowsHide: true });
  };
  await movePointer('Top');
  await toggle();
  await movePointer('Content');
  await delay(1800);
  await movePointer('Top');
  assert.equal((await chromeState()).captionVisible, true, 'Animated menu can still be revealed after reloading');
  await movePointer('Content');
  assert.notEqual(await evaluate("getComputedStyle(document.getElementById('cosmetic-ad')).display"), 'none');
  assert.equal((await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>r.status)")), 200);
  assert(adHits > 0);
  await movePointer('Top');
  await toggle();
  await movePointer('Content');
  await delay(2000);
  for (let n=0; n<60; n++) {
    if (await evaluate("!!document.getElementById('cosmetic-ad')")) break;
    await delay(200);
  }
  assert.equal(await evaluate("getComputedStyle(document.getElementById('cosmetic-ad')).display"), 'none');
  assert.equal((await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>r.status)")), 204);
  results.push('Native menu pauses and restores BOTH blocking layers');

  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp('Page.reload', { ignoreCache: true });
  await delay(500);
  assert.equal(windowState().visible, false, 'Offline navigation shows recovery instead of an unusable main page');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await connectTarget(startupTarget);
  assert.equal(await evaluate('document.getElementById("heading").textContent'), 'Couldn’t open Everglow');
  await evaluate('document.getElementById("retry").click(); true');
  await delay(500);
  await connectTarget(await waitForTarget(t => t.id === target.id && t.url === `http://127.0.0.1:${port}/`));
  assert.equal(windowState().visible, true);
  assert.equal(await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>r.status)"), 204, 'Protection survives offline recovery');
  results.push('Offline navigation shows recovery; Retry reconnects with protection still active');

  await evaluate("location.href='/unavailable'; true");
  await delay(600);
  assert.equal(windowState().visible, false, 'Failed navigation hides the unusable main page');
  await connectTarget(startupTarget);
  assert.equal(await evaluate('document.getElementById("heading").textContent'), 'Couldn’t open Everglow');
  assert.equal(await evaluate('document.querySelector(".actions").hidden'), false);
  writeFileSync('evidence/startup-recovery.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await evaluate('document.getElementById("retry").click(); true');
  await delay(500);
  await connectTarget(await waitForTarget(t => t.id === target.id && t.url === `http://127.0.0.1:${port}/`));
  assert.equal(windowState().visible, true, 'Retry restores the protected main window');
  results.push('HTTP failure shows actionable recovery; Retry reconnects without bypassing protection');

  // Render synthetic HTML at the trusted origin without requesting live data.
  // Verification mode disables updater network calls even on this origin.
  ws.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Fetch.requestPaused') {
      await cdp('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
        body: Buffer.from('<!doctype html><title>Fake Everglow update bridge</title><p>Demo only</p>').toString('base64'),
      });
    }
  });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://everglow-1c6db.web.app/*', resourceType: 'Document' }] });
  await cdp('Page.navigate', { url: 'https://everglow-1c6db.web.app/desktop-bridge-demo' });
  for (let n = 0; n < 50; n++) {
    if (await evaluate('typeof window.__everglowCheckForUpdates') === 'function') break;
    await delay(100);
  }
  assert.equal(await evaluate('window.__everglowDesktopVersion'), JSON.parse(readFileSync('package.json')).version);
  assert.equal(await evaluate("window.__everglowCheckForUpdates(); 'requested'"), 'requested');
  assert.equal(await evaluate("Object.getOwnPropertyDescriptor(window, '__everglowCheckForUpdates').writable"), false);
  results.push('Trusted synthetic production-origin page receives version and fixed update action; verification never checks live feed');

  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Place'], { windowsHide: true });
  const savedBounds = windowState();
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Maximize'], { windowsHide: true });
  await clickControl('close');
  for (let n = 0; n < 50 && child.exitCode === null; n++) await delay(100);
  assert.equal(child.exitCode, 0, 'Close button exits the native app');
  results.push('Custom close button exits the native app');
  const saved = JSON.parse(readFileSync(resolve(settingsDir, 'desktop-settings.json')));
  assert.equal(saved.layout.maximized, true, 'Maximized state persists on close');
  await waitForDebuggerExit();
  child = launch();
  await connectTarget(await waitForTarget(t => t.url === `http://127.0.0.1:${port}/`));
  await delay(500);
  nativeHandle = undefined;
  nativeHandle = windowState().handle;
  assert.equal(windowState().maximized, true, 'Relaunch restores maximized state');
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Restore'], { windowsHide: true });
  const restoredBounds = windowState();
  for (const field of ['left', 'top', 'width', 'height']) assert.equal(restoredBounds[field], savedBounds[field], `Relaunch restores ${field}`);
  await setting('layout');
  await setting('titlebar');
  await delay(100);
  await clickControl('close');
  for (let n = 0; n < 50 && child.exitCode === null; n++) await delay(100);
  assert.equal(child.exitCode, 0);
  await waitForDebuggerExit();
  child = launch();
  await connectTarget(await waitForTarget(t => t.url === `http://127.0.0.1:${port}/`));
  await delay(500);
  nativeHandle = undefined;
  nativeHandle = windowState().handle;
  assert.equal(windowState().maximized, false, 'Disabling remembered layout skips saved maximized state');
  assert.equal(windowState().width, defaultBounds.width);
  assert.equal(windowState().height, defaultBounds.height);
  assert.equal(await evaluate("document.querySelector('everglow-titlebar').shadowRoot.querySelector('[name=titlebar]').checked"), true, 'Title bar preference persists across relaunch');
  await movePointer('Content');
  assert.equal((await chromeState()).captionVisible, true);
  await clickControl('close');
  for (let n = 0; n < 50 && child.exitCode === null; n++) await delay(100);
  assert.equal(child.exitCode, 0);
  results.push('Relaunch restores maximized state and normal bounds; disabling layout uses defaults; pinned-titlebar preference survives relaunch');

  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/native-verification.json', JSON.stringify({ results, adHitsWhileProtected: 0, adHitsWhilePaused: adHits, checkedAt: new Date().toISOString() }, null, 2));
  console.log(results.join('\n'));
} finally {
  ws?.close();
  if (child && child.exitCode === null) {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  }
  server.close();
  rmSync(settingsDir, { recursive: true, force: true });
}
