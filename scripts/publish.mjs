#!/usr/bin/env node

/**
 * 微信公众号发布脚本
 * 
 * 用法：
 * node publish.mjs --title "标题" --content "内容" --author "作者"
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { markdownToSections } from './markdown-to-sections.mjs';
import { wxRenderSections } from './wechat-renderer.mjs';
import { generateImage as geminiGenerateImage } from './gemini-imagegen.mjs';
import { generateImage as modelscopeGenerateImage } from './modelscope-imagegen.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ 配置（从环境变量读取）============
const APPID = process.env.WECHAT_APPID || '';
const APPSECRET = process.env.WECHAT_APPSECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODELSCOPE_API_KEY = process.env.MODELSCOPE_API_KEY || '';
const CONVEX_URL = process.env.CONVEX_URL || '';

if (!APPID || !APPSECRET) {
  console.error('❌ 错误：未配置微信公众号 AppID 和 AppSecret');
  console.error('请在 ~/.openclaw/workspace/.env 中配置：');
  console.error('  WECHAT_APPID=your_appid');
  console.error('  WECHAT_APPSECRET=your_appsecret');
  process.exit(1);
}

// ============ Token 缓存 ============
let tokenCache = { token: '', expiresAt: 0 };

// ============ HTTP 请求工具 ============
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = options.body ? (typeof options.body === 'string' ? Buffer.from(options.body) : options.body) : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length.toString() } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function httpsPostMultipart(url, fieldName, filePath, mimeType = 'image/png', extraFields = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);
    const CRLF = '\r\n';
    const parts = [];
    // 文件字段
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"${CRLF}` +
      `Content-Type: ${mimeType}${CRLF}${CRLF}`
    ));
    parts.push(fileData);
    parts.push(Buffer.from(CRLF));
    // 附加表单字段（如视频的 description）
    for (const [key, value] of Object.entries(extraFields)) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      ));
    }
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    const bodyBuffer = Buffer.concat(parts);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length.toString(),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

const MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv',
};

function guessMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ============ 图床上传 ============
async function uploadToCatbox(filePath) {
  // Catbox 要求 reqtype 在文件字段之前，用专用实现确保字段顺序
  return new Promise((resolve, reject) => {
    const u = new URL('https://catbox.moe/user/api.php');
    const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);
    const CRLF = '\r\n';
    const parts = [];
    // reqtype 字段必须在文件前面
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="reqtype"${CRLF}${CRLF}` +
      `fileupload${CRLF}`
    ));
    // 文件字段
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"${CRLF}` +
      `Content-Type: ${guessMimeType(filePath)}${CRLF}${CRLF}`
    ));
    parts.push(fileData);
    parts.push(Buffer.from(CRLF));
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    const bodyBuffer = Buffer.concat(parts);

    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length.toString(),
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (typeof data === 'string' && data.startsWith('https://')) {
          resolve(data.trim());
        } else {
          reject(new Error(`Catbox 返回异常: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Catbox 上传超时(30s)')); });
    req.write(bodyBuffer);
    req.end();
  });
}

async function uploadToSmms(filePath) {
  const SMMS_TOKEN = process.env.SMMS_TOKEN || '';
  const result = await httpsPostMultipart(
    'https://sm.ms/api/v2/upload',
    'smfile',
    filePath,
    guessMimeType(filePath)
  );
  if (result.success && result.data?.url) return result.data.url;
  throw new Error(`SM.MS 上传失败: ${JSON.stringify(result)}`);
}

// ============ 微信 API ============
async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const data = await httpsRequest(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (data.access_token) {
    tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }
  throw new Error(`获取 token 失败: ${JSON.stringify(data)}`);
}

async function uploadImage(imagePath) {
  const token = await getAccessToken();
  const result = await httpsPostMultipart(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`,
    'media',
    imagePath
  );
  if (result.media_id) {
    return result.media_id;
  }
  throw new Error(`上传图片失败: ${JSON.stringify(result)}`);
}

async function uploadVideo(videoPath, title, introduction = '') {
  const token = await getAccessToken();
  const mimeType = guessMimeType(videoPath);
  const description = JSON.stringify({ title, introduction });
  const result = await httpsPostMultipart(
    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=video`,
    'media',
    videoPath,
    mimeType,
    { description }
  );
  if (result.media_id) {
    console.log(`   media_id: ${result.media_id}`);
    return result.media_id;
  }
  throw new Error(`上传视频失败: ${JSON.stringify(result)}`);
}

async function createDraft(article) {
  const token = await getAccessToken();
  
  // 打印调试信息
  console.log('📋 创建草稿参数:');
  console.log('  - 标题:', article.title);
  console.log('  - 作者:', article.author);
  console.log('  - 内容长度:', article.content?.length || 0);
  console.log('  - thumb_media_id:', article.thumbMediaId || '(无)');
  console.log('  - 内容前100字符:', article.content?.substring(0, 100) || '(空)');
  
  const result = await httpsRequest(
    `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`,
    {
      method: 'POST',
      body: JSON.stringify({
        articles: [{
          title: article.title,
          author: article.author || '龙虾',
          content: article.content,
          thumb_media_id: article.thumbMediaId,
          digest: article.digest || '',
          need_open_comment: 0,
          only_fans_can_comment: 0,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
  if (result.media_id) {
    return { mediaId: result.media_id };
  }
  throw new Error(`创建草稿失败: ${JSON.stringify(result)}`);
}

// ============ 上传文章中的图片和视频到微信 CDN ============
// 全局记录所有上传的图片 URL（用于最后的回执）
global.uploadedMediaUrls = [];

async function uploadInlineMedia(html) {
  const mediaMap = {};

  // 上传图片
  const imgRegex = /src="([^"]+\.(png|jpg|jpeg|gif|webp))"/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const filePath = match[1];
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || mediaMap[filePath]) continue;
    if (!fs.existsSync(filePath)) { console.log(`⚠️  图片不存在: ${filePath}`); continue; }
    try {
      console.log(`📤 上传图片: ${path.basename(filePath)}`);
      const token = await getAccessToken();
      const result = await httpsPostMultipart(
        `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`,
        'media', filePath
      );
      if (result.url) { 
        mediaMap[filePath] = result.url; 
        // 记录上传成功的图片 URL
        global.uploadedMediaUrls.push({ 
          local: path.basename(filePath), 
          url: result.url 
        });
        console.log('✅ 图片上传成功');
        console.log(`   🔗 CDN URL: ${result.url}`);
      }
    } catch (e) { console.error(`❌ 图片上传失败: ${e.message}`); }
  }

  // 替换图片 URL
  for (const [localPath, cdnUrl] of Object.entries(mediaMap)) {
    html = html.split(`src="${localPath}"`).join(`src="${cdnUrl}"`);
  }

  // 上传视频到素材库并替换为占位卡片
  // 微信草稿箱 API 不支持在 content 中嵌入视频（iframe/video 均无效）
  // 正确做法：上传到素材库，文章中放置提示卡片，用户在后台手动插入视频
  const videoTagRegex = /<video\s[^>]*?src="([^"]+\.(mp4|mov|avi|wmv|webm))"[^>]*?><\/video>(\s*<p[^>]*>[^<]*<\/p>)?/gi;
  const videoReplacements = [];
  while ((match = videoTagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const filePath = match[1];
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) continue;
    if (!fs.existsSync(filePath)) { console.log(`⚠️  视频不存在: ${filePath}`); continue; }
    try {
      console.log(`📤 上传视频到素材库: ${path.basename(filePath)}`);
      const videoTitle = path.basename(filePath, path.extname(filePath));
      const mediaId = await uploadVideo(filePath, videoTitle);
      const placeholder =
        `<section style="margin:20px 0;padding:20px;border-radius:8px;background:#f7f8fa;border:1px dashed #d0d5dd;text-align:center;">` +
        `<p style="margin:0 0 8px;font-size:32px;line-height:1;">🎬</p>` +
        `<p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#1a1a1a;">${videoTitle}</p>` +
        `<p style="margin:0;font-size:13px;color:#8c8c8c;">视频已上传到素材库，请在公众号后台编辑此文章时手动插入</p>` +
        `<p style="margin:6px 0 0;font-size:12px;color:#b2b2b2;font-family:monospace;">media_id: ${mediaId}</p>` +
        `</section>`;
      videoReplacements.push({ from: fullTag, to: placeholder });
      console.log(`✅ 视频上传成功（media_id: ${mediaId}）`);
      console.log(`   ⚠️  微信 API 限制：文章内视频需在公众号后台手动插入`);
    } catch (e) { console.error(`❌ 视频上传失败: ${e.message}`); }
  }
  for (const { from, to } of videoReplacements) {
    html = html.split(from).join(to);
  }

  return html;
}

// ============ Markdown 转 HTML（使用 wechat-renderer）============
function markdownToWechatHTML(markdown, options = {}) {
  const sections = markdownToSections(markdown, options);
  return wxRenderSections(sections, { theme: options.theme });
}

// ============ 生成封面 ============
async function generateCover(title, content, provider) {
  const prompt = `创建一个现代扁平风格的微信公众号封面图。
要求：
- 横版 16:9 比例（1024x576）
- 现代扁平设计风格
- 主题相关的视觉元素和背景
- 封面中央大字显示标题：${title}
- 标题字体大、清晰、易读
- 只显示标题文字，不要添加其他文字
- 色彩鲜明，吸引眼球
- 所有文字必须使用中文`;

  const outputPath = `/tmp/wechat-cover-${Date.now()}.png`;

  // 选择生图提供方：优先使用指定的，否则自动选择
  const useProvider = provider
    || (MODELSCOPE_API_KEY ? 'modelscope' : null)
    || (GEMINI_API_KEY ? 'gemini' : null);

  if (!useProvider) {
    console.log('⚠️  未配置任何生图 API Key（MODELSCOPE_API_KEY 或 GEMINI_API_KEY），跳过封面生成');
    return null;
  }

  console.log(`🎨 生成封面图（${useProvider === 'modelscope' ? '魔搭 Qwen-Image-2512' : 'Gemini Pro'}）...`);

  try {
    if (useProvider === 'modelscope') {
      await modelscopeGenerateImage(prompt, outputPath, MODELSCOPE_API_KEY, {
        model: 'Qwen/Qwen-Image-2512',
        size: '1024x576',
        timeout: 300000,
      });
    } else {
      await geminiGenerateImage(prompt, outputPath, GEMINI_API_KEY, {
        model: 'gemini-3-pro-image-preview',
        timeout: 600000,
      });
    }

    if (!fs.existsSync(outputPath)) {
      console.error('❌ 封面文件不存在:', outputPath);
      return null;
    }

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`✅ 封面生成完成（${sizeMB.toFixed(2)}MB）`);
    return outputPath;
  } catch (error) {
    console.error(`❌ 封面生成失败（${useProvider}）:`, error.message);
    // 如果魔搭失败且 Gemini 可用，自动回退
    if (useProvider === 'modelscope' && GEMINI_API_KEY && !provider) {
      console.log('🔄 回退到 Gemini Pro...');
      return generateCover(title, content, 'gemini');
    }
    return null;
  }
}

// ============ 主函数 ============
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const index = args.indexOf(name);
    return index !== -1 ? args[index + 1] : null;
  };
  
  const title = getArg('--title');
  const content = getArg('--content');
  const author = getArg('--author') || process.env.WECHAT_DEFAULT_AUTHOR || '龙虾';
  const noCover = args.includes('--no-cover');
  const imageProvider = getArg('--image-provider'); // modelscope | gemini
  const theme = getArg('--theme') || 'default'; // default | magazine
  
  if (!title || !content) {
    console.error('用法: node publish.mjs --title "标题" --content "内容" [--author "作者"] [--no-cover] [--image-provider modelscope|gemini] [--theme default|magazine]');
    process.exit(1);
  }
  
  console.log('📝 开始发布微信公众号文章...\n');
  console.log(`标题: ${title}`);
  console.log(`作者: ${author}\n`);
  
  // 1. 生成封面
  let coverPath = null;
  let thumbMediaId = null;
  
  if (!noCover) {
    coverPath = await generateCover(title, content, imageProvider);
  }
  
  // 2. 转换内容
  console.log('📄 转换文章格式...');

  // 先上传封面图到公开图床（供网站前端展示）
  let publicCoverUrl = '';
  if (coverPath && fs.existsSync(coverPath)) {
    try {
      publicCoverUrl = await uploadToCatbox(coverPath);
      console.log(`✅ 封面上传到 Catbox: ${publicCoverUrl}`);
    } catch (err) {
      console.error(`⚠️  Catbox 上传失败: ${err.message}`);
      const SMMS_TOKEN = process.env.SMMS_TOKEN;
      if (SMMS_TOKEN) {
        try {
          publicCoverUrl = await uploadToSmms(coverPath);
          console.log(`✅ 封面上传到 SM.MS: ${publicCoverUrl}`);
        } catch (err2) {
          console.error(`⚠️  SM.MS 上传也失败: ${err2.message}`);
        }
      }
    }
  }

  // 再上传封面图到微信 CDN（用于微信公众号内容）
  let coverImageUrl = null;
  if (coverPath && fs.existsSync(coverPath)) {
    console.log('📤 上传封面图到微信 CDN...');
    const token = await getAccessToken();
    const uploadResult = await httpsPostMultipart(
      `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`,
      'media',
      coverPath
    );
    if (uploadResult.url) {
      coverImageUrl = uploadResult.url;
      console.log('✅ 封面图上传到 CDN 完成');
      console.log(`   🔗 CDN URL: ${coverImageUrl}`);
    }
  }
  
  // 转换 Markdown 为 HTML，并插入封面图
  const html = markdownToWechatHTML(content, { coverImage: coverImageUrl, theme });
  
  // 上传文章中的图片和视频到微信 CDN
  const processedHTML = await uploadInlineMedia(html);
  
  console.log(`✅ 格式转换完成（HTML 长度: ${processedHTML.length} 字节）\n`);
  
  // 3. 上传封面
  if (coverPath && fs.existsSync(coverPath)) {
    console.log('📤 上传封面图...');
    thumbMediaId = await uploadImage(coverPath);
    console.log('✅ 封面上传完成\n');
    
    // 清理临时文件
    fs.unlinkSync(coverPath);
  } else {
    console.log('⚠️  未生成封面，使用默认封面\n');
    // 这里可以上传一个默认封面
  }
  
  if (!thumbMediaId) {
    console.error('❌ 错误：没有可用的封面图');
    process.exit(1);
  }
  
  // 4. 创建草稿
  console.log('📮 创建草稿...');
  const result = await createDraft({
    title,
    content: processedHTML,
    thumbMediaId,
    author,
  });
  
  console.log('\n✅ 文章已同步到微信公众号草稿箱！');
  console.log(`Media ID: ${result.mediaId}`);
  
  // 输出上传的图片 URL 回执
  if (global.uploadedMediaUrls && global.uploadedMediaUrls.length > 0) {
    console.log('\n📸 上传的图片 URL 回执:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    global.uploadedMediaUrls.forEach((media, index) => {
      const typeLabel = media.type === 'cover' ? '🖼️ 封面图' : '📸 内联图片';
      console.log(`${index + 1}. ${typeLabel}: ${media.local}`);
      console.log(`   ${media.url}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    console.log('\nℹ️  本次发布没有上传内联图片（只有封面图）。\n');
  }
  
  console.log('请在微信公众号后台查看并发布。\n');

  // 5. 生成 .md 存档文件
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = `${dateStr}-${Date.now()}`;
  const excerpt = content.replace(/[#*`>\[\]!\-]/g, '').replace(/\n+/g, ' ').trim().slice(0, 120);

  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `slug: "${slug}"`,
    `excerpt: "${excerpt.replace(/"/g, '\\"')}"`,
    `tags: ["微信公众号"]`,
    `published: true`,
    `source: wechat`,
    `author: ${author}`,
    publicCoverUrl ? `coverImage: ${publicCoverUrl}` : null,
    `wechatMediaId: ${result.mediaId}`,
    '---',
  ].filter(Boolean).join('\n');

  let mdContent = frontmatter + '\n\n';
  if (publicCoverUrl) {
    mdContent += `![封面](${publicCoverUrl})\n\n`;
  }
  mdContent += content;

  const mdFileName = `${slug}.md`;

  // 6. 同步到 Convex 数据库（直接 HTTP API，无需本地项目）
  if (CONVEX_URL) {
    try {
      console.log('\n🔄 同步到网站数据库...');
      const mutationBody = JSON.stringify({
        path: 'posts:upsertBySlug',
        args: {
          title,
          slug,
          content,
          excerpt,
          tags: ['微信公众号'],
          published: true,
          visible: true,
          source: 'wechat',
          coverImage: publicCoverUrl || undefined,
          author: author || undefined,
        },
      });
      const convexResult = await httpsRequest(`${CONVEX_URL}/api/mutation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mutationBody,
      });
      console.log(`✅ 已同步到网站！(${convexResult.action || 'done'})`);
    } catch (err) {
      console.error(`⚠️  Convex 同步失败: ${err.message}`);
    }
  } else {
    console.log('ℹ️  未配置 CONVEX_URL，跳过数据库同步。');
  }

  // 7. 本地有 portfolio-v2 则备份
  const portfolioPublisherDir = path.resolve(os.homedir(), 'Documents/develop/H5Projects/portfolio-v2/content/publisher');
  if (fs.existsSync(path.resolve(os.homedir(), 'Documents/develop/H5Projects/portfolio-v2'))) {
    if (!fs.existsSync(portfolioPublisherDir)) {
      fs.mkdirSync(portfolioPublisherDir, { recursive: true });
    }
    const destPath = path.join(portfolioPublisherDir, mdFileName);
    fs.writeFileSync(destPath, mdContent, 'utf-8');
    console.log(`📋 已备份到 portfolio-v2: ${destPath}`);
  }
}

// 运行
main().catch(error => {
  console.error('\n❌ 发布失败:', error.message);
  
  // 即使失败也输出已上传的图片 URL
  if (global.uploadedMediaUrls && global.uploadedMediaUrls.length > 0) {
    console.error('\n📸 已上传的图片 URL:');
    global.uploadedMediaUrls.forEach((media, index) => {
      console.error(`${index + 1}. ${media.local}`);
      console.error(`   ${media.url}`);
    });
  }
  
  process.exit(1);
});
