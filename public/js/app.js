// GTPS Cloud Control Panel Application Logic
let currentTab = 'dashboard';
let playerPage = 1;
let worldPage = 1;
let activePlayerJson = null;
let activePlayerFilename = '';
let activeScriptPath = '';
let activeConfigFile = '';
let searchDebounceTimer = null;

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchServerStatus();
  fetchLogs();
  loadPlayers(1);
  loadWorlds(1);
  loadGuilds();
  loadScripts();
  loadConfigs();
  loadHosts();
  loadBackups();

  // Periodic status poll
  setInterval(fetchServerStatus, 3000);
  setInterval(() => {
    if (currentTab === 'console' || currentTab === 'dashboard') {
      fetchLogs();
    }
  }, 2500);
});

// Toast Manager
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `gt-toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✔' : type === 'error' ? '✖' : 'ℹ'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Theme Switcher
function initTheme() {
  const saved = localStorage.getItem('gt_theme');
  if (saved === 'dark-mode') {
    document.documentElement.setAttribute('data-theme', 'dark-mode');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark-mode' ? 'default' : 'dark-mode';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gt_theme', next);
  showToast(`Switched to ${next === 'dark-mode' ? 'Dark Theme' : 'GT Blue Theme'}`, 'info');
}

// Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.style.display = 'block';

  document.querySelectorAll('.gt-nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabId) el.classList.add('active');
    else el.classList.remove('active');
  });

  if (tabId === 'console') fetchLogs();
  if (tabId === 'backups') loadBackups();
  if (tabId === 'configs') switchConfigSubTab('visual');
}

// Fetch Server Status
async function fetchServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // Nav Status
    const navBadge = document.getElementById('navStatusBadge');
    const navText = document.getElementById('navStatusText');
    const isOnline = data.status === 'ONLINE';

    navBadge.className = `gt-status-badge ${isOnline ? 'online' : 'offline'}`;
    navText.innerText = data.status;

    // Sidebar IP
    document.getElementById('sidebarIpDisplay').innerText = `${data.host}:${data.port}`;

    // Counters
    document.getElementById('dashOnlinePlayers').innerText = data.onlineCount || 0;
    document.getElementById('dashTotalPlayers').innerText = data.totalPlayers || 0;
    document.getElementById('dashTotalWorlds').innerText = data.totalWorlds || 0;
    document.getElementById('dashTotalGuilds').innerText = data.totalGuilds || 0;

    document.getElementById('sidePlayerBadge').innerText = data.totalPlayers || 0;
    document.getElementById('sideWorldBadge').innerText = data.totalWorlds || 0;
    document.getElementById('sideGuildBadge').innerText = data.totalGuilds || 0;
    document.getElementById('secAdminCount').innerText = data.totalGuilds || 0;

    // System Specs
    if (data.system) {
      document.getElementById('sysCpuModel').innerText = `${data.system.cpus} Cores`;
      document.getElementById('sysRamUsage').innerText = `${data.system.usedMem} / ${data.system.totalMem} (${data.system.memoryUsagePercent}%)`;
      document.getElementById('sysPlatform').innerText = `${data.system.platform.toUpperCase()} 64-bit`;
    }

    if (data.uptime) {
      const hrs = Math.floor(data.uptime / 3600);
      const mins = Math.floor((data.uptime % 3600) / 60);
      const secs = data.uptime % 60;
      document.getElementById('sysUptime').innerText = `${hrs}h ${mins}m ${secs}s`;
    } else {
      document.getElementById('sysUptime').innerText = isOnline ? 'Running' : 'Stopped';
    }

  } catch (err) {
    const navBadge = document.getElementById('navStatusBadge');
    navBadge.className = 'gt-status-badge offline';
    document.getElementById('navStatusText').innerText = 'OFFLINE';
  }
}

// Server Lifecycle Actions
async function serverAction(action) {
  showToast(`Executing server ${action}...`, 'info');
  try {
    const res = await fetch(`/api/server/${action}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      fetchServerStatus();
      fetchLogs();
    } else {
      showToast(data.message || 'Action failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to backend server', 'error');
  }
}

