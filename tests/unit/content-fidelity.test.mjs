// בודק שכל פסקה במסמך התוכן המאושר מופיעה באתר הבנוי, מילה במילה.
// מקור: tests/fixtures/source-content.txt, שנוצר מהקובץ שלא_תדעו_תוכן_האתר.docx בעזרת scripts/docx-to-text.py.
// דורש build לפני הריצה (npm test עושה זאת).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(decodeURIComponent(ROOT), 'dist');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<span class="visually-hidden">[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const siteText = htmlFiles(DIST).map((f) => visibleText(readFileSync(f, 'utf8'))).join(' \n ');

const lines = readFileSync(join(decodeURIComponent(ROOT), 'tests/fixtures/source-content.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('==='));

test('כל פסקאות מסמך התוכן מופיעות באתר כלשונן', () => {
  const missing = [];
  for (let line of lines) {
    if (line.startsWith('R')) continue; // שורות הטבלה נבדקות בנפרד
    line = line.replace(/^<[^>]*>\s*/, '').replace(/^[☐•]\s*/, '');
    line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // קישור → טקסט הקישור
    for (const segment of line.split(' · ')) {
      const s = norm(segment);
      if (s && !siteText.includes(s)) missing.push(s);
    }
  }
  assert.deepEqual(missing, [], `קטעים שלא נמצאו באתר:\n${missing.join('\n')}`);
});

test('כל 24 שורות הטבלה מופיעות באתר עם עמודת "מתי כדאי לבדוק?"', () => {
  const rows = lines.filter((l) => /^R\d+: /.test(l)).slice(1);
  assert.equal(rows.length, 24);
  for (const row of rows) {
    const [task, when, status] = row.replace(/^R\d+: /, '').split(' || ');
    assert.ok(siteText.includes(norm(task)), `משימה חסרה: ${task}`);
    assert.ok(siteText.includes(norm(when)), `מועד חסר: ${when}`);
    assert.equal(norm(status), 'טרם טופל');
  }
});

test('המשימות ב-tasks.json זהות לטבלה במקור ובאותו סדר', () => {
  const rows = lines.filter((l) => /^R\d+: /.test(l)).slice(1).map((r) => r.replace(/^R\d+: /, '').split(' || '));
  const { tasks } = JSON.parse(readFileSync(join(decodeURIComponent(ROOT), 'content/tasks.json'), 'utf8'));
  assert.equal(tasks.length, rows.length);
  tasks.forEach((t, i) => {
    assert.equal(t.text, norm(rows[i][0]));
    assert.equal(t.when, norm(rows[i][1]));
  });
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length, 'מזהים כפולים');
});
