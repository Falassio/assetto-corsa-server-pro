const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const { exec } = require("child_process");
const { WebSocketServer } = require("ws");

const app = express();

const PORT = Number(process.env.PORT || 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN || "*";
const DATA_DIR = process.env.DATA_DIR || "/data";

const AUTH_ENABLED = process.env.AUTH_ENABLED !== "0";
const CONTROL_PANEL_USERNAME = process.env.CONTROL_PANEL_USERNAME || "admin";
const CONTROL_PANEL_PASSWORD = process.env.CONTROL_PANEL_PASSWORD || "change-me-now";
const CONTROL_PANEL_ROLE = process.env.CONTROL_PANEL_ROLE || "admin";
const CONTROL_PANEL_USERS_JSON = process.env.CONTROL_PANEL_USERS_JSON || "";
const CONTROL_PANEL_SESSION_SECRET = process.env.CONTROL_PANEL_SESSION_SECRET || "dev-insecure-secret";
const CONTROL_PANEL_TOKEN_TTL_SEC = Number(process.env.CONTROL_PANEL_TOKEN_TTL_SEC || 43200);
const CONTROL_PANEL_RATE_LIMIT_RPM = Number(process.env.CONTROL_PANEL_RATE_LIMIT_RPM || 120);

const ACTION_MODE = process.env.ACTION_MODE || "mock";
const ACTION_TIMEOUT_MS = Number(process.env.ACTION_TIMEOUT_MS || 20000);
const ACTION_START_CMD = process.env.ACTION_START_CMD || "";
const ACTION_STOP_CMD = process.env.ACTION_STOP_CMD || "";
const ACTION_RESTART_CMD = process.env.ACTION_RESTART_CMD || "";
const ACTION_UPDATE_CMD = process.env.ACTION_UPDATE_CMD || "";
const ACTION_BACKUP_CMD = process.env.ACTION_BACKUP_CMD || "";
const ALLOW_CONFIG_WRITE = process.env.ALLOW_CONFIG_WRITE !== "0";

const CURRENT_SEASON = process.env.CURRENT_SEASON || "2026-S1";
const RELEASE_CHANNEL = process.env.RELEASE_CHANNEL || "stable";
const RELEASE_VERSION = process.env.RELEASE_VERSION || "dev";
const CANARY_TARGET_PERCENT = Number(process.env.CANARY_TARGET_PERCENT || 10);
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

const STATUS_FILE = path.join(DATA_DIR, "status.json");
const CONFIG_FILE = path.join(DATA_DIR, "server-config.json");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const AUDIT_FILE = path.join(DATA_DIR, "audit.log");
const ONLINE_FILE = path.join(DATA_DIR, "online-players.json");
const LAPS_FILE = path.join(DATA_DIR, "laps.json");
const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");
const BACKUPS_FILE = path.join(DATA_DIR, "backups.json");

const DEFAULT_STATUS = {
  status: "stopped",
  lastStart: null,
  lastStop: null,
  lastUpdate: null,
  players: 0,
  maxPlayers: 24
};

const DEFAULT_CONFIG = {
  serverName: "Assetto Corsa Server Pro",
  track: "monza",
  cars: ["ks_ferrari_488_gt3", "ks_lamborghini_huracan_gt3"],
  pickupModeEnabled: true,
  loopMode: true,
  welcomeMessage: "Welcome to Assetto Corsa Server Pro"
};

const users = loadUsers();
const ipWindow = new Map();
const wsClients = new Set();

app.set("trust proxy", true);
app.use(cors({ origin: WEB_ORIGIN === "*" ? true : WEB_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(basicSecurityHeaders);
app.use(rateLimitMiddleware);

function loadUsers() {
  if (CONTROL_PANEL_USERS_JSON.trim()) {
    try {
      const parsed = JSON.parse(CONTROL_PANEL_USERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => ({
          username: String(item.username || ""),
          password: String(item.password || ""),
          role: String(item.role || "viewer")
        }));
      }
    } catch {
      process.stdout.write("Invalid CONTROL_PANEL_USERS_JSON, using single-user auth.\n");
    }
  }
  return [{ username: CONTROL_PANEL_USERNAME, password: CONTROL_PANEL_PASSWORD, role: CONTROL_PANEL_ROLE }];
}

function basicSecurityHeaders(_req, res, next) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  next();
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const minute = 60 * 1000;
  const existing = ipWindow.get(ip);

  if (!existing || now - existing.start >= minute) {
    ipWindow.set(ip, { start: now, count: 1 });
    return next();
  }

  existing.count += 1;
  if (existing.count > CONTROL_PANEL_RATE_LIMIT_RPM) {
    return res.status(429).json({ error: "Too many requests" });
  }
  return next();
}

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const defaults = [
    [STATUS_FILE, DEFAULT_STATUS],
    [CONFIG_FILE, DEFAULT_CONFIG],
    [ONLINE_FILE, []],
    [LAPS_FILE, []],
    [PROFILES_FILE, {}],
    [BACKUPS_FILE, []]
  ];

  for (const [filePath, value] of defaults) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    }
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, "");
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function appendLine(filePath, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(filePath, line);
}

