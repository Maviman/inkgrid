import { Renderer, type Source } from './engine';
import type { Settings } from './settings';

const exporter = new Renderer();

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** Width that gives the requested long edge for this source's aspect. */
export function widthForLongEdge(src: Source, longEdge: number): number {
  return src.h > src.w ? Math.round((longEdge * src.w) / src.h) : longEdge;
}

export async function exportImage(src: Source, s: Settings, longEdge: number, time: number) {
  const c = document.createElement('canvas');
  exporter.render(c, src, s, { width: widthForLongEdge(src, longEdge), time, maxParticles: 4_000_000 });
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) throw new Error('the browser could not encode a PNG at this size');
  download(blob, `inkgrid-${stamp()}.png`);
}

export function exportText(src: Source, s: Settings): string {
  const c = document.createElement('canvas');
  const r = exporter.render(c, src, s, { width: Math.min(1600, s.cols * 6), wantText: true });
  return r.text ?? '';
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}
export const canExportVideo = () => !!pickMime() && 'captureStream' in HTMLCanvasElement.prototype;

export async function exportVideo(
  src: Source,
  video: HTMLVideoElement | null,
  s: Settings,
  longEdge: number,
  onProgress: (p: number) => void,
  signal: AbortSignal,
) {
  const mime = pickMime();
  if (!mime) throw new Error('no supported video format');
  const c = document.createElement('canvas');
  const width = widthForLongEdge(src, longEdge);
  exporter.render(c, src, s, { width, time: 0, maxParticles: 2_000_000 });
  const stream = c.captureStream(30);
  const bps = longEdge >= 3840 ? 40e6 : longEdge >= 1920 ? 14e6 : 7e6;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

  const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  if (video) {
    video.pause();
    const wasLoop = video.loop;
    video.loop = false;
    video.currentTime = 0;
    await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
    rec.start(250);
    await video.play();
    await new Promise<void>((res, rej) => {
      const tick = () => {
        if (signal.aborted) return rej(abortErr());
        exporter.render(c, src, s, { width, time: video.currentTime, maxParticles: 2_000_000 });
        onProgress(video.duration ? video.currentTime / video.duration : 0);
        if (video.ended) return res();
        requestAnimationFrame(tick);
      };
      tick();
    }).finally(() => {
      video.loop = wasLoop;
    });
  } else {
    const dur = 6;
    rec.start(250);
    const start = performance.now();
    await new Promise<void>((res, rej) => {
      const tick = () => {
        if (signal.aborted) return rej(abortErr());
        const t = (performance.now() - start) / 1000;
        exporter.render(c, src, s, { width, time: t, maxParticles: 2_000_000 });
        onProgress(t / dur);
        if (t >= dur) return res();
        requestAnimationFrame(tick);
      };
      tick();
    }).catch((e) => {
      rec.stop();
      throw e;
    });
  }
  rec.stop();
  await stopped;
  onProgress(1);
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime.split(';')[0] }), `inkgrid-${stamp()}.${ext}`);
}
