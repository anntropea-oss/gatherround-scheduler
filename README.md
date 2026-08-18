# GatherRound

GatherRound is a friendly scheduling poll for finding a meeting time without
calendar back-and-forth.

This repo contains two surfaces:

- `app/`, `db/`, `worker/`: the real full-stack D1-backed app.
- `docs/`: a GitHub Pages project hub that points people to the real app.

## GitHub Pages

GitHub Pages serves `docs/`, but GitHub Pages is static hosting. It cannot store
shared poll records or attendee responses by itself, so the Pages build is a
project hub rather than the scheduling product.

The actual app is the full-stack build. It stores polls and responses through the
D1-backed API, supports specific dates or recurring days of week, and keeps admin
controls behind the private organizer link.

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