function tailLines(filePath, lineCount) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n").filter(Boolean);
  return lines.slice(-lineCount);
}

function sign(payload) {
  return crypto.createHmac("sha256", CONTROL_PANEL_SESSION_SECRET).update(payload).digest("hex");
}

function issueToken(user) {
  const payload = {
    sub: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + CONTROL_PANEL_TOKEN_TTL_SEC
  };
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${raw}.${sign(raw)}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [raw, signature] = parts;
  const expected = sign(raw);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function authRequired(req, res, next) {
  if (!AUTH_ENABLED) {
    req.user = { sub: "local", role: "admin" };
    return next();
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const claims = verifyToken(token);
  if (!claims) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = claims;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

function buildOverview() {
  const status = readJson(STATUS_FILE, DEFAULT_STATUS);
  const online = readJson(ONLINE_FILE, []);
  const now = Date.now();
  const lastStartMs = status.lastStart ? Date.parse(status.lastStart) : null;
  const uptimeSeconds = status.status === "running" && lastStartMs ? Math.max(0, Math.floor((now - lastStartMs) / 1000)) : 0;

  return {
    ...status,
    players: online.length,
    uptimeSeconds,
    host: os.hostname(),
    cpuLoad1m: Number(os.loadavg()[0].toFixed(2)),
    memory: {
      totalMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMb: Math.round(os.freemem() / 1024 / 1024)
    },
    actionMode: ACTION_MODE,
    authEnabled: AUTH_ENABLED,
    release: {
      version: RELEASE_VERSION,
      channel: RELEASE_CHANNEL,
      canaryTargetPercent: CANARY_TARGET_PERCENT
    }
  };
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

async function notifyAlert(level, title, details) {
  if (!ALERT_WEBHOOK_URL) {
    return;
  }
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        title,
        details,
        service: "assetto-corsa-control-api",
        host: os.hostname(),
        timestamp: new Date().toISOString()
      })
    });
  } catch {
    appendLine(AUDIT_FILE, "Alert webhook delivery failed");
  }
}

function getCommandForAction(action) {
  const map = {
    start: ACTION_START_CMD,
    stop: ACTION_STOP_CMD,
    restart: ACTION_RESTART_CMD,
    update: ACTION_UPDATE_CMD,
    backup: ACTION_BACKUP_CMD
  };
  return map[action] || "";
}

function runShell(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: ACTION_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr || stdout || error.message;
        reject(new Error(detail.trim()));
        return;
      }
      resolve((stdout || "").trim());
    });
  });
}

function normalizePlayerId(input) {
  const candidate = String(input || "").trim();
  if (candidate) {
    return candidate;
  }
  return `player_${crypto.randomUUID()}`;
}

