import { navigate as uiNavigate } from '../style/ui.js';
import { convertImage } from './image.js';
import { convertAudio } from './audio.js';
import { convertDocument } from './document.js';
import { convertVideo } from './video.js';
import { convertArchive } from './archive.js';
import { convertCode } from './code.js';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let files = [];
let results = [];
let selectedCategory = 'image';
let selectedFormat = 'png';
let doneCount = 0;
let artificial = { timer:null, start:0, dur:0, softCap:95, done:false };

const formatsCatalog = {
  image: { label: 'Obraz', formats: ['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite'] },
  audio: { label: 'Audio', formats: ['wav','mp3','m4a','ogg','flac','opus'] },
  video: { label: 'Wideo', formats: ['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov'] },
  document: { label: 'Dokument', formats: ['txt','md','pdf-lite','rtf-lite','html-lite'] },
  archive: { label: 'Archiwum', formats: ['zip-lite','tar-lite'] },
  code: { label: 'Dane', formats: ['txt','json','csv','ndjson-lite'] }
};
const extToCategory = {
  png:'image', jpg:'image', jpeg:'image', webp:'image', avif:'image', bmp:'image', gif:'image', svg:'image', ico:'image',
  wav:'audio', mp3:'audio', m4a:'audio', ogg:'audio', flac:'audio', opus:'audio',
  txt:'document', md:'document', html:'document', pdf:'document', rtf:'document',
  json:'code', csv:'code', js:'code', ndjson:'code',
  mp4:'video', webm:'video', mov:'video'
};
const labelMap = {
  'png':'PNG','jpeg':'JPEG','webp':'WebP','avif':'AVIF','gif':'GIF','wav':'WAV','mp3':'MP3','txt':'TXT','md':'Markdown'
};

// kompatybilność: audio tylko do audio (poprawione)
const compatibleCategoryMap = {
  image: new Set(['image','document','archive','code']),
  audio: new Set(['audio']),
  video: new Set(['video','image','document','archive','code']),
  document: new Set(['document','image','archive','code']),
  archive: new Set(['archive']),
  code: new Set(['code','document','archive'])
};
const perCategoryAllowedFormats = {
  video: new Set(['mp4','webm','gif','gif-lite','webm-lite','thumb-webp','mov']),
  image: new Set(['png','jpeg','webp','avif','png-8','jpeg-low','gif','bmp-lite','svg-lite','ico-lite']),
  audio: new Set(['wav','mp3','m4a','ogg','flac','opus']),
  document: new Set(['txt','md','pdf-lite','rtf-lite','html-lite']),
  archive: new Set(['zip-lite','tar-lite']),
  code: new Set(['txt','json','csv','ndjson-lite'])
};

/* elementy dynamiczne (po załadowaniu partiali) */
let dropEl, fileInput, fileListEl, resultListEl;
let progressBar, progressText, progressBar2, progressText2, progressTitle;
let convertBtn, downloadAllBtn, convertMoreBtn, browseBtn;
let formatGroupsEl, formatOptionsEl;

function setupAfterLoad() {
  // pobierz referencje
  dropEl = $('#drop');
  fileInput = $('#fileInput');
  fileListEl = $('#fileList');
  resultListEl = $('#resultList');

  progressBar = $('#progressBar');
  progressText = $('#progressText');
  progressBar2 = $('#progressBar2');
  progressText2 = $('#progressText2');
  progressTitle = $('#progressTitle');

  convertBtn = $('#convertBtn');
  downloadAllBtn = $('#downloadAll');
  convertMoreBtn = $('#convertMore');
  browseBtn = $('#browseBtn');

  formatGroupsEl = $('#formatGroups');
  formatOptionsEl = $('#formatOptions');

  bindUI();
  initState();
}

