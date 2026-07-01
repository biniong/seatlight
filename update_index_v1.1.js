// update_index_v1.1.js
// 生成 v1.1 版本的 index.html 并替换 deploy/static/index.html
// 包含完整的前后端对接

const fs = require('fs');
const path = require('path');

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>SeatLight · 首尔演唱会座位视角</title>
  <style>
    :root {
      --primary: #5FD4B8; --primary-dark: #4ABFA3; --primary-light: #E8F8F5;
      --white: #FFFFFF; --bg: #F7FAFA;
      --text-primary: #2C3E50; --text-secondary: #5A6C7D; --text-muted: #95A5A6;
      --border: #E1E8ED; --shadow: 0 2px 12px rgba(0,0,0,0.06); --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; -webkit-font-smoothing: antialiased; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
      background: var(--bg); color: var(--text-primary); min-height: 100vh; line-height: 1.6;
    }
    .app-container { max-width: 480px; margin: 0 auto; padding: 0 0 80px; position: relative; }

    /* ===== 顶部品牌区 ===== */
    .top-bar { background: var(--white); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo { width: 34px; height: 34px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .brand-logo svg { width: 20px; height: 20px; fill: white; }
    .brand-text { font-size: 1.05rem; font-weight: 700; color: var(--text-primary); }
    .brand-subtitle { font-size: 0.7rem; color: var(--text-muted); margin-top: 1px; }

    /* ===== Banner 轮播 ===== */
    .banner-carousel { position: relative; width: 100%; height: 200px; overflow: hidden; background: var(--primary-light); }
    .banner-slide { position: absolute; width: 100%; height: 100%; opacity: 0; transition: opacity 0.6s ease-in-out; background-size: cover; background-position: center; }
    .banner-slide.active { opacity: 1; }
    .banner-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.5)); display: flex; flex-direction: column; justify-content: flex-end; padding: 24px; color: white; }
    .banner-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; text-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .banner-desc { font-size: 0.82rem; opacity: 0.95; text-shadow: 0 1px 4px rgba(0,0,0,0.3); }
    .banner-dots { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 10; }
    .banner-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.3s; }
    .banner-dot.active { width: 18px; border-radius: 3px; background: white; }
    .banner-empty { display: flex; align-items: center; justify-content: center; height: 100%; background: linear-gradient(135deg, var(--primary-light), var(--white)); color: var(--text-muted); font-size: 0.9rem; }

    /* ===== Tabs ===== */
    .tabs { display: flex; background: var(--white); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
    .tab { flex: 1; padding: 14px; text-align: center; font-size: 0.92rem; font-weight: 500; color: var(--text-secondary); cursor: pointer; border: none; background: none; position: relative; transition: all 0.2s; }
    .tab.active { color: var(--primary-dark); font-weight: 600; }
    .tab.active::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 40px; height: 3px; background: var(--primary); border-radius: 2px; }
    .tab-content { display: none; padding: 20px 16px; }
    .tab-content.active { display: block; }

    /* ===== 卡片 ===== */
    .card { background: var(--white); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
    .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
    .card-icon { width: 20px; height: 20px; fill: var(--primary); flex-shrink: 0; }

    /* ===== 表单 ===== */
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 8px; color: var(--text-secondary); }
    .form-input { width: 100%; padding: 12px 16px; font-size: 0.95rem; border: 1.5px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text-primary); transition: all 0.2s; font-family: inherit; }
    .form-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
    .form-input::placeholder { color: var(--text-muted); }
    .form-row { display: flex; gap: 12px; }
    .form-row .form-group { flex: 1; }

    /* ===== 可搜索下拉框 ===== */
    .searchable-wrap { position: relative; }
    .searchable-dropdown { display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--white); border: 1.5px solid var(--border); border-radius: 8px; max-height: 300px; overflow-y: auto; z-index: 50; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .searchable-dropdown.show { display: block; }
    .dropdown-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; }
    .dropdown-item:hover { background: var(--primary-light); }
    .dropdown-item:last-child { border-bottom: none; }
    .dropdown-item-title { font-weight: 600; margin-bottom: 2px; }
    .dropdown-item-meta { font-size: 0.75rem; color: var(--text-muted); }

    /* ===== 场馆信息卡片 ===== */
    .venue-info-card { background: linear-gradient(135deg, var(--primary-light), var(--white)); border: 1.5px solid var(--primary); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
    .venue-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
    .venue-poster { width: 80px; height: 80px; border-radius: 8px; background: var(--white); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
    .venue-poster img { width: 100%; height: 100%; object-fit: cover; }
    .venue-details { flex: 1; }
    .venue-name { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; color: var(--text-primary); }
    .venue-meta { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; color: var(--text-secondary); }
    .venue-meta-item { display: flex; align-items: center; gap: 6px; }
    .venue-meta-icon { width: 14px; height: 14px; fill: var(--primary); flex-shrink: 0; }
    .seatmap-section { margin-top: 16px; }
    .seatmap-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
    .seatmap-container { background: var(--white); border: 1.5px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
    .seatmap-container img { max-width: 100%; height: auto; border-radius: 6px; }
    .seatmap-placeholder { padding: 40px 20px; color: var(--text-muted); font-size: 0.85rem; }

    /* ===== 区域选择网格 ===== */
    .zone-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
    .zone-chip { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--white); border: 1.5px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 0.88rem; font-weight: 600; }
    .zone-chip:hover { border-color: var(--primary); background: var(--primary-light); }
    .zone-chip.active { border-color: var(--primary); background: var(--primary); color: white; }
    .zone-count { font-size: 0.68rem; color: var(--text-muted); margin-top: 4px; }
    .zone-chip.active .zone-count { color: rgba(255,255,255,0.9); }

    /* ===== 视角卡片 ===== */
    .view-card { background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 16px; }
    .view-image { width: 100%; height: 240px; background: var(--primary-light); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
    .view-image img { width: 100%; height: 100%; object-fit: cover; }
    .view-image-placeholder { color: var(--text-muted); font-size: 0.9rem; }
    .view-content { padding: 16px; }
    .view-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .tag { display: inline-block; padding: 4px 12px; font-size: 0.75rem; background: var(--primary-light); color: var(--primary-dark); border-radius: 4px; font-weight: 500; }
    .tag.active-tag { background: var(--primary); color: white; }
    .view-desc { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; }
    .view-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; }

    /* ===== 按钮 ===== */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; font-size: 0.95rem; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--primary); color: white; width: 100%; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-dark); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(95, 212, 184, 0.3); }
    .btn-secondary { background: var(--white); color: var(--text-secondary); border: 1.5px solid var(--border); }
    .btn-icon { width: 18px; height: 18px; fill: currentColor; }

    /* ===== 上传进度 ===== */
    .upload-progress { display: none; margin-top: 16px; }
    .upload-progress.show { display: block; }
    .progress-bar { width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--primary-dark)); border-radius: 4px; transition: width 0.3s ease; width: 0%; }
    .progress-text { font-size: 0.82rem; color: var(--text-secondary); text-align: center; }

    /* ===== 文件选择器 ===== */
    .file-selector { border: 2px dashed var(--border); border-radius: 8px; padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: var(--white); position: relative; }
    .file-selector:hover { border-color: var(--primary); background: var(--primary-light); }
    .file-selector.has-file { border-style: solid; border-color: var(--primary); padding: 12px; }
    .file-selector-icon { width: 48px; height: 48px; fill: var(--text-muted); margin-bottom: 12px; }
    .file-selector.has-file .file-selector-icon { display: none; }
    .file-selector-text { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; }
    .file-selector-hint { font-size: 0.75rem; color: var(--text-muted); }
    .file-selector.has-file .file-selector-text, .file-selector.has-file .file-selector-hint { display: none; }
    .file-preview { display: none; position: relative; }
    .file-selector.has-file .file-preview { display: block; }
    .file-preview img { max-width: 100%; max-height: 200px; border-radius: 6px; }
    .file-preview-remove { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .file-preview-remove svg { width: 16px; height: 16px; fill: white; }

    /* ===== 底部导航 ===== */
    .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: var(--white); border-top: 1px solid var(--border); display: flex; z-index: 100; padding: 8px 0 env(safe-area-inset-bottom, 8px); }
    .nav-item { flex: 1; text-align: center; padding: 8px 4px; cursor: pointer; color: var(--text-muted); transition: color 0.2s; }
    .nav-item.active { color: var(--primary); }
    .nav-icon { width: 22px; height: 22px; fill: currentColor; margin-bottom: 2px; }
    .nav-label { font-size: 0.72rem; font-weight: 500; }

    /* ===== Toast ===== */
    .toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); background: rgba(44, 62, 80, 0.9); color: white; padding: 14px 28px; border-radius: 8px; font-size: 0.9rem; z-index: 9999; opacity: 0; transition: all 0.25s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }

    /* ===== Loading ===== */
    .loading { text-align: center; padding: 32px; color: var(--text-muted); }
    .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ===== 邀请码弹窗 ===== */
    .invite-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .invite-overlay.hidden { display: none; }
    .invite-modal { background: var(--white); border-radius: var(--radius); padding: 32px 28px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
    .invite-modal h3 { font-size: 1.1rem; margin-bottom: 8px; }
    .invite-modal p { font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5; }
    .invite-modal .form-input { text-align: center; font-size: 1rem; letter-spacing: 0.1em; margin-bottom: 16px; }
    .invite-modal .btn { width: 100%; }
    .invite-error { color: #e74c3c; font-size: 0.82rem; margin-top: 10px; display: none; }
  </style>
</head>
<body>

<!-- 邀请码弹窗（默认隐藏） -->
<div class="invite-overlay hidden" id="inviteOverlay">
  <div class="invite-modal">
    <svg style="width:48px;height:48px;fill:var(--primary);margin-bottom:16px"><use href="#icon-key"></use></svg>
    <h3>请输入邀请码</h3>
    <p>当前为试点阶段，请输入邀请码后继续使用 SeatLight</p>
    <input class="form-input" id="inviteCode" placeholder="请输入邀请码" autocomplete="off">
    <button class="btn btn-primary" onclick="checkInviteCode()">验证</button>
    <div class="invite-error" id="inviteError">邀请码错误，请重试</div>
  </div>
</div>

<div class="app-container">
  <!-- 顶部品牌区 -->
  <div class="top-bar">
    <div class="brand">
      <div class="brand-logo"><svg viewBox="0 0 24 24"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l7 3.5v7.64l-7 3.5-7-3.5V7.68l7-3.5z"/></svg></div>
      <div><div class="brand-text">SeatLight</div><div class="brand-subtitle">首尔演唱会座位视角</div></div>
    </div>
  </div>

  <!-- Banner 轮播 -->
  <div class="banner-carousel" id="bannerCarousel">
    <div class="banner-empty" id="bannerEmpty">加载中...</div>
    <div class="banner-dots" id="bannerDots" style="display:none"></div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" data-tab="search">
      <svg class="btn-icon" style="margin-right:4px"><use href="#icon-search"></use></svg>查视角
    </button>
    <button class="tab" data-tab="upload">
      <svg class="btn-icon" style="margin-right:4px"><use href="#icon-upload"></use></svg>传视角
    </button>
  </div>

  <!-- 查视角 Tab -->
  <div class="tab-content active" id="tab-search">
    <!-- 场馆选择 -->
    <div class="card">
      <div class="card-title"><svg class="card-icon"><use href="#icon-venue"></use></svg>选择场馆</div>
      <div class="searchable-wrap">
        <input class="form-input" id="venueInput" placeholder="请选择场馆" autocomplete="off" readonly>
        <input type="hidden" id="venue">
        <div class="searchable-dropdown" id="venueDropdown"></div>
      </div>
    </div>

    <!-- 场馆信息（选中后显示） -->
    <div id="venueInfoSection" style="display:none">
      <div class="venue-info-card">
        <div class="venue-header">
          <div class="venue-poster" id="venuePosterWrap" style="display:none"><img id="venuePoster" src="" alt=""></div>
          <div class="venue-details">
            <div class="venue-name" id="venueName"></div>
            <div class="venue-meta">
              <div class="venue-meta-item"><svg class="venue-meta-icon"><use href="#icon-location"></use></svg><span id="venueCity"></span></div>
              <div class="venue-meta-item"><svg class="venue-meta-icon"><use href="#icon-capacity"></use></svg><span id="venueCapacity"></span></div>
              <div class="venue-meta-item"><svg class="venue-meta-icon"><use href="#icon-type"></use></svg><span id="venueType"></span></div>
            </div>
          </div>
        </div>
        <div class="seatmap-section">
          <div class="seatmap-title"><svg class="btn-icon"><use href="#icon-seatmap"></use></svg>座位图</div>
          <div class="seatmap-container" id="seatmapContainer"><div class="seatmap-placeholder">座位图暂缺</div></div>
        </div>
      </div>

      <!-- 区域选择 -->
      <div class="card">
        <div class="card-title"><svg class="card-icon"><use href="#icon-zone"></use></svg>选择区域</div>
        <div class="zone-grid" id="zoneGrid"></div>
      </div>
    </div>

    <!-- 视角结果 -->
    <div id="viewResultSection" style="display:none">
      <div class="card">
        <div class="card-title"><svg class="card-icon"><use href="#icon-view"></use></svg>座位视角</div>
        <div class="view-card" id="viewCard">
          <div class="view-image" id="viewImage"><div class="view-image-placeholder">暂无视角图</div></div>
          <div class="view-content">
            <div class="view-tags" id="viewTags"></div>
            <div class="view-desc" id="viewDesc"></div>
            <div class="view-meta" id="viewMeta"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 传视角 Tab -->
  <div class="tab-content" id="tab-upload">
    <div class="card">
      <div class="card-title"><svg class="card-icon"><use href="#icon-upload"></use></svg>上传视角图</div>

      <div class="form-group">
        <label class="form-label">场馆</label>
        <div class="searchable-wrap">
          <input class="form-input" id="upVenueInput" placeholder="请选择场馆" autocomplete="off" readonly>
          <input type="hidden" id="upVenue">
          <div class="searchable-dropdown" id="upVenueDropdown"></div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">区域 *</label>
        <input class="form-input" id="upArea" placeholder="如：7区、32区">
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">排</label><input class="form-input" id="upRow" placeholder="如：10"></div>
        <div class="form-group"><label class="form-label">座位号</label><input class="form-input" id="upSeat" placeholder="如：4"></div>
      </div>

      <div class="form-group">
        <label class="form-label">视角描述</label>
        <textarea class="form-input" id="upDesc" rows="3" placeholder="简单描述视角感受"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">选择图片 *</label>
        <div class="file-selector" id="fileSelector" onclick="document.getElementById('upFile').click()">
          <svg class="file-selector-icon"><use href="#icon-image"></use></svg>
          <div class="file-selector-text">点击选择图片</div>
          <div class="file-selector-hint">支持 JPG、PNG 格式</div>
          <div class="file-preview" id="filePreview"><img id="upImg" alt=""><div class="file-preview-remove" onclick="removeFile(event)"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div></div>
        </div>
        <input type="file" id="upFile" accept="image/*" style="display:none" onchange="handleFileSelect(event)">
      </div>

      <button class="btn btn-primary" id="upBtn" onclick="doUpload()">
        <svg class="btn-icon"><use href="#icon-upload"></use></svg>上传视角
      </button>

      <div class="upload-progress" id="uploadProgress">
        <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
        <div class="progress-text" id="progressText">上传中...</div>
      </div>
    </div>
  </div>
</div>

<!-- 底部导航 -->
<div class="bottom-nav">
  <div class="nav-item active" data-nav="search" onclick="switchTab('search')">
    <svg class="nav-icon"><use href="#icon-search"></use></svg><div class="nav-label">查视角</div>
  </div>
  <div class="nav-item" data-nav="upload" onclick="switchTab('upload')">
    <svg class="nav-icon"><use href="#icon-upload"></use></svg><div class="nav-label">传视角</div>
  </div>
</div>

<div class="toast" id="toast"></div>

<!-- SVG 图标定义 -->
<svg style="display:none">
  <symbol id="icon-search" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></symbol>
  <symbol id="icon-upload" viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></symbol>
  <symbol id="icon-venue" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></symbol>
  <symbol id="icon-location" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></symbol>
  <symbol id="icon-capacity" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></symbol>
  <symbol id="icon-type" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></symbol>
  <symbol id="icon-seatmap" viewBox="0 0 24 24"><path d="M4 18h3v-2H4v-3H2v5h2zm0-8h3V8H4V5H2v5h2zm4 8h12v-2H8v2zm0-8h12V8H8v2zM2 5v2h18V5H2z"/></symbol>
  <symbol id="icon-zone" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></symbol>
  <symbol id="icon-view" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></symbol>
  <symbol id="icon-image" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></symbol>
  <symbol id="icon-key" viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></symbol>
</svg>

<script>
// ===== 全局配置 =====
const INVITE_CODE_KEY = 'inviteCode';
const INVITE_VERIFIED_KEY = 'inviteVerified';
let inviteCode = localStorage.getItem(INVITE_CODE_KEY) || '';
let venues = [];
let bannerSlides = [];
let currentVenue = null;
let currentZone = null;
let selectedFile = null;
let carouselMatches = [];
let carouselIndex = 0;

// ===== 邀请码检查 =====
(function checkInvite() {
  if (localStorage.getItem(INVITE_VERIFIED_KEY) === '1' && inviteCode) return;
  document.getElementById('inviteOverlay').classList.remove('hidden');
  document.getElementById('inviteCode').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') checkInviteCode();
  });
})();

