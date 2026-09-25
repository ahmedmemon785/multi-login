# Architecture

## Stack
- **Electron 44** — `BrowserWindow` for the UI shell, one `BrowserView` per session
- **Node.js** — main process only, plain CommonJS, no bundler
- **Vanilla JS/HTML/CSS** — renderer, no framework
- **electron-builder** — packages to a portable Windows `.exe`

---

## File Map

| File | Process | Role |
|------|---------|------|
| `main.js` | Main | Window and `BrowserView` lifecycle, all IPC handlers, permissions, translation, context menu |
| `preload.js` | Preload (main window) | `contextBridge` — exposes `window.api` to the renderer |
| `view-preload.js` | Preload (each session's `BrowserView`) | Bridges page-world `Notification` calls back to the main process |
| `renderer.js` | Renderer | Sidebar UI, modals, all user interaction |
| `index.html` | Renderer | Shell HTML — sidebar, modals, toast container |
| `styles.css` | Renderer | All styles |
| `package.json` | — | Scripts, electron-builder config, dependencies |

---

## Decision records

### Why `BrowserView` instead of `<webview>`
`<webview>` tags run inside the renderer process and share its content-security policy, which fights with per-site CSPs (Stripe, Discord, etc. all set restrictive ones). `BrowserView` is a separate OS-level compositor layer with its own `webContents`, so each site gets an isolated, unrestricted rendering context. The trade-off: it draws *above* the `BrowserWindow` regardless of z-index, so any in-app modal has to explicitly move the active view off-screen (`hide-view`/`show-view` IPC) before it can render on top.

### Why a session partition per session, not per site
Electron's `persist:<id>` session partitions are the actual isolation boundary — separate cookie jars, separate `localStorage`, separate IndexedDB. Keying the partition by **session ID** rather than site ID is what lets you run two Stripe logins side by side with zero cross-contamination, which is the app's whole reason to exist. The partition name is stable across restarts and outlives the in-memory `BrowserView` object (`views[session.id]`), which is created lazily on first switch and destroyed only when the session itself is removed.

### Why notifications route through the main process
Chromium's `Notification` API inside a `BrowserView` shows an OS toast, but clicking it can't reach back into the app to switch sessions or focus the window — there's no such hook from page-world JS. `view-preload.js` exposes `window.__mlNotif.send()` via `contextBridge`; after every `did-finish-load`, an injected script overrides `window.Notification` in the page to call that bridge instead of the native constructor. The main process then owns the real `Notification` object, so its `click` handler can call `switchSession()` and focus the window — see `web-notification` in `main.js`.

### Why permissions are deny-by-default
Only `media`, `microphone`, `camera`, `fullscreen`, and `midi` are auto-granted (`AUTO_GRANT_PERMISSIONS` in `main.js`) — enough for WhatsApp voice notes and video calls. Everything else (geolocation, clipboard, etc.) is denied unless a future version adds a real per-site prompt. `notifications` is a special case: granted or denied per session based on that session's `muted` flag, checked live on every request rather than by swapping the whole handler.

### Why `will-navigate` excludes SSO domains
Sites often render outbound links (YouTube, Facebook videos) as plain `<a href>` with no `target="_blank"`, so they navigate the *current* `BrowserView* away from the site entirely rather than triggering `setWindowOpenHandler`. The app intercepts same-tab navigation to a different root domain and reopens it as a popup sharing the same session partition instead (`openLinkInSession`). The one place this would actively break things is a full-page OAuth redirect (Google/Microsoft/GitHub login) — those need to happen in the *same* tab to complete. `SSO_DOMAINS` is an explicit allowlist carved out of that interception.

### Why the user-agent is derived at runtime
`UA` reads `process.versions.chrome` instead of a hardcoded string. A UA that's stuck on a Chrome version from years ago is one of the easiest bot-detection signals a site like Stripe can check for — derived-at-runtime means it's never stale.

---

## Data Model (`config.json`)

Stored at `%APPDATA%\multi-login\config.json`:

```json
{
  "sites": [
    {
      "id": "site_1234567890",
      "name": "Discord",
      "url": "https://discord.com/app",
      "sessions": [
        { "id": "sess_1234567890", "label": "Work", "muted": false },
        { "id": "sess_1234567891", "label": "Personal" }
      ]
    }
  ]
}
```

- **Site** — a URL + display name (e.g. "Stripe")
- **Session** — a named login under a site; each gets its own isolated partition `persist:<session.id>`
- Legacy `accounts.json` (flat array, pre-multi-session format) is auto-migrated on first load

---

## IPC Channels

All `ipcMain.handle` ↔ `ipcRenderer.invoke` unless noted:

| Channel | Args | Returns | Notes |
|---------|------|---------|-------|
| `get-config` | — | `{ sites }` | Full config on boot |
| `switch-session` | `siteId, sessionId` | `sessionId \| null` | Shows/hides `BrowserView`s |
| `add-site` | `name, url` | `site` | |
| `rename-site` | `siteId, name` | `bool` | |
| `remove-site` | `siteId` | `bool` | Destroys all child `BrowserView`s |
| `add-session` | `siteId, label` | `session` | |
| `rename-session` | `sessionId, label` | `bool` | |
| `remove-session` | `sessionId` | `bool` | |
| `set-sidebar-width` | `width` | — | Recalculates `BrowserView` bounds |
| `hide-view` / `show-view` | — | — | Moves the active `BrowserView` off-screen for modals |
| `reload-session` / `hard-reload-session` | — | — | |
| `toggle-mute` | `sessionId` | `bool` | Persists to config, updates audio + notification permission |

**Main → Renderer push:**

| Channel | Payload | Purpose |
|---------|---------|---------|
| `session-loading` | `sessionId, bool` | Drives the loading dot in the sidebar |
| `session-activated` | `siteId, sessionId` | Fired when a notification click switches session |

**Renderer → Main, one-way:**

| Channel | Payload | Purpose |
|---------|---------|---------|
| `web-notification` | `{ title, body, icon, tag }` | Bridged from the overridden in-page `Notification` |

---

## `BrowserView` Layout

```
┌─────────────────────────────────────────────────┐
│ sidebar (250px)  │  BrowserView (rest)           │
│                  │  x=sidebarWidth, y=0          │
│                  │  w=windowW-sidebarWidth, h=windowH │
└─────────────────────────────────────────────────┘
```

- `sidebarWidth` is mutable — 250px expanded, 60px collapsed
- Each session's `BrowserView` is created **lazily** on first switch (`switchSession` → `createView`) and never destroyed until the session itself is removed
- Switching sessions hides the previous view (`setBounds(hideBounds())`) rather than destroying it, so background sessions keep running (notifications still fire)

---

## Key functions in `main.js`

| Function | What it does |
|----------|---------------|
| `loadConfig()` | Reads `config.json`, migrates legacy `accounts.json` |
| `createView(site, session)` | Creates the `BrowserView`, sets UA/permissions/headers, wires context menu + navigation interception |
| `switchSession(siteId, sessionId)` | Hides the old view, shows/creates the new one |
| `setupSessionPermissions(webContents, sessionId)` | Registers the deny-by-default permission handler for a session |
| `openLinkInSession(url, sessionId)` | Opens a URL in a popup sharing a given session's cookies (right-click "Open Link in Session", or auto-triggered by cross-domain `will-navigate`) |
| `translateText(text, targetLang)` / `showTranslation(...)` | Fetches a translation via `net.request` and shows it in a dialog |
| `updateTaskbarBadge()` | Renders an unread-count circle as an SVG `nativeImage` and sets it as the window's taskbar overlay icon |
| `applyMuteState(sessionId, muted)` | Mutes audio and blocks the notification permission for a session |

---

## Build

```bash
npm start        # dev — runs from source
npm run dist     # builds dist/Multi-Login.exe (portable)
```

Close any running instance of the app before building — Windows locks the exe of a running process, which will hang `electron-builder` on "output file is locked for writing."

---

## Known quirks

- **`BrowserView` z-order** — always above `BrowserWindow` content; modals require the hide/show dance described above
- **`BrowserView` is deprecated** upstream in favor of `WebContentsView`, but still functions correctly as of Electron 44 (verified: creation, `addBrowserView`, `setBounds`, `removeBrowserView` all work)
- **Session partition** — `persist:<session.id>` survives app restarts; removing a session destroys the in-memory `BrowserView` but partition data stays on disk under `%APPDATA%\multi-login\Partitions\`
- **Translation** — uses an unofficial Google Translate endpoint (no API key required), which Google could rate-limit or block without notice; it's a best-effort convenience feature, not a guarantee
