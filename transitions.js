// transitions.js
const linkSelector = 'a[href^="/"]:not([target]):not([data-no-ajax])';
const containerSelector = '.content-wrapper';

async function transitionTo(path, { push = true } = {}) {
  const contentEl = document.querySelector(containerSelector);
  if (!contentEl) { location.href = path; return; }
  if (location.pathname === path) return;

  // animate out
  contentEl.classList.add('page-exit');
  await new Promise(r => setTimeout(r, 250));

  try {
    const res = await fetch(path, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('fetch-fail');
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newContent = doc.querySelector(containerSelector);
    if (!newContent) { location.href = path; return; }

    // replace content
    contentEl.innerHTML = newContent.innerHTML;

    // update title
    document.title = doc.title;

    // update active nav/chip
    document.querySelectorAll('.chip').forEach(c => {
      const href = c.getAttribute('href') || c.dataset.route;
      if (!href) return;
      const normalized = href.replace(/\/+$/, '');
      const target = path.replace(/\/+$/, '');
      if (normalized === target || (`/${normalized}`) === target) {
        c.classList.add('active');
        c.setAttribute('aria-current', 'page');
      } else {
        c.classList.remove('active');
        c.removeAttribute('aria-current');
      }
    });

    if (push) history.pushState({}, '', path);
    // animate in
    contentEl.classList.remove('page-exit');
    contentEl.classList.add('page-enter');
    requestAnimationFrame(() => {
      contentEl.classList.add('page-enter-active');
    });
    setTimeout(() => {
      contentEl.classList.remove('page-enter', 'page-enter-active');
    }, 300);
  } catch (e) {
    location.href = path; // fallback pełne przejście
  }
}

function attachLinkHandlers() {
  document.querySelectorAll(linkSelector).forEach(a => {
    if (a._ajaxBound) return;
    a._ajaxBound = true;
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (!href.startsWith('/')) return; // zewnętrzne
      e.preventDefault();
      transitionTo(href);
    });

    // prefetch on hover
    let prefetching = false;
    a.addEventListener('mouseover', () => {
      const href = a.getAttribute('href');
      if (!href.startsWith('/') || prefetching) return;
      prefetching = true;
      fetch(href, { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .finally(() => { prefetching = false; });
    });
  });
}

window.addEventListener('popstate', () => {
  transitionTo(location.pathname, { push: false });
});

document.addEventListener('DOMContentLoaded', () => {
  attachLinkHandlers();
  // delegate for dynamic content replacement
  const observer = new MutationObserver(() => attachLinkHandlers());
  observer.observe(document.body, { childList: true, subtree: true });
});
