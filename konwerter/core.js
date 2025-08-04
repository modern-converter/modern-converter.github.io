/* core.js – wersja bez FFmpeg, z rozszerzonymi formatami audio i poprawionym resetState */

import { convertImage }    from './image.js';
import { convertAudio }    from './audio.js';
import { convertDocument } from './document.js';
import { convertVideo }    from './video.js';
import { convertArchive }  from './archive.js';
import { convertCode }     from './code.js';

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ─────────────── utils ─────────────── */
function humanSize(b) {
  const G = 1 << 30, M = 1 << 20, K = 1 << 10;
  if (b >= G) return (b / G).toFixed(2) + ' GB';
  if (b >= M) return (b / M).toFixed(1) + ' MB';
  if (b >= K) return (b / K).toFixed(1) + ' KB';
  return b + ' B';
}
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/* ─────────────── global state ─────────────── */
let files = [],
    results = [],
    selectedFormat = '';

/* rozszerzona mapa kategorii */
const extToCategory = {
  /* obrazki */
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image',
  bmp: 'image', gif: 'image', svg: 'image', ico: 'image',
  /* audio */
  wav:'audio', mp3:'audio', m4a:'audio', ogg:'audio', opus:'audio', flac:'audio',
  aiff:'audio', aif:'audio', au:'audio', amr:'audio', alaw:'audio', ulaw:'audio',
  w64:'audio', caf:'audio', voc:'audio', ape:'audio', dff:'audio', dsf:'audio',
  raw:'audio',
  /* dokumenty / code */
  txt:'document', md:'document', html:'document', pdf:'document', rtf:'document',
  json:'code',  csv:'code',    js:'code',  ndjson:'code',
  /* wideo */
  mp4:'video', webm:'video', mov:'video'
};

/* domyślne formaty wyjściowe  */
const defaultFormats = {
  image   : ['png','jpeg','webp','avif'],
  audio   : ['mp3','wav','webm','ogg','flac','aiff','amr'],
  video   : ['mp4','webm'],
  document: ['pdf','txt','md'],
  code    : ['json','csv'],
  archive : ['zip-lite']
};

/* etykiety przycisków */
const formatLabels = {
  png:'PNG', jpeg:'JPEG', webp:'WebP', avif:'AVIF',
  mp4:'MP4', webm:'WebM', mov:'MOV',
  mp3:'MP3', wav:'WAV', ogg:'OGG', webma:'WebM-audio',
  flac:'FLAC', aiff:'AIFF', amr:'AMR',
  pdf:'PDF', txt:'TXT', md:'Markdown',
  json:'JSON', csv:'CSV',
  'zip-lite':'ZIP', 'tar-lite':'TAR'
};

/* ─────────────── DOM refs (uaktualniane w DOMContentLoaded) ─────────────── */
let dropEl, fileInput, fileListEl, convertBtn, browseBtn, formatOptionsEl;
let progressBar2, progressText2, progressTitle, downloadAllBtn, convertMoreBtn;
let toastContainer;

/* ─────────────── resetState – PRZENIESIENIE NA GÓRĘ (hoisting) ─────────────── */
function resetState() {
  files = [];
  results = [];
  selectedFormat = '';
  renderFileList();
  updateProgress(0);
  if (downloadAllBtn) {
    downloadAllBtn.classList.add('disabled');
    downloadAllBtn.setAttribute('aria-disabled', 'true');
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.textContent = 'Pobierz';
  }
  onFilesChanged();
}