function bindUI(){
  // drag/drop
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
  fileInput.addEventListener('change', ()=>{ if(fileInput.files) addFiles(fileInput.files); });
  browseBtn?.addEventListener('click', ()=> fileInput.click());
  dropEl.addEventListener('keydown', e=>{
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); fileInput.click(); }
  });

  convertBtn.addEventListener('click', async ()=>{
    if(!files.length) return toast('Dodaj pliki', 'warn');
    // rozpocznij
    showProgressSection();
    results = [];
    doneCount = 0;
    setOverallProgress(0);
    updateDownloadLink([]);
    const totalBytes = files.reduce((a,f)=>a+f.size,0);
    startArtificialProgress(Math.min(25000, Math.max(6000, totalBytes / (512 * KB) * 1200)));

    const cores = navigator.hardwareConcurrency || 4;
    const concurrency = Math.max(1, Math.min(6, Math.floor(cores/2)));
    const tasks = files.map(f=>()=> convertFile(f, selectedFormat).finally(()=>{ doneCount++; updateOverallProgress(); }));
    await runPool(tasks, concurrency);
    completeArtificialProgress();
    setProgressPage(100);
    updateDownloadLink(results);
    toast('Konwersja zakończona', 'ok');
  });

  convertMoreBtn.addEventListener('click', ()=>{
    resetConverterState();
    // wróć do home (już jesteśmy w home, tylko ukryj postęp)
    hideProgressSection();
  });
}

function initState(){
  const autoLimit = estimateSafeLimitBytes();
  const info = $('#limitInfo');
  if(info){
    info.innerHTML = `<span class="status">Automatyczny limit: ${humanSize(autoLimit)}</span>`;
  }
  buildFormatUI();
  renderResults();
  onFilesChanged();
}

function showProgressSection(){
  const prog = document.getElementById('page-progress-inner');
  if(prog) prog.style.display='block';
}
function hideProgressSection(){
  const prog = document.getElementById('page-progress-inner');
  if(prog) prog.style.display='none';
}

