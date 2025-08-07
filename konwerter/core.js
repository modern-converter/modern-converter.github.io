/* core.js  – 2025-08-04  (bez FFmpeg, z poprawnym resetState) */

import { convertImage }    from './image.js';
import { convertAudio }    from './audio.js';
import { convertDocument } from './document.js';
import { convertVideo }    from './video.js';
import { convertArchive }  from './archive.js';
import { convertCode }     from './code.js';

/* ——— utils ——— */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const humanSize = b => b>=1<<30 ? (b/(1<<30)).toFixed(2)+' GB'
  : b>=1<<20 ? (b/(1<<20)).toFixed(1)+' MB'
  : b>=1<<10 ? (b/(1<<10)).toFixed(1)+' KB' : b+' B';
const truncate = (s,n)=>s.length<=n?s:s.slice(0,n-1)+'…';

/* ——— global state ——— */
let files=[], results=[], selectedFormat='';

/* ——— mapy rozszerzeń ——— */
const extToCategory={
  png:'image',jpg:'image',jpeg:'image',webp:'image',avif:'image',bmp:'image',
  gif:'image',svg:'image',ico:'image',
  wav:'audio',mp3:'audio',m4a:'audio',ogg:'audio',opus:'audio',flac:'audio',
  aiff:'audio',aif:'audio',au:'audio',amr:'audio',alaw:'audio',ulaw:'audio',
  w64:'audio',caf:'audio',voc:'audio',ape:'audio',dff:'audio',dsf:'audio',raw:'audio',
  txt:'document',md:'document',html:'document',pdf:'document',rtf:'document',
  json:'code',csv:'code',js:'code',ndjson:'code',
  mp4:'video',webm:'video',mov:'video'
};
const defaultFormats={
  image:['png','jpeg','webp','avif'],
  audio:['mp3','wav','webm','ogg','flac','aiff','amr'],
  video:['mp4','webm'],
  document:['pdf','txt','md'],
  code:['json','csv'],
  archive:['zip-lite']
};
const formatLabels={
  png:'PNG',jpeg:'JPEG',webp:'WebP',avif:'AVIF',
  mp4:'MP4',webm:'WebM',mov:'MOV',
  mp3:'MP3',wav:'WAV',ogg:'OGG',flac:'FLAC',aiff:'AIFF',amr:'AMR',
  pdf:'PDF',txt:'TXT',md:'Markdown',json:'JSON',csv:'CSV',
  'zip-lite':'ZIP','tar-lite':'TAR'
};

/* ——— DOM refs (ustawiane w DOMContentLoaded) ——— */
let dropEl,fileInput,fileListEl,convertBtn,browseBtn,formatOptionsEl;
let progressBar2,progressText2,progressTitle,downloadAllBtn,convertMoreBtn;
let toastContainer;

/* ————————————————————————————————————————— */
/* 1. resetState – HOISTED deklaracja funkcji  */
function resetState(){
  files=[]; results=[]; selectedFormat='';
  renderFileList(); updateProgress(0);
  if(downloadAllBtn){
    downloadAllBtn.classList.add('disabled');
    downloadAllBtn.setAttribute('aria-disabled','true');
    downloadAllBtn.removeAttribute('href');
    downloadAllBtn.textContent='Pobierz';
  }
  onFilesChanged();
}

/* ————————————————— toast + page nav ————————————————— */
function toast(msg,type='ok'){
  if(!toastContainer){
    toastContainer=Object.assign(document.createElement('div'),
      {id:'toast-container',
       style:'position:fixed;top:10px;right:10px;z-index:9999'});
    document.body.appendChild(toastContainer);
  }
  const el=document.createElement('div');
  el.textContent=msg;
  el.style.cssText=`background:${type==='err'?'#ff4d4f':'#333'};color:#fff;
    padding:8px 14px;border-radius:6px;margin-top:6px;font-size:13px;
    opacity:0;transition:opacity .25s`;
  toastContainer.appendChild(el);
  requestAnimationFrame(()=>el.style.opacity='1');
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},2500);
}
function showPage(r){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+r));
  $$('.chip').forEach(c=>{
    if(c.dataset.route===r){c.classList.add('active');c.ariaCurrent='page';}
    else{c.classList.remove('active');c.removeAttribute('aria-current');}});
}

/* ————————————————— settings panel ————————————————— */
function buildFormatOptions(){
  if(!formatOptionsEl)return;
  formatOptionsEl.innerHTML='';
  let cat='document';
  if(files.length){
    const ext=(files[0].name.split('.').pop()||'').toLowerCase();
    cat=extToCategory[ext]||'document';
  }
  (defaultFormats[cat]||['txt']).forEach(fmt=>{
    const btn=Object.assign(document.createElement('button'),{
      type:'button',className:'format-option',
      textContent:formatLabels[fmt]||fmt.toUpperCase()
    });
    btn.dataset.fmt=fmt;
    if(fmt===selectedFormat){btn.classList.add('selected');btn.ariaPressed='true';}
    btn.onclick=()=>{selectedFormat=fmt;buildFormatOptions();};
    formatOptionsEl.appendChild(btn);
  });
}