function checkInviteCode() {
  var code = document.getElementById('inviteCode').value.trim();
  var errorEl = document.getElementById('inviteError');
  var btn = document.querySelector('.invite-modal .btn');
  if (!code) { errorEl.textContent = '请输入邀请码'; errorEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = '验证中...'; errorEl.style.display = 'none';
  fetch('/api/invite/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        localStorage.setItem(INVITE_VERIFIED_KEY, '1');
        localStorage.setItem(INVITE_CODE_KEY, code);
        inviteCode = code;
        document.getElementById('inviteOverlay').classList.add('hidden');
        loadInitialData();
      } else { errorEl.textContent = '邀请码错误，请重试'; errorEl.style.display = 'block'; }
    })
    .catch(function() { errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block'; })
    .finally(function() { btn.disabled = false; btn.textContent = '验证'; });
}

function getHeaders() { return { 'Content-Type': 'application/json', 'X-Invite-Code': inviteCode }; }

// ===== Tab 切换 =====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab[data-tab="' + tab + '"]').forEach(t => t.classList.add('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-nav="' + tab + '"]').forEach(n => n.classList.add('active'));
}
document.querySelectorAll('.tab').forEach(function(tab) { tab.addEventListener('click', function() { switchTab(tab.dataset.tab); }); });

// ===== Toast =====
function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2200);
}

// ===== 加载初始数据 =====
function loadInitialData() {
  loadBannerData();
  loadVenueData();
}

// ===== Banner 轮播 =====
function loadBannerData() {
  fetch('/api/banner/list', { headers: getHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      bannerSlides = (data.records || []).map(function(rec) {
        var f = rec.fields || {};
        var imgs = f['图片'] || [];
        var fileToken = imgs.length > 0 ? (imgs[0].file_token || '') : '';
        return {
          name: f['演出名称'] || '',
          time: f['演出时间'] || '',
          location: f['演出地点'] || '',
          imgUrl: fileToken ? '/img/' + fileToken : ''
        };
      });
      renderBanner();
    })
    .catch(function() {
      document.getElementById('bannerEmpty').textContent = '暂无Banner数据';
    });
}

function renderBanner() {
  var carousel = document.getElementById('bannerCarousel');
  var dotsContainer = document.getElementById('bannerDots');

  if (bannerSlides.length === 0) {
    carousel.innerHTML = '<div class="banner-empty">暂无Banner数据</div>';
    return;
  }

  var slidesHtml = bannerSlides.map(function(s, i) {
    var bgStyle = s.imgUrl ? 'background-image:url(' + s.imgUrl + ')' : 'background:linear-gradient(135deg,var(--primary-light),var(--white))';
    return '<div class="banner-slide ' + (i === 0 ? 'active' : '') + '" style="' + bgStyle + '"><div class="banner-overlay"><div class="banner-title">' + escapeHtml(s.name) + '</div><div class="banner-desc">' + escapeHtml(s.time) + ' · ' + escapeHtml(s.location) + '</div></div></div>';
  }).join('');

  var dotsHtml = bannerSlides.map(function(_, i) {
    return '<div class="banner-dot ' + (i === 0 ? 'active' : '') + '" onclick="goToSlide(' + i + ')"></div>';
  }).join('');

  carousel.innerHTML = slidesHtml + '<div class="banner-dots" id="bannerDots">' + dotsHtml + '</div>';

  if (bannerSlides.length > 1) {
    setInterval(function() { goToSlide((currentSlideIndex + 1) % bannerSlides.length); }, 4000);
  }
}

var currentSlideIndex = 0;
function goToSlide(index) {
  var slides = document.querySelectorAll('.banner-slide');
  var dots = document.querySelectorAll('.banner-dot');
  if (slides.length === 0) return;
  slides[currentSlideIndex].classList.remove('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.remove('active');
  currentSlideIndex = index;
  slides[currentSlideIndex].classList.add('active');
  if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.add('active');
}

// ===== 场馆数据 =====
function loadVenueData() {
  fetch('/api/venues/list', { headers: getHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      venues = (data.records || []).map(function(rec) {
        var f = rec.fields || {};
        var imgs = f['座位图'] || [];
        var seatmapToken = imgs.length > 0 ? (imgs[0].file_token || '') : '';
        return {
          id: rec.record_id || '',
          name: f['场馆'] || '',
          city: f['所在城市'] || '',
          capacity: f['容量'] || '',
          type: f['类型'] || '',
          arrival: f['交通'] || '',
          seatmap: seatmapToken ? '/img/' + seatmapToken : ''
        };
      });
      console.log('[Venue] 加载场馆:', venues.length, '个');
    })
    .catch(function() { console.warn('[Venue] 加载失败'); });
}

// ===== 场馆下拉 =====
function setupVenueDropdown(inputId, dropdownId, hiddenId, onSelect) {
  var input = document.getElementById(inputId);
  var dropdown = document.getElementById(dropdownId);
  var hidden = document.getElementById(hiddenId);

  input.addEventListener('click', function(e) {
    e.stopPropagation();
    renderVenueDropdown(dropdown, hidden, onSelect);
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.searchable-wrap')) { dropdown.classList.remove('show'); }
  });
}

function renderVenueDropdown(dropdown, hidden, onSelect) {
  dropdown.innerHTML = venues.map(function(v) {
    return '<div class="dropdown-item" onclick="selectVenue(\'' + v.id + '\',\'' + dropdown.id + '\',\'' + hidden.id + '\')"><div class="dropdown-item-title">' + escapeHtml(v.name) + '</div><div class="dropdown-item-meta">' + escapeHtml(v.city) + ' · ' + escapeHtml(v.capacity) + '</div></div>';
  }).join('');
}

function selectVenue(venueId, dropdownId, hiddenId) {
  var venue = venues.find(function(v) { return v.id === venueId; });
  if (!venue) return;
  var dropdown = document.getElementById(dropdownId);
  var hidden = document.getElementById(hiddenId);
  var input = dropdown.previousElementSibling.previousElementSibling;
  input.value = venue.name;
  hidden.value = venue.id;
  dropdown.classList.remove('show');
  currentVenue = venue;
  if (dropdownId === 'venueDropdown') showVenueInfo(venue);
}

// ===== 显示场馆信息 =====
function showVenueInfo(venue) {
  document.getElementById('venueName').textContent = venue.name;
  document.getElementById('venueCity').textContent = venue.city;
  document.getElementById('venueCapacity').textContent = venue.capacity;
  document.getElementById('venueType').textContent = venue.type;

  var posterWrap = document.getElementById('venuePosterWrap');
  if (venue.seatmap) {
    document.getElementById('venuePoster').src = venue.seatmap;
    posterWrap.style.display = 'flex';
  } else {
    posterWrap.style.display = 'none';
  }

  if (venue.seatmap) {
    document.getElementById('seatmapContainer').innerHTML = '<img src="' + venue.seatmap + '" alt="座位图">';
  } else {
    document.getElementById('seatmapContainer').innerHTML = '<div class="seatmap-placeholder">座位图暂缺</div>';
  }

  // 渲染区域网格（从视角数据中统计）
  fetch('/api/records', { headers: getHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var records = data.records || [];
      var zoneMap = {};
      records.forEach(function(rec) {
        var f = rec.fields || {};
        var section = f['区域'] || '';
        var m = section.match(/(\\d+)/);
        var zoneKey = m ? m[1] : section;
        if (!zoneMap[zoneKey]) zoneMap[zoneKey] = { count: 0, hasImg: false };
        zoneMap[zoneKey].count++;
        var imgs = f['图片'] || [];
        if (imgs.length > 0) zoneMap[zoneKey].hasImg = true;
      });
      var sortedZones = Object.keys(zoneMap).sort(function(a, b) { return parseInt(a) - parseInt(b); });
      var grid = document.getElementById('zoneGrid');
      grid.innerHTML = sortedZones.map(function(z) {
        var zd = zoneMap[z];
        return '<div class="zone-chip" onclick="selectZone(\'' + z + '\')" style="' + (zd.hasImg ? 'border-color:var(--primary)' : '') + '"><div>' + z + '区</div><div class="zone-count">' + zd.count + '条</div></div>';
      }).join('');

      document.getElementById('venueInfoSection').style.display = 'block';
      document.getElementById('viewResultSection').style.display = 'none';
    });
}

// ===== 选择区域 =====
function selectZone(zone) {
  currentZone = zone;
  document.querySelectorAll('.zone-chip').forEach(function(c) { c.classList.remove('active'); });
  event.target.closest('.zone-chip').classList.add('active');
  showViewResult(zone);
}

// ===== 显示视角结果 =====
function showViewResult(zone) {
  var section = document.getElementById('viewResultSection');
  section.style.display = 'block';
  var viewImage = document.getElementById('viewImage');
  viewImage.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  fetch('/api/records', { headers: getHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var records = data.records || [];
      var matches = records.filter(function(rec) {
        var f = rec.fields || {};
        var s = f['区域'] || '';
        var m = s.match(/(\\d+)/);
        return m && m[1] === zone;
      });

      if (matches.length > 0) {
        carouselMatches = matches;
        carouselIndex = 0;
        renderCarousel();
      } else {
        viewImage.innerHTML = '<div class="view-image-placeholder">该区域暂无视角图</div>';
        document.getElementById('viewTags').innerHTML = '<span class="tag">' + escapeHtml(currentVenue ? currentVenue.name : '') + '</span><span class="tag">' + zone + '区</span>';
        document.getElementById('viewDesc').textContent = '该区域暂无视角图';
        document.getElementById('viewMeta').textContent = '';
      }
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function renderCarousel() {
  var viewImage = document.getElementById('viewImage');
  var match = carouselMatches[carouselIndex];
  var f = match.fields || {};
  var imgs = f['图片'] || [];
  var fileToken = imgs.length > 0 ? (imgs[0].file_token || '') : '';
  var imgUrl = fileToken ? '/img/' + fileToken : '';

  if (imgUrl) {
    viewImage.innerHTML = '<img src="' + imgUrl + '" alt="视角" onerror="this.parentElement.innerHTML=\\'<div class=\\\\\\'view-image-placeholder\\\\\\'>图片加载失败</div>\\'">';
  } else {
    viewImage.innerHTML = '<div class="view-image-placeholder">暂无图片</div>';
  }

  var section = f['区域'] || '';
  var row = f['排/座位号'] || '';
  var desc = f['视角描述'] || '';
  var uploadTime = f['上传时间'] || '';

  document.getElementById('viewTags').innerHTML = '<span class="tag active-tag">' + escapeHtml(currentVenue ? currentVenue.name : '') + '</span><span class="tag">' + escapeHtml(section) + '</span>' + (row ? '<span class="tag">' + escapeHtml(row) + '</span>' : '') + (carouselMatches.length > 1 ? '<span class="tag" style="color:var(--primary)">' + (carouselIndex + 1) + '/' + carouselMatches.length + '</span>' : '');
  document.getElementById('viewDesc').textContent = desc || '暂无描述';
  document.getElementById('viewMeta').textContent = uploadTime;

  // 导航按钮
  if (carouselMatches.length > 1) {
    var navHtml = '';
    if (carouselIndex > 0) navHtml += '<button onclick="navigateCarousel(-1)" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.9);border:1.5px solid var(--border);cursor:pointer">◀</button>';
    if (carouselIndex < carouselMatches.length - 1) navHtml += '<button onclick="navigateCarousel(1)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.9);border:1.5px solid var(--border);cursor:pointer">▶</button>';
    viewImage.style.position = 'relative';
    viewImage.insertAdjacentHTML('beforeend', navHtml);
  }
}

function navigateCarousel(dir) {
  carouselIndex = Math.max(0, Math.min(carouselMatches.length - 1, carouselIndex + dir));
  renderCarousel();
}

// ===== 文件选择 =====
function handleFileSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  selectedFile = file;
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('upImg').src = e.target.result;
    document.getElementById('fileSelector').classList.add('has-file');
  };
  reader.readAsDataURL(file);
}

function removeFile(event) {
  event.stopPropagation();
  selectedFile = null;
  document.getElementById('fileSelector').classList.remove('has-file');
  document.getElementById('upFile').value = '';
}

// ===== 上传 =====
async function doUpload() {
  var venue = document.getElementById('upVenue').value;
  var area = document.getElementById('upArea').value.trim();
  var row = document.getElementById('upRow').value.trim();
  var seat = document.getElementById('upSeat').value.trim();
  var desc = document.getElementById('upDesc').value.trim();

  if (!venue) { showToast('请选择场馆'); return; }
  if (!area) { showToast('请填写区域'); return; }
  if (!selectedFile) { showToast('请选择图片'); return; }

  var btn = document.getElementById('upBtn');
  var progress = document.getElementById('uploadProgress');
  var fill = document.getElementById('progressFill');
  var text = document.getElementById('progressText');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span>上传中...';
  progress.classList.add('show');
  fill.style.width = '0%';

  var simulateProgress = setInterval(function() {
    var current = parseFloat(fill.style.width) || 0;
    if (current < 90) { fill.style.width = (current + Math.random() * 15) + '%'; }
  }, 300);

  try {
    // 1. 上传图片
    var imgData = document.getElementById('upImg').src;
    var fileName = selectedFile.name || 'upload.jpg';
    text.textContent = '上传图片...';

    var uploadRes = await fetch('/api/upload', {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ image: imgData, fileName: fileName })
    });
    var uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error('上传失败: ' + uploadData.error);

    fill.style.width = '70%';
    text.textContent = '创建记录...';

    // 2. 创建记录
    var venueName = currentVenue ? currentVenue.name : '';
    var recordData = {
      fields: {
        '场馆': venueName,
        '区域': area,
        '排/座位号': row ? (row + '排' + (seat ? seat + '号' : '')) : (seat ? seat + '号' : ''),
        '视角描述': desc || '用户上传的演唱会现场视角',
        '艺人': '',
        '图片': uploadData.fileToken ? [{ file_token: uploadData.fileToken }] : [],
        '上传时间': new Date().toISOString().split('T')[0],
      }
    };

    var recordRes = await fetch('/api/records', { method: 'POST', headers: getHeaders(), body: JSON.stringify(recordData) });
    var recordResult = await recordRes.json();
    if (recordResult.error) throw new Error(recordResult.error);

    fill.style.width = '100%';
    text.textContent = '上传成功！';

    setTimeout(function() {
      btn.disabled = false;
      btn.innerHTML = '<svg class="btn-icon"><use href="#icon-upload"></use></svg>上传视角';
      progress.classList.remove('show');
      fill.style.width = '0%';
      document.getElementById('upArea').value = '';
      document.getElementById('upRow').value = '';
      document.getElementById('upSeat').value = '';
      document.getElementById('upDesc').value = '';
      document.getElementById('upVenue').value = '';
      document.getElementById('upVenueInput').value = '';
      removeFile(new Event('click'));
      showToast('视角已提交');
    }, 1500);

  } catch (err) {
    clearInterval(simulateProgress);
    text.textContent = '上传失败: ' + err.message;
    setTimeout(function() {
      btn.disabled = false;
      btn.innerHTML = '<svg class="btn-icon"><use href="#icon-upload"></use></svg>上传视角';
      progress.classList.remove('show');
      fill.style.width = '0%';
    }, 2000);
  }
}

