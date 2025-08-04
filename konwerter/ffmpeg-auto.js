// ffmpeg-auto.js – 2025-08-04
// Ładowanie FFmpeg.wasm w czystej przeglądarce bez bundlera.

let ffmpeg, fetchFile, _loaded = false, _promise = null;

const LIB_CDN = [
  // gwarantujemy ?module → przepisywanie importów
  'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js?module',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js?module',
  'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/ffmpeg.min.js',
  'https://esm.sh/@ffmpeg/ffmpeg@0.12.15',
  'https://cdn.skypack.dev/@ffmpeg/ffmpeg@0.12.15'
];

const CORE_CDN = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.js'
];

export async function ensureFFmpeg({
  log = false,
  timeoutMs = 25_000,
  ffmpegLibs = LIB_CDN,
  corePaths  = CORE_CDN
} = {}) {
  if (_loaded && ffmpeg) return { ffmpeg, fetchFile };
  if (_promise) return _promise;

  _promise = (async () => {
    /* 1. Import biblioteki createFFmpeg/fetchFile z pierwszego działającego CDN-u */
    let createFFmpeg, _fetch, lastErr;
    for (const url of ffmpegLibs) {
      try {
        const mod = await importWithTimeout(url, timeoutMs);
        createFFmpeg = mod.createFFmpeg || mod.default?.createFFmpeg;
        _fetch       = mod.fetchFile   || mod.default?.fetchFile;
        if (createFFmpeg && _fetch) break;
      } catch (e) { lastErr = e; }
    }
    if (!createFFmpeg) {
      console.error('Nie udało się załadować żadnej wersji @ffmpeg/ffmpeg.', lastErr);
      return { ffmpeg: null, fetchFile: null };
    }

    /* 2. Ładuj FFmpeg-core z kolei CDN-ów  */
    for (const core of corePaths) {
      try {
        const inst = createFFmpeg({ log, corePath: core });
        await Promise.race([
          inst.load(),
          timeout(timeoutMs, `FFmpeg load timeout (${core})`)
        ]);
        ffmpeg = inst; fetchFile = _fetch; _loaded = true;
        return { ffmpeg, fetchFile };
      } catch (e) { lastErr = e; }
    }
    console.error('Żaden ffmpeg-core nie zadziałał.', lastErr);
    return { ffmpeg: null, fetchFile: null };
  })();

  return _promise;
}

/* ---------- POMOCNICZE ---------- */
const timeout = (ms, msg) => new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms));
const importWithTimeout = (u, ms) =>
  Promise.race([ import(/* @vite-ignore */ u), timeout(ms, `Import timeout (${u})`) ]);

async function exec(file, args, out, mime) {
  const { ffmpeg, fetchFile } = await ensureFFmpeg();
  if (!ffmpeg) throw new Error('FFmpeg niedostępny (wszystkie CDN-y padły)');
  const inName  = `i.${file.name.split('.').pop()}`;
  ffmpeg.FS('writeFile', inName, await fetchFile(file));
  await ffmpeg.run('-i', inName, ...args, out);
  const buf = ffmpeg.FS('readFile', out);
  try { ffmpeg.FS('unlink', inName); ffmpeg.FS('unlink', out); } catch {}
  return new Blob([buf.buffer], { type: mime });
}

/* ---------- API KONWERSJI – takie samo jak wcześniej ---------- */
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

export const convertMp4ToMp3 = (f,o={}) => exec(f,
  ['-vn','-b:a',o.bitrate||'192k','-f','mp3'],'out.mp3','audio/mpeg');

export const extractToWav = (f,o={}) => exec(f,
  ['-vn','-acodec','pcm_s16le','-ar',String(o.sampleRate??48_000),'-ac','2'],
  'out.wav','audio/wav');
