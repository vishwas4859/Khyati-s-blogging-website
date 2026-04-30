# Ink & Emotion

Static blog UI plus a small Node backend with JSON persistence.

## Run

```bash
cd /Users/abcd/terminal-chat
npm start
```

Open `http://127.0.0.1:3000`.

## Admin Login

- Default password: `admin123`
- Default email fallback: `admin@inkandemotion.com`

You can override both with environment variables:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=strong-password npm start
```

## What The Backend Does

- serves `ink-and-emotion.html` and `frontend.js`
- stores reviews and comments in `data/store.json`
- supports admin login with a cookie session
- supports creating, editing, and deleting reviews
- supports posting comments and updating like counts
