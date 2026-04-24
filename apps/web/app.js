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

const TOKEN_KEY = "acsp_token";
let refreshTimer = null;

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
  hostValue.textContent = overview.host || "-";
  cpuValue.textContent = String(overview.cpuLoad1m || 0);
  memoryValue.textContent = `${overview.memory.freeMb || 0} / ${overview.memory.totalMb || 0} MB free`;
}

async function loadConfig() {
  const config = await api("/api/config");
  configEditor.value = JSON.stringify(config, null, 2);
}

async function loadLogs() {
  const payload = await api("/api/logs?lines=300");
  logsBox.textContent = payload.lines.join("\n");
  logsBox.scrollTop = logsBox.scrollHeight;
}

async function loadAudit() {
  const payload = await api("/api/audit?lines=300");
  auditBox.textContent = payload.lines.join("\n");
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

async function refreshAll() {
  try {
    await Promise.all([loadOverview(), loadConfig(), loadLogs(), loadAudit()]);
  } catch (error) {
    actionResult.textContent = `Error: ${error.message}`;
  }
}

function showApp(user) {
  loginView.classList.add("hidden");
  appShell.classList.remove("hidden");
  currentUser.textContent = `${user.username} (${user.role})`;
  refreshAll();

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