// Fetch & Render Logs
async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    const fullTerminal = document.getElementById('fullTerminal');
    const miniTerminal = document.getElementById('miniTerminal');

    if (data.lines && data.lines.length > 0) {
      const logHtml = data.lines.map(line => {
        let cls = '';
        if (line.toLowerCase().includes('error') || line.toLowerCase().includes('crash')) cls = 'error';
        else if (line.toLowerCase().includes('warn')) cls = 'warn';
        else if (line.toLowerCase().includes('info') || line.toLowerCase().includes('success')) cls = 'info';
        return `<div class="gt-terminal-line ${cls}">${escapeHtml(line)}</div>`;
      }).join('');

      if (fullTerminal) {
        const atBottom = fullTerminal.scrollHeight - fullTerminal.scrollTop <= fullTerminal.clientHeight + 50;
        fullTerminal.innerHTML = logHtml;
        if (atBottom) fullTerminal.scrollTop = fullTerminal.scrollHeight;
      }

      if (miniTerminal) {
        miniTerminal.innerHTML = logHtml;
        miniTerminal.scrollTop = miniTerminal.scrollHeight;
      }
    }
  } catch (e) {}
}

function clearConsole() {
  document.getElementById('fullTerminal').innerHTML = '<div class="gt-terminal-line info">Console cleared.</div>';
}

function copyConsoleLogs() {
  const terminal = document.getElementById('fullTerminal');
  navigator.clipboard.writeText(terminal.innerText);
  showToast('Console logs copied to clipboard!', 'success');
}

function handleCmdKeyDown(e) {
  if (e.key === 'Enter') sendConsoleCommand();
}

function sendConsoleCommand() {
  const input = document.getElementById('cmdInput');
  const cmd = input.value.trim();
  if (!cmd) return;

  const terminal = document.getElementById('fullTerminal');
  terminal.innerHTML += `<div class="gt-terminal-line info">> ${escapeHtml(cmd)}</div>`;
  terminal.scrollTop = terminal.scrollHeight;
  input.value = '';
  showToast(`Command sent: ${cmd}`, 'success');
}

// Player Management
function debouncePlayerSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadPlayers(1), 300);
}

