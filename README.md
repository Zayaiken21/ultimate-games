# Ultimate Games — Power Render Build

This build keeps your uploaded games and makes them open correctly on Render.

## Games

- `/` — Arcade launcher
- `/games/sunny-side-snack-shack/`
- `/games/marble-league-3d/`
- `/games/rainbow-garden-multiplayer/`
- `/games/neon-speed-runner-3d/`
- `/games/sunny-side-snack-shack-classic/`

Each game folder includes both `index.html` and a named HTML file.

## Render commands

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

## Why this fixes the website

The previous site could fail when a card linked to a page Render did not serve. This server now has direct routes for every game, a fallback to the arcade homepage, a Socket.IO server for Marble League, and separate WebSocket paths for Sunny Side and Rainbow Garden.
