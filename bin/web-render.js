#!/usr/bin/env node
'use strict';

/**
 * web-render — 无头浏览器命令行工具（Playwright / Chromium）
 *
 * 用途：网页截图、整页长图、PDF 导出、正文抓取、Markdown 转换、链接提取、任意 JS 求值
 * 依赖：playwright（浏览器内核另需 `npx playwright install chromium`）
 *
 * 项目主页：https://github.com/<owner>/web-render
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ---------------------------------------------------------------- 依赖查找
/**
 * 在候选目录里尝试 require 某个包。
 * 用于「全局安装 playwright、但工具本身不是局部依赖」的场景。
 */
function tryRequireFrom(name, dirs) {
  const { createRequire } = require('module');
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      const req = createRequire(path.join(dir, '__anchor__.js'));
      return req(name);
    } catch (_) {
      /* 继续找下一个 */
    }
  }
  return null;
}

/** 各平台常见的全局 node_modules 位置 */
function globalNodeModuleDirs() {
  const home = os.homedir();
  const dirs = [];

  if (process.env.PLAYWRIGHT_NODE_MODULES) dirs.push(process.env.PLAYWRIGHT_NODE_MODULES);
  if (process.env.NODE_PATH) dirs.push(...process.env.NODE_PATH.split(path.delimiter));

  if (process.platform === 'win32') {
    if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
  } else {
    // macOS / Linux：Homebrew、nvm、volta、asdf 等常见落点
    dirs.push(
      '/opt/homebrew/lib/node_modules',
      '/usr/local/lib/node_modules',
      '/usr/lib/node_modules',
      path.join(home, '.npm-global', 'lib', 'node_modules'),
      path.join(home, '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules'),
      path.join(home, '.volta', 'tools', 'image', 'packages', 'node', 'lib', 'node_modules')
    );
  }

  // 让 npm 自己报一次全局根目录（最准，但起子进程有开销，放最后）
  try {
    const root = execSync('npm root -g', {
      encoding: 'utf8',
      shell: true,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (root) dirs.push(root);
  } catch (_) {
    /* npm 不可用时忽略 */
  }

  // 去重
  return [...new Set(dirs.filter(Boolean))];
}

function loadPlaywright() {
  // 1. 常规依赖（npm i -g 或本地安装，Node 自己会找到）
  try {
    return require('playwright');
  } catch (_) {}
  try {
    return require('playwright-core');
  } catch (_) {}

  // 2. 扫全局目录
  const found = tryRequireFrom('playwright', globalNodeModuleDirs());
  if (found) return found;

  fail(
    '未找到 playwright。请先安装：\n' +
      '  npm i -g playwright\n' +
      '  npx playwright install chromium\n' +
      '若已装在非标准位置，可设置环境变量 PLAYWRIGHT_NODE_MODULES 指向其 node_modules 目录。'
  );
}

const pw = loadPlaywright();

// ---------------------------------------------------------------- 工具函数
function fail(msg, code = 1) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(code);
}
function log(msg) {
  console.error(msg);
}
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function abs(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}
function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------- 参数解析
function parseArgs(argv) {
  const pos = [];
  const flags = {};
  const multi = { header: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'header') {
        multi.header.push(argv[++i] || '');
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      pos.push(a);
    }
  }
  flags._header = multi.header;
  return { pos, flags };
}

