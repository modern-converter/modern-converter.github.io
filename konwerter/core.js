import {
  formatsCatalog,
  extToCategory,
  labelMap,
  compatibleCategoryMap,
  perCategoryAllowedFormats,
  truncate,
  humanSize,
  estimateSafeLimitBytes,
  suggestPackBaseName,
  commonPrefix,
  once,
  fmtToMime,
  loadImage,
  tryReadText,
  escapeHTML,
  escapeRTF,
  generateMiniPDF,
  generatePlaceholderCanvas,
  concatBlobs,
  synthFrames
} from './utils.js';
import { convertImage } from './image.js';
import { convertAudio } from './audio.js';
import { convertVideo } from './video.js';
import { convertDocument } from './document.js';
import { convertArchive } from './archive.js';
import { convertCode } from './code.js';

/* DOM helpers */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* Elements */
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

/* State */
let files = [];
let results = [];
let selectedCategory = 'image';
let selectedFormat = 'png';

/* Router / navigation */
const routes = ['home','about','security','help'];
const chips = $$('.chip[data-route]');
chips.forEach(ch => ch.addEventListener('click', e=>{
  e.preventDefault();
  navigate(ch.getAttribute('data-route'));
}));
function navigate(route){
  routes.forEach(r=>{
    const page = $('#page-'+r);
    if(!page) return;
    page.classList.toggle('active', r===route);
    const chip = document.querySelector('.chip[data-route="'+r+'"]');
    if(chip){
      if(r===route){ chip.classList.add('active'); chip.setAttribute('aria-current','page'); }
      else{ chip.classList.remove('active'); chip.removeAttribute('aria-current'); }
    }
  });
  try{ history.replaceState({}, '', '#'+route); }catch{}
}
window.addEventListener('popstate', ()=> navigate((location.hash||'#home').slice(1)));
window.addEventListener('hashchange', ()=> navigate((location.hash||'#home').slice(1)));

/* Toast */
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

/* Subtaby bezpieczeństwa */
function setupSecuritySubtabs(){
  const subtabs = $$('.subtab');
  const panels = {
    security: $('#sec-security'),
    privacy: $('#sec-privacy'),
    terms: $('#sec-terms'),
    contact: $('#sec-contact')
  };
  subtabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.getAttribute('data-sub');
      subtabs.forEach(b=>{
        b.setAttribute('aria-pressed', b===btn ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([k, el])=>{
        if(!el) return;
        el.style.display = k === target ? 'block' : 'none';
      });
    });
  });
}

/* File UI logic */
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

/* Rendering */
function onFilesChanged(){
  const settings = $('#settings-panel');
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

/* Progress */
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
  const curr = parseInt(progressText2?.textContent) || 0;
  if(pct > curr) setProgressPage(Math.min(pct, 95));
}

/* Conversion */
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
});
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

/* Download link */
function updateDownloadLink(items){
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

/* Reset / Wróć */
convertMoreBtn.addEventListener('click', ()=>{
  files = [];
  results = [];
  selectedCategory = 'image';
  selectedFormat = 'png';
  buildFormatUI();
  renderFileList();
  renderResults();
  setOverallProgress(0);
  navigate('home');
  applyCompatibilityLocks();
});

/* Drag & Drop + input */
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
fileInput.addEventListener('change', ()=>{
  if(fileInput.files) addFiles(fileInput.files);
});
dropEl.addEventListener('keydown', e=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
});

/* Init */
function init(){
  const autoLimit = estimateSafeLimitBytes();
  const info = $('#limitInfo');
  if(info){
    info.innerHTML = `<span class="status">Automatyczny limit: ${humanSize(autoLimit)}</span>`;
  }
  buildFormatUI();
  renderFileList();
  renderResults();
  onFilesChanged();
  setupSecuritySubtabs();
  navigate((location.hash||'#home').slice(1));
}
init();
