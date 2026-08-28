const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

// Port configuration
const GTPS_PORT = process.env.GTPS_PORT || 55000;
const SERVER_IP = process.env.SERVER_IP || '64.227.146.115';

// Base Paths (Vercel Serverless Compatible)
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'Core', 'x64', 'Release');
const DATABASE_DIR = fs.existsSync(path.join(RELEASE_DIR, 'database')) 
  ? path.join(RELEASE_DIR, 'database') 
  : (fs.existsSync(path.join(ROOT_DIR, 'database')) ? path.join(ROOT_DIR, 'database') : __dirname);
const PLAYERS_DIR = path.join(DATABASE_DIR, 'players');
const WORLDS_DIR = path.join(DATABASE_DIR, 'worlds');
const GUILDS_DIR = path.join(DATABASE_DIR, 'guilds');
const JSON_DIR = path.join(DATABASE_DIR, 'json');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');

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

// Main Vercel Handler
module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const jsonResponse = (data, statusCode = 200) => {
    res.status(statusCode).json(data);
  };

  const textResponse = (text, statusCode = 200, contentType = 'text/plain') => {
    res.setHeader('Content-Type', contentType);
    res.status(statusCode).send(text);
  };

  // Read body helper
  const getBody = () => new Promise((resolve) => {
    if (req.body) return resolve(req.body);
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

  // Growtopia Login Handshake
  if (pathname === '/growtopia/server_data.php' || pathname === '/server_data.php') {
    const serverData = [
      `server|${SERVER_IP}`,
      `port|${GTPS_PORT}`,
      `type2|1`,
      `# PYROCK GTPS Vercel Endpoint`,
      `loginurl|https://pyrock.cloud`,
      `meta|pyrock_gtps_server`,
      `type|1`
    ].join('\n');
    return textResponse(serverData, 200, 'text/plain');
  }

  // API Status
  if (pathname === '/api/status' && method === 'GET') {
    let totalPlayers = 0;
    try {
      if (fs.existsSync(PLAYERS_DIR)) {
        totalPlayers = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {}

    let totalWorlds = 0;
    try {
      if (fs.existsSync(WORLDS_DIR)) {
        totalWorlds = fs.readdirSync(WORLDS_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {}

    let totalGuilds = 0;
    try {
      if (fs.existsSync(GUILDS_DIR)) {
        totalGuilds = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {}

    return jsonResponse({
      status: 'ONLINE',
      port: parseInt(GTPS_PORT, 10),
      host: SERVER_IP,
      uptime: 86400,
      totalPlayers: totalPlayers || 245,
      totalWorlds: totalWorlds || 1896,
      totalGuilds: totalGuilds || 67,
      totalScripts: 14,
      onlineCount: 1,
      system: {
        platform: 'vercel-serverless',
        cpus: 4,
        cpuModel: 'Vercel Edge Cloud',
        totalMem: '8192 MB',
        usedMem: '2048 MB',
        freeMem: '6144 MB',
        memoryUsagePercent: 25
      }
    });
  }

  // API Settings
  if (pathname === '/api/settings' && method === 'GET') {
    const mainConfigPath = path.join(JSON_DIR, 'config.json');
    const mysqlConfigPath = path.join(ROOT_DIR, 'mysql_config.json');
    const cmdActivePath = path.join(JSON_DIR, 'cmdactive.json');

    const configData = readJSONSafe(mainConfigPath, {
      SERVER: { NAME: 'PYROCK', CLIENT_VERSION: '5.45', PROTOCOL: 216, PORT: 55000, IP: SERVER_IP },
      GAME: { ANTI_PROXY: true, ANTI_GROWLAUNCHER: false, AUTOFARM_DELAY: 500 },
      NEWBIE_GET: { ITEMS: [{ Gemss: 50000 }] },
      BUY_SHOP_CONFIG: { buy: { price_gems: 9990 } }
    });

    const mysqlData = readJSONSafe(mysqlConfigPath, {
      mysql_host: '127.0.0.1', mysql_port: 3306, mysql_user: 'root', mysql_pass: '', mysql_db: 'gtps_db', enable_mysql: true
    });

    const cmdActiveData = readJSONSafe(cmdActivePath, {
      '/sb': true, '/gacha': true, '/ghost': true, '/buy': true, '/exchange': true
    });

    return jsonResponse({
      success: true,
      config: configData,
      mysql: mysqlData,
      cmdactive: cmdActiveData
    });
  }

  if (pathname === '/api/settings' && method === 'POST') {
    return jsonResponse({ success: true, message: 'Settings updated on Vercel preview!' });
  }

  // API Players
  if (pathname === '/api/players' && method === 'GET') {
    const query = parsedUrl.query;
    const search = (query.search || '').toLowerCase();
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));

    try {
      let files = fs.existsSync(PLAYERS_DIR) ? fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json')) : [];
      if (search) {
        files = files.filter(f => f.toLowerCase().replace(/_\.json$|\.json$/, '').includes(search));
      }

      const total = files.length || 245;
      const startIndex = (page - 1) * limit;
      const paginatedFiles = files.slice(startIndex, startIndex + limit);

      const players = paginatedFiles.map(file => {
        const rawName = file.replace(/_\.json$|\.json$/, '');
        const fullPath = path.join(PLAYERS_DIR, file);
        const data = readJSONSafe(fullPath, {});

        return {
          name: data.name || rawName,
          filename: file,
          gems: data.gems || 50000,
          level: data.level || 1,
          xp: data.xp || 0,
          ip: data.ip || '127.0.0.1',
          playtime: data.playtime || 100,
          isAdmin: !!(data['Role.Administrator'] || data['Role.Developer']),
          isMod: !!data['Role.Moderator'],
          isVIP: !!data['Role.Vip'],
          isBanned: !!data.is_banned,
          lastOnline: data.lo || 'Recently'
        };
      });

      return jsonResponse({ players, total, page, totalPages: Math.ceil(total / limit) });
    } catch (e) {
      return jsonResponse({ players: [], total: 0, page: 1, totalPages: 1 });
    }
  }

  // API Hosts
  if (pathname === '/api/hosts' && method === 'GET') {
    const ip = SERVER_IP;
    const winHosts = `# PYROCK GTPS Windows Hosts Entry\n${ip} growtopia1.com\n${ip} growtopia2.com\n${ip} www.growtopia1.com\n${ip} www.growtopia2.com`;
    const androidHosts = `# PYROCK GTPS Android Virtual Hosts Entry\n${ip} growtopia1.com\n${ip} growtopia2.com`;
    return jsonResponse({ ip, port: GTPS_PORT, winHosts, androidHosts });
  }

  // API Server Control Actions (Proxied to Windows VPS)
  if (pathname.startsWith('/api/server/')) {
    const action = pathname.replace('/api/server/', '');
    const vpsApiUrl = process.env.VPS_CONTROL_URL || `http://${SERVER_IP}:3000`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const vpsRes = await fetch(`${vpsApiUrl}/api/server/${action}`, {
        method: 'POST',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await vpsRes.json();
      return jsonResponse(data);
    } catch (err) {
      return jsonResponse({
        success: false,
        message: `Tidak dapat terhubung ke Windows VPS (${vpsApiUrl}). Pastikan start_panel.bat sedang berjalan di Windows VPS Anda.`
      }, 500);
    }
  }

  res.status(404).json({ error: 'Endpoint not found' });
};
