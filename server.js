// server.js - SeatLight 生产部署版（Node.js 18+，零依赖）
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  baseId: process.env.FEISHU_BASE_ID || '',
  tableId: process.env.FEISHU_TABLE_ID || '',
  inviteCode: process.env.INVITE_CODE || 'seatlight2026',
  port: parseInt(process.env.PORT || '3000'),
};

const TOKEN_STORE = path.join(__dirname, 'token_store.json');
const STATIC_DIR = path.join(__dirname, 'static');
const FRONTEND_DIR = path.join(__dirname, 'frontend');

// ===== Token 管理 =====
let tokenState = {
  userToken: null,
  refreshToken: null,
  expiresAt: 0,
  refreshExpiresAt: 0,
  userName: '',
};

let appAccessToken = '';
let appTokenExpiresAt = 0;

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_STORE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf-8'));
      tokenState = { ...tokenState, ...data };
      console.log('[Token] 已加载, 用户:', tokenState.userName || '未知');
      console.log('[Token] access_token 有效至:', new Date(tokenState.expiresAt).toISOString());
      console.log('[Token] refresh_token 有效至:', new Date(tokenState.refreshExpiresAt).toISOString());
    } else {
      console.log('[Token] 无已保存的 token，需要通过 OAuth 登录');
    }
  } catch (e) {
    console.error('[Token] 加载失败:', e.message);
  }
}

function saveTokens() {
  try {
    fs.writeFileSync(TOKEN_STORE, JSON.stringify(tokenState, null, 2), 'utf-8');
    console.log('[Token] ✅ 已保存');
  } catch (e) {
    console.error('[Token] 保存失败:', e.message);
  }
}

function getUserToken() {
  if (tokenState.userToken && Date.now() < tokenState.expiresAt - 60000) {
    return tokenState.userToken;
  }
  throw new Error('TOKEN_EXPIRED');
}

// 用 refresh_token 续期 access_token
async function refreshTokenIfNeeded() {
  if (!tokenState.refreshToken) {
    console.warn('[Token] 无 refresh_token，无法自动续期');
    return false;
  }
  if (Date.now() < tokenState.expiresAt - 120000) {
    return true; // 还有 2 分钟以上才过期
  }

  console.log('[Token] 🔁 正在使用 refresh_token 续期...');
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: CONFIG.appId,
        client_secret: CONFIG.appSecret,
        refresh_token: tokenState.refreshToken,
      }),
    });
    const data = await res.json();
    if (data.code !== 0) {
      console.error('[Token] ❌ 续期失败:', data.code, data.msg);
      return false;
    }
    tokenState.userToken = data.data.access_token;
    tokenState.refreshToken = data.data.refresh_token;
    tokenState.expiresAt = Date.now() + data.data.expires_in * 1000;
    tokenState.refreshExpiresAt = Date.now() + data.data.refresh_expires_in * 1000;
    saveTokens();
    console.log('[Token] ✅ 续期成功！access_token 有效至', new Date(tokenState.expiresAt).toISOString());
    return true;
  } catch (e) {
    console.error('[Token] ❌ 续期异常:', e.message);
    return false;
  }
}

// 用授权码换 token
async function exchangeCodeForTokens(code, redirectUri) {
  const appToken = await getAppAccessToken();
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + appToken,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CONFIG.appId,
      client_secret: CONFIG.appSecret,
      code: code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('换 token 失败: ' + data.msg);

  tokenState.userToken = data.data.access_token;
  tokenState.refreshToken = data.data.refresh_token;
  tokenState.expiresAt = Date.now() + data.data.expires_in * 1000;
  tokenState.refreshExpiresAt = Date.now() + data.data.refresh_expires_in * 1000;

  // 获取用户信息
  try {
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { 'Authorization': 'Bearer ' + tokenState.userToken },
    });
    const userData = await userRes.json();
    if (userData.code === 0) {
      tokenState.userName = userData.data.name || userData.data.open_id || '用户';
    }
  } catch (e) {
    tokenState.userName = '用户';
  }

  saveTokens();
  console.log('[Token] ✅ 新 token 已保存, 用户:', tokenState.userName);
}

async function getAppAccessToken() {
  if (appAccessToken && Date.now() < appTokenExpiresAt - 60000) return appAccessToken;
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: CONFIG.appId, app_secret: CONFIG.appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('获取 app_access_token 失败: ' + data.msg);
  appAccessToken = data.app_access_token;
  appTokenExpiresAt = Date.now() + data.expire * 1000;
  return appAccessToken;
}

