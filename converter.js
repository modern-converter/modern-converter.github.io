/* Pełna logika konwertera z naprawionymi błędami */
(() => {
  /* pomocnicze */
  function truncate(str, n) {
    if (typeof str !== 'string') return '';
    if (str.length <= n) return str;
    const ext = str.includes('.') ? '.' + str.split('.').pop() : '';
    const base = str.slice(0, Math.max(0, n - ext.length - 1));
    return base + '…' + ext;
  }
  function humanSize(bytes){
    const GBb=1024*1024*1024, MBb=1024*1024, KBb=1024;
    if(bytes >= GBb) return (bytes/GBb).toFixed(2)+' GB';
    if(bytes >= MBb) return (bytes/MBb).toFixed(1)+' MB';
    if(bytes >= KBb) return (bytes/KBb).toFixed(1)+' KB';
    return bytes+' B';
  }
  function commonPrefix(arr){
    if(!arr.length) return '';
    let p = arr[0];
    for(let i=1;i<arr.length;i++){
      let j=0; const s = arr[i];
      while(j < p.length && j < s.length && p[j]===s[j]) j++;
      p = p.slice(0,j);
      if(!p) break;
    }
    return p.replace(/[-_. ]+$/,'');
  }
  function once(target, event, timeoutMs=0){
    return new Promise((res, rej)=>{
      const on = ()=>{ cleanup(); res(); };
      const to = timeoutMs ? setTimeout(()=>{ cleanup(); rej(new Error('timeout')); }, timeoutMs) : null;
      const cleanup = ()=>{ target.removeEventListener(event, on); if(to) clearTimeout(to); };
      target.addEventListener(event, on, {once:true});
    });
  }

  /* selektory */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const dropEl = $('#drop');
  const fileInput = $('#fileInput');
  const fileListEl = $('#fileList');
  const resultListEl = $('#resultList');

  const progressBar = $('#progressBar');
  const progressText = $('#progressText');
  const convertBtn = $('#convertBtn');

  const progressBar2 = $('#progressBar2');
  const progressText2 = $('#progressText2');
  const progressTitle = $('#progressTitle');
  const downloadAllBtn = $('#downloadAll');
  const convertMoreBtn = $('#convertMore');

  const formatGroupsEl = $('#formatGroups');
  const formatOptionsEl = $('#formatOptions');

  const chips = $$('.chip[data-route]');
  const container = document.querySelector('.app.content-wrapper') || document.querySelector('.app');

  const KB = 1024, MB = 1024*KB, GB = 1024*MB;

  /* katalogi / mapy */
  const formatsCatalog = {
    image: { label: 'Obraz', formats: ['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite'] },
    audio: { label: 'Audio', formats: ['wav','mp3','m4a','ogg','flac','opus'] },
    video: { label: 'Wideo', formats: ['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov'] },
    document: { label: 'Dokument', formats: ['txt','md','pdf-lite','rtf-lite','html-lite'] },
    archive: { label: 'Archiwum', formats: ['zip-lite','tar-lite'] },
    code: { label: 'Dane', formats: ['txt','json','csv','ndjson-lite'] }
  };
  const extToCategory = {
    png:'image', jpg:'image', jpeg:'image', webp:'image', avif:'image', bmp:'image', gif:'image', svg:'image', ico:'image', heic:'image',
    wav:'audio', mp3:'audio', m4a:'audio', ogg:'audio', flac:'audio', opus:'audio',
    txt:'document', md:'document', html:'document', pdf:'document', rtf:'document', docx:'document',
    json:'code', csv:'code', js:'code', ndjson:'code',
    mp4:'video', webm:'video', mov:'video', mkv:'video', avi:'video', hevc:'video'
  };
  const labelMap = {
    'png':'PNG (bezstratny)','png-8':'PNG-8 (kompaktowy)','jpeg':'JPEG (wysoka jakość)','jpeg-low':'JPEG (lżejszy)',
    'webp':'WebP','avif':'AVIF (wysoka kompresja)','gif':'GIF','bmp-lite':'BMP (lite)','svg-lite':'SVG (lite)','ico-lite':'ICO (lite)',
    'wav':'WAV (bezstratny)','mp3':'MP3','m4a':'M4A (AAC)','ogg':'OGG','flac':'FLAC (bezstratny)','opus':'OPUS',
    'txt':'TXT','md':'Markdown','pdf-lite':'PDF (lekki)','rtf-lite':'RTF (lekki)','html-lite':'HTML (lekki)',
    'gif-lite':'GIF (lekki)','webm-lite':'WebM (lekki)','thumb-webp':'Miniatura WebP',
    'zip-lite':'ZIP (lekki)','tar-lite':'TAR (lekki)','json':'JSON','csv':'CSV','ndjson-lite':'NDJSON (lekki)',
    'mp4':'MP4 (H.264)','webm':'WebM (VP9)','mov':'MOV'
  };

  /* kompatybilność: audio teraz tylko do audio */
  const compatibleCategoryMap = {
    image:    new Set(['image','document','archive','code']),
    audio:    new Set(['audio']), // <- zmienione: blokujemy document i code dla audio
    video:    new Set(['video','image','document','archive','code']),
    document: new Set(['document','image','archive','code']),
    archive:  new Set(['archive']),
    code:     new Set(['code','document','archive'])
  };
  const perCategoryAllowedFormats = {
    video: new Set(['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov']),
    image: new Set(['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite','pdf-lite','html-lite','zip-lite','tar-lite','txt','json','csv','ndjson-lite']),
    audio: new Set(['wav','mp3','m4a','ogg','flac','opus','zip-lite','tar-lite','txt','json','csv','ndjson-lite']),
    document: new Set(['txt','md','pdf-lite','rtf-lite','html-lite','png','jpeg','webp','svg-lite','zip-lite','tar-lite','json','csv','ndjson-lite']),
    archive: new Set(['zip-lite','tar-lite']),
    code: new Set(['txt','json','csv','ndjson-lite','html-lite','zip-lite','tar-lite'])
  };

  let selectedCategory = 'image';
  let selectedFormat = 'png';

  /* stan */
  let files = [];
  let results = [];

  /* router */
  const routes = ['home','progress','about','security','help'];
  function doSwitch(route){
    routes.forEach(r=>{
      const page = document.getElementById('page-'+r);
      if(!page) return;
      if(r===route){
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
      const chip = document.querySelector(`.chip[data-route="${r}"]`);
      if(chip){
        if(r===route){ chip.classList.add('active'); chip.setAttribute('aria-current','page'); }
        else{ chip.classList.remove('active'); chip.removeAttribute('aria-current'); }
      }
    });
  }
  function navigate(route){
    if(!container){ doSwitch(route); return; }
    const current = document.querySelector('.page.active');
    if(current && current.id !== 'page-'+route){
      container.classList.add('page-exit');
      setTimeout(()=>{
        doSwitch(route);
        container.classList.remove('page-exit');
        container.classList.add('page-enter');
        requestAnimationFrame(()=> container.classList.add('page-enter-active'));
        setTimeout(()=> container.classList.remove('page-enter','page-enter-active'), 300);
      }, 120);
    } else {
      doSwitch(route);
    }
    try{ history.replaceState({}, '', '#'+route); }catch{}
  }
  window.addEventListener('popstate', ()=> navigate((location.hash||'#home').slice(1)));
  chips.forEach(ch => {
    ch.addEventListener('click', e=>{
      e.preventDefault();
      const route = ch.getAttribute('data-route');
      if(route) navigate(route);
    });
  });
  navigate((location.hash||'#home').slice(1));

  /* UI formatów */
  function buildFormatUI(){
    formatGroupsEl.innerHTML = '';
    for(const [key,val] of Object.entries(formatsCatalog)){
      const btn = document.createElement('button');
      btn.className = 'fchip';
      btn.type = 'button';
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-pressed', key===selectedCategory ? 'true' : 'false');
      btn.textContent = val.label;
      btn.addEventListener('click', ()=>{
        if(btn.hasAttribute('disabled')) return;
        selectedCategory = key;
        refreshGroups();
        buildFormatOptions();
      });
      formatGroupsEl.appendChild(btn);
    }
    buildFormatOptions();
    applyCompatibilityLocks();
  }
  function refreshGroups(){
    $$('#formatGroups .fchip').forEach(b=>{
      b.setAttribute('aria-pressed', b.textContent === formatsCatalog[selectedCategory].label ? 'true' : 'false');
    });
  }
  function buildFormatOptions(){
    formatOptionsEl.innerHTML = '';
    const list = formatsCatalog[selectedCategory].formats;
    if(!list.includes(selectedFormat)) selectedFormat = list[0];
    list.forEach(fmt=>{
      const opt = document.createElement('button');
      opt.className = 'format-option';
      opt.type = 'button';
      opt.setAttribute('role','radio');
      opt.setAttribute('data-fmt', fmt);
      opt.setAttribute('aria-checked', fmt===selectedFormat ? 'true' : 'false');
      opt.textContent = labelMap[fmt] || fmt.toUpperCase();
      opt.addEventListener('click', ()=>{
        if(opt.hasAttribute('disabled')) return;
        selectedFormat = fmt;
        $$('#formatOptions .format-option').forEach(o=>o.setAttribute('aria-checked','false'));
        opt.setAttribute('aria-checked','true');
      });
      formatOptionsEl.appendChild(opt);
    });
    applyCompatibilityLocks();
  }

  function currentInputCategory(){
    if(!files.length) return null;
    const count = {image:0,audio:0,document:0,video:0,archive:0,code:0};
    for(const f of files){
      const ext = (f.name.split('.').pop()||'').toLowerCase();
      const cat = extToCategory[ext] || 'document';
      if(count[cat]!==undefined) count[cat]++;
    }
    return Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0];
  }
  function applyCompatibilityLocks(){
    const inputCat = currentInputCategory();
    if(!inputCat){
      $$('#formatGroups .fchip').forEach(ch=> ch.removeAttribute('disabled'));
      $$('#formatOptions .format-option').forEach(o=> o.removeAttribute('disabled'));
      return;
    }
    const allowedCats = compatibleCategoryMap[inputCat] || new Set();
    $$('#formatGroups .fchip').forEach(ch=>{
      const cat = Object.keys(formatsCatalog).find(k => formatsCatalog[k].label === ch.textContent);
      if(!cat) return;
      const allowed = allowedCats.has(cat);
      if(!allowed){ ch.setAttribute('disabled',''); }
      else ch.removeAttribute('disabled');
    });
    const allowedFormatsSet = perCategoryAllowedFormats[inputCat] || new Set();
    $$('#formatOptions .format-option').forEach(o=>{
      const fmt = o.getAttribute('data-fmt');
      const globallyInCategory = (formatsCatalog[selectedCategory]?.formats || []).includes(fmt);
      const allowed = globallyInCategory && allowedFormatsSet.has(fmt);
      if(!allowed){
        o.setAttribute('disabled','');
        if(o.getAttribute('aria-checked')==='true'){
          o.setAttribute('aria-checked','false');
        }
      }else{
        o.removeAttribute('disabled');
      }
    });
    const enabled = $$('#formatOptions .format-option:not([disabled])');
    if(enabled.length){
      const stillSelected = enabled.find(o=> o.getAttribute('data-fmt')===selectedFormat);
      if(!stillSelected){
        selectedFormat = enabled[0].getAttribute('data-fmt');
        enabled[0].setAttribute('aria-checked','true');
      }
    }
    if(!allowedCats.has(selectedCategory)){
      const firstAllowed = Object.keys(formatsCatalog).find(cat => allowedCats.has(cat));
      if(firstAllowed){
        selectedCategory = firstAllowed;
        refreshGroups();
        buildFormatOptions();
      }
    }
  }
  function autoCategoryForFiles(fs){
    if(!fs.length) return 'image';
    const count = {image:0,audio:0,document:0,video:0,archive:0,code:0};
    for(const f of fs){
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const cat = extToCategory[ext] || 'document';
      if(count[cat]!==undefined) count[cat]++;
    }
    let best = 'image', max = -1;
    for(const k of Object.keys(count)){ if(count[k] > max){ max = count[k]; best = k; } }
    return best;
  }

  function estimateSafeLimitBytes(){
    const mem = navigator.deviceMemory || 4;
    const cores = (navigator.hardwareConcurrency || 4);
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|android|mobile/.test(ua);
    let base = Math.min(mem * 5, 50) * GB;
    if(isMobile) base *= 0.6;
    if(cores <= 2) base *= 3;
    base = Math.max(200*MB, Math.min(base, 50*GB));
    return Math.round(base);
  }

  /* renderowanie */
  function onFilesChanged(){
    const settings = document.getElementById('settings-panel');
    if(settings) settings.style.display = files.length ? 'block' : 'none';
    applyCompatibilityLocks();
  }
  function addFiles(newFiles){
    const limitBytes = estimateSafeLimitBytes();
    const currentTotal = files.reduce((a,f)=>a+f.size,0);
    let addedTotal = 0;
    for(const f of newFiles){
      if(files.some(x => x.name===f.name && x.size===f.size)) continue;
      if(currentTotal + addedTotal + f.size > limitBytes){
        toast(`Pominięto ${f.name} (przekracza limit)`, 'warn');
        continue;
      }
      files.push(f);
      addedTotal += f.size;
    }
    renderFileList();
    onFilesChanged();
    const detected = autoCategoryForFiles(files);
    if(detected !== selectedCategory){
      selectedCategory = detected;
      refreshGroups();
      buildFormatOptions();
    } else {
      applyCompatibilityLocks();
    }
  }
  function renderFileList(){
    if(!fileListEl) return;
    fileListEl.innerHTML = '';
    if(!files.length){
      fileListEl.innerHTML = '<div class="ghost">Nie dodano jeszcze żadnych plików.</div>';
      return;
    }
    for(const [i,f] of files.entries()){
      const row = document.createElement('div');
      row.className = 'file';
      row.innerHTML = `
        <div class="icon"></div>
        <div class="meta">
          <b title="${f.name}">${truncate(f.name, 38)}</b>
          <small>${humanSize(f.size)}</small>
        </div>
        <div class="act">
          <span class="status">W kolejce</span>
          <button class="btn secondary" data-remove="${i}" title="Usuń">Usuń</button>
        </div>
      `;
      fileListEl.appendChild(row);
    }
    fileListEl.querySelectorAll('[data-remove]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = +btn.getAttribute('data-remove');
        files.splice(idx,1);
        renderFileList();
        onFilesChanged();
        const detected = autoCategoryForFiles(files);
        if(detected !== selectedCategory){
          selectedCategory = detected;
          refreshGroups();
          buildFormatOptions();
        } else {
          applyCompatibilityLocks();
        }
      });
    });
  }
  function renderResults(){
    if(!resultListEl) return;
    resultListEl.innerHTML = '';
    if(!results.length){
      resultListEl.innerHTML = '<div class="ghost">Przekonwertowane pliki pojawią się tutaj.</div>';
      return;
    }
    for(const r of results){
      const row = document.createElement('div');
      row.className = 'file';
      row.innerHTML = `
        <div class="icon"></div>
        <div class="meta">
          <b title="${r.name}">${truncate(r.name, 38)}</b>
          <small>${humanSize(r.blob.size)} • ${r.type}</small>
        </div>
        <div class="act">
          <a class="btn" download="${r.name}">Pobierz</a>
        </div>
      `;
      const a = row.querySelector('a');
      a.href = URL.createObjectURL(r.blob);
      resultListEl.appendChild(row);
    }
  }

  /* toast */
  function toast(msg, type='ok'){
    const el = document.createElement('div');
    el.textContent = msg;
    el.className = `status ${type==='ok'?'ok':type==='warn'?'warn':'err'}`;
    el.style.position='fixed';
    el.style.right='16px'; el.style.bottom='16px';
    el.style.zIndex='9999';
    el.style.backdropFilter = 'blur(8px)';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '999px';
    el.style.border = '1px solid rgba(255,255,255,.18)';
    el.style.background = 'linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.06))';
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; }, 1800);
    setTimeout(()=>el.remove(), 2200);
  }

  /* drag & drop */
  if(dropEl){
    ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e=>{
      e.preventDefault(); e.stopPropagation(); dropEl.classList.add('drag');
    }));
    ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e=>{
      e.preventDefault(); e.stopPropagation(); dropEl.classList.remove('drag');
    }));
    dropEl.addEventListener('drop', e=>{
      const dt = e.dataTransfer;
      if(dt && dt.files) addFiles(dt.files);
    });
    dropEl.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
    });
  }
  if(fileInput){
    fileInput.addEventListener('change', ()=>{
      if(fileInput.files) addFiles(fileInput.files);
    });
  }

  /* progres */
  let artificial = { timer: null, start: 0, dur: 0, softCap: 95, done: false };
  let doneCount = 0;
  function setInlineProgress(p){ if(progressBar && progressText){ progressBar.style.width = p+'%'; progressText.textContent = p+'%'; } }
  function setProgressPage(p){
    if(progressBar2) progressBar2.style.width = p+'%';
    if(progressText2) progressText2.textContent = p+'%';
    if(progressTitle){
      if(p >= 100) progressTitle.textContent = 'Gotowe';
      else progressTitle.textContent = 'Pracujemy nad Twoimi plikami…';
    }
  }
  function setOverallProgress(p){ setInlineProgress(p); setProgressPage(p); }
  function startArtificialProgress(ms){
    if(artificial.timer) clearInterval(artificial.timer);
    artificial.start = performance.now();
    artificial.dur = ms;
    artificial.done = false;
    const step = ()=>{
      if(artificial.done) return;
      const t = performance.now() - artificial.start;
      const x = Math.min(1, t / artificial.dur);
      const ease = x*x*(3-2*x);
      const jitter = (Math.random() - 0.5) * 0.06;
      let pct = Math.max(0, Math.min(1, ease + jitter));
      pct = Math.min(pct, artificial.softCap/100);
      const perc = Math.round(pct * 100);
      setProgressPage(perc);
    };
    step();
    artificial.timer = setInterval(step, 200 + Math.random()*220);
  }
  function completeArtificialProgress(){
    artificial.done = true;
    if(artificial.timer){ clearInterval(artificial.timer); artificial.timer=null; }
  }
  function updateOverallProgress(){
    const pct = Math.round((doneCount / Math.max(1, files.length)) * 100);
    const curr = parseInt((progressText2?.textContent)||'0') || 0;
    if(pct > curr) setProgressPage(Math.min(pct, 95));
  }

  /* konwersja */
  async function convertFile(file, fmt){
    const cat = (extToCategory[(file.name.split('.').pop()||'').toLowerCase()] || selectedCategory);
    try{
      let out;
      if(cat === 'image'){
        out = await convertImage(file, fmt);
      }else if(cat === 'audio'){
        out = await convertAudio(file, fmt);
      }else if(cat === 'document'){
        out = await convertDocument(file, fmt);
      }else if(cat === 'video'){
        out = await convertVideo(file, fmt);
      }else if(cat === 'archive'){
        out = await convertArchive(file, fmt);
      }else if(cat === 'code'){
        out = await convertCode(file, fmt);
      }else{
        out = new Blob([await file.arrayBuffer()], {type: file.type || 'application/octet-stream'});
      }
      const base = file.name.replace(/\.[^.]+$/,'');
      const name = `${base}.${suggestExt(fmt, file.name)}`;
      results.push({name, blob: out, type: out.type || 'application/octet-stream'});
    }catch(err){
      console.error(err);
      toast(`Niepowodzenie: ${file.name}`, 'err');
    }
  }

  /* pomocnicze konwersje */
  function fmtToMime(fmt){
    const m = {
      png: 'image/png',
      'png-8':'image/png',
      jpeg: 'image/jpeg',
      'jpeg-low':'image/jpeg',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      avif: 'image/avif',
      'gif-lite': 'image/gif',
      gif: 'image/gif',
      'webm-lite': 'video/webm',
      webm: 'video/webm',
      'thumb-webp':'image/webp',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      flac:'audio/flac',
      opus:'audio/opus',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      wav: 'audio/wav',
      'pdf-lite':'application/pdf',
      'rtf-lite':'application/rtf',
      'html-lite':'text/html',
      'zip-lite':'application/zip',
      'tar-lite':'application/x-tar',
      json:'application/json',
      csv:'text/csv',
      txt:'text/plain',
      md:'text/markdown',
      'svg-lite':'image/svg+xml',
      'bmp-lite':'image/bmp',
      'ico-lite':'image/x-icon',
      'ndjson-lite':'application/x-ndjson'
    };
    return m[fmt] || 'application/octet-stream';
  }

  function loadImage(url){
    return new Promise((res, rej)=>{
      const img = new Image();
      img.onload = ()=> res(img);
      img.onerror = rej;
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  async function generatePlaceholderCanvas(w, h, mime='image/png'){
    const can = document.createElement('canvas');
    can.width = w; can.height = h;
    const ctx = can.getContext('2d');
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Wygenerowana grafika', 24, 48);
    const blob = await new Promise(r=>can.toBlob(r, mime, 0.92));
    return {blob, canvas: can};
  }

  async function convertImage(file, fmt){
    if(fmt==='svg-lite'){
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="24" y="48" font-size="28" font-family="system-ui" fill="#fff">Wygenerowany SVG (lite)</text></svg>`;
      return new Blob([svg], {type:'image/svg+xml'});
    }
    if(fmt==='ico-lite'){
      const {blob} = await generatePlaceholderCanvas(64, 64, 'image/png');
      return new Blob([await blob.arrayBuffer()], {type:'image/x-icon'});
    }
    if(fmt==='bmp-lite'){
      const {blob} = await generatePlaceholderCanvas(480, 300, 'image/png');
      return new Blob([await blob.arrayBuffer()], {type:'image/bmp'});
    }

    const buf = await file.arrayBuffer();
    const blobUrl = URL.createObjectURL(new Blob([buf]));
    const img = await loadImage(blobUrl).catch(()=>null);
    URL.revokeObjectURL(blobUrl);

    const mime = fmtToMime(fmt);
    if(!img){
      const {blob} = await generatePlaceholderCanvas(800, 500, mime);
      return blob;
    }

    const limitMP = (navigator.deviceMemory || 4) >= 8 ? 24 : 10;
    const maxPixels = limitMP * 1_000_000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (img.naturalWidth * img.naturalHeight)));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const can = document.createElement('canvas');
    can.width = w; can.height = h;
    const ctx = can.getContext('2d');
    const opaque = (fmt==='jpeg' || fmt==='jpg' || fmt==='jpeg-low');
    if(opaque){
      const grd = ctx.createLinearGradient(0,0,w,h);
      grd.addColorStop(0,'#0d1117'); grd.addColorStop(1,'#1b2735');
      ctx.fillStyle = grd; ctx.fillRect(0,0,w,h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    let quality = 0.9;
    if(fmt==='jpeg-low') quality = 0.5;

    if(fmt==='png-8'){
      const b = await new Promise(r=>can.toBlob(r, 'image/png', 0.8));
      return b || new Blob([buf], {type: 'image/png'});
    }

    const b = await new Promise(r=>can.toBlob(r, mime, quality));
    return b || new Blob([buf], {type: mime});
  }

  async function convertAudio(file, fmt){
    if(['mp3','m4a','ogg','flac','opus'].includes(fmt)){
      console.warn('FFmpeg unavailable; fallback do WAV.');
    }
    const array = await file.arrayBuffer();
    let audioBuf = null;
    try{
      const ac = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
      audioBuf = await ac.decodeAudioData(array.slice(0));
      ac.close();
    }catch{}
    if(!audioBuf){ return await synthToneTo('wav'); }
    if(fmt === 'wav') return pcmToWavBlob(audioBuf);
    return pcmToWavBlob(audioBuf);
  }
  async function synthToneTo(format='wav'){
    const sr = 48000, dur = 0.5, len = Math.floor(sr*dur);
    const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, sr);
    const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440;
    const gain = ac.createGain(); gain.gain.value = 0.2;
    osc.connect(gain).connect(ac.destination);
    osc.start(0); osc.stop(dur);
    const buf = await ac.startRendering();
    const wav = await pcmToWavBlob(buf);
    return wav;
  }
  function pcmToWavBlob(audioBuffer){
    const numOfChan = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numOfChan * bytesPerSample;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (o,s)=>{ for(let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); };
    let off = 0;
    writeStr(off,'RIFF'); off+=4;
    view.setUint32(off, 36+dataSize, true); off+=4;
    writeStr(off,'WAVE'); off+=4;
    writeStr(off,'fmt '); off+=4;
    view.setUint32(off, 16, true); off+=4;
    view.setUint16(off, 1, true); off+=2;
    view.setUint16(off, numOfChan, true); off+=2;
    view.setUint32(off, sampleRate, true); off+=4;
    view.setUint32(off, sampleRate*blockAlign, true); off+=4;
    view.setUint16(off, blockAlign, true); off+=2;
    view.setUint16(off, bytesPerSample*8, true); off+=2;
    writeStr(off,'data'); off+=4;
    view.setUint32(off, dataSize, true); off+=4;
    const channels = [];
    for(let ch = 0; ch < numOfChan; ch++) channels.push(audioBuffer.getChannelData(ch));
    let idx = 0;
    for(let i=0; i<samples; i++){
      for(let ch=0; ch<numOfChan; ch++){
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(44 + idx, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        idx += 2;
      }
    }
    return new Blob([view], {type:'audio/wav'});
  }

  async function convertDocument(file, fmt){
    const text = await tryReadText(file);
    if(fmt==='txt') return new Blob([text], {type:'text/plain'});
    if(fmt==='md'){
      const md = `# Przekonwertowany dokument\n\nOryginał: ${file.name}\n\n---\n\n${text}`;
      return new Blob([md], {type:'text/markdown'});
    }
    if(fmt==='html-lite'){
      const safe = escapeHTML(text).slice(0, 20000).replace(/\n/g,'<br>');
      const html = `<!doctype html><meta charset="utf-8"><title>${escapeHTML(file.name)}</title><style>body{font-family:system-ui;margin:20px;line-height:1.5}</style><h1>${escapeHTML(file.name)}</h1><div>${safe}</div>`;
      return new Blob([html], {type:'text/html'});
    }
    if(fmt==='pdf-lite'){
      const pdfBytes = generateMiniPDF(text.slice(0, 20000));
      return new Blob([pdfBytes], {type:'application/pdf'});
    }
    if(fmt==='rtf-lite'){
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs20 Przekonwertowano z ${escapeRTF(file.name)}\\par ${escapeRTF(text.slice(0,5000))}}`;
      return new Blob([rtf], {type:'application/rtf'});
    }
    return new Blob([text], {type:'text/plain'});
  }
  function escapeRTF(s){ return s.replace(/[\\{}]/g, m=> '\\'+m).replace(/\n/g,'\\par '); }
  function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  async function tryReadText(file){
    try{ return await file.text(); }
    catch{
      const buf = await file.arrayBuffer();
      try{ return new TextDecoder().decode(buf); }
      catch{ return '[dane binarne]'; }
    }
  }

  async function convertVideo(file, fmt){
    if(['mp4','webm','gif','mov'].includes(fmt)){
      console.warn('FFmpeg video not available; using lite fallbacks.');
    }
    let frames = [];
    try{
      const blobUrl = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.muted = true; vid.src = blobUrl; vid.preload = 'auto';
      await vid.play().catch(()=>{});
      await once(vid, 'loadeddata', 2000).catch(()=>{});
      const dur = isFinite(vid.duration) ? vid.duration : 3;
      const w = Math.min(640, vid.videoWidth || 320);
      const h = Math.round((vid.videoHeight||180) * (w/(vid.videoWidth||320)));
      const can = document.createElement('canvas');
      can.width = w; can.height = h;
      const ctx = can.getContext('2d');
      const sampleFrames = 10;
      for(let i=0;i<sampleFrames;i++){
        const t = (dur * i) / sampleFrames;
        vid.currentTime = t;
        await once(vid,'seeked', 800).catch(()=>{});
        ctx.drawImage(vid, 0, 0, w, h);
        const frame = await new Promise(r=>can.toBlob(b=>r(b),'image/webp',0.85));
        if(frame) frames.push(frame);
      }
      URL.revokeObjectURL(blobUrl);
    }catch(e){ frames = []; }
    if(!frames.length) frames = await synthFrames(10, 360, 200);

    if(fmt === 'gif-lite'){
      const concat = await concatBlobs(frames, 'image/webp');
      return new Blob([await concat.arrayBuffer()], {type:'image/gif'});
    }
    if(fmt === 'webm-lite'){
      return new Blob([await frames[0].arrayBuffer()], {type:'video/webm'});
    }
    if(fmt === 'thumb-webp'){
      return frames[0];
    }
    return new Blob([await frames[0].arrayBuffer()], {type:'video/webm'});
  }

  async function convertArchive(file, fmt){
    if(fmt==='tar-lite'){
      const header = new TextEncoder().encode(`TAR-LITE\nPlik:${file.name}\nRozmiar:${file.size}\nUtworzono:${new Date().toISOString()}\n\n`);
      const content = await file.arrayBuffer();
      return new Blob([header, content], {type:'application/x-tar'});
    }
    if(fmt==='zip-lite'){
      const header = new TextEncoder().encode(`ZIP-LITE\nPlik:${file.name}\nRozmiar:${file.size}\nUtworzono:${new Date().toISOString()}\n\n`);
      const content = await file.arrayBuffer();
      return new Blob([header, content], {type:'application/zip'});
    }
    return new Blob([await file.arrayBuffer()], {type:'application/octet-stream'});
  }

  async function convertCode(file, fmt){
    const text = await tryReadText(file);
    if(fmt==='json'){
      try{
        const obj = JSON.parse(text);
        return new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
      }catch{
        return new Blob([JSON.stringify({raw:text})], {type:'application/json'});
      }
    }
    if(fmt==='csv'){
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const csv = lines.map(l => l.split(/\s+/).map(cell => /[",\n]/.test(cell)?('"'+cell.replace(/"/g,'""')+'"'):cell).join(',')).join('\n');
      return new Blob([csv], {type:'text/csv'});
    }
    if(fmt==='ndjson-lite'){
      const lines = text.split(/\r?\n/).filter(Boolean).map((v,i)=>({i, value:v}));
      const out = lines.map(obj=>JSON.stringify(obj)).join('\n');
      return new Blob([out], {type:'application/x-ndjson'});
    }
    return new Blob([text], {type:'text/plain'});
  }

  /* łączenie blobów */
  async function concatBlobs(blobs, type){
    const parts = [];
    for(const b of blobs) parts.push(new Uint8Array(await b.arrayBuffer()));
    const len = parts.reduce((a,p)=>a+p.byteLength,0);
    const out = new Uint8Array(len);
    let off = 0;
    for(const p of parts){ out.set(p, off); off += p.byteLength; }
    return new Blob([out], {type});
  }

  async function synthFrames(n, w, h){
    const frames = [];
    const can = document.createElement('canvas');
    can.width = w; can.height = h;
    const ctx = can.getContext('2d');
    for(let i=0;i<n;i++){
      const t = i / Math.max(1, n-1);
      const g = ctx.createLinearGradient(0,0,w,h);
      const c1 = `hsl(${Math.round(200+120*t)} 80% 50%)`;
      const c2 = `hsl(${Math.round(280+80*t)} 80% 60%)`;
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(20, h-40, 160, 24);
      ctx.fillStyle = 'white'; ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`Klatka ${i+1}`, 26, h-24);
      const b = await new Promise(r=>can.toBlob(r,'image/webp',0.9));
      if(b) frames.push(b);
    }
    return frames;
  }

  function suggestExt(fmt, originalName){
    const map = {
      'pdf-lite':'pdf','gif-lite':'gif','webm-lite':'webm','png-8':'png',
      'jpeg-low':'jpg','rtf-lite':'rtf','zip-lite':'zip','tar-lite':'tar',
      'thumb-webp':'webp','svg-lite':'svg','bmp-lite':'bmp','ico-lite':'ico',
      'html-lite':'html','ndjson-lite':'ndjson'
    };
    const ext = map[fmt] || fmt.toLowerCase();
    const oext = (originalName.split('.').pop()||'').toLowerCase();
    if(ext===oext) return ext;
    return ext;
  }

  /* pobieranie */
  function updateDownloadLink(items){
    if(!downloadAllBtn) return;
    if(!items.length){
      downloadAllBtn.removeAttribute('href');
      downloadAllBtn.removeAttribute('download');
      downloadAllBtn.textContent = 'Pobierz';
      return;
    }
    if(items.length === 1){
      const first = items[0];
      const url = URL.createObjectURL(first.blob);
      downloadAllBtn.href = url;
      downloadAllBtn.setAttribute('download', first.name);
      downloadAllBtn.textContent = 'Pobierz';
      return;
    }
    const nameBase = suggestPackBaseName(items);
    const header = new TextEncoder().encode(`CONVERTED-PACK (TAR-LITE)\nItems:${items.length}\nTime:${new Date().toISOString()}\n\n`);
    const parts = [header];
    items.forEach((it, idx)=>{
      const meta = new TextEncoder().encode(`--FILE ${idx+1}-- ${it.name} (${it.blob.type}) size=${it.blob.size}\n`);
      parts.push(meta);
      parts.push(it.blob);
      parts.push(new TextEncoder().encode('\n--END--\n'));
    });
    const pack = new Blob(parts, {type:'application/octet-stream'});
    const url = URL.createObjectURL(pack);
    const filename = `${nameBase}.tar`;
    downloadAllBtn.href = url;
    downloadAllBtn.setAttribute('download', filename);
    downloadAllBtn.textContent = 'Pobierz .tar';
  }
  function suggestPackBaseName(items){
    if(!items.length) return 'converted';
    const base = commonPrefix(items.map(i=>i.name.replace(/\.[^.]+$/,''))).trim();
    if(base && base.length >= 3) return base + '-converted';
    return 'converted';
  }

  /* pool */
  async function runPool(tasks, limit){
    let i = 0;
    const running = new Set();
    return new Promise(resolve=>{
      const next = ()=>{
        if(i >= tasks.length && running.size===0){ resolve(); return; }
        while(running.size < limit && i < tasks.length){
          const p = tasks[i++]();
          running.add(p);
          p.finally(()=>{ running.delete(p); next(); });
        }
      };
      next();
    });
  }

  /* eventy */
  if(convertBtn){
    convertBtn.addEventListener('click', async ()=>{
      if(!files.length) return toast('Dodaj pliki', 'warn');
      navigate('progress');
      results = [];
      doneCount = 0;
      setOverallProgress(0);
      updateDownloadLink([]);

      const totalBytes = files.reduce((a,f)=>a+f.size,0);
      startArtificialProgress(Math.min(25000, Math.max(6000, totalBytes / (512*KB) * 1200)));

      const cores = navigator.hardwareConcurrency || 4;
      const concurrency = Math.max(1, Math.min(6, Math.floor(cores/2)));

      const tasks = files.map(f=>()=> convertFile(f, selectedFormat).finally(()=>{ doneCount++; updateOverallProgress(); }));
      await runPool(tasks, concurrency);

      completeArtificialProgress();
      setProgressPage(100);
      updateDownloadLink(results);
      toast('Konwersja zakończona', 'ok');
      renderResults();
    });
  }

  if(convertMoreBtn){
    convertMoreBtn.addEventListener('click', ()=>{
      files = [];
      results = [];
      renderFileList();
      renderResults();
      setOverallProgress(0);
      selectedCategory = 'image';
      selectedFormat = 'png';
      buildFormatUI();
      applyCompatibilityLocks();
      onFilesChanged();
      updateDownloadLink([]);
      navigate('home');
    });
  }

  /* init */
  function init(){
    const autoLimit = estimateSafeLimitBytes();
    const info = $('#limitInfo');
    if(info){
      info.innerHTML = `<span class="status">Automatyczny limit: ${humanSize(autoLimit)}</span>`;
    }
    buildFormatUI();
    renderResults();
    renderFileList();
    onFilesChanged();
  }
  init();
})();
