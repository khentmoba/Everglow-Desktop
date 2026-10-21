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
        .update-dot { width:7px; height:7px; border-radius:50%; background:#ff5e7e; box-shadow:0 0 8px #f43f5e; }
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
        .update-dialog {
          box-sizing: border-box;
          width: min(440px, calc(100vw - 32px));
          max-width: 440px;
          max-height: calc(100vh - 48px);
          overflow: auto;
          padding: 28px 24px 24px;
          border: 1px solid rgba(255, 120, 160, 0.22);
          border-radius: 22px;
          background: linear-gradient(165deg, rgba(38, 18, 44, 0.96) 0%, rgba(20, 9, 24, 0.98) 100%);
          color: #f5f5f7;
          font: 14px/1.5 'Segoe UI', system-ui, sans-serif;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 32px rgba(244, 63, 94, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          color-scheme: dark;
          text-align: center;
          position: fixed;
          inset: 0;
          margin: auto;
          outline: none;
        }
        .update-dialog[open] {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .update-dialog::backdrop {
          background: rgba(10, 4, 14, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .update-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          color: #bfaec2;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
          padding: 0;
        }
        .update-close:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
        }
        .update-close:focus-visible {
          outline: 2px solid #ff7597;
          outline-offset: 2px;
        }
        .update-close svg {
          width: 12px;
          height: 12px;
          stroke: currentColor;
          stroke-width: 2;
          fill: none;
        }
        .update-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(236, 72, 153, 0.15) 100%);
          border: 1.5px solid rgba(244, 63, 94, 0.45);
          box-shadow: 0 0 24px rgba(244, 63, 94, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          color: #ff7597;
        }
        .update-icon-wrapper svg {
          width: 26px;
          height: 26px;
          stroke: currentColor;
          stroke-width: 2;
          fill: none;
        }
        .update-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          background: rgba(244, 63, 94, 0.15);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #ff94b4;
          margin-bottom: 12px;
        }
        .update-heading {
          margin: 0 0 8px;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #fff0f5;
        }
        .update-description {
          margin: 0 0 8px;
          font-size: 13.5px;
          line-height: 1.5;
          color: #d6c6d9;
          max-width: 360px;
        }
        .update-subtext {
          margin: 0 0 20px;
          font-size: 12px;
          line-height: 1.45;
          color: #9d8c9f;
          max-width: 340px;
        }
        .update-progress-container {
          width: 100%;
          margin-bottom: 20px;
        }
        .update-progress-bar {
          height: 8px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .update-progress-fill {
          height: 100%;
          border-radius: 9999px;
          background: linear-gradient(90deg, #ff4d6d, #f43f5e, #ec4899);
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.6);
          transition: width 200ms ease;
        }
        .update-progress-text {
          font-size: 12px;
          color: #ff94b4;
          margin-top: 8px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        .update-actions {
          display: flex;
          gap: 12px;
          width: 100%;
          justify-content: center;
          flex-wrap: wrap;
        }
        .update-btn-primary {
          min-height: 38px;
          padding: 8px 22px;
          border: 0;
          border-radius: 9999px;
          background: linear-gradient(135deg, #ff5e7e 0%, #f43f5e 50%, #e11d48 100%);
          color: #ffffff;
          font: 600 13.5px 'Segoe UI', system-ui, sans-serif;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(244, 63, 94, 0.4);
          transition: all 140ms ease-out;
          outline: none;
        }
        .update-btn-primary:hover {
          background: linear-gradient(135deg, #ff7593 0%, #fb7185 50%, #f43f5e 100%);
          box-shadow: 0 6px 22px rgba(244, 63, 94, 0.6);
          transform: translateY(-1px);
        }
        .update-btn-primary:focus-visible {
          outline: 2px solid #ff7597;
          outline-offset: 3px;
        }
        .update-btn-secondary {
          min-height: 38px;
          padding: 8px 20px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          color: #e8dbe8;
          font: 600 13.5px 'Segoe UI', system-ui, sans-serif;
          cursor: pointer;
          transition: all 140ms ease-out;
          outline: none;
        }
        .update-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
        }
        .update-btn-secondary:focus-visible {
          outline: 2px solid #dedee3;
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion:reduce) {
          .update-dialog, .update-btn-primary, .update-progress-fill { transition:none; transform:none; }
        }
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
      </dialog>
      <dialog class="update-dialog" aria-labelledby="update-title" aria-describedby="update-desc">
        <button type="button" class="update-close" aria-label="Close" title="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
        </button>
        <div class="update-icon-wrapper" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v13m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
        </div>
        <div class="update-chip"><span class="chip-sparkle">✨</span> <span class="chip-text">Update Available</span></div>
        <h2 id="update-title" class="update-heading">Everglow Desktop</h2>
        <p id="update-desc" class="update-description">A new version of Everglow Desktop is available.</p>
        <p class="update-subtext">Keep watching; downloading happens in the background without restarting.</p>
        <div class="update-progress-container" hidden>
          <div class="update-progress-bar"><div class="update-progress-fill" style="width:0%"></div></div>
          <div class="update-progress-text">Downloading… 0%</div>
        </div>
        <div class="update-actions">
          <button type="button" class="update-btn-secondary">Later</button>
          <button type="button" class="update-btn-primary">Download update</button>
        </div>
      </dialog>`;
    const bar = root.querySelector('.bar');
    const menuBtn = root.querySelector('.menu');
    const dropdown = root.querySelector('.dropdown');
    const settings = root.querySelector('.settings');
    const updateDialog = root.querySelector('.update-dialog');
    const updateTitle = root.querySelector('#update-title');
    const updateDesc = root.querySelector('#update-desc');
    const updateSubtext = root.querySelector('.update-subtext');
    const updateChipText = root.querySelector('.chip-text');
    const updateProgressContainer = root.querySelector('.update-progress-container');
    const updateProgressFill = root.querySelector('.update-progress-fill');
    const updateProgressText = root.querySelector('.update-progress-text');
    const updateBtnPrimary = root.querySelector('.update-btn-primary');
    const updateBtnSecondary = root.querySelector('.update-btn-secondary');
    const updateCloseBtn = root.querySelector('.update-close');
    const updateIconWrapper = root.querySelector('.update-icon-wrapper');
    let currentUpdate = null;
    let dismissedUpdateKey = null;

    const renderUpdatePrompt = update => {
      if (!update) return;
      const version = update.version || '';
      const phase = update.phase;
      const progress = update.progress ?? null;

      updateProgressContainer.hidden = true;
      updateBtnSecondary.hidden = false;
      updateBtnPrimary.hidden = false;
      updateBtnPrimary.disabled = false;

      if (phase === 'available') {
        updateChipText.textContent = 'Update Available';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v13m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`;
        updateTitle.textContent = version ? `Everglow Desktop ${version}` : 'New Update Available';
        updateDesc.textContent = version ? `Everglow Desktop ${version} is available. Download when you’re ready.` : 'A new update is available for Everglow Desktop.';
        updateSubtext.textContent = 'Keep watching; downloading happens in the background without restarting.';
        updateBtnPrimary.textContent = 'Download update';
        updateBtnSecondary.textContent = 'Later';
      } else if (phase === 'downloading') {
        updateChipText.textContent = 'Downloading';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v13m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`;
        updateTitle.textContent = version ? `Downloading ${version}…` : 'Downloading update…';
        updateDesc.textContent = update.message || 'Downloading update… Keep watching; nothing will restart.';
        updateSubtext.textContent = 'You can safely keep browsing or watching movies.';
        updateProgressContainer.hidden = false;
        const percent = progress !== null ? Math.min(100, Math.max(0, progress)) : 0;
        updateProgressFill.style.width = `${percent}%`;
        updateProgressText.textContent = progress !== null ? `Downloading: ${percent}%` : 'Downloading…';
        updateBtnPrimary.hidden = true;
        updateBtnSecondary.textContent = 'Keep watching in background';
      } else if (phase === 'ready') {
        updateChipText.textContent = 'Update Ready';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg>`;
        updateTitle.textContent = version ? `Everglow Desktop ${version}` : 'Update Ready to Install';
        updateDesc.textContent = version ? `Everglow Desktop ${version} is downloaded and verified. Restart to install it?` : 'Desktop update is downloaded and verified. Restart to install it?';
        updateSubtext.textContent = 'Choose Later to keep watching. Use Check for Updates when you are ready.';
        updateBtnPrimary.textContent = 'Restart to update';
        updateBtnSecondary.textContent = 'Later';
      } else if (phase === 'checking') {
        updateChipText.textContent = 'Checking';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
        updateTitle.textContent = 'Checking for updates…';
        updateDesc.textContent = 'Looking for the latest version of Everglow Desktop…';
        updateSubtext.textContent = 'Checking GitHub releases and signatures…';
        updateBtnPrimary.hidden = true;
        updateBtnSecondary.textContent = 'Cancel';
      } else if (phase === 'current') {
        updateChipText.textContent = 'Up to Date';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><path d="m12 2 2.8 6.2 6.7.6-5 4.6 1.4 6.6-5.9-3.4-5.9 3.4 1.4-6.6-5-4.6 6.7-.6z"/></svg>`;
        updateTitle.textContent = 'You’re on the latest version';
        updateDesc.textContent = 'You’re enjoying the newest features and protections in Everglow Desktop.';
        updateSubtext.textContent = 'Automatic checks will let you know when the next update arrives.';
        updateBtnSecondary.hidden = true;
        updateBtnPrimary.textContent = 'Done';
      } else if (phase === 'error') {
        updateChipText.textContent = 'Notice';
        updateIconWrapper.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>`;
        updateTitle.textContent = 'Could not check for updates';
        updateDesc.textContent = update.message || 'Could not complete the update. Your current app is unchanged.';
        updateSubtext.textContent = 'Please check your internet connection and try again later.';
        updateBtnSecondary.hidden = true;
        updateBtnPrimary.textContent = 'Done';
      }
    };

    const openUpdateDialog = () => {
      if (host.hasAttribute('fullscreen')) return;
      if (!updateDialog.open) {
        if (settings.open) settings.close();
        closeMenu();
        updateDialog.showModal();
      }
      renderUpdatePrompt(currentUpdate);
    };

    const closeUpdateDialog = (userDismissed = false) => {
      if (updateDialog.open) {
        updateDialog.close();
      }
      if (userDismissed && currentUpdate) {
        dismissedUpdateKey = `${currentUpdate.phase}:${currentUpdate.version || ''}`;
      }
    };

    updateBtnPrimary.addEventListener('click', () => {
      if (!currentUpdate) { closeUpdateDialog(); return; }
      const phase = currentUpdate.phase;
      if (phase === 'available') {
        send('update:download');
        renderUpdatePrompt({ ...currentUpdate, phase: 'downloading', progress: 0 });
      } else if (phase === 'ready') {
        send('update:install');
        renderUpdatePrompt({ ...currentUpdate, phase: 'installing' });
      } else {
        closeUpdateDialog();
      }
    });

    updateBtnSecondary.addEventListener('click', () => closeUpdateDialog(true));
    updateCloseBtn.addEventListener('click', () => closeUpdateDialog(true));
    updateDialog.addEventListener('cancel', () => closeUpdateDialog(true));
    window.addEventListener('everglow-open-update', openUpdateDialog);
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
          closeMenu();
          openUpdateDialog();
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
      if (event.detail.fullscreen) {
        if (settings.open) settings.close();
        if (updateDialog.open) updateDialog.close();
        hide();
      }
      if (event.detail.preferences) {
        pinned = event.detail.preferences.alwaysShowTitlebar;
        root.querySelector('[name="titlebar"]').checked = pinned;
        root.querySelector('[name="layout"]').checked = event.detail.preferences.rememberLayout;
        if (pinned) open(); else scheduleHide();
      }
      if (event.detail.update) {
        const update = event.detail.update;
        currentUpdate = update;
        updateAction = update.action || 'check';
        const button = root.querySelector('[data-menu="check_updates"]');
        button.querySelector('.label').textContent = updateAction === 'install' ? 'Restart to update' : updateAction === 'download' ? 'Download update' : 'Check for Updates…';
        button.disabled = ['checking', 'downloading', 'installing'].includes(update.phase);
        button.setAttribute('aria-disabled', String(button.disabled));
        root.querySelector('.update-dot').hidden = !['available', 'ready'].includes(update.phase);
        const status = root.querySelector('.update-status');
        status.textContent = update.message;
        status.hidden = !update.message;

        if (updateDialog.open) {
          renderUpdatePrompt(update);
        } else if (!host.hasAttribute('fullscreen') && !menuOpen) {
          const key = `${update.phase}:${update.version || ''}`;
          if (['available', 'ready'].includes(update.phase) && dismissedUpdateKey !== key) {
            openUpdateDialog();
          }
        }
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
      if (updateDialog.open) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeUpdateDialog(true);
        }
        return;
      }
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
