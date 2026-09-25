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
- Clicking a preset auto-fills both fields; you can still edit them
- Submitting creates the site and automatically adds a first session called "Main"

### Adding a Session
- Hover over any site in the sidebar → a faint **+ Add session** row appears below the existing sessions
- Click it → type a name (e.g. "Work", "Client A") → confirm
- The new session appears immediately; click it to open that site in its own isolated login

### Switching Sessions
- Click any session in the sidebar to switch to it
- A loading indicator (pulsing green dot) shows while the page loads
- The previously active session moves off-screen (it keeps running in the background)

### Renaming / Removing
- Hover over a site → pencil icon to rename, trash icon to remove the entire site and all its sessions
- Hover over a session → pencil icon to rename, trash icon to remove just that session
- Removing a session destroys its browser view; its login data stays on disk until the app data folder is manually cleared

### Sidebar Collapse
- Arrow button in the top-right of the sidebar collapses it to a narrow 60px icon strip
- Collapsed mode hides site names, session lists, and action buttons — just the favicon row remains
- Expands back on click; state is applied immediately without restart

### Chrome Password Import
- Click **Import from Chrome** in the sidebar footer
- The app reads Chrome's `Default` profile login database, decrypts all saved passwords using Windows DPAPI (no Chrome needs to be open), and stores them locally in `credentials.json`
- Import completes in a few seconds; a toast shows how many passwords were imported
- Only the `Default` Chrome profile is read; other profiles are not supported

### Autofill
- After a Chrome import, whenever you navigate to a login page in any session, saved credentials matching that hostname are injected automatically
- Works with React, Vue, Angular, and plain HTML forms (uses the browser's native input setter, not a simple `.value =` assignment)
- If a page loads before the login form appears (SPA), autofill retries at 800ms and 2.3s after page load
- **Multiple accounts**: if you have more than one saved login for a site, a floating picker appears in the bottom-right corner of the page — click the username you want. It auto-dismisses after 10 seconds

### Empty State
- When no sites have been added yet, a centred placeholder is shown in the main area with instructions
- It disappears as soon as the first site is added

### Toast Notifications
- Short confirmation/error messages appear centred at the bottom of the screen after actions (import success, import failure, etc.)
- They fade in and disappear automatically

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

---

## Data & Privacy

- All data is stored locally in `%APPDATA%\whatsapp-multi\`
  - `config.json` — sites and sessions list
  - `credentials.json` — decrypted Chrome passwords (plain text)
- Nothing is sent to any server
- Session data (cookies, local storage) lives in Electron's partition store under the same `%APPDATA%` path

---

## Limitations

- **Windows only** — Chrome import uses Windows DPAPI; the rest of the app works cross-platform but is only packaged for Windows
- **Chrome Default profile only** — other Chrome profiles, Firefox, Edge, and Brave are not read
- **No tab bar** — one session visible at a time; switching is via the sidebar
- **Partition data not cleaned on session removal** — deleting a session removes it from the UI but the cached login data stays on disk
- **Autofill requires prior import** — no live sync with Chrome; re-import whenever you add new passwords in Chrome
