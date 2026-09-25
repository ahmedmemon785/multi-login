# Contributing

Thanks for considering a contribution. This is a solo-maintained side project, so a few ground rules keep it manageable.

## Before opening a PR

- **For anything beyond a small fix, open an issue first** describing what you want to change and why. Saves you from writing code that doesn't fit the direction of the project.
- **Bug fixes** are always welcome without prior discussion.
- **Security issues** go to [`SECURITY.md`](SECURITY.md), not a public issue or PR.

## Development setup

```bash
git clone https://github.com/ahmedmemon785/multi-login.git
cd multi-login
npm install
npm start
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it explains *why* several things are built the way they are (permission defaults, navigation interception, session partitioning), which will save you from re-litigating a decision that already has a documented reason.

## Code style

- Plain CommonJS, no bundler, no TypeScript, no framework in the renderer — keep it that way unless there's a real reason to change it
- No comments explaining *what* code does — only *why*, when it's non-obvious
- Match the existing formatting rather than introducing a new style in one file

## Testing your change

There's no automated test suite yet (contributions to add one are welcome). At minimum, before opening a PR:

1. `npm start` and confirm the app boots with no console errors
2. Exercise the specific feature you changed manually
3. If you touched `main.js`'s Electron API usage, run `npm run dist` and confirm the build succeeds — **close any running instance of the app first**, or the build will hang on a locked file

## Commit messages

Describe *why*, not just *what*. "Fix session mute not persisting across restart" beats "fix bug".
