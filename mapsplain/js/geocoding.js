import { fetchJson, createRateLimiter, isValidLatLon, ApiError } from './util.js';
import { getCachedGeocode, putCachedGeocode } from './storage.js';

const BASE = 'https://nominatim.openstreetmap.org';
const schedule = createRateLimiter(1100);
const memoryCache = new Map();

function shortLabel(item) {
  const a = item.address || {};
  const first = item.name || a.amenity || a.shop || a.tourism || a.road || a.neighbourhood || a.suburb;
  const area = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.village || a.state;
  if (first && area && first !== area) return `${first}, ${area}`;
  return first || (item.display_name || '').split(',').slice(0, 2).join(',').trim() || 'Selected place';
}

function normalise(item) {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!isValidLatLon(lat, lon)) return null;
  return {
    label: item.display_name || shortLabel(item),
    short: shortLabel(item),
    lat,
    lon,
    type: item.type || item.category || '',
  };
}

export async function searchPlaces(query, { signal, near } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) throw new ApiError('Type at least 3 characters to search.', { kind: 'data' });
  const key = q.toLowerCase();
  if (memoryCache.has(key)) return memoryCache.get(key);
  const stored = getCachedGeocode(q);
  if (stored) {
    memoryCache.set(key, stored);
    return stored;
  }
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    'accept-language': 'en',
  });
  if (near && isValidLatLon(near.lat, near.lon)) {
    const d = 0.6;
    params.set('viewbox', [near.lon - d, near.lat + d, near.lon + d, near.lat - d].join(','));
  }
  const data = await schedule(() => fetchJson(`${BASE}/search?${params}`, { signal, timeout: 12000, headers: { Accept: 'application/json' } }));
  if (!Array.isArray(data)) throw new ApiError('Unexpected answer from the place search.', { kind: 'data' });
  const results = data.map(normalise).filter(Boolean);
  memoryCache.set(key, results);
  putCachedGeocode(q, results);
  return results;
}

export async function reversePlace(lat, lon, { signal } = {}) {
  if (!isValidLatLon(lat, lon)) throw new ApiError('Those coordinates are not valid.', { kind: 'data' });
  const key = `rev:${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (memoryCache.has(key)) return memoryCache.get(key);
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  });
  const data = await schedule(() => fetchJson(`${BASE}/reverse?${params}`, { signal, timeout: 10000 }));
  if (!data || data.error) throw new ApiError('No address found for that spot.', { kind: 'data' });
  const place = normalise({ ...data, lat, lon });
  memoryCache.set(key, place);
  return place;
}

export function pinLabel(lat, lon) {
  return `Dropped pin (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
}
