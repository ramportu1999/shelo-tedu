// הממשק של הצ׳קליסטים. הנתונים נשמרים רק בדפדפן (ראו store.js).
import * as S from './store.js';

const SIDDURIM = 'siddurim';
const PRIVACY_HREF = '../havhara/#פרטיות';

let store;
let state;
let readOnly = false;
let storageProblem = null; // 'unavailable' | 'corrupt' | 'readOnly' | 'saveFailed'

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };
  }
}

function init() {
  store = S.createStore(safeLocalStorage());
  const loaded = store.load();
  state = loaded.state;
  readOnly = loaded.readOnly;
  if (!store.available) storageProblem = 'unavailable';
  else if (loaded.corrupt) storageProblem = 'corrupt';
  else if (readOnly) storageProblem = 'readOnly';

  document.querySelectorAll('[data-checklist]').forEach(initSimpleChecklist);
  const app = document.getElementById('tasks-app');
  if (app) initTasks(app);

  window.addEventListener('storage', (e) => {
    if (e.key !== S.STORAGE_KEY) return;
    state = store.load().state;
    document.querySelectorAll('[data-checklist]').forEach(syncSimpleChecklist);
    if (app) renderTasks();
  });
}

function commit(next) {
  state = next;
  if (readOnly) return;
  if (!store.save(state) && store.available) {
    storageProblem = 'saveFailed';
    showStorageProblem();
  }
}

// ---------- עזרי DOM ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

let liveRegion;
function announce(msg) {
  if (!liveRegion) return;
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 50);
}

function problemText() {
  switch (storageProblem) {
    case 'unavailable':
      return 'לא ניתן לשמור את ההתקדמות בדפדפן הזה (ייתכן ששמירת נתונים חסומה בו). אפשר להשתמש ברשימה ולייצא אותה לקובץ, אבל אחרי סגירת העמוד השינויים לא יישמרו.';
    case 'corrupt':
      return 'הנתונים השמורים בדפדפן לא נקראו כראוי, ולכן הרשימה מוצגת מההתחלה. עותק של הנתונים הקודמים נשמר בדפדפן ולא נמחק.';
    case 'readOnly':
      return 'נמצאו נתונים שנשמרו בגרסה חדשה יותר של האתר. כדי לא לפגוע בהם, שינויים בעמוד הזה לא יישמרו. רעננו את העמוד.';
    case 'saveFailed':
      return 'השמירה האחרונה לא הצליחה (ייתכן שאין מקום פנוי בדפדפן). כדאי לשמור קובץ גיבוי.';
    default:
      return '';
  }
}
function showStorageProblem() {
  document.querySelectorAll('[data-storage-problem]').forEach((el) => {
    el.textContent = problemText();
    el.hidden = !storageProblem;
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- צ׳קליסטים קצרים ----------
function syncSimpleChecklist(section) {
  const listId = section.dataset.checklist;
  section.querySelectorAll('input[data-item]').forEach((input) => {
    input.checked = S.isChecked(state, listId, input.dataset.item);
  });
}

function initSimpleChecklist(section) {
  const listId = section.dataset.checklist;
  syncSimpleChecklist(section);
  section.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-item]');
    if (!input) return;
    commit(S.setChecked(state, listId, input.dataset.item, input.checked));
  });

  const footer = section.querySelector('[data-enhance]');
  if (!footer) return;
  const note = store.available
    ? h('p', {}, 'הסימונים נשמרים בדפדפן הזה בלבד. ', h('a', { href: PRIVACY_HREF }, 'מה זה אומר?'))
    : h('p', {}, 'לא ניתן לשמור את הסימונים בדפדפן הזה.');
  const clear = h(
    'button',
    {
      type: 'button',
      class: 'button-quiet',
      onclick: () => {
        if (!confirm('לנקות את כל הסימונים ברשימה הזו?')) return;
        commit(S.clearList(state, listId));
        syncSimpleChecklist(section);
      },
    },
    'ניקוי הסימונים',
  );
  footer.append(note, clear);
  footer.hidden = false;
}

