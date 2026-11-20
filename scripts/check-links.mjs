// בודק שכל הקישורים החיצוניים בתוכן נפתחים. הרצה: npm run check:links
// שימו לב: אתרים ממשלתיים חוסמים לפעמים בקשות אוטומטיות (403). קישור כזה צריך לבדוק ידנית בדפדפן.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const links = new Map();
for (const f of readdirSync(CONTENT).filter((f) => f.endsWith('.md'))) {
  const src = readFileSync(join(CONTENT, f), 'utf8');
  for (const [, text, url] of src.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) {
    if (!links.has(url)) links.set(url, { text, files: new Set() });
    links.get(url).files.add(f);
  }
}

async function check(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (link check)', 'Accept-Language': 'he-IL,he;q=0.9' },
    });
    return { status: res.status, final: res.url };
  } catch (e) {
    return { status: 'ERR', error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

const results = await Promise.all([...links].map(async ([url, info]) => ({ url, ...info, ...(await check(url)) })));
let bad = 0;
for (const r of results) {
  const ok = typeof r.status === 'number' && r.status < 400;
  if (!ok) bad++;
  const moved = r.final && r.final !== r.url ? `\n      → הופנה אל ${r.final}` : '';
  console.log(`${ok ? 'OK ' : '!! '} ${r.status}  ${r.text}  (${[...r.files].join(', ')})\n      ${r.url}${moved}${r.error ? `\n      ${r.error}` : ''}`);
}
console.log(`\n${results.length} קישורים, ${bad} דורשים בדיקה.`);
process.exitCode = bad ? 1 : 0;