/* ─────────────── toast & page nav ─────────────── */
function showPage(route) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + route));
  $$('.chip').forEach(c => {
    const r = c.dataset.route;
    if (r === route) { c.classList.add('active'); c.ariaCurrent = 'page'; }
    else { c.classList.remove('active'); c.removeAttribute('aria-current'); }
  });
}
function toast(msg, type='ok') {
  if (!toastContainer) {
    toastContainer = document.body.appendChild(Object.assign(
      document.createElement('div'), { id:'toast-container',
      style:'position:fixed;top:10px;right:10px;z-index:9999' }));
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `background:${type==='err'?'#ff4d4f':'#333'};color:#fff;
    padding:8px 14px;border-radius:6px;margin-top:6px;font-size:13px;
    opacity:0;transition:opacity .25s`;
  toastContainer.appendChild(el);
  requestAnimationFrame(()=>el.style.opacity='1');
  setTimeout(()=>{el.style.opacity='0'; setTimeout(()=>el.remove(),300);},2500);
}

/* ─────────────── settings panel ─────────────── */
function buildFormatOptions() {
  if (!formatOptionsEl) return;
  formatOptionsEl.innerHTML = '';
  let cat = 'document';
  if (files.length) {
    const ext = (files[0].name.split('.').pop() || '').toLowerCase();
    cat = extToCategory[ext] || 'document';
  }
  (defaultFormats[cat] || ['txt']).forEach(fmt => {
    const btn = Object.assign(document.createElement('button'), {
      type:'button', className:'format-option', textContent: formatLabels[fmt]||fmt.toUpperCase()
    });
    btn.dataset.fmt = fmt;
    btn.ariaPressed = String(fmt === selectedFormat);
    if (fmt === selectedFormat) btn.classList.add('selected');
    btn.onclick = () => { selectedFormat = fmt; buildFormatOptions(); };
    formatOptionsEl.appendChild(btn);
  });
}

/* ─────────────── file list UI ─────────────── */
function renderFileList() {
  if (!fileListEl) return;
  fileListEl.innerHTML = '';
  files.forEach(f => {
    const row = document.createElement('div'); row.className = 'file';
    row.innerHTML = `
      <div class="icon"></div>
      <div class="meta">
        <b title="${f.name}">${truncate(f.name, 38)}</b>
        <small>${humanSize(f.size)}</small>
      </div>
      <div class="act"><button class="btn small" aria-label="Usuń">✕</button></div>`;
    row.querySelector('button').onclick = () => {
      files = files.filter(x => x !== f);
      onFilesChanged(); renderFileList();
    };
    fileListEl.appendChild(row);
  });
}
function onFilesChanged() {
  const panel = $('#settings-panel');
  if (!panel) return;
  if (files.length) {
    panel.style.display = 'block';
    if (!selectedFormat) {
      const ext = (files[0].name.split('.').pop() || '').toLowerCase();
      selectedFormat = (defaultFormats[extToCategory[ext]||'document'] || ['txt'])[0];
    }
    buildFormatOptions();
  } else panel.style.display = 'none';
}

/* ─────────────── pojedyncza konwersja ─────────────── */
async function convertFile(file, fmt) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const cat = extToCategory[ext] || 'document';
  let out;
  try {
    if (cat === 'image')        out = await convertImage(file, fmt);
    else if (cat === 'audio')   out = await convertAudio(file, fmt);
    else if (cat === 'video')   out = await convertVideo(file, fmt);
    else if (cat === 'document')out = await convertDocument(file, fmt);
    else if (cat === 'archive') out = await convertArchive(file, fmt);
    else if (cat === 'code')    out = await convertCode(file, fmt);
    else out = file.slice();
  } catch (e) {
    console.warn(`Błąd konwersji "${file.name}" → ${fmt}:`, e);
    out = file.slice();
  }
  const base = file.name.replace(/\.[^.]+$/, '');
  results.push({ name:`${base}.${fmt.replace(/-lite$/,'')}`, blob:out });
}

/* ─────────────── progress bar ─────────────── */
function updateProgress(p) {
  if (progressBar2)  progressBar2.style.width = p + '%';
  if (progressText2) progressText2.textContent = p + '%';
  if (progressTitle) progressTitle.textContent = p >= 100 ? 'Gotowe' : 'Pracujemy nad Twoimi plikami…';
}

