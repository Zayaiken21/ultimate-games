const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Marble League uses Socket.IO. It is available globally at /socket.io.
const io = new Server(server, { cors: { origin: "*" } });

// Sunny Side and Rainbow Garden use plain WebSockets on separate paths.
const sunnyWss = new WebSocketServer({ noServer: true });
const rainbowWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/sunny-ws") {
    sunnyWss.handleUpgrade(req, socket, head, ws => sunnyWss.emit("connection", ws, req));
    return;
  }
  if (url.pathname === "/rainbow-ws") {
    rainbowWss.handleUpgrade(req, socket, head, ws => rainbowWss.emit("connection", ws, req));
    return;
  }
  socket.destroy();
});

app.use(express.static(__dirname, { extensions: ["html"], maxAge: "30m" }));

app.get("/health", (_, res) => res.send("Ultimate Games is awake."));
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

const gameRoutes = {
  "sunny-side-snack-shack": "sunny-side-snack-shack",
  "sunny-side-snack-shack-classic": "sunny-side-snack-shack-classic",
  "marble-league-3d": "marble-league-3d",
  "rainbow-garden-multiplayer": "rainbow-garden-multiplayer",
  "neon-speed-runner-3d": "neon-speed-runner-3d"
};

app.get("/games/:slug", (req, res, next) => {
  const slug = gameRoutes[req.params.slug];
  if (!slug) return next();
  res.sendFile(path.join(__dirname, "games", slug, "index.html"));
});
app.get("/games/:slug/", (req, res, next) => {
  const slug = gameRoutes[req.params.slug];
  if (!slug) return next();
  res.sendFile(path.join(__dirname, "games", slug, "index.html"));
});

// ---------------- Sunny Side Snack Shack WebSocket Server ----------------
const sunnyClients = new Map();
const sunnyRooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function send(ws, data) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data)); }
function clientSocket(id) { return [...sunnyClients.entries()].find(([, c]) => c.id === id)?.[0]; }
function publicRooms() {
  return [...sunnyRooms.values()].filter(r => r.players.length < 4 && !r.started)
    .map(r => ({ code: r.code, mode: r.mode, players: r.players.length, hostName: r.hostName }));
}
function broadcastRooms() {
  const payload = { type: "sunnyRooms", sunnyRooms: publicRooms() };
  for (const ws of sunnyClients.keys()) send(ws, payload);
}
function roomPayload(room) {
  return {
    code: room.code, mode: room.mode, started: room.started, hostName: room.hostName,
    players: room.players.map(p => ({ id:p.id, name:p.name, face:p.face, score:p.score||0, served:p.served||0, order:p.order||[], coopBonus:p.coopBonus||0 }))
  };
}
function broadcastRoom(room) {
  const payload = { type: "players", players: roomPayload(room).players };
  for (const p of room.players) send(clientSocket(p.id), payload);
}
function broadcastVotes(room) {
  const payload = { type: "votes", votes: room.votes || {} };
  for (const p of room.players) send(clientSocket(p.id), payload);
}
function leave(ws, closing=false) {
  const c = sunnyClients.get(ws);
  if (!c) return;
  if (c.room && sunnyRooms.has(c.room)) {
    const room = sunnyRooms.get(c.room);
    room.players = room.players.filter(p => p.id !== c.id);
    delete room.votes[c.id]; delete room.ready[c.id];
    if (room.players.length === 0) sunnyRooms.delete(c.room);
    else { broadcastRoom(room); broadcastVotes(room); }
  }
  c.room = null;
  if (closing) sunnyClients.delete(ws);
  broadcastRooms();
}

