// מריץ את בדיקות הדפדפן גם על Safari (WebKit, כמו באייפון).
// Firefox מוגדר ב-playwright.config.mjs (--project=firefox), אבל לא רץ במחשב הזה (Windows חוסם את קובצי הדפדפן).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', '--project=iphone-safari', ...process.argv.slice(2)], {
  stdio: 'inherit', shell: true, env: { ...process.env, ALL_BROWSERS: '1' },
});
process.exit(r.status ?? 1);
