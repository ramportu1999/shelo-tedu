// ניווט צדדי: מסמן בתוכן העניינים שבצד את הסעיף שקוראים עכשיו,
// וסוגר את תפריט הנייד בלחיצה על Escape או מחוץ לתפריט.

const tocLinks = [...document.querySelectorAll('.sidebar .sidenav-toc a')];
const targets = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));

function markCurrent() {
  let current = -1;
  targets.forEach((t, i) => {
    if (t && t.getBoundingClientRect().top < 140) current = i;
  });
  tocLinks.forEach((a, i) => {
    if (i === current) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
}

if (tocLinks.length) {
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; markCurrent(); });
  }, { passive: true });
  markCurrent();
}

const menu = document.querySelector('details.menu');
if (menu) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
}