// ---------- צ׳קליסט הבירוקרטיה ----------
let data;
let ui = {};
let filter = 'all';
let sort = 'recommended';
const statusOrder = Object.fromEntries(S.STATUSES.map((s, i) => [s.code, i]));

function allRows() {
  const base = data.tasks.map((t, i) => ({ kind: 'task', ...t, order: i, ...S.getTask(state, SIDDURIM, t.id) }));
  const custom = S.customTasks(state, SIDDURIM).map((c, i) => ({
    kind: 'custom', id: c.id, text: c.text, when: c.when, group: 4, order: 1000 + i, status: c.status, note: c.note,
  }));
  return [...base, ...custom];
}

function visibleRows() {
  let rows = allRows();
  if (filter === 'open') rows = rows.filter((r) => r.status !== 'done' && r.status !== 'na');
  else if (filter !== 'all') rows = rows.filter((r) => r.status === filter);
  if (sort === 'status') rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.order - b.order);
  return rows;
}

function initTasks(app) {
  data = JSON.parse(document.getElementById('tasks-data').textContent);
  const staticList = document.querySelector('.task-list-static');

  liveRegion = h('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  const filterSelect = h(
    'select',
    { id: 'tasks-filter', onchange: (e) => { filter = e.target.value; renderTasks(); } },
    h('option', { value: 'all' }, 'כל המשימות'),
    h('option', { value: 'open' }, 'משימות פתוחות (לא הושלמו ולא סומנו כלא רלוונטיות)'),
    S.STATUSES.map((s) => h('option', { value: s.code }, s.label)),
  );
  const sortSelect = h(
    'select',
    { id: 'tasks-sort', onchange: (e) => { sort = e.target.value; renderTasks(); } },
    h('option', { value: 'recommended' }, 'הסדר המומלץ'),
    h('option', { value: 'status' }, 'לפי סטטוס'),
  );

  ui.progress = h('p', { class: 'progress' });
  ui.list = h('ol', { class: 'task-list', role: 'list' });
  ui.empty = h('p', { class: 'empty', hidden: true }, 'אין משימות שמתאימות לסינון הזה.');
  ui.orphans = h('div');

  const panel = h(
    'div',
    { class: 'tasks-panel' },
    h(
      'p',
      { class: 'storage-note' },
      'ההתקדמות נשמרת רק בדפדפן הזה ובמכשיר הזה, ולא נשלחת לשום מקום. היא לא עוברת בין מכשירים, וניקוי נתוני הגלישה או גלישה בחלון פרטי עלולים למחוק אותה. כדאי לשמור מדי פעם קובץ גיבוי. ',
      h('a', { href: PRIVACY_HREF }, 'עוד על השמירה'),
    ),
    h('p', { class: 'notice', 'data-storage-problem': true, hidden: true }),
    ui.progress,
    h(
      'div',
      { class: 'controls' },
      h('label', { class: 'field', for: 'tasks-filter' }, h('span', {}, 'הצגה'), filterSelect),
      h('label', { class: 'field', for: 'tasks-sort' }, h('span', {}, 'סדר'), sortSelect),
    ),
  );

  const textInput = h('input', { type: 'text', id: 'new-task-text', required: true, maxlength: '300', autocomplete: 'off' });
  const whenInput = h('input', { type: 'text', id: 'new-task-when', maxlength: '100', autocomplete: 'off' });
  const addForm = h(
    'form',
    {
      class: 'tasks-panel add-task',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const text = textInput.value.trim();
        if (!text) {
          textInput.setAttribute('aria-invalid', 'true');
          textInput.focus();
          announce('כדי להוסיף משימה צריך לכתוב מה המשימה.');
          return;
        }
        textInput.removeAttribute('aria-invalid');
        commit(S.addCustom(state, SIDDURIM, { text, when: whenInput.value }));
        textInput.value = '';
        whenInput.value = '';
        if (filter !== 'all' && filter !== 'open' && filter !== 'todo') {
          filter = 'all';
          filterSelect.value = 'all';
        }
        renderTasks();
        announce(`המשימה "${text}" נוספה לסוף הרשימה.`);
      },
    },
    h('h3', {}, 'הוספת משימה משלכם'),
    h('label', { class: 'field', for: 'new-task-text' }, h('span', {}, 'משימה'), textInput),
    h('label', { class: 'field', for: 'new-task-when' }, h('span', {}, 'מתי כדאי לבדוק? (לא חובה)'), whenInput),
    h('button', { type: 'submit', class: 'button-primary' }, 'הוספה לרשימה'),
  );

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    'aria-label': 'שחזור מקובץ גיבוי',
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const restored = S.fromBackup(await file.text());
        if (!confirm('השחזור יחליף את כל ההתקדמות השמורה כרגע בדפדפן הזה בתוכן של קובץ הגיבוי. להמשיך?')) return;
        commit(restored);
        document.querySelectorAll('[data-checklist]').forEach(syncSimpleChecklist);
        renderTasks();
        announce('ההתקדמות שוחזרה מקובץ הגיבוי.');
        alert('ההתקדמות שוחזרה מקובץ הגיבוי.');
      } catch (err) {
        alert(err.message);
      }
    },
  });

  const backup = h(
    'div',
    { class: 'tasks-panel no-print' },
    h('h3', {}, 'שמירה, גיבוי והדפסה'),
    h(
      'div',
      { class: 'backup-actions' },
      h('button', { type: 'button', onclick: exportCSV }, 'ייצוא לקובץ CSV (לאקסל)'),
      h('button', { type: 'button', onclick: () => download(`shelo-tedu-backup-${today()}.json`, S.toBackup(state), 'application/json') }, 'שמירת קובץ גיבוי'),
      h('label', { class: 'button' }, 'שחזור מקובץ גיבוי', fileInput),
      h('button', { type: 'button', onclick: printTasks }, 'הדפסה'),
      h(
        'button',
        {
          type: 'button',
          class: 'button-danger',
          onclick: () => {
            if (!confirm('למחוק את כל הסטטוסים, ההערות והמשימות שהוספתם ברשימה הזו? אי אפשר לבטל את הפעולה, ולכן כדאי לשמור קודם קובץ גיבוי.')) return;
            commit(S.clearList(state, SIDDURIM));
            renderTasks();
            announce('ההתקדמות ברשימה נמחקה.');
          },
        },
        'מחיקת ההתקדמות ברשימה',
      ),
    ),
  );

  app.append(liveRegion, panel, ui.list, ui.empty, ui.orphans, addForm, backup);
  staticList.hidden = true;
  document.querySelectorAll('[data-nojs]').forEach((el) => el.remove());
  app.hidden = false;
  showStorageProblem();
  renderTasks();
}

