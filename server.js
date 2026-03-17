const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const WORLD_FILE = path.join(process.env.NODE_ENV === "production" ? "/data" : __dirname, "world.json");

// ← NEW CODE: Create the folder so the first world.json can be saved
const WORLD_DIR = path.dirname(WORLD_FILE);
if (!fs.existsSync(WORLD_DIR)) {
  fs.mkdirSync(WORLD_DIR, { recursive: true });
  console.log("✅ Created /data folder for persistent world.json");
}

// Load or create world data with rolling hills
let worldData = { zones: {} };
if (fs.existsSync(WORLD_FILE)) {
  try {
    worldData = JSON.parse(fs.readFileSync(WORLD_FILE, "utf8"));
    console.log(
      `✅ Loaded world with ${Object.keys(worldData.zones).length} zone(s)`,
    );
  } catch (e) {
    console.log("⚠️ world.json corrupted, starting fresh");
  }
} else {
  // Generate FINAL polished rolling hills (matches client perfectly)
  const terrain = new Array(289 * 177);

  for (let i = 0; i < terrain.length; i++) {
    const ix = i % 289;
    const iz = Math.floor(i / 289);
    const worldX = (ix - 144) * (57600 / 288);
    const worldZ = (iz - 88) * (35200 / 176);

    let height = 0;
    let amp = 1;
    let freq = 0.000085;

    for (let o = 0; o < 6; o++) {
      height +=
        amp * Math.sin(worldX * freq * 1.05) * Math.cos(worldZ * freq * 0.95);
      if (o < 4) height += amp * 0.65 * Math.sin(worldZ * freq * 1.38);
      amp *= 0.48;
      freq *= 2.12;
    }

    terrain[i] = height * 920 + 105;
  }

  worldData.zones.azeroth1 = {
    trees: [],
    terrain: Array.from(terrain),
    waterBodies: [],
  };
  fs.writeFileSync(WORLD_FILE, JSON.stringify(worldData, null, 2));
  console.log("✅ Created new world.json with azeroth1 zone + rolling hills");
}

function saveWorld() {
  try {
    fs.writeFileSync(WORLD_FILE, JSON.stringify(worldData, null, 2));
  } catch (e) {
    console.error("Failed to save world.json", e);
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Serve frontend files conditionally
if (process.env.NODE_ENV === "production") {
  // In production (Railway), serve the Vite-built files from dist/
  app.use(express.static(path.join(__dirname, 'dist')));

  // Catch-all route for single-page app (handles refresh, direct URLs)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // In development, do nothing here — Vite serves the frontend on port 5173
  // You can leave this empty or comment out the old public folder if desired
  // app.use(express.static("public"));  // ← optional: keep commented if public/ is empty
}

const players = new Map();

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);

  socket.on("joinGame", (charData) => {
    const playerData = {
      id: socket.id,
      name: charData.name,
      race: charData.race,
      gender: charData.gender,
      level: charData.level || 1,
      health: 100,
      x: charData.x || 0,
      y: charData.y || 15,
      z: charData.z || 0,
      rot: charData.rot || 0,
      nameColor: charData.nameColor || "#00ff88",
      isAFK: false,
    };
    players.set(socket.id, playerData);

    const existing = Array.from(players.values()).filter(
      (p) => p.id !== socket.id,
    );
    socket.emit("existingPlayers", existing);
    socket.broadcast.emit("newPlayer", playerData);
  });

  socket.on("playerUpdate", (data) => {
    const p = players.get(socket.id);
    if (p) {
      p.x = data.x;
      p.y = data.y;
      p.z = data.z;
      p.rot = data.rot;
      p.isAFK = data.isAFK || false;
      socket.broadcast.emit("playerMoved", {
        id: socket.id,
        x: data.x,
        y: data.y,
        z: data.z,
        rot: data.rot,
        isAFK: p.isAFK,
      });
    }
  });

  socket.on("updateNameColor", (newColor) => {
    const p = players.get(socket.id);
    if (p) {
      p.nameColor = newColor;
      io.emit("nameColorUpdated", { id: socket.id, nameColor: newColor });
    }
  });

  socket.on("chatMessage", (message) => {
    const p = players.get(socket.id);
    if (p && message.trim()) {
      io.emit("chatMessage", { name: p.name, message: message.trim() });
    }
  });

  // === WORLD SYNC ===
  socket.on("requestWorld", () => {
    const zone = worldData.zones.azeroth1;
    socket.emit("worldData", zone);
  });

  socket.on("addTree", (data) => {
    const zone = worldData.zones.azeroth1;
    const newTree = {
      id: "tree_" + Date.now() + "_" + Math.floor(Math.random() * 999999),
      x: data.x,
      z: data.z,
    };
    zone.trees.push(newTree);
    saveWorld();
    io.emit("treeAdded", newTree);
  });

  socket.on("removeTree", (treeId) => {
    const zone = worldData.zones.azeroth1;
    zone.trees = zone.trees.filter((t) => t.id !== treeId);
    saveWorld();
    io.emit("treeRemoved", treeId);
  });

  // === WATER BODIES (Phase 3) ===
  socket.on("addWaterBody", (data) => {
    const zone = worldData.zones.azeroth1;
    const newWater = {
      id: "water_" + Date.now() + "_" + Math.floor(Math.random() * 999999),
      points: data.points,
      level: data.level || 102,
    };
    zone.waterBodies.push(newWater);
    saveWorld();
    io.emit("waterBodyAdded", newWater);
  });

  socket.on("removeWaterBody", (waterId) => {
    const zone = worldData.zones.azeroth1;
    zone.waterBodies = zone.waterBodies.filter((w) => w.id !== waterId);
    saveWorld();
    io.emit("waterBodyRemoved", waterId);
  });

  socket.on("updateWaterLevel", (data) => {
    const zone = worldData.zones.azeroth1;
    const water = zone.waterBodies.find((w) => w.id === data.id);
    if (water) {
      water.level = data.level;
      saveWorld();
      io.emit("waterLevelUpdated", data);
    }
  });

  socket.on("updateTerrain", (newHeights) => {
    const zone = worldData.zones.azeroth1;
    zone.terrain = newHeights;
    saveWorld();
    io.emit("terrainUpdated", newHeights);
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) {
      console.log(`❌ ${p.name} left`);
      io.emit("playerLeft", socket.id);
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Mini Azeroth server running on port ${PORT}`),
);


