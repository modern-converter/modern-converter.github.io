/* ffmpeg-auto.js — 2025-08-04
   Minimalny loader + komplet eksportów MP4 / WebM / MOV / MKV          */

import { createFFmpeg, fetchFile } from
  'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/index.js';   // wersja ESM – zero bare-specifierów

const CORE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/ffmpeg-core.js';

let _ffmpeg = null;
async function ensureFFmpeg({ log = false } = {}) {
  if (_ffmpeg) return _ffmpeg;
  _ffmpeg = createFFmpeg({ log, corePath: CORE_URL });
  await _ffmpeg.load();
  return _ffmpeg;
}

/* ---------------- helper ---------------- */
async function exec(file, args, outName, mime, opts = {}) {
  const ff = await ensureFFmpeg(opts);
  const inExt  = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const inName = `src.${inExt}`;
  ff.FS('writeFile', inName, await fetchFile(file));
  await ff.run('-i', inName, ...args, outName);
  const buf = ff.FS('readFile', outName);
  try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch {}
  return new Blob([buf.buffer], { type: mime });
}

/* ---------------- wideo ---------------- */
export async function convertToMp4(file, o = {}) {
  return exec(file, [
    '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
    '-c:a','aac','-b:a',o.aBitrate||'160k','-movflags','+faststart'
  ], 'out.mp4', 'video/mp4', o);
}

export async function convertToWebm(file, o = {}) {
  return exec(file, [
    '-c:v','libvpx-vp9','-crf',String(o.crf??30),'-b:v','0',
    '-c:a','libopus','-b:a',o.aBitrate||'128k'
  ], 'out.webm', 'video/webm', o);
}

export async function convertToMov(file, o = {}) {
  return exec(file, [
    '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
    '-c:a','aac','-b:a',o.aBitrate||'160k'
  ], 'out.mov', 'video/quicktime', o);
}

export async function convertToMkv(file, o = {}) {
  return exec(file, [
    '-c:v','libx264','-preset',o.preset||'medium','-crf',String(o.crf??23),
    '-c:a','aac','-b:a',o.aBitrate||'160k'
  ], 'out.mkv', 'video/x-matroska', o);
}

/* ---------------- audio (przykładowo) ---------------- */
export async function convertMp4ToMp3(file, o = {}) {
  return exec(file, ['-vn','-b:a',o.bitrate||'192k','-f','mp3'],
              'out.mp3', 'audio/mpeg', o);
}
export async function extractToWav(file, o = {}) {
  return exec(file, ['-vn','-acodec','pcm_s16le','-ar',String(o.sampleRate??48000),'-ac','2'],
              'out.wav', 'audio/wav', o);
}

/* ---------------- default export (opcjonalnie) ---------------- */
export default {
  ensureFFmpeg,
  convertToMp4,
  convertToWebm,
  convertToMov,
  convertToMkv,
  convertMp4ToMp3,
  extractToWav,
};
