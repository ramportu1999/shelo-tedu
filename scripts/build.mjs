// בונה את האתר הסטטי מתוך content/ אל dist/.
// הרצה: npm run build   (לפריסה ב-GitHub Pages: BASE_PATH=/shelo-tedu/ npm run build)
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const DIST = join(ROOT, 'dist');
const BASE = normalizeBase(process.env.BASE_PATH || '/');

const site = readJson('site.json');
const checklists = readJson('checklists.json');
const tasksData = readJson('tasks.json');

// סדר הדפים: המפתח הוא שם הקובץ ב-content וגם הנתיב באתר.
const PAGES = ['home', 'levaya', 'shiva', 'shloshim', 'siddurim', 'chatuna', 'havhara'];
const GUIDES = ['levaya', 'shiva', 'shloshim', 'siddurim'];

function normalizeBase(b) {
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
}
function readJson(name) {
  return JSON.parse(readFileSync(join(CONTENT, name), 'utf8'));
}
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// מזהה עוגן לכותרת: אותו טקסט תמיד נותן אותו מזהה.
export function slugify(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/[?,.:;!"״׳'()]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
function pageUrl(key) {
  return key === 'home' ? BASE : `${BASE}${key}/`;
}
function href(target) {
  // קישור פנימי יחסי (למשל "levaya/") מקבל את נתיב הבסיס של האתר.
  if (/^(https?:|mailto:|#)/.test(target)) return target;
  return BASE + target.replace(/^\//, '');
}
const isExternal = (h) => /^https?:/.test(h);
const EXTERNAL_NOTE = '<span class="visually-hidden"> (קישור חיצוני, נפתח בלשונית חדשה)</span>';

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  if (!m) return { meta, body: src };
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (/^\d+$/.test(v)) v = Number(v);
    meta[k] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}

function createMarked(headings) {
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const id = slugify(inner);
        if (depth === 2 && headings) headings.push({ id, text: inner });
        return `<h${depth} id="${escapeHtml(id)}">${inner}</h${depth}>\n`;
      },
      link({ href: target, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const h = href(target);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        if (isExternal(h)) {
          return `<a href="${escapeHtml(h)}"${t} target="_blank" rel="noopener" class="external">${text}${EXTERNAL_NOTE}</a>`;
        }
        return `<a href="${escapeHtml(h)}"${t}>${text}</a>`;
      },
    },
  });
  return md;
}

// ---------- בלוקים מיוחדים (:::שם ... :::) ----------
function extractBlocks(body) {
  const blocks = [];
  const out = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^:::(\w+)\s*(.*)$/);
    if (!open) { out.push(lines[i]); continue; }
    const inner = [];
    i++;
    while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
    if (i >= lines.length) throw new Error(`בלוק :::${open[1]} לא נסגר`);
    blocks.push({ name: open[1], arg: open[2].trim(), body: inner.join('\n') });
    out.push('', `<!--BLOCK:${blocks.length - 1}-->`, '');
  }
  return { md: out.join('\n'), blocks };
}

function renderBlock(block, md, headings) {
  const inner = () => md.parse(block.body);
  switch (block.name) {
    case 'cards': return renderCards(block.body);
    case 'about': return renderAbout(inner());
    case 'secondary': return `<aside class="secondary-link">${inner()}</aside>`;
    case 'links': return `<div class="links${block.arg === 'featured' ? ' links-featured' : ''}">${inner()}</div>`;
    case 'note': return `<aside class="note">${inner()}</aside>`;
    case 'pending':
      return `<div class="pending" data-pending><p class="pending-label">טיוטה, ממתין לאישור</p>${inner()}</div>`;
    case 'download': return renderDownload();
    case 'checklist': return renderChecklist(block.arg, headings);
    case 'tasks': return renderTasks();
    default: throw new Error(`בלוק לא מוכר: ${block.name}`);
  }
}

function renderCards(body, exclude) {
  const items = body.split('\n').map((l) => l.match(/^- \[(.+?)\]\((.+?)\) · (.+)$/)).filter(Boolean);
  const lis = items
    .filter(([, , target]) => !exclude || !target.startsWith(exclude))
    .map(([, title, target, desc]) =>
      `<li><a class="card" href="${escapeHtml(href(target))}"><span class="card-title">${escapeHtml(title)}</span><span class="card-desc">${escapeHtml(desc)}</span></a></li>`)
    .join('');
  return `<ul class="cards" role="list">${lis}</ul>`;
}
let homeCardsSource = '';

