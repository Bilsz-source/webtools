const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const url = require('url');

// Port configuration
const PORT = process.env.PORT || 3000;
const GTPS_PORT = 55000;

// Base Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'Core', 'x64', 'Release');
const DATABASE_DIR = fs.existsSync(path.join(RELEASE_DIR, 'database')) 
  ? path.join(RELEASE_DIR, 'database') 
  : path.join(ROOT_DIR, 'database');
const PLAYERS_DIR = path.join(DATABASE_DIR, 'players');
const WORLDS_DIR = path.join(DATABASE_DIR, 'worlds');
const GUILDS_DIR = path.join(DATABASE_DIR, 'guilds');
const JSON_DIR = path.join(DATABASE_DIR, 'json');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure directories exist
[BACKUPS_DIR, PLAYERS_DIR, WORLDS_DIR, GUILDS_DIR, JSON_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
});

// Cache & Server State
let serverProcess = null;
let serverStartTime = null;

// Helper: Run command as Promise
function runCmd(command, cwd = ROOT_DIR) {
  return new Promise((resolve) => {
    exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout ? stdout.trim() : '', stderr: stderr ? stderr.trim() : '' });
    });
  });
}

// Helper: Check if Server.exe is currently running
async function isServerRunning() {
  if (process.platform === 'win32') {
    const res = await runCmd('tasklist /FI "IMAGENAME eq Server.exe" /FO CSV /NH');
    if (res.stdout && res.stdout.toLowerCase().includes('server.exe')) {
      return true;
    }
    const psRes = await runCmd('powershell -NoProfile -Command "if (Get-Process Server -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"');
    return psRes.error ? false : true;
  }
  return false;
}

