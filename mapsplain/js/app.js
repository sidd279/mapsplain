import { el, formatDistance, formatDuration, isValidLatLon } from './util.js';
import * as MapView from './map.js';
import { searchPlaces, reversePlace, pinLabel } from './geocoding.js';
import { fetchRoute, parseRoute, conventionalInstruction, conventionalLine, streetLabel, arrowFor, PROFILE_LABELS } from './routing.js';
import { fetchLandmarks, assignLandmarks } from './landmarks.js';
import { PERSONAS, PERSONA_ORDER, generateDirections, confusedJoke, localizedText, SPEECH_LANGS } from './personas.js';
import * as Voice from './voice.js';
import { buildCard, renderCard, downloadCanvas, canShareFiles, shareCanvas } from './share.js';
import * as Store from './storage.js';
import { iconFor } from './icons.js';

const $ = (id) => document.getElementById(id);

const prefs = Store.loadPrefs();
const state = {
  start: null,
  end: null,
  profile: prefs.profile,
  persona: PERSONAS[prefs.persona] ? prefs.persona : 'uncle',
  treeMode: Boolean(prefs.treeMode),
  view: prefs.view,
  voiceLang: prefs.voiceLang,
  pickMode: null,
  busy: false,
  controller: null,
  result: null,
  route: null,
  elements: [],
  assignments: null,
  directions: [],
  activeStep: -1,
  jokeNonce: 0,
  stale: false,
  demos: [],
  demosCapturedAt: '',
};

function persistPrefs() {
  Store.savePrefs({ persona: state.persona, profile: state.profile, treeMode: state.treeMode, view: state.view, voiceLang: state.voiceLang });
}