function computeBaseLeaderboard({ track, car, limit = 20 }) {
  const laps = readJson(LAPS_FILE, []);
  const filtered = laps.filter((lap) => {
    if (!lap.valid) {
      return false;
    }
    if (track && lap.track !== track) {
      return false;
    }
    if (car && lap.car !== car) {
      return false;
    }
    return true;
  });

  const bestByPlayer = new Map();
  for (const lap of filtered) {
    const existing = bestByPlayer.get(lap.playerId);
    if (!existing || lap.lapTimeMs < existing.lapTimeMs) {
      bestByPlayer.set(lap.playerId, lap);
    }
  }

  const rows = Array.from(bestByPlayer.values())
    .sort((a, b) => a.lapTimeMs - b.lapTimeMs)
    .slice(0, limit)
    .map((lap, index) => ({
      rank: index + 1,
      playerId: lap.playerId,
      playerName: lap.playerName,
      track: lap.track,
      car: lap.car,
      lapTimeMs: lap.lapTimeMs,
      timestamp: lap.timestamp
    }));

  return rows;
}

function computeSeasonRanking(season, limit = 20) {
  const laps = readJson(LAPS_FILE, []);
  const profiles = readJson(PROFILES_FILE, {});
  const pointsTable = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  const seasonalLaps = laps.filter((lap) => lap.valid && lap.season === season);
  const groupedByTrack = new Map();
  for (const lap of seasonalLaps) {
    if (!groupedByTrack.has(lap.track)) {
      groupedByTrack.set(lap.track, []);
    }
    groupedByTrack.get(lap.track).push(lap);
  }

  const totals = new Map();

  for (const [, trackLaps] of groupedByTrack.entries()) {
    const bestByPlayer = new Map();
    for (const lap of trackLaps) {
      const existing = bestByPlayer.get(lap.playerId);
      if (!existing || lap.lapTimeMs < existing.lapTimeMs) {
        bestByPlayer.set(lap.playerId, lap);
      }
    }

    const ranking = Array.from(bestByPlayer.values()).sort((a, b) => a.lapTimeMs - b.lapTimeMs);
    ranking.forEach((lap, index) => {
      const points = pointsTable[index] || 0;
      if (!totals.has(lap.playerId)) {
        totals.set(lap.playerId, { playerId: lap.playerId, playerName: lap.playerName, points: 0, podiums: 0 });
      }
      const row = totals.get(lap.playerId);
      row.points += points;
      if (index < 3) {
        row.podiums += 1;
      }
    });
  }

  const rows = Array.from(totals.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      ...row,
      profile: profiles[row.playerId] || null
    }));

  return rows;
}

function recordLap(payload, actor) {
  const laps = readJson(LAPS_FILE, []);
  const profiles = readJson(PROFILES_FILE, {});

  const playerId = normalizePlayerId(payload.playerId || payload.playerName);
  const lap = {
    id: crypto.randomUUID(),
    playerId,
    playerName: String(payload.playerName || playerId),
    track: String(payload.track || "unknown"),
    car: String(payload.car || "unknown"),
    lapTimeMs: Number(payload.lapTimeMs || 0),
    valid: payload.valid !== false,
    season: String(payload.season || CURRENT_SEASON),
    timestamp: new Date().toISOString(),
    source: actor
  };

  if (!Number.isFinite(lap.lapTimeMs) || lap.lapTimeMs <= 0) {
    throw new Error("Invalid lapTimeMs");
  }

  laps.push(lap);
  writeJson(LAPS_FILE, laps);

  if (!profiles[playerId]) {
    profiles[playerId] = {
      playerId,
      playerName: lap.playerName,
      firstSeen: lap.timestamp,
      totalLaps: 0,
      validLaps: 0,
      bestLapMs: null,
      favoriteTrack: lap.track,
      favoriteCar: lap.car,
      seasons: {}
    };
  }

  const profile = profiles[playerId];
  profile.playerName = lap.playerName;
  profile.totalLaps += 1;
  if (lap.valid) {
    profile.validLaps += 1;
    if (!profile.bestLapMs || lap.lapTimeMs < profile.bestLapMs) {
      profile.bestLapMs = lap.lapTimeMs;
    }
  }

  if (!profile.seasons[lap.season]) {
    profile.seasons[lap.season] = { laps: 0, bestLapMs: null };
  }
  profile.seasons[lap.season].laps += 1;
  if (lap.valid) {
    const currentBest = profile.seasons[lap.season].bestLapMs;
    if (!currentBest || lap.lapTimeMs < currentBest) {
      profile.seasons[lap.season].bestLapMs = lap.lapTimeMs;
    }
  }

  writeJson(PROFILES_FILE, profiles);
  appendLine(AUDIT_FILE, `Lap ingested by ${actor}: ${lap.playerName} ${lap.track} ${lap.lapTimeMs}ms`);
  broadcast("lap.new", lap);

  return lap;
}

