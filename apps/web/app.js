const refreshBtn = document.getElementById("refreshBtn");
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
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
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

refreshBtn.addEventListener("click", refreshAll);
saveConfigBtn.addEventListener("click", saveConfig);

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", () => runAction(button.dataset.action));
});

refreshAll();
setInterval(() => {
  loadOverview().catch(() => {});
  loadLogs().catch(() => {});
}, 10000);
