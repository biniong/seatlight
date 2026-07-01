// upload_banner_images.js
// 在本地运行，读取你电脑上的图片文件，上传到线上服务器并创建 Banner 记录
// 用法: node upload_banner_images.js

const fs = require('fs');
const path = require('path');

const SERVER = 'https://seatlight-production.up.railway.app';
const INVITE_CODE = 'seatlight2026';

const BANNER_TABLE_ID = 'tblOJkxHGDx9Swqk';

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

async function uploadAndCreateRecords() {
  console.log('=== Banner 图片上传工具 ===\n');
  console.log('目标服务器:', SERVER);
  console.log('Banner 表 ID:', BANNER_TABLE_ID);
  console.log('');

  for (const img of images) {
    console.log('--- ' + img.name + ' ---');
    
    if (!fs.existsSync(img.filePath)) {
      console.log('❌ 文件不存在:', img.filePath);
      continue;
    }
    
    const fileSize = fs.statSync(img.filePath).size;
    console.log('文件大小:', (fileSize / 1024).toFixed(1) + 'KB');

    // 读取文件并转 base64
    const buffer = fs.readFileSync(img.filePath);
    const base64 = 'data:image/png;base64,' + buffer.toString('base64');
    console.log('Base64 大小:', (base64.length / 1024).toFixed(1) + 'KB');

    // 1. 上传图片到飞书
    console.log('上传图片...');
    const uploadRes = await fetch(SERVER + '/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Invite-Code': INVITE_CODE
      },
      body: JSON.stringify({ image: base64, fileName: img.fileName })
    });
    const uploadData = await uploadRes.json();
    console.log('上传响应:', uploadData.error ? '❌ ' + uploadData.error : '✅');
    
    if (uploadData.error) {
      console.log('跳过此图片');
      continue;
    }

    const fileToken = uploadData.fileToken;
    console.log('file_token:', fileToken || '(无)');

    if (!fileToken) {
      console.log('❌ 未获得 file_token');
      continue;
    }

    // 2. 创建 Banner 记录
    console.log('创建记录...');
    const recordRes = await fetch(SERVER + '/api/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Invite-Code': INVITE_CODE
      },
      body: JSON.stringify({
        fields: {
          '演出名称': img.name,
          '演出时间': img.time,
          '演出地点': img.location,
          '图片': [{ file_token: fileToken }]
        }
      })
    });
    const recordData = await recordRes.json();
    console.log(recordData.error ? '❌ ' + recordData.error : '✅ 记录创建成功');
    console.log('');
  }

  console.log('=== 全部完成 ===');
}

uploadAndCreateRecords().catch(err => console.error('Fatal:', err.message));
