# 内容审核工作流说明

## 概览

本 skill 在创建微信草稿**之后**、Convex 同步**之前**插入了审核步骤，确保内容质量。

## 两种审核模式

### 1️⃣ 本地 CLI 模式（推荐用于快速调试）

**流程**：
```bash
# 发起发布
$ node scripts/publish.mjs --title "标题" --content "内容" --author "作者"

# 脚本会：
# 1. 生成标题候选（如需要）
# 2. 生成文章内容（如需要）
# 3. 生成封面图（1-3 分钟）
# 4. 上传到微信 CDN 和公开图床
# 5. 创建微信草稿
# 6. 写入 /tmp/wechat-draft-{timestamp}.md
# 7. 显示完整 Markdown
# 8. 等待用户确认

# 输出示例：
# ✅ 文章已同步到微信公众号草稿箱！
# 📱 Media ID: 1234567890
# 📝 内容已准备好审核
#    📄 Markdown 文件: /tmp/wechat-draft-2026-03-25-1711270000000.md
# ═══════════════════════════════════════════════
# 📋 【内容审核】请查看下面的 Markdown，确认无误后再发布
# ═══════════════════════════════════════════════
# [完整 Markdown 内容，含 frontmatter 和所有 URL]
# ═══════════════════════════════════════════════
#
# 👉 确认发布到网站数据库？(y/n): _
```

**用户操作**：
- 在终端查看 Markdown 内容
- 如果需要修改，可以直接编辑 `/tmp/wechat-draft-{timestamp}.md` 文件
- 输入 `y` 继续发布到 Convex，或 `n` 中止

**输入 y 后**：
```bash
# ✅ 继续发布流程...
# 🔄 同步到网站数据库...
# ✅ 已同步到网站！
# 📋 已备份到 portfolio-v2: ...
# 🎉 完成！
```

### 2️⃣ OpenClaw 机器人模式（飞书/QQ）

**架构**：
```
用户（飞书） → 「发布微信文章：...」
     ↓
OpenClaw skill → 调用 publish.mjs
     ↓
publish.mjs → 生成并检查环境变量 OPENCLAW_INVOCATION=true
     ↓
publish.mjs → 创建草稿 + 返回 { status: 'reviewing', mdContent, ... }
     ↓
OpenClaw 框架 → 构造审核卡片，显示 Markdown
     ↓
用户（飞书） → 查看内容 + 回复「✅ 确认发布」
     ↓
OpenClaw 框架 → 触发继续发布逻辑
     ↓
publish.mjs → 执行 Convex 同步、本地备份
     ↓
OpenClaw 框架 → 返回完成消息
```

**关键代码片段**：

```javascript
// publish.mjs 中的检测
const isOpenClawBot = process.env.OPENCLAW_INVOCATION === 'true';

if (isOpenClawBot) {
  // 返回审核状态给 OpenClaw 框架
  return {
    status: 'reviewing',
    mediaId: result.mediaId,
    slug,
    draftPath: reviewFilePath,
    mdContent,
    message: `✅ 内容已生成并推送到微信草稿箱\n\n📱 Media ID: ${result.mediaId}\n\n请确认内容质量，确认后将发布到网站数据库`,
  };
}
```

## 核心优势

1. **无需重复生成**
   - 草稿只创建一次（微信 API 成本）
   - 审核通过后直接使用，不重新转换格式
   - 节省时间和 API 调用

2. **适合移动端审核**
   - 在手机上清晰查看 Markdown
   - 用飞书/QQ 查看，不用打开编辑器
   - 完整显示所有图片 URL，方便验证

3. **保证内容一致性**
   - 审核的 Markdown = 网站发布的 Markdown
   - Frontmatter 已包含所有元数据（title, author, coverUrl, mediaId 等）

4. **灵活的修改流程**
   - 本地 CLI：可以编辑 /tmp 文件后重新发布
   - 机器人：如需修改，重新触发 skill 即可

## 技术细节

### 环境变量检测

```javascript
// 检查是否由 OpenClaw 调用
const isOpenClawBot = process.env.OPENCLAW_INVOCATION === 'true';
```

**由谁设置**：
- 本地 CLI：未设置（undefined），脚本使用 readline 交互
- OpenClaw 机器人：OpenClaw 框架在执行 skill 时自动注入

### 返回格式

**CLI 模式**：进程在 readline 处等待，最后调用 `process.exit(0)` 或继续

**机器人模式**：
```javascript
{
  status: 'reviewing',              // 标记审核中
  mediaId: '1234567890',            // 微信草稿 ID
  slug: '2026-03-25-1711270000000', // 文章唯一标识
  draftPath: '/tmp/wechat-draft-...',
  mdContent: '---\ntitle: ...',     // 完整 Markdown
  message: '✅ 内容已生成...',       // 人类可读消息
}
```

### 确认后的流程

```javascript
// 用户点击「✅ 确认发布」后，OpenClaw 框架会：
// 1. 设置 NEXT_STEP=publish_to_convex
// 2. 重新调用 skill，可能附加前一步的返回值
// 3. 脚本检查 NEXT_STEP，继续执行 Convex 同步

// 简化版：
if (process.env.NEXT_STEP === 'publish_to_convex') {
  // 使用前一步的 mdContent 和 mediaId
  // 直接执行 Convex 同步逻辑
}
```