/* ————————————————— file list ————————————————— */
function renderFileList(){
  if(!fileListEl)return;
  fileListEl.innerHTML='';
  files.forEach(f=>{
    const row=document.createElement('div');row.className='file';
    row.innerHTML=`
      <div class="icon"></div>
      <div class="meta"><b title="${f.name}">${truncate(f.name,38)}</b>
        <small>${humanSize(f.size)}</small></div>
      <div class="act"><button class="btn small" aria-label="Usuń">✕</button></div>`;
    row.querySelector('button').onclick=()=>{
      files=files.filter(x=>x!==f); onFilesChanged(); renderFileList();
    };
    fileListEl.appendChild(row);
  });
}
function onFilesChanged(){
  const panel=$('#settings-panel');
  if(!panel)return;
  if(files.length){
    panel.style.display='block';
    if(!selectedFormat){
      const ext=(files[0].name.split('.').pop()||'').toLowerCase();
      selectedFormat=(defaultFormats[extToCategory[ext]||'document']||['txt'])[0];
    }
    buildFormatOptions();
  }else panel.style.display='none';
}

/* ————————————————— progress ————————————————— */
const updateProgress=p=>{
  progressBar2 && (progressBar2.style.width=p+'%');
  progressText2 && (progressText2.textContent=p+'%');
  if(progressTitle)progressTitle.textContent=p>=100?'Gotowe':'Pracujemy…';
};

/* ————————————————— pojedynczy plik ————————————————— */
async function convertFile(file,fmt){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const cat=extToCategory[ext]||'document';
  let out;
  try{
    if(cat==='image')        out=await convertImage(file,fmt);
    else if(cat==='audio')   out=await convertAudio(file,fmt);
    else if(cat==='video')   out=await convertVideo(file,fmt);
    else if(cat==='document')out=await convertDocument(file,fmt);
    else if(cat==='archive') out=await convertArchive(file,fmt);
    else if(cat==='code')    out=await convertCode(file,fmt);
    else out=file.slice();
  }catch(e){console.warn(`Błąd konwersji "${file.name}" → ${fmt}:`,e); out=file.slice();}
  results.push({ name:file.name.replace(/\.[^.]+$/,'')+'.'+fmt.replace(/-lite$/,''), blob:out });
}

/* ————————————————— runConversion ————————————————— */
async function runConversion(){
  if(!files.length){toast('Brak plików','err');return;}
  results=[];updateProgress(0);showPage('progress');
  convertBtn && (convertBtn.disabled=true);

  const conc=Math.max(1, Math.min(4,
    navigator.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency/2) : 2));
  let done=0, fail=0;
  const queue=files.map(f=>async()=>{
    try{await convertFile(f,selectedFormat);}catch{fail++;}
    finally{done++;updateProgress(Math.round(done/files.length*100));}});
  const running=[];
  while(queue.length||running.length){
    while(running.length<conc&&queue.length){
      const job=queue.shift()();
      running.push(job); job.finally(()=>running.splice(running.indexOf(job),1));
    }
    await Promise.race(running);
  }
  await Promise.all(running);
  updateProgress(100);updateDownloadLink();
  toast(fail?`Zakończone z błędami (${fail})`:'Konwersja zakończona');
  convertBtn && (convertBtn.disabled=false);
}

/* ————————————————— download link ————————————————— */
function updateDownloadLink(){
  if(!downloadAllBtn)return;
  if(!results.length){
    downloadAllBtn.classList.add('disabled'); downloadAllBtn.textContent='Pobierz';
    downloadAllBtn.setAttribute('aria-disabled','true'); downloadAllBtn.removeAttribute('href');
    return;
  }
  downloadAllBtn.classList.remove('disabled'); downloadAllBtn.removeAttribute('aria-disabled');
  if(results.length===1){
    const {blob,name}=results[0];
    downloadAllBtn.href=URL.createObjectURL(blob); downloadAllBtn.download=name;
    downloadAllBtn.textContent='Pobierz';
    return;
  }
  const head=new TextEncoder().encode(`PACK\nItems:${results.length}\n\n`);
  const parts=[head];
  results.forEach((r,i)=>{
    parts.push(new TextEncoder().encode(`--FILE ${i+1}-- ${r.name}\n`));
    parts.push(r.blob); parts.push(new TextEncoder().encode('\n')); });
  const tar=new Blob(parts,{type:'application/octet-stream'});
  downloadAllBtn.href=URL.createObjectURL(tar);
  downloadAllBtn.download='converted-pack.tar';
  downloadAllBtn.textContent='Pobierz wszystkie';
}

/* ————————————————— addFiles ————————————————— */
function addFiles(list){ for(const f of list) if(f.name) files.push(f);
  renderFileList(); onFilesChanged(); }

/* ————————————————— event listeners ————————————————— */
function attachEventListeners(){
  $$('.chip').forEach(chip=>chip.onclick=e=>{
    e.preventDefault(); showPage(chip.dataset.route);
  });
  if(dropEl){
    ['dragenter','dragover'].forEach(ev=>dropEl.addEventListener(ev,e=>{
      e.preventDefault(); dropEl.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev=>dropEl.addEventListener(ev,e=>{
      e.preventDefault(); dropEl.classList.remove('drag'); }));
    dropEl.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
  }
  browseBtn?.addEventListener('click',()=>fileInput.click());
  fileInput?.addEventListener('change',()=>addFiles(fileInput.files));
  convertBtn?.addEventListener('click',runConversion);
  convertMoreBtn?.addEventListener('click',()=>{resetState();showPage('home');});
}

/* ————————————————— DOMContentLoaded ————————————————— */
window.addEventListener('DOMContentLoaded',()=>{
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
  resetState();          // <— funkcja już istnieje
  showPage('home');
});