function renderAbout(html) {
  const photo = site.aboutPhoto
    ? `<img class="about-photo" src="${escapeHtml(BASE + site.aboutPhoto)}" alt="${escapeHtml(site.aboutPhotoAlt)}" width="160" height="160" loading="lazy">`
    : '';
  return `<section class="about${photo ? ' has-photo' : ''}" aria-labelledby="קצת-עליי">${photo}<div class="about-text">${html}</div></section>`;
}

function renderDownload() {
  const file = 'files/modaat-evel.docx';
  const kb = Math.max(1, Math.round(statSync(join(ROOT, 'public', file)).size / 1024));
  return `<div class="download">
  <figure class="download-preview">
    <img src="${BASE}images/modaat-evel-preview.webp" alt="תצוגה מקדימה של תבנית מודעת האבל" width="440" height="570" loading="lazy">
    <figcaption><strong>תצוגה מקדימה</strong> · תבנית עם שדות לשם, פרטי הלוויה ופרטי השבעה.</figcaption>
  </figure>
  <a class="button download-link" href="${BASE}${file}" download="תבנית מודעת אבל.docx"><strong>להורדה ולעריכה ב־Word</strong><span class="sep"> · </span><span>תבנית מודעת אבל</span> <span class="file-meta">(<bdi dir="ltr">DOCX, ${kb}KB</bdi>)</span></a>
</div>`;
}

function renderChecklist(listId, headings) {
  const list = checklists[listId];
  if (!list) throw new Error(`צ׳קליסט לא קיים: ${listId}`);
  const id = slugify(list.title);
  if (headings) headings.push({ id, text: escapeHtml(list.title) });
  const items = list.items
    .map((it) => {
      const inputId = `cl-${listId}-${it.id}`;
      return `<li><input type="checkbox" id="${inputId}" data-item="${escapeHtml(it.id)}"><label for="${inputId}">${escapeHtml(it.text)}</label></li>`;
    })
    .join('');
  return `<section class="checklist" data-checklist="${listId}" aria-labelledby="${escapeHtml(id)}">
  <h2 id="${escapeHtml(id)}">${escapeHtml(list.title)}</h2>
  <ul role="list">${items}</ul>
  <div class="checklist-footer" data-enhance hidden></div>
</section>`;
}

function renderTasks() {
  const data = { statuses: tasksData.statuses, tasks: tasksData.tasks };
  const staticList = tasksData.tasks
    .map((t) => `<li class="task-card"><p class="task-text">${escapeHtml(t.text)}</p><p class="task-when"><span class="label">מתי כדאי לבדוק?</span> ${escapeHtml(t.when)}</p></li>`)
    .join('');
  return `<div class="tasks" id="tasks">
  <p class="notice" data-nojs>כדי לעדכן סטטוסים, לכתוב הערות ולשמור את ההתקדמות צריך להפעיל JavaScript בדפדפן. אפשר עדיין לקרוא את הרשימה ולהדפיס אותה.</p>
  <ol class="task-list task-list-static" role="list">${staticList}</ol>
  <div id="tasks-app" hidden></div>
  <script type="application/json" id="tasks-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</div>`;
}

// ---------- תבנית העמוד ----------
function layout({ key, meta, main, hasScript }) {
  const isHome = key === 'home';
  const title = isHome ? `${site.name} | ${meta.tagline}` : `${meta.title} | ${site.name}`;
  const canonical = site.siteUrl.replace(/\/$/, '/') + (isHome ? '' : `${key}/`);
  const mail = `mailto:${site.contactEmail}?subject=${encodeURIComponent('פנייה מהאתר שלא תדעו')}`;
  const guideLinks = GUIDES.map((g) => {
    const m = pages[g].meta;
    return `<li><a href="${pageUrl(g)}"${g === key ? ' aria-current="page"' : ''}>${escapeHtml(m.title)}</a></li>`;
  }).join('');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="${escapeHtml(site.name)}">
<meta property="og:title" content="${escapeHtml(isHome ? site.name : `${meta.title} | ${site.name}`)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(site.siteUrl)}images/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="שלא תדעו. אבל אם כבר יודעים, לא צריך להבין הכול לבד.">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f8f4ee">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${BASE}fonts/assistant-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}css/site.css?v=${BUILD_ID}">
</head>
<body class="page-${key}">
<a class="skip-link" href="#main">דילוג לתוכן</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${BASE}"${isHome ? ' aria-current="page"' : ''}>${escapeHtml(site.name)}</a>
    <a class="header-contact" href="${mail}">יצירת קשר</a>
  </div>
