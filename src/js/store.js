// שמירת ההתקדמות בצ׳קליסטים – לוגיקה טהורה, ללא DOM, כדי שאפשר יהיה לבדוק אותה.
// הנתונים נשמרים רק ב-localStorage של הדפדפן. שום דבר לא נשלח לשרת.
//
// מבנה הנתונים (גרסה 1):
// {
//   version: 1,
//   lists: {
//     levaya:   { checked: { "<item id>": true } },
//     siddurim: {
//       tasks:  { "<task id>": { status: "doing", note: "...", text: "<צילום הטקסט>", updatedAt: "..." } },
//       custom: [ { id: "custom-…", text: "...", when: "...", status: "todo", note: "", createdAt: "..." } ]
//     }
//   }
// }
//
// כללים שמגנים על נתוני המשתמשים בעדכוני גרסה:
// 1. מזהים של משימות קבועים (tasks.json / checklists.json) ולא מספר שורה.
// 2. לעולם לא מוחקים רשומה של משימה שלא מופיעה יותר ברשימה – היא מוצגת בנפרד.
// 3. אם נמצאים נתונים מגרסה חדשה יותר – לא כותבים עליהם (מצב קריאה בלבד).
// 4. אם הנתונים פגומים – שומרים עותק שלהם במפתח נפרד לפני שמתחילים מחדש.

export const STORAGE_KEY = 'shelo-tedu';
export const SCHEMA_VERSION = 1;

export const STATUSES = [
  { code: 'todo', label: 'טרם טופל' },
  { code: 'doing', label: 'בטיפול' },
  { code: 'waiting', label: 'ממתין לתשובה' },
  { code: 'done', label: 'הושלם' },
  { code: 'na', label: 'לא רלוונטי' },
];
export const DEFAULT_STATUS = 'todo';
const STATUS_CODES = new Set(STATUSES.map((s) => s.code));
export const statusLabel = (code) => (STATUSES.find((s) => s.code === code) || STATUSES[0]).label;