function setStatus(kind, message, actions = []) {
  const box = $('status');
  box.replaceChildren();
  if (!message) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.className = `status status-${kind}`;
  if (kind === 'loading') box.append(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
  box.append(el('span', { class: 'status-text', text: message }));
  if (actions.length) {
    box.append(el('div', { class: 'status-actions' }, actions.map((a) => el('button', { type: 'button', class: 'btn btn-small', text: a.label, onclick: a.onClick }))));
  }
}

function renderPersonas() {
  const group = $('personaGroup');
  PERSONA_ORDER.forEach((id) => {
    const p = PERSONAS[id];
    const input = el('input', { type: 'radio', name: 'persona', value: id, checked: id === state.persona });
    group.append(
      el('label', { class: 'persona-card' }, input, el('span', { class: 'persona-emoji', text: p.emoji }), el('span', { class: 'persona-name', text: p.name }), el('span', { class: 'persona-tag', text: p.tagline })),
    );
  });
  group.addEventListener('change', (e) => {
    if (e.target.name !== 'persona') return;
    state.persona = e.target.value;
    persistPrefs();
    Voice.stop();
    if (state.route) {
      regenerateDirections();
      flash(`${PERSONAS[state.persona].name} is explaining now.`);
    }
  });
}

function flash(text) {
  const n = $('notices');
  const t = el('div', { class: 'notice notice-flash', text });
  n.prepend(t);
  setTimeout(() => t.remove(), 2600);
}

const fields = {
  start: { input: $('startInput'), list: $('startSuggest'), active: -1, items: [] },
  end: { input: $('endInput'), list: $('endSuggest'), active: -1, items: [] },
};

function setPlace(which, place, { moveMap = true } = {}) {
  state[which] = place;
  const f = fields[which];
  f.input.value = place ? place.short || place.label : '';
  f.input.title = place ? place.label : '';
  if (which === 'start') MapView.setStart(place);
  else MapView.setEnd(place);
  if (place) Store.rememberPlace(place);
  if (moveMap) MapView.fitPoints([state.start, state.end]);
  if (state.route) markStale();
}

function markStale() {
  if (state.stale) return;
  state.stale = true;
  setStatus('info', 'Points or travel mode changed. Press “Explain My Route” to get fresh directions.');
}

function localSuggestions(text) {
  const q = text.trim().toLowerCase();
  const pool = [];
  Store.loadRecentPlaces().forEach((p) => pool.push({ ...p, origin: 'Recent' }));
  state.demos.forEach((d) => {
    pool.push({ ...d.start, origin: 'Demo place' });
    pool.push({ ...d.end, origin: 'Demo place' });
  });
  const seen = new Set();
  return pool
    .filter((p) => {
      const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !q || (p.label || '').toLowerCase().includes(q) || (p.short || '').toLowerCase().includes(q);
    })
    .slice(0, 6);
}

function showSuggestions(which, items, { note } = {}) {
  const f = fields[which];
  f.items = items;
  f.active = -1;
  f.list.replaceChildren();
  if (note) f.list.append(el('li', { class: 'suggest-note', text: note }));
  items.forEach((p, i) => {
    f.list.append(
      el(
        'li',
        {
          role: 'option',
          id: `${which}-opt-${i}`,
          class: 'suggest-item',
          onmousedown: (e) => {
            e.preventDefault();
            choose(which, i);
          },
        },
        el('span', { class: 'suggest-main', text: p.short || p.label }),
        el('span', { class: 'suggest-sub', text: p.origin ? `${p.origin} · ${p.label}` : p.label }),
      ),
    );
  });
  const open = items.length > 0 || Boolean(note);
  f.list.hidden = !open;
  f.input.setAttribute('aria-expanded', String(open));
}

function hideSuggestions(which) {
  const f = fields[which];
  f.list.hidden = true;
  f.input.setAttribute('aria-expanded', 'false');
}

function choose(which, i) {
  const p = fields[which].items[i];
  if (!p) return;
  hideSuggestions(which);
  setPlace(which, { label: p.label, short: p.short, lat: p.lat, lon: p.lon });
}

async function runSearch(which) {
  const f = fields[which];
  const q = f.input.value.trim();
  if (q.length < 3) {
    showSuggestions(which, [], { note: 'Type at least 3 characters, then press Enter.' });
    return null;
  }
  showSuggestions(which, [], { note: 'Searching OpenStreetMap…' });
  try {
    const results = await searchPlaces(q, { near: MapView.isMapReady() ? MapView.getCenter() : null });
    if (!results.length) {
      showSuggestions(which, [], { note: `No places found for “${q}”. Try adding the city name.` });
      return [];
    }
    showSuggestions(which, results);
    return results;
  } catch (err) {
    showSuggestions(which, [], { note: err.message || 'Search failed.' });
    return null;
  }
}

function wireField(which) {
  const f = fields[which];
  f.input.addEventListener('input', () => {
    if (state[which] && f.input.value !== (state[which].short || state[which].label)) {
      state[which] = null;
      if (which === 'start') MapView.setStart(null);
      else MapView.setEnd(null);
    }
    const local = localSuggestions(f.input.value);
    showSuggestions(which, local, { note: f.input.value.trim().length >= 3 ? 'Press Enter to search OpenStreetMap' : null });
  });
  f.input.addEventListener('focus', () => {
    if (!state[which]) showSuggestions(which, localSuggestions(f.input.value));
  });
  f.input.addEventListener('blur', () => setTimeout(() => hideSuggestions(which), 120));
  f.input.addEventListener('keydown', (e) => {
    const options = [...f.list.querySelectorAll('.suggest-item')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      f.active = (f.active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle('active', i === f.active));
      f.input.setAttribute('aria-activedescendant', options[f.active].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (f.active >= 0 && !f.list.hidden) choose(which, f.active);
      else runSearch(which);
    } else if (e.key === 'Escape') {
      hideSuggestions(which);
    }
  });
}

function setPickMode(which) {
  state.pickMode = state.pickMode === which ? null : which;
  document.querySelectorAll('[data-action="pick"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.target === state.pickMode)));
  const hint = $('pickHint');
  hint.hidden = !state.pickMode;
  hint.textContent = state.pickMode === 'start' ? 'Click the map to set your start (A)' : 'Click the map to set your destination (B)';
  $('map').classList.toggle('picking', Boolean(state.pickMode));
}

async function placeFromMap(which, lat, lon) {
  if (!isValidLatLon(lat, lon)) return;
  const pin = { label: pinLabel(lat, lon), short: pinLabel(lat, lon), lat, lon };
  setPlace(which, pin, { moveMap: false });
  try {
    const place = await reversePlace(lat, lon);
    if (state[which] && state[which].lat === lat && state[which].lon === lon && place) {
      setPlace(which, { ...place, lat, lon }, { moveMap: false });
    }
  } catch {
    return;
  }
}

function onMapClick(lat, lon) {
  let which = state.pickMode;
  if (!which) {
    if (!state.start) which = 'start';
    else if (!state.end) which = 'end';
  }
  if (!which) {
    flashMapHint('Use the pin buttons (or drag A/B) to move a point.');
    return;
  }
  setPickMode(null);
  placeFromMap(which, lat, lon);
}

function flashMapHint(text) {
  const hint = $('pickHint');
  hint.textContent = text;
  hint.hidden = false;
  clearTimeout(flashMapHint.t);
  flashMapHint.t = setTimeout(() => {
    if (!state.pickMode) hint.hidden = true;
  }, 2200);
}

async function ensurePlace(which) {
  if (state[which]) return state[which];
  const q = fields[which].input.value.trim();
  if (!q) return null;
  const results = await runSearch(which);
  if (results && results.length) {
    hideSuggestions(which);
    setPlace(which, results[0]);
    return results[0];
  }
  return null;
}

async function explain() {
  if (state.busy) return;
  Voice.stop();
  setPickMode(null);
  state.busy = true;
  setBusyUi(true);
  try {
    setStatus('loading', 'Uncle is thinking… finding your places.');
    const start = await ensurePlace('start');
    const end = await ensurePlace('end');
    if (!start || !end) {
      setStatus('error', !start && !end ? 'Pick a start and a destination first.' : !start ? 'Which start, beta? Search or pick it on the map.' : 'Where to, beta? Search or pick a destination.');
      return;
    }
    if (Math.abs(start.lat - end.lat) < 1e-6 && Math.abs(start.lon - end.lon) < 1e-6) {
      setStatus('error', 'Start and destination are the same place. You have already reached!');
      return;
    }
    state.controller?.abort();
    state.controller = new AbortController();
    const signal = state.controller.signal;
    setStatus('loading', 'Uncle is thinking… asking the routing service.');
    let routed;
    try {
      routed = await fetchRoute(start, end, state.profile, { signal });
    } catch (err) {
      if (err.kind === 'cancelled') return;
      routeFailed(err);
      return;
    }
    const result = { kind: 'live', start, end, profile: state.profile, source: routed.source, raw: routed.raw, elements: [], landmarkStatus: 'pending', title: '' };
    applyResult(result);
    setStatus('loading', 'Asking around for landmarks near each turn…');
    const slowTimer = setTimeout(() => {
      if (state.busy) setStatus('loading', 'The landmark service is busy. Uncle is still asking around (this can take up to a minute)…');
    }, 12000);
    try {
      const { elements, skipped } = await fetchLandmarks(state.route.maneuvers, { signal });
      result.elements = elements;
      result.landmarkStatus = 'ok';
      result.landmarkSkipped = skipped;
      applyResult(result, { keepView: true });
      setStatus('ok', elements.length ? `Done. Found ${elements.length} mapped places near your turns.` : 'Done. No mapped landmarks near these turns, so street names it is.');
      Store.saveLastResult(result);
    } catch (err) {
      if (err.kind === 'cancelled') return;
      result.landmarkStatus = 'failed';
      applyResult(result, { keepView: true });
      Store.saveLastResult(result);
      setStatus('warn', `Route is ready, but the landmark service failed (${err.message}) Directions use street names for now.`, [{ label: 'Retry landmarks', onClick: retryLandmarks }]);
    } finally {
      clearTimeout(slowTimer);
    }
  } finally {
    state.busy = false;
    setBusyUi(false);
  }
}

async function retryLandmarks() {
  if (state.busy || !state.result) return;
  state.busy = true;
  setBusyUi(true);
  state.controller = new AbortController();
  setStatus('loading', 'Asking around for landmarks again…');
  try {
    const { elements } = await fetchLandmarks(state.route.maneuvers, { signal: state.controller.signal });
    state.result.elements = elements;
    state.result.landmarkStatus = 'ok';
    applyResult(state.result, { keepView: true });
    Store.saveLastResult(state.result);
    setStatus('ok', `Found ${elements.length} mapped places near your turns.`);
  } catch (err) {
    if (err.kind !== 'cancelled') setStatus('warn', `Landmarks still unavailable: ${err.message}`, [{ label: 'Try again', onClick: retryLandmarks }]);
  } finally {
    state.busy = false;
    setBusyUi(false);
  }
}

function routeFailed(err) {
  const actions = [{ label: 'Retry', onClick: explain }];
  if (state.demos.length) actions.push({ label: 'Show a demo route', onClick: () => loadDemo(state.demos[0].id) });
  const last = Store.loadLastResult();
  if (last) actions.push({ label: 'Show last saved route', onClick: () => restoreLast(last) });
  setStatus('error', `Couldn’t get a route: ${err.message}`, actions);
}

function setBusyUi(busy) {
  const b = $('explainBtn');
  b.disabled = busy;
  b.textContent = busy ? 'Uncle is thinking…' : 'Explain My Route';
  $('demoSelect').disabled = busy;
}

function applyResult(result, { keepView = false } = {}) {
  let route;
  try {
    route = parseRoute(result.raw);
  } catch (err) {
    setStatus('error', `That route data looks broken: ${err.message}`);
    return;
  }
  state.result = result;
  state.route = route;
  state.elements = result.elements || [];
  state.stale = false;
  if (!keepView) {
    state.start = result.start;
    state.end = result.end;
    fields.start.input.value = result.start.short || result.start.label;
    fields.end.input.value = result.end.short || result.end.label;
    MapView.setStart(result.start);
    MapView.setEnd(result.end);
    MapView.showRoute(route);
  }
  reassignLandmarks();
}

function reassignLandmarks() {
  if (!state.route) return;
  state.assignments = assignLandmarks(state.route, state.elements, { treeMode: state.treeMode, nicknames: Store.loadNicknames() });
  MapView.showLandmarks(state.route, state.assignments, { onNickname: saveNickname });
  regenerateDirections();
}

function saveNickname(key, value) {
  Store.setNickname(key, value);
  reassignLandmarks();
  flash(value.trim() ? `Saved nickname “${value.trim().slice(0, 40)}” on this device.` : 'Nickname removed.');
}

function regenerateDirections() {
  state.directions = generateDirections(state.route, state.assignments, state.persona);
  renderResults();
}

function renderSummary() {
  const r = state.result;
  const route = state.route;
  const badge =
    r.kind === 'demo'
      ? el('span', { class: 'badge badge-demo', text: `Demo snapshot · captured ${state.demosCapturedAt}` })
      : r.kind === 'cached'
        ? el('span', { class: 'badge badge-cached', text: 'Saved on this device · not refreshed' })
        : el('span', { class: 'badge badge-live', text: 'Live route' });
  const lmCount = state.assignments.perManeuver.filter((a) => a.landmark).length;
  $('summary').replaceChildren(
    el('div', { class: 'summary-main' },
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: formatDistance(route.distance) }), el('span', { class: 'stat-label', text: 'distance' })),
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: formatDuration(route.duration) }), el('span', { class: 'stat-label', text: 'estimated' })),
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: `${lmCount}/${route.maneuvers.length}` }), el('span', { class: 'stat-label', text: 'steps with a landmark' })),
    ),
    el('div', { class: 'summary-meta' },
      badge,
      el('span', { class: 'badge', text: PROFILE_LABELS[r.profile] || r.profile }),
      el('span', { class: 'badge badge-quiet', text: `via ${r.source}` }),
    ),
  );
}

