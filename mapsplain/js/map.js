import { el } from './util.js';
import { iconFor } from './icons.js';

const DEFAULT_VIEW = { center: [12.9716, 77.5946], zoom: 13 };

let map;
let startMarker = null;
let endMarker = null;
let routeLayer = null;
let routeCasing = null;
let turnLayer = null;
let landmarkLayer = null;
let turnMarkers = [];
let highlighted = -1;
let handlers = {};

export function isMapReady() {
  return Boolean(map);
}

export function initMap(container, h = {}) {
  handlers = h;
  if (typeof window.L === 'undefined') throw new Error('Leaflet did not load.');
  map = L.map(container, { zoomControl: true, attributionControl: true }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  turnLayer = L.layerGroup().addTo(map);
  landmarkLayer = L.layerGroup().addTo(map);
  map.on('click', (e) => handlers.onMapClick?.(e.latlng.lat, e.latlng.lng));
  const ro = new ResizeObserver(() => map.invalidateSize());
  ro.observe(container);
  return map;
}

function endpointIcon(kind) {
  return L.divIcon({
    className: `pin pin-${kind}`,
    html: `<span><b>${kind === 'start' ? 'A' : 'B'}</b></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
  });
}

function placeEndpoint(kind, point) {
  const existing = kind === 'start' ? startMarker : endMarker;
  if (existing) {
    map.removeLayer(existing);
  }
  if (!point) {
    if (kind === 'start') startMarker = null;
    else endMarker = null;
    return;
  }
  const marker = L.marker([point.lat, point.lon], {
    icon: endpointIcon(kind),
    draggable: true,
    keyboard: true,
    title: kind === 'start' ? 'Start' : 'Destination',
    zIndexOffset: 1000,
  })
    .bindPopup(el('div', { class: 'pop' }, el('strong', { text: kind === 'start' ? 'Start' : 'Destination' }), el('div', { text: point.short || point.label })))
    .addTo(map);
  marker.on('dragend', () => {
    const ll = marker.getLatLng();
    handlers.onMarkerDrag?.(kind, ll.lat, ll.lng);
  });
  if (kind === 'start') startMarker = marker;
  else endMarker = marker;
}

export function setStart(point) {
  placeEndpoint('start', point);
}

export function setEnd(point) {
  placeEndpoint('end', point);
}

export function fitPoints(points) {
  const valid = points.filter(Boolean).map((p) => [p.lat, p.lon]);
  if (valid.length === 1) map.setView(valid[0], Math.max(map.getZoom(), 15));
  else if (valid.length > 1) map.fitBounds(valid, { padding: [40, 40] });
}

export function getCenter() {
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

export function clearRoute() {
  if (routeLayer) map.removeLayer(routeLayer);
  if (routeCasing) map.removeLayer(routeCasing);
  routeLayer = null;
  routeCasing = null;
  turnLayer.clearLayers();
  landmarkLayer.clearLayers();
  turnMarkers = [];
  highlighted = -1;
}

export function showRoute(route) {
  clearRoute();
  const latlngs = route.coords.map(([lon, lat]) => [lat, lon]);
  routeCasing = L.polyline(latlngs, { color: '#173d2f', weight: 9, opacity: 0.25, interactive: false }).addTo(map);
  routeLayer = L.polyline(latlngs, { color: '#1f6b4a', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(map);
  route.maneuvers.forEach((mv, i) => {
    if (mv.type === 'depart' || mv.type === 'arrive') {
      turnMarkers[i] = null;
      return;
    }
    const m = L.marker([mv.lat, mv.lon], {
      icon: L.divIcon({ className: 'turn-dot', html: `<span>${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
      title: `Step ${i + 1}`,
      keyboard: false,
    }).addTo(turnLayer);
    m.on('click', () => handlers.onTurnClick?.(i));
    turnMarkers[i] = m;
  });
  map.fitBounds(routeLayer.getBounds(), { padding: [36, 36] });
}

export function highlightTurn(index, mv) {
  if (highlighted >= 0 && turnMarkers[highlighted]) {
    turnMarkers[highlighted].getElement()?.classList.remove('active');
  }
  highlighted = index;
  if (!mv) return;
  const marker = turnMarkers[index];
  if (marker) marker.getElement()?.classList.add('active');
  else if (mv.type === 'depart' && startMarker) startMarker.openPopup();
  else if (mv.type === 'arrive' && endMarker) endMarker.openPopup();
  map.flyTo([mv.lat, mv.lon], Math.max(map.getZoom(), 17), { duration: 0.6 });
}

function landmarkPopup(lm, info, onNickname) {
  const input = el('input', { type: 'text', maxlength: '40', placeholder: 'e.g. Sharma ji’s shop', value: lm.nickname || '', 'aria-label': 'Nickname for this landmark' });
  const form = el(
    'form',
    {
      class: 'pop-form',
      onsubmit: (e) => {
        e.preventDefault();
        onNickname?.(lm.key, input.value);
      },
    },
    input,
    el('button', { type: 'submit', class: 'btn btn-small', text: lm.nickname ? 'Update' : 'Save' }),
  );
  return el(
    'div',
    { class: 'pop' },
    el('strong', { text: lm.nickname ? `${lm.nickname}` : lm.mapLabel }),
    lm.nickname ? el('div', { class: 'muted', text: `Mapped as: ${lm.mapLabel}` }) : null,
    el('div', { class: 'muted', text: `${lm.noun} · ${info}` }),
    el('a', { href: lm.osmUrl, target: '_blank', rel: 'noopener', text: 'View on OpenStreetMap' }),
    el('div', { class: 'pop-label', text: 'Your nickname (saved on this device only):' }),
    form,
  );
}

export function showLandmarks(route, assignments, { onNickname } = {}) {
  landmarkLayer.clearLayers();
  const placed = new Set();
  const add = (lm, info, overshoot) => {
    if (placed.has(lm.key)) return;
    placed.add(lm.key);
    L.marker([lm.lat, lm.lon], {
      icon: L.divIcon({
        className: `lm-icon lm-${lm.icon}${overshoot ? ' lm-overshoot' : ''}`,
        html: iconFor(lm.icon),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      title: lm.label,
    })
      .bindPopup(() => landmarkPopup(lm, info, onNickname))
      .addTo(landmarkLayer);
  };
  (assignments?.perManeuver || []).forEach((a, i) => {
    if (a.landmark) add(a.landmark, `step ${i + 1}, ${Math.round(a.distance)} m from the turn`, false);
    if (a.overshoot) add(a.overshoot, `step ${i + 1}: "gone too far" marker`, true);
  });
}

export function invalidate() {
  map?.invalidateSize();
}
