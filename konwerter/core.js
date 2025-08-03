import { convertImage } from './image.js';
import { convertAudio } from './audio.js';
import { convertDocument } from './document.js';
import { convertVideo } from './video.js';
import { convertArchive } from './archive.js';
import { convertCode } from './code.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// utilities
function humanSize(bytes){
  const GB = 1024*1024*1024, MB=1024*1024, KB=1024;
  if(bytes >= GB) return (bytes/GB).toFixed(2)+' GB';
  if(bytes >= MB) return (bytes/MB).toFixed(1)+' MB';
  if(bytes >= KB) return (bytes/KB).toFixed(1)+' KB';
  return bytes+' B';
}
function truncate(str, len){
  if(str.length <= len) return str;
  return str.slice(0,len-1)+'…';
}

let files = [];
let results = [];
let selectedFormat = '';

const extToCategory = {
  png:'image', jpg:'image', jpeg:'image', webp:'image', avif:'image', bmp:'image', gif:'image', svg:'image', ico:'image',
  wav:'audio', mp3:'audio', m4a:'audio', ogg:'audio', flac:'audio', opus:'audio',
  txt:'document', md:'document', html:'document', pdf:'document', rtf:'document',
  json:'code', csv:'code', js:'code', ndjson:'code',
  mp4:'video', webm:'video', mov:'video'
};
const defaultFormats = {
  image: ['png','jpeg','webp','avif'],
  audio: ['mp3','wav','ogg'],
  video: ['mp4','webm'],
  document: ['pdf','txt','md'],
  code: ['json','csv'],
  archive: ['zip-lite']
};
const formatLabels = {
  png:'PNG', jpeg:'JPEG', webp:'WebP', avif:'AVIF', mp4:'MP4', webm:'WebM',
  mp3:'MP3', wav:'WAV', ogg:'OGG', pdf:'PDF', txt:'TXT', md:'Markdown',
  json:'JSON', csv:'CSV', 'zip-lite':'ZIP', 'tar-lite':'TAR'
};

let dropEl, fileInput, fileListEl, convertBtn, browseBtn;
let formatOptionsEl;
let progressBar2, progressText2, progressTitle;
let downloadAllBtn, convertMoreBtn;
let toastContainer;

function showPage(route){
  $$('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-'+route);
  });
  $$('.chip').forEach(c => {
    const r = c.getAttribute('data-route');
    if(r === route){
      c.classList.add('active');
      c.setAttribute('aria-current','page');
    } else {
      c.classList.remove('active');
      c.removeAttribute('aria-current');
    }
  });
}

// Toast
function toast(msg, type='ok'){
  if(!toastContainer){
    toastContainer = document.createElement('div');
    toastContainer.id='toast-container';
    toastContainer.style.position='fixed';
    toastContainer.style.top='10px';
    toastContainer.style.right='10px';
    toastContainer.style.zIndex=9999;
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.textContent=msg;
  el.style.background = type==='err'?'#ff4d4f':'#333';
  el.style.color='#fff';
  el.style.padding='8px 14px';
  el.style.borderRadius='6px';
  el.style.marginTop='6px';
  el.style.fontSize='13px';
  el.style.opacity='0';
  el.style.transition='opacity .25s';
  toastContainer.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; });
  setTimeout(()=>{
    el.style.opacity='0';
    setTimeout(()=>el.remove(),300);
  },2500);
}

function renderFileList(){
  if(!fileListEl) return;
  fileListEl.innerHTML='';
  for(const f of files){
    const row = document.createElement('div');
    row.className='file';
    row.innerHTML=`
      <div class="icon"></div>
      <div class="meta">
        <b title="${f.name}">${truncate(f.name,38)}</b>
        <small>${humanSize(f.size)}</small>
      </div>
      <div class="act">
        <button class="btn small" aria-label="Usuń">✕</button>
      </div>
    `;
    row.querySelector('button').addEventListener('click', ()=>{
      files = files.filter(o=>o!==f);
      onFilesChanged();
      renderFileList();
    });
    fileListEl.appendChild(row);
  }
}

function onFilesChanged(){
  const settings = document.getElementById('settings-panel');
  if(!settings) return;
  if(files.length){
    settings.style.display='block';
    if(!selectedFormat){
      const ext = (files[0].name.split('.').pop()||'').toLowerCase();
      const category = extToCategory[ext] || 'document';
      const defs = defaultFormats[category] || ['txt'];
      selectedFormat = defs[0];
    }
    buildFormatOptions();
  } else {
    settings.style.display='none';
  }
}

function buildFormatOptions(){
  if(!formatOptionsEl) return;
  formatOptionsEl.innerHTML='';
  let category='document';
  if(files.length){
    const ext = (files[0].name.split('.').pop()||'').toLowerCase();
    category = extToCategory[ext] || 'document';
  }
  const options = defaultFormats[category] || ['txt'];
  options.forEach(fmt=>{
    const btn = document.createElement('button');
    btn.className='format-option';
    btn.type='button';
    btn.textContent = formatLabels[fmt] || fmt.toUpperCase();
    btn.setAttribute('data-fmt', fmt);
    btn.setAttribute('aria-pressed', fmt===selectedFormat ? 'true' : 'false');
    if(fmt===selectedFormat){
      btn.classList.add('selected');
    }
    btn.addEventListener('click', ()=>{
      selectedFormat=fmt;
      buildFormatOptions();
    });
    formatOptionsEl.appendChild(btn);
  });
}

