export class ApiError extends Error {
  constructor(message, { kind = 'network', status = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export async function fetchJson(url, { timeout = 15000, signal, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeout);
  const onOuterAbort = () => controller.abort('cancelled');
  if (signal) {
    if (signal.aborted) controller.abort('cancelled');
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 429) throw new ApiError('The service is rate-limiting us. Wait a minute and try again.', { kind: 'rate-limit', status: 429 });
    if (!res.ok) throw new ApiError(`The service answered with HTTP ${res.status}.`, { kind: 'http', status: res.status });
    try {
      return await res.json();
    } catch {
      throw new ApiError('The service sent back something that is not valid JSON.', { kind: 'data' });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason === 'cancelled') throw new ApiError('Request cancelled.', { kind: 'cancelled' });
      throw new ApiError('The service took too long to answer.', { kind: 'timeout' });
    }
    throw new ApiError('Could not reach the service. Check your internet connection.', { kind: 'network' });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

export function createRateLimiter(gapMs) {
  let last = 0;
  let chain = Promise.resolve();
  return function schedule(task) {
    const run = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return task();
    });
    chain = run.catch(() => {});
    return run;
  };
}

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function isValidLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function destinationPoint(lat, lon, bearing, dist) {
  const d = dist / R;
  const b = toRad(bearing);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [toDeg(p2), ((toDeg(l2) + 540) % 360) - 180];
}

export function distanceToPolyline(lat, lon, coords) {
  if (!coords || coords.length === 0) return Infinity;
  const kx = Math.cos(toRad(lat)) * 111320;
  const ky = 110540;
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - lon) * kx;
    const ay = (coords[i][1] - lat) * ky;
    const bx = (coords[i + 1][0] - lon) * kx;
    const by = (coords[i + 1][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  if (coords.length === 1) best = Math.hypot((coords[0][0] - lon) * kx, (coords[0][1] - lat) * ky);
  return best;
}

export function cardinal(bearing) {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatDuration(s) {
  if (!Number.isFinite(s)) return '—';
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