// ===== 飞书 API =====
async function feishuRequest(method, urlPath, body) {
  const token = getUserToken();
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('https://open.feishu.cn/open-apis' + urlPath, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Non-JSON: ' + text.substring(0, 200)); }
  if (data.code !== 0) throw new Error('API [' + data.code + ']: ' + data.msg);
  return data;
}

async function getAllRecords() {
  const all = [];
  let pageToken = null;
  do {
    let p = `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records?page_size=100`;
    if (pageToken) p += '&page_token=' + pageToken;
    const data = await feishuRequest('GET', p);
    all.push(...(data.data?.items || []));
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || null;
  } while (true);
  return all;
}

async function createRecord(fields) {
  console.log('[CreateRecord] fields:', JSON.stringify(fields));
  const data = await feishuRequest('POST',
    `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records`,
    { fields });
  console.log('[CreateRecord] response:', JSON.stringify(data));
  return data.data?.record;
}

async function uploadImage(base64Data, fileName) {
  const token = getUserToken();
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid base64');
  const mimeType = matches[1];
  const fileBuffer = Buffer.from(matches[2], 'base64');
  const name = fileName || 'seatlight.jpg';

  const boundary = '----SeatLight' + Date.now().toString(36);
  const CRLF = '\r\n';
  let body = '';
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="file_name"${CRLF}${CRLF}${name}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="parent_type"${CRLF}${CRLF}bitable_image${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="parent_node"${CRLF}${CRLF}${CONFIG.baseId}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="size"${CRLF}${CRLF}${fileBuffer.length}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${name}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const headerBuf = Buffer.from(body, 'utf-8');
  const footerBuf = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8');
  const fullBody = Buffer.concat([headerBuf, fileBuffer, footerBuf]);

  const res = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: fullBody,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('上传失败: ' + data.msg + ' (raw: ' + JSON.stringify(data) + ')');
  return data.data;
}

// ===== 图片代理：用服务端 token 下载飞书图片，转发给前端 =====
async function proxyFeishuImage(fileToken, res) {
  try {
    const token = getUserToken();
    const imgRes = await fetch(`https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download`, {
      headers: { 'Authorization': 'Bearer ' + token },
      redirect: 'follow',
    });
    if (!imgRes.ok) {
      res.writeHead(imgRes.status);
      res.end('Image fetch failed');
      return;
    }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
    const reader = imgRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    console.error('[Image] 代理失败:', e.message);
    res.writeHead(500);
    res.end('Image proxy error');
  }
}

// ===== HTTP Server =====
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function getOrigin(req) {
  const host = req.headers.host || `localhost:${CONFIG.port}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Invite-Code');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  // ===== 图片代理（无需邀请码，但需要有效 token） =====
  if (pathname.startsWith('/img/') && req.method === 'GET') {
    const fileToken = pathname.slice(5); // /img/xxx
    await proxyFeishuImage(fileToken, res);
    return;
  }

  // ===== OAuth 登录 =====
  if (pathname === '/auth/login' && req.method === 'GET') {
    const redirectUri = urlObj.searchParams.get('redirect_uri') || `${getOrigin(req)}/auth/callback`;
    const state = urlObj.searchParams.get('state') || '';
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${CONFIG.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=bitable:app`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (pathname === '/auth/callback' && req.method === 'GET') {
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');
    if (error) {
      res.writeHead(302, { Location: '/login.html?error=' + encodeURIComponent(error) });
      res.end(); return;
    }
    if (!code) {
      res.writeHead(302, { Location: '/login.html?error=missing_code' });
      res.end(); return;
    }
    try {
      const redirectUri = `${getOrigin(req)}/auth/callback`;
      await exchangeCodeForTokens(code, redirectUri);
      // 保留 state 参数，支持 setup 页面回调
      const state = urlObj.searchParams.get('state') || '';
      const redirectPath = state === 'setup_v1.1' ? '/setup.html?login=success' : '/?login=success';
      res.writeHead(302, { Location: redirectPath });
      res.end();
    } catch (e) {
      console.error('[OAuth] 回调失败:', e.message);
      res.writeHead(302, { Location: '/login.html?error=' + encodeURIComponent(e.message) });
      res.end();
    }
    return;
  }

  if (pathname === '/api/auth/status' && req.method === 'GET') {
    const valid = !!(tokenState.userToken && Date.now() < tokenState.expiresAt - 60000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true, loggedIn: valid,
      userName: tokenState.userName || '',
      expiresAt: tokenState.expiresAt,
      refreshExpiresAt: tokenState.refreshExpiresAt,
    }));
    return;
  }

  // ===== 邀请码验证 =====
  if (pathname === '/api/invite/check' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { code } = JSON.parse(body || '{}');
        const valid = code === CONFIG.inviteCode;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: valid }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_request' }));
      }
    });
    return;
  }

  // ===== 静态文件（frontend 优先，然后 static） =====
  if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/img/') && !pathname.startsWith('/auth/')) {
    let fileUrl = pathname === '/' ? '/index.html' : pathname;

    // 先查 frontend 目录（动态版），再查 static（静态版）
    let filePath = path.join(FRONTEND_DIR, fileUrl);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(STATIC_DIR, fileUrl);
    }

    if (!filePath.startsWith(path.resolve(__dirname)) ||
        (!filePath.startsWith(path.resolve(FRONTEND_DIR)) && !filePath.startsWith(path.resolve(STATIC_DIR)))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // ===== API（需要邀请码） =====
  if (pathname.startsWith('/api/')) {
    const code = req.headers['x-invite-code'] || '';
    if (code !== CONFIG.inviteCode) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '无效的邀请码' }));
      return;
    }
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    let json = null;
    if (body) { try { json = JSON.parse(body); } catch {} }

    try {
      if (pathname === '/health' && req.method === 'GET') {
        const valid = !!(tokenState.userToken && Date.now() < tokenState.expiresAt - 60000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, baseId: CONFIG.baseId, tableId: CONFIG.tableId, tokenValid: valid, user: tokenState.userName || '' }));
        return;
      }

      if (pathname === '/api/records' && req.method === 'GET') {
        const records = await getAllRecords();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records }));
        return;
      }

      if (pathname === '/api/records' && req.method === 'POST') {
        if (!json) throw new Error('No body');
        const record = await createRecord(json.fields);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ record }));
        return;
      }

      // ===== Banner 记录创建（写入 Banner 表） =====
      if (pathname === '/api/banner/create' && req.method === 'POST') {
        if (!json) throw new Error('No body');
        const BANNER_TABLE = 'tblOJkxHGDx9Swqk';
        const recordData = await feishuRequest('POST',
          `/bitable/v1/apps/${CONFIG.baseId}/tables/${BANNER_TABLE}/records`,
          { fields: {
            '演出名称': json.name,
            '演出时间': json.time,
            '演出地点': json.location,
            '图片': json.file_token ? [{ file_token: json.file_token }] : [],
          }});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, record: recordData.data?.record }));
        return;
      }

      // ===== Venues 记录创建（写入 Venues 表） =====
      if (pathname === '/api/venues/create' && req.method === 'POST') {
        if (!json) throw new Error('No body');
        const VENUES_TABLE = 'tblKw40knld48WpO';
        const recordData = await feishuRequest('POST',
          `/bitable/v1/apps/${CONFIG.baseId}/tables/${VENUES_TABLE}/records`,
          { fields: {
            '场馆': json.name,
            '所在城市': json.city,
            '容量': json.capacity,
            '类型': json.type,
            '到达方式': json.arrival,
          }});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, record: recordData.data?.record }));
        return;
      }

      // ===== Banner 列表 =====
      if (pathname === '/api/banner/list' && req.method === 'GET') {
        const BANNER_TABLE = 'tblOJkxHGDx9Swqk';
        const all = [];
        let pageToken = null;
        do {
          let p = '/bitable/v1/apps/' + CONFIG.baseId + '/tables/' + BANNER_TABLE + '/records?page_size=100';
          if (pageToken) p += '&page_token=' + pageToken;
          const data = await feishuRequest('GET', p);
          all.push(...(data.data?.items || []));
          if (!data.data?.has_more) break;
          pageToken = data.data?.page_token || null;
        } while (true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records: all }));
        return;
      }

      // ===== Venues 列表 =====
      if (pathname === '/api/venues/list' && req.method === 'GET') {
        const VENUES_TABLE = 'tblKw40knld48WpO';
        const all = [];
        let pageToken = null;
        do {
          let p = '/bitable/v1/apps/' + CONFIG.baseId + '/tables/' + VENUES_TABLE + '/records?page_size=100';
          if (pageToken) p += '&page_token=' + pageToken;
          const data = await feishuRequest('GET', p);
          all.push(...(data.data?.items || []));
          if (!data.data?.has_more) break;
          pageToken = data.data?.page_token || null;
        } while (true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records: all }));
        return;
      }

      if (pathname === '/api/upload' && req.method === 'POST') {
        if (!json || !json.image) throw new Error('No image data');
        const result = await uploadImage(json.image, json.fileName);
        console.log('[Upload] Response:', JSON.stringify(result));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fileKey: result.file_key, fileToken: result.file_token, url: result.url, raw: result }));
        return;
      }

      // ===== v1.1 初始化：创建 Banner 表 + 场馆表 =====
      if (pathname === '/api/setup/v1.1' && req.method === 'POST') {
        const results = {};

        // 1. 创建 Banner 表
        const bannerCreate = await feishuRequest('POST', `/bitable/v1/apps/${CONFIG.baseId}/tables`, {
          table: {
            name: 'Banner',
            fields: [
              { field_name: '演出名称', type: 1 },
              { field_name: '演出时间', type: 1 },
              { field_name: '演出地点', type: 1 },
              { field_name: '图片', type: 17 },
            ]
          }
        });
        results.bannerTableId = bannerCreate.data.table_id;
        console.log('[Setup] Banner 表创建成功:', results.bannerTableId);

        // 2. 创建 Venues 表
        const venuesCreate = await feishuRequest('POST', `/bitable/v1/apps/${CONFIG.baseId}/tables`, {
          table: {
            name: 'Venues',
            fields: [
              { field_name: '场馆', type: 1 },
              { field_name: '所在城市', type: 1 },
              { field_name: '容量', type: 1 },
              { field_name: '类型', type: 1 },
              { field_name: '座位图', type: 17 },
              { field_name: '到达方式', type: 1 },
            ]
          }
        });
        results.venuesTableId = venuesCreate.data.table_id;
        console.log('[Setup] Venues 表创建成功:', results.venuesTableId);

        // 3. 上传 Banner 图片并创建记录
        const bannerItems = json.bannerItems || [];
        const bannerResults = [];
        for (const item of bannerItems) {
          try {
            const uploadRes = await uploadImage(item.image, item.fileName || 'banner.png');
            await feishuRequest('POST',
              `/bitable/v1/apps/${CONFIG.baseId}/tables/${results.bannerTableId}/records`,
              { fields: {
                '演出名称': item.name,
                '演出时间': item.time,
                '演出地点': item.location,
                '图片': [{ file_token: uploadRes.file_token }]
              }});
            bannerResults.push({ name: item.name, ok: true });
          } catch (e) {
            bannerResults.push({ name: item.name, ok: false, error: e.message });
          }
        }
        results.bannerItems = bannerResults;

        // 4. 插入场馆数据
        const venueItems = json.venueItems || [];
        const venueResults = [];
        for (const item of venueItems) {
          try {
            await feishuRequest('POST',
              `/bitable/v1/apps/${CONFIG.baseId}/tables/${results.venuesTableId}/records`,
              { fields: {
                '场馆': item.name,
                '所在城市': item.city,
                '容量': item.capacity,
                '类型': item.type,
                '到达方式': item.arrival,
              }});
            venueResults.push({ name: item.name, ok: true });
          } catch (e) {
            venueResults.push({ name: item.name, ok: false, error: e.message });
          }
        }
        results.venueItems = venueResults;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ...results }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (err) {
      console.error('Error:', err.message);
      const isTokenErr = err.message.includes('TOKEN_EXPIRED');
      res.writeHead(isTokenErr ? 401 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, needLogin: isTokenErr }));
    }
  });
});

// ===== 启动 =====
loadTokens();
setTimeout(() => refreshTokenIfNeeded(), 3000);
setInterval(() => refreshTokenIfNeeded(), 90 * 60 * 1000); // 每 90 分钟检查

server.listen(CONFIG.port, () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🎵 SeatLight Server');
  console.log(`  🌐 http://localhost:${CONFIG.port}`);
  console.log(`  📋 Base: ${CONFIG.baseId}`);
  console.log(`  📊 Table: ${CONFIG.tableId}`);
  console.log(`  🔑 Invite: ${CONFIG.inviteCode}`);
  console.log('═══════════════════════════════════════');
  console.log('');
});
