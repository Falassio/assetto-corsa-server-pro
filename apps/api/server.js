const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = Number(process.env.PORT || 8080);
const WEB_ORIGIN = process.env.WEB_ORIGIN || "*";
const DATA_DIR = process.env.DATA_DIR || "/data";

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

app.use(cors({ origin: WEB_ORIGIN === "*" ? true : WEB_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

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
    }
  };
}

function handleAction(action) {
  const status = readJson(STATUS_FILE, DEFAULT_STATUS);

  switch (action) {
    case "start":
      status.status = "running";
      status.lastStart = new Date().toISOString();
      appendLine(LOG_FILE, "Server start requested from control panel");
      appendLine(AUDIT_FILE, "Action start executed");
      break;
    case "stop":
      status.status = "stopped";
      status.lastStop = new Date().toISOString();
      appendLine(LOG_FILE, "Server stop requested from control panel");
      appendLine(AUDIT_FILE, "Action stop executed");
      break;
    case "restart":
      status.status = "running";
      status.lastStart = new Date().toISOString();
      appendLine(LOG_FILE, "Server restart requested from control panel");
      appendLine(AUDIT_FILE, "Action restart executed");
      break;
    case "update":
      status.lastUpdate = new Date().toISOString();
      appendLine(LOG_FILE, "SteamCMD update requested from control panel");
      appendLine(AUDIT_FILE, "Action update executed");
      break;
    case "backup":
      appendLine(LOG_FILE, "Backup requested from control panel");
      appendLine(AUDIT_FILE, "Action backup executed");
      break;
    default:
      return null;
  }

  writeJson(STATUS_FILE, status);
  return buildOverview();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "assetto-corsa-control-api" });
});

app.get("/api/overview", (_req, res) => {
  res.json(buildOverview());
});

app.get("/api/config", (_req, res) => {
  res.json(readJson(CONFIG_FILE, DEFAULT_CONFIG));
});

app.put("/api/config", (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid config payload" });
  }
  writeJson(CONFIG_FILE, payload);
  appendLine(AUDIT_FILE, "Config updated");
  appendLine(LOG_FILE, "Configuration updated from control panel");
  return res.json({ ok: true });
});

app.get("/api/logs", (req, res) => {
  const lines = Number(req.query.lines || 200);
  res.json({ lines: tailLines(LOG_FILE, Math.max(10, Math.min(1000, lines))) });
});

app.get("/api/audit", (req, res) => {
  const lines = Number(req.query.lines || 100);
  res.json({ lines: tailLines(AUDIT_FILE, Math.max(10, Math.min(1000, lines))) });
});

app.post("/api/server/:action", (req, res) => {
  const next = handleAction(req.params.action);
  if (!next) {
    return res.status(400).json({ error: "Unsupported action" });
  }
  return res.json({ ok: true, overview: next });
});

ensureDataFiles();

app.listen(PORT, () => {
  process.stdout.write(`Control API listening on :${PORT}\n`);
});