/* ─────────────── updateDownloadLink ─────────────── */
function updateDownloadLink() {
  if (!downloadAllBtn) return;
  if (!results.length) {
    downloadAllBtn.classList.add('disabled');
    downloadAllBtn.setAttribute('aria-disabled','true');
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.textContent = 'Pobierz';
    return;
  }
  downloadAllBtn.classList.remove('disabled');
  downloadAllBtn.removeAttribute('aria-disabled');
  if (results.length === 1) {
    const { blob, name } = results[0];
    downloadAllBtn.href = URL.createObjectURL(blob);
    downloadAllBtn.download = name;
    downloadAllBtn.textContent = 'Pobierz';
    return;
  }
  const header = new TextEncoder().encode(`PACK\nItems:${results.length}\n\n`);
  const parts=[header];
  results.forEach((r,i)=>{
    parts.push(new TextEncoder().encode(`--FILE ${i+1}-- ${r.name}\n`));
    parts.push(r.blob); parts.push(new TextEncoder().encode('\n'));
  });
  const tar = new Blob(parts,{type:'application/octet-stream'});
  downloadAllBtn.href = URL.createObjectURL(tar);
  downloadAllBtn.download = 'converted-pack.tar';
  downloadAllBtn.textContent = 'Pobierz wszystkie';
}

/* ─────────────── główna pętla konwersji ─────────────── */
async function runConversion() {
  if (!files.length) { toast('Brak plików do konwersji','err'); return; }
  results=[]; updateProgress(0); showPage('progress');
  convertBtn && (convertBtn.disabled = true);

  const conc = Math.max(1, Math.min(4,
    navigator.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency / 2) : 2));
  let done = 0, failures = 0;
  const queue = files.map(f => async () => {
    try { await convertFile(f, selectedFormat); }
    catch { failures++; }
    finally { done++; updateProgress(Math.round(done / files.length * 100)); }
  });

  const running = [];
  while (queue.length || running.length) {
    while (running.length < conc && queue.length) {
      const task = queue.shift()();
      running.push(task);
      task.finally(()=>running.splice(running.indexOf(task),1));
    }
    await Promise.race(running);
  }
  await Promise.all(running);
  updateProgress(100); updateDownloadLink();
  toast(failures ? `Zakończone z błędami (${failures})` : 'Konwersja zakończona');
  convertBtn && (convertBtn.disabled = false);
}

/* ─────────────── UI eventy ─────────────── */
function attachEventListeners() {
  $$('.chip').forEach(c => c.onclick = e => { e.preventDefault(); showPage(c.dataset.route); });

  if (dropEl) {
    ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e => {
      e.preventDefault(); dropEl.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e => {
      e.preventDefault(); dropEl.classList.remove('drag'); }));
    dropEl.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  }
  browseBtn?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => addFiles(fileInput.files));
  convertBtn?.addEventListener('click', runConversion);
  convertMoreBtn?.addEventListener('click', () => { resetState(); showPage('home'); });
}

/* ─────────────── dodawanie plików ─────────────── */
function addFiles(list) {
  for (const f of list) if (f.name) files.push(f);
  renderFileList(); onFilesChanged();
}

/* ─────────────── DOMContentLoaded init ─────────────── */
window.addEventListener('DOMContentLoaded', () => {
  dropEl          = $('#drop');
  fileInput       = $('#fileInput');
  fileListEl      = $('#fileList');
  convertBtn      = $('#convertBtn');
  browseBtn       = $('#browseBtn');
  formatOptionsEl = $('#formatOptions');
  progressBar2    = $('#progressBar2');
  progressText2   = $('#progressText2');
  progressTitle   = $('#progressTitle');
  downloadAllBtn  = $('#downloadAll');
  convertMoreBtn  = $('#convertMore');

  attachEventListeners();
  resetState();               // teraz zdefiniowane powyżej
  showPage('home');
});