## 使用场景

### 场景 1：本地快速发布

```bash
# 用法：带完整参数
node scripts/publish.mjs \
  --title "如何用 AI 提升工作效率" \
  --content "# 简介\n\n..." \
  --author "龙虾"

# 脚本会显示完整内容，要求用户确认
# 用户确认后自动同步到网站
```

### 场景 2：手机上审核

```
飞书机器人：

我：「发布微信文章：标题='AI 提升工作效率'，内容='# ...'」

OpenClaw：
  ✅ 内容已生成并推送到微信草稿箱
  📱 Media ID: 1234567890

  请确认内容质量，确认后将发布到网站数据库

  [显示完整 Markdown 卡片]

  [✅ 确认发布] [❌ 取消]

我（在手机上）：点击「✅ 确认发布」

OpenClaw：
  🎉 已完成！

  - 微信：内容在草稿箱（Media ID 1234567890）
  - 网站：已同步到数据库
  - 备份：已保存本地
```

### 场景 3：需要修改

**本地 CLI**：
```bash
# 第一次发布
$ node scripts/publish.mjs --title "..." --content "..."
# [显示内容]
# 👉 确认发布到网站数据库？(y/n): n
# ❌ 已取消发布。草稿仍在微信公众号。
# 📄 Markdown 已保存: /tmp/wechat-draft-2026-03-25-1711270000000.md

# 编辑 Markdown 文件
$ vim /tmp/wechat-draft-2026-03-25-1711270000000.md
# [修改完后保存]

# 重新发布（此时需要手动执行 Convex 同步逻辑，或用新参数重新调用）
# 简单方案：直接在脚本中修改 mdContent 变量或重新发布
```

**机器人模式**：
```
我：「发布微信文章：...」
OpenClaw：[显示内容]
我：「❌ 取消」
OpenClaw：已取消，草稿保存在微信公众号

我（手动编辑草稿）：在微信后台编辑草稿 Media ID 1234567890

我：「确认发布之前的文章 1234567890」
OpenClaw：[直接执行 Convex 同步，无需重新生成]
```

## Convex 同步配置

### 需要实现的 API

在你的 Convex 项目中需要实现一个 mutation 接收本 skill 的调用：

```typescript
// convex/articles.ts
import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const upsertBySlug = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    excerpt: v.string(),
    tags: v.array(v.string()),
    published: v.boolean(),
    visible: v.boolean(),
    source: v.string(),
    coverImage: v.optional(v.string()),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 查找是否存在相同 slug
    const existing = await ctx.db
      .query('articles')
      .filter(q => q.eq(q.field('slug'), args.slug))
      .first();

    if (existing) {
      // 更新已有记录
      return await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: new Date(),
      });
    } else {
      // 创建新记录
      return await ctx.db.insert('articles', {
        ...args,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  },
});
```

然后在 HTTP 路由中注册：

```typescript
// convex/http.ts
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';

const http = httpRouter();

http.route({
  path: '/api/mutation',
  method: 'POST',
  handler: async (request) => {
    const body = await request.json();

    if (body.path === 'posts:upsertBySlug') {
      // 调用 mutation
      // 需要用你的 Convex 方式实现
      return { action: 'upserted' };
    }

    return { error: 'unknown action' };
  },
});

export default http;
```

### 在 .env 中配置

```env
CONVEX_URL=https://your-deployment.convex.cloud
```

## 故障排查

### 问题 1：本地 CLI 卡在 readline

**现象**：
```bash
$ node scripts/publish.mjs ...
# [显示内容后]
# 👉 确认发布到网站数据库？(y/n):
# [等待，无响应]
```

**原因**：stdin 未正确连接（例如在某些 CI 环境）

**解决**：
```bash
# 手动提供输入
echo "y" | node scripts/publish.mjs --title "..." --content "..."

# 或使用 --no-confirm 标志（如果已实现）
node scripts/publish.mjs --title "..." --content "..." --no-confirm
```

### 问题 2：OpenClaw 机器人没有触发审核

**检查清单**：
1. 环境变量 `OPENCLAW_INVOCATION=true` 是否设置？
2. OpenClaw 框架是否正确调用 skill？
3. 脚本是否返回了 `status: 'reviewing'` 的对象？

**调试**：
```bash
# 模拟 OpenClaw 调用
OPENCLAW_INVOCATION=true node scripts/publish.mjs \
  --title "Test" \
  --content "# Test"
```

### 问题 3：Convex 同步失败

**错误日志**：
```
⚠️  Convex 同步失败: fetch failed
```

**检查**：
1. `CONVEX_URL` 是否配置正确？
2. Convex 部署是否在线？
3. `/api/mutation` 路由是否实现？
4. 请求格式是否匹配？

**临时解决**：不配置 `CONVEX_URL`，skil 会自动跳过同步

## 后续优化建议

1. **支持草稿编辑** — OpenClaw 机器人是否可以让用户在消息中直接编辑 Markdown？
2. **支持 --no-confirm 标志** — 用于完全自动化发布
3. **支持草稿恢复** — 如果用户取消，后续是否可以"继续之前的草稿"而不重新生成？
4. **图片预览** — 在审核卡片中内联显示封面图片（如果 OpenClaw 支持）