sunnyWss.on("connection", ws => {
  const id = Math.random().toString(36).slice(2);
  sunnyClients.set(ws, { id, name: "Chef", room: null, face: "🧑‍🍳" });
  send(ws, { type: "welcome", id, sunnyRooms: publicRooms() });

  ws.on("message", raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const c = sunnyClients.get(ws); if (!c) return;

    if (msg.type === "hello") {
      c.name = String(msg.name || "Chef").slice(0, 14);
      broadcastRooms();
    }

    if (msg.type === "createRoom") {
      leave(ws);
      c.name = String(msg.name || c.name || "Chef").slice(0, 14);
      const code = makeCode();
      const room = { code, mode: msg.mode === "versus" ? "versus" : "coop", hostName: c.name, level: 1, mapId: 0, started: false, votes: {}, ready: {}, tutorialVotes:{}, sharedOrder:null, players: [] };
      sunnyRooms.set(code, room);
      c.room = code;
      room.players.push({ id: c.id, name: c.name, face: "🧑‍🍳", score: 0, served: 0, order: [], coopBonus: 0 });
      send(ws, { type: "room", room: roomPayload(room) });
      broadcastRooms();
    }

    if (msg.type === "joinRoom") {
      const code = String(msg.code || "").toUpperCase();
      const room = sunnyRooms.get(code);
      if (!room || room.players.length >= 4 || room.started) return send(ws, { type:"error", message:"Room not found, full, or already started." });
      leave(ws);
      c.name = String(msg.name || c.name || "Chef").slice(0, 14);
      c.room = code;
      room.players.push({ id: c.id, name: c.name, face: "👩‍🍳", score: 0, served: 0, order: [], coopBonus: 0 });
      for (const p of room.players) send(clientSocket(p.id), { type: "room", room: roomPayload(room) });
      broadcastRoom(room); broadcastRooms();
    }

    if (msg.type === "openVote") { const room = sunnyRooms.get(c.room); if (room) broadcastVotes(room); }

    if (msg.type === "vote") {
      const room = sunnyRooms.get(c.room); if (!room) return;
      room.votes[c.id] = Math.max(0, Math.min(99, Number(msg.mapId || 0)));
      broadcastVotes(room);
    }

    if (msg.type === "ready") {
      const room = sunnyRooms.get(c.room); if (!room) return;
      room.ready[c.id] = true;
      const votes = Object.values(room.votes);
      const selected = votes.length ? votes.sort((a,b)=>votes.filter(v=>v===b).length-votes.filter(v=>v===a).length)[0] : 0;
      if (room.players.length >= 2 && room.players.every(p => room.ready[p.id])) {
        const payload = { type: "tutorialVote", votes: room.tutorialVotes || {} };
        for (const p of room.players) send(clientSocket(p.id), payload);
      } else broadcastVotes(room);
    }


    if (msg.type === "newSharedOrder") {
      const room = sunnyRooms.get(c.room);
      if (!room || room.mode !== "coop") return;
      room.sharedOrder = Array.isArray(msg.order) ? msg.order.slice(0, 6) : [];
      for (const p of room.players) send(clientSocket(p.id), { type: "sharedOrder", order: room.sharedOrder });
    }

    if (msg.type === "tutorialVote") {
      const room = sunnyRooms.get(c.room); if (!room) return;
      room.tutorialVotes[c.id] = msg.show !== false;
      const payload = { type: "tutorialVote", votes: room.tutorialVotes };
      for (const p of room.players) send(clientSocket(p.id), payload);
      if (room.players.length >= 2 && room.players.every(p => Object.prototype.hasOwnProperty.call(room.tutorialVotes, p.id))) {
        const show = Object.values(room.tutorialVotes).some(Boolean);
        for (const p of room.players) send(clientSocket(p.id), { type: "tutorialStart", show });
        const voteVals = Object.values(room.votes || {});
        const unique = [...new Set(voteVals.length ? voteVals : [0])];
        for (const p of room.players) send(clientSocket(p.id), { type: "spin", candidates: unique, duration: 1800 });
        setTimeout(() => {
          const selected = unique[Math.floor(Math.random() * unique.length)] || 0;
          room.mapId = selected; room.level = 1; room.started = true;
          for (const p of room.players) send(clientSocket(p.id), { type: "start", level: 1, mapId: selected, mode: room.mode, delay: 350 });
          broadcastRooms();
        }, 1900);
      }
    }

    if (msg.type === "progress") {
      const room = sunnyRooms.get(c.room); if (!room) return;
      const player = room.players.find(p => p.id === c.id); if (!player) return;
      player.score = Number(msg.coins || 0); player.served = Number(msg.served || 0);
      player.order = Array.isArray(msg.order) ? msg.order.slice(0,5) : [];
      player.coopBonus = Number(msg.coopBonus || 0);
      broadcastRoom(room);
    }

    if (msg.type === "leaveRoom") leave(ws);
  });
  ws.on("close", () => leave(ws, true));
});


