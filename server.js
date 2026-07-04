const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve every static file in this folder.
app.use(express.static(__dirname, {
  extensions: ["html"],
  maxAge: "1h"
}));

// Home page.
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Allow direct game URLs and refreshes to work.
// Example: /games/marble-league-3d/
app.get("/games/:gameName", (req, res) => {
  res.sendFile(path.join(__dirname, "games", req.params.gameName, "index.html"));
});

app.get("/games/:gameName/", (req, res) => {
  res.sendFile(path.join(__dirname, "games", req.params.gameName, "index.html"));
});

// Fallback to arcade home instead of "Cannot GET /".
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

server = app.listen(PORT, () => {
  console.log(`Ultimate Games running on port ${PORT}`);
});

// Graceful shutdown for Render.
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
