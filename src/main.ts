import { Renderer, type Source } from './engine';
import {
  DEFAULTS, PRESETS, SECTIONS, STYLES, applyPreset, load, save,
  type Control, type Key, type Settings,
} from './settings';
import { hexToRgb } from './core';
import { makeSample } from './sample';
import { exportImage, exportText, exportVideo, canExportVideo } from './export';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings = load();
let activePreset: string | null = null;
let source: Source | null = null;
let sourceName = '';
let video: HTMLVideoElement | null = null;
let objectUrl: string | null = null;
let compareX: number | null = null;
let dirty = true;
let lastText = '';
const renderer = new Renderer();
const thumbRenderer = new Renderer();
const out = $<HTMLCanvasElement>('out');
const wrap = $<HTMLDivElement>('canvas-wrap');
const t0 = performance.now();
let sourceSeq = 0;

// ---------- toast
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- source loading
function setSource(el: CanvasImageSource, w: number, h: number, name: string) {
  source = { el, w, h, id: ++sourceSeq };
  sourceName = name;
  dirty = true;
  scheduleThumbs();
}

function loadSample() {
  clearVideo();
  const c = makeSample();
  setSource(c, c.width, c.height, 'Demo scene');
}

function clearVideo() {
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video = null;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  $('video-controls').hidden = true;
}

const MAX_SIDE = 4096;
async function loadFile(f: File) {
  if (f.type.startsWith('video/')) {
    clearVideo();
    objectUrl = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.src = objectUrl;
    try {
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error('decode'));
      });
    } catch {
      toast('This browser cannot play that video file.');
      return;
    }
    video = v;
    setSource(v, v.videoWidth, v.videoHeight, f.name);
    $('video-controls').hidden = false;
    v.play().catch(() => {});
    syncPlayButton();
    return;
  }
  if (!f.type.startsWith('image/')) {
    toast('That file is not an image or video.');
    return;
  }
  try {
    const bmp = await createImageBitmap(f);
    let el: CanvasImageSource = bmp;
    let w = bmp.width, h = bmp.height;
    if (Math.max(w, h) > MAX_SIDE) {
      const k = MAX_SIDE / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      el = c;
      w = c.width;
      h = c.height;
    }
    clearVideo();
    setSource(el, w, h, f.name);
  } catch {
    toast('Could not read that image.');
  }
}

$('btn-open').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
  (e.target as HTMLInputElement).value = '';
});
$('btn-sample').addEventListener('click', loadSample);

// drag and drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  $('drop').hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop').hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
window.addEventListener('paste', (e) => {
  const f = Array.from(e.clipboardData?.files ?? [])[0];
  if (f) loadFile(f);
});

// ---------- video controls
function syncPlayButton() {
  const b = $('btn-play');
  const paused = !video || video.paused;
  b.classList.toggle('paused', paused);
  b.setAttribute('aria-label', paused ? 'Play' : 'Pause');
}
$('btn-play').addEventListener('click', () => {
  if (!video) return;
  if (video.paused) video.play();
  else video.pause();
  syncPlayButton();
  dirty = true;
});
$<HTMLInputElement>('seek').addEventListener('input', (e) => {
  if (!video || !video.duration) return;
  video.currentTime = (Number((e.target as HTMLInputElement).value) / 1000) * video.duration;
  dirty = true;
});
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- compare + fullscreen
$('btn-compare').addEventListener('click', () => {
  compareX = compareX == null ? 0.5 : null;
  $('btn-compare').setAttribute('aria-pressed', String(compareX != null));
  wrap.classList.toggle('comparing', compareX != null);
  dirty = true;
});
function compareFromEvent(e: PointerEvent) {
  const r = out.getBoundingClientRect();
  compareX = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  dirty = true;
}
out.addEventListener('pointerdown', (e) => {
  if (compareX == null) return;
  out.setPointerCapture(e.pointerId);
  compareFromEvent(e);
});
out.addEventListener('pointermove', (e) => {
  if (compareX == null || !(e.buttons & 1)) return;
  compareFromEvent(e);
});
$('btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('preview').requestFullscreen?.();
});
document.addEventListener('fullscreenchange', () => (dirty = true));

// ---------- sidebar
type Bound = { el: HTMLElement; when?: (s: Settings) => boolean; sync: () => void };
const bound: Bound[] = [];
const sections: { el: HTMLElement; when?: (s: Settings) => boolean }[] = [];