async function loadPlayers(page = 1) {
  playerPage = page;
  const search = document.getElementById('playerSearchInput')?.value || '';
  const role = document.getElementById('playerRoleFilter')?.value || '';
  const tbody = document.getElementById('playerTableBody');

  try {
    const res = await fetch(`/api/players?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}&page=${page}&limit=20`);
    const data = await res.json();

    document.getElementById('playerTotalCounter').innerText = `Total: ${data.total}`;
    document.getElementById('playerPageInfo').innerText = `Page ${data.page} of ${data.totalPages || 1}`;
    document.getElementById('playerPrevBtn').disabled = data.page <= 1;
    document.getElementById('playerNextBtn').disabled = data.page >= data.totalPages;

    if (!data.players || data.players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">No players found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.players.map(p => {
      let roleLabel = '<span style="color: var(--gt-text-muted);">Player</span>';
      if (p.isAdmin) roleLabel = '<span style="color: #ff3333; font-weight: 800;">ADMIN</span>';
      else if (p.isMod) roleLabel = '<span style="color: #fdcc04; font-weight: 800;">MOD</span>';
      else if (p.isVIP) roleLabel = '<span style="color: #a5e3fb; font-weight: 800;">VIP</span>';

      const statusBadge = p.isBanned 
        ? '<span style="color: #ff4d4d;">🚫 Banned</span>' 
        : '<span style="color: #49fc00;">Active</span>';

      return `
        <tr>
          <td><strong style="color: #fff;">${escapeHtml(p.name)}</strong></td>
          <td>${p.level}</td>
          <td>💎 ${p.gems.toLocaleString()}</td>
          <td>${roleLabel}</td>
          <td><code>${escapeHtml(p.ip)}</code></td>
          <td>${escapeHtml(p.lastOnline)}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="gt-btn gt-btn-sm" onclick="openPlayerModal('${encodeURIComponent(p.filename)}')">✏ Edit</button>
            <button class="gt-btn gt-btn-sm gt-btn-red" onclick="deletePlayer('${encodeURIComponent(p.filename)}')">🗑</button>
          </td>
        </tr>
      `;
    }).join('');

    // Populate security banned table if needed
    const banned = data.players.filter(p => p.isBanned);
    document.getElementById('secBannedCount').innerText = banned.length;
    const secBody = document.getElementById('bannedTableBody');
    if (secBody) {
      secBody.innerHTML = banned.length ? banned.map(b => `
        <tr>
          <td><strong>${escapeHtml(b.name)}</strong></td>
          <td><code>${escapeHtml(b.ip)}</code></td>
          <td>${b.level}</td>
          <td>Account Restriction / Ban Flag</td>
          <td>
            <button class="gt-btn gt-btn-sm gt-btn-green" onclick="openPlayerModal('${encodeURIComponent(b.filename)}')">Review / Unban</button>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="5" style="text-align: center; padding: 20px;">No banned accounts currently.</td></tr>`;
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ff6b6b; padding: 20px;">Error loading players: ${err.message}</td></tr>`;
  }
}

function changePlayerPage(delta) {
  loadPlayers(playerPage + delta);
}

// Player Modal Editor
async function openPlayerModal(filename) {
  try {
    const res = await fetch(`/api/players/${filename}`);
    const resData = await res.json();
    if (!resData.success) return showToast('Player not found', 'error');

    activePlayerJson = resData.data;
    activePlayerFilename = filename;

    document.getElementById('playerModalTitle').innerText = `Edit Player: ${activePlayerJson.name || filename}`;
    document.getElementById('pEditName').value = activePlayerJson.name || '';
    document.getElementById('pEditPass').value = activePlayerJson.pass || '';
    document.getElementById('pEditLevel').value = activePlayerJson.level || 1;
    document.getElementById('pEditXP').value = activePlayerJson.xp || 0;
    document.getElementById('pEditIP').value = activePlayerJson.ip || '';
    document.getElementById('pEditEmail').value = activePlayerJson.email || '';

    document.getElementById('pEditGems').value = activePlayerJson.gems || 0;
    document.getElementById('pEditWL').value = activePlayerJson.wl_bank_amount || 0;
    document.getElementById('pEditDL').value = activePlayerJson.dl_bank_amount || 0;
    document.getElementById('pEditBGL').value = activePlayerJson.bgl_bank_amount || 0;

    document.getElementById('pEditRoleAdmin').checked = !!activePlayerJson['Role.Administrator'];
    document.getElementById('pEditRoleDev').checked = !!activePlayerJson['Role.Developer'];
    document.getElementById('pEditRoleMod').checked = !!activePlayerJson['Role.Moderator'];
    document.getElementById('pEditRoleVIP').checked = !!activePlayerJson['Role.Vip'];
    document.getElementById('pEditRoleSuperBoost').checked = !!activePlayerJson['Role.SUPER_BOOST'];
    document.getElementById('pEditRoleGod').checked = !!activePlayerJson['Role.God'];

    // Render Inventory Slots
    const invSlots = document.getElementById('playerInvSlots');
    const inv = activePlayerJson.inventory || [];
    invSlots.innerHTML = inv.map((slot, idx) => {
      const itemId = slot[0] || 0;
      const amount = slot[1] || 0;
      if (itemId === 0 && amount === 0) return '';
      return `
        <div class="gt-inv-slot" title="Slot ${idx}: Item #${itemId} (${amount}x)">
          <span class="id-badge">#${itemId}</span>
          <span style="font-size: 1.1rem;">📦</span>
          <span class="count">${amount}</span>
        </div>
      `;
    }).join('') || '<div style="color: var(--gt-text-muted); padding: 10px;">Backpack is empty.</div>';

    switchPlayerModalTab('p-general');
    document.getElementById('playerModalBackdrop').style.display = 'flex';
  } catch (err) {
    showToast('Failed to open player editor', 'error');
  }
}

function closePlayerModal() {
  document.getElementById('playerModalBackdrop').style.display = 'none';
  activePlayerJson = null;
  activePlayerFilename = '';
}

function switchPlayerModalTab(tabKey) {
  document.querySelectorAll('.p-tab-pane').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`ptab-${tabKey}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.gt-modal-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-ptab') === tabKey) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

async function savePlayerModal() {
  if (!activePlayerJson || !activePlayerFilename) return;

  activePlayerJson.pass = document.getElementById('pEditPass').value;
  activePlayerJson.level = parseInt(document.getElementById('pEditLevel').value, 10) || 1;
  activePlayerJson.xp = parseInt(document.getElementById('pEditXP').value, 10) || 0;
  activePlayerJson.email = document.getElementById('pEditEmail').value;

  activePlayerJson.gems = parseInt(document.getElementById('pEditGems').value, 10) || 0;
  activePlayerJson.wl_bank_amount = parseInt(document.getElementById('pEditWL').value, 10) || 0;
  activePlayerJson.dl_bank_amount = parseInt(document.getElementById('pEditDL').value, 10) || 0;
  activePlayerJson.bgl_bank_amount = parseInt(document.getElementById('pEditBGL').value, 10) || 0;

  activePlayerJson['Role.Administrator'] = document.getElementById('pEditRoleAdmin').checked;
  activePlayerJson['Role.Developer'] = document.getElementById('pEditRoleDev').checked;
  activePlayerJson['Role.Moderator'] = document.getElementById('pEditRoleMod').checked;
  activePlayerJson['Role.Vip'] = document.getElementById('pEditRoleVIP').checked;
  activePlayerJson['Role.SUPER_BOOST'] = document.getElementById('pEditRoleSuperBoost').checked;
  activePlayerJson['Role.God'] = document.getElementById('pEditRoleGod').checked;

  try {
    const res = await fetch(`/api/players/${activePlayerFilename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activePlayerJson)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Player data saved successfully!', 'success');
      closePlayerModal();
      loadPlayers(playerPage);
    } else {
      showToast(data.message || 'Save failed', 'error');
    }
  } catch (err) {
    showToast('Failed to save player changes', 'error');
  }
}

