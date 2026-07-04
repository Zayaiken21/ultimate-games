# Ultimate Games — Deploy & Add-a-Game Guide

This arcade is **100% static**. No Node, no Render, no build step.
Everything runs off plain files, which means it deploys the exact same
way as your other sites: **FTPManager → IONOS**.

---

## 1. First deploy (one time)

Upload the contents of this folder to the web root you want
(domain root or a subdomain like `games.yourdomain.com`):

```
index.html                          ← the arcade hub
games/
  neon-speed-runner/index.html
  marble-league-3d/index.html
  snack-shack/index.html
```

Open the domain. Done. Each game also gets a shareable deep link
automatically, e.g. `yourdomain.com/?game=marble-league-3d`.

---

## 2. Adding a new game (2 steps, ~2 minutes)

**Step 1 — upload the game.**
Every game is one self-contained `index.html` (CDN scripts like three.js
are fine). In FTPManager, create a folder under `games/` and drop it in:

```
games/my-new-game/index.html
```

Folder name rules: lowercase, hyphens, no spaces (`my-new-game` ✔).

**Step 2 — register it.**
Open `index.html` (the hub), find the banner comment near the top of the
`<script>` block:

```
GAME LIBRARY — this is the only block you edit to add a game.
```

Copy any existing entry, paste it above the closing `];`, and edit:

```js
{
  slug: "my-new-game",              // must match the folder name
  title: "My New Game",
  tagline: "One line about what the player does.",
  genre: "Arcade",
  players: "Solo",
  controls: "Tap · Swipe",
  accent: "#7df3ff",                // the card's neon color
  art: "burst"                      // runner | marble | shack | burst
}
```

Save, upload. The card, cover art, loader, deep link, exit controls,
back-gesture handling, and "Last played" tag are all automatic.

To remove a game: delete its entry from the block (folder can stay).
To reorder the shelf: reorder the entries.

---

## 3. What the hub handles for every game

- Fullscreen player with a loading screen in the game's accent color
- Auto-hiding top bar (game title · ⛶ fullscreen · ✕ exit) — a small
  center tab brings it back
- Phone back gesture / browser back exits the **game**, not the site
- `Esc` exits on keyboard
- `?game=slug` deep links you can text to anyone
- Games are torn down on exit (`about:blank`) so audio/loops stop

---

## 4. Notes on these three games

- **Neon Speed Runner** — fully offline, no changes made.
- **Marble League 3D** — offline racing (all 20 maps, shop, skins) is
  fully self-contained. The zip's `server.js` / `render.yaml` were only
  for online rooms. Two fixes were applied:
  1. A stray `else` fragment and an unbalanced brace on the results-menu
     line were breaking the **entire** script — the game wouldn't have
     loaded at all. Repaired.
  2. On static hosting there's no socket.io, so the online buttons now
     show "Online rooms need the live game server" instead of throwing.
  If you ever want online rooms back, the `server.js` from the zip can
  run on any Node host and the game reconnects with zero further edits.
- **Snack Shack** — offline play works as-is; its online button already
  fails gracefully ("Deploy or run server first") on static hosting.

---

## 5. If a game needs more than one file

Multi-file games work too — keep everything inside the game's folder and
use **relative** paths inside the game (`./sprites.png`, not `/sprites.png`):

```
games/my-new-game/
  index.html
  game.js
  assets/…
```

The hub always loads `games/<slug>/index.html`; the game finds the rest.
