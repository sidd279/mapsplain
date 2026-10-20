import { fetchJson, isValidLatLon, haversine, destinationPoint, distanceToPolyline, ApiError } from './util.js';
import { turnKind, side } from './routing.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const SEARCH_RADIUS = 55;
export const MATCH_RADIUS = 60;
const OVERSHOOT_AHEAD = 90;
const MAX_POINTS_PER_QUERY = 60;
const MAX_BATCHES = 2;

export function buildQueryPoints(maneuvers) {
  const points = [];
  const priority = (mv) => {
    const k = turnKind(mv);
    if (k === 'depart' || k === 'arrive') return 0;
    if (['turn', 'uturn', 'endOfRoad', 'roundabout', 'fork'].includes(k)) return 1;
    if (['merge', 'ramp', 'exitRoundabout'].includes(k)) return 2;
    return 3;
  };
  for (const mv of maneuvers) {
    points.push({ id: `m${mv.index}`, lat: mv.lat, lon: mv.lon, prio: priority(mv) });
    const k = turnKind(mv);
    if ((k === 'turn' || k === 'endOfRoad') && side(mv.modifier) && Number.isFinite(mv.bearingBefore)) {
      const [lat, lon] = destinationPoint(mv.lat, mv.lon, mv.bearingBefore, OVERSHOOT_AHEAD);
      points.push({ id: `o${mv.index}`, lat, lon, prio: 4 });
    }
  }
  const valid = points.filter((p) => isValidLatLon(p.lat, p.lon));
  valid.sort((a, b) => a.prio - b.prio);
  const kept = valid.slice(0, MAX_POINTS_PER_QUERY * MAX_BATCHES);
  const batches = [];
  for (let i = 0; i < kept.length; i += MAX_POINTS_PER_QUERY) batches.push(kept.slice(i, i + MAX_POINTS_PER_QUERY));
  return { batches, skipped: valid.length - kept.length };
}

