const PREFIX = 'mapsplain:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try { window.localStorage.removeItem(PREFIX + key); } catch { }
}

const DEFAULT_PREFS = {
  persona: 'uncle',
  profile: 'driving',
  treeMode: false,
  view: 'split',
  voiceLang: 'en',
};

export function loadPrefs() {
  return { ...DEFAULT_PREFS, ...read('prefs', {}) };
}

export function savePrefs(prefs) {
  write('prefs', prefs);
}

export function loadNicknames() {
  return read('nicknames', {});
}

export function setNickname(osmKey, nickname) {
  const all = loadNicknames();
  const clean = String(nickname || '').trim().slice(0, 40);
  if (clean) all[osmKey] = clean; else delete all[osmKey];
  write('nicknames', all);
  return all;
}

export function loadRecentPlaces() {
  return read('recentPlaces', []);
}

export function rememberPlace(place) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
  const list = loadRecentPlaces().filter(
    (p) => !(Math.abs(p.lat - place.lat) < 1e-5 && Math.abs(p.lon - place.lon) < 1e-5),
  );
  list.unshift({ label: place.label, short: place.short, lat: place.lat, lon: place.lon });
  write('recentPlaces', list.slice(0, 8));
}

export function getCachedGeocode(query) {
  const cache = read('geocodeCache', {});
  return cache[query.toLowerCase()] || null;
}

export function putCachedGeocode(query, results) {
  const cache = read('geocodeCache', {});
  cache[query.toLowerCase()] = results;
  const keys = Object.keys(cache);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach((k) => delete cache[k]);
  write('geocodeCache', cache);
}

export function saveLastResult(result) {
  if (!write('lastResult', result)) remove('lastResult');
}

export function loadLastResult() {
  return read('lastResult', null);
}