</header>
<main id="main" class="wrap" tabindex="-1">
${main}
</main>
<footer class="site-footer">
  <div class="wrap">
    <nav aria-label="המדריכים">
      <ul class="footer-links" role="list">${guideLinks}<li><a href="${pageUrl('chatuna')}"${key === 'chatuna' ? ' aria-current="page"' : ''}>${escapeHtml(pages.chatuna.meta.title)}</a></li></ul>
    </nav>
    <p class="footer-contact">יצירת קשר / מצאתם מידע שצריך לתקן?<br><a href="${mail}">${escapeHtml(site.contactEmail)}</a></p>
    <p class="footer-legal"><a href="${pageUrl('havhara')}"${key === 'havhara' ? ' aria-current="page"' : ''}>הבהרה ופרטיות</a></p>
  </div>
</footer>
${hasScript ? `<script type="module" src="${BASE}js/app.js?v=${BUILD_ID}"></script>` : ''}
</body>
</html>
`;
}

function renderPage(key) {
  const { meta } = pages[key];
  const headings = [];
  const md = createMarked(headings);
  const { md: source, blocks } = extractBlocks(pages[key].body);
  let html = md.parse(source);
  html = html.replace(/<!--BLOCK:(\d+)-->/g, (_, n) => renderBlock(blocks[Number(n)], createMarked(headings), headings));
  const hasScript = blocks.some((b) => b.name === 'checklist' || b.name === 'tasks');

  let main;
  if (key === 'home') {
    main = `<div class="hero"><h1>${escapeHtml(meta.title)}</h1><p class="tagline">${escapeHtml(meta.tagline)}</p></div>\n${html}`;
  } else {
    // הפתיח (עד הכותרת הראשונה), ואז תוכן עניינים קצר במדריכים ארוכים.
    const firstH2 = html.indexOf('<h2');
    const intro = firstH2 > 0 ? html.slice(0, firstH2) : '';
    const rest = firstH2 >= 0 ? html.slice(firstH2) : html;
    const toc = GUIDES.includes(key) && headings.length >= 4
      ? `<nav class="toc" aria-labelledby="toc-title"><h2 id="toc-title" class="toc-title">בעמוד הזה</h2><ul role="list">${headings
          .map((h) => `<li><a href="#${escapeHtml(h.id)}">${h.text}</a></li>`)
          .join('')}</ul></nav>`
      : '';
    const more = GUIDES.includes(key)
      ? `<nav class="more-guides" aria-labelledby="more-title"><h2 id="more-title">מדריכים נוספים</h2>${renderCards(homeCardsSource, key + '/')}</nav>`
      : '';
    main = `<article class="guide">
<header class="guide-header"><h1>${escapeHtml(meta.title)}</h1>${intro}</header>
${toc}
${rest}
</article>
${more}`;
  }
  return layout({ key, meta, main, hasScript });
}

// ---------- הרצה ----------
const BUILD_ID = Date.now().toString(36);
const pages = {};
for (const key of PAGES) {
  const { meta, body } = parseFrontmatter(readFileSync(join(CONTENT, `${key}.md`), 'utf8'));
  pages[key] = { meta, body };
}
homeCardsSource = (pages.home.body.match(/:::cards\n([\s\S]*?)\n:::/) || [])[1] || '';

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, 'public'), DIST, { recursive: true });
cpSync(join(ROOT, 'src'), DIST, { recursive: true });
mkdirSync(join(DIST, 'fonts'), { recursive: true });
const fontDir = join(ROOT, 'node_modules/@fontsource-variable/assistant/files');
cpSync(join(fontDir, 'assistant-hebrew-wght-normal.woff2'), join(DIST, 'fonts/assistant-hebrew.woff2'));
cpSync(join(fontDir, 'assistant-latin-wght-normal.woff2'), join(DIST, 'fonts/assistant-latin.woff2'));

for (const key of PAGES) {
  const outDir = key === 'home' ? DIST : join(DIST, key);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), renderPage(key));
}

// עמוד 404 (GitHub Pages מציג אותו לכל כתובת שלא קיימת)
writeFileSync(
  join(DIST, '404.html'),
  layout({
    key: '404',
    meta: { title: 'העמוד לא נמצא', description: 'העמוד שחיפשתם לא נמצא.' },
    main: `<article class="guide"><h1>העמוד לא נמצא</h1><p>ייתכן שהקישור השתנה. אפשר לחזור <a href="${BASE}">לעמוד הבית</a> ולבחור משם את המדריך.</p></article>`,
  }),
);

const urls = PAGES.map((k) => site.siteUrl + (k === 'home' ? '' : `${k}/`));
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}sitemap.xml\n`);
writeFileSync(join(DIST, '.nojekyll'), '');

if (!existsSync(join(DIST, 'js/app.js'))) throw new Error('חסר src/js/app.js');
console.log(`נבנה ב-dist/ (BASE_PATH=${BASE}), ${PAGES.length} עמודים.`);
