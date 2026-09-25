# Code Context — Multi Login

## Stack
- **Electron 28** — BrowserWindow for the UI shell, BrowserView per session
- **Node.js** — main process only (no bundler, plain CommonJS)
- **Vanilla JS/HTML/CSS** — renderer (no framework)
- **sql.js 1.14** — pure-WASM SQLite, used only for Chrome password import
- **electron-builder 24** — packages to a portable `.exe`

---

## File Map

| File | Process | Role |
|------|---------|------|
| `main.js` | Main | Window, BrowserView lifecycle, all IPC handlers, autofill injection |
| `preload.js` | Preload | contextBridge — exposes `window.api` to renderer |
| `credentials.js` | Main | Chrome password decryption (DPAPI + AES-256-GCM), credential storage |
| `renderer.js` | Renderer | Sidebar UI, modals, all user interactions |
| `index.html` | Renderer | Shell HTML — sidebar, modals, toast container |
| `styles.css` | Renderer | All styles |
| `package.json` | — | Scripts, electron-builder config, dependencies |

---

## Data Model (`config.json`)

Stored at `%APPDATA%\whatsapp-multi\config.json`

```json
{
  "sites": [
    {
      "id": "site_1234567890",
      "name": "Discord",
      "url": "https://discord.com/app",
      "sessions": [
        { "id": "sess_1234567890", "label": "Work" },
        { "id": "sess_1234567891", "label": "Personal" }
      ]
    }
  ]
}
```

- **Site** — a URL + name (e.g. Stripe dashboard)
- **Session** — a named login under a site; each gets its own isolated Electron session partition `persist:sess_<id>`
- Legacy `accounts.json` (flat array) is auto-migrated on first load

---

## Credentials (`credentials.json`)

Stored at `%APPDATA%\whatsapp-multi\credentials.json` after Chrome import.

```json
{
  "version": 1,
  "importedAt": "2026-05-03T10:00:00.000Z",
  "credentials": [
    { "hostname": "github.com", "origin": "https://github.com", "username": "alice@example.com", "password": "secret" }
  ]
}
```

---

## IPC Channels (all `ipcMain.handle` → `ipcRenderer.invoke`)

| Channel | Args | Returns | Notes |
|---------|------|---------|-------|
| `get-config` | — | `{ sites }` | Full config on boot |
| `switch-session` | `siteId, sessionId` | `sessionId \| null` | Shows/hides BrowserViews |
| `add-site` | `name, url` | `site` object | Pushes to cfg, saves |
| `rename-site` | `siteId, name` | `bool` | |
| `remove-site` | `siteId` | `bool` | Destroys all child BrowserViews |
| `add-session` | `siteId, label` | `session` object | |
| `rename-session` | `sessionId, label` | `bool` | |
| `remove-session` | `sessionId` | `bool` | |
| `set-sidebar-width` | `width` | — | Recalculates BrowserView bounds |
| `hide-view` | — | — | Moves active BrowserView off-screen (for modals) |
| `show-view` | — | — | Restores BrowserView bounds |
| `import-from-chrome` | — | `{ ok, count \| error }` | 30s timeout wrapper |

**Main → Renderer push:**

| Channel | Payload | Purpose |
|---------|---------|---------|
| `session-loading` | `sessionId, bool` | Drives loading dot animation in sidebar |

---

## BrowserView Layout

```
┌─────────────────────────────────────────────────┐
│ sidebar (250px)  │  BrowserView (rest)           │
│                  │  x=sidebarWidth, y=0          │
│                  │  w=windowW-sidebarWidth, h=windowH │
└─────────────────────────────────────────────────┘
```

- **`sidebarWidth`** — mutable, starts at 250, drops to 60 when collapsed
- BrowserView is an **OS-level layer** drawn on top of BrowserWindow content
- Modals work by calling `hide-view` (moves view off-screen) before showing overlay, `show-view` after closing
- Each session's BrowserView is created **lazily** on first switch and never destroyed until the session is removed

---

## key functions in `main.js`

| Function | What it does |
|----------|-------------|
| `loadConfig()` | Reads config.json, migrates legacy accounts.json |
| `createView(site, session)` | Creates BrowserView, sets UA, wires loading events + autofill |
| `switchSession(siteId, sessionId)` | Hides old view, shows/creates new view |
| `buildAutofillScript(creds)` | Returns JS string injected into BrowserView on page load |
| `viewBounds()` | `{ x: sidebarWidth, y: 0, w: ..., h: ... }` |

---

## key functions in `credentials.js`

| Function | What it does |
|----------|-------------|
| `decryptDPAPI(bytes)` | Writes temp `.ps1`, runs PowerShell with `-ExecutionPolicy Bypass`, returns decrypted Buffer |
| `getMasterKey()` | Reads Chrome `Local State`, strips `DPAPI` prefix, calls `decryptDPAPI` |
| `decryptPassword(blob, aesKey)` | AES-256-GCM for v10/v11 prefix, DPAPI fallback for legacy entries |
| `readChromeLogins()` | Copies `Login Data` to temp, opens with sql.js, returns rows |
| `importFromChrome()` | Orchestrates full import, saves `credentials.json`, returns count |
| `getCredentialsForHostname(hostname)` | Filters saved credentials by hostname for autofill |

---

## Autofill Flow

1. BrowserView fires `did-stop-loading`
2. `main.js` gets current URL hostname, calls `getCredentialsForHostname`
3. If matches found, `buildAutofillScript(creds)` is injected via `executeJavaScript`
4. Script uses native `HTMLInputElement` setter (React/Vue/Angular compatible) + dispatches `input`/`change`
5. Tries immediately, retries at 800ms and 2.3s for SPAs
6. If multiple credentials match → floating picker injected into page (`#__ml_picker__`), auto-dismisses after 10s

---

## Build

```bash
npm start        # dev — runs from source
npm run dist     # builds dist/WhatsApp-Multi.exe (portable, ~66 MB)
```

electron-builder config in `package.json`:
- `asarUnpack: ["node_modules/sql.js/dist/sql-wasm.wasm"]` — WASM must be on disk, not inside asar
- `files` list is explicit — only named files are bundled

---

## Known Quirks

- **BrowserView z-order** — always above BrowserWindow content; modals require hide/show dance
- **Chrome profile** — import only reads the `Default` profile; other profiles ignored
- **sql.js WASM path** — dev uses `__dirname/node_modules/sql.js/dist/`, packaged uses `process.resourcesPath/app.asar.unpacked/...`
- **Session partition** — `persist:sess_<id>` — survives app restarts; removing a session destroys the BrowserView but the partition data stays on disk