export function buildOverpassQuery(points, radius = SEARCH_RADIUS) {
  const amenity = 'place_of_worship|fuel|cafe|restaurant|fast_food|school|college|hospital|clinic|bank|post_office|pharmacy|cinema|police';
  const shop = 'bakery|confectionery|pastry|sweets|supermarket|convenience';
  const parts = points.map(({ lat, lon }) => {
    const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`;
    return [
      `nwr(${a})[amenity~"^(${amenity})$"];`,
      `nwr(${a})[shop~"^(${shop})$"];`,
      `node(${a})[natural=tree][~"^(name|species|species:en|genus|genus:en|taxon|taxon:en|denotation)$"~"."];`,
      `nwr(${a})[leisure=park][name];`,
    ].join('');
  });
  return `[out:json][timeout:25];(${parts.join('')});out center tags;`;
}

async function runOverpass(query, signal) {
  let lastError;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchJson(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
        timeout: 55000,
      });
      if (!data || !Array.isArray(data.elements)) throw new ApiError('Landmark service sent malformed data.', { kind: 'data' });
      if (data.remark && data.elements.length === 0) throw new ApiError('The landmark service is overloaded and gave up on the query.', { kind: 'timeout' });
      return data.elements;
    } catch (err) {
      if (err.kind === 'cancelled') throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export async function fetchLandmarks(maneuvers, { signal } = {}) {
  const { batches, skipped } = buildQueryPoints(maneuvers);
  const seen = new Map();
  for (const batch of batches) {
    const elements = await runOverpass(buildOverpassQuery(batch), signal);
    for (const e of elements) seen.set(`${e.type}/${e.id}`, slimElement(e));
  }
  return { elements: [...seen.values()], skipped };
}

function slimElement(e) {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  return { type: e.type, id: e.id, lat, lon, tags: e.tags || {} };
}

const TREE_SPECIES = [
  [/ficus\s+benghalensis|banyan/i, 'banyan'],
  [/ficus\s+religiosa|peepal|pipal|bodhi/i, 'peepal'],
  [/azadirachta\s+indica|\bneem\b/i, 'neem'],
  [/mangifera\s+indica|\bmango\b/i, 'mango'],
  [/cocos\s+nucifera|coconut/i, 'coconut'],
  [/delonix\s+regia|gulmohar|flame tree|royal poinciana/i, 'gulmohar'],
  [/tamarindus\s+indica|tamarind/i, 'tamarind'],
  [/(pongamia|millettia)\s+pinnata|pongam|honge/i, 'pongamia'],
  [/saraca\s+asoca|polyalthia\s+longifolia|monoon\s+longifolium|ashoka/i, 'ashoka'],
  [/syzygium\s+cumini|jamun|java plum/i, 'jamun'],
  [/artocarpus\s+heterophyllus|jackfruit/i, 'jackfruit'],
  [/samanea\s+saman|albizia\s+saman|rain\s*tree/i, 'rain'],
  [/spathodea\s+campanulata|african tulip/i, 'African tulip'],
  [/peltophorum|copperpod/i, 'copperpod'],
  [/terminalia\s+catappa|indian almond/i, 'Indian almond'],
  [/tabebuia|handroanthus/i, 'tabebuia'],
  [/eucalyptus/i, 'eucalyptus'],
  [/casuarina/i, 'casuarina'],
  [/^ficus$/i, 'fig (Ficus)'],
];

function treeSpecies(tags) {
  const fields = [tags['species:en'], tags.species, tags['taxon:en'], tags.taxon, tags['genus:en'], tags.genus, tags.denotation];
  for (const f of fields) {
    if (!f) continue;
    for (const [re, common] of TREE_SPECIES) if (re.test(f.trim())) return common;
  }
  const en = tags['species:en'] || tags['taxon:en'] || tags['genus:en'];
  if (en) return en.replace(/\s*tree$/i, '').toLowerCase();
  return null;
}

const CATEGORIES = {
  temple: { noun: 'temple', base: 8, named: 10, recog: 1, icon: 'temple', keys: ['temple', 'mandir', 'devasthana', 'gudi', 'kovil', 'swamy', 'swami', 'devi', 'math', 'ashram'] },
  mosque: { noun: 'mosque', base: 8, named: 10, recog: 1, icon: 'mosque', keys: ['masjid', 'mosque', 'dargah', 'idgah'] },
  church: { noun: 'church', base: 8, named: 10, recog: 1, icon: 'church', keys: ['church', 'chapel', 'cathedral', 'basilica'] },
  gurudwara: { noun: 'gurudwara', base: 8, named: 10, recog: 1, icon: 'temple', keys: ['gurudwara', 'gurdwara', 'sahib'] },
  jain: { noun: 'Jain temple', base: 8, named: 10, recog: 1, icon: 'temple', keys: ['jain', 'basadi', 'derasar', 'temple', 'mandir'] },
  buddhist: { noun: 'Buddhist temple', base: 8, named: 10, recog: 1, icon: 'temple', keys: ['vihar', 'monastery', 'buddh', 'temple', 'stupa'] },
  worship: { noun: 'place of worship', base: 7, named: 9, recog: 0.9, icon: 'temple', keys: [] },
  fuel: { noun: 'petrol pump', base: 9, named: 9, recog: 1, icon: 'fuel', keys: ['petrol', 'fuel', 'pump', 'bunk', 'filling'] },
  tree: { noun: 'tree', base: 9, named: 9, recog: 0.8, icon: 'tree', keys: [] },
  bakery: { noun: 'bakery', base: 7, named: 7, recog: 0.8, icon: 'bakery', keys: ['bakery', 'bakers', 'bake', 'cake', 'bread', 'iyengar'] },
  sweets: { noun: 'sweet shop', base: 7, named: 7, recog: 0.8, icon: 'sweets', keys: ['sweet', 'mithai', 'confection', 'halwai', 'bhandar'] },
  bank: { noun: 'bank', base: 6, named: 6, recog: 0.7, icon: 'bank', keys: ['bank'] },
  school: { noun: 'school', base: 6, named: 6, recog: 0.7, icon: 'school', keys: ['school', 'vidyalaya', 'academy', 'college', 'convent', 'vidya', 'shala', 'institute'] },
  college: { noun: 'college', base: 6, named: 6, recog: 0.7, icon: 'school', keys: ['college', 'institute', 'university', 'academy'] },
  hospital: { noun: 'hospital', base: 6, named: 6, recog: 0.75, icon: 'hospital', keys: ['hospital', 'clinic', 'nursing', 'medical', 'health', 'care'] },
  clinic: { noun: 'clinic', base: 5, named: 5, recog: 0.6, icon: 'hospital', keys: ['clinic', 'hospital', 'nursing', 'medical', 'health', 'care', 'dental'] },
  post: { noun: 'post office', base: 6, named: 6, recog: 0.7, icon: 'post', keys: ['post'] },
  cinema: { noun: 'cinema hall', base: 7, named: 7, recog: 0.9, icon: 'shop', keys: ['cinema', 'theatre', 'theater', 'talkies', 'pvr', 'inox', 'multiplex'] },
  police: { noun: 'police station', base: 6, named: 6, recog: 0.8, icon: 'bank', keys: ['police'] },
  supermarket: { noun: 'supermarket', base: 5, named: 5, recog: 0.6, icon: 'shop', keys: ['mart', 'super', 'bazaar', 'store', 'fresh', 'market', 'reliance', 'dmart', 'more'] },
  convenience: { noun: 'shop', base: 4, named: 5, recog: 0.5, icon: 'shop', keys: ['store', 'stores', 'mart', 'shop', 'provision', 'general', 'kirana', 'traders', 'enterprises'] },
  pharmacy: { noun: 'medical shop', base: 4, named: 4, recog: 0.6, icon: 'hospital', keys: ['pharma', 'medical', 'chemist', 'drug', 'apollo', 'medplus'] },
  park: { noun: 'park', base: 5, named: 6, recog: 0.7, icon: 'tree', keys: ['park', 'garden', 'maidan', 'ground', 'udyan', 'vana'] },
  cafe: { noun: 'cafe', base: 4, named: 4, recog: 0.5, icon: 'cafe', keys: ['cafe', 'café', 'coffee', 'tea', 'chai', 'darshini', 'brew'] },
  restaurant: { noun: 'restaurant', base: 4, named: 4, recog: 0.5, icon: 'cafe', keys: ['restaurant', 'hotel', 'bhavan', 'dhaba', 'kitchen', 'mess', 'biryani', 'canteen', 'grill', 'food', 'tiffin', 'upahar', 'sagar'] },
  fastfood: { noun: 'food stall', base: 3, named: 4, recog: 0.4, icon: 'cafe', keys: ['food', 'chaat', 'pizza', 'burger', 'chicken', 'rolls', 'juice', 'kitchen'] },
};

function categoryOf(tags) {
  if (tags.natural === 'tree') return 'tree';
  const a = tags.amenity;
  if (a === 'place_of_worship') {
    switch (tags.religion) {
      case 'hindu': return 'temple';
      case 'muslim': return 'mosque';
      case 'christian': return 'church';
      case 'sikh': return 'gurudwara';
      case 'jain': return 'jain';
      case 'buddhist': return 'buddhist';
      default: return 'worship';
    }
  }
  const amenityMap = {
    fuel: 'fuel', cafe: 'cafe', restaurant: 'restaurant', fast_food: 'fastfood', school: 'school', college: 'college',
    hospital: 'hospital', clinic: 'clinic', bank: 'bank', post_office: 'post', pharmacy: 'pharmacy', cinema: 'cinema', police: 'police',
  };
  if (amenityMap[a]) return amenityMap[a];
  const s = tags.shop;
  if (s === 'bakery') return 'bakery';
  if (s === 'confectionery' || s === 'pastry' || s === 'sweets') return 'sweets';
  if (s === 'supermarket') return 'supermarket';
  if (s === 'convenience') return 'convenience';
  if (tags.leisure === 'park') return 'park';
  return null;
}

function englishName(tags) {
  return (tags['name:en'] || tags.name || '').trim();
}

export function describeElement(e, nicknames = {}) {
  if (!e || !isValidLatLon(e.lat, e.lon)) return null;
  const tags = e.tags || {};
  const catKey = categoryOf(tags);
  if (!catKey) return null;
  const cat = CATEGORIES[catKey];
  const name = englishName(tags);
  const key = `${e.type}/${e.id}`;
  let label;
  let noun = cat.noun;
  let base = name ? cat.named : cat.base;
  let recog = cat.recog;
  let identified = true;

  if (catKey === 'tree') {
    const species = treeSpecies(tags);
    if (species) noun = `${species} tree`;
    if (name) label = /tree/i.test(name) ? name : species ? `${name} (${noun})` : `the ${name} tree`;
    else if (species) label = `the ${noun}`;
    else return null;
    identified = Boolean(species);
  } else if (!name) {
    label = `the ${noun}`;
  } else if (catKey === 'fuel') {
    label = cat.keys.some((k) => name.toLowerCase().includes(k)) ? name : `the ${name} petrol pump`;
  } else {
    const lower = name.toLowerCase();
    label = cat.keys.some((k) => lower.includes(k)) || lower.endsWith(cat.noun.toLowerCase()) ? name : `${name} ${noun}`;
  }

  const nickname = nicknames[key];
  return {
    key,
    osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    lat: e.lat,
    lon: e.lon,
    name,
    nickname: nickname || '',
    label: nickname ? `“${nickname}”` : label,
    mapLabel: label,
    noun,
    category: catKey,
    icon: cat.icon,
    base,
    recog,
    named: Boolean(name),
    identified,
    isTree: catKey === 'tree',
  };
}

export function confidenceFor(lm, distM, roadDistM, reused) {
  const proximity = Math.max(0, 1 - distM / MATCH_RADIUS) * 35;
  const named = lm.named || lm.nickname ? 20 : 0;
  const category = lm.recog * 20;
  const road = roadDistM <= 15 ? 15 : roadDistM <= 30 ? 10 : roadDistM <= 50 ? 4 : 0;
  const aligned = distM <= 20 ? 10 : 0;
  const reusePenalty = reused ? -10 : 0;
  const score = Math.round(Math.max(0, Math.min(100, proximity + named + category + road + aligned + reusePenalty)));
  const label = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  return {
    score,
    label,
    factors: [
      `${Math.round(distM)} m from the turn point (+${Math.round(proximity + aligned)})`,
      named ? 'has a mapped name (+20)' : 'no mapped name (+0)',
      `category “${lm.noun}” recognisability (+${Math.round(category)})`,
      `${Math.round(roadDistM)} m from the route line (+${road})`,
      reused ? 'already used for an earlier turn (−10)' : 'not used elsewhere on this route',
    ],
  };
}

export function assignLandmarks(route, elements, { treeMode = false, nicknames = {} } = {}) {
  const described = [];
  const seen = new Set();
  for (const e of elements || []) {
    const lm = describeElement(e, nicknames);
    if (lm && !seen.has(lm.key)) {
      seen.add(lm.key);
      described.push(lm);
    }
  }
  const usage = new Map();
  let prevLabel = '';
  const results = route.maneuvers.map((mv) => {
    const candidates = [];
    for (const lm of described) {
      const d = haversine(mv.lat, mv.lon, lm.lat, lm.lon);
      if (d > MATCH_RADIUS) continue;
      const lastUse = usage.get(lm.key);
      const reused = lastUse !== undefined;
      let score = lm.base + (lm.named ? 3 : 0) + (MATCH_RADIUS - d) / 20;
      if (lm.nickname) score += 2;
      if (treeMode && lm.isTree) score += 6;
      if (reused) score -= mv.index - lastUse <= 3 ? 6 : 3;
      else if (lm.label === prevLabel) score -= 4;
      candidates.push({ lm, d, score, reused });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 3) {
      prevLabel = '';
      return { landmark: null, treeAvailable: false };
    }
    usage.set(best.lm.key, mv.index);
    prevLabel = best.lm.label;
    const roadDist = distanceToPolyline(best.lm.lat, best.lm.lon, route.coords);
    const confidence = confidenceFor(best.lm, best.d, roadDist, best.reused);
    return {
      landmark: best.lm,
      distance: best.d,
      relation: best.d <= 20 && roadDist <= 20 ? 'at' : 'near',
      confidence,
      treeAvailable: candidates.some((c) => c.lm.isTree),
    };
  });

  route.maneuvers.forEach((mv, i) => {
    const k = turnKind(mv);
    if (!((k === 'turn' || k === 'endOfRoad') && side(mv.modifier) && Number.isFinite(mv.bearingBefore))) return;
    const [olat, olon] = destinationPoint(mv.lat, mv.lon, mv.bearingBefore, OVERSHOOT_AHEAD);
    let best = null;
    for (const lm of described) {
      if (lm.base < 6) continue;
      if (results[i].landmark && results[i].landmark.key === lm.key) continue;
      const dTurn = haversine(mv.lat, mv.lon, lm.lat, lm.lon);
      const dAhead = haversine(olat, olon, lm.lat, lm.lon);
      if (dAhead > 50 || dTurn < 45 || dAhead >= dTurn) continue;
      if (distanceToPolyline(lm.lat, lm.lon, route.coords) < 25) continue;
      if (!best || lm.base - dAhead / 25 > best.base - best.dAhead / 25) best = { ...lm, dAhead };
    }
    if (best) results[i].overshoot = best;
  });

  const treeCount = described.filter((l) => l.isTree).length;
  return { perManeuver: results, landmarkCount: described.length, treeCount };
}
