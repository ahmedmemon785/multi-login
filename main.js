const { app, BrowserWindow, BrowserView, ipcMain, Notification, nativeImage, Menu, MenuItem, shell, dialog, net } = require('electron');
const path  = require('path');
const fs    = require('fs');

const APP_NAME = 'Multi Login';

let sidebarWidth = 250;
let unreadCount  = 0;

let mainWindow      = null;
const views         = {};   // sessionId → BrowserView
const wcSessionMap  = {};   // webContents.id → sessionId
let activeSiteId    = null;
let activeSessionId = null;
let cfg             = { sites: [] };

// ── Config ───────────────────────────────────────────────────

function cfgPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function legacyPath() {
  return path.join(app.getPath('userData'), 'accounts.json');
}

function loadConfig() {
  try {
    // Migrate old flat accounts.json → new format
    if (!fs.existsSync(cfgPath()) && fs.existsSync(legacyPath())) {
      const old = JSON.parse(fs.readFileSync(legacyPath(), 'utf8'));
      if (Array.isArray(old)) {
        cfg = {
          sites: old.map(acct => ({
            id:       `site_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name:     acct.title || 'Account',
            url:      acct.url  || 'https://web.whatsapp.com',
            sessions: [{ id: acct.id, label: 'Main' }],
          })),
        };
        saveConfig();
        return;
      }
    }
    if (fs.existsSync(cfgPath())) {
      cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    }
  } catch { cfg = { sites: [] }; }
}

function saveConfig() {
  fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2));
}

// ── BrowserView helpers ──────────────────────────────────────

function viewBounds() {
  const [w, h] = mainWindow.getContentSize();
  return { x: sidebarWidth, y: 0, width: w - sidebarWidth, height: h };
}

function hideBounds() { return { x: 0, y: 0, width: 0, height: 0 }; }

function findSession(sessionId) {
  for (const site of cfg.sites) {
    const s = site.sessions.find(s => s.id === sessionId);
    if (s) return { site, session: s };
  }
  return null;
}

// Derived from the Chromium build Electron actually ships, so the UA and
// client hints never drift from reality (a stale hardcoded version is an
// easy bot-detection tell for sites like Stripe).
const CHROME_VERSION = process.versions.chrome;
const CHROME_MAJOR   = CHROME_VERSION.split('.')[0];
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ` +
           `AppleWebKit/537.36 (KHTML, like Gecko) ` +
           `Chrome/${CHROME_VERSION} Safari/537.36`;

// Full-page navigation to these domains during an OAuth/SSO flow is left alone
// instead of being redirected into a popup window.
const SSO_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'github.com',
  'facebook.com',
  'okta.com',
  'auth0.com',
];

// Permissions granted automatically — needed for core site functionality
// (voice notes, video calls, browser fullscreen video players).
const AUTO_GRANT_PERMISSIONS = new Set(['media', 'microphone', 'camera', 'fullscreen', 'midi']);

function setupSessionPermissions(webContents, sessionId) {
  const ses = webContents.session;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'notifications') {
      const found = findSession(sessionId);
      return callback(!(found && found.session.muted));
    }
    if (AUTO_GRANT_PERMISSIONS.has(permission)) return callback(true);
    // Everything else (geolocation, clipboard-read, etc.) is denied by default.
    callback(false);
  });
  ses.setPermissionCheckHandler((wc, permission) =>
    AUTO_GRANT_PERMISSIONS.has(permission)
  );
}

function applyMuteState(sessionId, muted) {
  const view = views[sessionId];
  if (!view) return;
  view.webContents.setAudioMuted(!!muted);
  // Permission handler reads muted flag from config dynamically — no reset needed
}

function updateTaskbarBadge() {
  if (!mainWindow) return;
  if (unreadCount <= 0) {
    mainWindow.setOverlayIcon(null, '');
    return;
  }
  const label = unreadCount > 99 ? '99+' : String(unreadCount);
  const fontSize = label.length > 2 ? 28 : 34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <circle cx="32" cy="32" r="32" fill="#e53935"/>
    <text x="32" y="32" dy=".35em" text-anchor="middle"
          font-family="system-ui,sans-serif" font-size="${fontSize}"
          font-weight="bold" fill="#ffffff">${label}</text>
  </svg>`;
  const img = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  );
  mainWindow.setOverlayIcon(img, `${unreadCount} unread`);
}

function openLinkInSession(url, sessionId) {
  const found = findSession(sessionId);
  if (!found) return;
  const win = new BrowserWindow({
    width: 960, height: 720,
    autoHideMenuBar: true,
    title: `${found.session.label} — ${found.site.name}`,
    webPreferences: {
      partition: `persist:${sessionId}`,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setUserAgent(UA);
  setupSessionPermissions(win.webContents, sessionId);
  win.loadURL(url);
}


const LANGUAGES = [
  { label: 'English',    code: 'en' },
  { label: 'Arabic',     code: 'ar' },
  { label: 'French',     code: 'fr' },
  { label: 'Spanish',    code: 'es' },
  { label: 'German',     code: 'de' },
  { label: 'Chinese',    code: 'zh-CN' },
  { label: 'Japanese',   code: 'ja' },
  { label: 'Korean',     code: 'ko' },
  { label: 'Portuguese', code: 'pt' },
  { label: 'Russian',    code: 'ru' },
  { label: 'Turkish',    code: 'tr' },
  { label: 'Italian',    code: 'it' },
  { label: 'Hindi',      code: 'hi' },
  { label: 'Urdu',       code: 'ur' },
];

function translateText(text, targetLang) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const req = net.request({ url, method: 'GET' });
    req.setHeader('User-Agent', UA);
    const chunks = [];
    req.on('response', res => {
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const translated = json[0].map(s => s[0]).filter(Boolean).join('');
          const detected   = json[2] || 'auto';
          resolve({ translated, detected });
        } catch { reject(new Error('Could not parse response')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function showTranslation(text, targetLang, targetLabel) {
  translateText(text, targetLang).then(({ translated, detected }) => {
    dialog.showMessageBox(mainWindow, {
      type: 'none',
      title: `Translated to ${targetLabel}`,
      message: translated,
      detail: `From: ${detected.toUpperCase()}  •  Original: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`,
      buttons: ['OK'],
    });
  }).catch(() => {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Translation failed',
      message: 'Could not reach Google Translate. Check your internet connection.',
      buttons: ['OK'],
    });
  });
}

function createView(site, session) {
  const view = new BrowserView({
    webPreferences: {
      partition: `persist:${session.id}`,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, 'view-preload.js'),
    },
  });
  view.webContents.setUserAgent(UA);
  setupSessionPermissions(view.webContents, session.id);

  // Strip Electron-specific client-hint headers so sites like Stripe see real Chrome
  view.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const h = details.requestHeaders;
    h['sec-ch-ua']          = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not-A.Brand";v="99"`;
    h['sec-ch-ua-mobile']   = '?0';
    h['sec-ch-ua-platform'] = '"Windows"';
    delete h['sec-ch-ua-full-version-list'];
    callback({ requestHeaders: h });
  });

  view.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 960, height: 720,
      autoHideMenuBar: true,
      title: APP_NAME,
      webPreferences: {
        partition: `persist:${session.id}`,
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  }));

  // Configure every popup window that gets created (user-agent, permissions)
  view.webContents.on('did-create-window', (win) => {
    win.webContents.setUserAgent(UA);
    setupSessionPermissions(win.webContents, session.id);
  });

  view.webContents.loadURL(site.url);

  view.webContents.on('did-start-loading', () => {
    if (mainWindow) mainWindow.webContents.send('session-loading', session.id, true);
  });
  view.webContents.on('did-stop-loading', () => {
    if (mainWindow) mainWindow.webContents.send('session-loading', session.id, false);
  });

  // Intercept same-tab cross-domain navigation (e.g. YouTube/Facebook links in WhatsApp)
  // and open them as a popup in the same session instead of navigating away.
  // Identity-provider domains are excluded so full-page SSO redirects (Google,
  // Microsoft, Apple, GitHub, Facebook login) complete normally.
  view.webContents.on('will-navigate', (e, url) => {
    try {
      const destHost = new URL(url).hostname;
      if (SSO_DOMAINS.some(d => destHost === d || destHost.endsWith('.' + d))) return;

      const getRoot = u => new URL(u).hostname.split('.').slice(-2).join('.');
      if (getRoot(url) !== getRoot(site.url)) {
        e.preventDefault();
        openLinkInSession(url, session.id);
      }
    } catch {}
  });

  view.webContents.on('context-menu', (e, params) => {
    const menu = new Menu();

    // Spell-check suggestions
    if (params.misspelledWord) {
      if (params.dictionarySuggestions && params.dictionarySuggestions.length) {
        params.dictionarySuggestions.forEach(s => {
          menu.append(new MenuItem({
            label: s,
            click: () => view.webContents.replaceMisspelling(s),
          }));
        });
      } else {
        menu.append(new MenuItem({ label: 'No spelling suggestions', enabled: false }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Link actions
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: 'Open in External Browser',
        click: () => shell.openExternal(params.linkURL),
      }));
      const sessionSub = new Menu();
      for (const s of cfg.sites) {
        for (const sess of s.sessions) {
          sessionSub.append(new MenuItem({
            label: `${s.name}  ›  ${sess.label}`,
            click: () => openLinkInSession(params.linkURL, sess.id),
          }));
        }
      }
      menu.append(new MenuItem({ label: 'Open Link in Session', submenu: sessionSub }));
      menu.append(new MenuItem({ label: 'Copy Link', click: () => { require('electron').clipboard.writeText(params.linkURL); } }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Text selection
    if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      const translateSub = new Menu();
      LANGUAGES.forEach(lang => {
        translateSub.append(new MenuItem({
          label: lang.label,
          click: () => showTranslation(params.selectionText, lang.code, lang.label),
        }));
      });
      menu.append(new MenuItem({ label: 'Translate Selection', submenu: translateSub }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Image
    if (params.mediaType === 'image' && params.srcURL) {
      menu.append(new MenuItem({ label: 'Copy Image URL', click: () => { require('electron').clipboard.writeText(params.srcURL); } }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Navigation & dev
    menu.append(new MenuItem({ label: 'Back',    enabled: view.webContents.canGoBack(),    click: () => view.webContents.goBack() }));
    menu.append(new MenuItem({ label: 'Forward', enabled: view.webContents.canGoForward(), click: () => view.webContents.goForward() }));
    menu.append(new MenuItem({ label: 'Reload',  click: () => view.webContents.reload() }));
    const translatePageSub = new Menu();
    LANGUAGES.forEach(lang => {
      translatePageSub.append(new MenuItem({
        label: lang.label,
        click: () => shell.openExternal(`https://translate.google.com/translate?sl=auto&tl=${lang.code}&u=${encodeURIComponent(view.webContents.getURL())}`),
      }));
    });
    menu.append(new MenuItem({ label: 'Translate Page', submenu: translatePageSub }));

    menu.popup({ window: mainWindow });
  });

  mainWindow.addBrowserView(view);
  view.setBounds(hideBounds());
  views[session.id]              = view;
  wcSessionMap[view.webContents.id] = session.id;

  // Inject Notification override after every page load
  view.webContents.on('did-finish-load', () => {
    view.webContents.executeJavaScript(`(function(){
      if (!window.__mlNotif) return;
      const _N = window.Notification;
      function MLNotification(title, opts) {
        opts = opts || {};
        window.__mlNotif.send({ title: title, body: opts.body || '', icon: opts.icon || '', tag: opts.tag || '' });
        return { onclick: null, onshow: null, onclose: null, onerror: null, close: function(){} };
      }
      MLNotification.permission = 'granted';
      MLNotification.requestPermission = function(){ return Promise.resolve('granted'); };
      Object.defineProperty(MLNotification, 'permission', { get: function(){ return 'granted'; } });
      window.Notification = MLNotification;
    })()`).catch(() => {});
  });

  if (session.muted) applyMuteState(session.id, true);
  return view;
}

function switchSession(siteId, sessionId) {
  if (activeSessionId && views[activeSessionId]) {
    views[activeSessionId].setBounds(hideBounds());
  }
  activeSiteId    = siteId    || null;
  activeSessionId = sessionId || null;
  if (!sessionId) return null;

  const found = findSession(sessionId);
  if (!found) return null;
  if (!views[sessionId]) createView(found.site, found.session);
  views[sessionId].setBounds(viewBounds());
  return sessionId;
}

// ── App menu ─────────────────────────────────────────────────

function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: APP_NAME,
              detail:
                `Run isolated sessions of any web app side by side — WhatsApp, Stripe, ` +
                `Discord, hosting panels — each with its own cookies and login.\n\n` +
                `Version ${app.getVersion()}\n\n` +
                `Built by Ahmed Memon — senior backend developer, available for freelance work.\n` +
                `  Website:  https://www.digisysalpha.com/\n` +
                `  GitHub:   https://github.com/ahmedmemon785/\n` +
                `  LinkedIn: https://www.linkedin.com/in/mohammad-ahmed-033aa198/\n` +
                `  Email:    ahmedmemon785@gmail.com`,
              buttons: ['OK', 'Open GitHub'],
            }).then(({ response }) => {
              if (response === 1) shell.openExternal('https://github.com/ahmedmemon785/multi-login');
            });
          },
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/ahmedmemon785/multi-login/issues'),
        },
        {
          label: 'Hire the Developer',
          click: () => shell.openExternal('https://www.digisysalpha.com/'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Window ───────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0b1014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    title: APP_NAME,
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('resize', () => {
    if (activeSessionId && views[activeSessionId]) {
      views[activeSessionId].setBounds(viewBounds());
    }
  });
  mainWindow.on('focus', () => {
    unreadCount = 0;
    updateTaskbarBadge();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ──────────────────────────────────────────────────────

ipcMain.handle('get-config', () => cfg);

ipcMain.handle('switch-session', (_, siteId, sessionId) =>
  switchSession(siteId, sessionId)
);

// Sites
ipcMain.handle('add-site', (_, name, url) => {
  const site = { id: `site_${Date.now()}`, name, url, sessions: [] };
  cfg.sites.push(site);
  saveConfig();
  return site;
});

ipcMain.handle('rename-site', (_, siteId, name) => {
  const site = cfg.sites.find(s => s.id === siteId);
  if (!site) return false;
  site.name = name;
  saveConfig();
  return true;
});

ipcMain.handle('remove-site', (_, siteId) => {
  const idx = cfg.sites.findIndex(s => s.id === siteId);
  if (idx === -1) return false;
  for (const sess of cfg.sites[idx].sessions) {
    if (views[sess.id]) {
      delete wcSessionMap[views[sess.id].webContents.id];
      mainWindow.removeBrowserView(views[sess.id]);
      views[sess.id].webContents.destroy();
      delete views[sess.id];
    }
  }
  cfg.sites.splice(idx, 1);
  saveConfig();
  if (activeSiteId === siteId) { activeSiteId = null; activeSessionId = null; }
  return true;
});

// Sessions
ipcMain.handle('add-session', (_, siteId, label) => {
  const site = cfg.sites.find(s => s.id === siteId);
  if (!site) return null;
  const session = { id: `sess_${Date.now()}`, label };
  site.sessions.push(session);
  saveConfig();
  return session;
});

ipcMain.handle('rename-session', (_, sessionId, label) => {
  const found = findSession(sessionId);
  if (!found) return false;
  found.session.label = label;
  saveConfig();
  return true;
});

ipcMain.handle('remove-session', (_, sessionId) => {
  for (const site of cfg.sites) {
    const idx = site.sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) {
      site.sessions.splice(idx, 1);
      saveConfig();
      if (views[sessionId]) {
        delete wcSessionMap[views[sessionId].webContents.id];
        mainWindow.removeBrowserView(views[sessionId]);
        views[sessionId].webContents.destroy();
        delete views[sessionId];
      }
      if (activeSessionId === sessionId) activeSessionId = null;
      return true;
    }
  }
  return false;
});

ipcMain.handle('set-sidebar-width', (_, w) => {
  sidebarWidth = w;
  if (activeSessionId && views[activeSessionId]) {
    views[activeSessionId].setBounds(viewBounds());
  }
});

// Modal overlay helpers (hide/restore active BrowserView so modals are visible)
ipcMain.handle('hide-view', () => {
  if (activeSessionId && views[activeSessionId])
    views[activeSessionId].setBounds(hideBounds());
});
ipcMain.handle('show-view', () => {
  if (activeSessionId && views[activeSessionId])
    views[activeSessionId].setBounds(viewBounds());
});

ipcMain.handle('reload-session', () => {
  if (activeSessionId && views[activeSessionId])
    views[activeSessionId].webContents.reload();
});

ipcMain.handle('hard-reload-session', () => {
  if (activeSessionId && views[activeSessionId])
    views[activeSessionId].webContents.reloadIgnoringCache();
});

ipcMain.handle('toggle-mute', (_, sessionId) => {
  const found = findSession(sessionId);
  if (!found) return null;
  found.session.muted = !found.session.muted;
  saveConfig();
  applyMuteState(sessionId, found.session.muted);
  return found.session.muted;
});

// ── Web notification click → focus + switch session ──────────

ipcMain.on('web-notification', (event, data) => {
  const sessionId = wcSessionMap[event.sender.id];
  if (!sessionId) return;

  const found = findSession(sessionId);
  if (!found) return;

  const notif = new Notification({
    title: data.title || found.session.label,
    body:  data.body  || '',
    silent: false,
  });

  notif.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    unreadCount = 0;
    updateTaskbarBadge();
    switchSession(found.site.id, sessionId);
    mainWindow.webContents.send('session-activated', found.site.id, sessionId);
  });

  unreadCount++;
  updateTaskbarBadge();
  notif.show();
});

// ── Lifecycle ────────────────────────────────────────────────

app.whenReady().then(() => { loadConfig(); buildAppMenu(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });
