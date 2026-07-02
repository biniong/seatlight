# Banner 同步工具

从飞书多维表格自动同步 banner 图片到本地。

## 使用方法

```bash
node sync_banner.js
```

## 功能说明

1. 读取飞书 banner 表中的所有记录
2. 下载每张图片到 `static/img/banner/banner{N}.jpg`
3. 自动更新 `index.html` 中的 `bannerSlides` 数组

## 定时执行（可选）

### 使用 cron（Linux/macOS）

编辑 crontab：
```bash
crontab -e
```

添加定时任务（每天凌晨 2 点执行）：
```bash
0 2 * * * cd /Users/sto/WorkBuddy/2026-06-23-18-48-34/deploy && /Users/sto/.workbuddy/binaries/node/versions/22.12.0/bin/node sync_banner.js >> sync_banner.log 2>&1
```

### 使用 Task Scheduler（Windows）

1. 打开"任务计划程序"
2. 创建基本任务
3. 触发器：每天
4. 操作：启动程序
   - 程序：`node`
   - 参数：`sync_banner.js`
   - 起始于：`C:\path\to\deploy`

## 依赖

- Node.js
- 飞书应用凭证（从环境变量读取或硬编码在脚本中）

## 注意事项

- 首次运行会清空 `static/img/banner/` 目录中的旧 banner 文件
- 如果飞书表中某条记录没有图片，会跳过该记录
- 同步完成后会自动更新 `index.html`，需要重新提交代码才能部署