function optNum(flags, key, dflt) {
  const v = flags[key];
  if (v === undefined || v === true) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ---------------------------------------------------------------- 浏览器会话
async function withPage(flags, fn) {
  const headless = !flags.headed;
  const browser = await pw.chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      ...(flags['ignore-cert'] ? ['--ignore-certificate-errors'] : []),
    ],
  });

  const mobile = Boolean(flags.mobile);
  const viewport = mobile
    ? pw.devices['iPhone 13'].viewport
    : { width: optNum(flags, 'width', 1440), height: optNum(flags, 'height', 900) };

  const contextOpts = {
    viewport,
    deviceScaleFactor: optNum(flags, 'scale', mobile ? 3 : 1),
    colorScheme: flags.dark ? 'dark' : flags.light ? 'light' : 'light',
    locale: flags.lang || 'zh-CN',
    timezoneId: flags.timezone || 'Asia/Shanghai',
    userAgent: flags.ua || (mobile ? pw.devices['iPhone 13'].userAgent : CHROME_UA),
    isMobile: mobile,
    hasTouch: mobile,
    ignoreHTTPSErrors: Boolean(flags['ignore-cert']),
    extraHTTPHeaders: buildHeaders(flags),
    acceptDownloads: false,
  };

  if (flags.storage) {
    const sp = abs(flags.storage);
    if (!fs.existsSync(sp)) fail(`storage 文件不存在：${sp}`);
    try {
      contextOpts.storageState = JSON.parse(fs.readFileSync(sp, 'utf8'));
    } catch (e) {
      fail(`storage 文件解析失败：${e.message}`);
    }
  }

  const context = await browser.newContext(contextOpts);

  // 轻量反自动化探测规避
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

  if (flags['block-images']) {
    await context.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return route.abort();
      return route.continue();
    });
  }

  const page = await context.newPage();
  const timeout = optNum(flags, 'timeout', 45000);

  try {
    const url = normalizeUrl(flags.url || '');
    const waitUntil = flags['wait-until'] || 'domcontentloaded';
    log(`→ 打开 ${url}`);
    await page.goto(url, { waitUntil, timeout });

    if (flags['wait']) {
      log(`→ 等待选择器 ${flags.wait}`);
      await page.waitForSelector(String(flags.wait), { timeout }).catch(() => log(`  ⚠ 选择器超时，继续`));
    }
    if (flags['network-idle']) {
      await page.waitForLoadState('networkidle', { timeout }).catch(() => log('  ⚠ networkidle 超时，继续'));
    }
    if (flags['scroll']) {
      await autoScroll(page);
    }
    const delay = optNum(flags, 'delay', 0);
    if (delay > 0) await page.waitForTimeout(delay);

    const result = await fn(page, context);

    if (flags['save-storage']) {
      const sp = abs(String(flags['save-storage']));
      ensureDir(sp);
      await context.storageState({ path: sp });
      log(`→ 登录态已保存 ${sp}`);
    }
    return result;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function buildHeaders(flags) {
  const h = { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' };
  for (const raw of flags._header || []) {
    const idx = raw.indexOf(':');
    if (idx > 0) h[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return h;
}

function normalizeUrl(u) {
  if (!u) fail('缺少 URL');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
  if (u.startsWith('file://')) return u;
  if (fs.existsSync(u)) return 'file://' + abs(u).replace(/\\/g, '/');
  return 'https://' + u;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 1000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 12000);
    });
  });
}

// ---------------------------------------------------------------- 命令实现
const commands = {};

// 截图
commands.shot = async (flags) => {
  const ext = String(flags.out || '').toLowerCase().endsWith('.jpg') ? 'jpeg' : 'png';
  const out = abs(String(flags.out || `shot-${stamp()}.${ext === 'jpeg' ? 'jpg' : 'png'}`));
  await withPage(flags, async (page) => {
    ensureDir(out);
    const target = flags.selector ? page.locator(String(flags.selector)).first() : page;
    await target.screenshot({
      path: out,
      fullPage: Boolean(flags.full) && !flags.selector,
      type: ext,
      ...(ext === 'jpeg' ? { quality: optNum(flags, 'quality', 88) } : {}),
      animations: 'disabled',
      caret: 'hide',
      ...(flags.selector ? { timeout: optNum(flags, 'timeout', 30000) } : {}),
    });
    const size = (fs.statSync(out).size / 1024).toFixed(0);
    log(`✔ 截图已保存 ${out} (${size} KB)`);
    console.log(out);
  });
};

