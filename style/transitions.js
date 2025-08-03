// Prosty loader partiali z aktualizacją historii i dispatchowaniem eventu
const contentWrapperSelector = '.content-wrapper';
const navSelector = '.chip';

async function fetchPartial(url) {
  try {
    const res = await fetch(url, {cache: 'no-cache'});
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const text = await res.text();
    return text;
  } catch (e) {
    console.error('Błąd ładowania partiala:', e);
    return null;
  }
}

function setActiveNav(url) {
  document.querySelectorAll(navSelector).forEach(el => {
    const href = el.getAttribute('href') || '';
    // porównaj końcówki (np. about.html vs /style/pages/about.html)
    if (url.endsWith(href) || href.endsWith(url) || (href && url.includes(href))) {
      el.classList.add('active');
      el.setAttribute('aria-current','page');
    } else {
      el.classList.remove('active');
      el.removeAttribute('aria-current');
    }
  });
}

async function transitionTo(url, replace=false) {
  const contentEl = document.querySelector(contentWrapperSelector);
  if(!contentEl) return;
  const html = await fetchPartial(url);
  if(!html){
    contentEl.innerHTML = `<div style="padding:30px;color:#fff;">Nie udało się załadować strony. Spróbuj ponownie później.</div>`;
    return;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Wstaw tylko <body> zawartość (z pominięciem <head>)
  contentEl.innerHTML = doc.body.innerHTML;

  // Zaktualizuj tytuł dokumentu jeśli jest
  const titleEl = doc.querySelector('title');
  if(titleEl) document.title = titleEl.textContent;

  // Aktualizuj aktywne przyciski nawigacji
  setActiveNav(url);

  // Historia
  if (replace) {
    history.replaceState({url}, '', mapToPrettyUrl(url));
  } else {
    history.pushState({url}, '', mapToPrettyUrl(url));
  }

  // Sygnalizuj innym skryptom, że partial się załadował
  window.dispatchEvent(new Event('partial:loaded'));
}

// Z mapowaniem path do czytelnego dla użytkownika (np. /style/pages/about.html → /about.html)
function mapToPrettyUrl(partialUrl){
  if (partialUrl.endsWith('home.html')) return '/';
  if (partialUrl.endsWith('about.html')) return '/about.html';
  if (partialUrl.endsWith('security.html')) return '/security.html';
  return partialUrl;
}

function resolvePartialFromPath(pathname){
  if(pathname === '/' || pathname.endsWith('index.html')) return '/style/pages/home.html';
  if(pathname.endsWith('about.html')) return '/style/pages/about.html';
  if(pathname.endsWith('security.html')) return '/style/pages/security.html';
  return '/style/pages/home.html';
}

// podpięcie eventów
window.addEventListener('DOMContentLoaded', () => {
  // na kliknięcia w navy
  document.querySelectorAll(navSelector).forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const href = el.getAttribute('href');
      if (!href) return;
      transitionTo(href);
    });
  });

  // obsługa back/forward
  window.addEventListener('popstate', e => {
    const state = e.state;
    const url = state?.url || resolvePartialFromPath(window.location.pathname);
    transitionTo(url, true);
  });

  // początkowe załadowanie
  const initial = resolvePartialFromPath(window.location.pathname);
  transitionTo(initial, true);
});
