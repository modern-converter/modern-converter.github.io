// video.js  — bez FFmpeg
import { convertAudio } from './audio.js';

/* jedyny natywny koder wideo (WebM)  */
export const supportedVideoFormats = ['mp4','webm','mov','mkv','mp3','wav','webm-audio'];

async function convertVideo(file, fmt = 'webm') {
  const tgt = fmt.toLowerCase();
  const srcExt = (file.name?.split('.').pop()||'').toLowerCase();

  /* 1. Żądany audio-only → wytnij ścieżkę audio */
  if (['mp3','wav','webm','webm-audio'].includes(tgt)) {
    return extractAudio(file, tgt === 'webm-audio' ? 'webm' : tgt);
  }

  /* 2. WebM wideo (canvas capture) */
  if (tgt === 'webm') return mp4ToWebm(file);

  /* 3. Brak natywnej transkodacji → zwracamy oryginał */
  console.warn(`Transkodowanie ${srcExt} → ${tgt} wymaga FFmpeg; zwracam oryginał.`);
  return file.slice();
}
export { convertVideo as default };

/* ——— helper: MP4 → WebM (jw. jak poprzednio) ——— */
async function mp4ToWebm(file) {
  const url=URL.createObjectURL(file);
  const v=document.createElement('video');
  v.src=url; v.muted=true; await v.play().catch(()=>{});
  await new Promise(r=>v.onloadeddata=r);
  const {videoWidth:w,videoHeight:h}=v;
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  const stream=c.captureStream(30);
  const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus'});
  const chunks=[]; rec.ondataavailable=e=>e.data.size&&chunks.push(e.data); rec.start(100);
  function step(){
    if(v.ended){v.pause(); rec.stop(); return;}
    ctx.drawImage(v,0,0,w,h);
    requestAnimationFrame(step);
  }
  step();
  await new Promise(r=>rec.onstop=r);
  URL.revokeObjectURL(url);
  return new Blob(chunks,{type:'video/webm'});
}

/* ——— helper: wycinanie audio ——— */
async function extractAudio(file, targetFmt) {
  const url=URL.createObjectURL(file);
  const v=document.createElement('video'); v.src=url; v.crossOrigin='anonymous';
  const stream=v.captureStream();             // zawiera audio track (jeśli dekodowalne)
  const [audioTrack]=stream.getAudioTracks();
  if(!audioTrack){
    console.warn('Brak ścieżki audio - zwracam oryginał.');
    URL.revokeObjectURL(url);
    return file.slice();
  }
  // nagraj audio do WebM
  const rec=new MediaRecorder(new MediaStream([audioTrack]),
    { mimeType:'audio/webm;codecs=opus', audioBitsPerSecond:128000 });
  const chunks=[]; rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  await v.play().catch(()=>{}); rec.start();
  await new Promise(r=>v.onended=r);
  rec.stop(); await new Promise(r=>rec.onstop=r);
  URL.revokeObjectURL(url);
  const webmBlob=new Blob(chunks,{type:'audio/webm'});
  if(targetFmt==='webm') return webmBlob;     // bez konwersji
  // Konwertuj WebM→MP3/WAV przez convertAudio
  return convertAudio(webmBlob,targetFmt);
}

export { convertVideo };