function renderNotices() {
  const n = $('notices');
  n.querySelectorAll('.notice:not(.notice-flash)').forEach((x) => x.remove());
  const add = (cls, text) => n.append(el('div', { class: `notice ${cls}`, text }));
  const r = state.result;
  if (r.kind === 'demo') add('notice-demo', `This is bundled demonstration data (${r.title}). The route and landmarks were captured from OSRM and OpenStreetMap on ${state.demosCapturedAt}; they are not a live result.`);
  if (r.kind === 'cached') add('notice-demo', 'Showing a route saved earlier on this device. Places may have changed since.');
  if (r.profile === 'driving') add('notice-info', 'Driving route (car profile). Walking? Switch the travel mode and explain again.');
  else add('notice-info', 'Walking route (foot profile). Durations are walking estimates.');
  if (r.landmarkStatus === 'failed') add('notice-warn', 'Landmark service unavailable: directions fall back to street names.');
  if (r.landmarkSkipped) add('notice-warn', 'This route is long, so landmarks were searched only around the most important turns.');
  if (state.treeMode) {
    if (state.assignments.treeCount === 0) add('notice-tree', 'Tree mode: no identified trees are mapped near this route (tree coverage varies a lot by area). Using other landmarks instead.');
    else add('notice-tree', `Tree mode: ${state.assignments.treeCount} identified tree${state.assignments.treeCount === 1 ? '' : 's'} mapped near this route. Trees are preferred where they’re close to a turn.`);
  }
}