function buildFormatUI(){
  if(!formatGroupsEl || !formatOptionsEl) return;
  formatGroupsEl.innerHTML = '';
  for(const [key,val] of Object.entries(formatsCatalog)){
    const btn = document.createElement('button');
    btn.className='fchip';
    btn.type='button';
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-pressed', key===selectedCategory ? 'true' : 'false');
    btn.textContent = val.label;
    btn.addEventListener('click', ()=>{
      if (btn.hasAttribute('disabled')) return;
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
  if(!formatOptionsEl) return;
  formatOptionsEl.innerHTML = '';
  const list = formatsCatalog[selectedCategory].formats;
  if(!list.includes(selectedFormat)) selectedFormat = list[0];
  list.forEach(fmt=>{
    const opt = document.createElement('button');
    opt.className='format-option';
    opt.type='button';
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
  if(!formatGroupsEl || !formatOptionsEl) return;
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
  let best='image', max=-1;
  for(const k of Object.keys(count)){ if(count[k]>max){ max=count[k]; best=k; } }
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
function humanSize(bytes){
  const GBb=1024*1024*1024, MBb=1024*1024, KBb=1024;
  if(bytes >= GBb) return (bytes/GBb).toFixed(2)+' GB';
  if(bytes >= MBb) return (bytes/MBb).toFixed(1)+' MB';
  if(bytes >= KBb) return (bytes/KBb).toFixed(1)+' KB';
  return bytes+' B';
}

function onFilesChanged(){
  const settings = document.getElementById('settings-panel');
  if(settings) settings.style.display = files.length ? 'block' : 'none';
  applyCompatibilityLocks();
  renderFileList();
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
  const detected = autoCategoryForFiles(files);
  if(detected !== selectedCategory){
    selectedCategory = detected;
  }
  refreshGroups();
  buildFormatOptions();
  onFilesChanged();
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
    row.className='file';
    row.innerHTML=`
      <div class="icon"></div>
      <div class="meta">
        <b title="${f.name}">${truncate(f.name,38)}</b>
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
      const idx= +btn.getAttribute('data-remove');
      files.splice(idx,1);
      onFilesChanged();
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
    row.className='file';
    row.innerHTML=`
      <div class="icon"></div>
      <div class="meta">
        <b title="${r.name}">${truncate(r.name,38)}</b>
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

function toast(msg, type='ok'){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className='toast';
  el.textContent=msg;
  if(type==='warn') el.style.borderColor='orange';
  if(type==='err') el.style.borderColor='red';
  container.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; },1600);
  setTimeout(()=>el.remove(),2000);
}

function setInlineProgress(p){ if(progressBar && progressText){ progressBar.style.width=p+'%'; progressText.textContent=p+'%'; } }
function setProgressPage(p){
  if(progressBar2) progressBar2.style.width=p+'%';
  if(progressText2) progressText2.textContent=p+'%';
  if(progressTitle){
    progressTitle.textContent = p>=100 ? 'Gotowe' : 'Pracujemy nad Twoimi plikami…';
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
    const jitter = (Math.random()-0.5)*0.06;
    let pct = Math.max(0, Math.min(1, ease + jitter));
    pct = Math.min(pct, artificial.softCap/100);
    const perc = Math.round(pct*100);
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
  const curr = parseInt(progressText2?.textContent) || 0;
  if(pct > curr) setProgressPage(Math.min(pct,95));
}

async function runPool(tasks, limit){
  let i=0;
  const running = new Set();
  return new Promise(resolve=>{
    const next = ()=>{
      if(i>=tasks.length && running.size===0){ resolve(); return; }
      while(running.size < limit && i < tasks.length){
        const p = tasks[i++]();
        running.add(p);
        p.finally(()=>{ running.delete(p); next(); });
      }
    };
    next();
  });
}

async function convertFile(file, fmt){
  const cat = (extToCategory[(file.name.split('.').pop()||'').toLowerCase()] || selectedCategory);
  try{
    let out;
    if(cat==='image') out = await convertImage(file, fmt);
    else if(cat==='audio') out = await convertAudio(file, fmt);
    else if(cat==='document') out = await convertDocument(file, fmt);
    else if(cat==='video') out = await convertVideo(file, fmt);
    else if(cat==='archive') out = await convertArchive(file, fmt);
    else if(cat==='code') out = await convertCode(file, fmt);
    else out = new Blob([await file.arrayBuffer()], {type: file.type || 'application/octet-stream'});
    const base = file.name.replace(/\.[^.]+$/,'');
    const name = `${base}.${suggestExt(fmt, file.name)}`;
    results.push({name, blob: out, type: out.type || 'application/octet-stream'});
  }catch(err){
    console.error(err);
    toast(`Niepowodzenie: ${file.name}`, 'err');
  }
}

function updateDownloadLink(items){
  if(!downloadAllBtn) return;
  if(!items.length){
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.removeAttribute('download');
    downloadAllBtn.textContent='Pobierz';
    return;
  }
  if(items.length===1){
    const first=items[0];
    const url=URL.createObjectURL(first.blob);
    downloadAllBtn.href=url;
    downloadAllBtn.setAttribute('download', first.name);
    downloadAllBtn.textContent='Pobierz';
    return;
  }
  const nameBase=suggestPackBaseName(items);
  const header=new TextEncoder().encode(`CONVERTED-PACK (TAR-LITE)\nItems:${items.length}\nTime:${new Date().toISOString()}\n\n`);
  const parts=[header];
  items.forEach((it, idx)=>{
    const meta=new TextEncoder().encode(`--FILE ${idx+1}-- ${it.name} (${it.blob.type}) size=${it.blob.size}\n`);
    parts.push(meta);
    parts.push(it.blob);
    parts.push(new TextEncoder().encode('\n--END--\n'));
  });
  const pack=new Blob(parts, {type:'application/octet-stream'});
  const url=URL.createObjectURL(pack);
  const filename=`${nameBase}.tar`;
  downloadAllBtn.href=url;
  downloadAllBtn.setAttribute('download', filename);
  downloadAllBtn.textContent='Pobierz .tar';
}

function suggestPackBaseName(items){
  if(!items.length) return 'converted';
  const base=commonPrefix(items.map(i=>i.name.replace(/\.[^.]+$/,''))).trim();
  if(base && base.length>=3) return base+'-converted';
  return 'converted';
}
function commonPrefix(arr){
  if(!arr.length) return '';
  let p=arr[0];
  for(let i=1;i<arr.length;i++){
    let j=0; const s=arr[i];
    while(j<p.length && j<s.length && p[j]===s[j]) j++;
    p=p.slice(0,j);
    if(!p) break;
  }
  return p.replace(/[-_. ]+$/,'');
}
function suggestExt(fmt, originalName){
  const map = {
    'pdf-lite':'pdf','gif-lite':'gif','webm-lite':'webm','png-8':'png',
    'jpeg-low':'jpg','rtf-lite':'rtf','zip-lite':'zip','tar-lite':'tar',
    'thumb-webp':'webp','svg-lite':'svg','bmp-lite':'bmp','ico-lite':'ico',
    'html-lite':'html','ndjson-lite':'ndjson'
  };
  const ext=map[fmt] || fmt.toLowerCase();
  const oext=(originalName.split('.').pop()||'').toLowerCase();
  if(ext===oext) return ext;
  return ext;
}
function truncate(str,n){
  if(str.length<=n) return str;
  const ext=(str.includes('.')?'.'+str.split('.').pop():'');
  const base=str.slice(0, Math.max(0, n - ext.length -1));
  return base+'…'+ext;
}

function resetConverterState(){
  files=[]; results=[]; doneCount=0;
  artificial={ timer:null, start:0, dur:0, softCap:95, done:false };
  selectedCategory='image'; selectedFormat='png';
  renderFileList();
  renderResults();
  setOverallProgress(0);
  buildFormatUI();
  onFilesChanged();
}

function initRoutingHook(){
  // czekaj na zmianę strony, żeby zainicjalizować UI przy ładowaniu home
  window.addEventListener('page-changed', e=>{
    if(e.detail==='home'){
      // gdy fragment home załadowany, zainicjalizuj
      setTimeout(()=>{ // daj chwilę na DOM
        setupAfterLoad();
      }, 0);
    }
  });
}

// start
initRoutingHook();

// --- (na górze pliku: importy i wcześniejsza część pozostają bez zmian) ---

// Dodaj nową pomocniczą funkcję:
function resetHome(){
  files = [];
  results = [];
  renderFileList();
  renderResults();
  onFilesChanged(); // ukryje panel ustawień gdy nie ma plików
  setOverallProgress(0);
  resetProgressPage();
}

// Zmodyfikuj navigate, żeby przy wejściu na home zresetować jeśli pochodzi z innej strony:
async function navigate(route){
  const current = document.querySelector('.page.active');
  const target = document.getElementById('page-'+route);
  // update chips
  $$('.chip[data-route]').forEach(c=>{
    if(c.getAttribute('data-route')===route){
      c.classList.add('active');
      c.setAttribute('aria-current','page');
    }else{
      c.classList.remove('active');
      c.removeAttribute('aria-current');
    }
  });
  // jeśli ktoś przechodzi na home przez nawigację - zresetuj
  if(route === 'home'){
    resetHome();
  }
  // perform animated switch
  await transitionPage(current, target);
  try{ history.replaceState({}, '', '#'+route); }catch{}
}

// Zmieniony handler dla przycisku "Wróć":
convertMoreBtn.addEventListener('click', ()=>{
  resetHome(); // usuń pliki, wyniki, progress
  navigate('home');
  applyCompatibilityLocks();
});
