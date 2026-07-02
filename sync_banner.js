#!/usr/bin/env node
// 从飞书表格同步 banner 图片到本地 img/banner/ 目录
// 用法: node sync_banner.js
// 建议通过 cron 定时执行

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  appId: process.env.FEISHU_APP_ID || 'cli_aac9ef4b3839dbea',
  appSecret: process.env.FEISHU_APP_SECRET || 'GNC8SYxcB3OywVOZaHi1Qf7iTsZTg4mh',
  baseId: process.env.FEISHU_BASE_ID || 'X2MlbzaSFaTMSrs0qRNchJN4nEg',
  tableId: process.env.FEISHU_BANNER_TABLE_ID || 'tblOJkxHGDx9Swqk'
};

const BANNER_DIR = path.join(__dirname, 'static', 'img', 'banner');

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function getAppAccessToken() {
  const body = JSON.stringify({
    app_id: CONFIG.appId,
    app_secret: CONFIG.appSecret
  });
  const res = await fetchJSON('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  if (res.code !== 0) throw new Error(`Get app token failed: ${res.msg}`);
  return res.app_access_token;
}

async function getBannerRecords(appAccessToken) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.baseId}/tables/${CONFIG.tableId}/records?page_size=100`;
  const res = await fetchJSON(url, {
    headers: { 'Authorization': `Bearer ${appAccessToken}` }
  });
  if (res.code !== 0) throw new Error(`Get records failed: ${res.msg}`);
  return res.data.items || [];
}

async function downloadImage(fileToken, appAccessToken, dest) {
  const url = `https://open.feishu.cn/open-apis/drive/v1/medias/${fileToken}/download?extra=1`;
  const file = fs.createWriteStream(dest);

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Authorization': `Bearer ${appAccessToken}` }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('🎨 Starting banner sync from Feishu...\n');

  // Ensure directory exists
  if (!fs.existsSync(BANNER_DIR)) {
    fs.mkdirSync(BANNER_DIR, { recursive: true });
  }

  // Get app access token
  const appToken = await getAppAccessToken();
  console.log('✅ Got app access token\n');

  // Get banner records
  const records = await getBannerRecords(appToken);
  console.log(`📋 Found ${records.length} banner records\n`);

  if (records.length === 0) {
    console.log('⚠️  No banner records found, skipping sync');
    return;
  }

  // Clear old banner files
  const oldFiles = fs.readdirSync(BANNER_DIR).filter(f => f.startsWith('banner') && f.endsWith('.jpg'));
  for (const f of oldFiles) {
    fs.unlinkSync(path.join(BANNER_DIR, f));
    console.log(`🗑️  Removed old: ${f}`);
  }
  console.log('');

  // Download new banners
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const fields = record.fields;
    const images = fields['图片'];

    if (!images || images.length === 0) {
      console.log(`⚠️  Record ${i + 1} has no image, skipping`);
      continue;
    }

    const fileToken = images[0].file_token;
    const fileName = `banner${i + 1}.jpg`;
    const destPath = path.join(BANNER_DIR, fileName);

    console.log(`📥 Downloading ${fileName} (token: ${fileToken})...`);
    await downloadImage(fileToken, appToken, destPath);
    console.log(`✅ Saved: ${fileName}\n`);
  }

  // Update index.html bannerSlides
  console.log('📝 Updating index.html bannerSlides array...\n');
  const indexPath = path.join(__dirname, 'static', 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf-8');

  const newSlidesArray = records.map((_, i) =>
    `  { name: '演唱会', imgUrl: 'img/banner/banner${i + 1}.jpg' }`
  ).join(',\n');

  const newSlides = `var bannerSlides = [\n${newSlidesArray}\n];`;

  // Replace existing bannerSlides array
  indexHtml = indexHtml.replace(/var bannerSlides = \[[\s\S]*?\];/, newSlides);

  fs.writeFileSync(indexPath, indexHtml);
  console.log('✅ Updated index.html\n');

  console.log('🎉 Banner sync completed successfully!');
}

main().catch(err => {
  console.error('❌ Banner sync failed:', err.message);
  process.exit(1);
});