// ===== 工具函数 =====
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 初始化 =====
if (localStorage.getItem(INVITE_VERIFIED_KEY) === '1' && inviteCode) {
  loadInitialData();
}
setupVenueDropdown('venueInput', 'venueDropdown', 'venue', null);
setupVenueDropdown('upVenueInput', 'upVenueDropdown', 'upVenue', null);
</script>
</body>
</html>`;

// 添加后端 API 到 server.js
const serverJsPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverJsPath, 'utf-8');

// 检查是否已添加 /api/banner/list 和 /api/venues/list
if (!serverContent.includes("'/api/banner/list'")) {
  const apiEndpoints = `
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
`;

  // 插入在 /api/upload 之前
  serverContent = serverContent.replace(
    "if (pathname === '/api/upload' && req.method === 'POST') {",
    apiEndpoints.trim() + "\n\n      if (pathname === '/api/upload' && req.method === 'POST') {"
  );

  fs.writeFileSync(serverJsPath, serverContent, 'utf-8');
  console.log('[Server] 已添加 /api/banner/list 和 /api/venues/list 接口');
}

// 写入 index.html
const indexPath = path.join(__dirname, 'static', 'index.html');
fs.writeFileSync(indexPath, indexHtml, 'utf-8');
console.log('[Frontend] 已更新 index.html 为 v1.1 版本');

// 清理临时文件
const tempFiles = ['index-v1.1.html', 'setup.html', 'upload_banner_images.js', 'fix_banner_records.js', 'create_banner_table.js'];
tempFiles.forEach(function(f) {
  var p = path.join(__dirname, 'static', f);
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('[Clean] 删除: ' + f); }
  var p2 = path.join(__dirname, f);
  if (fs.existsSync(p2)) { fs.unlinkSync(p2); console.log('[Clean] 删除: ' + f); }
});

console.log('\n✅ v1.1 前端+后端更新完成！');