// PDF
commands.pdf = async (flags) => {
  const out = abs(String(flags.out || `page-${stamp()}.pdf`));
  await withPage(flags, async (page) => {
    ensureDir(out);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: out,
      format: flags.format || 'A4',
      printBackground: true,
      landscape: Boolean(flags.landscape),
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    });
    const size = (fs.statSync(out).size / 1024).toFixed(0);
    log(`✔ PDF 已保存 ${out} (${size} KB)`);
    console.log(out);
  });
};

// 纯文本
commands.text = async (flags) => {
  const txt = await withPage(flags, async (page) => {
    const sel = flags.selector ? String(flags.selector) : 'body';
    const t = await page.evaluate((s) => {
      const el = document.querySelector(s) || document.body;
      return el ? el.innerText : '';
    }, sel);
    return t || '';
  });
  const max = optNum(flags, 'max', 0);
  emit(max > 0 ? txt.slice(0, max) : txt, flags);
};

function emit(text, flags) {
  if (flags.out) {
    const out = abs(String(flags.out));
    ensureDir(out);
    fs.writeFileSync(out, text, 'utf8');
    log(`✔ 已保存 ${out} (${text.length} 字)`);
    console.log(out);
  } else {
    console.log(text);
  }
}

// 原始 HTML
commands.html = async (flags) => {
  const html = await withPage(flags, async (page) => {
    if (flags.selector) {
      return await page.evaluate((s) => {
        const el = document.querySelector(s);
        return el ? el.outerHTML : '';
      }, String(flags.selector));
    }
    return await page.content();
  });
  emit(html, flags);
};

// 渲染后 HTML 快照（SPA 友好，等价于 html）
commands.dump = async (flags) => {
  await commands.html(flags);
};

// Markdown（保留结构，去掉脚本/样式/导航噪音）
commands.md = async (flags) => {
  let TurndownService = null;
  try {
    TurndownService = require('turndown');
  } catch (_) {
    // 全局安装时 turndown 可能不在本地 node_modules
    TurndownService = tryRequireFrom('turndown', globalNodeModuleDirs());
  }
  if (!TurndownService) {
    log('  ⚠ 未安装 turndown，降级为纯文本输出（npm i -g turndown 可获得结构化 Markdown）');
  }

  const payload = await withPage(flags, async (page) => {
    return await page.evaluate(
      ({ keepBoiler, keepImages, keepLinks }) => {
        const title = document.title;
        const clone = document.body.cloneNode(true);
        clone
          .querySelectorAll('script, style, noscript, svg, iframe, template, link[rel="stylesheet"]')
          .forEach((n) => n.remove());
        // 表单控件对正文无意义；部分站点（如百度）把整段 CSS 转义塞进 textarea，必须去掉
        clone
          .querySelectorAll('textarea, input, select, button, [hidden], [aria-hidden="true"]')
          .forEach((n) => n.remove());
        if (!keepBoiler) {
          clone
            .querySelectorAll('nav, footer, aside, [role="navigation"], [role="banner"]')
            .forEach((n) => n.remove());
        }
        if (!keepImages) clone.querySelectorAll('img, picture, video').forEach((n) => n.remove());
        if (!keepLinks) clone.querySelectorAll('a').forEach((a) => a.replaceWith(...a.childNodes));
        return { title, html: clone.innerHTML, url: location.href };
      },
      {
        keepBoiler: Boolean(flags['keep-boilerplate']),
        keepImages: Boolean(flags['keep-images']),
        keepLinks: Boolean(flags['keep-links']),
      }
    );
  });

  let body;
  // 双保险：DOM 已移除过 script/style，这里再按字符串兜底清一遍（部分页面动态重插）
  const cleanedHtml = payload.html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, '');
  if (TurndownService) {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    td.remove(['script', 'style']);
    body = td.turndown(cleanedHtml);
  } else {
    body = cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\n{3,}/g, '\n\n');
  }

  body = body.replace(/\n{3,}/g, '\n\n').trim();
  // 兜底：转义文本被解码后可能重新冒出 <style>/<script> 块，最后再清一次
  body = body
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const md = `# ${payload.title || '(无标题)'}\n\n> 来源：${payload.url}\n> 抓取时间：${new Date().toLocaleString('zh-CN')}\n\n${body}\n`;
  const max = optNum(flags, 'max', 0);
  emit(max > 0 ? md.slice(0, max) : md, flags);
};

