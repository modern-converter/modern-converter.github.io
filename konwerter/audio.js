/* audio.js – 2025-08-04 (bez FFmpeg, lamejs via <script>) */

const LAME_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js';

/* -------------------------------------------------- */
export async function convertAudio(file, fmt, opt = {}) {
  const target = (fmt || 'wav').toLowerCase();
  const srcExt = (file.name?.split('.').pop() || '').toLowerCase();
  if (srcExt === target) return { blob: file.slice(), ext: target };          // nic do roboty

  /* 1. dekoduj wejście */
  let buffer;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    buffer = await ac.decodeAudioData(await file.arrayBuffer());
    ac.close();
  } catch { return { blob: await synthTone(), ext: 'wav' }; }

  /* 2. kodery */
  if (target === 'wav')  return { blob: pcmToWav(buffer), ext: 'wav' };
  if (target === 'webm') return { blob: await pcmToWebm(buffer, opt.bitrate || 128), ext: 'webm' };
  if (target === 'mp3')  return { blob: await pcmToMp3(buffer,  opt.bitrate || 128), ext: 'mp3' };
  console.warn(`Brak kodera ${target}; zwracam WAV.`);
  return { blob: pcmToWav(buffer), ext: 'wav' };
}

/* ---------- MP3 (lamejs) ---------- */
let lameReady;
function loadLame() {
  if (lameReady) return lameReady;          // już w trakcie / gotowe
  lameReady = new Promise((resolve, reject) => {
    if (window.lamejs?.Mp3Encoder) return resolve();
    const s = document.createElement('script');
    s.src = LAME_URL; s.async = true;
    s.onload = () => window.lamejs?.Mp3Encoder ? resolve() : reject(new Error('lamejs brak Mp3Encoder'));
    s.onerror = () => reject(new Error('lamejs load error'));
    document.head.appendChild(s);
  });
  return lameReady;
}
async function pcmToMp3(buf, kbps) {
  await loadLame();                         // czekamy aż <script> się załaduje
  const lame = window.lamejs;
  const nch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const enc = new lame.Mp3Encoder(nch, sr, kbps);
  const pcm = new Int16Array(len * nch);
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nch; c++)
      pcm[i * nch + c] = Math.max(-32768, Math.min(32767, buf.getChannelData(c)[i] * 32767));
  const out = []; const chunk = enc.encodeBuffer(pcm); if (chunk.length) out.push(new Uint8Array(chunk));
  const flush = enc.flush(); if (flush.length) out.push(new Uint8Array(flush));
  return new Blob(out, { type:'audio/mpeg' });
}

/* ---------- WAV ---------- */
function pcmToWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const dv = new DataView(new ArrayBuffer(44 + len * ch * 2));
  let o=0, w=s=>{for(let i=0;i<s.length;i++)dv.setUint8(o++,s.charCodeAt(i));};
  w('RIFF'); dv.setUint32(o, 36+len*ch*2, true); o+=4; w('WAVEfmt ');
  dv.setUint32(o,16,true); o+=4; dv.setUint16(o,1,true); o+=2;
  dv.setUint16(o,ch,true); o+=2; dv.setUint32(o,sr,true); o+=4;
  dv.setUint32(o,sr*ch*2,true); o+=4; dv.setUint16(o,ch*2,true); o+=2;
  dv.setUint16(o,16,true); o+=2; w('data'); dv.setUint32(o,len*ch*2,true); o+=4;
  for(let i=0;i<len;i++)
    for(let c=0;c<ch;c++){
      const s=Math.max(-1,Math.min(1,buf.getChannelData(c)[i]));
      dv.setInt16(o, s<0?s*0x8000:s*0x7FFF, true); o+=2;
    }
  return new Blob([dv.buffer], { type:'audio/wav' });
}

/* ---------- WebM Opus ---------- */
async function pcmToWebm(buf, kbps) {
  const off = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(
    buf.numberOfChannels, buf.length, buf.sampleRate);
  const src=off.createBufferSource(); src.buffer=buf; src.connect(off.destination); src.start();
  const chunks=[];
  const rec=new MediaRecorder(off.destination.stream,{
    mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:kbps*1000});
  rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  rec.start(); await off.startRendering(); rec.stop();
  await new Promise(r=>rec.onstop=r);
  return new Blob(chunks,{type:'audio/webm'});
}

/* ---------- fallback sinus 440 Hz ---------- */
async function synthTone(){
  const sr=48000,len=sr*0.5;
  const ctx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,len,sr);
  const o=ctx.createOscillator(); o.frequency.value=440; o.connect(ctx.destination);
  o.start(); o.stop(0.5);
  return pcmToWav(await ctx.startRendering());
}
