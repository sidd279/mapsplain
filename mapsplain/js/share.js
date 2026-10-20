import { el, formatDistance, formatDuration } from './util.js';
import { SIGNATURE } from './personas.js';

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
let loader = null;

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML2CANVAS_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas did not load.')));
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not download the card renderer (html2canvas). Check your connection.'));
    };
    document.head.append(s);
  });
  return loader;
}

export function pickHighlights(directions, max = 4) {
  const scored = directions
    .filter((d) => d.kind !== 'arrive')
    .map((d) => ({ d, score: (d.landmark ? 3 : 0) + (d.overshoot ? 3 : 0) + (d.kind === 'depart' ? 1 : 0) + (d.landmark?.named ? 1 : 0) }));
  scored.sort((a, b) => b.score - a.score || a.d.index - b.d.index);
  const chosen = scored.slice(0, max - 1).map((s) => s.d).sort((a, b) => a.index - b.index);
  const arrival = directions.find((d) => d.kind === 'arrive');
  if (arrival) chosen.push(arrival);
  return chosen;
}

export function buildCard({ startLabel, endLabel, persona, directions, distance, duration, profileLabel, isDemo }) {
  const lines = pickHighlights(directions).map((d) =>
    el('li', { class: 'sc-line' }, el('span', { class: 'sc-num', text: String(d.index + 1) }), el('span', { text: d.text })),
  );
  return el(
    'div',
    { class: 'share-card' },
    el(
      'div',
      { class: 'sc-head' },
      el('img', { class: 'sc-logo', src: 'assets/logo.svg', alt: '' }),
      el('div', {}, el('div', { class: 'sc-brand', text: 'Mapsplain' }), el('div', { class: 'sc-sub', text: 'Directions, the way a local would give them' })),
    ),
    el(
      'div',
      { class: 'sc-route' },
      el('div', {}, el('span', { class: 'sc-dot sc-dot-a' }), el('span', { text: startLabel })),
      el('div', {}, el('span', { class: 'sc-dot sc-dot-b' }), el('span', { text: endLabel })),
    ),
    el(
      'div',
      { class: 'sc-meta' },
      el('span', { class: 'sc-pill', text: `${persona.emoji} ${persona.name}` }),
      Number.isFinite(distance) ? el('span', { class: 'sc-pill', text: `${formatDistance(distance)} · ${formatDuration(duration)}` }) : null,
      profileLabel ? el('span', { class: 'sc-pill', text: profileLabel }) : null,
      isDemo ? el('span', { class: 'sc-pill sc-pill-demo', text: 'Demo data' }) : null,
    ),
    el('ol', { class: 'sc-lines' }, lines),
    el('div', { class: 'sc-sign', text: SIGNATURE }),
    el('div', { class: 'sc-foot', text: 'Map & landmark data © OpenStreetMap contributors (ODbL) · Routing: OSRM · Not affiliated with Google Maps' }),
  );
}

export async function renderCard(node) {
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(node, { backgroundColor: null, scale: Math.min(2, window.devicePixelRatio || 1) * 1.5, useCORS: true, logging: false });
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png');
  });
}

export async function downloadCanvas(canvas, filename = 'mapsplain-directions.png') {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canShareFiles() {
  try {
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
    return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

export async function shareCanvas(canvas, text) {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], 'mapsplain-directions.png', { type: 'image/png' });
  await navigator.share({ files: [file], title: 'Mapsplain directions', text });
}