// 链接清单
commands.links = async (flags) => {
  const links = await withPage(flags, async (page) => {
    return await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        href: a.href,
      }))
    );
  });
  const seen = new Set();
  const uniq = links.filter((l) => {
    if (!l.href || seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
  emit(uniq.map((l) => `${l.text || '(无文字)'}\t${l.href}`).join('\n'), flags);
};

// 任意 JS 求值
commands.eval = async (flags) => {
  const script = flags.script;
  if (!script) fail('缺少 --script "JS 代码"');
  const r = await withPage(flags, async (page) => {
    return await page.evaluate(String(script));
  });
  emit(typeof r === 'string' ? r : JSON.stringify(r, null, 2), flags);
};

// ---------------------------------------------------------------- 入口
function pkgVersion() {
  try {
    return require('../package.json').version || '';
  } catch (_) {
    return '';
  }
}

function pwVersion() {
  try {
    return require(path.join(path.dirname(require.resolve('playwright/package.json')), 'package.json')).version;
  } catch (_) {}
  for (const dir of globalNodeModuleDirs()) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'playwright', 'package.json'), 'utf8')).version;
    } catch (_) {}
  }
  return '';
}

function printHelp() {
  const h = `
\x1b[1mweb-render\x1b[0m ${pkgVersion()} — 无头浏览器命令行工具 (Playwright ${pwVersion()})

\x1b[1m用法\x1b[0m
  web-render <命令> <url> [选项]

\x1b[1m命令\x1b[0m
  shot     截图（--full 整页长图 / --selector 局部截图）
  pdf      导出 PDF
  text     提取纯文本
  md       提取正文并转 Markdown（推荐做资料收集）
  html     导出渲染后的完整 HTML
  links    提取页面所有链接
  eval     在页面内执行 JS 表达式并输出结果

\x1b[1m通用选项\x1b[0m
  --out <路径>            输出文件（默认当前目录）
  --width / --height      视口尺寸，默认 1440x900
  --scale <n>             设备像素比，2 = 高清图
  --mobile                模拟 iPhone 13
  --dark / --light        配色方案
  --full                  整页截图
  --selector <css>        只处理某个元素
  --wait <css>            等待元素出现
  --delay <ms>            额外等待（懒加载/动画）
  --scroll                先滚到底再处理（触发懒加载）
  --wait-until <state>    load | domcontentloaded | networkidle | commit
  --network-idle          等网络空闲
  --timeout <ms>          超时，默认 45000
  --header "K: V"         自定义请求头（可多次）
  --ua <字符串>           自定义 User-Agent
  --block-images          屏蔽图片加速抓取
  --storage <json>        复用登录态
  --save-storage <json>   保存登录态
  --max <字数>            截断输出长度
  --headed                显示浏览器窗口（调试用）
  --ignore-cert           忽略 HTTPS 证书错误

\x1b[1m示例\x1b[0m
  web-render shot https://example.com --full --out out/page.png
  web-render md https://example.com/article --out out/a.md
  web-render text https://example.com --block-images --max 4000
  web-render pdf https://example.com --format A4 --landscape
  web-render eval https://example.com --script "document.title"
`;
  console.log(h);
}

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return;
  }
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    console.log(pkgVersion());
    return;
  }

  const fn = commands[cmd];
  if (!fn) fail(`未知命令：${cmd}（可用：${Object.keys(commands).join(', ')}）`);

  const { pos, flags } = parseArgs(argv.slice(1));
  if (pos[0]) flags.url = pos[0];
  if (!flags.url) fail('缺少 URL。用法：web-render ' + cmd + ' <url> [选项]');

  try {
    await fn(flags);
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }
})();
