<p align="center">
  <h1 align="center">WeChat Publisher</h1>
  <p align="center">
    Markdown 一键转微信公众号文章，直达草稿箱。
  </p>
  <p align="center">
    <a href="./README.md">English</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-Skills-blue?style=flat-square" alt="OpenClaw Skills" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=flat-square" alt="License MIT" />
  <img src="https://img.shields.io/badge/Platform-WeChat%20MP-orange?style=flat-square" alt="WeChat MP" />
</p>

---

## 简介

**WeChat Publisher** 将 Markdown 转换为微信公众号兼容的 HTML（纯内联样式），并通过微信官方 API 直接推送到草稿箱。支持魔搭 Qwen-Image-2512（国内免费直连）和 Gemini Pro 双通道生图，无需依赖外部工具。

```
Markdown ──▶ Sections ──▶ 微信 HTML ──▶ 公众号草稿箱
                                 ▲
                         Gemini Pro 封面
```

## 特性

- ✅ **直接发布** — 无需预览，直接同步到微信公众号草稿箱
- ✅ **内置生图** — 集成魔搭 Qwen-Image-2512 生图模块，不依赖外部 skill
- ✅ **自动排版** — 转换为微信兼容的 HTML 格式（纯内联样式）
- ✅ **图片/视频上传** — 自动上传内联图片和视频到微信 CDN
- ✅ **双图床策略**（核心创新）：
  - 封面图同时上传到 **公开图床**（Catbox 优先，SM.MS 备选）供网站前端使用，无防盗链
  - 封面图同时上传到 **微信 CDN** 供公众号内容使用，保证内容一致性
  - 分别维护 **图床 URL**（网站用）和 **微信 CDN URL**（内容用）
- ✅ **云端同步** — 发布后自动同步到 Convex 数据库，网站实时生效
- ✅ **本地备份** — 自动生成 Markdown 存档，支持备份到 portfolio-v2
- ✅ **macOS 风格代码块** — 红黄绿三圆点 + 横向滚动
- ✅ **杂志风主题** — 可选杂志风排版，编号章节、渐变装饰、大留白，一键切换
- ✅ **独立运行** — 完全独立，可直接分享

## 快速开始

### 环境要求

