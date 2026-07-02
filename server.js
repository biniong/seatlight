// server.js - SeatLight 生产部署版（Node.js 18+，零依赖）
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  baseId: process.env.FEISHU_BASE_ID || '',
  tableId: process.env.FEISHU_TABLE_ID || '',
  pendingTableId: process.env.FEISHU_PENDING_TABLE_ID || 'tbldisTDeUoTkptM',
  inviteCode: process.env.INVITE_CODE || 'seatlight2026',
  port: parseInt(process.env.PORT || '3000'),
};

// Token 存储路径：优先使用 Railway 持久化存储卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const TOKEN_STORE = path.join(DATA_DIR, 'token_store.json');
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
    // 优先从持久化文件加载（Railway Volume，跨部署保留最新 token）
    if (fs.existsSync(TOKEN_STORE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf-8'));
      if (data.userToken) {
        tokenState.userToken = data.userToken;
        tokenState.expiresAt = data.expiresAt || 0;
        tokenState.userName = data.userName || '';
        console.log('[Token] ✅ 从文件加载 user_token');
      }
      if (data.refreshToken) {
        tokenState.refreshToken = data.refreshToken;
        tokenState.refreshExpiresAt = data.refreshExpiresAt || Date.now() + 30 * 24 * 3600 * 1000;
        console.log('[Token] ✅ 从文件加载 refresh_token');
      }
    }
    
    // 文件没有时，从环境变量兜底（仅在首次部署或文件丢失时触发）
    if (!tokenState.userToken || !tokenState.refreshToken) {
      const envRefreshToken = process.env.FEISHU_REFRESH_TOKEN;
      const envUserToken = process.env.FEISHU_USER_TOKEN;
      if (envRefreshToken && !tokenState.refreshToken) {
        tokenState.refreshToken = envRefreshToken;
        tokenState.refreshExpiresAt = Date.now() + 30 * 24 * 3600 * 1000;
        console.log('[Token] 从环境变量兜底加载 refresh_token');
      }
      if (envUserToken && !tokenState.userToken) {
        tokenState.userToken = envUserToken;
        tokenState.expiresAt = 0; // 标记为未知有效期，触发强制刷新
        tokenState.userName = process.env.FEISHU_USER_NAME || '';
        console.log('[Token] 从环境变量兜底加载 user_token（有效期未知，将触发刷新）');
        // 如果同时有 refreshToken，立即写入文件
        if (tokenState.refreshToken) saveTokens();
      }
    }
    
    if (!tokenState.userToken && !tokenState.refreshToken) {
      console.log('[Token] 需要通过 OAuth 登录');
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
  if (tokenState.userToken) {
    return tokenState.userToken;
  }
  throw new Error('TOKEN_EXPIRED');
}

// 获取有效 token，必要时自动刷新（异步版本，用于需要刷新的场景）
async function getValidToken() {
  // 先尝试刷新（如果快过期了）
  await refreshTokenIfNeeded();
  // 如果还是没有有效 token，强制刷新
  if (!tokenState.userToken) {
    throw new Error('TOKEN_MISSING');
  }
  return tokenState.userToken;
}

// 用 refresh_token 续期 access_token（force=true 时跳过过期检查，强制刷新）
async function refreshTokenIfNeeded(force) {
  if (!tokenState.refreshToken) {
    console.warn('[Token] 无 refresh_token，无法自动续期');
    return false;
  }
  if (!force && Date.now() < tokenState.expiresAt - 120000) {
    return true; // 还有 2 分钟以上才过期
  }

  console.log('[Token] 🔁 正在使用 refresh_token 续期...', force ? '(强制刷新)' : '(即将过期)');
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
    
    // 同步更新环境变量（确保服务重启后也能加载最新 token）
    if (process.env.FEISHU_USER_TOKEN) {
      process.env.FEISHU_USER_TOKEN = data.data.access_token;
    }
    if (process.env.FEISHU_REFRESH_TOKEN) {
      process.env.FEISHU_REFRESH_TOKEN = data.data.refresh_token;
    }
    
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

  // 同步更新环境变量（确保服务重启后也能加载最新 token）
  process.env.FEISHU_USER_TOKEN = data.data.access_token;
  process.env.FEISHU_REFRESH_TOKEN = data.data.refresh_token;

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
async function feishuRequest(method, urlPath, body, useAppToken, _retried) {
  const token = useAppToken ? await getAppAccessToken() : await getValidToken();
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
  if (data.code !== 0) {
    // token 失效错误（常见 code: 99991663/99991668/99991661/99991664/99991677）→ 强制刷新 token 后重试一次
    if (!useAppToken && !_retried && [99991663, 99991668, 99991661, 99991664, 99991677].includes(data.code)) {
      console.log('[API] ⚠️ token 失效，强制刷新后重试...');
      tokenState.userToken = null; // 强制标记失效
      const ok = await refreshTokenIfNeeded();
      if (!ok) throw new Error('TOKEN_EXPIRED_AND_REFRESH_FAILED');
      return feishuRequest(method, urlPath, body, useAppToken, true); // 重试一次
    }
    throw new Error('API [' + data.code + ']: ' + data.msg);
  }
  return data;
}

async function getAllRecords() {
  const all = [];
  let pageToken = null;
  do {
    let p = `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records?page_size=100`;
    if (pageToken) p += '&page_token=' + pageToken;
    const data = await feishuRequest('GET', p, null, true);
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

async function createPendingRecord(fields) {
  console.log('[CreatePendingRecord] fields:', JSON.stringify(fields));
  // 添加审核状态
  fields['审核状态'] = '待审核';
  fields['上传时间'] = Date.now();
  const data = await feishuRequest('POST',
    `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records`,
    { fields });
  console.log('[CreatePendingRecord] response:', JSON.stringify(data));
  return data.data?.record;
}

async function uploadImage(base64Data, fileName, _retried) {
  const token = await getValidToken();
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
  if (data.code !== 0) {
    // token 失效错误（99991663/99991668/99991677）→ 强制刷新后重试一次
    if (!_retried && [99991663, 99991668, 99991677].includes(data.code)) {
      console.log('[Upload] ⚠️ token 失效，强制刷新后重试...');
      tokenState.userToken = null;
      const ok = await refreshTokenIfNeeded();
      if (!ok) throw new Error('TOKEN_EXPIRED_AND_REFRESH_FAILED');
      return uploadImage(base64Data, fileName, true);
    }
    throw new Error('上传失败: ' + data.msg + ' (raw: ' + JSON.stringify(data) + ')');
  }
  return data.data;
}

// ===== 图片代理：用服务端 token 下载飞书图片，转发给前端 =====
async function proxyFeishuImage(fileToken, res) {
  try {
    const token = await getAppAccessToken();
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

  // ===== 临时 API：导出 token（用于设置 Railway Variables） =====
  if (pathname === '/api/debug/export-tokens' && req.method === 'GET') {
    const inviteCode = req.headers['x-invite-code'];
    if (inviteCode !== CONFIG.inviteCode) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '无效的邀请码' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      FEISHU_USER_TOKEN: tokenState.userToken || '',
      FEISHU_REFRESH_TOKEN: tokenState.refreshToken || '',
      FEISHU_USER_NAME: tokenState.userName || '',
      hint: '请将以上值复制到 Railway Variables 中',
    }));
    return;
  }

  // ===== 临时 API：诊断同步问题 =====
  if (pathname === '/api/debug/sync-test' && req.method === 'GET') {
    const inviteCode = req.headers['x-invite-code'];
    if (inviteCode !== CONFIG.inviteCode) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '无效的邀请码' }));
      return;
    }
    try {
      const result = { tokenOk: false, pendingCount: 0, approvedCount: 0, errors: [], testCreate: null };
      
      // 1. 检查 token
      if (tokenState.userToken && Date.now() < tokenState.expiresAt - 60000) {
        result.tokenOk = true;
      } else {
        result.errors.push('Token expired or missing');
      }
      
      // 2. 查询待审核表
      if (result.tokenOk) {
        const data = await feishuRequest('GET',
          `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records?page_size=100`,
          null, false);
        result.pendingCount = data.data?.items?.length || 0;
        
        const approved = (data.data?.items || []).filter(r => r.fields['审核状态'] === '已通过');
        result.approvedCount = approved.length;
        
        // 3. 尝试创建一条测试记录
        if (approved.length > 0) {
          const testFields = { ...approved[0].fields };
          delete testFields['审核状态'];
          delete testFields['审核时间'];
          delete testFields['审核备注'];
          result.testFields = testFields;
          
          try {
            const createData = await feishuRequest('POST',
              `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records`,
              { fields: testFields });
            result.testCreate = { ok: true, record_id: createData.data?.record?.record_id };
            
            // 删除测试记录
            if (createData.data?.record?.record_id) {
              await feishuRequest('DELETE',
                `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records/${createData.data.record.record_id}`,
                null, false);
              result.testCreate.deleted = true;
            }
          } catch (e) {
            result.testCreate = { ok: false, error: e.message };
          }
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
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
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // ===== 公开 GET API（无需邀请码） =====
  const publicGetApis = ['/api/records', '/api/banner/list', '/api/venues/list'];
  if (pathname.startsWith('/api/') && !publicGetApis.includes(pathname)) {
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
        const record = await createPendingRecord(json.fields);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ record, pending: true }));
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
        const VENUES_TABLE = 'tblKw40knId48WpO';
        const recordData = await feishuRequest('POST',
          `/bitable/v1/apps/${CONFIG.baseId}/tables/${VENUES_TABLE}/records`,
          { fields: {
            '场馆': json.name,
            '所在城市': json.city,
            '容量': json.capacity,
            '类型': json.type,
            '交通': json.arrival,
          }});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, record: recordData.data?.record }));
        return;
      }

      // ===== 待审核记录列表 =====
      if (pathname === '/api/pending/list' && req.method === 'GET') {
        const all = [];
        let pageToken = null;
        do {
          let p = `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records?page_size=100`;
          if (pageToken) p += '&page_token=' + pageToken;
          const data = await feishuRequest('GET', p, null, true);
          all.push(...(data.data?.items || []));
          if (!data.data?.has_more) break;
          pageToken = data.data?.page_token || null;
        } while (true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records: all }));
        return;
      }

      // ===== 审核同步（将已通过记录复制到正式表） =====
      if (pathname === '/api/pending/sync' && req.method === 'POST') {
        // 确保 token 有效
        if (!tokenState.userToken || Date.now() >= tokenState.expiresAt - 120000) {
          const ok = await refreshTokenIfNeeded();
          if (!ok) throw new Error('TOKEN_EXPIRED');
        }
        // 查询所有待审核记录
        const pendingRecords = [];
        let pageToken = null;
        do {
          let p = `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records?page_size=100`;
          if (pageToken) p += '&page_token=' + pageToken;
          const data = await feishuRequest('GET', p, null, false);
          pendingRecords.push(...(data.data?.items || []));
          if (!data.data?.has_more) break;
          pageToken = data.data?.page_token || null;
        } while (true);

        // 筛选已通过审核的记录
        const approvedRecords = pendingRecords.filter(r => r.fields['审核状态'] === '已通过');

        let syncedCount = 0;
        for (const record of approvedRecords) {
          try {
            const fields = { ...record.fields };
            delete fields['审核状态'];
            delete fields['审核时间'];
            delete fields['审核备注'];

            // 转换上传时间：Unix 时间戳 -> YYYY-MM-DD 日期字符串
            if (typeof fields['上传时间'] === 'number') {
              const d = new Date(fields['上传时间']);
              fields['上传时间'] = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
            }

            await createRecord(fields);
            await feishuRequest('DELETE',
              `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records/${record.record_id}`,
              null, false);
            syncedCount++;
          } catch (e) {
            console.error('[Sync] 同步失败:', record.record_id, e.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, synced: syncedCount }));
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
          const data = await feishuRequest('GET', p, null, true);
          all.push(...(data.data?.items || []));
          if (!data.data?.has_more) break;
          pageToken = data.data?.page_token || null;
        } while (true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records: all }));
        return;
      }

      // ===== Venues 列表（从 Venues 表读取，使用 app token） =====
      if (pathname === '/api/venues/list' && req.method === 'GET') {
        const VENUES_TABLE = 'tblKw40knId48WpO';
        const all = [];
        let pageToken = null;
        do {
          let p = '/bitable/v1/apps/' + CONFIG.baseId + '/tables/' + VENUES_TABLE + '/records?page_size=100';
          if (pageToken) p += '&page_token=' + pageToken;
          const data = await feishuRequest('GET', p, null, true);
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
              { field_name: '交通', type: 1 },
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
                '交通': item.arrival,
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
// 启动时强制刷新一次 token（无论是否过期），确保拿到最新的 access_token
setTimeout(() => refreshTokenIfNeeded(true), 3000);
setInterval(() => refreshTokenIfNeeded(), 90 * 60 * 1000); // 每 90 分钟检查

server.listen(CONFIG.port, () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🎵 SeatLight Server');
  console.log(`  🌐 http://localhost:${CONFIG.port}`);
  console.log(`   Base: ${CONFIG.baseId}`);
  console.log(`  📊 Table: ${CONFIG.tableId}`);
  console.log(`  🔑 Invite: ${CONFIG.inviteCode}`);
  console.log('═══════════════════════════════════════');
  console.log('');
});

// ===== 自动审核同步（每 5 分钟检查一次） =====
async function autoSyncPendingRecords() {
  try {
    // 确保 token 有效（过期则尝试自动续期）
    if (!tokenState.userToken || Date.now() >= tokenState.expiresAt - 120000) {
      console.log('[AutoSync] token 即将过期，尝试续期...');
      const ok = await refreshTokenIfNeeded();
      if (!ok) {
        console.log('[AutoSync] 无有效 token 且续期失败，跳过同步');
        return;
      }
    }

    const pendingRecords = [];
    let pageToken = null;
    do {
      let p = `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records?page_size=100`;
      if (pageToken) p += '&page_token=' + pageToken;
      const data = await feishuRequest('GET', p, null, false);
      pendingRecords.push(...(data.data?.items || []));
      if (!data.data?.has_more) break;
      pageToken = data.data?.page_token || null;
    } while (true);

    const approvedRecords = pendingRecords.filter(r => r.fields['审核状态'] === '已通过');
    if (approvedRecords.length === 0) {
      console.log('[AutoSync] 暂无已通过的记录');
      return;
    }

    let syncedCount = 0;
    for (const record of approvedRecords) {
      try {
        const fields = { ...record.fields };
        delete fields['审核状态'];
        delete fields['审核时间'];
        delete fields['审核备注'];

        // 转换上传时间：Unix 时间戳 -> YYYY-MM-DD 日期字符串
        if (typeof fields['上传时间'] === 'number') {
          const d = new Date(fields['上传时间']);
          fields['上传时间'] = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        }

        await createRecord(fields);
        await feishuRequest('DELETE',
          `/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.pendingTableId}/records/${record.record_id}`,
          null, false);
        syncedCount++;
        console.log(`[AutoSync] ✅ 已同步: ${record.record_id}`);
      } catch (e) {
        console.error(`[AutoSync] 同步失败: ${record.record_id}`, e.message);
      }
    }
    console.log(`[AutoSync] 🔄 本次同步 ${syncedCount} 条已通过记录`);
  } catch (e) {
    console.log('[AutoSync] 异常:', e.message);
  }
}

setTimeout(() => { console.log('[AutoSync] 首次同步...'); autoSyncPendingRecords(); }, 5000);
setInterval(autoSyncPendingRecords, 5 * 60 * 1000);
console.log('[AutoSync] 每 5 分钟自动同步已通过审核的记录');
