import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

let adHits = 0;
const port = Number(process.env.EVERGLOW_VERIFY_PORT || 18765);
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/desktop-ad-probe')) { adHits++; res.end('window.adExecuted=true'); return; }
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/frame') {
    res.end('<script src="/desktop-ad-probe.js?iframe"></script><p>Fake player frame</p><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",()=>{let aborted=false;try{window.FMPoopS}catch{aborted=true}parent.postMessage({frameCosmetic:getComputedStyle(document.getElementById("cosmetic-ad")).display,scriptletAbortedAdAccess:aborted},"*")});</script>');
    return;
  }
  res.end(`<!doctype html><title>Everglow desktop verification</title><h1>Fake-data protection test</h1><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",e=>{if(e.data.frameCosmetic)window.frameProof=e.data});</script><script src="/desktop-ad-probe.js?top"></script><iframe src="http://filemoon.test:${port}/frame"></iframe><video id="video" controls></video>`);
});
await new Promise((r, j) => { server.once('error', j); server.listen(port, '127.0.0.1', r); });
const exe = resolve(process.env.DESKTOP_EXE || 'src-tauri/target/debug/everglow-desktop.exe');
const child = spawn(exe, ['--verify'], { stdio: 'inherit', windowsHide: true });
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
const results = [];
try {
  let target;
  for (let n = 0; n < 100; n++) {
    try {
      const targets = await (await fetch('http://127.0.0.1:18766/json/list')).json();
      target = targets.find(t => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${port}/`));
      if (target) break;
    } catch {}
    await delay(200);
  }
  assert(target, 'verification webview must start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data), waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id); clearTimeout(waiter.timer);
    data.error ? waiter.reject(Error(JSON.stringify(data.error))) : waiter.resolve(data.result);
  });
  await cdp('Page.enable');
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
    await delay(500);
  };
  const chromeState = () => evaluate(`(() => {
    const host = document.querySelector('everglow-titlebar');
    const bar = host?.shadowRoot.querySelector('.bar');
    const style = bar && getComputedStyle(bar);
    return { captionVisible: !!host?.hasAttribute('open') && getComputedStyle(host).display !== 'none', opacity: Number(style?.opacity), transform: style?.transform, height: innerHeight };
  })()`);
  await movePointer('Content');
  assert.equal(nativeWindow().menuVisible, false, 'Native menu stays hidden');
  assert.equal((await chromeState()).captionVisible, false, 'Title bar starts hidden');
  for (let n = 0; n < 2; n++) {
    await movePointer('Top');
    assert.equal((await chromeState()).captionVisible, true, 'Top-edge hover reveals title bar');
    await movePointer('Bar');
    assert.equal((await chromeState()).captionVisible, true, 'Controls stay visible while hovered');
    await movePointer(n === 0 ? 'Content' : 'Outside');
    assert.equal((await chromeState()).captionVisible, false, 'Leaving the bar hides title bar');
  }
  results.push('Animated title bar reveals at the top edge, stays usable on hover, and hides over content or outside the window');
  const heightBeforeReveal = (await chromeState()).height;
  const midAnimation = await evaluate(`new Promise(resolve => {
    const host = document.querySelector('everglow-titlebar');
    host.dispatchEvent(new PointerEvent('pointerenter'));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(Number(getComputedStyle(host.shadowRoot.querySelector('.bar')).opacity))));
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
  execFileSync('powershell', ['-NoProfile', '-File', 'scripts/fullscreen-window.ps1', '-AppProcessId', String(child.pid), '-WindowState', 'Restore', '-NativeWindowHandle', String(nativeHandle)], { windowsHide: true });
  results.push('Custom maximize, restore, and minimize buttons operate the native window');
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

  await clickControl('close');
  for (let n = 0; n < 50 && child.exitCode === null; n++) await delay(100);
  assert.equal(child.exitCode, 0, 'Close button exits the native app');
  results.push('Custom close button exits the native app');

  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/native-verification.json', JSON.stringify({ results, adHitsWhileProtected: 0, adHitsWhilePaused: adHits, checkedAt: new Date().toISOString() }, null, 2));
  console.log(results.join('\n'));
} finally {
  ws?.close();
  child.kill();
  server.close();
}
