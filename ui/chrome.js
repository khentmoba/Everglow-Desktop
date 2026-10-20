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
        .bar button { display:flex; align-items:center; justify-content:center; height:36px; min-width:44px; padding:0 12px; margin:4px 0; border:0; border-radius:6px; background:transparent; color:inherit; font:inherit; cursor:default; transition:background-color 120ms ease-out,color 120ms ease-out; }
        .bar button:hover { background:#2e2e33; }
        .bar button:focus-visible { outline:2px solid #dedee3; outline-offset:-3px; }
        .menu { gap:8px; margin-left:4px; }
        .menu span { font-weight:600; }
        [hidden] { display:none !important; }
        .update-dot { width:6px; height:6px; border-radius:50%; background:#dedee3; }
        .menu[aria-expanded="true"] { background:#2e2e33; }
        .menu svg { transition:transform 140ms ease-out; }
        .menu[aria-expanded="true"] svg { transform:rotate(180deg); }
        .drag { display:flex; align-items:center; flex:1; align-self:stretch; min-width:12px; padding:0 12px; user-select:none; }
        .status { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#b2b2b8; font-size:12px; }
        .close { margin-right:4px; }
        .close:hover { background:#c42b1c; color:#fff; }
        svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.3; }
        .dropdown {
          position:absolute;
          top:40px;
          left:4px;
          min-width:250px;
          padding:4px;
          background:#101011;
          color:#f5f5f7;
          font:13px 'Segoe UI',system-ui,sans-serif;
          border:1px solid #28282e;
          border-radius:8px;
          box-shadow:0 12px 32px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.4);
          display:flex;
          flex-direction:column;
          box-sizing:border-box;
          opacity:0;
          transform:translateY(-6px) scale(0.98);
          transform-origin:top left;
          pointer-events:none;
          transition:opacity 120ms ease-out,transform 140ms cubic-bezier(.16,1,.3,1);
          z-index:2147483647;
        }
        :host([menu-open]) .dropdown {
          opacity:1;
          transform:translateY(0) scale(1);
          pointer-events:auto;
        }
        .menu-item {
          display:flex;
          align-items:center;
          justify-content:flex-start;
          height:32px;
          width:100%;
          min-width:0;
          padding:0 8px;
          margin:0;
          border:0;
          border-radius:5px;
          background:transparent;
          color:#f5f5f7;
          font:inherit;
          cursor:default;
          text-align:left;
          box-sizing:border-box;
          user-select:none;
          transition:background-color 100ms ease-out,color 100ms ease-out;
        }
        .menu-item:hover, .menu-item:focus-visible {
          background:#2e2e33;
          color:#fff;
          outline:none;
        }
        .icon-slot {
          display:flex;
          align-items:center;
          justify-content:center;
          width:20px;
          height:20px;
          margin-right:8px;
          flex-shrink:0;
        }
        .check-icon {
          width:12px;
          height:12px;
          stroke:currentColor;
          stroke-width:2;
          fill:none;
          display:none;
        }
        .menu-item[aria-checked="true"] .check-icon {
          display:block;
        }
        .label {
          flex:1;
          white-space:nowrap;
        }
        .shortcut {
          margin-left:20px;
          color:#8e8e93;
          font-size:11px;
          white-space:nowrap;
          letter-spacing:0.3px;
        }
        .menu-item:hover .shortcut, .menu-item:focus-visible .shortcut {
          color:#d1d1d6;
        }
        .separator {
          height:1px;
          background:rgba(255,255,255,0.08);
          margin:4px 6px;
          border:0;
        }
        .update-status { margin:4px 8px 8px; max-width:300px; color:#b2b2b8; font-size:12px; line-height:1.5; }
        .settings { box-sizing:border-box; width:min(480px,calc(100vw - 32px)); max-height:calc(100vh - 48px); overflow:auto; padding:24px; border:0; border-radius:12px; background:#18181b; color:#f5f5f7; font:14px/1.5 'Segoe UI',system-ui,sans-serif; box-shadow:0 16px 48px #0008; color-scheme:dark; }
        .settings::backdrop { background:#0008; }
        .settings h2 { margin:0 0 4px; font-size:20px; line-height:1.3; font-weight:600; }
        .settings .version { margin:0 0 24px; color:#b2b2b8; font-size:12px; }
        .setting { display:flex; align-items:flex-start; gap:12px; margin:0 0 20px; cursor:pointer; }
        .setting input { flex:none; width:16px; height:16px; margin:3px 0 0; accent-color:#dedee3; }
        .setting strong { display:block; font-weight:600; }
        .setting small { display:block; margin-top:4px; color:#b2b2b8; font-size:13px; }
        .settings h3 { margin:24px 0 4px; font-size:14px; font-weight:600; }
        .settings p { margin:0 0 12px; color:#b2b2b8; font-size:13px; }
        .settings button { min-height:36px; padding:7px 14px; border:0; border-radius:6px; font:600 13px 'Segoe UI',system-ui,sans-serif; background:#303035; color:#f5f5f7; cursor:pointer; }
        .settings button:hover { background:#404047; }
        .settings button:disabled { opacity:.5; cursor:default; }
        .settings :focus-visible { outline:2px solid #dedee3; outline-offset:3px; }
        .settings footer { display:flex; justify-content:flex-end; margin-top:24px; }
        .settings footer button { background:#f5f5f7; color:#101011; }
        .settings footer button:hover { background:#dedee3; }
        .settings .feedback { margin:12px 0 0; min-height:20px; }
        ::selection { background:#dedee3; color:#101011; }
        @media (prefers-reduced-motion:reduce) {
          .bar,:host([open]) .bar,.dropdown,:host([menu-open]) .dropdown { transform:none; transition:opacity 80ms ease-out; }
          .menu svg { transition:none; }
        }
      </style>
      <div class="bar" role="toolbar" aria-label="Desktop window controls">
        <button class="menu" data-action="menu" aria-label="Everglow menu (Ctrl+Shift+M)" aria-haspopup="menu" aria-expanded="false"><span>Everglow</span><span class="update-dot" hidden aria-hidden="true"></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg></button>
        <div class="drag" title="Drag to move · Double-click to maximize"><span class="status"></span></div>
        <button data-action="minimize" aria-label="Minimize" title="Minimize"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
        <button data-action="maximize" aria-label="Maximize" title="Maximize"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9"/></svg></button>
        <button class="close" data-action="close" aria-label="Close" title="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>
      </div>
      <div class="dropdown" role="menu" aria-label="Everglow options">
        <button class="menu-item" role="menuitem" data-menu="home"><span class="icon-slot"></span><span class="label">Home</span><span class="shortcut">Alt+Home</span></button>
        <button class="menu-item" role="menuitem" data-menu="reload"><span class="icon-slot"></span><span class="label">Refresh Everglow</span><span class="shortcut">Ctrl+R</span></button>
        <button class="menu-item" role="menuitem" data-menu="fullscreen"><span class="icon-slot"></span><span class="label">Fullscreen</span><span class="shortcut">F11</span></button>
        <div class="separator" role="separator"></div>
        <button class="menu-item" role="menuitemcheckbox" data-menu="adblock" data-action="adblock" aria-checked="true"><span class="icon-slot"><svg class="check-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.5 3.5 6.5-7"/></svg></span><span class="label">Block ads and trackers</span><span class="shortcut">Ctrl+Shift+B</span></button>
        <button class="menu-item" role="menuitem" data-menu="status"><span class="icon-slot"></span><span class="label">Protection status</span></button>
        <button class="menu-item" role="menuitem" data-menu="check_updates"><span class="icon-slot"></span><span class="label">Check for Updates…</span></button>
        <p class="update-status" role="status" hidden></p>
        <button class="menu-item" role="menuitem" data-menu="settings"><span class="icon-slot"></span><span class="label">Desktop settings…</span></button>
        <div class="separator" role="separator"></div>
        <button class="menu-item" role="menuitem" data-menu="close"><span class="icon-slot"></span><span class="label">Close Everglow</span></button>
      </div>
      <dialog class="settings" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Desktop settings</h2>
        <p class="version">Everglow Desktop __VERSION__</p>
        <label class="setting"><input type="checkbox" name="titlebar"><span><strong>Always show title bar</strong><small>Keep window controls visible over the page. Fullscreen stays distraction-free.</small></span></label>
        <label class="setting"><input type="checkbox" name="layout"><span><strong>Remember window layout</strong><small>Reopen at your last size and position, including maximized windows.</small></span></label>
        <h3>Cached files</h3>
        <p>Clear downloaded page files if something looks out of date. Your sign-in and saved site data stay in place.</p>
        <button type="button" class="clear-cache">Clear cached files</button>
        <p class="feedback" role="status" aria-live="polite"></p>
        <footer><button type="button" class="settings-done">Done</button></footer>
      </dialog>`;
    const bar = root.querySelector('.bar');
    const menuBtn = root.querySelector('.menu');
    const dropdown = root.querySelector('.dropdown');
    const settings = root.querySelector('.settings');
    let pinned = false;
    let updateAction = 'check';
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
      closeMenu();
      if (pinned && !host.hasAttribute('fullscreen')) { open(); return; }
      host.removeAttribute('open');
      bar.inert = true;
    };
    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!atEdge && !menuOpen && !host.matches(':hover') && !root.activeElement?.matches(':focus-visible')) hide();
      }, 250);
    };
    const openMenu = () => {
      dropdown.inert = false;
      menuOpen = true;
      host.setAttribute('menu-open', '');
      dropdown.setAttribute('open', '');
      menuBtn.setAttribute('aria-expanded', 'true');
    };
    const closeMenu = (refocus = false) => {
      if (!menuOpen) return;
      menuOpen = false;
      dropdown.inert = true;
      host.removeAttribute('menu-open');
      dropdown.removeAttribute('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (refocus) menuBtn.focus();
      scheduleHide();
    };
    const toggleMenu = () => {
      if (menuOpen) closeMenu();
      else openMenu();
    };
    const openSettings = () => {
      closeMenu();
      if (!settings.open) settings.showModal();
    };
    root.querySelector('.settings-done').addEventListener('click', () => settings.close());
    settings.addEventListener('close', () => { open(); menuBtn.focus(); });
    settings.addEventListener('change', event => {
      if (event.target.matches('input')) send(`settings:${event.target.name}`);
    });
    root.querySelector('.clear-cache').addEventListener('click', () => send('settings:clear-cache'));
    window.addEventListener('everglow-open-settings', openSettings);
    window.addEventListener('everglow-open-menu', () => { open(); openMenu(); menuBtn.focus(); });
    window.addEventListener('everglow-cache-status', event => {
      root.querySelector('.feedback').textContent = event.detail;
      root.querySelector('.clear-cache').disabled = event.detail.startsWith('Clearing');
    });
    window.addEventListener('everglow-settings-error', event => { root.querySelector('.feedback').textContent = event.detail; });

    host.addEventListener('pointerenter', open);
    window.addEventListener('everglow-top-edge', event => {
      atEdge = event.detail;
      if (atEdge) open(); else scheduleHide();
    });
    host.addEventListener('pointerleave', scheduleHide);
    root.addEventListener('focusout', event => {
      scheduleHide();
      if (menuOpen && !root.contains(event.relatedTarget)) {
        closeMenu();
      }
    });

    window.addEventListener('pointerdown', event => {
      if (menuOpen && !event.composedPath().includes(host)) {
        closeMenu();
      }
    }, true);

    root.addEventListener('click', event => {
      const btn = event.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const menuAction = btn.dataset.menu;
      if (action === 'menu') {
        toggleMenu();
        return;
      }
      if (menuAction) {
        if (menuAction === 'check_updates') {
          if (updateAction === 'check') send('menu:check_updates');
          else send(`update:${updateAction}`);
          return;
        }
        closeMenu();
        if (menuAction === 'settings') openSettings();
        else if (menuAction === 'close') send('close');
        else send(`menu:${menuAction}`);
        return;
      }
      if (action) {
        closeMenu();
        send(action);
      }
    });

    dropdown.addEventListener('keydown', event => {
      const items = Array.from(dropdown.querySelectorAll('.menu-item'));
      const index = items.indexOf(root.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    });

    menuBtn.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        if (!menuOpen) {
          event.preventDefault();
          openMenu();
          dropdown.querySelector('.menu-item')?.focus();
        }
      }
    });

    const drag = root.querySelector('.drag');
    drag.addEventListener('mousedown', event => { if (event.button === 0 && event.detail === 1) send('drag'); });
    drag.addEventListener('dblclick', () => send('maximize'));
    window.addEventListener('everglow-menu-closed', () => { closeMenu(); });
    window.addEventListener('everglow-window-state', event => {
      host.toggleAttribute('fullscreen', event.detail.fullscreen);
      if (event.detail.fullscreen) { if (settings.open) settings.close(); hide(); }
      if (event.detail.preferences) {
        pinned = event.detail.preferences.alwaysShowTitlebar;
        root.querySelector('[name="titlebar"]').checked = pinned;
        root.querySelector('[name="layout"]').checked = event.detail.preferences.rememberLayout;
        if (pinned) open(); else scheduleHide();
      }
      if (event.detail.update) {
        const update = event.detail.update;
        updateAction = update.action || 'check';
        const button = root.querySelector('[data-menu="check_updates"]');
        button.querySelector('.label').textContent = updateAction === 'install' ? 'Restart to update' : updateAction === 'download' ? 'Download update' : 'Check for Updates…';
        button.disabled = ['checking', 'downloading', 'installing'].includes(update.phase);
        button.setAttribute('aria-disabled', String(button.disabled));
        root.querySelector('.update-dot').hidden = !['available', 'ready'].includes(update.phase);
        const status = root.querySelector('.update-status');
        status.textContent = update.message;
        status.hidden = !update.message;
      }
      const maximize = root.querySelector('[data-action="maximize"]');
      const label = event.detail.maximized ? 'Restore' : 'Maximize';
      maximize.setAttribute('aria-label', label);
      maximize.title = label;
      root.querySelector('.status').textContent = event.detail.title?.replace(/^Everglow Desktop\s*[—-]?\s*/, '') || '';

      const isAdblock = event.detail.adblock !== undefined
        ? event.detail.adblock
        : !event.detail.title?.includes('adblock paused');
      const adblockItem = root.querySelector('[data-menu="adblock"]');
      if (adblockItem) {
        adblockItem.setAttribute('aria-checked', String(isAdblock));
      }
    });

    document.addEventListener('keydown', event => {
      if (settings.open) return;
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyM') {
        event.preventDefault();
        previousFocus = document.activeElement;
        open();
        menuBtn.focus();
      } else if (event.key === 'Escape') {
        if (menuOpen) {
          event.preventDefault();
          closeMenu(true);
        } else if (host.hasAttribute('open')) {
          previousFocus?.focus();
          hide();
        }
      }
    });
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) hide(); });
    hide();
    dropdown.inert = true;
    document.documentElement.append(host);
    send('state');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
