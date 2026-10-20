const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

let voices = [];
let queue = [];
let position = 0;
let state = 'idle';
let listeners = { onState: () => {}, onLine: () => {} };
let currentOpts = {};
let session = 0;

export function isSupported() {
  return Boolean(synth && typeof window.SpeechSynthesisUtterance === 'function');
}

function refreshVoices() {
  if (!synth) return [];
  voices = synth.getVoices() || [];
  return voices;
}

export function initVoices(onChange) {
  if (!isSupported()) return;
  refreshVoices();
  onChange?.(voices);
  synth.addEventListener?.('voiceschanged', () => {
    refreshVoices();
    onChange?.(voices);
  });
}

export function availableLanguages() {
  const langs = new Set();
  for (const v of voices) {
    const code = (v.lang || '').toLowerCase();
    if (code.startsWith('en')) langs.add('en');
    if (code.startsWith('hi')) langs.add('hi');
    if (code.startsWith('kn')) langs.add('kn');
  }
  return langs;
}

export function bestVoice(langPrefix) {
  const matching = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(langPrefix));
  if (!matching.length) return null;
  if (langPrefix === 'en') {
    return matching.find((v) => /en[-_]in/i.test(v.lang)) || matching.find((v) => v.default) || matching[0];
  }
  return matching.find((v) => v.localService) || matching[0];
}

export function setListeners(l) {
  listeners = { ...listeners, ...l };
}

function setState(s) {
  state = s;
  listeners.onState(s);
}

function speakNext(id) {
  if (id !== session) return;
  if (position >= queue.length) {
    setState('idle');
    listeners.onLine(-1);
    return;
  }
  const item = queue[position];
  const u = new SpeechSynthesisUtterance(item.text);
  const voice = bestVoice(currentOpts.langPrefix || 'en');
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = currentOpts.rate ?? 1;
  u.pitch = currentOpts.pitch ?? 1;
  u.onstart = () => id === session && listeners.onLine(item.index);
  u.onend = () => {
    if (id !== session) return;
    position += 1;
    speakNext(id);
  };
  u.onerror = (e) => {
    if (id !== session) return;
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    setState('error');
    listeners.onLine(-1);
  };
  synth.speak(u);
}

export function speakAll(items, opts = {}) {
  if (!isSupported()) return false;
  stop();
  session += 1;
  queue = items.filter((i) => i.text);
  position = 0;
  currentOpts = opts;
  setState('speaking');
  speakNext(session);
  return true;
}

export function pause() {
  if (!isSupported() || state !== 'speaking') return;
  synth.pause();
  setState('paused');
}

export function resume() {
  if (!isSupported() || state !== 'paused') return;
  synth.resume();
  setState('speaking');
}

export function stop() {
  if (!isSupported()) return;
  session += 1;
  queue = [];
  position = 0;
  synth.cancel();
  if (state !== 'idle') setState('idle');
  listeners.onLine(-1);
}

export function getState() {
  return state;
}
