// What the server needs to know about a video it doesn't decode itself:
// its frame size, its length, and a frame to make the thumbnail from.
export type VideoFileInfo = {
  width: number;
  height: number;
  // Seconds.
  duration: number;
  poster: Blob;
};

// The poster frame: a moment in (black first frames are common), at most
// this many pixels on its longer side.
const POSTER_AT_SECONDS = 1;
const POSTER_MAX_SIZE = 1920;

function once(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('unplayable')); };
    const cleanup = () => {
      video.removeEventListener(event, done);
      video.removeEventListener('error', failed);
    };
    video.addEventListener(event, done);
    video.addEventListener('error', failed);
  });
}

// Some WebMs (e.g. from screen recorders) don't store their length, so the
// browser reports Infinity until it has seen the end: seeking far past it
// makes the browser find it.
async function finiteDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration;
  const found = once(video, 'durationchange');
  video.currentTime = Number.MAX_SAFE_INTEGER;
  await found;
  return video.duration;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Browsers that can't encode WebP fall back to PNG on their own.
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No poster'))), 'image/webp', 0.9);
  });
}

// Reads a picked video file in the browser. Rejects when the browser can't
// play it (e.g. an H.265 MP4 in a browser without that codec) - visitors'
// browsers wouldn't play it either.
export async function readVideoFile(file: File): Promise<VideoFileInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = once(video, 'loadeddata');
    video.src = url;
    await loaded;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('No picture');
    const duration = await finiteDuration(video);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('No length');

    const seeked = once(video, 'seeked');
    video.currentTime = Math.min(POSTER_AT_SECONDS, duration / 10);
    await seeked;

    const scale = Math.min(1, POSTER_MAX_SIZE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { width, height, duration, poster: await toBlob(canvas) };
  } catch {
    throw new Error('This video can\'t be played in the browser. Export it as an H.264 MP4 or a WebM and try again.');
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
