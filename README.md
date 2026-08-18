# GatherRound

GatherRound is a friendly scheduling poll for finding a meeting time without
calendar back-and-forth.

This repo contains two builds:

- `docs/`: static GitHub Pages build.
- `app/`, `db/`, `worker/`: full-stack D1-backed build for hosts that support a
  server runtime.

## GitHub Pages

GitHub Pages serves the static app from `docs/`.

The Pages build has no backend and stores no shared database records. Polls are
shared through URL-encoded poll links. Attendees can copy a response packet or
open a prefilled GitHub issue. The organizer imports response packets, publishes
the chosen result, copies a result summary, or downloads a CSV.

## Local Static Preview

```bash
python3 -m http.server 4173 --directory docs
```

Open `http://127.0.0.1:4173/`.

## Full-Stack Preview

```bash
npm install
npm run dev
```

## Validation

```bash
node --check docs/app.js
npm run lint
npm test
```
