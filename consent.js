(function(){
  const existing = document.getElementById('cookieBanner');
  function createBanner(){
    const banner = document.createElement('div');
    banner.id='cookieBanner';
    banner.setAttribute('aria-label','Informacja o ciasteczkach');
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(20,24,35,.95);color:#f0f4ff;padding:16px 24px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:14px;z-index:9998;border-top:1px solid rgba(255,255,255,.08);';
    banner.innerHTML = `
      <div class="text" style="flex:1;min-width:220px;">
        Ta strona używa Google AdSense, który może korzystać z plików cookie do personalizacji reklam. Możesz zaakceptować reklamy personalizowane albo tylko podstawowe (bez personalizacji). Szczegóły w <a href="/privacy.html" style="color:#cce0ff;text-decoration:underline;">Polityce prywatności</a>.
      </div>
      <div style="display:flex; gap:8px;flex-wrap:wrap;">
        <button id="acceptPersonalized" style="padding:8px 16px;border-radius:999px;border:none;cursor:pointer;font-weight:600;background:linear-gradient(180deg,hsl(195 100% 50%/.9),hsl(280 100% 70%/.75));color:white;">Akceptuję personalizowane</button>
        <button id="acceptNonPersonalized" style="padding:8px 16px;border-radius:999px;border:none;cursor:pointer;font-weight:600;background:rgba(255,255,255,.08);color:white;">Tylko podstawowe</button>
        <button id="closeBanner" style="padding:8px 16px;border-radius:999px;border:none;cursor:pointer;font-weight:600;background:rgba(255,255,255,.08);color:white;margin-left:4px;">Zamknij</button>
      </div>
    `;
    document.body.appendChild(banner);
    return banner;
  }

  function loadAdSense(nonPersonalized=false){
    if(window._adsLoaded) return;
    window._adsLoaded = true;
    if(nonPersonalized){
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.requestNonPersonalizedAds = 1;
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1712836182508924";
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
  }

  function applyConsent(consent){
    if(consent === 'personalized'){
      loadAdSense(false);
    } else if(consent === 'non_personalized'){
      loadAdSense(true);
    }
    localStorage.setItem('ft_cookie_consent', consent);
    const banner = document.getElementById('cookieBanner');
    if(banner) banner.style.display='none';
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    let banner = existing || document.getElementById('cookieBanner');
    if(!banner){
      banner = createBanner();
    }
    document.getElementById('acceptPersonalized').addEventListener('click', ()=> applyConsent('personalized'));
    document.getElementById('acceptNonPersonalized').addEventListener('click', ()=> applyConsent('non_personalized'));
    document.getElementById('closeBanner').addEventListener('click', ()=>{
      if(banner) banner.style.display='none';
      setTimeout(()=> loadAdSense(false),300);
    });
    const saved = localStorage.getItem('ft_cookie_consent');
    if(saved){
      applyConsent(saved);
    }
  });
})();
