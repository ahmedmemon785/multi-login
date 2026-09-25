# Security Policy

Multi Login runs real, logged-in sessions for sites that matter — payment dashboards, hosting panels, business accounts. Security issues here are taken seriously.

## Reporting a Vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Instead, email **ahmedmemon785@gmail.com** with:
- A description of the issue and its potential impact
- Steps to reproduce
- The app version and Windows version you tested on

You'll get an acknowledgment within a few days. Once a fix is out, you're credited in the release notes (unless you'd rather stay anonymous).

## Scope

In scope:
- The Electron main process (`main.js`) — permission handling, session isolation, IPC, navigation interception
- The preload scripts (`preload.js`, `view-preload.js`) — anything that could leak main-process capability into a loaded page
- The build/release pipeline

Out of scope:
- Vulnerabilities in the third-party sites you load into a session (report those to the site itself)
- Issues that require local admin/physical access to the machine already
- The translation feature's dependency on an unofficial Google endpoint (a reliability limitation, documented in the README, not a vulnerability)

## What "isolation" means here

Each session gets its own Electron `persist:<id>` partition — a separate cookie jar, separate `localStorage`, separate cache. That's the actual security boundary the app relies on. If you find a way for one session to read or write another session's data, that's a critical report.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full technical model, including the reasoning behind each permission and navigation decision.
