// ffmpeg-auto.js  – „hot-fix” z wszystkimi eksportami do wideo
// © 2025-08-04

let ffmpegInstance = null;
let fetchFileFn     = null;
let loaded          = false;

/* ————————————————————————— CDN-y ————————————————————————— */
const LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/index.js';
const CORE_URL= 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/ffmpeg-core.js';

/* ————————————————————————— Loader ————————————————————————— */
export async function ensureFFmpeg({ log = false, timeoutMs = 25000 } = {}) {
  if (loaded && ffmpegInstance) return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };

  const { createFFmpeg, fetchFile } = await importWithTimeout(LIB_URL, timeoutMs);

  const ffmpeg = createFFmpeg({ log, corePath: CORE_URL });
  await Promise.race([
    ffmpeg.load(),
    timeout(timeoutMs, 'FFmpeg load timeout'),
  ]);

  ffmpegInstance = ffmpeg;
  fetchFileFn    = fetchFile;
  loaded         = true;
  return { ffmpeg: ffmpegInstance, fetchFile: fetchFileFn };
}

/* ————————————————————————— API wideo ————————————————————————— */
export const convertToMp4 = (f,o={}) => exec(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k','-movflags','+faststart'
],'out.mp4','video/mp4');

export const convertToWebm = (f,o={}) => exec(f,[
  '-c:v','libvpx-vp9','-crf',String(o.crf??30),'-b:v','0',
  '-c:a','libopus','-b:a',o.aBitrate||'128k'
],'out.webm','video/webm');

export const convertToMov = (f,o={}) => exec(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k'
],'out.mov','video/quicktime');

export const convertToMkv = (f,o={}) => exec(f,[
  '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
  '-c:a','aac','-b:a',o.aBitrate||'160k'
],'out.mkv','video/x-matroska');

/* ————————————————————————— API audio (jak wcześniej) ————————————————————————— */
export const convertMp4ToMp3 = (f,o={}) => exec(f,
  ['-vn','-b:a',o.bitrate||'192k','-f','mp3'],
  'out.mp3','audio/mpeg');

export const extractToWav = (f,o={}) => exec(f,
  ['-vn','-acodec','pcm_s16le','-ar',String(o.sampleRate??48000),'-ac','2'],
  'out.wav','audio/wav');

/* ————————————————————————— Helpers ————————————————————————— */
async function exec(file, args, outName, mime) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg();
  if (!ffmpeg) throw new Error('FFmpeg niedostępny – nie udało się załadować z CDN.');

  const inExt  = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `src.${inExt}`;

  ffmpeg.FS('writeFile', inName, await fetchFile(file));
  await ffmpeg.run('-i', inName, ...args, outName);
  const data = ffmpeg.FS('readFile', outName);
  try { ffmpeg.FS('unlink', inName); ffmpeg.FS('unlink', outName); } catch {}

  return new Blob([data.buffer], { type: mime });
}

const importWithTimeout = (url, ms) =>
  Promise.race([ import(/* @vite-ignore */ url), timeout(ms, `Import timeout ${url}`) ]);

const timeout = (ms, msg) =>
  new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
