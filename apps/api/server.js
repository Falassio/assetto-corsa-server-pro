const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");

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

const STATUS_FILE = path.join(DATA_DIR, "status.json");
const CONFIG_FILE = path.join(DATA_DIR, "server-config.json");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const AUDIT_FILE = path.join(DATA_DIR, "audit.log");

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
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:");
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
  if (!fs.existsSync(STATUS_FILE)) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(DEFAULT_STATUS, null, 2));
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
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
  const now = Date.now();
  const lastStartMs = status.lastStart ? Date.parse(status.lastStart) : null;
  const uptimeSeconds = status.status === "running" && lastStartMs ? Math.max(0, Math.floor((now - lastStartMs) / 1000)) : 0;

  return {
    ...status,
    uptimeSeconds,
    host: os.hostname(),
    cpuLoad1m: Number(os.loadavg()[0].toFixed(2)),
    memory: {
      totalMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMb: Math.round(os.freemem() / 1024 / 1024)
    },
    actionMode: ACTION_MODE,
    authEnabled: AUTH_ENABLED
  };
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

async function handleAction(action, actor) {
  const status = readJson(STATUS_FILE, DEFAULT_STATUS);

  if (!["start", "stop", "restart", "update", "backup"].includes(action)) {
    return null;
  }

  if (ACTION_MODE === "command") {
    const command = getCommandForAction(action);
    if (!command) {
      throw new Error(`Missing command for action: ${action}`);
    }
    const output = await runShell(command);
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

  writeJson(STATUS_FILE, status);
  appendLine(LOG_FILE, `Action ${action} requested by ${actor}`);
  appendLine(AUDIT_FILE, `Action ${action} executed by ${actor}`);
  return buildOverview();
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
    return res.status(500).json({ error: error.message });
  }
});

ensureDataFiles();

if (CONTROL_PANEL_PASSWORD === "change-me-now" && AUTH_ENABLED) {
  process.stdout.write("WARNING: default CONTROL_PANEL_PASSWORD in use. Change it in .env\n");
}

app.listen(PORT, () => {
  process.stdout.write(`Control API listening on :${PORT}\n`);
});
