import { fetchJson, isValidLatLon, ApiError, cardinal, formatDistance } from './util.js';

const ENDPOINTS = {
  driving: [
    { name: 'OSRM demo server (car)', base: 'https://router.project-osrm.org/route/v1/driving' },
    { name: 'FOSSGIS OSRM (car)', base: 'https://routing.openstreetmap.de/routed-car/route/v1/driving' },
  ],
  walking: [
    { name: 'FOSSGIS OSRM (foot)', base: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' },
  ],
};

export const PROFILE_LABELS = {
  driving: 'Driving (car profile)',
  walking: 'Walking (foot profile)',
};

export async function fetchRoute(start, end, profile = 'driving', { signal } = {}) {
  if (!start || !end || !isValidLatLon(start.lat, start.lon) || !isValidLatLon(end.lat, end.lon)) {
    throw new ApiError('Pick both a start and a destination first.', { kind: 'data' });
  }
  const endpoints = ENDPOINTS[profile] || ENDPOINTS.driving;
  const coords = `${start.lon.toFixed(6)},${start.lat.toFixed(6)};${end.lon.toFixed(6)},${end.lat.toFixed(6)}`;
  const query = 'overview=full&geometries=geojson&steps=true&alternatives=false';
  let lastError;
  for (const ep of endpoints) {
    try {
      const data = await fetchJson(`${ep.base}/${coords}?${query}`, { signal, timeout: 15000 });
      if (data.code === 'NoRoute') throw new ApiError('No road route connects these two points.', { kind: 'data' });
      if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
        throw new ApiError(data.message || 'The routing service could not find a route.', { kind: 'data' });
      }
      return { raw: trimRoute(data.routes[0]), source: ep.name, profile };
    } catch (err) {
      if (err.kind === 'cancelled' || err.kind === 'data') throw err;
      lastError = err;
    }
  }
  throw lastError || new ApiError('Routing failed.', { kind: 'network' });
}

export function trimRoute(route) {
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry,
    legs: route.legs.map((leg) => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: leg.steps.map((s) => ({
        distance: s.distance,
        duration: s.duration,
        name: s.name || '',
        ref: s.ref || '',
        mode: s.mode,
        maneuver: {
          type: s.maneuver.type,
          modifier: s.maneuver.modifier,
          exit: s.maneuver.exit,
          location: s.maneuver.location,
          bearing_before: s.maneuver.bearing_before,
          bearing_after: s.maneuver.bearing_after,
        },
      })),
    })),
  };
}

export function parseRoute(raw) {
  if (!raw || !raw.geometry || !Array.isArray(raw.legs)) throw new ApiError('Route data is incomplete.', { kind: 'data' });
  const steps = raw.legs.flatMap((l) => l.steps || []);
  const maneuvers = [];
  for (const s of steps) {
    const m = s.maneuver || {};
    const [lon, lat] = m.location || [];
    if (!isValidLatLon(lat, lon)) continue;
    if (m.type === 'notification') continue;
    const prev = maneuvers[maneuvers.length - 1];
    if (prev && m.type === 'new name' && s.name === prev.name) {
      prev.distance += s.distance;
      prev.duration += s.duration;
      continue;
    }
    maneuvers.push({
      type: m.type,
      modifier: m.modifier || (m.type === 'depart' || m.type === 'arrive' ? undefined : 'straight'),
      exit: m.exit,
      name: s.name || '',
      ref: s.ref || '',
      distance: s.distance,
      duration: s.duration,
      lat,
      lon,
      bearingBefore: m.bearing_before,
      bearingAfter: m.bearing_after,
    });
  }
  maneuvers.forEach((mv, i) => {
    mv.index = i;
    mv.approach = i === 0 ? 0 : maneuvers[i - 1].distance;
    mv.approachDuration = i === 0 ? 0 : maneuvers[i - 1].duration;
  });
  return {
    distance: raw.distance,
    duration: raw.duration,
    coords: raw.geometry.coordinates,
    maneuvers,
  };
}

export function turnKind(mv) {
  const mod = mv.modifier || 'straight';
  if (mv.type === 'depart') return 'depart';
  if (mv.type === 'arrive') return 'arrive';
  if (['roundabout', 'rotary'].includes(mv.type)) return 'roundabout';
  if (['exit roundabout', 'exit rotary'].includes(mv.type)) return 'exitRoundabout';
  if (mv.type === 'fork') return 'fork';
  if (mv.type === 'merge') return 'merge';
  if (mv.type === 'on ramp' || mv.type === 'off ramp') return 'ramp';
  if (mv.type === 'end of road') return 'endOfRoad';
  if (mod === 'uturn') return 'uturn';
  if ((mv.type === 'new name' || mv.type === 'continue' || mv.type === 'turn') && mod === 'straight') return 'straight';
  return 'turn';
}

export function directionWords(modifier) {
  switch (modifier) {
    case 'sharp left': return 'sharp left';
    case 'left': return 'left';
    case 'slight left': return 'slight left';
    case 'sharp right': return 'sharp right';
    case 'right': return 'right';
    case 'slight right': return 'slight right';
    case 'uturn': return 'U-turn';
    default: return 'straight';
  }
}

export function side(modifier) {
  if (!modifier) return '';
  if (modifier.includes('left')) return 'left';
  if (modifier.includes('right')) return 'right';
  return '';
}

export function ordinal(n) {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suf}`;
}

export function streetLabel(mv) {
  if (mv.name && mv.ref) return `${mv.name} (${mv.ref})`;
  return mv.name || mv.ref || '';
}

export function arrowFor(mv) {
  const k = turnKind(mv);
  if (k === 'depart') return '●';
  if (k === 'arrive') return '◎';
  if (k === 'roundabout' || k === 'exitRoundabout') return '⟳';
  if (k === 'uturn') return '⤺';
  const map = {
    'sharp left': '↙', left: '↰', 'slight left': '↖',
    'sharp right': '↘', right: '↱', 'slight right': '↗',
  };
  return map[mv.modifier] || '↑';
}

export function conventionalInstruction(mv) {
  const street = streetLabel(mv);
  const onto = street ? ` onto ${street}` : '';
  const dir = directionWords(mv.modifier);
  switch (turnKind(mv)) {
    case 'depart':
      return `Head ${cardinal(mv.bearingAfter ?? 0)}${street ? ` on ${street}` : ''}`;
    case 'arrive': {
      const s = side(mv.modifier);
      return `Arrive at your destination${s ? `, on the ${s}` : ''}`;
    }
    case 'roundabout':
      return mv.exit ? `At the roundabout, take the ${ordinal(mv.exit)} exit${onto}` : `Enter the roundabout${onto}`;
    case 'exitRoundabout':
      return `Exit the roundabout${onto}`;
    case 'fork':
      return `Keep ${side(mv.modifier) || 'straight'} at the fork${onto}`;
    case 'merge':
      return `Merge ${side(mv.modifier) || 'ahead'}${onto}`;
    case 'ramp':
      return `Take the ${mv.type === 'off ramp' ? 'exit' : 'ramp'}${side(mv.modifier) ? ` on the ${side(mv.modifier)}` : ''}${onto}`;
    case 'endOfRoad':
      return `At the end of the road, turn ${dir}${onto}`;
    case 'uturn':
      return `Make a U-turn${onto}`;
    case 'straight':
      return `Continue straight${onto}`;
    default:
      return `Turn ${dir}${onto}`;
  }
}

export function conventionalLine(mv) {
  const text = conventionalInstruction(mv);
  if (mv.index === 0) return `${text} for ${formatDistance(mv.distance)}`;
  return `In ${formatDistance(mv.approach)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
