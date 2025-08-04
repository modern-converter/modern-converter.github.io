/* ffmpeg-auto.js – FULL ESM BUILD (2025-08-04)
   Eksportuje:  ensureFFmpeg  convertToMp4  convertToWebm
                convertToMov  convertToMkv convertMp4ToMp3
                extractToWav                                       */

import { createFFmpeg, fetchFile } from
  'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/index.js';

const CORE = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/ffmpeg-core.js';
let ffmpeg;

/* ————————————————— ensureFFmpeg ————————————————— */
export async function ensureFFmpeg({ log=false } = {}) {
  if (ffmpeg) return ffmpeg;
  ffmpeg = createFFmpeg({ log, corePath: CORE });
  await ffmpeg.load();
  return ffmpeg;
}

/* ————————————————— helper ————————————————— */
async function run(file, args, out, mime, opt={}) {
  const ff = await ensureFFmpeg(opt);
  const inExt  = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `src.${inExt}`;

  ff.FS('writeFile', inName, await fetchFile(file));
  await ff.run('-i', inName, ...args, out);
  const data = ff.FS('readFile', out);
  try { ff.FS('unlink', inName); ff.FS('unlink', out); } catch {}
  return new Blob([data.buffer], { type: mime });
}

/* ————————————————— video ————————————————— */
export const convertToMp4 = (f,o={}) => run(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k','-movflags','+faststart'
],'out.mp4','video/mp4',o);

export const convertToWebm = (f,o={}) => run(f,[
  '-c:v','libvpx-vp9','-crf',String(o.crf??30),'-b:v','0',
  '-c:a','libopus','-b:a',o.aBitrate||'128k'
],'out.webm','video/webm',o);

export const convertToMov = (f,o={}) => run(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k'
],'out.mov','video/quicktime',o);

export const convertToMkv = (f,o={}) => run(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k'
],'out.mkv','video/x-matroska',o);

/* ————————————————— audio (przykład) ————————————————— */
export const convertMp4ToMp3 = (f,o={}) => run(f,
  ['-vn','-b:a',o.bitrate||'192k','-f','mp3'],
  'out.mp3','audio/mpeg',o);

export const extractToWav = (f,o={}) => run(f,
  ['-vn','-acodec','pcm_s16le','-ar',String(o.sampleRate??48000),'-ac','2'],
  'out.wav','audio/wav',o);
