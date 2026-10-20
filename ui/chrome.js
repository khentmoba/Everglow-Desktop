(() => {
  if (window !== window.top || !['https://everglow-1c6db.web.app', 'https://everglow-1c6db.firebaseapp.com', '__VERIFY_ORIGIN__'].includes(location.origin)) return;
  const mount = () => {
    const host = document.createElement('everglow-titlebar');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all:initial; position:fixed; inset:0 0 auto; height:6px; z-index:2147483647; color-scheme:dark; }
        :host([open]) { height:44px; }
        :host([fullscreen]) { display:none; }
        .bar { display:flex; align-items:center; height:44px; background:#101011; color:#f5f5f7; font:13px 'Segoe UI',system-ui,sans-serif; box-shadow:0 6px 20px #0005; transform:translateY(-100%); opacity:0; transition:transform 160ms cubic-bezier(.4,0,1,1),opacity 120ms ease-out; }
        :host([open]) .bar { transform:translateY(0); opacity:1; transition:transform 220ms cubic-bezier(.16,1,.3,1),opacity 160ms ease-out; }
        button { display:flex; align-items:center; justify-content:center; height:36px; min-width:44px; padding:0 12px; margin:4px 0; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; cursor:default; transition:background-color 120ms ease-out,color 120ms ease-out; }
        button:hover { background:#2e2e33; } button:focus-visible { outline:2px solid #dedee3; outline-offset:-3px; }
        .menu { gap:8px; margin-left:4px; } .menu span { font-weight:600; }
        .drag { display:flex; align-items:center; flex:1; align-self:stretch; min-width:12px; padding:0 12px; user-select:none; }
        .status { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#b2b2b8; font-size:12px; }
        .close { margin-right:4px; } .close:hover { background:#c42b1c; color:#fff; }
        svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.3; }
        @media (prefers-reduced-motion:reduce) { .bar,:host([open]) .bar { transform:none; transition:opacity 80ms ease-out; } }
      </style>
      <div class="bar" role="toolbar" aria-label="Desktop window controls">
        <button class="menu" data-action="menu" aria-label="Everglow menu (Ctrl+Shift+M)" aria-haspopup="menu"><span>Everglow</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg></button>
        <div class="drag" title="Drag to move · Double-click to maximize"><span class="status"></span></div>
        <button data-action="minimize" aria-label="Minimize" title="Minimize"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
        <button data-action="maximize" aria-label="Maximize" title="Maximize"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9"/></svg></button>
        <button class="close" data-action="close" aria-label="Close" title="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>
      </div>`;
    const bar = root.querySelector('.bar');
    let menuOpen = false;
    let atEdge = false;
    let hideTimer;
    let previousFocus;
    const send = action => window.chrome.webview.postMessage(`everglow-window:${action}`);
    const open = () => {
      clearTimeout(hideTimer);
      if (!host.hasAttribute('fullscreen')) {
        host.setAttribute('open', '');
        bar.inert = false;
      }
    };
    const hide = () => {
      host.removeAttribute('open');
      bar.inert = true;
    };
    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!atEdge && !menuOpen && !host.matches(':hover') && !root.activeElement?.matches(':focus-visible')) hide();
      }, 250);
    };
    host.addEventListener('pointerenter', open);
    window.addEventListener('everglow-top-edge', event => {
      atEdge = event.detail;
      if (atEdge) open(); else scheduleHide();
    });
    host.addEventListener('pointerleave', scheduleHide);
    root.addEventListener('focusout', scheduleHide);
    root.addEventListener('click', event => {
      const action = event.target.closest('button')?.dataset.action;
      if (!action) return;
      if (action === 'menu') menuOpen = true;
      send(action);
    });
    const drag = root.querySelector('.drag');
    drag.addEventListener('pointerdown', event => { if (event.button === 0 && event.detail === 1) send('drag'); });
    drag.addEventListener('dblclick', () => send('maximize'));
    window.addEventListener('everglow-menu-closed', () => { menuOpen = false; scheduleHide(); });
    window.addEventListener('everglow-window-state', event => {
      host.toggleAttribute('fullscreen', event.detail.fullscreen);
      if (event.detail.fullscreen) hide();
      const maximize = root.querySelector('[data-action="maximize"]');
      const label = event.detail.maximized ? 'Restore' : 'Maximize';
      maximize.setAttribute('aria-label', label);
      maximize.title = label;
      root.querySelector('.status').textContent = event.detail.title?.replace(/^Everglow Desktop\s*[—-]?\s*/, '') || '';
    });
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        previousFocus = document.activeElement;
        open();
        root.querySelector('.menu').focus();
      } else if (event.key === 'Escape' && host.hasAttribute('open') && !menuOpen) {
        previousFocus?.focus();
        hide();
      }
    });
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) hide(); });
    hide();
    document.documentElement.append(host);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
