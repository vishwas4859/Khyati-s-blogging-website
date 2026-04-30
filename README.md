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

## Deploy

### Render

Render hosts the real backend and API.

1. Create a new Web Service from this GitHub repo.
2. Render can read [render.yaml](/Users/abcd/terminal-chat/render.yaml), or use these values manually:
   - Build command: `npm install`
   - Start command: `npm start`
   - `HOST=0.0.0.0`
   - `PORT=10000`
   - `ADMIN_EMAIL=your-email@example.com`
   - `ADMIN_PASSWORD=your-strong-password`
3. After deploy, note the Render URL:
   - Example: `https://ink-and-emotion.onrender.com`

### Vercel

Vercel should host the frontend and proxy `/api/*` to Render.

1. Before deploying to Vercel, edit [vercel.json](/Users/abcd/terminal-chat/vercel.json) and replace:
   - `https://YOUR-RENDER-SERVICE.onrender.com`
   - with your actual Render service URL
2. Import this repo into Vercel.
3. Deploy with the project root set to this repository root.

### Important

- Render is the source of truth for the backend.
- The current app stores data in `data/store.json`, so production durability depends on the host filesystem. That is acceptable for a demo, but not ideal for a serious production blog.
- If you want durable production data, move posts/comments to a database.