function confidenceView(item) {
  const c = item.confidence;
  const lm = item.landmark;
  if (!lm || !c) {
    return el('div', { class: 'conf conf-none' }, el('span', { text: 'No mapped landmark near this turn, so using the street or a neutral description.' }));
  }
  return el(
    'details',
    { class: `conf conf-${c.label.toLowerCase()}` },
    el(
      'summary',
      {},
      el('span', { class: 'lm-chip-icon', 'aria-hidden': 'true' }),
      el('span', { class: 'conf-text', text: `Landmark match: ${c.label} confidence (${c.score}/100), ${lm.nickname ? lm.nickname : lm.mapLabel}` }),
      el('span', { class: 'conf-bar', 'aria-hidden': 'true' }, el('span', { style: `width:${c.score}%` })),
    ),
    el('ul', { class: 'conf-factors' }, c.factors.map((f) => el('li', { text: f }))),
    el('p', { class: 'conf-disclaimer', text: 'This scores how well a mapped feature matches this turn. It does not tell you the place still exists, is open, or is visible from the road.' }),
  );
}

function renderResults() {
  $('emptyState').hidden = true;
  $('resultBody').hidden = false;
  renderSummary();
  renderNotices();
  const list = $('directions');
  list.replaceChildren();
  const persona = PERSONAS[state.persona];
  state.directions.forEach((item) => {
    const mv = state.route.maneuvers[item.index];
    const street = streetLabel(mv);
    const conv = el(
      'div',
      { class: 'conv' },
      el('span', { class: 'arrow', text: arrowFor(mv), 'aria-hidden': 'true' }),
      el(
        'div',
        { class: 'conv-body' },
        el('div', { class: 'conv-line', text: conventionalLine(mv) }),
        el('div', { class: 'conv-meta' }, [
          item.index === 0 ? `${formatDistance(mv.distance)} on this road` : `after ${formatDistance(mv.approach)} · ~${formatDuration(mv.approachDuration)}`,
          street ? ` · ${street}` : '',
        ].join('')),
      ),
    );
    const chips = el('div', { class: 'chips' });
    if (item.distancePhrase) chips.append(el('span', { class: 'chip chip-dist', title: `Exact: ${formatDistance(mv.approach)}`, text: `${item.distancePhrase.replace(/\.$/, '')} · ≈${formatDistance(mv.approach)}` }));
    if (item.landmark) {
      const chip = el('span', { class: `chip chip-lm lm-${item.landmark.icon}` });
      chip.innerHTML = iconFor(item.landmark.icon);
      chip.append(document.createTextNode(` ${item.relation} ${item.landmark.nickname || item.landmark.mapLabel}`));
      chips.append(chip);
    }
    if (item.overshoot) chips.append(el('span', { class: 'chip chip-over', text: `too far = ${item.overshoot.mapLabel}` }));
    const bubble = el(
      'div',
      { class: 'bubble-wrap' },
      el('span', { class: 'avatar', text: persona.emoji, 'aria-hidden': 'true' }),
      el('div', { class: 'bubble' }, el('p', { class: 'bubble-text', text: item.text }), chips, confidenceView(item)),
    );
    const li = el(
      'li',
      {
        class: `step${item.index === state.activeStep ? ' active' : ''}`,
        id: `step-${item.index}`,
        tabindex: '0',
        dataset: { index: String(item.index) },
        'aria-label': `Step ${item.index + 1}: ${conventionalInstruction(mv)}`,
      },
      el('span', { class: 'step-num', text: String(item.index + 1) }),
      conv,
      bubble,
    );
    list.append(li);
  });
  applyView();
}