function set<K extends Key>(k: K, v: Settings[K], fromPreset = false) {
  settings = { ...settings, [k]: v };
  if (!fromPreset) markPreset(null);
  save(settings);
  dirty = true;
  refreshControls();
}

function presetBase(): Settings {
  const p = PRESETS.find((x) => x.id === activePreset);
  return p ? applyPreset(p) : DEFAULTS;
}

function chevron() {
  return '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
}

function buildSection(title: string, id: string, when?: (s: Settings) => boolean): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'sec';
  sec.dataset.id = id;
  const closedKey = `sec-closed-${id}`;
  if (localStorage.getItem(closedKey) === '1') sec.classList.add('closed');
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'sec-head';
  head.innerHTML = `<span class="eyebrow">${title}</span>${chevron()}`;
  head.setAttribute('aria-expanded', String(!sec.classList.contains('closed')));
  head.addEventListener('click', () => {
    sec.classList.toggle('closed');
    const closed = sec.classList.contains('closed');
    head.setAttribute('aria-expanded', String(!closed));
    try { localStorage.setItem(closedKey, closed ? '1' : '0'); } catch { /* ignore */ }
  });
  const body = document.createElement('div');
  body.className = 'sec-body';
  sec.append(head, body);
  $('controls').append(sec);
  sections.push({ el: sec, when });
  return body;
}