// ---------------- Rainbow Garden WebSocket Server ----------------

const rainbowLobbies = new Map();
function makeRainbowCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rainbowLobbies.has(code));
  return code;
}
function rainbowSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function rainbowBroadcast(code, sender, data) {
  const lobby = rainbowLobbies.get(code);
  if (!lobby) return;
  for (const player of lobby.players) {
    if (player.ws !== sender) rainbowSend(player.ws, data);
  }
}
rainbowWss.on("connection", (ws) => {
  ws.playerId = Math.random().toString(36).slice(2, 9);
  ws.lobbyCode = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return rainbowSend(ws, { type: "error", message: "Bad message." }); }

    if (msg.type === "create") {
      const code = makeRainbowCode();
      ws.lobbyCode = code;
      rainbowLobbies.set(code, { code, players: [{ id: ws.playerId, ws }] });
      rainbowSend(ws, { type: "created", code, playerId: ws.playerId });
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").toUpperCase();
      const lobby = rainbowLobbies.get(code);
      if (!lobby) return rainbowSend(ws, { type: "error", message: "Lobby not found." });
      if (lobby.players.length >= 4) return rainbowSend(ws, { type: "error", message: "Lobby is full." });
      ws.lobbyCode = code;
      lobby.players.push({ id: ws.playerId, ws });
      rainbowSend(ws, { type: "joined", code, playerId: ws.playerId });
      for (const player of lobby.players) rainbowSend(player.ws, { type: "start", code });
      return;
    }

    if (msg.type === "move") {
      rainbowBroadcast(ws.lobbyCode, ws, { type: "peerMove", lane: msg.lane, playerId: ws.playerId });
      return;
    }

    if (msg.type === "score") {
      rainbowBroadcast(ws.lobbyCode, ws, { type: "peerScore", score: msg.score, level: msg.level, playerId: ws.playerId });
      return;
    }
  });

  ws.on("close", () => {
    const code = ws.lobbyCode;
    if (!code || !rainbowLobbies.has(code)) return;
    const lobby = rainbowLobbies.get(code);
    lobby.players = lobby.players.filter(p => p.ws !== ws);
    if (lobby.players.length === 0) rainbowLobbies.delete(code);
    else rainbowBroadcast(code, ws, { type: "peerLeft" });
  });
});


// ---------------- Marble League Socket.IO Server ----------------
const MARBLE_MAPS = [
  "Crystal Coast XL","Neon Metro Mega","Sky Factory GP","Jungle Loopway","Volcano Velocity",
  "Arctic Aurora","Beach Breeze Bay","Lake Lantern Run","Snowpeak Sprint","Desert Mirage",
  "Moon Marbleway","Candy Cloud Road","Rainforest Rush","Sunset Harbor","Glacier Glow",
  "Lava Lighthouse","Cyber Speedway","Coral Reef Roll","Mountain Mist","Starlight Stadium"
];
const MARBLE_SKINS = [
  "white","red","blue","green","gold","purple","black","rainbow","lightning","ocean","lava",
  "snow","galaxy","emerald","candy","chrome","sunset","toxic","icefire","midnight","pearl","rose"
];
const MARBLE_TRACK_LENGTH = 7600;
const MARBLE_MAX_PLAYERS = 8;
const MARBLE_FINISH_GRACE_MS = 15000;
const marbleRooms = new Map();