export function emptyState() {
  return { version: SCHEMA_VERSION, lists: {} };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');

// מנקה ומאמת מבנה שמגיע מ-localStorage או מקובץ גיבוי.
export function sanitize(raw) {
  const state = emptyState();
  if (!isObj(raw) || !isObj(raw.lists)) return state;
  for (const [listId, list] of Object.entries(raw.lists)) {
    if (!isObj(list)) continue;
    const out = {};
    if (isObj(list.checked)) {
      out.checked = {};
      for (const [id, v] of Object.entries(list.checked)) if (v === true) out.checked[id] = true;
    }
    if (isObj(list.tasks)) {
      out.tasks = {};
      for (const [id, t] of Object.entries(list.tasks)) {
        if (!isObj(t)) continue;
        out.tasks[id] = {
          status: STATUS_CODES.has(t.status) ? t.status : DEFAULT_STATUS,
          note: str(t.note),
          text: str(t.text, 500),
          updatedAt: str(t.updatedAt, 40),
        };
      }
    }
    if (Array.isArray(list.custom)) {
      out.custom = list.custom
        .filter((c) => isObj(c) && typeof c.id === 'string' && str(c.text).trim())
        .map((c) => ({
          id: c.id.slice(0, 80),
          text: str(c.text, 500),
          when: str(c.when, 200),
          status: STATUS_CODES.has(c.status) ? c.status : DEFAULT_STATUS,
          note: str(c.note),
          createdAt: str(c.createdAt, 40),
        }));
    }
    state.lists[listId] = out;
  }
  return state;
}

// מעבר בין גרסאות סכימה. כרגע יש רק גרסה 1; גרסאות עתידיות יוסיפו כאן שלבים.
export function migrate(raw) {
  if (!isObj(raw)) return { state: emptyState(), readOnly: false };
  const v = Number(raw.version) || 0;
  if (v > SCHEMA_VERSION) return { state: sanitize(raw), readOnly: true };
  // if (v < 2) { ...המרה לגרסה 2... }
  return { state: sanitize(raw), readOnly: false };
}

// קורא את הטקסט השמור. מחזיר גם האם הנתונים היו פגומים.
export function parseStored(text) {
  if (text == null || text === '') return { state: emptyState(), corrupt: false, readOnly: false };
  try {
    const { state, readOnly } = migrate(JSON.parse(text));
    return { state, corrupt: false, readOnly };
  } catch {
    return { state: emptyState(), corrupt: true, readOnly: false };
  }
}

// ---------- פעולות על המצב (מחזירות מצב חדש) ----------
const now = () => new Date().toISOString();
function listOf(state, listId) {
  return state.lists[listId] || {};
}
function withList(state, listId, list) {
  return { ...state, lists: { ...state.lists, [listId]: list } };
}

export function isChecked(state, listId, itemId) {
  return !!listOf(state, listId).checked?.[itemId];
}
export function setChecked(state, listId, itemId, value) {
  const list = listOf(state, listId);
  const checked = { ...(list.checked || {}) };
  if (value) checked[itemId] = true;
  else delete checked[itemId];
  return withList(state, listId, { ...list, checked });
}
export function clearList(state, listId) {
  const lists = { ...state.lists };
  delete lists[listId];
  return { ...state, lists };
}

export function getTask(state, listId, taskId) {
  const t = listOf(state, listId).tasks?.[taskId];
  return { status: t?.status || DEFAULT_STATUS, note: t?.note || '' };
}
export function setTask(state, listId, task, patch) {
  const list = listOf(state, listId);
  const prev = list.tasks?.[task.id] || { status: DEFAULT_STATUS, note: '' };
  const next = { ...prev, ...patch, text: task.text, updatedAt: now() };
  return withList(state, listId, { ...list, tasks: { ...(list.tasks || {}), [task.id]: next } });
}

export function customTasks(state, listId) {
  return listOf(state, listId).custom || [];
}
export function newCustomId() {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}
export function addCustom(state, listId, { text, when }, id = newCustomId()) {
  const list = listOf(state, listId);
  const item = { id, text: text.trim(), when: (when || '').trim(), status: DEFAULT_STATUS, note: '', createdAt: now() };
  return withList(state, listId, { ...list, custom: [...(list.custom || []), item] });
}
export function updateCustom(state, listId, id, patch) {
  const list = listOf(state, listId);
  return withList(state, listId, {
    ...list,
    custom: (list.custom || []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}
export function removeCustom(state, listId, id) {
  const list = listOf(state, listId);
  return withList(state, listId, { ...list, custom: (list.custom || []).filter((c) => c.id !== id) });
}

// רשומות שנשמרו למשימות שכבר לא מופיעות ברשימה (למשל אחרי עדכון של האתר).
// מוחזרות רק אם יש בהן מידע של המשתמש.
export function orphanTasks(state, listId, knownIds) {
  const known = new Set(knownIds);
  return Object.entries(listOf(state, listId).tasks || {})
    .filter(([id, t]) => !known.has(id) && (t.note || t.status !== DEFAULT_STATUS))
    .map(([id, t]) => ({ id, ...t }));
}

// ---------- ייצוא, גיבוי ושחזור ----------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows) {
  const header = ['משימה', 'מתי כדאי לבדוק?', 'סטטוס', 'הערות', 'מקור'];
  const lines = [header, ...rows.map((r) => [r.text, r.when, statusLabel(r.status), r.note, r.source])];
  // BOM כדי ש-Excel יציג עברית נכון
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function toBackup(state) {
  return JSON.stringify({ app: 'shelo-tedu', exportedAt: now(), ...state }, null, 2);
}

export function fromBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('הקובץ שנבחר אינו קובץ גיבוי תקין.');
  }
  if (!isObj(raw) || raw.app !== 'shelo-tedu' || !isObj(raw.lists)) {
    throw new Error('הקובץ שנבחר אינו קובץ גיבוי של האתר הזה.');
  }
  const { state, readOnly } = migrate(raw);
  if (readOnly) throw new Error('קובץ הגיבוי נוצר בגרסה חדשה יותר של האתר. רעננו את העמוד ונסו שוב.');
  return state;
}

// ---------- גישה ל-localStorage ----------
// storage: אובייקט בממשק של localStorage (מוזרק כדי שאפשר יהיה לבדוק).
export function createStore(storage) {
  let available = false;
  try {
    const probe = STORAGE_KEY + ':probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }

  function load() {
    if (!available) return { state: emptyState(), corrupt: false, readOnly: false };
    let text = null;
    try {
      text = storage.getItem(STORAGE_KEY);
    } catch {
      return { state: emptyState(), corrupt: false, readOnly: false };
    }
    const result = parseStored(text);
    if (result.corrupt) {
      // לא מוחקים: שומרים עותק של מה שהיה, לטיפול ידני אם צריך.
      try { storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, text); } catch { /* אין מקום */ }
    }
    return result;
  }

  function save(state) {
    if (!available) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SCHEMA_VERSION }));
      return true;
    } catch {
      return false;
    }
  }

  return { get available() { return available; }, load, save };
}
