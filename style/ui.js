// Zarządza routingiem, ładowaniem partiali i podświetleniem navów
const routes = ['home','about','security'];
const pageCache = {};
const chips = Array.from(document.querySelectorAll('.chip'));

function setActiveNav(route){
  chips.forEach(c => {
    if(c.getAttribute('data-route') === route){
      c.classList.add('active');
      c.setAttribute('aria-current','page');
    } else {
      c.classList.remove('active');
      c.removeAttribute('aria-current');
    }
  });
}

async function loadPageFragment(name){
  if(pageCache[name]) return pageCache[name];
  try{
    const resp = await fetch(`style/pages/${name}.html`);
    if(!resp.ok) throw new Error('Nie załadowano');
    const text = await resp.text();
    pageCache[name] = text;
    return text;
  }catch(e){
    return `<div class="panel"><p>Nie można załadować strony ${name}.</p></div>`;
  }
}

async function navigate(route){
  if(!routes.includes(route)) route='home';
  // wstrzyknięcie
  const container = document.getElementById(`page-${route}`);
  if(container){
    const html = await loadPageFragment(route);
    container.innerHTML = html;
  }
  // aktywacja klasy
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${route}`));
  setActiveNav(route);
  // custom event żeby core.js wiedział (np. inicjalizacja)
  window.dispatchEvent(new CustomEvent('page-changed', {detail: route}));
  // update history
  history.replaceState({}, '', '#'+route);
}

// kliknięcia w nav
chips.forEach(ch => {
  ch.addEventListener('click', e => {
    e.preventDefault();
    const route = ch.getAttribute('data-route');
    navigate(route);
  });
});

// obsługa back/forward
window.addEventListener('popstate', ()=>{
  const route = (location.hash||'#home').slice(1);
  navigate(route);
});

// inicjalizacja z startowym hashem
navigate((location.hash||'#home').slice(1));

// eksport do użycia w core.js jeśli potrzeba
export { navigate, setActiveNav };