async function togglePlayerBan() {
  if (!activePlayerJson) return;
  const isBanned = activePlayerJson.is_banned || (activePlayerJson['7bans'] && activePlayerJson['7bans'].length > 0);
  activePlayerJson.is_banned = !isBanned;
  if (!isBanned) {
    activePlayerJson['7bans'] = [`Banned by Admin on ${new Date().toLocaleDateString()}`];
  } else {
    activePlayerJson['7bans'] = [];
  }
  showToast(isBanned ? 'Player unbanned in editor' : 'Player banned in editor', 'info');
}

async function deletePlayer(filename) {
  if (!confirm(`Are you sure you want to permanently delete player file "${decodeURIComponent(filename)}"?`)) return;
  try {
    const res = await fetch(`/api/players/${filename}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Player deleted.', 'success');
      loadPlayers(playerPage);
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast('Failed to delete player', 'error');
  }
}

// World Management
function debounceWorldSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadWorlds(1), 300);
}

async function loadWorlds(page = 1) {
  worldPage = page;
  const search = document.getElementById('worldSearchInput')?.value || '';
  const tbody = document.getElementById('worldTableBody');

  try {
    const res = await fetch(`/api/worlds?search=${encodeURIComponent(search)}&page=${page}&limit=20`);
    const data = await res.json();

    document.getElementById('worldTotalCounter').innerText = `Total: ${data.total}`;
    document.getElementById('worldPageInfo').innerText = `Page ${data.page} of ${data.totalPages || 1}`;
    document.getElementById('worldPrevBtn').disabled = data.page <= 1;
    document.getElementById('worldNextBtn').disabled = data.page >= data.totalPages;

    if (!data.worlds || data.worlds.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No worlds found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.worlds.map(w => `
      <tr>
        <td><strong style="color: var(--gt-btn-light);">${escapeHtml(w.name)}</strong></td>
        <td>${escapeHtml(w.owner)}</td>
        <td>Weather #${w.weather}</td>
        <td>${w.isLocked ? '🔒 World Locked' : '<span style="color: var(--gt-text-muted);">Unlocked</span>'}</td>
        <td>${w.droppedCount} items</td>
        <td>
          <button class="gt-btn gt-btn-sm gt-btn-red" onclick="deleteWorld('${encodeURIComponent(w.filename)}')">🗑 Reset</button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ff6b6b; padding: 20px;">Error loading worlds: ${err.message}</td></tr>`;
  }
}

function changeWorldPage(delta) {
  loadWorlds(worldPage + delta);
}

async function deleteWorld(filename) {
  if (!confirm(`Are you sure you want to reset/delete world "${decodeURIComponent(filename)}"?`)) return;
  try {
    const res = await fetch(`/api/worlds/${filename}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('World reset/deleted.', 'success');
      loadWorlds(worldPage);
    }
  } catch (e) {
    showToast('Failed to reset world', 'error');
  }
}

// Guilds
async function loadGuilds() {
  try {
    const res = await fetch('/api/guilds');
    const data = await res.json();
    const tbody = document.getElementById('guildTableBody');

    if (!data.guilds || data.guilds.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No guilds found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.guilds.map(g => `
      <tr>
        <td><strong style="color: #fff;">${escapeHtml(g.name)}</strong></td>
        <td>${escapeHtml(g.leader)}</td>
        <td>Level ${g.level}</td>
        <td>${g.membersCount} Members</td>
        <td><em>${escapeHtml(g.statement || 'No statement')}</em></td>
      </tr>
    `).join('');
  } catch (err) {}
}

// Lua Scripts Manager
async function loadScripts() {
  try {
    const res = await fetch('/api/scripts');
    const data = await res.json();
    const list = document.getElementById('scriptFileList');

    if (!data.scripts || data.scripts.length === 0) {
      list.innerHTML = `<div style="color: var(--gt-text-muted); font-size: 0.82rem;">No Lua scripts detected.</div>`;
      return;
    }

    list.innerHTML = data.scripts.map(s => {
      let badge = '📜';
      let badgeColor = 'var(--gt-btn-default)';
      if (s.path.startsWith('commands/')) { badge = '⚡'; badgeColor = '#fdcc04'; }
      else if (s.path.startsWith('events/')) { badge = '🎉'; badgeColor = '#49fc00'; }
      else if (s.path.startsWith('systems/')) { badge = '⚙️'; badgeColor = '#a5e3fb'; }

      const isActive = s.path === activeScriptPath;
      const activeStyle = isActive 
        ? 'background: var(--gt-btn-default); color: #fff; border: 1px solid rgba(255,255,255,0.4);' 
        : 'background: var(--gt-border-fade-12);';

      return `
        <div class="gt-script-item" data-path="${escapeHtml(s.path)}" 
             style="${activeStyle} padding: 8px 10px; border-radius: 6px; cursor: pointer; font-family: var(--font-mono); font-size: 0.8rem; word-break: break-all; transition: all 0.15s; display: flex; align-items: center; justify-content: space-between;" 
             onclick="openScript('${escapeHtml(s.path)}')">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span>${badge}</span>
            <span>${escapeHtml(s.path)}</span>
          </span>
        </div>
      `;
    }).join('');

    // Open active or first script
    if (!activeScriptPath && data.scripts.length > 0) {
      openScript(data.scripts[0].path);
    }
  } catch (err) {}
}

async function openScript(scriptPath) {
  try {
    const res = await fetch(`/api/scripts/read?path=${encodeURIComponent(scriptPath)}`);
    const data = await res.json();
    activeScriptPath = scriptPath;
    
    document.getElementById('currentEditingFile').innerHTML = `
      <span>Editing: <strong>${escapeHtml(scriptPath)}</strong></span>
      <button class="gt-btn gt-btn-red gt-btn-sm" onclick="deleteScript('${escapeHtml(scriptPath)}')">🗑 Delete File</button>
    `;
    document.getElementById('scriptCodeEditor').value = data.content;

    // Highlight selected item in tree
    document.querySelectorAll('.gt-script-item').forEach(el => {
      if (el.getAttribute('data-path') === scriptPath) {
        el.style.background = 'var(--gt-btn-default)';
        el.style.color = '#fff';
      } else {
        el.style.background = 'var(--gt-border-fade-12)';
        el.style.color = 'inherit';
      }
    });
  } catch (err) {
    showToast('Failed to open script', 'error');
  }
}

async function saveActiveScript() {
  if (!activeScriptPath) return showToast('No script selected', 'error');
  const content = document.getElementById('scriptCodeEditor').value;
  try {
    const res = await fetch('/api/scripts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: activeScriptPath, content })
    });
    const data = await res.json();
    if (data.success) showToast(data.message, 'success');
    else showToast(data.error || 'Save failed', 'error');
  } catch (err) {
    showToast('Failed to save script', 'error');
  }
}

async function createNewScript() {
  const fileName = prompt('Enter new Lua script name or relative path (e.g. commands/custom_cmd.lua or my_event.lua):');
  if (!fileName || !fileName.trim()) return;

  let cleanPath = fileName.trim();
  if (!cleanPath.endsWith('.lua') && !cleanPath.endsWith('.json')) {
    cleanPath += '.lua';
  }

  const templateCode = `-- ============================================
-- PYROCK GTPS - Custom Lua Script
-- File: ${cleanPath}
-- Created via PYROCK Control Panel
-- ============================================

Log("Initializing script: ${cleanPath}...")

-- Example: Register command
-- RegisterCommand("hello", function(player, args)
--     player:SendMessage("\`6[PYROCK] \`oHello from ${cleanPath}!")
-- end)
`;

  try {
    const res = await fetch('/api/scripts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: cleanPath, content: templateCode })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Created new script: ${cleanPath}`, 'success');
      activeScriptPath = cleanPath;
      await loadScripts();
      openScript(cleanPath);
    } else {
      showToast(data.error || 'Failed to create script', 'error');
    }
  } catch (err) {
    showToast('Failed to create script file', 'error');
  }
}