function buildControl(c: Control & { when?: (s: Settings) => boolean }): HTMLElement {
  const wrapEl = document.createElement('div');
  wrapEl.className = 'field';
  const uid = `c-${'key' in c ? c.key : Math.random().toString(36).slice(2)}`;
  let sync = () => {};
  switch (c.kind) {
    case 'range': {
      const fmt = c.fmt ?? ((v: number) => `${Math.round(v)}${c.unit ?? ''}`);
      wrapEl.innerHTML = `<div class="field-row"><label class="label" for="${uid}">${c.label}</label><span class="val"></span></div>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = uid;
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step ?? 1);
      input.title = 'Double-click to reset';
      const val = wrapEl.querySelector('.val')!;
      input.addEventListener('input', () => set(c.key, Number(input.value) as never));
      input.addEventListener('dblclick', () => set(c.key, presetBase()[c.key] as never));
      wrapEl.append(input);
      sync = () => {
        const v = settings[c.key] as number;
        input.value = String(v);
        val.textContent = fmt(v);
        input.setAttribute('aria-valuetext', fmt(v));
      };
      break;
    }
    case 'switch': {
      wrapEl.innerHTML = `<div class="field-row"><span class="label" id="${uid}-l">${c.label}</span></div>`;
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'switch';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-labelledby', `${uid}-l`);
      sw.addEventListener('click', () => set(c.key, !settings[c.key] as never));
      wrapEl.querySelector('.field-row')!.append(sw);
      if (c.hint) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = c.hint;
        wrapEl.append(p);
      }
      sync = () => sw.setAttribute('aria-checked', String(!!settings[c.key]));
      break;
    }
    case 'seg': {
      wrapEl.innerHTML = `<span class="label" id="${uid}-l">${c.label}</span>`;
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-labelledby', `${uid}-l`);
      const btns = c.options.map(([v, l]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = l;
        b.dataset.v = v;
        b.addEventListener('click', () => set(c.key, v as never));
        seg.append(b);
        return b;
      });
      wrapEl.append(seg);
      sync = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings[c.key])));
      break;
    }
    case 'color': {
      wrapEl.innerHTML = `<span class="label" id="${uid}-l">${c.label}</span>`;
      const row = document.createElement('div');
      row.className = 'color';
      const pick = document.createElement('input');
      pick.type = 'color';
      pick.setAttribute('aria-labelledby', `${uid}-l`);
      const hex = document.createElement('input');
      hex.className = 'text-in';
      hex.setAttribute('aria-label', `${c.label} hex`);
      hex.spellcheck = false;
      pick.addEventListener('input', () => set(c.key, pick.value as never));
      hex.addEventListener('input', () => {
        const ok = hexToRgb(hex.value);
        hex.classList.toggle('bad', !ok);
        if (ok) set(c.key, (hex.value.startsWith('#') ? hex.value : '#' + hex.value) as never);
      });
      row.append(pick, hex);
      wrapEl.append(row);
      sync = () => {
        const v = settings[c.key] as string;
        const rgb = hexToRgb(v);
        if (rgb) pick.value = '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
        if (document.activeElement !== hex) {
          hex.value = v;
          hex.classList.remove('bad');
        }
      };
      break;
    }
    case 'text': {
      wrapEl.innerHTML = `<label class="label" for="${uid}">${c.label}</label>`;
      const t = document.createElement('input');
      t.id = uid;
      t.className = 'text-in';
      t.placeholder = c.placeholder ?? '';
      t.spellcheck = false;
      t.addEventListener('input', () => set(c.key, t.value as never));
      wrapEl.append(t);
      sync = () => {
        if (document.activeElement !== t) t.value = settings[c.key] as string;
      };
      break;
    }
    case 'note': {
      wrapEl.innerHTML = `<p class="note"></p>`;
      wrapEl.querySelector('p')!.textContent = c.text;
      break;
    }
  }
  bound.push({ el: wrapEl, when: c.when, sync });
  return wrapEl;
}

function buildSidebar() {
  const body = buildSection('Style', 'style');
  const grid = document.createElement('div');
  grid.className = 'styles';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Style');
  const tiles = STYLES.map((st) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-tile';
    b.dataset.v = st.id;
    b.innerHTML = `<b aria-hidden="true"></b><small></small>`;
    b.querySelector('b')!.textContent = st.sample;
    b.querySelector('small')!.textContent = st.label;
    b.addEventListener('click', () => set('style', st.id));
    grid.append(b);
    return b;
  });
  body.append(grid);
  bound.push({ el: grid, sync: () => tiles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings.style))) });
  for (const sec of SECTIONS) {
    const b = buildSection(sec.title, sec.id, sec.when);
    for (const c of sec.controls) b.append(buildControl(c));
  }
}

function refreshControls() {
  for (const b of bound) {
    b.el.hidden = b.when ? !b.when(settings) : false;
    b.sync();
  }
  for (const s of sections) s.el.hidden = s.when ? !s.when(settings) : false;
  const glyphText = ['classic', 'detailed', 'blocks', 'sparse', 'binary', 'custom', 'braille', 'quads', 'tiles'].includes(settings.style);
  $<HTMLButtonElement>('btn-text').disabled = !glyphText;
  $<HTMLButtonElement>('btn-text').title = glyphText ? 'Copy the characters as plain text' : 'This style draws shapes, not characters';
}

// ---------- presets
const presetEls = new Map<string, { btn: HTMLButtonElement; cv: HTMLCanvasElement }>();
function buildPresets() {
  const row = $('preset-row');
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.setAttribute('aria-pressed', 'false');
    if (p.hint) btn.title = p.hint;
    const cv = document.createElement('canvas');
    cv.width = 224;
    cv.height = 144;
    const label = document.createElement('span');
    label.textContent = p.label;
    btn.append(cv, label);
    btn.addEventListener('click', () => {
      settings = applyPreset(p);
      save(settings);
      markPreset(p.id);
      dirty = true;
      refreshControls();
    });
    row.append(btn);
    presetEls.set(p.id, { btn, cv });
  }
  $('pre-left').addEventListener('click', () => row.scrollBy({ left: -360 }));
  $('pre-right').addEventListener('click', () => row.scrollBy({ left: 360 }));
}
function markPreset(id: string | null) {
  activePreset = id;
  presetEls.forEach((v, k) => v.btn.setAttribute('aria-pressed', String(k === id)));
}

let thumbQueue: string[] = [];
let thumbTimer = 0;
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = window.setTimeout(() => {
    thumbQueue = PRESETS.map((p) => p.id);
    pumpThumbs();
  }, 120);
}
function pumpThumbs() {
  const id = thumbQueue.shift();
  if (!id || !source) return;
  const p = PRESETS.find((x) => x.id === id)!;
  const el = presetEls.get(id)!;
  const s = applyPreset(p);
  s.cols = Math.min(s.cols, s.style === 'particles' ? 80 : 56);
  s.pAmount = 25;
  const tmp = document.createElement('canvas');
  thumbRenderer.render(tmp, source, s, { width: 224, time: 0.5, maxParticles: 25000 });
  const g = el.cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 224, 144);
  const k = Math.max(224 / tmp.width, 144 / tmp.height);
  g.drawImage(tmp, (224 - tmp.width * k) / 2, (144 - tmp.height * k) / 2, tmp.width * k, tmp.height * k);
  requestAnimationFrame(pumpThumbs);
}

// ---------- render loop
function previewWidth(): number {
  if (!source) return 300;
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const aspect = source.w / source.h;
  const w = Math.min(r.width, r.height * aspect);
  return Math.max(64, Math.floor(w * dpr));
}

function animating() {
  return (video && !video.paused) || settings.animate;
}

function frame() {
  requestAnimationFrame(frame);
  if (!source) return;
  if (!dirty && !animating()) return;
  dirty = false;
  const time = (performance.now() - t0) / 1000;
  const res = renderer.render(out, source, settings, { width: previewWidth(), time, compareX, wantText: false, maxParticles: 400_000 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  out.style.width = `${res.width / dpr}px`;
  out.style.height = `${res.height / dpr}px`;
  $('info').textContent = `${sourceName} · ${source.w}×${source.h} → ${res.cols}×${res.rows} cells`;
  if (video) {
    $<HTMLInputElement>('seek').value = String(video.duration ? (video.currentTime / video.duration) * 1000 : 0);
    $('time').textContent = fmtTime(video.currentTime);
  }
}
new ResizeObserver(() => (dirty = true)).observe(wrap);

// ---------- export
let exportKind: 'image' | 'video' = 'image';
let exportWidth = 1920;
let exportAbort: AbortController | null = null;
const dlg = $<HTMLDialogElement>('export');
function openExport(kind: 'image' | 'video') {
  if (!source) return;
  exportKind = kind;
  $('exp-title').textContent = kind === 'image' ? 'Save image' : 'Save video';
  let note = kind === 'image' ? 'PNG at the chosen width. Transparent if the background is set to None.' : '';
  if (kind === 'video') {
    if (!canExportVideo()) note = 'This browser cannot record canvas video.';
    else if (video) note = `Records the whole clip in real time (${fmtTime(video.duration || 0)}). Keep this tab open.`;
    else if (settings.animate || settings.style === 'particles' || settings.style === 'drift') note = 'Records a 6 second loop of the animation.';
    else note = 'A still picture with Animate off has nothing to move. Turn on Animate in Screen effects for a loop.';
  }
  $('exp-note').textContent = note;
  $('exp-progress').hidden = true;
  $<HTMLButtonElement>('exp-go').disabled = kind === 'video' && (!canExportVideo() || (!video && !settings.animate && settings.style !== 'particles' && settings.style !== 'drift'));
  dlg.showModal();
}
$('exp-size').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  exportWidth = Number(b.dataset.v);
  $('exp-size').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
dlg.addEventListener('close', () => exportAbort?.abort());
$('exp-go').addEventListener('click', async () => {
  if (!source) return;
  const go = $<HTMLButtonElement>('exp-go');
  go.disabled = true;
  try {
    if (exportKind === 'image') {
      await exportImage(source, settings, exportWidth, (performance.now() - t0) / 1000);
      dlg.close();
      toast('Image saved.');
    } else {
      exportAbort = new AbortController();
      $('exp-progress').hidden = false;
      const bar = $('exp-bar');
      await exportVideo(source, video, settings, exportWidth, (p) => (bar.style.width = `${Math.round(p * 100)}%`), exportAbort.signal);
      dlg.close();
      toast('Video saved.');
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') toast(`Export failed: ${(err as Error).message}`);
  } finally {
    go.disabled = false;
    exportAbort = null;
    video?.play().catch(() => {});
  }
});
$('btn-image').addEventListener('click', () => openExport('image'));
$('btn-video').addEventListener('click', () => openExport('video'));
$('btn-text').addEventListener('click', async () => {
  if (!source) return;
  lastText = exportText(source, settings);
  try {
    await navigator.clipboard.writeText(lastText);
    toast(`Copied ${lastText.split('\n').length} lines of text.`);
  } catch {
    const blob = new Blob([lastText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inkgrid.txt';
    a.click();
    toast('Clipboard blocked, saved as a .txt file instead.');
  }
});

// keyboard: space toggles video, o opens file
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || dlg.open) return;
  if (e.key === ' ' && video) {
    e.preventDefault();
    $('btn-play').click();
  }
  if (e.key === 'o' && !e.metaKey && !e.ctrlKey) $('btn-open').click();
});

// ---------- boot
buildSidebar();
buildPresets();
refreshControls();
document.fonts?.load('16px "JetBrains Mono"').finally(() => {
  loadSample();
  requestAnimationFrame(frame);
});
// expose for tests
(window as unknown as { __app: object }).__app = { get settings() { return settings; }, get source() { return source; } };
