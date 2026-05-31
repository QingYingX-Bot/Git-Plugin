import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localizeMarkdownImages, localizeRenderedReadmeHtml } from './readmeAssets.js';

let markdownItPromise;

export const renderReadmeMarkdown = async (readme, cleanupFiles) => {
  const markdown = normalizeMarkdown(readme.content || 'README 内容为空');
  const images = await localizeMarkdownImages(markdown, readme, cleanupFiles);
  const html = await renderWithMarkdownIt(markdown, images).catch(err => {
    logger.warn?.(`[Git-Plugin] markdown-it 渲染失败，使用纯文本渲染: ${err.message || err}`);
    return `<pre><code>${escapeHtml(markdown)}</code></pre>`;
  });
  return localizeRenderedReadmeHtml(sanitizeReadmeHtml(html), readme, cleanupFiles);
};

const renderWithMarkdownIt = async (markdown, images) => {
  const MarkdownIt = await loadMarkdownIt();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false
  });
  md.use(taskListPlugin);
  md.renderer.rules.image = renderImage;
  return md.render(markdown, { images });
};

const loadMarkdownIt = async () => {
  markdownItPromise ||= importMarkdownIt().then(mod => mod.default || mod);
  return markdownItPromise;
};

const importMarkdownIt = async () => {
  try {
    return await import('markdown-it');
  } catch (err) {
    const file = findPnpmMarkdownIt();
    if (!file) throw err;
    return import(pathToFileURL(file).href);
  }
};

const findPnpmMarkdownIt = () => {
  const store = path.join(process.cwd(), 'node_modules', '.pnpm');
  if (!fs.existsSync(store)) return '';
  const dir = fs.readdirSync(store)
    .filter(name => name.startsWith('markdown-it@'))
    .sort()
    .at(-1);
  const file = dir ? path.join(store, dir, 'node_modules', 'markdown-it', 'index.mjs') : '';
  return file && fs.existsSync(file) ? file : '';
};

const taskListPlugin = md => {
  md.core.ruler.after('inline', 'github-task-list', state => {
    for (let index = 2; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      const paragraph = state.tokens[index - 1];
      const listItem = state.tokens[index - 2];
      if (token.type !== 'inline' || paragraph.type !== 'paragraph_open' || listItem.type !== 'list_item_open') continue;

      const children = token.children || [];
      const first = children[0];
      const match = first?.type === 'text' ? first.content.match(/^\[([ xX])]\s+/) : null;
      if (!match) continue;

      first.content = first.content.slice(match[0].length);
      listItem.attrJoin('class', 'task-list-item');
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" disabled${match[1].toLowerCase() === 'x' ? ' checked' : ''}>`;
      children.unshift(checkbox);
    }
  });
};

const renderImage = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet('src') || '';
  const local = env.images?.get(src);
  if (local) token.attrSet('src', local);
  if (env.images?.has(src) && !local) return `<span class="image-missing">${escapeHtml(token.content || '图片加载失败')}</span>`;
  return self.renderToken(tokens, index, options);
};

const normalizeMarkdown = value => String(value || '')
  .replace(/\r\n/g, '\n')
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();

const sanitizeReadmeHtml = html => String(html || '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '')
  .replace(/<\/?(?:iframe|object|embed|link|meta)\b[^>]*>/gi, '')
  .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
