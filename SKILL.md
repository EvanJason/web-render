---
name: web-render
description: 用真实 Chromium 渲染网页，然后截图、导出 PDF、抓正文转 Markdown、提取链接、在页面内执行 JS。当用户要求"截个图/截图看看这个网页"、"把这个页面保存成长图/PDF"、"抓一下这个链接的正文"、"网页转 markdown"、"爬这个页面"、"打开网页看看内容"、"渲染一下这个 SPA 页面"、"提取页面所有链接"、"在页面上执行 JS 拿数据"、"模拟手机看这个页面"、"网页快照"时使用。凡是需要真实浏览器环境（JS 渲染、登录态、懒加载）才能拿到内容的抓取任务都适用。命令为 `web-render`。
---

# web-render — 无头浏览器工具

用真实 Chromium 渲染页面，再截图 / 导出 PDF / 抓正文。适合 JS 渲染的 SPA、需要登录态的页面、要像素级还原的截图场景。

命令：`web-render <命令> <url> [选项]`

## 前置检查

首次使用先确认可用：

```bash
web-render --version
```

若报「未找到 playwright」或「Executable doesn't exist」：

```bash
npm i -g web-render
npx playwright install chromium
```

国内网络慢时先设镜像：`export PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`

## 命令选择

拿不准用哪个时按这个顺序判断：

| 目标 | 用 | 理由 |
|---|---|---|
| 给用户看页面长什么样 | `shot` | 视觉留证 |
| 读文章 / 收集资料 | `md` | 保留标题/列表/代码块，已剔导航噪音 |
| 要具体字段、列表、统计 | `eval` | 直接返回 JSON，最省 token |
| 归档打印 | `pdf` | 分页排版 |
| 分析 DOM 结构 | `html` | 完整渲染后 HTML |
| 找站内入口 | `links` | 去重后的链接清单 |
| 只要文字、要快 | `text` | 跳过转换，最快 |

## 常用调用

**截图**

```bash
web-render shot https://example.com --out shot.png
web-render shot https://example.com --full --out full.png           # 整页长图
web-render shot https://example.com --mobile --out m.png            # 模拟 iPhone 13
web-render shot https://example.com --scale 2 --out hd.png          # 2x 高清
web-render shot https://example.com --selector "#app" --out el.png  # 只截某元素
```

**抓正文**

```bash
web-render md https://example.com/post --out post.md
web-render md https://example.com/post --keep-images --keep-links
web-render text https://example.com --block-images --max 5000
```

**导 PDF**

```bash
web-render pdf https://example.com/doc --out doc.pdf --format A4
web-render pdf https://example.com/doc --landscape
```

**SPA / 懒加载**（关键：等渲染完再抓）

```bash
web-render md https://app.example.com --wait "#content" --scroll --network-idle
web-render shot https://app.example.com --wait ".chart-loaded" --delay 2000 --full
```

**结构化数据**

```bash
web-render eval https://example.com/list --script "Array.from(document.querySelectorAll('.item')).map(e=>e.innerText)"
web-render eval https://example.com --script "({title:document.title, h1:document.querySelector('h1')?.innerText})"
```

**登录态页面**

```bash
# 1. 有头模式手动登录并保存 cookie
web-render shot https://site.com/login --headed --save-storage auth.json
# 2. 之后带 --storage 复用
web-render md https://site.com/private --storage auth.json
```

**自定义请求头 / UA**

```bash
web-render text https://api.example.com --header "Referer: https://example.com" --header "X-Token: abc"
web-render shot https://site.com --ua "Mozilla/5.0 ..." --ignore-cert
```

## 选项全表

| 选项 | 说明 |
|---|---|
| `--out <路径>` | 输出文件，默认当前目录 `shot-时间戳.png` 等 |
| `--width` / `--height` | 视口尺寸，默认 1440×900 |
| `--scale <n>` | 设备像素比，2 = 高清 |
| `--mobile` | 模拟 iPhone 13（含触摸、移动 UA） |
| `--dark` / `--light` | 配色方案（默认 light） |
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
| `--keep-images` / `--keep-links` | `md` 保留图片 / 链接 |
| `--keep-boilerplate` | `md` 保留 nav/footer/aside |
| `--quality <n>` | JPG 质量（`--out` 用 `.jpg` 时生效） |
| `--lang <locale>` | 页面语言，默认 `zh-CN` |
| `--timezone <tz>` | 时区，默认 `Asia/Shanghai` |

## 使用原则

1. **抓内容优先 `md`，拿数据优先 `eval`**。`md` 已自动剔除 script/style/nav/footer，比 `html` 更适合喂模型；`eval` 直接返回 JSON，最省 token。
2. **SPA 必加等待**。默认只等 `domcontentloaded`，React/Vue 页面此时可能还是空的。用 `--wait` + `--network-idle`，懒加载再加 `--scroll --delay 1500`。
3. **大输出一定加 `--max`**，否则几十万字符会冲爆上下文。
4. **截图默认不整页**。要看完整页面必须显式 `--full`；元素级截图用 `--selector` 更精准。
5. **输出路径用绝对路径**，避免搞不清文件落在哪。
6. **连续抓同一站点注意限流**。每次调用都新开浏览器进程，短时间高频访问会触发 CDN 超时（`ERR_TIMED_OUT`），隔几秒重试。
7. **`--headed` 只用于调试和首次登录**。正常任务保持默认无头，更快更省内存。
8. **`md` 会自动剔除表单控件和隐藏元素**（`textarea`/`input`/`select`/`button`/`[hidden]`/`[aria-hidden]`）。有些站点（如百度）把整段 CSS 转义后塞进 `textarea`，不清会混进几万字样式噪音；若目标正文本身由 `textarea` 承载（代码分享站），改用 `html` 或 `eval` 单独取。

## 故障排查

| 现象 | 处理 |
|---|---|
| `未找到 playwright` | `npm i -g playwright`；装在非标准位置时设 `PLAYWRIGHT_NODE_MODULES` 指向 node_modules |
| `Executable doesn't exist` | `npx playwright install chromium` |
| `net::ERR_TIMED_OUT` | 站点限流或网络抖动，稍后重试；或加 `--timeout 90000` |
| 抓到的正文是空的 | 页面没渲染完，加 `--wait` / `--network-idle` / `--delay 2000` |
| 截图是白屏 | 同上；也可 `--wait-until load` |
| 中文变方块 | 检查是否误用 `--block-images` 连字体资源一起屏蔽了 |
| 内存不足崩溃 | 单实例峰值 300–500MB，避免并发调用，串行执行 |

## 直接写脚本时

如需自定义逻辑（批量抓取、特殊等待策略），可以 `require('playwright')` 自己写，参考本工具的 `bin/web-render.js` —— 其中 `loadPlaywright()` 演示了如何跨平台定位全局安装的 playwright（含 `PLAYWRIGHT_NODE_MODULES` 环境变量兜底）。