function updateProgress() {
  const rows = allRows();
  const done = rows.filter((r) => r.status === 'done').length;
  const na = rows.filter((r) => r.status === 'na').length;
  ui.progress.textContent = `הושלמו ${done} מתוך ${rows.length} משימות` + (na ? ` · ${na} סומנו כלא רלוונטיות` : '');
}

function renderTasks() {
  const rows = visibleRows();
  ui.list.replaceChildren(...rows.map(taskCard));
  ui.empty.hidden = rows.length > 0;
  updateProgress();
  renderOrphans();
}

function taskCard(row) {
  const textId = `task-${row.id}-text`;
  const statusPrint = h('p', { class: 'print-only' }, `סטטוס: ${S.statusLabel(row.status)}`);
  const notePrint = h('p', { class: 'print-only' }, row.note ? `הערות: ${row.note}` : '');
  const card = h('li', { class: 'task-card', 'data-status': row.status, 'data-id': row.id });

  const save = (patch) => {
    if (row.kind === 'task') commit(S.setTask(state, SIDDURIM, { id: row.id, text: row.text }, patch));
    else commit(S.updateCustom(state, SIDDURIM, row.id, patch));
  };

  const select = h(
    'select',
    {
      'aria-describedby': textId,
      onchange: (e) => {
        const status = e.target.value;
        save({ status });
        card.dataset.status = status;
        statusPrint.textContent = `סטטוס: ${S.statusLabel(status)}`;
        updateProgress();
        announce(`הסטטוס עודכן ל"${S.statusLabel(status)}" ונשמר.`);
      },
    },
    S.STATUSES.map((s) => h('option', { value: s.code, selected: s.code === row.status }, s.label)),
  );

  let timer;
  let dirty = false;
  const textarea = h('textarea', {
    rows: 1,
    maxlength: '5000',
    'aria-describedby': textId,
    oninput: (e) => {
      dirty = true;
      const note = e.target.value;
      notePrint.textContent = note ? `הערות: ${note}` : '';
      clearTimeout(timer);
      timer = setTimeout(() => save({ note }), 400);
    },
    onchange: (e) => {
      clearTimeout(timer);
      save({ note: e.target.value });
      if (dirty) announce('ההערה נשמרה.');
      dirty = false;
    },
  });
  textarea.value = row.note;

  const parts = [
    h('p', { class: 'task-text', id: textId }, row.text, row.kind === 'custom' ? h('span', { class: 'tag' }, 'משימה שלי') : null),
    row.when ? h('p', { class: 'task-when' }, h('span', { class: 'label' }, 'מתי כדאי לבדוק?'), ' ', row.when) : null,
    h(
      'div',
      { class: 'task-fields' },
      h('label', { class: 'field' }, h('span', {}, 'סטטוס'), select),
      h('label', { class: 'field' }, h('span', {}, 'הערות'), textarea),
    ),
    statusPrint,
    notePrint,
    row.kind === 'custom'
      ? h(
          'div',
          { class: 'task-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'button-quiet',
              onclick: () => {
                if (!confirm(`למחוק את המשימה "${row.text}"? אי אפשר לבטל את הפעולה.`)) return;
                commit(S.removeCustom(state, SIDDURIM, row.id));
                renderTasks();
                announce('המשימה נמחקה.');
              },
            },
            'מחיקת המשימה',
          ),
        )
      : null,
  ];
  card.append(...parts.filter(Boolean));
  return card;
}

