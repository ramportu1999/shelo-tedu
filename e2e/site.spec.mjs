// בדיקות דפדפן לאתר כולו. הרצה: npm test (או npm run test:e2e אחרי build)
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const PAGES = ['', 'levaya/', 'shiva/', 'shloshim/', 'siddurim/', 'chatuna/', 'havhara/'];
const KEY = 'shelo-tedu';

test.describe('כל העמודים', () => {
  for (const path of PAGES) {
    test(`עמוד /${path} נטען תקין`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      const res = await page.goto(path);
      expect(res.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'he');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
      // אין גלילה אופקית
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // קישור יצירת קשר גלוי בתחתית
      await expect(page.locator('.footer-contact a[href^="mailto:runny.sagi@gmail.com"]')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`נגישות אוטומטית (axe) ב-/${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('כל הקישורים הפנימיים מובילים לעמוד קיים', async ({ page, request }) => {
    const seen = new Set();
    for (const path of PAGES) {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.href).filter((h) => h.startsWith(location.origin)));
      hrefs.forEach((h) => seen.add(h.split('#')[0]));
    }
    for (const url of seen) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
    }
  });

  test('כתובת שלא קיימת מציגה עמוד 404 עם קישור הביתה', async ({ page }) => {
    const res = await page.goto('no-such-page/');
    expect(res.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'לעמוד הבית' })).toBeVisible();
  });
});

test('עמוד הבית: ארבעה מדריכים, קצת עליי ועמוד החתונה', async ({ page }) => {
  await page.goto('');
  const cards = page.locator('main .cards a.card');
  await expect(cards).toHaveCount(4);
  await cards.filter({ hasText: 'השבעה' }).click();
  await expect(page).toHaveURL(/\/shiva\/$/);
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'קצת עליי' })).toBeVisible();
  await page.getByRole('link', { name: 'מתחתנים אחרי אובדן?' }).first().click();
  await expect(page.locator('h1')).toHaveText('מתחתנים אחרי אובדן?');
});

test('מקלדת: קישור דילוג לתוכן, ושינוי סטטוס בלי עכבר', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'ב-Safari מקש Tab לא עובר על קישורים כברירת מחדל');
  await page.goto('siddurim/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'דילוג לתוכן' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const select = page.locator('#tasks-app .task-card select').first();
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.reload();
  await expect(page.locator('#tasks-app .task-card select').first()).toHaveValue('doing');
});

test('חיצים דקורטיביים לא נקראים בקורא מסך', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('main .cards a.card').first()).toHaveAccessibleName('הלוויה מסמכים, תיאום קבורה, תכנון הטקס ומודעת אבל לעריכה.');
});

test('קישור עמוק לסעיף מגיע לסעיף', async ({ page }) => {
  await page.goto('siddurim/#חשבונות-בנק');
  await expect(page.locator('[id="חשבונות-בנק"]')).toBeInViewport();
});

test('קישורים חיצוניים נפתחים בלשונית חדשה ומסומנים', async ({ page }) => {
  await page.goto('levaya/');
  const ext = page.locator('main a.external').first();
  await expect(ext).toHaveAttribute('target', '_blank');
  await expect(ext).toHaveAttribute('rel', /noopener/);
  await expect(ext.locator('.visually-hidden')).toHaveText(/קישור חיצוני/);
});

test('ליווי לאחר פטירה מופיע בתחילת פרק הבירוקרטיה', async ({ page }) => {
  await page.goto('siddurim/');
  const featured = page.locator('.links-featured a');
  await expect(featured).toContainText('ליווי לאחר פטירה');
  const featuredY = (await featured.boundingBox()).y;
  const firstSection = (await page.locator('[id="מסמכים-שכדאי-להכיר"]').boundingBox()).y;
  expect(featuredY).toBeLessThan(firstSection);
});

test('הורדת תבנית מודעת האבל ותצוגה מקדימה', async ({ page, request }) => {
  await page.goto('levaya/');
  const link = page.locator('a.download-link');
  await expect(link).toHaveAttribute('download', 'תבנית מודעת אבל.docx');
  const res = await request.get(await link.getAttribute('href'));
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('wordprocessingml');
  const img = page.locator('.download-preview img');
  await img.scrollIntoViewIfNeeded();
  expect(await img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
});

test('צ׳קליסט קצר: סימון נשמר אחרי רענון וניתן לניקוי באישור', async ({ page }) => {
  await page.goto('levaya/');
  const box = page.getByLabel('להביא טישו.');
  await box.check();
  await page.reload();
  await expect(page.getByLabel('להביא טישו.')).toBeChecked();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'ניקוי הסימונים' }).click();
  await expect(page.getByLabel('להביא טישו.')).not.toBeChecked();
});

test.describe('צ׳קליסט הבירוקרטיה', () => {
  const card = (page, text) => page.locator('#tasks-app .task-card', { hasText: text });

  test('סטטוס והערה נשמרים אחרי רענון', async ({ page }) => {
    await page.goto('siddurim/');
    await expect(page.locator('#tasks-app .task-list .task-card')).toHaveCount(24);
    await expect(page.locator('.task-list-static')).toBeHidden();
    await expect(page.locator('[data-nojs]')).toHaveCount(0);
    expect(await page.locator('#tasks-app').innerText()).not.toMatch(/\b(null|undefined)\b/);
    const c = card(page, 'להפיק תעודת פטירה');
    await c.getByLabel('סטטוס').selectOption('waiting');
    await c.getByLabel('הערות').fill('ביקשנו באתר, מחכים');
    await c.getByLabel('הערות').blur();
    await page.reload();
    const c2 = card(page, 'להפיק תעודת פטירה');
    await expect(c2.getByLabel('סטטוס')).toHaveValue('waiting');
    await expect(c2.getByLabel('הערות')).toHaveValue('ביקשנו באתר, מחכים');
  });

  test('הערה נשמרת גם בלי לצאת מהשדה (לפני סגירת העמוד)', async ({ page }) => {
    await page.goto('siddurim/');
    await card(page, 'לבדוק עדכון מחזיק בארנונה').getByLabel('הערות').fill('התקשרנו לעירייה');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(card(page, 'לבדוק עדכון מחזיק בארנונה').getByLabel('הערות')).toHaveValue('התקשרנו לעירייה');
  });

  test('סינון, מיון ומונה התקדמות', async ({ page }) => {
    await page.goto('siddurim/');
    await card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס').selectOption('done');
    await card(page, 'לבדוק עדכון מחזיק בארנונה').getByLabel('סטטוס').selectOption('na');
    await expect(page.locator('.progress')).toHaveText('הושלמו 1 מתוך 24 משימות · 1 סומנו כלא רלוונטיות');
    await page.getByLabel('הצגה').selectOption('done');
    await expect(page.locator('#tasks-app .task-list .task-card')).toHaveCount(1);
    await page.getByLabel('הצגה').selectOption('open');
    await expect(page.locator('#tasks-app .task-list .task-card')).toHaveCount(22);
    await page.getByLabel('הצגה').selectOption('waiting');
    await expect(page.locator('.empty')).toBeVisible();
    await page.getByLabel('הצגה').selectOption('all');
    await page.getByLabel('סדר').selectOption('status');
    await expect(page.locator('#tasks-app .task-list .task-card').last()).toContainText('לבדוק עדכון מחזיק בארנונה');
  });

  test('הוספת משימה אישית ומחיקה רק אחרי אישור', async ({ page }) => {
    await page.goto('siddurim/');
    await page.getByRole('button', { name: 'הוספה לרשימה' }).click();
    await expect(page.locator('#new-task-text')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('משימה', { exact: true }).fill('לבטל את המנוי לעיתון');
    await page.getByLabel('מתי כדאי לבדוק? (לא חובה)').fill('בהמשך');
    await page.getByRole('button', { name: 'הוספה לרשימה' }).click();
    const c = card(page, 'לבטל את המנוי לעיתון');
    await expect(c).toContainText('משימה שלי');
    await expect(page.locator('.progress')).toContainText('מתוך 25');
    await page.reload();
    page.once('dialog', (d) => d.dismiss());
    await card(page, 'לבטל את המנוי לעיתון').getByRole('button', { name: 'מחיקת המשימה' }).click();
    await expect(card(page, 'לבטל את המנוי לעיתון')).toHaveCount(1);
    page.once('dialog', (d) => d.accept());
    await card(page, 'לבטל את המנוי לעיתון').getByRole('button', { name: 'מחיקת המשימה' }).click();
    await expect(card(page, 'לבטל את המנוי לעיתון')).toHaveCount(0);
  });

  test('ייצוא CSV כולל הערות ומשימות אישיות', async ({ page }) => {
    await page.goto('siddurim/');
    await card(page, 'להפיק תעודת פטירה').getByLabel('הערות').fill('הערה לבדיקה, עם פסיק');
    await card(page, 'להפיק תעודת פטירה').getByLabel('הערות').blur();
    await page.getByLabel('משימה', { exact: true }).fill('משימה אישית לייצוא');
    await page.getByRole('button', { name: 'הוספה לרשימה' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא לקובץ CSV (לאקסל)' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^shelo-tedu-tasks-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync(await dl.path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"הערה לבדיקה, עם פסיק"');
    expect(csv).toContain('משימה אישית לייצוא');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 25);
  });

  test('גיבוי, מחיקה באישור ושחזור', async ({ page }) => {
    await page.goto('siddurim/');
    await card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס').selectOption('doing');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'שמירת קובץ גיבוי' }).click()]);
    const backupPath = await dl.path();

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'מחיקת ההתקדמות ברשימה' }).click();
    await expect(card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס')).toHaveValue('doing');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'מחיקת ההתקדמות ברשימה' }).click();
    await expect(card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס')).toHaveValue('todo');

    page.on('dialog', (d) => d.accept());
    await page.getByLabel('שחזור מקובץ גיבוי').setInputFiles(backupPath);
    await expect(card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס')).toHaveValue('doing');
  });

  test('עדכון גרסה של האתר לא מוחק התקדמות קיימת', async ({ page }) => {
    // מדמים נתונים שנשמרו בגרסה קודמת: משימה שקיימת היום ומשימה שהוסרה מהרשימה.
    await page.addInitScript(([key]) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        version: 1,
        lists: { siddurim: { tasks: {
          'death-certificate': { status: 'done', note: 'קיבלנו', text: 'להפיק תעודת פטירה' },
          'removed-task': { status: 'doing', note: 'הערה חשובה', text: 'משימה שהייתה פעם ברשימה' },
        } } },
      }));
    }, [KEY]);
    await page.goto('siddurim/');
    await expect(card(page, 'להפיק תעודת פטירה').getByLabel('סטטוס')).toHaveValue('done');
    await expect(page.getByText('משימה שהייתה פעם ברשימה')).toBeVisible();
    await expect(page.getByText('הערות: הערה חשובה')).toBeVisible();
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    expect(stored.lists.siddurim.tasks['removed-task'].note).toBe('הערה חשובה');
  });

  test('ההערות לא נשלחות לשום שרת', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r));
    await page.goto('siddurim/');
    await card(page, 'להפיק תעודת פטירה').getByLabel('הערות').fill('סוד-משפחתי-12345');
    await card(page, 'להפיק תעודת פטירה').getByLabel('הערות').blur();
    await page.waitForTimeout(600);
    for (const r of requests) {
      expect(new URL(r.url()).hostname).toBe('localhost');
      expect(r.method()).toBe('GET');
      expect(r.url()).not.toContain('12345');
    }
  });
});

test.describe('מצבים חריגים', () => {
  test('בלי JavaScript: הרשימה המלאה מוצגת עם הסבר', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8081/siddurim/');
    await expect(page.locator('.task-list-static .task-card')).toHaveCount(24);
    await expect(page.getByText('צריך להפעיל JavaScript')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('מה צריך להסדיר אחרי הפטירה?');
    await ctx.close();
  });

  test('כש-localStorage חסום: הודעה ברורה והרשימה עדיין עובדת', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await page.goto('siddurim/');
    await expect(page.locator('[data-storage-problem]')).toContainText('לא ניתן לשמור את ההתקדמות');
    const c = page.locator('#tasks-app .task-card', { hasText: 'להפיק תעודת פטירה' });
    await c.getByLabel('סטטוס').selectOption('done');
    await expect(page.locator('.progress')).toContainText('הושלמו 1');
    await page.goto('levaya/');
    await expect(page.getByText('לא ניתן לשמור את הסימונים בדפדפן הזה.')).toBeVisible();
  });
});