async function deleteScript(scriptPath) {
  if (!confirm(`Are you sure you want to delete script "${scriptPath}"?`)) return;
  try {
    const res = await fetch('/api/scripts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: scriptPath })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      activeScriptPath = '';
      await loadScripts();
    } else {
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast('Failed to delete script', 'error');
  }
}

// Configs & Structured Settings Manager
let cachedSettingsData = null;

function switchConfigSubTab(mode) {
  const visualPane = document.getElementById('cfgSubTabVisual');
  const rawPane = document.getElementById('cfgSubTabRaw');
  const btnVisual = document.getElementById('btnSubTabVisual');
  const btnRaw = document.getElementById('btnSubTabRaw');

  if (mode === 'visual') {
    visualPane.style.display = 'block';
    rawPane.style.display = 'none';
    btnVisual.classList.add('active');
    btnRaw.classList.remove('active');
    loadStructuredSettings();
  } else {
    visualPane.style.display = 'none';
    rawPane.style.display = 'block';
    btnVisual.classList.remove('active');
    btnRaw.classList.add('active');
    loadConfigs();
  }
}

async function loadStructuredSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success) return showToast('Failed to load settings', 'error');

    cachedSettingsData = data;
    const cfg = data.config || {};
    const mysql = data.mysql || {};
    const cmdactive = data.cmdactive || {};

    // General Identity
    if (cfg.SERVER) {
      document.getElementById('cfgServerName').value = cfg.SERVER.NAME || '';
      document.getElementById('cfgClientVer').value = cfg.SERVER.CLIENT_VERSION || '';
      document.getElementById('cfgProtocol').value = cfg.SERVER.PROTOCOL || 216;
      document.getElementById('cfgDiscordUrl').value = cfg.SERVER.DISCORD_URL || '';
      document.getElementById('cfgWebsiteUrl').value = cfg.SERVER.WEBSITE_URL || '';
    }

    // Gameplay & Protections
    if (cfg.GAME) {
      document.getElementById('cfgAntiProxy').checked = !!cfg.GAME.ANTI_PROXY;
      document.getElementById('cfgAntiGrowlauncher').checked = !!cfg.GAME.ANTI_GROWLAUNCHER;
      document.getElementById('cfgAutofarmDelay').value = cfg.GAME.AUTOFARM_DELAY || 500;
    }
    if (cfg.shadow_farm) {
      document.getElementById('cfgShadowFarmEnable').checked = !!cfg.shadow_farm.shadow_farm_enabled;
    }

    // Starter Rewards & Shop
    if (cfg.NEWBIE_GET && cfg.NEWBIE_GET.ITEMS && cfg.NEWBIE_GET.ITEMS[0]) {
      document.getElementById('cfgStarterGems').value = cfg.NEWBIE_GET.ITEMS[0].Gemss || 50000;
    }
    if (cfg.BUY_SHOP_CONFIG && cfg.BUY_SHOP_CONFIG.buy) {
      document.getElementById('cfgShopGemsPrice').value = cfg.BUY_SHOP_CONFIG.buy.price_gems || 9990;
    }

    // MySQL Database
    document.getElementById('cfgMysqlEnable').checked = !!mysql.enable_mysql;
    document.getElementById('cfgMysqlHost').value = mysql.mysql_host || '127.0.0.1';
    document.getElementById('cfgMysqlPort').value = mysql.mysql_port || 3306;
    document.getElementById('cfgMysqlDB').value = mysql.mysql_db || 'gtps_db';
    document.getElementById('cfgMysqlUser').value = mysql.mysql_user || 'root';
    document.getElementById('cfgMysqlPass').value = mysql.mysql_pass || '';

    // Command Toggles Grid
    const cmdGrid = document.getElementById('cfgCommandsGrid');
    if (cmdGrid) {
      const keys = Object.keys(cmdactive).sort();
      cmdGrid.innerHTML = keys.map(k => `
        <label style="display: flex; align-items: center; justify-content: space-between; background: var(--gt-border-fade-20); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-family: var(--font-mono); font-size: 0.82rem;">
          <span>${escapeHtml(k)}</span>
          <input type="checkbox" class="cmd-active-check" data-cmd="${escapeHtml(k)}" ${cmdactive[k] ? 'checked' : ''} style="width: 18px; height: 18px;">
        </label>
      `).join('');
    }

  } catch (err) {
    showToast('Failed to load server settings form', 'error');
  }
}