function renderOrphans() {
  const orphans = S.orphanTasks(state, SIDDURIM, data.tasks.map((t) => t.id));
  if (!orphans.length) {
    ui.orphans.replaceChildren();
    return;
  }
  ui.orphans.replaceChildren(
    h(
      'section',
      { class: 'tasks-panel' },
      h('h3', {}, 'משימות ששמרתם בעבר ושכבר לא מופיעות ברשימה'),
      h('p', { class: 'storage-note' }, 'הרשימה באתר עודכנה, אבל מה ששמרתם לא נמחק. המשימות האלה נכללות גם בייצוא ובגיבוי.'),
      h(
        'ul',
        { class: 'task-list', role: 'list' },
        orphans.map((o) =>
          h(
            'li',
            { class: 'task-card', 'data-status': o.status },
            h('p', { class: 'task-text' }, o.text || o.id),
            h('p', { class: 'task-when' }, `סטטוס: ${S.statusLabel(o.status)}`),
            o.note ? h('p', {}, `הערות: ${o.note}`) : null,
          ),
        ),
      ),
    ),
  );
}

// הדפסה של הצ׳קליסט בלבד (Ctrl+P רגיל מדפיס את כל העמוד)
function printTasks() {
  const tasks = document.getElementById('tasks');
  if (!document.querySelector('.print-heading')) {
    const title = document.querySelector('h1')?.textContent || '';
    tasks.before(h('p', { class: 'print-heading print-only' }, `צ׳קליסט מעקב · ${title}`));
  }
  document.body.classList.add('print-tasks');
  const done = () => {
    document.body.classList.remove('print-tasks');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function exportCSV() {
  const rows = allRows().map((r) => ({ ...r, source: r.kind === 'custom' ? 'משימה שלי' : 'מהרשימה באתר' }));
  const orphans = S.orphanTasks(state, SIDDURIM, data.tasks.map((t) => t.id)).map((o) => ({
    text: o.text || o.id, when: '', status: o.status, note: o.note, source: 'הוסרה מהרשימה באתר',
  }));
  download(`shelo-tedu-tasks-${today()}.csv`, S.toCSV([...rows, ...orphans]), 'text/csv;charset=utf-8');
  announce('קובץ ה-CSV נוצר.');
}

init();