function updateOnlinePlayers(payload, actor) {
  if (!Array.isArray(payload.players)) {
    throw new Error("players array is required");
  }

  const normalized = payload.players.map((player) => ({
    playerId: normalizePlayerId(player.playerId || player.name),
    name: String(player.name || "Unknown"),
    car: String(player.car || "unknown"),
    track: String(player.track || "unknown"),
    connectedAt: String(player.connectedAt || new Date().toISOString()),
    lastSeen: new Date().toISOString()
  }));

  writeJson(ONLINE_FILE, normalized);

  const status = readJson(STATUS_FILE, DEFAULT_STATUS);
  status.players = normalized.length;
  writeJson(STATUS_FILE, status);

  appendLine(AUDIT_FILE, `Online players updated by ${actor}: count=${normalized.length}`);
  broadcast("players.online", normalized);
  broadcast("overview", buildOverview());

  return normalized;
}

function getBackupEntries() {
  return readJson(BACKUPS_FILE, []);
}

function addBackupEntry(entry) {
  const backups = getBackupEntries();
  backups.unshift(entry);
  writeJson(BACKUPS_FILE, backups.slice(0, 200));
}

function verifyBackupFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file not found: ${resolved}`);
  }
  const data = fs.readFileSync(resolved);
  const checksum = crypto.createHash("sha256").update(data).digest("hex");
  const stats = fs.statSync(resolved);

  const entry = {
    id: crypto.randomUUID(),
    filePath: resolved,
    sizeBytes: stats.size,
    checksumSha256: checksum,
    verifiedAt: new Date().toISOString()
  };

  addBackupEntry(entry);
  return entry;
}

async function handleAction(action, actor) {
  const status = readJson(STATUS_FILE, DEFAULT_STATUS);

  if (!["start", "stop", "restart", "update", "backup"].includes(action)) {
    return null;
  }

  let output = "";
  if (ACTION_MODE === "command") {
    const command = getCommandForAction(action);
    if (!command) {
      throw new Error(`Missing command for action: ${action}`);
    }
    output = await runShell(command);
    if (output) {
      appendLine(LOG_FILE, `Command output (${action}): ${output}`);
    }
  }

  if (action === "start") {
    status.status = "running";
    status.lastStart = new Date().toISOString();
  }
  if (action === "stop") {
    status.status = "stopped";
    status.lastStop = new Date().toISOString();
  }
  if (action === "restart") {
    status.status = "running";
    status.lastStart = new Date().toISOString();
  }
  if (action === "update") {
    status.lastUpdate = new Date().toISOString();
  }

  if (action === "backup") {
    const backupPath = output && fs.existsSync(output) ? output : null;
    addBackupEntry({
      id: crypto.randomUUID(),
      requestedBy: actor,
      createdAt: new Date().toISOString(),
      commandOutput: output || null,
      filePath: backupPath,
      verified: false
    });
  }

  writeJson(STATUS_FILE, status);
  appendLine(LOG_FILE, `Action ${action} requested by ${actor}`);
  appendLine(AUDIT_FILE, `Action ${action} executed by ${actor}`);

  const overview = buildOverview();
  broadcast("action.executed", { action, actor, overview });
  broadcast("overview", overview);
  await notifyAlert("info", `Action executed: ${action}`, { actor, action, mode: ACTION_MODE });

  return overview;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "assetto-corsa-control-api" });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const match = users.find((u) => u.username === username && u.password === password);

  if (!AUTH_ENABLED) {
    const localUser = { username: "local", role: "admin" };
    return res.json({ token: issueToken(localUser), user: localUser });
  }

  if (!match) {
    appendLine(AUDIT_FILE, `Failed login for username=${username || "unknown"}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  appendLine(AUDIT_FILE, `Successful login username=${match.username}`);
  return res.json({ token: issueToken(match), user: { username: match.username, role: match.role } });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ username: req.user.sub, role: req.user.role });
});

