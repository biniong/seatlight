// fix_banner_records.js
// 直接用飞书 API 往 Banner 表写入记录（图片已上传成功，只需创建记录）
// 需要先在 Railway 上重新登录获取有效 user token

const https = require('https');
const http = require('http');

const SERVER = 'https://seatlight-production.up.railway.app';
const BASE_ID = 'X2MlbzaSFaTMSrs0qRNchJN4nEg';
const BANNER_TABLE_ID = 'tblOJkxHGDx9Swqk';
const VENUES_TABLE_ID = 'tblKw40knld48WpO';

// 已上传的图片 file_token（从上次成功上传获得）
const bannerRecords = [
  { name: 'IU 2026演唱会', time: '2026.09', location: '高阳综合运动场', file_token: 'AOpdbeFu0oGrr0x3G4KcGpZQnRc' },
  { name: 'BTS WORLD TOUR ARIRANG', time: '2026.04', location: '高阳综合运动场', file_token: 'OrD0bYWZjok9ikxsYWEcr4ivnPc' },
  { name: '2PM THE RETURN in INCHEON', time: '2026.08', location: 'INSPIRE Arena', file_token: 'ZIZJbxoero1TkuxRt9XcYqTHnVf' }
];

// 场馆数据（setup 时已成功创建，这里检查是否需要补充）
const venueRecords = [
  { name: 'KSPO DOME 奥林匹克体操竞技场', city: '首尔', capacity: '约15,000人', type: '室内竞技场', arrival: '地铁5号线奥林匹克公园站' },
  { name: '高阳综合运动场', city: '高阳', capacity: '约40,000人', type: '室外体育场', arrival: '地铁3号线鼎钵站' },
  { name: 'INSPIRE Arena', city: '仁川', capacity: '约15,000人', type: '室内竞技场', arrival: '仁川机场磁浮线INSPIRE站' }
];

// 调用服务端 API（使用邀请码 + user token）
async function callApi(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Invite-Code': 'seatlight2026',
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== 修复 Banner 记录 ===\n');

  // 先检查登录状态
  const authStatus = await callApi('/api/auth/status', 'GET');
  console.log('登录状态:', authStatus.loggedIn ? '✅ 已登录' : '❌ 未登录/已过期');
  console.log('用户名:', authStatus.userName || '未知');
  console.log('Token 过期:', authStatus.expiresAt ? new Date(authStatus.expiresAt).toISOString() : 'N/A');
  console.log('');

  if (!authStatus.loggedIn) {
    console.log('️ 需要先登录！');
    console.log('请打开以下链接完成飞书登录：');
    console.log(SERVER + '/login.html');
    console.log('');
    console.log('登录完成后，再运行一次此脚本。');
    process.exit(1);
  }

  // 用 /api/records POST 创建记录到 Banner 表
  // 注意：需要指定 tableId，但当前 /api/records 用的是 CONFIG.tableId（视角数据表）
  // 所以我们需要一个自定义接口

  // 方案：调用一个专用的 Banner 记录创建接口
  console.log('创建 Banner 记录...\n');

  for (const r of bannerRecords) {
    const result = await callApi('/api/banner/create', 'POST', {
      name: r.name,
      time: r.time,
      location: r.location,
      file_token: r.file_token
    });
    console.log(r.name + ':', result.ok ? '✅ 成功' : '❌ ' + (result.error || JSON.stringify(result)));
  }

  console.log('\n=== 完成 ===');
}

main().catch(err => console.error('Fatal:', err.message));
