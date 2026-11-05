# web-render

用真实 Chromium 渲染页面，然后截图、导 PDF、抓正文。一条命令，零配置。

面向需要「JS 渲染后的真实页面」的场景：SPA、懒加载、登录态页面、要像素级还原的截图。

```bash
web-render md https://example.com/post --out post.md
```

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/playwright-1.x-orange" alt="playwright">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
</p>

## 为什么不是 curl / axios

| 方式 | 拿到什么 | 问题 |
|---|---|---|
| `curl` / `axios` | 原始 HTML | SPA 只有一个空 `<div id="app">` |
| Puppeteer 脚本 | 渲染后内容 | 每个需求都要重写一遍脚本 |
| **web-render** | 渲染后内容 | 一行命令，7 种输出格式 |

## 安装

```bash
npm i -g web-render
npx playwright install chromium
```

> 第二条必做。Chromium 内核约 700MB，安装包里不带，避免每次装工具都重下一次。
> 国内慢的话先设镜像：`export PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`

不想全局装也能用：`npx web-render md https://example.com`

## 命令

| 命令 | 作用 | 典型用途 |
|---|---|---|
| `shot` | 截图，支持整页 / 局部 | 页面留证、设计稿比对 |
| `pdf` | 导出 PDF | 长文归档、打印排版 |
| `text` | 提取纯文本 | 快速读内容、喂给模型 |
| `md` | 正文转 Markdown | **资料收集首选**，保留标题/列表/代码块 |
| `html` | 导出渲染后 HTML | 分析 DOM、二次解析 |
| `links` | 提取全部链接 | 站内爬取、找入口 |
| `eval` | 在页面里执行 JS | 拿结构化字段、统计 |

## 常用场景

**截图**

```bash
web-render shot https://example.com --out shot.png
web-render shot https://example.com --full --out full.png            # 整页长图
web-render shot https://example.com --mobile --out m.png             # 模拟 iPhone 13
web-render shot https://example.com --scale 2 --out hd.png           # 2x 高清
web-render shot https://example.com --selector "#app" --out el.png   # 只截某个元素
```

**抓正文**

```bash
web-render md https://example.com/post --out post.md
web-render md https://example.com/post --keep-images --keep-links    # 保留图片和链接
web-render text https://example.com --block-images --max 5000        # 只要文字、更快
```

**导 PDF**

```bash
web-render pdf https://example.com/doc --out doc.pdf --format A4
web-render pdf https://example.com/doc --landscape                   # 横向
```

**处理 SPA / 懒加载**（关键：等渲染完再抓）

```bash
web-render md https://app.example.com --wait "#content" --scroll --network-idle
web-render shot https://app.example.com --wait ".chart-loaded" --delay 2000 --full
```

**提取结构化数据**

```bash
web-render eval https://example.com/list --script "Array.from(document.querySelectorAll('.item')).map(e=>e.innerText)"
web-render eval https://example.com --script "({title:document.title, h1:document.querySelector('h1')?.innerText})"
```

**需要登录的页面**（存一次，后续复用）

```bash
# 1. 有头模式手动登录，把 cookie 存下来
web-render shot https://site.com/login --headed --save-storage auth.json

# 2. 之后所有命令带 --storage 复用登录态
web-render md https://site.com/private --storage auth.json
```

**自定义请求头 / 绕过 UA 检测**

```bash
web-render text https://api.example.com --header "Referer: https://example.com" --header "X-Token: abc"
web-render shot https://site.com --ua "Mozilla/5.0 ..." --ignore-cert
```

## 选项

| 选项 | 说明 |
|---|---|
| `--out <路径>` | 输出文件，默认当前目录 `shot-时间戳.png` 等 |
| `--width` / `--height` | 视口尺寸，默认 1440×900 |
| `--scale <n>` | 设备像素比，2 = 高清 |
| `--mobile` | 模拟 iPhone 13（含触摸、移动 UA） |
| `--dark` / `--light` | 配色方案，默认 light |
| `--full` | 整页截图（含滚动区域） |
| `--selector <css>` | 只截 / 只抓某个元素 |
| `--wait <css>` | 等元素出现再动作 |
| `--delay <ms>` | 额外等待（动画、懒加载） |
| `--scroll` | 先滚到底触发懒加载，再抓 |
| `--wait-until <state>` | `load` / `domcontentloaded` / `networkidle` / `commit` |
| `--network-idle` | 等网络空闲（SPA 推荐） |
| `--timeout <ms>` | 超时，默认 45000 |
| `--header "K: V"` | 自定义请求头，可多次 |
| `--ua <字符串>` | 自定义 User-Agent |
| `--ignore-cert` | 忽略 HTTPS 证书错误 |
| `--block-images` | 屏蔽图片/字体/媒体，抓文本更快 |
| `--storage <json>` | 复用登录态 |
| `--save-storage <json>` | 保存登录态 |
| `--max <字数>` | 截断输出（防止刷屏） |
| `--headed` | 显示浏览器窗口，调试 / 手动登录用 |
| `--keep-images` / `--keep-links` | `md` 命令保留图片 / 链接 |
| `--keep-boilerplate` | `md` 命令保留 nav/footer/aside |
| `--quality <n>` | JPG 质量（`--out` 用 `.jpg` 时生效） |
| `--lang <locale>` | 页面语言，默认 `zh-CN` |
| `--timezone <tz>` | 时区，默认 `Asia/Shanghai` |

## 作为 Agent Skill 使用

仓库根目录的 `SKILL.md` 是给 AI Agent 读的技能说明书（Claude Code / WorkBuddy / 兼容 Agent Skills 规范的工具）。

装法：把整个仓库放进 skills 目录即可。

```bash
git clone https://github.com/EvanJason/web-render.git ~/.workbuddy/skills/web-render
# 或 ~/.claude/skills/web-render
```

Agent 读到 `SKILL.md` 后，会在你要求「截个图看看这个页面」「把这个链接转成 markdown」时自动调用 `web-render`。

## 几个坑

- **SPA 抓到空白**：默认只等 `domcontentloaded`，React/Vue 这时可能还没渲染。加 `--wait` + `--network-idle`，懒加载再加 `--scroll --delay 1500`。
- **输出冲爆上下文**：抓大页面必加 `--max 5000`。
- **高频请求被拦**：每次调用都新开浏览器进程，短时间连打同一站点会触发 CDN 超时（`ERR_TIMED_OUT`），隔几秒重试。
- **`md` 抓到一堆 CSS**：有些站点（如百度）把样式转义塞进 `textarea`，工具已默认剔除表单控件；若正文本身在 `textarea` 里，改用 `html` 或 `eval` 单独取。
- **内存**：单实例峰值约 300–500MB。内存紧张的机器上串行跑，别并发。

## 环境变量

| 变量 | 用途 |
|---|---|
| `PLAYWRIGHT_NODE_MODULES` | 指定全局 node_modules 路径（playwright 装在非标准位置时用） |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Chromium 下载镜像 |

## License

MIT
