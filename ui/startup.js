const send = action => window.chrome.webview.postMessage(`everglow-startup:${action}`);
window.addEventListener('everglow-startup-state', event => {
  const failed = event.detail.phase === 'error';
  document.querySelector('main').setAttribute('aria-busy', String(!failed));
  document.getElementById('heading').textContent = failed ? 'Couldn’t open Everglow' : 'Opening Everglow…';
  document.getElementById('message').textContent = event.detail.message;
  document.querySelector('.actions').hidden = !failed;
  document.getElementById('retry').disabled = false;
});
document.getElementById('retry').addEventListener('click', () => {
  document.getElementById('retry').disabled = true;
  send('retry');
});
document.getElementById('close').addEventListener('click', () => send('close'));
send('state');