async function saveStructuredSettings() {
  if (!cachedSettingsData) cachedSettingsData = { config: {}, mysql: {}, cmdactive: {} };

  const cfg = cachedSettingsData.config || {};
  if (!cfg.SERVER) cfg.SERVER = {};
  if (!cfg.GAME) cfg.GAME = {};
  if (!cfg.shadow_farm) cfg.shadow_farm = {};
  if (!cfg.NEWBIE_GET) cfg.NEWBIE_GET = { ITEMS: [{}] };
  if (!cfg.NEWBIE_GET.ITEMS || !cfg.NEWBIE_GET.ITEMS[0]) cfg.NEWBIE_GET.ITEMS = [{}];
  if (!cfg.BUY_SHOP_CONFIG) cfg.BUY_SHOP_CONFIG = { buy: {} };

  // Update Config values
  cfg.SERVER.NAME = document.getElementById('cfgServerName').value || 'PyRock';
  cfg.SERVER.CLIENT_VERSION = document.getElementById('cfgClientVer').value || '5.45';
  cfg.SERVER.PROTOCOL = parseInt(document.getElementById('cfgProtocol').value, 10) || 216;
  cfg.SERVER.DISCORD_URL = document.getElementById('cfgDiscordUrl').value || '-';
  cfg.SERVER.WEBSITE_URL = document.getElementById('cfgWebsiteUrl').value || '-';

  cfg.GAME.ANTI_PROXY = document.getElementById('cfgAntiProxy').checked;
  cfg.GAME.ANTI_GROWLAUNCHER = document.getElementById('cfgAntiGrowlauncher').checked;
  cfg.GAME.AUTOFARM_DELAY = parseInt(document.getElementById('cfgAutofarmDelay').value, 10) || 500;
  cfg.shadow_farm.shadow_farm_enabled = document.getElementById('cfgShadowFarmEnable').checked;

  cfg.NEWBIE_GET.ITEMS[0].Gemss = parseInt(document.getElementById('cfgStarterGems').value, 10) || 50000;
  cfg.BUY_SHOP_CONFIG.buy.price_gems = parseInt(document.getElementById('cfgShopGemsPrice').value, 10) || 9990;

  // Update MySQL values
  const mysql = {
    mysql_host: document.getElementById('cfgMysqlHost').value || '127.0.0.1',
    mysql_port: parseInt(document.getElementById('cfgMysqlPort').value, 10) || 3306,
    mysql_user: document.getElementById('cfgMysqlUser').value || 'root',
    mysql_pass: document.getElementById('cfgMysqlPass').value || '',
    mysql_db: document.getElementById('cfgMysqlDB').value || 'gtps_db',
    enable_mysql: document.getElementById('cfgMysqlEnable').checked,
    auto_migrate_json: true
  };

  // Update Commands Active values
  const cmdactive = {};
  document.querySelectorAll('.cmd-active-check').forEach(chk => {
    const cmdKey = chk.getAttribute('data-cmd');
    if (cmdKey) {
      cmdactive[cmdKey] = chk.checked;
    }
  });

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: cfg, mysql, cmdactive })
    });
    const data = await res.json();
    if (data.success) {
      showToast('All server form settings saved successfully!', 'success');
    } else {
      showToast(data.message || 'Save failed', 'error');
    }
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
}

