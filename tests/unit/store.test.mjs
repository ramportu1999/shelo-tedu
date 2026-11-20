// בדיקות למנגנון השמירה של הצ׳קליסטים (src/js/store.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/js/store.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
const task = { id: 'death-certificate', text: 'להפיק תעודת פטירה' };

test('מצב התחלתי: כל משימה "טרם טופל" בלי הערה', () => {
  assert.deepEqual(S.getTask(S.emptyState(), 'siddurim', 'x'), { status: 'todo', note: '' });
});

test('שמירה וטעינה מחדש שומרות סטטוס, הערה וסימונים', () => {
  const storage = memoryStorage();
  const store = S.createStore(storage);
  let st = store.load().state;
  st = S.setTask(st, 'siddurim', task, { status: 'waiting', note: 'שלחנו מייל' });
  st = S.setChecked(st, 'levaya', 'water', true);
  assert.ok(store.save(st));
  const again = S.createStore(storage).load().state;
  assert.deepEqual(S.getTask(again, 'siddurim', task.id), { status: 'waiting', note: 'שלחנו מייל' });
  assert.equal(S.isChecked(again, 'levaya', 'water'), true);
});

test('עדכון גרסה: משימה שנמחקה מהרשימה לא נמחקת מהנתונים ומוצגת בנפרד', () => {
  let st = S.setTask(S.emptyState(), 'siddurim', { id: 'old-task', text: 'משימה ישנה' }, { note: 'חשוב' });
  st = S.setTask(st, 'siddurim', { id: 'untouched', text: 'בלי מידע' }, { status: 'todo' });
  const orphans = S.orphanTasks(st, 'siddurim', ['death-certificate']);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].text, 'משימה ישנה');
  assert.equal(orphans[0].note, 'חשוב');
});

test('עדכון גרסה: משימה חדשה ברשימה מקבלת ברירת מחדל בלי לגעת בשאר', () => {
  const st = S.setTask(S.emptyState(), 'siddurim', task, { status: 'done' });
  assert.equal(S.getTask(st, 'siddurim', 'brand-new').status, 'todo');
  assert.equal(S.getTask(st, 'siddurim', task.id).status, 'done');
});

test('נתונים מגרסה עתידית לא נדרסים (קריאה בלבד)', () => {
  const raw = JSON.stringify({ version: 99, lists: { siddurim: { tasks: { a: { status: 'done' } } } } });
  const r = S.parseStored(raw);
  assert.equal(r.readOnly, true);
  assert.equal(S.getTask(r.state, 'siddurim', 'a').status, 'done');
});

test('נתונים פגומים: מתחילים מחדש אבל שומרים עותק', () => {
  const storage = memoryStorage({ [S.STORAGE_KEY]: '{not json' });
  const r = S.createStore(storage).load();
  assert.equal(r.corrupt, true);
  const copies = Object.keys(storage.data).filter((k) => k.startsWith(S.STORAGE_KEY + ':corrupt:'));
  assert.equal(copies.length, 1);
  assert.equal(storage.data[copies[0]], '{not json');
});

test('localStorage חסום: לא נזרקת שגיאה והשמירה מסומנת כלא זמינה', () => {
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  const store = S.createStore(blocked);
  assert.equal(store.available, false);
  assert.equal(store.save(S.emptyState()), false);
  assert.deepEqual(store.load().state, S.emptyState());
});

test('סטטוס לא מוכר מתוקן לברירת מחדל', () => {
  const st = S.sanitize({ lists: { siddurim: { tasks: { a: { status: 'hacked', note: 5 } } } } });
  assert.deepEqual(S.getTask(st, 'siddurim', 'a'), { status: 'todo', note: '' });
});

test('משימות אישיות: הוספה, עדכון ומחיקה', () => {
  let st = S.addCustom(S.emptyState(), 'siddurim', { text: ' לבטל מנוי לעיתון ', when: 'בהמשך' }, 'custom-1');
  assert.equal(S.customTasks(st, 'siddurim')[0].text, 'לבטל מנוי לעיתון');
  st = S.updateCustom(st, 'siddurim', 'custom-1', { status: 'done', note: 'בוטל' });
  assert.equal(S.customTasks(st, 'siddurim')[0].status, 'done');
  st = S.removeCustom(st, 'siddurim', 'custom-1');
  assert.equal(S.customTasks(st, 'siddurim').length, 0);
});

test('CSV: עברית עם BOM, הערות ומשימות אישיות, ומירכאות מוברחות', () => {
  const csv = S.toCSV([
    { text: 'להפיק תעודת פטירה', when: 'בהקדם', status: 'doing', note: 'אמרו "שבוע", אולי יותר\nשורה 2', source: 'מהרשימה באתר' },
    { text: 'משימה שלי', when: '', status: 'todo', note: '', source: 'משימה שלי' },
  ]);
  assert.ok(csv.startsWith('﻿משימה,'));
  assert.ok(csv.includes('"אמרו ""שבוע"", אולי יותר\nשורה 2"'));
  assert.ok(csv.includes('בטיפול'));
  assert.ok(csv.includes('משימה שלי,,טרם טופל'));
});

test('גיבוי ושחזור מחזירים את אותו מצב', () => {
  let st = S.setTask(S.emptyState(), 'siddurim', task, { status: 'na', note: 'לא צריך' });
  st = S.addCustom(st, 'siddurim', { text: 'עוד משהו', when: '' }, 'custom-x');
  const restored = S.fromBackup(S.toBackup(st));
  assert.deepEqual(S.getTask(restored, 'siddurim', task.id), { status: 'na', note: 'לא צריך' });
  assert.equal(S.customTasks(restored, 'siddurim')[0].text, 'עוד משהו');
});

test('שחזור מקובץ לא תקין נדחה עם הודעה בעברית', () => {
  assert.throws(() => S.fromBackup('שלום'), /אינו קובץ גיבוי תקין/);
  assert.throws(() => S.fromBackup('{"lists":{}}'), /אינו קובץ גיבוי של האתר/);
});

test('ניקוי רשימה אחת לא נוגע ברשימות אחרות', () => {
  let st = S.setChecked(S.emptyState(), 'levaya', 'water', true);
  st = S.setTask(st, 'siddurim', task, { status: 'done' });
  st = S.clearList(st, 'levaya');
  assert.equal(S.isChecked(st, 'levaya', 'water'), false);
  assert.equal(S.getTask(st, 'siddurim', task.id).status, 'done');
});
