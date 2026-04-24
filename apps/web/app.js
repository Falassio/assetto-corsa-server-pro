const loginView = document.getElementById("loginView");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginMessage = document.getElementById("loginMessage");

const currentUser = document.getElementById("currentUser");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const saveConfigBtn = document.getElementById("saveConfigBtn");
const configEditor = document.getElementById("configEditor");
const actionResult = document.getElementById("actionResult");

const statusBadge = document.getElementById("statusBadge");
const uptimeValue = document.getElementById("uptimeValue");
const playersValue = document.getElementById("playersValue");
const maxPlayersValue = document.getElementById("maxPlayersValue");
const hostValue = document.getElementById("hostValue");
const cpuValue = document.getElementById("cpuValue");
const memoryValue = document.getElementById("memoryValue");
const logsBox = document.getElementById("logsBox");
const auditBox = document.getElementById("auditBox");

const onlinePlayers = document.getElementById("onlinePlayers");
const leaderboardTable = document.getElementById("leaderboardTable");
const seasonTable = document.getElementById("seasonTable");
const profileBox = document.getElementById("profileBox");
const opsBox = document.getElementById("opsBox");

const lbTrack = document.getElementById("lbTrack");
const lbCar = document.getElementById("lbCar");
const loadLeaderboardBtn = document.getElementById("loadLeaderboardBtn");
const seasonInput = document.getElementById("seasonInput");
const loadSeasonBtn = document.getElementById("loadSeasonBtn");
const profileInput = document.getElementById("profileInput");
const loadProfileBtn = document.getElementById("loadProfileBtn");
const backupPathInput = document.getElementById("backupPathInput");
const verifyBackupBtn = document.getElementById("verifyBackupBtn");
const loadCanaryBtn = document.getElementById("loadCanaryBtn");