// Configs Manager (Raw JSON)
async function loadConfigs() {
  try {
    const res = await fetch('/api/configs');
    const data = await res.json();
    const list = document.getElementById('configFileList');
    const allConfigs = ['mysql_config.json', ...(data.configs || [])];

    list.innerHTML = allConfigs.map(c => `
      <div style="background: var(--gt-border-fade-12); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-family: var(--font-mono); font-size: 0.8rem; word-break: break-all; transition: background 0.15s;" 
           onmouseover="this.style.background='var(--gt-border-fade-25)'" 
           onmouseout="this.style.background='var(--gt-border-fade-12)'"
           onclick="openConfig('${escapeHtml(c)}')">
        ⚙ ${escapeHtml(c)}
      </div>
    `).join('');

    if (allConfigs.length > 0) openConfig(allConfigs[0]);
  } catch (e) {}
}

async function openConfig(fileName) {
  try {
    const res = await fetch(`/api/configs/${encodeURIComponent(fileName)}`);
    const data = await res.json();
    activeConfigFile = fileName;
    document.getElementById('currentEditingConfig').innerText = `Editing: ${fileName}`;
    document.getElementById('configCodeEditor').value = data.content;
  } catch (err) {
    showToast('Failed to read config', 'error');
  }
}

async function saveActiveConfig() {
  if (!activeConfigFile) return showToast('No config selected', 'error');
  const content = document.getElementById('configCodeEditor').value;
  try {
    const res = await fetch(`/api/configs/${encodeURIComponent(activeConfigFile)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (data.success) showToast(data.message, 'success');
  } catch (err) {
    showToast('Failed to save config', 'error');
  }
}

// Hosts & Connect
async function loadHosts() {
  try {
    const res = await fetch('/api/hosts');
    const data = await res.json();
    document.getElementById('winHostsText').value = data.winHosts;
    document.getElementById('androidHostsText').value = data.androidHosts;
    document.getElementById('iosDnsDisplay').innerHTML = `Target IP: ${data.ip}<br>Port: ${data.port}<br>Growtopia URL: http://${data.ip}:3000/growtopia/server_data.php`;
  } catch (e) {}
}

function copySidebarEndpoint() {
  const text = document.getElementById('sidebarIpDisplay').innerText;
  navigator.clipboard.writeText(text);
  showToast(`Copied ${text} to clipboard!`, 'success');
}

function copyElementText(elemId) {
  const elem = document.getElementById(elemId);
  navigator.clipboard.writeText(elem.value);
  showToast('Copied to clipboard!', 'success');
}

// Backups
async function loadBackups() {
  try {
    const res = await fetch('/api/backups');
    const data = await res.json();
    const tbody = document.getElementById('backupTableBody');

    if (!data.backups || data.backups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">No backup archives generated yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.backups.map(b => `
      <tr>
        <td><strong style="color: #fff;">${escapeHtml(b.name)}</strong></td>
        <td>${b.size}</td>
        <td>${new Date(b.date).toLocaleString()}</td>
        <td><span style="color: #49fc00;">Ready</span></td>
      </tr>
    `).join('');
  } catch (err) {}
}

async function triggerManualBackup() {
  showToast('Compressing database to zip archive...', 'info');
  try {
    const res = await fetch('/api/backups/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Backup archive created: ${data.filename}`, 'success');
      loadBackups();
    } else {
      showToast(data.message || 'Backup failed', 'error');
    }
  } catch (err) {
    showToast('Failed to create backup', 'error');
  }
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function closeModalOnBackdrop(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'playerModalBackdrop') closePlayerModal();
  }
}