async function convertFile(file, fmt){
  const ext = (file.name.split('.').pop()||'').toLowerCase();
  const category = extToCategory[ext] || 'document';
  let out;
  if(category==='image') out = await convertImage(file, fmt);
  else if(category==='audio') out = await convertAudio(file, fmt);
  else if(category==='video') out = await convertVideo(file, fmt);
  else if(category==='document') out = await convertDocument(file, fmt);
  else if(category==='archive') out = await convertArchive(file, fmt);
  else if(category==='code') out = await convertCode(file, fmt);
  else out = file.slice();
  const base = file.name.replace(/\.[^.]+$/,'');
  let extension = fmt.replace(/-lite$/,'');
  const name = `${base}.${extension}`;
  results.push({ name, blob: out });
}

function updateProgress(pct){
  if(progressBar2) progressBar2.style.width = pct+'%';
  if(progressText2) progressText2.textContent = pct+'%';
  if(progressTitle){
    progressTitle.textContent = pct>=100 ? 'Gotowe' : 'Pracujemy nad Twoimi plikami…';
  }
}

function resetState(){
  files = [];
  results = [];
  selectedFormat='';
  renderFileList();
  updateProgress(0);
  if(downloadAllBtn){
    downloadAllBtn.classList.add('disabled');
    downloadAllBtn.setAttribute('aria-disabled','true');
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.textContent='Pobierz';
  }
  onFilesChanged();
}

function updateDownloadLink(){
  if(!downloadAllBtn) return;
  if(!results.length){
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.removeAttribute('download');
    downloadAllBtn.classList.add('disabled');
    downloadAllBtn.setAttribute('aria-disabled','true');
    downloadAllBtn.textContent='Pobierz';
    return;
  }
  if(results.length===1){
    const r=results[0];
    const url=URL.createObjectURL(r.blob);
    downloadAllBtn.href=url;
    downloadAllBtn.download=r.name;
    downloadAllBtn.classList.remove('disabled');
    downloadAllBtn.removeAttribute('aria-disabled');
    downloadAllBtn.textContent='Pobierz';
    return;
  }
  const header=new TextEncoder().encode(`PACK\nItems:${results.length}\n\n`);
  const parts=[header];
  results.forEach((r,idx)=>{
    const meta=new TextEncoder().encode(`--FILE ${idx+1}-- ${r.name}\n`);
    parts.push(meta);
    parts.push(r.blob);
    parts.push(new TextEncoder().encode('\n'));
  });
  const pack=new Blob(parts,{type:'application/octet-stream'});
  const url=URL.createObjectURL(pack);
  downloadAllBtn.href=url;
  downloadAllBtn.download='converted-pack.tar';
  downloadAllBtn.classList.remove('disabled');
  downloadAllBtn.removeAttribute('aria-disabled');
  downloadAllBtn.textContent='Pobierz wszystkie';
}

async function runConversion(){
  if(!files.length){
    toast('Brak plików do konwersji','err');
    return;
  }
  results = [];
  updateProgress(0);
  showPage('progress');
  const concurrency = Math.max(1, Math.min(4, navigator.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency/2) : 2));
  let completed=0;
  const total=files.length;
  const pool = [];
  for(const f of files){
    const task = async ()=>{
      await convertFile(f, selectedFormat);
      completed++;
      const pct = Math.round((completed/total)*100);
      updateProgress(pct);
    };
    pool.push(task);
  }
  const executing = [];
  while(pool.length){
    while(executing.length < concurrency && pool.length){
      const fn = pool.shift();
      const p = fn();
      executing.push(p);
      p.finally(()=>{ executing.splice(executing.indexOf(p),1); });
    }
    await Promise.race(executing);
  }
  await Promise.all(executing);
  updateProgress(100);
  updateDownloadLink();
  toast('Konwersja zakończona','ok');
}

function attachEventListeners(){
  $$('.chip').forEach(c=>{
    c.addEventListener('click', e=>{
      e.preventDefault();
      const r=c.getAttribute('data-route');
      if(r) showPage(r);
    });
  });

  ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e=>{
    e.preventDefault(); e.stopPropagation(); dropEl.classList.add('drag');
  }));
  ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e=>{
    e.preventDefault(); e.stopPropagation(); dropEl.classList.remove('drag');
  }));
  dropEl.addEventListener('drop', e=>{
    const dt=e.dataTransfer;
    if(dt && dt.files) addFiles(dt.files);
  });
  browseBtn.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', ()=>{
    if(fileInput.files) addFiles(fileInput.files);
  });

  convertBtn.addEventListener('click', async ()=>{
    await runConversion();
  });

  convertMoreBtn.addEventListener('click', ()=>{
    resetState();
    showPage('home');
  });
}

function addFiles(list){
  for(const f of list){
    if(!f.name) continue;
    files.push(f);
  }
  renderFileList();
  onFilesChanged();
}

window.addEventListener('DOMContentLoaded', ()=>{
  dropEl = document.getElementById('drop');
  fileInput = document.getElementById('fileInput');
  fileListEl = document.getElementById('fileList');
  convertBtn = document.getElementById('convertBtn');
  browseBtn = document.getElementById('browseBtn');
  formatOptionsEl = document.getElementById('formatOptions');
  progressBar2 = document.getElementById('progressBar2');
  progressText2 = document.getElementById('progressText2');
  progressTitle = document.getElementById('progressTitle');
  downloadAllBtn = document.getElementById('downloadAll');
  convertMoreBtn = document.getElementById('convertMore');

  attachEventListeners();
  resetState();
  showPage('home');
});