- Node.js 18+
- 微信公众号 AppID 和 AppSecret（[申请地址](https://mp.weixin.qq.com/)）
- 魔搭 ModelScope API Token 或 Gemini API Key（可选，用于生成封面图）

### 安装

```bash
git clone https://github.com/xiaonan0527/wechat-publisher.git
cd wechat-publisher
```

### 配置

```bash
cp .env.example .env
```

#### 获取微信公众号 AppID 和 AppSecret

1. 登录 [微信开发者平台](https://developers.weixin.qq.com/)
2. 进入你的公众号 → **开发** → **基本配置**
3. 找到 **AppID**（应用ID），这就是你的 `WECHAT_APPID`
4. 点击 **AppSecret**（应用密钥）旁边的 **生成** 按钮，创建新的密钥
5. 立即复制 AppSecret（仅显示一次），这就是你的 `WECHAT_APPSECRET`

<img width="3788" height="1372" alt="Image" src="https://github.com/user-attachments/assets/271d7449-2e75-4294-b2a4-912979f7ce2d" />

> **重要提示**：如果你在云服务器上运行此工具，必须在同一基本配置页面中将服务器的公网 IP 地址添加到 **IP 白名单**（IP白名单）中。否则，微信 API 调用将被拒绝。

#### 设置环境变量

编辑 `.env`，填入你的凭证：

```env
WECHAT_APPID=your_appid
WECHAT_APPSECRET=your_appsecret

# 封面图生成（二选一或同时配置）
MODELSCOPE_API_KEY=your_token             # 推荐，国内直连，免费
# GEMINI_API_KEY=your_gemini_key          # 备选，需要代理
# GEMINI_PRO_PROXY=http://127.0.0.1:7890  # 可选，Gemini 代理

# WECHAT_DEFAULT_AUTHOR=你的名字          # 可选，默认"龙虾"
```

> **获取魔搭 Token**：注册 [modelscope.cn](https://modelscope.cn)，然后在 [我的令牌](https://modelscope.cn/my/myaccesstoken) 页面获取。完全免费。

### 发布文章

```bash
node scripts/publish.mjs \
  --title "文章标题" \
  --content "$(cat article.md)" \
  --author "龙虾"
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--title` | 是 | 文章标题 |
| `--content` | 是 | 文章内容（Markdown 格式） |
| `--author` | 否 | 作者名（默认：`龙虾`） |
| `--no-cover` | 否 | 跳过封面图生成 |
| `--image-provider` | 否 | `modelscope`（魔搭）或 `gemini`（默认自动选择） |
| `--theme` | 否 | `default`（经典）或 `magazine`（杂志风，默认 default） |

## 完整工作流程

### 发布 12 步流程

```
1. 生成标题候选（AI）
   ↓
2. 用户选择标题
   ↓
3. 生成文章内容（AI）
   ↓
4. 用户审阅（本地写入 /tmp/wechat-draft.md，远端展示摘要）
   ↓
5. 用户确认或修改后确认
   ↓
6. 生成封面图（ModelScope Qwen-Image-2512，后台 1-3 分钟）
   ↓
7. 【双图床策略】
   ├─ 并行上传到公开图床（Catbox / SM.MS）→ 图床 URL
   └─ 并行上传到微信 CDN → 微信 CDN URL
   ↓
8. 转换为微信 HTML（纯内联样式，使用微信 CDN URL）
   ↓
9. 上传文章内联图片/视频到微信 CDN
   ↓
10. 创建微信草稿
   ↓
11. 【同步与备份】
    ├─ 生成 Markdown 存档（含图床 URL）→ articles/
    ├─ 同步到 Convex 数据库（网站用图床 URL，无防盗链）
    └─ 本地备份到 content/publisher/（如有 portfolio-v2）
   ↓
12. 完成！返回完整回执
    ├─ Media ID（微信草稿 ID）
    ├─ 图床 URL（网站前端使用）
    └─ 微信 CDN URL（微信公众号使用）
```

## 项目结构

```
wechat-publisher/
├── scripts/
│   ├── publish.mjs              # 主入口 — 编排完整发布流程
│   ├── markdown-to-sections.mjs # Markdown 解析器 → Section 数据结构
│   ├── wechat-renderer.mjs      # Section 数据 → 微信兼容内联 HTML
│   ├── modelscope-imagegen.mjs  # 魔搭 Qwen-Image-2512 生图（国内免费）
│   └── gemini-imagegen.mjs      # Gemini Pro 生图（海外）
├── .env.example                 # 环境变量模板
├── SKILL.md                     # OpenClaw skill 定义
└── README.md
```

## 工作原理

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Markdown   │────▶│ markdown-to-sections │────▶│   Section 数组   │
└─────────────┘     └──────────────────────┘     └────────┬────────┘
                                                          │
                    ┌──────────────────────┐              ▼
                    │  wechat-renderer     │◀─────────────┘
                    │  (内联样式,           │
                    │   macOS 代码块)       │
                    └──────────┬───────────┘
                               │
┌─────────────────────────────────────────────────┐
│         【双图床策略】                              │
├─────────────────────────────────────────────────┤
│ ① 封面上传到公开图床                              │
│    (Catbox 优先 / SM.MS 备选)                    │
│    用途：网站前端展示，无防盗链 ─┐                │
│                                   │              │
│ ② 同时封面上传到微信 CDN         │ 并行上传      │
│    用途：微信内容展示              │              │
└─────────────────────────────────────────────────┘
            ↓              ↓
    ┌─────────────┐ ┌──────────────┐
    │  图床 URL   │ │ 微信 CDN URL │
    │ (网站用)    │ │ (内容用)     │
    └─────────────┘ └──────────────┘
            ↓              ↓
        ┌────────────────────────┐
        │  创建微信草稿           │
        │  生成 Markdown 存档     │
        │  同步到 Convex 数据库   │
        │  本地备份到 portfolio-v2│
        └────────────────────────┘
                    ↓
        ┌───────────────────────────────┐
        │ 完成！返回完整回执：            │
        │ - Media ID（微信草稿 ID）      │
        │ - 图床 URL（网站前端用）       │
        │ - 微信 CDN URL（内容用）       │
        └───────────────────────────────┘
```

### 流水线详解

1. **解析** — `markdown-to-sections.mjs` 将 Markdown 转为类型化的 Section 数组（标题、段落、代码块、列表等）
2. **渲染** — `wechat-renderer.mjs` 将每个 Section 转为微信兼容的纯内联样式 HTML
3. **生成封面** — `modelscope-imagegen.mjs`（Qwen-Image-2512，推荐，国内免费）或 `gemini-imagegen.mjs`（Gemini Pro 备选）生成 16:9 封面图，1-3 分钟耗时，支持自动回退
4. **双图床上传**（核心创新）：
   - 并行上传封面到公开图床（Catbox 优先，失败时用 SM.MS）→ 获得图床 URL
   - 并行上传封面到微信 CDN → 获得微信 CDN URL
   - 分别维护两套 URL，网站用图床 URL（无防盗链），微信内容用 CDN URL（保证一致）
5. **HTML 转换** — 使用微信 CDN URL 转换为微信兼容 HTML
6. **上传内联素材** — 文章中的图片和视频自动上传到微信 CDN
7. **创建草稿** — 通过微信公众号 API 创建草稿
8. **同步和备份**：
   - 生成 Markdown 存档（含图床 URL）到 `articles/` 目录
   - 同步到 Convex 数据库（网站前端使用图床 URL，实时生效）
   - 本地备份到 `content/publisher/`（如有 portfolio-v2）

### 代码块渲染

代码块使用 macOS 风格标题栏（三色圆点）+ 横向滚动：

- header 使用 `line-height:0; font-size:0` 消除 inline-block 间距（微信不可靠支持 `display:flex`）
- 每行用 `<p style="white-space:nowrap">` 包裹，禁止折行
- 空格转换为 `&nbsp;` 兼容微信
- `font-family` 中带空格的字体名使用**单引号**，避免截断 `style="..."` 属性

## 双图床策略详解

### 为什么需要双图床？

| 场景 | 需求 | 解决方案 |
|------|------|--------|
| **微信公众号内容** | 使用微信官方 CDN，保证在微信内显示一致 | 上传到微信 CDN，使用微信 CDN URL |
| **个人网站前端** | 独立图床，无防盗链，持久化存储 | 上传到公开图床（Catbox），保存图床 URL |
| **数据持久化** | 记录所有 URL，便于回溯和迁移 | Markdown 存档同时记录两个 URL |

### 工作流程示意

```javascript
// 单一封面图
const coverPath = './cover.png'

// 双图床同时上传（并行）
const publicUrl = await uploadToCatbox(coverPath)      // Catbox / SM.MS
const wxUrl = await uploadToWeChat(coverPath)           // 微信 CDN

// 微信内容使用微信 CDN URL
const wxHtml = html.replace(/cover/, wxUrl)

// Markdown 存档同时保存两个 URL
const archive = `
---
title: 文章标题
coverUrl: ${publicUrl}      // 网站前端使用
wxMediaId: ${wxMediaId}     // 微信使用
---
...
`

// Convex 数据库使用图床 URL（网站前端无防盗链）
await syncToConvex({
  title, content, coverUrl: publicUrl, mediaId
})
```

### 好处

✅ **微信内容一致** — 微信公众号总是用微信 CDN URL，保证显示一致性
✅ **网站独立** — 网站前端用公开图床 URL，不受微信防盗链限制
✅ **数据安全** — 同时保存两个 URL，任何一个服务故障都有备份
✅ **迁移灵活** — 可以随时切换图床，因为有完整的 URL 记录

## Convex 数据库同步

### 配置 Convex（可选）

如果配置了 `CONVEX_URL`，发布后会自动同步到你的 Convex 数据库：

```env
CONVEX_URL=https://your-deployment.convex.cloud
```

**Convex 端需要实现的 API：**

```typescript
// convex/articles.ts
import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const createOrUpdate = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    coverUrl: v.string(),      // 使用图床 URL
    wxMediaId: v.string(),     // 微信草稿 ID
    mediaId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('articles', {
      ...args,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },
});
```

然后在 HTTP 路由中注册：

```typescript
// convex/http.ts
app.route({
  path: '/api/mutation',
  method: 'POST',
  handler: async (request) => {
    const body = await request.json();
    if (body.action === 'articles:createOrUpdate') {
      // 调用 mutation 并返回结果
      return { ok: true };
    }
  },
});
```

**同步失败时：** 脚本会捕获异常并打印警告，但不会中断发布流程。微信草稿仍会成功创建。

## 编程接口

```javascript
import { markdownToSections } from './scripts/markdown-to-sections.mjs';
import { wxRenderSections } from './scripts/wechat-renderer.mjs';

// 默认主题
const sections = markdownToSections(markdownString);
const html = wxRenderSections(sections);

// 杂志风主题 — 编号章节、渐变装饰、大留白排版
const magSections = markdownToSections(markdownString, { theme: 'magazine' });
const magHtml = wxRenderSections(magSections, { theme: 'magazine' });
```

## 安全性

- 所有密钥从环境变量读取
- `.env` 已加入 `.gitignore`
- 提供 `.env.example` 安全模板
- 代码中无任何硬编码密钥

## 参与贡献

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/amazing-feature`）
3. 提交更改（`git commit -m 'feat: add amazing feature'`）
4. 推送分支（`git push origin feat/amazing-feature`）
5. 创建 Pull Request

## 许可证

[MIT](./LICENSE)

## 请我喝咖啡

如果这个项目对你有帮助，欢迎支持我：

[![Buy Me A Coffee](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/xiaonan0527)

## 作者

**楠哥** ([@xiaonan0527](https://github.com/xiaonan0527))

![Image](https://github.com/user-attachments/assets/2c8a4893-3e11-478c-a063-a9de03e596dc)