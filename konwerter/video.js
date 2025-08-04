// video.js
import {
  convertToMp4,
  convertToWebm,
  convertToMov,
  convertToMkv,
} from './ffmpeg-auto.js';

/**
 * Konwertuje plik wideo do zadanego formatu.
 * @param {File|Blob} file - wejściowy plik wideo
 * @param {string} fmt - docelowy format, np. 'mp4', 'webm', 'mov', 'mkv'
 * @returns {Promise<Blob>} wynikowy blob wideo
 */
async function convertVideo(file, fmt) {
  const normalized = (fmt || '').replace(/-lite$/i, '').toLowerCase();
  const inputExt = (file.name?.split('.').pop() || '').toLowerCase();

  // Jeśli format docelowy jest taki sam jak źródłowy, zwróć kopię bez konwersji
  if (inputExt === normalized) {
    return file.slice();
  }

  try {
    switch (normalized) {
      case 'mp4':
        return await convertToMp4(file);
      case 'webm':
        return await convertToWebm(file);
      case 'mov':
        return await convertToMov(file);
      case 'mkv':
        return await convertToMkv(file);
      default:
        console.warn(`Nieobsługiwany format wideo: "${fmt}", zwracam oryginał.`); 
        return file.slice();
    }
  } catch (e) {
    console.error(`Błąd konwersji wideo do ${normalized}:`, e);
    return file.slice();
  }
}

// Named export i domyślny
export { convertVideo };
export default convertVideo;

// Dodatkowo: lista wspieranych formatów
export const supportedVideoFormats = ['mp4', 'webm', 'mov', 'mkv'];
