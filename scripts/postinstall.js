#!/usr/bin/env node
'use strict';

/**
 * 安装后提示。
 *
 * 刻意不自动下载 Chromium —— 它约 700MB，很多人已经装过，
 * 静默下载会让 `npm i -g web-render` 卡上几分钟还看不出在干什么。
 * 这里只做检测 + 提示，永不阻断安装。
 */

const { execSync } = require('child_process');

function chromiumInstalled() {
  try {
    const { chromium } = require('playwright');
    const p = chromium.executablePath();
    return p ? require('fs').existsSync(p) : false;
  } catch (_) {
    return false;
  }
}

try {
  if (chromiumInstalled()) {
    console.log('\x1b[32m✔\x1b[0m web-render 就绪，Chromium 已安装，直接运行 \x1b[1mweb-render --help\x1b[0m');
  } else {
    console.log('');
    console.log('\x1b[33m⚠\x1b[0m web-render 已安装，但缺少 Chromium 内核（约 700MB）。');
    console.log('  请再执行一次：');
    console.log('');
    console.log('    \x1b[1mnpx playwright install chromium\x1b[0m');
    console.log('');
    console.log('  国内网络较慢时可先设置镜像源：');
    console.log('    Windows: \x1b[36mset PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright\x1b[0m');
    console.log('    macOS/Linux: \x1b[36mexport PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright\x1b[0m');
    console.log('');
  }
} catch (_) {
  /* 提示失败不影响安装 */
}

process.exit(0);
