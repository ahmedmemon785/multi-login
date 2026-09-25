# Features Context — Multi Login

## What the App Does

Multi Login is a desktop app (Windows `.exe`) that lets you stay logged in to multiple accounts on any website simultaneously — each in its own isolated browser session. No more signing out and back in to switch between your Work and Personal Discord, or your two Stripe dashboards.

---

## Core Concepts

### Sites
A **Site** is a URL you want to use with multiple accounts — e.g. `https://discord.com/app` labelled "Discord", or `https://dashboard.stripe.com` labelled "Stripe".

You add a site once. The app remembers its name, URL, and favicon.

### Sessions
A **Session** is a named login under a site — e.g. "Work" and "Personal" under Discord. Each session gets its own completely isolated browser environment (cookies, localStorage, cache). Logging into one session never affects another.

Sessions persist across app restarts. Once you log in, you stay logged in — just like a regular browser.

---

## Feature List

### Adding a Site
- Click **+ Add Site** in the sidebar footer
- Choose a preset (WhatsApp, Discord, Gmail, Outlook, GitHub, Notion, Slack, Stripe, Telegram, LinkedIn, YouTube, or Twitter/X) — fills in the URL and name automatically
- Or type any URL and name manually
- Submitting creates the site and automatically adds a first session called "Main"

### Adding a Session
- Hover over any site in the sidebar → a faint **+ Add session** row appears below the existing sessions
- Click it → type a name (e.g. "Work", "Client A") → confirm

### Switching Sessions
- Click any session in the sidebar to switch to it
- A loading indicator (pulsing dot) shows while the page loads
- The previously active session moves off-screen but keeps running in the background — it still receives notifications

### Reload / Hard Reload
- Each session has its own reload button (↺) in the sidebar
- `Ctrl+R` reloads the active session; `Ctrl+Shift+R` hard-reloads (ignores cache)

### Mute Notifications
- Each session has a mute toggle (bell icon)
- Muting blocks the browser notification permission for that session and mutes its audio, without affecting other sessions

### Notifications
- A page's browser notifications (e.g. a new WhatsApp message) route through the OS notification center
- Clicking a notification focuses the app window and switches directly to the session that sent it
- The taskbar icon shows a running unread count as a badge, cleared when the window regains focus

### Right-click Menu (in any session)
- **Open Link in Session** — pick any configured session from a submenu; the link opens in a popup sharing that session's cookies. This is the fix for flows like a Stripe/Hostinger email-verification link that must be opened in the same logged-in browser
- **Open in External Browser** — opens the link in your default OS browser instead
- **Translate Selection** / **Translate Page** — pick a target language from a submenu; selection translation shows the result in an in-app dialog, page translation opens Google Translate externally
- **Spell-check suggestions** — right-clicking a misspelled word (red underline) shows correction suggestions
- **Back / Forward / Reload** and standard **Copy** / **Copy Link** / **Copy Image URL**

### Cross-domain link handling
- Links to a different domain than the current site (e.g. a YouTube link inside WhatsApp) open as a popup sharing the session's cookies, instead of navigating the session away from the site
- Full-page identity-provider redirects (Google, Microsoft, Apple, GitHub, Facebook, Okta, Auth0 login) are excluded from this, so OAuth/SSO flows complete normally in the same tab

### Renaming / Removing
- Hover over a site → pencil icon to rename, trash icon to remove the entire site and all its sessions
- Hover over a session → pencil icon to rename, trash icon to remove just that session
- Removing a session destroys its browser view; its login data stays on disk until the app data folder is manually cleared

### Sidebar Collapse
- Arrow button in the top-right of the sidebar collapses it to a narrow 60px icon strip
- Hovering a site's icon in collapsed mode shows a flyout listing its sessions, so you can still switch without expanding

### Empty State
- When no sites have been added yet, a centred placeholder is shown in the main area with instructions

### Toast Notifications
- Short confirmation/error messages appear centred at the bottom of the screen after actions, fading out automatically

---

## Preset Sites

| Preset | URL |
|--------|-----|
| WhatsApp | `https://web.whatsapp.com` |
| Discord | `https://discord.com/app` |
| Gmail | `https://mail.google.com` |
| Outlook | `https://outlook.live.com` |
| GitHub | `https://github.com` |
| Notion | `https://www.notion.so` |
| Slack | `https://app.slack.com` |
| Stripe | `https://dashboard.stripe.com` |
| Telegram | `https://web.telegram.org` |
| LinkedIn | `https://www.linkedin.com` |
| YouTube | `https://www.youtube.com` |
| Twitter / X | `https://twitter.com` |

You aren't limited to the presets — any URL works, which is why the app also fits things like Hostinger or a hosting control panel just as well.

---

## Data & Privacy

- All data is stored **locally only**, in `%APPDATA%\multi-login\`
  - `config.json` — sites and sessions list
  - `Partitions/` — each session's cookies, localStorage, and cache (Electron's own session-partition store)
- Nothing is sent to any server the app controls
- Translation features call Google's translate endpoint directly with the text you select; no other network calls happen outside the sites you actually load

---

## Limitations

- **Windows only** — packaged only for Windows; the underlying Electron code is not Mac/Linux-specific but hasn't been tested there
- **No tab bar** — one session visible at a time; switching is via the sidebar
- **Partition data not cleaned on session removal** — deleting a session removes it from the UI but the cached login data stays on disk until the app data folder is manually cleared
- **Translation is best-effort** — it uses an unofficial Google Translate endpoint (no API key), which could be rate-limited or blocked without notice