const TOKEN_KEY = "acsp_token";
let refreshTimer = null;
let ws = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function formatMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "-";
  }
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${seconds}`;
}

function tableHtml(headers, rows) {
  const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (response.status === 401) {
    logout();
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  return response.json();
}

function setStatusBadge(status) {
  statusBadge.textContent = status;
  statusBadge.classList.remove("running", "stopped");
  statusBadge.classList.add(status === "running" ? "running" : "stopped");
}

async function loadOverview() {
  const overview = await api("/api/overview");
  setStatusBadge(overview.status);
  uptimeValue.textContent = formatUptime(overview.uptimeSeconds || 0);
  playersValue.textContent = String(overview.players || 0);
  maxPlayersValue.textContent = String(overview.maxPlayers || 0);
  hostValue.textContent = `${overview.host || "-"} (${overview.release?.channel || "stable"})`;
  cpuValue.textContent = String(overview.cpuLoad1m || 0);
  memoryValue.textContent = `${overview.memory.freeMb || 0} / ${overview.memory.totalMb || 0} MB free`;
}

async function loadConfig() {
  const config = await api("/api/config");
  configEditor.value = JSON.stringify(config, null, 2);
}

async function loadLogs() {
  const payload = await api("/api/logs?lines=250");
  logsBox.textContent = payload.lines.join("\n");
  logsBox.scrollTop = logsBox.scrollHeight;
}

async function loadAudit() {
  const payload = await api("/api/audit?lines=250");
  auditBox.textContent = payload.lines.join("\n");
}

async function loadOnlinePlayers() {
  const payload = await api("/api/telemetry/online");
  const rows = payload.players.map((p) => [p.playerId, p.name, p.car, p.track, new Date(p.lastSeen).toLocaleTimeString()]);
  onlinePlayers.innerHTML = tableHtml(["Player ID", "Name", "Car", "Track", "Last Seen"], rows.length ? rows : [["-", "No players", "-", "-", "-"]]);
}

async function loadLeaderboard() {
  const track = lbTrack.value.trim();
  const car = lbCar.value.trim();
  const query = new URLSearchParams();
  if (track) query.set("track", track);
  if (car) query.set("car", car);
  const payload = await api(`/api/leaderboard/base?${query.toString()}`);
  const rows = payload.rows.map((r) => [r.rank, r.playerName, r.track, r.car, formatMs(r.lapTimeMs)]);
  leaderboardTable.innerHTML = tableHtml(["Rank", "Driver", "Track", "Car", "Lap"], rows.length ? rows : [["-", "No data", "-", "-", "-"]]);
}

async function loadSeasonRanking() {
  const season = seasonInput.value.trim();
  const query = new URLSearchParams();
  if (season) query.set("season", season);
  const payload = await api(`/api/ranking/seasonal?${query.toString()}`);
  const rows = payload.rows.map((r) => [r.rank, r.playerName, r.points, r.podiums]);
  seasonTable.innerHTML = tableHtml(["Rank", "Driver", "Points", "Podiums"], rows.length ? rows : [["-", "No data", "-", "-"]]);
}

async function loadProfile() {
  const playerId = profileInput.value.trim();
  if (!playerId) {
    profileBox.textContent = "Enter a player ID";
    return;
  }
  const payload = await api(`/api/profiles/${encodeURIComponent(playerId)}`);
  profileBox.textContent = JSON.stringify(payload, null, 2);
}

async function verifyBackup() {
  const filePath = backupPathInput.value.trim();
  if (!filePath) {
    opsBox.textContent = "Backup file path is required.";
    return;
  }
  const payload = await api("/api/backups/verify", {
    method: "POST",
    body: JSON.stringify({ filePath })
  });
  opsBox.textContent = JSON.stringify(payload, null, 2);
}

async function loadCanaryStatus() {
  const payload = await api("/api/ops/canary");
  opsBox.textContent = JSON.stringify(payload, null, 2);
}

async function runAction(action) {
  actionResult.textContent = `Running action: ${action}...`;
  await api(`/api/server/${action}`, { method: "POST" });
  actionResult.textContent = `Action completed: ${action}`;
  await refreshAll();
}

async function saveConfig() {
  let parsed;
  try {
    parsed = JSON.parse(configEditor.value);
  } catch {
    actionResult.textContent = "Invalid JSON config";
    return;
  }

  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify(parsed)
  });
  actionResult.textContent = "Config saved";
  await refreshAll();
}

function connectRealtime() {
  if (ws) {
    ws.close();
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (["players.online", "lap.new", "action.executed", "snapshot", "overview", "ranking.season"].includes(msg.type)) {
        loadOverview().catch(() => {});
        loadOnlinePlayers().catch(() => {});
        loadLeaderboard().catch(() => {});
        loadSeasonRanking().catch(() => {});
      }
    } catch {
      // no-op
    }
  };
}

async function refreshAll() {
  try {
    await Promise.all([
      loadOverview(),
      loadConfig(),
      loadLogs(),
      loadAudit(),
      loadOnlinePlayers(),
      loadLeaderboard(),
      loadSeasonRanking()
    ]);
  } catch (error) {
    actionResult.textContent = `Error: ${error.message}`;
  }
}

function showApp(user) {
  loginView.classList.add("hidden");
  appShell.classList.remove("hidden");
  currentUser.textContent = `${user.username} (${user.role})`;
  refreshAll();
  connectRealtime();

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(() => {
    loadOverview().catch(() => {});
    loadLogs().catch(() => {});
  }, 10000);
}

function logout() {
  setToken("");
  appShell.classList.add("hidden");
  loginView.classList.remove("hidden");
  currentUser.textContent = "";
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

async function login(username, password) {
  const payload = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    headers: {}
  });
  setToken(payload.token);
  showApp(payload.user);
}

async function hydrateSession() {
  const token = getToken();
  if (!token) {
    logout();
    return;
  }
  try {
    const user = await api("/api/auth/me");
    showApp(user);
  } catch {
    logout();
  }
}

refreshBtn.addEventListener("click", refreshAll);
logoutBtn.addEventListener("click", logout);
saveConfigBtn.addEventListener("click", saveConfig);
loadLeaderboardBtn.addEventListener("click", loadLeaderboard);
loadSeasonBtn.addEventListener("click", loadSeasonRanking);
loadProfileBtn.addEventListener("click", loadProfile);
verifyBackupBtn.addEventListener("click", verifyBackup);
loadCanaryBtn.addEventListener("click", loadCanaryStatus);

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => runAction(button.dataset.action));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in...";
  try {
    await login(usernameInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
    loginMessage.textContent = "Signed in.";
  } catch (error) {
    loginMessage.textContent = `Login failed: ${error.message}`;
  }
});

hydrateSession();