app.get("/api/overview", authRequired, (req, res) => {
  res.json(buildOverview());
});

app.get("/api/config", authRequired, (req, res) => {
  res.json(readJson(CONFIG_FILE, DEFAULT_CONFIG));
});

app.put("/api/config", authRequired, requireRole("admin", "operator"), (req, res) => {
  if (!ALLOW_CONFIG_WRITE) {
    return res.status(403).json({ error: "Config write is disabled" });
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid config payload" });
  }

  writeJson(CONFIG_FILE, payload);
  appendLine(AUDIT_FILE, `Config updated by ${req.user.sub}`);
  appendLine(LOG_FILE, `Configuration updated from control panel by ${req.user.sub}`);
  broadcast("config.updated", payload);

  return res.json({ ok: true });
});

app.get("/api/logs", authRequired, (req, res) => {
  const lines = Number(req.query.lines || 200);
  res.json({ lines: tailLines(LOG_FILE, Math.max(10, Math.min(1000, lines))) });
});

app.get("/api/audit", authRequired, requireRole("admin", "operator"), (req, res) => {
  const lines = Number(req.query.lines || 100);
  res.json({ lines: tailLines(AUDIT_FILE, Math.max(10, Math.min(1000, lines))) });
});

app.post("/api/server/:action", authRequired, requireRole("admin", "operator"), async (req, res) => {
  try {
    const next = await handleAction(req.params.action, req.user.sub);
    if (!next) {
      return res.status(400).json({ error: "Unsupported action" });
    }
    return res.json({ ok: true, overview: next });
  } catch (error) {
    appendLine(AUDIT_FILE, `Action ${req.params.action} failed for ${req.user.sub}: ${error.message}`);
    await notifyAlert("error", `Action failed: ${req.params.action}`, { actor: req.user.sub, error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/telemetry/online", authRequired, (req, res) => {
  res.json({ players: readJson(ONLINE_FILE, []) });
});

app.post("/api/telemetry/online", authRequired, requireRole("admin", "operator"), (req, res) => {
  try {
    const players = updateOnlinePlayers(req.body || {}, req.user.sub);
    return res.json({ ok: true, players });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/telemetry/lap", authRequired, requireRole("admin", "operator"), (req, res) => {
  try {
    const lap = recordLap(req.body || {}, req.user.sub);
    const seasonRanking = computeSeasonRanking(lap.season, 10);
    broadcast("ranking.season", seasonRanking);
    return res.json({ ok: true, lap });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/leaderboard/base", authRequired, (req, res) => {
  const rows = computeBaseLeaderboard({
    track: req.query.track ? String(req.query.track) : "",
    car: req.query.car ? String(req.query.car) : "",
    limit: Number(req.query.limit || 20)
  });
  res.json({ rows });
});

app.get("/api/ranking/seasonal", authRequired, (req, res) => {
  const season = String(req.query.season || CURRENT_SEASON);
  const rows = computeSeasonRanking(season, Number(req.query.limit || 20));
  res.json({ season, rows });
});

app.get("/api/profiles/:playerId", authRequired, (req, res) => {
  const profiles = readJson(PROFILES_FILE, {});
  const profile = profiles[req.params.playerId];
  if (!profile) {
    return res.status(404).json({ error: "Player not found" });
  }
  return res.json(profile);
});

app.get("/api/backups", authRequired, requireRole("admin", "operator"), (_req, res) => {
  res.json({ rows: getBackupEntries() });
});

app.post("/api/backups/verify", authRequired, requireRole("admin", "operator"), (req, res) => {
  try {
    const filePath = String(req.body?.filePath || "").trim();
    if (!filePath) {
      return res.status(400).json({ error: "filePath is required" });
    }
    const entry = verifyBackupFile(filePath);
    appendLine(AUDIT_FILE, `Backup verified by ${req.user.sub}: ${entry.filePath}`);
    return res.json({ ok: true, entry });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get("/api/ops/canary", authRequired, requireRole("admin", "operator"), (_req, res) => {
  const overview = buildOverview();
  const checks = {
    serviceHealthy: overview.status === "running",
    releaseChannel: RELEASE_CHANNEL,
    canaryTargetPercent: CANARY_TARGET_PERCENT,
    recommended: RELEASE_CHANNEL === "canary" ? "Monitor errors and promote when stable" : "Stable channel active"
  };
  res.json(checks);
});

app.get("/public/online", (_req, res) => {
  const players = readJson(ONLINE_FILE, []);
  res.json({
    server: readJson(CONFIG_FILE, DEFAULT_CONFIG).serverName,
    online: players.length,
    players
  });
});

app.get("/public/leaderboard", (_req, res) => {
  const rows = computeBaseLeaderboard({
    track: _req.query.track ? String(_req.query.track) : "",
    car: _req.query.car ? String(_req.query.car) : "",
    limit: Number(_req.query.limit || 10)
  });
  res.json({ rows });
});

app.get("/public/ranking", (_req, res) => {
  const season = String(_req.query.season || CURRENT_SEASON);
  const rows = computeSeasonRanking(season, Number(_req.query.limit || 10));
  res.json({ season, rows });
});

app.get("/widget/online.js", (req, res) => {
  const widgetId = String(req.query.id || "acsp-widget");
  res.type("application/javascript").send(`(function(){
  var target = document.getElementById(${JSON.stringify(widgetId)});
  if(!target){return;}
  target.style.fontFamily='Inter,Segoe UI,sans-serif';
  target.style.padding='10px 12px';
  target.style.border='1px solid #2b3850';
  target.style.borderRadius='10px';
  target.style.background='linear-gradient(180deg,#1a2436,#0f1520)';
  target.style.color='#d6e1f2';
  function render(data){
    target.innerHTML = '<strong>'+data.server+'</strong><div style="margin-top:6px">Online: '+data.online+'</div>';
  }
  fetch('/public/online').then(function(r){return r.json();}).then(render);
  var wsProto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  var ws = new WebSocket(wsProto + location.host + '/ws');
  ws.onmessage = function(ev){
    try{
      var msg = JSON.parse(ev.data);
      if(msg.type === 'players.online' || msg.type === 'overview'){
        fetch('/public/online').then(function(r){return r.json();}).then(render);
      }
    }catch(e){}
  };
})();`);
});

ensureDataFiles();

if (CONTROL_PANEL_PASSWORD === "change-me-now" && AUTH_ENABLED) {
  process.stdout.write("WARNING: default CONTROL_PANEL_PASSWORD in use. Change it in .env\n");
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit("connection", client, request);
  });
});

wss.on("connection", (client) => {
  wsClients.add(client);
  client.send(JSON.stringify({ type: "snapshot", payload: { overview: buildOverview(), online: readJson(ONLINE_FILE, []) } }));
  client.on("close", () => {
    wsClients.delete(client);
  });
});

server.listen(PORT, () => {
  process.stdout.write(`Control API listening on :${PORT}\n`);
});
