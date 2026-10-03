import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const child = spawn(resolve(process.env.DESKTOP_EXE || 'src-tauri/target/debug/everglow-desktop.exe'), ['--verify-live'], { stdio: 'inherit' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const waiting = new Map(), errors = [];
function cdp(method, params = {}) {
  return new Promise((resolve,reject) => {
    const n = ++id;
    const timer = setTimeout(()=>{waiting.delete(n); reject(Error(method+' timed out'));},20000);
    waiting.set(n,{resolve,reject,timer}); ws.send(JSON.stringify({id:n,method,params}));
  });
}
async function evaluate(expression) {
  const r = await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
try {
  let target;
  for(let n=0;n<100;n++) {
    try { target=(await (await fetch('http://127.0.0.1:18766/json/list')).json()).find(t=>t.type==='page'&&t.url.startsWith('https://everglow-1c6db.web.app/')); if(target)break; }catch{}
    await delay(200);
  }
  assert(target,'live Everglow must open');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  ws.addEventListener('message', e=>{
    const m=JSON.parse(e.data), w=waiting.get(m.id);
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
    if(w){clearTimeout(w.timer);waiting.delete(m.id);m.error?w.reject(Error(JSON.stringify(m.error))):w.resolve(m.result);}
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  for(let n=0;n<120;n++) {
    if(await evaluate("!!document.querySelector('flutter-view') && (!document.getElementById('eg-splash') || document.getElementById('eg-splash').classList.contains('hide'))"))break;
    await delay(500);
  }
  assert(await evaluate("!!document.querySelector('flutter-view')"),'Flutter must render');
  await evaluate("document.querySelector('flt-semantics-placeholder')?.click()");
  await delay(500);
  mkdirSync('evidence',{recursive:true});
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  writeFileSync('evidence/live-login.png',Buffer.from(shot.data,'base64'));
  const proof=await evaluate("({url:location.href,flutterRendered:!!document.querySelector('flutter-view'),text:document.body.innerText.slice(0,2500)})");
  assert(proof.url.startsWith('https://everglow-1c6db.web.app/'));
  assert.equal(errors.length,0,'live startup must not throw JS errors');
  writeFileSync('evidence/live-startup.json',JSON.stringify({...proof,errors,checkedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify(proof));
}finally{ws?.close();child.kill();}
