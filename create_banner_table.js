// create_banner_table.js
const fs = require('fs');
const path = require('path');

const CONFIG = {
  appId: 'cli_aac9ef4b3839dbea',
  appSecret: 'GNC8SYxcB3OywVOZaHi1Qf7iTsZTg4mh',
  baseId: 'X2MlbzaSFaTMSrs0qRNchJN4nEg',
};

// 图片路径
const images = [
  {
    name: 'IU 2026演唱会',
    time: '2026.09',
    location: '高阳综合运动场',
    filePath: '/Users/sto/.workbuddy/clipboard-images/clipboard-2026-07-01T07-52-21-003Z-846a700d.png',
    fileName: 'iu_concert.png'
  },
  {
    name: 'BTS WORLD TOUR ARIRANG',
    time: '2026.04',
    location: '高阳综合运动场',
    filePath: '/Users/sto/.workbuddy/clipboard-images/clipboard-2026-07-01T07-52-21-005Z-2c7aa360.png',
    fileName: 'bts_concert.png'
  },
  {
    name: '2PM THE RETURN in INCHEON',
    time: '2026.08',
    location: 'INSPIRE Arena',
    filePath: '/Users/sto/.workbuddy/clipboard-images/clipboard-2026-07-01T07-52-21-006Z-bb933198.png',
    fileName: '2pm_concert.png'
  }
];

let appAccessToken = '';
let appTokenExpiresAt = 0;
let bannerTableId = '';

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
  console.log('[Token] app_access_token 获取成功');
  return appAccessToken;
}

async function feishuApi(method, urlPath, body, isMultipart = false, headers = {}) {
  const token = await getAppAccessToken();
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...headers,
    },
  };
  if (body) {
    if (isMultipart) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch('https://open.feishu.cn/open-apis' + urlPath, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Non-JSON: ' + text.substring(0, 200)); }
  if (data.code !== 0) throw new Error('API [' + data.code + ']: ' + data.msg);
  return data;
}

// 1. 创建 Banner 表
async function createBannerTable() {
  console.log('\n[Step 1] 创建 Banner 表...');
  const data = await feishuApi('POST', `/bitable/v1/apps/${CONFIG.baseId}/tables`, {
    table: {
      name: 'Banner',
      fields: [
        { field_name: '演出名称', type: 1 },
        { field_name: '演出时间', type: 1 },
        { field_name: '演出地点', type: 1 },
        { field_name: '图片', type: 17 },  // 附件类型
      ]
    }
  });
  bannerTableId = data.data.table_id;
  console.log('[Step 1] Banner 表创建成功, table_id:', bannerTableId);
  return bannerTableId;
}

// 2. 上传图片到飞书
async function uploadImage(img) {
  console.log(`\n[Upload] 上传 ${img.fileName}...`);
  const fileBuffer = fs.readFileSync(img.filePath);
  const mimeType = 'image/png';
  const boundary = '----BannerUpload' + Date.now().toString(36);
  const CRLF = '\r\n';
  
  let body = '';
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="file_name"${CRLF}${CRLF}${img.fileName}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="parent_type"${CRLF}${CRLF}bitable_image${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="parent_node"${CRLF}${CRLF}${CONFIG.baseId}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="size"${CRLF}${CRLF}${fileBuffer.length}${CRLF}`;
  body += `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${img.fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const headerBuf = Buffer.from(body, 'utf-8');
  const footerBuf = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8');
  const fullBody = Buffer.concat([headerBuf, fileBuffer, footerBuf]);

  const token = await getAppAccessToken();
  const res = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: fullBody,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('上传失败: ' + data.msg);
  console.log(`[Upload] ${img.fileName} 上传成功, file_token:`, data.data.file_token);
  return data.data.file_token;
}

// 3. 创建记录
async function createRecord(fields) {
  const data = await feishuApi('POST',
    `/bitable/v1/apps/${CONFIG.baseId}/tables/${bannerTableId}/records`,
    { fields });
  console.log('[Record] 创建成功:', fields['演出名称']);
  return data;
}

async function main() {
  try {
    // 创建表
    await createBannerTable();
    
    // 上传每张图并创建记录
    for (const img of images) {
      const fileToken = await uploadImage(img);
      await createRecord({
        '演出名称': img.name,
        '演出时间': img.time,
        '演出地点': img.location,
        '图片': [{ file_token: fileToken }]
      });
    }
    
    console.log('\n✅ 全部完成！');
    console.log('Base ID:', CONFIG.baseId);
    console.log('Banner Table ID:', bannerTableId);
  } catch (err) {
    console.error('❌ 错误:', err.message);
  }
}

main();