function makeMarbleCode() {
  let code = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (marbleRooms.has(code)) code = Math.random().toString(36).slice(2, 7).toUpperCase();
  return code;
}
function makeMarbleRoom() {
  return { code: makeMarbleCode(), status: "lobby", votingOpen: false, selectedMap: null, wheel: null, createdAt: Date.now(), finishDeadline: 0, resultsSent: false, players: new Map() };
}
function makeMarblePlayer(socket, data, host) {
  return {
    id: socket.id, name: String(data.name || "Player").slice(0, 16), skin: MARBLE_SKINS.includes(data.skin) ? data.skin : "white",
    host, ready: false, mapChoice: null, input: { steer: 0, throttle: 1, boost: false },
    s: 0, lane: 0, laneVel: 0, speed: 0, boost: 100, cooldown: 0, gems: 0, collected: {}, finished: false, finishMs: 0, place: 1, checkpoint: 0
  };
}
function publicMarbleRoom(room) {
  return { code: room.code, status: room.status, votingOpen: room.votingOpen, selectedMap: room.selectedMap, wheel: room.wheel,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, skin: p.skin, host: p.host, ready: p.ready, mapChoice: p.mapChoice })) };
}
function marbleLobbyListFor(socketId) {
  return [...marbleRooms.values()].filter(r => r.status === "lobby" && r.players.size > 0 && !r.players.has(socketId))
    .map(r => ({ code: r.code, players: r.players.size, maxPlayers: MARBLE_MAX_PLAYERS, host: [...r.players.values()].find(p => p.host)?.name || "Host" }));
}
function marbleBroadcastLobbyLists() {
  for (const [id, socket] of io.of("/").sockets) socket.emit("lobbyList", marbleLobbyListFor(id));
}
function marbleEmitRoom(room) { io.to(room.code).emit("roomUpdate", publicMarbleRoom(room)); marbleBroadcastLobbyLists(); }
function marbleChosenMaps(room) { return [...new Set([...room.players.values()].map(p => p.mapChoice).filter(Boolean))]; }
function marbleAllReady(room) { return room.players.size > 0 && [...room.players.values()].every(p => p.ready && MARBLE_MAPS.includes(p.mapChoice)); }
function marbleBeginRace(room, selectedMap) {
  room.status = "racing"; room.selectedMap = selectedMap; room.votingOpen = false; room.wheel = null; room.finishDeadline = 0; room.resultsSent = false;
  const arr = [...room.players.values()];
  arr.forEach((p, i) => {
    p.ready = false; p.s = Math.max(0, -i * 18); p.lane = (i - (arr.length - 1) / 2) * 1.6; p.laneVel = 0; p.speed = 27; p.boost = 100; p.cooldown = 0; p.gems = 0; p.collected = {}; p.finished = false; p.finishMs = 0; p.place = 1; p.checkpoint = 0;
  });
  io.to(room.code).emit("raceStarted", { room: publicMarbleRoom(room), selectedMap, trackLength: MARBLE_TRACK_LENGTH });
  marbleBroadcastLobbyLists();
}
function marbleStartSelection(room) {
  const options = marbleChosenMaps(room);
  if (options.length < 1 || !marbleAllReady(room)) return false;
  const selectedMap = options[Math.floor(Math.random() * options.length)];
  if (options.length === 1) {
    io.to(room.code).emit("mapChosenDirect", { selectedMap });
    setTimeout(() => marbleBeginRace(room, selectedMap), 800);
    return true;
  }
  room.status = "wheel"; room.selectedMap = selectedMap; room.wheel = { options, selectedMap, durationMs: 4300, startedAt: Date.now() };
  io.to(room.code).emit("wheelStarted", publicMarbleRoom(room));
  marbleBroadcastLobbyLists();
  setTimeout(() => marbleBeginRace(room, selectedMap), room.wheel.durationMs + 650);
  return true;
}
function marbleApplyBoost(room, p) {
  if (p.boost < 100 || p.cooldown > 0 || p.finished) return;
  p.boost = 0; p.cooldown = 2.2; p.speed += 32;
  for (const other of room.players.values()) {
    if (other.id === p.id || other.finished) continue;
    if (Math.abs(other.s - p.s) < 55 && Math.abs(other.lane - p.lane) < 8) {
      other.laneVel += (other.lane >= p.lane ? 1 : -1) * 28; other.speed *= 0.6;
    }
  }
}
function marbleResults(room) {
  return [...room.players.values()].sort((a, b) => {
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.s - a.s;
  }).map((p, i) => ({ id: p.id, name: p.name, skin: p.skin, place: i + 1, gems: p.gems, progress: Math.min(100, Math.floor((p.s / MARBLE_TRACK_LENGTH) * 100)), finished: p.finished }));
}
function marbleFinishRoom(room) {
  if (room.resultsSent) return;
  room.resultsSent = true; room.status = "finished";
  io.to(room.code).emit("raceFinished", { selectedMap: room.selectedMap, results: marbleResults(room) });
  marbleBroadcastLobbyLists();
}
function marbleSimulate(room, dt) {
  if (room.status !== "racing") return;
  const now = Date.now();
  for (const p of room.players.values()) {
    if (p.finished) continue;
    p.cooldown = Math.max(0, p.cooldown - dt); p.boost = Math.min(100, p.boost + 10 * dt);
    const steer = Math.max(-1, Math.min(1, Number(p.input.steer || 0)));
    const throttle = Math.max(0.55, Math.min(1.25, Number(p.input.throttle || 1)));
    p.laneVel += steer * 13.5 * dt; p.laneVel *= Math.pow(0.82, dt * 8); p.lane += p.laneVel * dt;
    if (Math.abs(p.lane) > 12) { p.lane = Math.sign(p.lane) * 3.5; p.laneVel = 0; p.speed = 24; }
    p.speed += 30 * throttle * dt; p.speed *= Math.pow(0.989, dt * 60); p.speed = Math.max(18, Math.min(64, p.speed));
    if (p.input.boost) { marbleApplyBoost(room, p); p.input.boost = false; }
    p.s += p.speed * dt; p.checkpoint = Math.min(14, Math.floor((p.s / MARBLE_TRACK_LENGTH) * 14));
    const gemIndex = Math.floor(p.s / 120);
    if (gemIndex > 0 && gemIndex % 2 === 0 && !p.collected[gemIndex]) {
      p.collected[gemIndex] = true; p.gems += 1; io.to(room.code).emit("gemCollected", { playerId: p.id, gemIndex, gems: p.gems });
    }
    if (p.s >= MARBLE_TRACK_LENGTH) {
      p.s = MARBLE_TRACK_LENGTH; p.finished = true; p.finishMs = now;
      if (!room.finishDeadline) { room.finishDeadline = now + MARBLE_FINISH_GRACE_MS; io.to(room.code).emit("finishCountdown", { seconds: 15, firstFinisher: p.name }); }
    }
  }
  const sorted = [...room.players.values()].sort((a, b) => b.s - a.s); sorted.forEach((p, i) => p.place = i + 1);
  if ([...room.players.values()].every(p => p.finished) || (room.finishDeadline && now >= room.finishDeadline)) marbleFinishRoom(room);
}
setInterval(() => {
  const now = Date.now();
  for (const room of marbleRooms.values()) {
    marbleSimulate(room, 1/30);
    if (room.status === "racing" || room.status === "finished") {
      io.to(room.code).emit("raceState", {
        status: room.status, selectedMap: room.selectedMap, trackLength: MARBLE_TRACK_LENGTH,
        finishSecondsLeft: room.finishDeadline ? Math.max(0, Math.ceil((room.finishDeadline - now) / 1000)) : 0,
        players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, skin: p.skin, s: p.s, lane: p.lane, speed: p.speed, boost: p.boost, cooldown: p.cooldown, gems: p.gems, finished: p.finished, place: p.place, checkpoint: p.checkpoint }))
      });
    }
  }
}, 1000/30);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of marbleRooms) {
    if (room.players.size === 0 || now - room.createdAt > 1000 * 60 * 60 * 4 || (room.status === "finished" && room.resultsSent)) marbleRooms.delete(code);
  }
  marbleBroadcastLobbyLists();
}, 20000);
io.on("connection", socket => {
  socket.emit("lobbyList", marbleLobbyListFor(socket.id));
  socket.on("requestLobbies", () => socket.emit("lobbyList", marbleLobbyListFor(socket.id)));
  socket.on("createRoom", data => {
    const room = makeMarbleRoom(); room.players.set(socket.id, makeMarblePlayer(socket, data || {}, true)); marbleRooms.set(room.code, room); socket.join(room.code); socket.data.marbleRoomCode = room.code; socket.emit("joinedRoom", { selfId: socket.id, room: publicMarbleRoom(room) }); marbleEmitRoom(room);
  });
  socket.on("joinRoom", data => {
    const code = String(data.code || "").trim().toUpperCase(); const room = marbleRooms.get(code);
    if (!room) return socket.emit("errorMessage", "Room not found.");
    if (room.status !== "lobby") return socket.emit("errorMessage", "This race already started.");
    if (room.players.size >= MARBLE_MAX_PLAYERS) return socket.emit("errorMessage", "Room is full.");
    room.players.set(socket.id, makeMarblePlayer(socket, data || {}, false)); socket.join(code); socket.data.marbleRoomCode = code; socket.emit("joinedRoom", { selfId: socket.id, room: publicMarbleRoom(room) }); marbleEmitRoom(room);
  });
  socket.on("openMapVote", () => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room || room.status !== "lobby") return;
    const p = room.players.get(socket.id); if (!p || !p.host) return socket.emit("errorMessage", "Only host can open map voting.");
    room.status = "voting"; room.votingOpen = true; for (const player of room.players.values()) { player.ready = false; player.mapChoice = null; } marbleEmitRoom(room);
  });
  socket.on("setMapChoice", mapChoice => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room || room.status !== "voting" || !room.votingOpen) return;
    const p = room.players.get(socket.id); if (!p || !MARBLE_MAPS.includes(mapChoice)) return; p.mapChoice = mapChoice; p.ready = false; marbleEmitRoom(room);
  });
  socket.on("setReady", ready => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room || room.status !== "voting" || !room.votingOpen) return;
    const p = room.players.get(socket.id); if (!p) return; if (!MARBLE_MAPS.includes(p.mapChoice)) return socket.emit("errorMessage", "Pick a map before readying up."); p.ready = !!ready; marbleEmitRoom(room);
  });
  socket.on("startWheel", () => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room) return;
    const p = room.players.get(socket.id); if (!p || !p.host) return socket.emit("errorMessage", "Only host can start."); if (!marbleAllReady(room)) return socket.emit("errorMessage", "Every player must pick a map and ready up."); marbleStartSelection(room);
  });
  socket.on("returnToLobby", () => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room) return; const p = room.players.get(socket.id);
    if (!p || !p.host) return socket.emit("errorMessage", "Only host can start a new game.");
    room.status = "lobby"; room.votingOpen = false; room.selectedMap = null; room.wheel = null; room.finishDeadline = 0; room.resultsSent = false;
    for (const player of room.players.values()) { player.ready = false; player.mapChoice = null; player.s = 0; player.gems = 0; player.collected = {}; player.finished = false; player.finishMs = 0; }
    marbleEmitRoom(room);
  });
  socket.on("input", input => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room || room.status !== "racing") return;
    const p = room.players.get(socket.id); if (!p) return; p.input = { steer: Number(input.steer || 0), throttle: Number(input.throttle || 1), boost: !!input.boost };
  });
  socket.on("leaveRoom", () => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room) return; const wasHost = room.players.get(socket.id)?.host; const code = room.code;
    if (wasHost) { io.to(code).emit("roomClosed", "Host ended the room."); marbleRooms.delete(code); io.socketsLeave(code); }
    else { room.players.delete(socket.id); socket.leave(code); socket.data.marbleRoomCode = null; marbleEmitRoom(room); }
    marbleBroadcastLobbyLists();
  });
  socket.on("disconnect", () => {
    const room = marbleRooms.get(socket.data.marbleRoomCode); if (!room) return; const wasHost = room.players.get(socket.id)?.host; room.players.delete(socket.id);
    if (room.players.size === 0) marbleRooms.delete(room.code); else { if (wasHost) { const next = room.players.values().next().value; if (next) next.host = true; } marbleEmitRoom(room); } marbleBroadcastLobbyLists();
  });
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Ultimate Games running on port ${PORT}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