function applyView() {
  const body = $('resultBody');
  body.dataset.view = state.view;
  document.querySelectorAll('input[name="view"]').forEach((r) => (r.checked = r.value === state.view));
}

function selectStep(index, { scroll = false } = {}) {
  if (!state.route) return;
  state.activeStep = index;
  document.querySelectorAll('.step.active').forEach((s) => s.classList.remove('active'));
  const li = $(`step-${index}`);
  if (li) {
    li.classList.add('active');
    if (scroll) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  MapView.highlightTurn(index, state.route.maneuvers[index]);
}

function showConfusion() {
  if (!state.route) return;
  document.querySelectorAll('.joke').forEach((j) => j.remove());
  const before = JSON.stringify(state.route);
  const j = confusedJoke(state.route, state.assignments, state.persona, state.jokeNonce++);
  if (!j) {
    flash('This route has no left or right turns. Even Uncle can’t get confused here.');
    return;
  }
  const real = state.directions[j.index];
  const li = $(`step-${j.index}`);
  const box = el(
    'div',
    { class: 'joke', role: 'note' },
    el('div', { class: 'joke-badge', text: 'JOKE: do not follow' }),
    el('p', { class: 'joke-wrong' }, el('s', { text: j.joke })),
    el('p', { class: 'joke-fix', text: j.correction }),
    el('p', { class: 'joke-real' }, el('strong', { text: 'Real direction: ' }), real.text),
    el('button', { type: 'button', class: 'btn btn-small', text: 'Okay, okay', onclick: () => box.remove() }),
  );
  li.querySelector('.bubble').append(box);
  selectStep(j.index, { scroll: true });
  if (JSON.stringify(state.route) !== before) throw new Error('Route changed during joke');
}

function voiceItems() {
  if (state.voiceLang === 'en') return state.directions.map((d) => ({ index: d.index, text: d.text }));
  return state.directions.map((d) => ({ index: d.index, text: localizedText(state.route, d, state.voiceLang) }));
}

function setupVoice() {
  const play = $('voicePlay');
  const pauseBtn = $('voicePause');
  const resumeBtn = $('voiceResume');
  const stopBtn = $('voiceStop');
  const sel = $('voiceLang');
  const note = $('voiceNote');
  if (!Voice.isSupported()) {
    [play, pauseBtn, resumeBtn, stopBtn, sel].forEach((b) => (b.disabled = true));
    note.textContent = 'Your browser doesn’t support speech, so reading aloud is unavailable.';
    return;
  }
  const refreshLangs = () => {
    const langs = Voice.availableLanguages();
    sel.replaceChildren();
    Object.entries(SPEECH_LANGS).forEach(([code, info]) => {
      if (code !== 'en' && !langs.has(code)) return;
      sel.append(el('option', { value: code, text: info.label }));
    });
    if (![...sel.options].some((o) => o.value === state.voiceLang)) state.voiceLang = 'en';
    sel.value = state.voiceLang;
    updateVoiceNote();
  };
  const updateVoiceNote = () => {
    const v = Voice.bestVoice(SPEECH_LANGS[state.voiceLang].prefix);
    if (!v) {
      note.textContent = state.voiceLang === 'en' ? 'Using your browser’s default voice.' : '';
      return;
    }
    const extra = state.voiceLang === 'en' ? '' : ' Simple translated directions; persona jokes stay in English.';
    note.textContent = `Voice: ${v.name} (${v.lang}).${extra}`;
  };
  Voice.initVoices(refreshLangs);
  refreshLangs();
  sel.addEventListener('change', () => {
    state.voiceLang = sel.value;
    persistPrefs();
    Voice.stop();
    updateVoiceNote();
  });
  Voice.setListeners({
    onState: (s) => {
      pauseBtn.disabled = s !== 'speaking';
      resumeBtn.disabled = s !== 'paused';
      stopBtn.disabled = s === 'idle' || s === 'error';
      play.textContent = s === 'idle' || s === 'error' ? '▶ Read aloud' : '↺ Restart';
      if (s === 'error') note.textContent = 'Speech stopped unexpectedly. Try again or pick another voice.';
    },
    onLine: (index) => {
      document.querySelectorAll('.step.speaking').forEach((x) => x.classList.remove('speaking'));
      if (index >= 0) {
        $(`step-${index}`)?.classList.add('speaking');
        selectStep(index, { scroll: true });
      }
    },
  });
  play.addEventListener('click', () => {
    if (!state.directions.length) return;
    const p = PERSONAS[state.persona];
    Voice.speakAll(voiceItems(), { langPrefix: SPEECH_LANGS[state.voiceLang].prefix, rate: p.voice.rate, pitch: p.voice.pitch });
  });
  pauseBtn.addEventListener('click', Voice.pause);
  resumeBtn.addEventListener('click', Voice.resume);
  stopBtn.addEventListener('click', Voice.stop);
}

let lastCanvas = null;

async function renderShare() {
  const preview = $('sharePreview');
  const stage = $('shareStage');
  const status = $('shareStatus');
  $('shareDownload').disabled = true;
  $('shareNative').disabled = true;
  preview.replaceChildren(el('p', { class: 'muted', text: 'Rendering card…' }));
  status.textContent = '';
  const card = buildCard({
    startLabel: $('shareStart').value.trim() || 'Start',
    endLabel: $('shareEnd').value.trim() || 'Destination',
    persona: PERSONAS[state.persona],
    directions: state.directions,
    distance: state.route.distance,
    duration: state.route.duration,
    profileLabel: PROFILE_LABELS[state.result.profile],
    isDemo: state.result.kind === 'demo',
  });
  stage.replaceChildren(card);
  try {
    await document.fonts?.ready;
    lastCanvas = await renderCard(card);
    const img = el('img', { src: lastCanvas.toDataURL('image/png'), alt: 'Preview of your Mapsplain direction card' });
    preview.replaceChildren(img);
    $('shareDownload').disabled = false;
    $('shareNative').disabled = false;
  } catch (err) {
    lastCanvas = null;
    preview.replaceChildren(el('p', { class: 'error-text', text: `Couldn’t create the image: ${err.message || err}. You can still copy the directions as text.` }));
  } finally {
    stage.replaceChildren();
  }
}

function setupShare() {
  const dlg = $('shareDialog');
  $('shareBtn').addEventListener('click', () => {
    if (!state.route) return;
    $('shareStart').value = (state.result.start.short || state.result.start.label || '').slice(0, 60);
    $('shareEnd').value = (state.result.end.short || state.result.end.label || '').slice(0, 60);
    $('shareNative').hidden = !canShareFiles();
    dlg.showModal();
    renderShare();
  });
  $('shareRefresh').addEventListener('click', renderShare);
  $('shareDownload').addEventListener('click', async () => {
    if (!lastCanvas) return;
    try {
      await downloadCanvas(lastCanvas);
      $('shareStatus').textContent = 'Downloaded.';
    } catch (err) {
      $('shareStatus').textContent = `Download failed: ${err.message}`;
    }
  });
  $('shareNative').addEventListener('click', async () => {
    if (!lastCanvas) return;
    try {
      await shareCanvas(lastCanvas, `Directions by ${PERSONAS[state.persona].name}, via Mapsplain`);
      $('shareStatus').textContent = 'Shared.';
    } catch (err) {
      if (err.name !== 'AbortError') $('shareStatus').textContent = 'Sharing isn’t available here. Use Download instead.';
    }
  });
}

async function loadDemos() {
  try {
    const res = await fetch('cache/demo.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.demos = data.demos || [];
    state.demosCapturedAt = data.capturedAt || '';
    const sel = $('demoSelect');
    state.demos.forEach((d) => sel.append(el('option', { value: d.id, text: `${d.title} (${d.profile})` })));
  } catch {
    const sel = $('demoSelect');
    sel.disabled = true;
    sel.options[0].textContent = 'Demo routes unavailable (open via a local server)';
  }
}

function loadDemo(id) {
  const d = state.demos.find((x) => x.id === id);
  if (!d) return;
  state.controller?.abort();
  Voice.stop();
  state.profile = d.profile;
  document.querySelectorAll('input[name="profile"]').forEach((r) => (r.checked = r.value === d.profile));
  if (id === 'blr-lalbagh' && !state.treeMode) {
    state.treeMode = true;
    $('treeMode').checked = true;
    persistPrefs();
  }
  applyResult({ kind: 'demo', title: d.title, start: d.start, end: d.end, profile: d.profile, source: `${d.source}, bundled snapshot`, raw: d.route, elements: d.landmarks, landmarkStatus: 'ok' });
  setStatus('info', `Loaded demo: ${d.title}. This is bundled demonstration data, not a live result.`);
  $('demoSelect').value = '';
}

function restoreLast(last) {
  if (!last || !last.raw) return;
  state.profile = last.profile;
  document.querySelectorAll('input[name="profile"]').forEach((r) => (r.checked = r.value === last.profile));
  applyResult({ ...last, kind: 'cached' });
  setStatus('info', 'Restored your last route from this device.');
}

function swap() {
  const s = state.start;
  const e = state.end;
  const sText = fields.start.input.value;
  setPlace('start', e, { moveMap: false });
  setPlace('end', s, { moveMap: false });
  if (!e) fields.start.input.value = fields.end.input.value;
  if (!s) fields.end.input.value = sText;
}

function init() {
  try {
    MapView.initMap($('map'), {
      onMapClick,
      onMarkerDrag: (which, lat, lon) => placeFromMap(which, lat, lon),
      onTurnClick: (i) => selectStep(i, { scroll: true }),
    });
  } catch (err) {
    $('map').replaceChildren(el('div', { class: 'map-error', text: `The map library couldn’t load (${err.message}). Check your connection and reload.` }));
  }

  renderPersonas();
  wireField('start');
  wireField('end');
  setupVoice();
  setupShare();

  document.querySelectorAll('[data-action="search"]').forEach((b) => b.addEventListener('click', () => {
    fields[b.dataset.target].input.focus();
    runSearch(b.dataset.target);
  }));
  document.querySelectorAll('[data-action="pick"]').forEach((b) => b.addEventListener('click', () => setPickMode(b.dataset.target)));
  $('swapBtn').addEventListener('click', swap);

  document.querySelectorAll('input[name="profile"]').forEach((r) => {
    r.checked = r.value === state.profile;
    r.addEventListener('change', () => {
      state.profile = r.value;
      persistPrefs();
      if (state.route && state.result.profile !== state.profile) markStale();
    });
  });

  const tree = $('treeMode');
  tree.checked = state.treeMode;
  tree.addEventListener('change', () => {
    state.treeMode = tree.checked;
    persistPrefs();
    Voice.stop();
    if (state.route) reassignLandmarks();
  });

  $('routeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    explain();
  });

  $('demoSelect').addEventListener('change', (e) => e.target.value && loadDemo(e.target.value));

  $('viewGroup').addEventListener('change', (e) => {
    state.view = e.target.value;
    persistPrefs();
    applyView();
  });

  $('directions').addEventListener('click', (e) => {
    if (e.target.closest('details, button, a')) return;
    const li = e.target.closest('.step');
    if (li) selectStep(Number(li.dataset.index));
  });
  $('directions').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('.step');
    if (li && e.target === li) {
      e.preventDefault();
      selectStep(Number(li.dataset.index));
    }
  });

  $('confusedBtn').addEventListener('click', showConfusion);
  $('creditsBtn').addEventListener('click', () => $('creditsDialog').showModal());
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  }));

  loadDemos().then(() => {
    const last = Store.loadLastResult();
    if (last && last.raw && last.start && last.end) {
      setStatus('info', `Last time: ${last.start.short || last.start.label} → ${last.end.short || last.end.label}.`, [{ label: 'Restore it', onClick: () => restoreLast(last) }]);
    }
  });

  window.mapsplain = { state };
}

init();