// Helper: Atomic write file
function atomicWriteFile(filePath, content) {
  const tmpPath = `${filePath}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    fs.copyFileSync(tmpPath, filePath);
    fs.unlinkSync(tmpPath);
  }
}

// Helper: Get IP address of local machine
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// Helper: Read JSON safely
function readJSONSafe(filePath, defaultVal = null) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return defaultVal;
  }
}

// MIME Types for Static File Serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Router Dispatcher
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Response JSON Helper
  const jsonResponse = (data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Response Text Helper
  const textResponse = (text, statusCode = 200, contentType = 'text/plain') => {
    res.writeHead(statusCode, { 'Content-Type': contentType });
    res.end(text);
  };

  // Helper to read POST body
  const getBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({ raw: body });
      }
    });
  });

  // ==========================================
  // GROWTOPIA CLIENT LOGIN ENDPOINTS
  // ==========================================
  if (pathname === '/growtopia/server_data.php' || pathname === '/server_data.php') {
    const host = getLocalIP();
    const serverData = [
      `server|${host}`,
      `port|${GTPS_PORT}`,
      `type2|1`,
      `# GTPS Cloud Native Login Handshake`,
      `loginurl|https://gtps.cloud`,
      `meta|gtps_cloud_server`,
      `type|1`
    ].join('\n');
    return textResponse(serverData, 200, 'text/plain');
  }

  // ==========================================
  // API: SERVER STATUS & STATS
  // ==========================================
  if (pathname === '/api/status' && method === 'GET') {
    const running = await isServerRunning();
    
    // Count players
    let totalPlayers = 0;
    try {
      const pFiles = fs.readdirSync(PLAYERS_DIR);
      totalPlayers = pFiles.filter(f => f.endsWith('.json')).length;
    } catch (e) {}

    // Count worlds
    let totalWorlds = 0;
    try {
      const wFiles = fs.readdirSync(WORLDS_DIR);
      totalWorlds = wFiles.filter(f => f.endsWith('.json')).length;
    } catch (e) {}

    // Count guilds
    let totalGuilds = 0;
    try {
      const gFiles = fs.readdirSync(GUILDS_DIR);
      totalGuilds = gFiles.filter(f => f.endsWith('.json')).length;
    } catch (e) {}

    // Count scripts
    let totalScripts = 0;
    try {
      if (fs.existsSync(SCRIPTS_DIR)) {
        const getFiles = (dir) => {
          let count = 0;
          fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            if (entry.isDirectory()) count += getFiles(path.join(dir, entry.name));
            else if (entry.name.endsWith('.lua')) count++;
          });
          return count;
        };
        totalScripts = getFiles(SCRIPTS_DIR);
      }
      if (fs.existsSync(path.join(ROOT_DIR, 'Ringmastered.lua'))) totalScripts++;
    } catch (e) {}

    // Online players
    let onlineCount = 0;
    const onlineFile = path.join(RELEASE_DIR, 'online.txt');
    if (fs.existsSync(onlineFile)) {
      try {
        const oContent = fs.readFileSync(onlineFile, 'utf8').trim();
        onlineCount = parseInt(oContent, 10) || 0;
      } catch (e) {}
    }

    // System Memory
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024));
    const usedMem = totalMem - freeMem;

    return jsonResponse({
      status: running ? 'ONLINE' : 'OFFLINE',
      port: GTPS_PORT,
      host: getLocalIP(),
      uptime: serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) : 0,
      totalPlayers,
      totalWorlds,
      totalGuilds,
      totalScripts,
      onlineCount,
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Generic CPU',
        totalMem: `${totalMem} MB`,
        usedMem: `${usedMem} MB`,
        freeMem: `${freeMem} MB`,
        memoryUsagePercent: Math.round((usedMem / totalMem) * 100)
      }
    });
  }

  // ==========================================
  // API: SERVER CONTROLS (START / STOP / RESTART / KILL)
  // ==========================================
  if (pathname === '/api/server/start' && method === 'POST') {
    const running = await isServerRunning();
    if (running) {
      return jsonResponse({ success: false, message: 'Server is already running!' });
    }

    const exePath = path.join(RELEASE_DIR, 'Server.exe');
    if (!fs.existsSync(exePath)) {
      return jsonResponse({ success: false, message: `Server.exe not found at ${exePath}` }, 404);
    }

    try {
      if (process.platform === 'win32') {
        exec('cmd.exe /c start "" "Server.exe"', { cwd: RELEASE_DIR });
      } else {
        const child = spawn(exePath, [], {
          cwd: RELEASE_DIR,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }

      serverStartTime = Date.now();
      
      // Wait 1.5 seconds and check if Server.exe is running
      await new Promise(r => setTimeout(r, 1500));
      const isNowRunning = await isServerRunning();

      if (isNowRunning) {
        return jsonResponse({ success: true, message: 'Server.exe started successfully!' });
      } else {
        return jsonResponse({ success: false, message: 'Server.exe attempted to start, but closed immediately. Please check crash logs.' });
      }
    } catch (err) {
      return jsonResponse({ success: false, message: err.message }, 500);
    }
  }

  if (pathname === '/api/server/stop' && method === 'POST') {
    const running = await isServerRunning();
    if (!running) {
      return jsonResponse({ success: false, message: 'Server is not running!' });
    }

    await runCmd('taskkill /IM Server.exe /T');
    
    // Wait up to 5 seconds for process to exit
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (!(await isServerRunning())) break;
    }

    serverStartTime = null;
    return jsonResponse({ success: true, message: 'Server stopped.' });
  }

  if (pathname === '/api/server/kill' && method === 'POST') {
    await runCmd('taskkill /F /IM Server.exe /T');
    serverStartTime = null;
    return jsonResponse({ success: true, message: 'Server process forcefully terminated.' });
  }

  if (pathname === '/api/server/restart' && method === 'POST') {
    await runCmd('taskkill /F /IM Server.exe /T');
    
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (!(await isServerRunning())) break;
    }
    
    const exePath = path.join(RELEASE_DIR, 'Server.exe');
    if (fs.existsSync(exePath)) {
      if (process.platform === 'win32') {
        exec('cmd.exe /c start "" "Server.exe"', { cwd: RELEASE_DIR });
      } else {
        const child = spawn(exePath, [], {
          cwd: RELEASE_DIR,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }
      serverStartTime = Date.now();
      return jsonResponse({ success: true, message: 'Server restarted successfully!' });
    }
    return jsonResponse({ success: false, message: 'Could not restart: Server.exe not found.' }, 404);
  }

  // ==========================================
  // API: SERVER LOGS & CONSOLE
  // ==========================================
  if (pathname === '/api/logs' && method === 'GET') {
    const logFiles = [
      path.join(RELEASE_DIR, 'application.log'),
      path.join(RELEASE_DIR, 'debugging.txt'),
      path.join(RELEASE_DIR, 'crash.txt')
    ];

    let logText = '';
    for (const file of logFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          // Read last 64KB
          const bufferSize = Math.min(stats.size, 65536);
          const buffer = Buffer.alloc(bufferSize);
          const fd = fs.openSync(file, 'r');
          fs.readSync(fd, buffer, 0, bufferSize, stats.size - bufferSize);
          fs.closeSync(fd);
          logText += `\n--- [${path.basename(file)}] ---\n` + buffer.toString('utf8');
        } catch (e) {}
      }
    }

    // Split lines and get last 200 lines
    const lines = logText.split(/\r?\n/).filter(Boolean).slice(-200);
    return jsonResponse({ lines, total: lines.length });
  }

  // ==========================================
  // API: PLAYER MANAGEMENT (Optimized)
  // ==========================================
  if (pathname === '/api/players' && method === 'GET') {
    const query = parsedUrl.query;
    const search = (query.search || '').toLowerCase();
    const roleFilter = query.role || '';
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));

    try {
      let files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json'));
      if (search) {
        files = files.filter(f => f.toLowerCase().replace(/_\.json$|\.json$/, '').includes(search));
      }

      const total = files.length;
      const startIndex = (page - 1) * limit;
      const paginatedFiles = files.slice(startIndex, startIndex + limit);

      const players = paginatedFiles.map(file => {
        const rawName = file.replace(/_\.json$|\.json$/, '');
        const fullPath = path.join(PLAYERS_DIR, file);
        const data = readJSONSafe(fullPath, {});

        const isBanned = !!(data.is_banned || data.ban_time || (data['7bans'] && data['7bans'].length > 0));
        const isAdmin = !!(data['Role.Administrator'] || data['Role.Developer'] || data['Role.Owner_Server'] || data['Role.Coder']);
        const isMod = !!(data['Role.Moderator'] || data['Role.Staff']);
        const isVIP = !!(data['Role.Vip'] || data['Role.Donatur'] || data['Role.SUPER_BOOST']);

        return {
          name: data.name || rawName,
          filename: file,
          gems: data.gems || 0,
          level: data.level || 1,
          xp: data.xp || 0,
          ip: data.ip || 'Unknown',
          playtime: data.playtime || 0,
          isAdmin,
          isMod,
          isVIP,
          isBanned,
          lastOnline: data.lo || 'Never'
        };
      });

      return jsonResponse({
        players,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // GET Single Player
  if (pathname.startsWith('/api/players/') && method === 'GET') {
    const playerName = decodeURIComponent(pathname.replace('/api/players/', ''));
    const filePath = path.join(PLAYERS_DIR, playerName.endsWith('.json') ? playerName : `${playerName}_.json`);
    const altPath = path.join(PLAYERS_DIR, `${playerName}.json`);
    
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : null);
    if (!targetPath) {
      return jsonResponse({ success: false, message: 'Player not found' }, 404);
    }

    const data = readJSONSafe(targetPath, null);
    if (!data) return jsonResponse({ success: false, message: 'Failed to read player JSON' }, 500);

    return jsonResponse({ success: true, data, filename: path.basename(targetPath) });
  }

  // UPDATE Single Player
  if (pathname.startsWith('/api/players/') && method === 'POST') {
    const playerName = decodeURIComponent(pathname.replace('/api/players/', ''));
    const body = await getBody();
    
    const filePath = path.join(PLAYERS_DIR, playerName.endsWith('.json') ? playerName : `${playerName}_.json`);
    const altPath = path.join(PLAYERS_DIR, `${playerName}.json`);
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : filePath);

    try {
      atomicWriteFile(targetPath, JSON.stringify(body, null, 4));
      return jsonResponse({ success: true, message: `Player ${playerName} updated successfully!` });
    } catch (e) {
      return jsonResponse({ success: false, message: e.message }, 500);
    }
  }

  // DELETE Single Player
  if (pathname.startsWith('/api/players/') && method === 'DELETE') {
    const playerName = decodeURIComponent(pathname.replace('/api/players/', ''));
    const filePath = path.join(PLAYERS_DIR, playerName.endsWith('.json') ? playerName : `${playerName}_.json`);
    const altPath = path.join(PLAYERS_DIR, `${playerName}.json`);
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : null);

    if (targetPath) {
      fs.unlinkSync(targetPath);
      return jsonResponse({ success: true, message: `Player ${playerName} deleted.` });
    }
    return jsonResponse({ success: false, message: 'Player not found' }, 404);
  }

  // ==========================================
  // API: WORLD MANAGEMENT (Optimized)
  // ==========================================
  if (pathname === '/api/worlds' && method === 'GET') {
    const query = parsedUrl.query;
    const search = (query.search || '').toLowerCase();
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));

    try {
      let files = fs.readdirSync(WORLDS_DIR).filter(f => f.endsWith('.json'));
      if (search) {
        files = files.filter(f => f.toLowerCase().replace(/_\.json$|\.json$/, '').includes(search));
      }

      const total = files.length;
      const startIndex = (page - 1) * limit;
      const paginatedFiles = files.slice(startIndex, startIndex + limit);

      const worlds = paginatedFiles.map(file => {
        const rawName = file.replace(/_\.json$|\.json$/, '');
        const fullPath = path.join(WORLDS_DIR, file);
        const data = readJSONSafe(fullPath, {});

        return {
          name: data.name || rawName,
          filename: file,
          owner: data.owner || data.owner_name || 'Nobody',
          weather: data.weather || 0,
          isLocked: !!(data.owner || data.owner_name),
          droppedCount: Array.isArray(data.items) ? data.items.length : 0
        };
      });

      return jsonResponse({
        worlds,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // GET Single World
  if (pathname.startsWith('/api/worlds/') && method === 'GET') {
    const worldName = decodeURIComponent(pathname.replace('/api/worlds/', ''));
    const filePath = path.join(WORLDS_DIR, worldName.endsWith('.json') ? worldName : `${worldName}_.json`);
    const altPath = path.join(WORLDS_DIR, `${worldName}.json`);
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : null);

    if (!targetPath) return jsonResponse({ success: false, message: 'World not found' }, 404);

    const data = readJSONSafe(targetPath, null);
    return jsonResponse({ success: true, data, filename: path.basename(targetPath) });
  }

  // UPDATE Single World
  if (pathname.startsWith('/api/worlds/') && method === 'POST') {
    const worldName = decodeURIComponent(pathname.replace('/api/worlds/', ''));
    const body = await getBody();
    const filePath = path.join(WORLDS_DIR, worldName.endsWith('.json') ? worldName : `${worldName}_.json`);
    const altPath = path.join(WORLDS_DIR, `${worldName}.json`);
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : filePath);

    try {
      atomicWriteFile(targetPath, JSON.stringify(body, null, 4));
      return jsonResponse({ success: true, message: `World ${worldName} updated successfully!` });
    } catch (e) {
      return jsonResponse({ success: false, message: e.message }, 500);
    }
  }

  // DELETE / RESET World
  if (pathname.startsWith('/api/worlds/') && method === 'DELETE') {
    const worldName = decodeURIComponent(pathname.replace('/api/worlds/', ''));
    const filePath = path.join(WORLDS_DIR, worldName.endsWith('.json') ? worldName : `${worldName}_.json`);
    const altPath = path.join(WORLDS_DIR, `${worldName}.json`);
    const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(altPath) ? altPath : null);

    if (targetPath) {
      fs.unlinkSync(targetPath);
      return jsonResponse({ success: true, message: `World ${worldName} reset/deleted.` });
    }
    return jsonResponse({ success: false, message: 'World not found' }, 404);
  }

  // ==========================================
  // API: GUILDS / CLANS
  // ==========================================
  if (pathname === '/api/guilds' && method === 'GET') {
    try {
      const files = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith('.json'));
      const guilds = files.map(file => {
        const data = readJSONSafe(path.join(GUILDS_DIR, file), {});
        return {
          name: data.name || file.replace('.json', ''),
          filename: file,
          leader: data.leader || data.owner || 'Unknown',
          level: data.level || 1,
          statement: data.statement || '',
          membersCount: Array.isArray(data.members) ? data.members.length : (data.member_count || 0)
        };
      });
      return jsonResponse({ guilds, total: guilds.length });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ==========================================
  // API: STRUCTURED SERVER SETTINGS FORM
  // ==========================================
  if (pathname === '/api/settings' && method === 'GET') {
    const mainConfigPath = path.join(JSON_DIR, 'config.json');
    const mysqlConfigPath = path.join(ROOT_DIR, 'mysql_config.json');
    const cmdActivePath = path.join(JSON_DIR, 'cmdactive.json');

    const configData = readJSONSafe(mainConfigPath, {});
    const mysqlData = readJSONSafe(mysqlConfigPath, {});
    const cmdActiveData = readJSONSafe(cmdActivePath, {});

    return jsonResponse({
      success: true,
      config: configData,
      mysql: mysqlData,
      cmdactive: cmdActiveData
    });
  }

  if (pathname === '/api/settings' && method === 'POST') {
    const body = await getBody();
    const mainConfigPath = path.join(JSON_DIR, 'config.json');
    const mysqlConfigPath = path.join(ROOT_DIR, 'mysql_config.json');
    const releaseMysqlPath = path.join(RELEASE_DIR, 'mysql_config.json');
    const cmdActivePath = path.join(JSON_DIR, 'cmdactive.json');

    try {
      if (body.config) {
        atomicWriteFile(mainConfigPath, JSON.stringify(body.config, null, 4));
      }
      if (body.mysql) {
        const mysqlStr = JSON.stringify(body.mysql, null, 4);
        atomicWriteFile(mysqlConfigPath, mysqlStr);
        atomicWriteFile(releaseMysqlPath, mysqlStr);
      }
      if (body.cmdactive) {
        atomicWriteFile(cmdActivePath, JSON.stringify(body.cmdactive, null, 4));
      }
      return jsonResponse({ success: true, message: 'Server settings updated successfully!' });
    } catch (e) {
      return jsonResponse({ success: false, message: e.message }, 500);
    }
  }

  // ==========================================
  // API: SERVER CONFIGURATIONS (RAW JSON)
  // ==========================================
  if (pathname === '/api/configs' && method === 'GET') {
    try {
      const files = fs.existsSync(JSON_DIR) ? fs.readdirSync(JSON_DIR).filter(f => f.endsWith('.json')) : [];
      return jsonResponse({ configs: files });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (pathname.startsWith('/api/configs/') && method === 'GET') {
    const fileName = decodeURIComponent(pathname.replace('/api/configs/', ''));
    let targetPath = path.join(JSON_DIR, fileName);
    if (fileName === 'mysql_config.json') {
      targetPath = path.join(ROOT_DIR, 'mysql_config.json');
    }
    if (!fs.existsSync(targetPath)) return jsonResponse({ success: false, message: 'Config file not found' }, 404);
    const content = fs.readFileSync(targetPath, 'utf8');
    return jsonResponse({ success: true, filename: fileName, content });
  }

  if (pathname.startsWith('/api/configs/') && method === 'POST') {
    const fileName = decodeURIComponent(pathname.replace('/api/configs/', ''));
    const body = await getBody();
    let targetPath = path.join(JSON_DIR, fileName);
    if (fileName === 'mysql_config.json') {
      targetPath = path.join(ROOT_DIR, 'mysql_config.json');
    }
    try {
      const content = typeof body.content === 'string' ? body.content : JSON.stringify(body, null, 4);
      atomicWriteFile(targetPath, content);
      return jsonResponse({ success: true, message: `Config ${fileName} saved successfully!` });
    } catch (e) {
      return jsonResponse({ success: false, message: e.message }, 500);
    }
  }

  // ==========================================
  // API: LUA SCRIPTS
  // ==========================================
  if (pathname === '/api/scripts' && method === 'GET') {
    try {
      const scripts = [];
      const scanDir = (dir, relPath = '') => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const itemRel = path.join(relPath, entry.name).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), itemRel);
          } else if (entry.name.endsWith('.lua') || entry.name.endsWith('.json')) {
            scripts.push({
              path: itemRel,
              name: entry.name,
              size: fs.statSync(path.join(dir, entry.name)).size
            });
          }
        }
      };

      if (fs.existsSync(SCRIPTS_DIR)) scanDir(SCRIPTS_DIR);
      if (fs.existsSync(path.join(ROOT_DIR, 'Ringmastered.lua'))) {
        scripts.push({ path: 'Ringmastered.lua', name: 'Ringmastered.lua', size: fs.statSync(path.join(ROOT_DIR, 'Ringmastered.lua')).size });
      }

      return jsonResponse({ scripts });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (pathname === '/api/scripts/read' && method === 'GET') {
    const scriptRel = parsedUrl.query.path;
    if (!scriptRel) return jsonResponse({ error: 'Missing path parameter' }, 400);

    let targetPath = path.join(SCRIPTS_DIR, scriptRel);
    if (scriptRel === 'Ringmastered.lua') targetPath = path.join(ROOT_DIR, 'Ringmastered.lua');

    if (!fs.existsSync(targetPath)) return jsonResponse({ error: 'File not found' }, 404);

    const content = fs.readFileSync(targetPath, 'utf8');
    return jsonResponse({ path: scriptRel, content });
  }

  if (pathname === '/api/scripts/save' && method === 'POST') {
    const body = await getBody();
    const scriptRel = body.path;
    const content = body.content;

    if (!scriptRel || content === undefined) {
      return jsonResponse({ error: 'Missing path or content' }, 400);
    }

    let targetPath = path.join(SCRIPTS_DIR, scriptRel);
    let releasePath = path.join(RELEASE_DIR, 'scripts', scriptRel);

    if (scriptRel === 'Ringmastered.lua') {
      targetPath = path.join(ROOT_DIR, 'Ringmastered.lua');
      releasePath = path.join(RELEASE_DIR, 'Ringmastered.lua');
    }

    try {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      atomicWriteFile(targetPath, content);

      const releaseParent = path.dirname(releasePath);
      if (!fs.existsSync(releaseParent)) fs.mkdirSync(releaseParent, { recursive: true });
      atomicWriteFile(releasePath, content);

      return jsonResponse({ success: true, message: `Script ${scriptRel} saved successfully!` });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ==========================================
  // API: BACKUP & RESTORE
  // ==========================================
  if (pathname === '/api/backups' && method === 'GET') {
    try {
      const backups = [];
      if (fs.existsSync(BACKUPS_DIR)) {
        fs.readdirSync(BACKUPS_DIR).forEach(f => {
          if (f.endsWith('.zip')) {
            const st = fs.statSync(path.join(BACKUPS_DIR, f));
            backups.push({ name: f, size: Math.round(st.size / 1024) + ' KB', date: st.mtime });
          }
        });
      }
      return jsonResponse({ backups });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (pathname === '/api/backups/create' && method === 'POST') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `gtps_backup_${timestamp}.zip`;
    const destZip = path.join(BACKUPS_DIR, zipName);

    const psCmd = `powershell -Command "Compress-Archive -Path '${DATABASE_DIR}\\*' -DestinationPath '${destZip}' -Force"`;
    const res = await runCmd(psCmd);
    if (fs.existsSync(destZip)) {
      return jsonResponse({ success: true, message: `Backup created: ${zipName}`, filename: zipName });
    }
    return jsonResponse({ success: false, message: 'Backup creation failed', details: res.stderr }, 500);
  }

  // ==========================================
  // API: HOSTS GENERATOR
  // ==========================================
  if (pathname === '/api/hosts' && method === 'GET') {
    const ip = getLocalIP();
    const winHosts = `# GTPS Cloud Windows Hosts Entry\n${ip} growtopia1.com\n${ip} growtopia2.com\n${ip} www.growtopia1.com\n${ip} www.growtopia2.com`;
    const androidHosts = `# GTPS Cloud Android Virtual Hosts Entry\n${ip} growtopia1.com\n${ip} growtopia2.com`;
    const dnsConfig = {
      ip,
      port: GTPS_PORT,
      domains: ['growtopia1.com', 'growtopia2.com', 'www.growtopia1.com', 'www.growtopia2.com']
    };
    return jsonResponse({ ip, port: GTPS_PORT, winHosts, androidHosts, dnsConfig });
  }

  // ==========================================
  // STATIC FILE SERVING
  // ==========================================
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(content);
    } catch (e) {
      res.writeHead(500);
      return res.end('Internal Server Error');
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

// Start HTTP Server
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 GTPS Server Control Panel is RUNNING!`);
  console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Local Network:  http://${getLocalIP()}:${PORT}`);
  console.log(`🎮 GT Login URL:   http://${getLocalIP()}:${PORT}/growtopia/server_data.php`);
  console.log(`======================================================\n`);
});
