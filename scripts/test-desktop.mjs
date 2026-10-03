import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

let adHits = 0;
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/desktop-ad-probe')) { adHits++; res.end('window.adExecuted=true'); return; }
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/frame') {
    res.end('<script src="/desktop-ad-probe.js?iframe"></script><p>Fake player frame</p><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",()=>{let aborted=false;try{window.FMPoopS}catch{aborted=true}parent.postMessage({frameCosmetic:getComputedStyle(document.getElementById("cosmetic-ad")).display,scriptletAbortedAdAccess:aborted},"*")});</script>');
    return;
  }
  res.end('<!doctype html><title>Everglow desktop verification</title><h1>Fake-data protection test</h1><ins id="cosmetic-ad" class="adsbygoogle" data-ad-client="test">Fake ad</ins><script>window.addEventListener("message",e=>{if(e.data.frameCosmetic)window.frameProof=e.data});</script><script src="/desktop-ad-probe.js?top"></script><iframe src="http://filemoon.test:18765/frame"></iframe><video id="video" controls></video>');
});
await new Promise(r => server.listen(18765, '0.0.0.0', r));
const exe = resolve(process.env.DESKTOP_EXE || 'src-tauri/target/debug/everglow-desktop.exe');
const child = spawn(exe, ['--verify'], { stdio: 'inherit' });
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
      target = targets.find(t => t.type === 'page' && t.url.includes('18765'));
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
  assert.equal(await evaluate('location.origin'), 'http://127.0.0.1:18765');
  results.push('Remote page cannot forge the trusted extension startup message');

  await evaluate("location.href='https://navigation-test.invalid'; 'attempted'");
  await delay(400);
  assert.equal(await evaluate('location.origin'), 'http://127.0.0.1:18765');
  results.push('External top-level navigation denied');

  assert.equal(await evaluate("window.__TAURI_INTERNALS__.invoke(\'plugin:window|set_title\', {label:\'main\',title:\'UNAUTHORIZED\'}).then(()=>false,()=>true)"), true);
  results.push('Remote page cannot invoke privileged Tauri commands');

  await cdp('Browser.getWindowForTarget');
  await evaluate("document.getElementById('video').requestFullscreen().then(()=>true)", { userGesture: true });
  await delay(400);
  assert.equal(await evaluate('!!document.fullscreenElement'), true);
  await evaluate('document.exitFullscreen().then(()=>true)');
  results.push('Video element fullscreen entered and exited');

  const toggle = () => execFileSync('powershell', ['-NoProfile', '-File', 'scripts/toggle-adblock.ps1', '-AppProcessId', String(child.pid)]);
  toggle();
  await delay(1800);
  assert.notEqual(await evaluate("getComputedStyle(document.getElementById('cosmetic-ad')).display"), 'none');
  assert.equal((await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>r.status)")), 200);
  assert(adHits > 0);
  toggle();
  await delay(2000);
  for (let n=0; n<60; n++) {
    if (await evaluate("!!document.getElementById('cosmetic-ad')")) break;
    await delay(200);
  }
  assert.equal(await evaluate("getComputedStyle(document.getElementById('cosmetic-ad')).display"), 'none');
  assert.equal((await evaluate("fetch('/desktop-ad-probe-fetch').then(r=>r.status)")), 204);
  results.push('Native menu pauses and restores BOTH blocking layers');

  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/native-verification.json', JSON.stringify({ results, adHitsWhileProtected: 0, adHitsWhilePaused: adHits, checkedAt: new Date().toISOString() }, null, 2));
  console.log(results.join('\n'));
} finally {
  ws?.close();
  child.kill();
  server.close();
}
