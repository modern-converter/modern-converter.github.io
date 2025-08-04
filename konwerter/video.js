// video.js  — wersja BEZ FFmpeg (2025-08-04)

/**
 * Zwraca Promise z nagranym WebM lub oryginałem, jeżeli konwersja niemożliwa.
 * @param {File|Blob} file        wejściowy plik wideo
 * @param {string}    fmt         docelowy format ('webm' | 'mp4' | 'mov' | 'mkv')
 * @param {Object}    opt         { fps: 30 }
 * @returns {Promise<Blob>}
 */
async function convertVideo(file, fmt, opt = {}) {
  const target = (fmt || '').toLowerCase().replace(/-lite$/, '');
  const srcExt = (file.name?.split('.').pop() || '').toLowerCase();

  /* 1) nic do roboty */
  if (srcExt === target) return file.slice();

  /* 2) jedyny realny transkoder w przeglądarce → MediaRecorder → WebM */
  if (target === 'webm' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    try {
      return await transcodeToWebm(file, opt.fps || 30);
    } catch (err) {
      console.warn('WebM transcode error, zwracam oryginał:', err);
      return file.slice();
    }
  }

  /* 3) wszystkiego innego nie zrobimy bez FFmpeg */
  console.warn(`Brak natywnego transkodera ${srcExt} → ${target}; zwracam oryginał.`);
  return file.slice();
}

/* ─────────────────────────────────────────────────────────────── */
/*        helpers – video → canvas → MediaRecorder (WebM)          */
async function transcodeToWebm(file, fps) {
  const blobURL = URL.createObjectURL(file);
  const video   = Object.assign(document.createElement('video'), {
    src: blobURL,
    muted: true,
    playsInline: true,
    crossOrigin: 'anonymous',
  });
  await video.play().catch(()=>{});        // inicjalizacja, może zwrócić Promise
  await new Promise(r => video.onloadeddata = r);

  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) throw new Error('Nie można odczytać wymiarów wideo');

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9,opus',
    audioBitsPerSecond: 128_000,
    videoBitsPerSecond: 2_500_000,
  });

  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);

  rec.start(100); // ms

  return new Promise((resolve, reject) => {
    video.onseeked = draw;
    video.onended  = finish;
    draw();

    function draw() {
      if (video.ended) return;
      ctx.drawImage(video, 0, 0, w, h);
      setTimeout(() => {
        video.currentTime += 1 / fps;
      }, 0);
    }
    function finish() {
      rec.stop();
      rec.onstop = () => {
        URL.revokeObjectURL(blobURL);
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
    }
  });
}

/* ─────────────────────────────────────────────────────────────── */
export { convertVideo };
export default convertVideo;
export const supportedVideoFormats = ['webm'];  // bo na razie tylko to możemy generować
