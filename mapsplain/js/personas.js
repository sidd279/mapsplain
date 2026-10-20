import { turnKind, directionWords, side, ordinal, streetLabel } from './routing.js';
import { cardinal, hashString } from './util.js';

export const SIGNATURE = 'Reached? If not, ask anyone, everyone knows.';

const DISTANCE_BANDS = [
  { key: 'tiny', max: 100, phrase: 'Just a little ahead.', clause: 'go just a little ahead' },
  { key: 'short', max: 400, phrase: 'A short way.', clause: 'go a short way' },
  { key: 'bit', max: 1000, phrase: 'Keep going for a bit.', clause: 'keep going for a bit' },
  { key: 'while', max: 2000, phrase: 'Keep going for a while.', clause: 'keep going for a while' },
  { key: 'long', max: Infinity, phrase: 'Stay on this road for a longer stretch.', clause: 'stay on this road for a longer stretch' },
];

export function vagueDistance(m) {
  const band = DISTANCE_BANDS.find((b) => m < b.max) || DISTANCE_BANDS[DISTANCE_BANDS.length - 1];
  return { ...band };
}

export const PERSONAS = {
  uncle: {
    id: 'uncle',
    name: 'Local Uncle',
    emoji: '👴',
    tagline: 'Confident. Slightly confusing. Always helpful.',
    voice: { rate: 0.95, pitch: 0.85 },
    depart: [
      'Beta, listen carefully. Start on {street} and face {heading}.',
      'Okay beta, first thing: you are on {street}, go {heading}.',
    ],
    departNoStreet: ['Beta, listen carefully. Start off heading {heading}.'],
    departLm: ['{Lm} is near your starting point. Good sign.', '{Lm} is close to where you start.'],
    turnLm: [
      '{Approach}, then {action} {rel} {lm}. Simple.',
      '{Approach} till you see {lm}, then {action} {relIt}.',
      '{Approach}. Look for {lm} and {action} {relIt}. Everybody knows it.',
    ],
    turnStreet: ['{Approach}, then {action} onto {street}. Everyone knows {street}.', '{Approach} and {action} into {street}.'],
    turnBare: ['{Approach}, then {action}. No proper landmark there, beta, so keep one eye on the map.'],
    straight: ['{Approach}. Road becomes {street}, don’t panic, keep going straight.', '{Approach} straight. Now it is called {street}, same road only.'],
    straightNoStreet: ['{Approach}, keep going straight only.'],
    roundabout: ['{Approach} to the circle and take the {exit} exit{onto}. Don’t go round and round like my nephew.'],
    exitRoundabout: ['Come out of the circle{onto}{lmClause}.'],
    fork: ['{Approach}, road splits into two. Keep {side}{lmClause}.'],
    uturn: ['{Approach}, then take a U-turn{lmClause}. Happens to everybody.'],
    endOfRoad: ['{Approach} till the road ends{lmClause}, then {action}.'],
    merge: ['{Approach}, then merge {mergeSide}{onto}. Slowly, beta.'],
    ramp: ['{Approach}, take the ramp {rampSide}{onto}.'],
    arrive: ['{Approach} and you are there{lmArrive}.'],
    arriveTail: ['Uncle never gets it wrong.'],
    overshoot: ['If you reach {lm}, you went a little too far.', 'If {lm} comes, you have gone too far. Come back.'],
    joke: ['Beta, at {where}, take a {wrong}. Wait, wait...'],
    correction: ['Arre, sorry beta, other {sideWord}! It is {real}.'],
  },
  auto: {
    id: 'auto',
    name: 'Auto Driver',
    emoji: '🛺',
    tagline: 'Street-smart, impatient, knows every shortcut.',
    voice: { rate: 1.1, pitch: 1.0 },
    depart: ['Sir, sit. We start on {street}, going {heading}.', 'Okay sir, {street}, {heading} side. Let’s go.'],
    departNoStreet: ['Okay sir, start going {heading}. Let’s go.'],
    departLm: ['{Lm} is near the start, sir.'],
    turnLm: [
      'Sir, {approach}. You’ll see {lm}. {Action} {relIt}.',
      '{Approach}, sir, then {action} {rel} {lm}. Easy route.',
      '{Approach}. {Action} {rel} {lm}, sir. Everyone knows that place.',
    ],
    turnStreet: ['{Approach}, sir, then {action} into {street}.', '{Approach}. {Action} into {street}, short cut only.'],
    turnBare: ['{Approach}, sir, then {action}. No landmark there, watch the map.'],
    straight: ['{Approach}. Road name changes to {street}, but straight only, sir.', 'Traffic is there, sir, but {approach}. Now it’s {street}.'],
    straightNoStreet: ['{Approach}, sir. Straight only.'],
    roundabout: ['{Approach} to the circle, sir. {exit} exit{onto}. Don’t take round.'],
    exitRoundabout: ['Come out of the circle{onto}{lmClause}, sir.'],
    fork: ['{Approach}, road splits. Keep {side}{lmClause}, sir.'],
    uturn: ['{Approach}, then U-turn{lmClause}. No problem, sir, happens daily.'],
    endOfRoad: ['{Approach} till the road ends{lmClause}, sir, then {action}.'],
    merge: ['{Approach}, merge {mergeSide}{onto}. Horn ready.'],
    ramp: ['{Approach}, take the ramp {rampSide}{onto}, sir.'],
    arrive: ['{Approach}, sir, and we are there{lmArrive}.'],
    arriveTail: ['Reached, sir. Meter is a different discussion.'],
    overshoot: ['If you see {lm}, sir, you missed it. Come back.', 'Reaching {lm} means too far, sir.'],
    joke: ['Sir, at {where}, {wrong} side. Short cut!'],
    correction: ['Sorry sir, sorry, {sideWord} only! It is {real}. That short cut is for autos.'],
  },
  genz: {
    id: 'genz',
    name: 'Gen Z Bestie',
    emoji: '🧋',
    tagline: 'Casual, chaotic, weirdly accurate.',
    voice: { rate: 1.08, pitch: 1.15 },
    depart: ['Okay bestie, we start on {street}, heading {heading}. Let’s gooo.', 'Bestie, {street}, face {heading}. Main character walk-out moment.'],
    departNoStreet: ['Okay bestie, start heading {heading}. Let’s gooo.'],
    departLm: ['{Lm} is near the start. Iconic.'],
    turnLm: [
      'Bestie, {approach}. {Lm} is your landmark. {Action} {relIt}.',
      '{Approach}, then {action} {rel} {lm}. Trust the route.',
      '{Approach}. Spot {lm}? {Action} {relIt}. It’s giving navigation.',
    ],
    turnStreet: ['{Approach}, then {action} onto {street}. No cap.', '{Approach}. {Action} onto {street}, slay.'],
    turnBare: ['{Approach}, then {action}. Zero landmarks here, so check the map, bestie.'],
    straight: ['{Approach}. Road rebrands to {street}, we stay straight.', '{Approach}. It’s {street} now. Same vibe, keep straight.'],
    straightNoStreet: ['{Approach}. Straight, no plot twists.'],
    roundabout: ['{Approach} to the circle. {exit} exit{onto}. Don’t loop like my situationship.'],
    exitRoundabout: ['Exit the circle{onto}{lmClause}.'],
    fork: ['{Approach}, the road forks. Keep {side}{lmClause}. Choose wisely.'],
    uturn: ['{Approach}, then U-turn{lmClause}. Character development.'],
    endOfRoad: ['{Approach} till the road ends{lmClause}, then {action}.'],
    merge: ['{Approach}, merge {mergeSide}{onto}. Smooth like the edit.'],
    ramp: ['{Approach}, ramp {rampSide}{onto}.'],
    arrive: ['{Approach} and we made it{lmArrive}.'],
    arriveTail: ['Main character navigation.'],
    overshoot: ['If you see {lm}, that’s your sign to check the map.', 'Passing {lm}? Plot twist: too far.'],
    joke: ['Bestie, at {where}, take a {wrong}. Vibes said so.'],
    correction: ['Wait no, that was a glitch. {SideWord}, bestie! It’s {real}. My bad.'],
  },
  auntie: {
    id: 'auntie',
    name: 'Auntie',
    emoji: '👵',
    tagline: 'Caring, chatty, a little nosy.',
    voice: { rate: 0.98, pitch: 1.2 },
    depart: ['Did you eat, beta? Okay. Start on {street}, going {heading}.', 'First drink some water. Then start on {street}, {heading} side.'],
    departNoStreet: ['Did you eat, beta? Okay. Start off going {heading}.'],
    departLm: ['{Lm} is near where you start, see?'],
    turnLm: [
      '{Approach}, then {action} {rel} {lm}. Don’t rush.',
      'Beta, {approach}. You’ll find {lm}. {Action} {relIt}.',
      '{Approach}, then {action} {rel} {lm}. My friend’s son lives there only.',
    ],
    turnStreet: ['{Approach}, then {action} onto {street}. Careful, beta.', '{Approach} and {action} onto {street}. Who are you meeting, by the way?'],
    turnBare: ['{Approach}, then {action}. Nothing to see there, so look at your map, beta.'],
    straight: ['{Approach}. Now it becomes {street}, just go straight.', '{Approach}. That is {street} now. Straight, straight.'],
    straightNoStreet: ['{Approach}, straight only, beta.'],
    roundabout: ['{Approach} to the circle, take the {exit} exit{onto}. Slowly.'],
    exitRoundabout: ['Come out of the circle{onto}{lmClause}.'],
    fork: ['{Approach}, the road splits. Keep {side}{lmClause}, beta.'],
    uturn: ['{Approach}, then take a U-turn{lmClause}. No shame in it.'],
    endOfRoad: ['{Approach} till the road ends{lmClause}, then {action}.'],
    merge: ['{Approach}, merge {mergeSide}{onto}. Indicator first!'],
    ramp: ['{Approach}, take the ramp {rampSide}{onto}.'],
    arrive: ['{Approach} and you have come{lmArrive}.'],
    arriveTail: ['You reached? Good. Call when you get there.'],
    overshoot: ['If you reach {lm}, you went too far, beta.', 'If {lm} comes, turn back, beta.'],
    joke: ['Beta, at {where}, take a {wrong}. I think so...'],
    correction: ['Arre, my glasses! Other {sideWord}, beta. It is {real}.'],
  },
};

export const PERSONA_ORDER = ['uncle', 'auto', 'genz', 'auntie'];

function pick(list, seed) {
  if (!list || !list.length) return '';
  return list[hashString(seed) % list.length];
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (k in vars) return vars[k];
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    if (lower in vars) return cap(String(vars[lower]));
    return '';
  });
}

function actionPhrase(mv) {
  const dir = directionWords(mv.modifier);
  switch (turnKind(mv)) {
    case 'uturn': return 'take a U-turn';
    case 'straight': return 'go straight';
    default: return dir === 'straight' ? 'go straight' : `take a ${dir}`;
  }
}

function approachClause(mv, prev) {
  if (mv.index === 0) return '';
  const band = vagueDistance(mv.approach);
  if (mv.approach < 40 && prev && !['depart', 'straight'].includes(turnKind(prev))) return 'go just a few steps more';
  return band.clause;
}

export function generateDirections(route, assignments, personaId) {
  const p = PERSONAS[personaId] || PERSONAS.uncle;
  const list = assignments?.perManeuver || [];
  return route.maneuvers.map((mv, i) => {
    const a = list[i] || {};
    const lm = a.landmark;
    const kind = turnKind(mv);
    const street = streetLabel(mv);
    const sideWord = side(mv.modifier);
    const approach = approachClause(mv, route.maneuvers[i - 1]);
    const rel = a.relation === 'at' ? 'at' : 'near';
    const vars = {
      approach,
      action: actionPhrase(mv),
      lm: lm ? lm.label : '',
      rel,
      relIt: a.relation === 'at' ? 'there' : 'near it',
      street,
      heading: cardinal(mv.bearingAfter ?? 0),
      exit: mv.exit ? ordinal(mv.exit) : 'next',
      onto: street ? ` onto ${street}` : '',
      side: sideWord || 'straight',
      rampSide: sideWord ? `on the ${sideWord}` : 'ahead',
      mergeSide: sideWord || 'ahead',
      lmClause: lm ? ` ${rel} ${lm.label}` : '',
      lmArrive: lm ? `, ${rel} ${lm.label}` : '',
    };
    const seed = `${p.id}:${i}:${kind}`;
    let template;
    switch (kind) {
      case 'depart':
        template = pick(street ? p.depart : p.departNoStreet, seed);
        if (lm) template += ` ${pick(p.departLm, seed + 'lm')}`;
        break;
      case 'arrive':
        template = `${pick(p.arrive, seed)}${sideWord ? ` It’s on your ${sideWord}.` : ''} ${pick(p.arriveTail, seed + 't')} ${SIGNATURE}`;
        break;
      case 'turn':
        template = pick(lm ? p.turnLm : street ? p.turnStreet : p.turnBare, seed);
        break;
      case 'straight':
        template = pick(street ? p.straight : p.straightNoStreet, seed);
        break;
      default:
        template = pick(p[kind] || p.turnStreet, seed);
    }
    if (lm && !/\{(lm|Lm|lmClause|lmArrive)\}/.test(template)) template += ' Look out for {lm}.';
    if (!approach) template = template.replace(/\{Approach\}[,.]?\s*/g, '').replace(/\{approach\}[,.]?\s*/g, '');
    let text = fill(template, vars).replace(/\s+/g, ' ').replace(/\s([,.])/g, '$1').trim();
    text = cap(text);
    if (a.overshoot) text += ` ${fill(pick(p.overshoot, seed + 'o'), { lm: a.overshoot.label })}`;
    const band = vagueDistance(mv.approach);
    return {
      index: i,
      kind,
      text,
      distanceKey: mv.index === 0 ? null : band.key,
      distancePhrase: mv.index === 0 ? null : band.phrase,
      landmark: lm || null,
      relation: lm ? rel : null,
      confidence: a.confidence || null,
      overshoot: a.overshoot || null,
    };
  });
}

const FLIP = {
  left: 'right', right: 'left', 'slight left': 'slight right', 'slight right': 'slight left',
  'sharp left': 'sharp right', 'sharp right': 'sharp left',
};

export function pickConfusableStep(route, assignments, nonce = 0) {
  const turns = route.maneuvers.filter((mv) => FLIP[mv.modifier] && ['turn', 'endOfRoad', 'fork'].includes(turnKind(mv)));
  if (!turns.length) return null;
  const withLm = turns.filter((mv) => assignments?.perManeuver?.[mv.index]?.landmark);
  const pool = withLm.length ? withLm : turns;
  return pool[nonce % pool.length];
}

export function confusedJoke(route, assignments, personaId, nonce = 0) {
  const p = PERSONAS[personaId] || PERSONAS.uncle;
  const mv = pickConfusableStep(route, assignments, nonce);
  if (!mv) return null;
  const a = assignments?.perManeuver?.[mv.index] || {};
  const real = directionWords(mv.modifier);
  const where = a.landmark ? a.landmark.label : streetLabel(mv) ? `the turn for ${streetLabel(mv)}` : `turn ${mv.index}`;
  const seed = `${p.id}:joke:${nonce}`;
  const sideWord = side(mv.modifier);
  return {
    index: mv.index,
    joke: cap(fill(pick(p.joke, seed), { where, wrong: FLIP[mv.modifier] })),
    correction: fill(pick(p.correction, seed + 'c'), { sideWord, SideWord: cap(sideWord), real: `a ${real}` }),
  };
}

const LOCALE = {
  hi: {
    dist: { tiny: 'थोड़ा सा आगे', short: 'थोड़ी दूर चलो', bit: 'कुछ देर सीधे चलते रहो', while: 'काफ़ी देर तक चलते रहो', long: 'इसी सड़क पर लंबा चलते रहो' },
    action: {
      left: 'बाएँ मुड़ो', right: 'दाएँ मुड़ो', 'slight left': 'हल्का सा बाएँ मुड़ो', 'slight right': 'हल्का सा दाएँ मुड़ो',
      'sharp left': 'पूरा बाएँ मुड़ो', 'sharp right': 'पूरा दाएँ मुड़ो', straight: 'सीधे जाओ', 'U-turn': 'यू-टर्न लो',
    },
    nouns: {
      temple: 'मंदिर', mosque: 'मस्जिद', church: 'चर्च', gurudwara: 'गुरुद्वारा', 'Jain temple': 'जैन मंदिर', 'Buddhist temple': 'बौद्ध मंदिर',
      'place of worship': 'पूजा स्थल', 'petrol pump': 'पेट्रोल पंप', bakery: 'बेकरी', 'sweet shop': 'मिठाई की दुकान', bank: 'बैंक',
      school: 'स्कूल', college: 'कॉलेज', hospital: 'अस्पताल', clinic: 'क्लिनिक', 'post office': 'डाकघर', 'cinema hall': 'सिनेमा हॉल',
      'police station': 'पुलिस स्टेशन', supermarket: 'सुपरमार्केट', shop: 'दुकान', 'medical shop': 'मेडिकल स्टोर', park: 'पार्क',
      cafe: 'कैफ़े', restaurant: 'होटल', 'food stall': 'खाने की दुकान',
    },
    tree: 'पेड़',
    near: (lm) => `${lm} के पास`,
    depart: (street) => (street ? `${street} से शुरू करो।` : 'चलना शुरू करो।'),
    turn: (d, lm, act) => [d, lm ? `फिर ${lm} ${act}` : `फिर ${act}`].filter(Boolean).join(', ') + '।',
    roundabout: (d, n) => [d, `गोल चक्कर पर ${n} नंबर का रास्ता लो`].filter(Boolean).join(', ') + '।',
    fork: (d, act) => [d, `दो रास्ते मिलें तो ${act}`].filter(Boolean).join(', ') + '।',
    arrive: (d, lm) => [d, lm ? `${lm} आपकी मंज़िल है` : 'आपकी मंज़िल आ गई'].filter(Boolean).join(', ') + '। पहुँच गए? नहीं तो किसी से भी पूछ लो, सबको पता है।',
    overshoot: (lm) => `अगर ${lm} आ जाए, तो आप आगे निकल गए।`,
  },
  kn: {
    dist: { tiny: 'ಸ್ವಲ್ಪ ಮುಂದೆ', short: 'ಸ್ವಲ್ಪ ದೂರ ಹೋಗಿ', bit: 'ಸ್ವಲ್ಪ ಹೊತ್ತು ನೇರವಾಗಿ ಹೋಗಿ', while: 'ತುಂಬಾ ಹೊತ್ತು ನೇರವಾಗಿ ಹೋಗಿ', long: 'ಇದೇ ರಸ್ತೆಯಲ್ಲಿ ತುಂಬಾ ದೂರ ಹೋಗಿ' },
    action: {
      left: 'ಎಡಕ್ಕೆ ತಿರುಗಿ', right: 'ಬಲಕ್ಕೆ ತಿರುಗಿ', 'slight left': 'ಸ್ವಲ್ಪ ಎಡಕ್ಕೆ ತಿರುಗಿ', 'slight right': 'ಸ್ವಲ್ಪ ಬಲಕ್ಕೆ ತಿರುಗಿ',
      'sharp left': 'ಪೂರ್ತಿ ಎಡಕ್ಕೆ ತಿರುಗಿ', 'sharp right': 'ಪೂರ್ತಿ ಬಲಕ್ಕೆ ತಿರುಗಿ', straight: 'ನೇರವಾಗಿ ಹೋಗಿ', 'U-turn': 'ಯೂ-ಟರ್ನ್ ತೆಗೆದುಕೊಳ್ಳಿ',
    },
    nouns: {
      temple: 'ದೇವಸ್ಥಾನ', mosque: 'ಮಸೀದಿ', church: 'ಚರ್ಚ್', gurudwara: 'ಗುರುದ್ವಾರ', 'Jain temple': 'ಜೈನ ಬಸದಿ', 'petrol pump': 'ಪೆಟ್ರೋಲ್ ಬಂಕ್',
      bakery: 'ಬೇಕರಿ', 'sweet shop': 'ಸಿಹಿ ಅಂಗಡಿ', bank: 'ಬ್ಯಾಂಕ್', school: 'ಶಾಲೆ', college: 'ಕಾಲೇಜು', hospital: 'ಆಸ್ಪತ್ರೆ',
      'post office': 'ಅಂಚೆ ಕಚೇರಿ', cafe: 'ಕೆಫೆ', restaurant: 'ಹೋಟೆಲ್', park: 'ಉದ್ಯಾನ', shop: 'ಅಂಗಡಿ', supermarket: 'ಸೂಪರ್ ಮಾರ್ಕೆಟ್',
      'medical shop': 'ಮೆಡಿಕಲ್ ಶಾಪ್', 'police station': 'ಪೊಲೀಸ್ ಠಾಣೆ',
    },
    tree: 'ಮರ',
    near: (lm) => `${lm} ಹತ್ತಿರ`,
    depart: (street) => (street ? `${street} ಇಂದ ಶುರು ಮಾಡಿ.` : 'ಹೊರಡಿ.'),
    turn: (d, lm, act) => [d, lm ? `ನಂತರ ${lm} ${act}` : `ನಂತರ ${act}`].filter(Boolean).join(', ') + '.',
    roundabout: (d, n) => [d, `ಸರ್ಕಲ್‌ನಲ್ಲಿ ${n}ನೇ ದಾರಿ ತೆಗೆದುಕೊಳ್ಳಿ`].filter(Boolean).join(', ') + '.',
    fork: (d, act) => [d, `ರಸ್ತೆ ಎರಡಾದಾಗ ${act}`].filter(Boolean).join(', ') + '.',
    arrive: (d, lm) => [d, lm ? `${lm} ನಿಮ್ಮ ಸ್ಥಳ` : 'ನಿಮ್ಮ ಸ್ಥಳ ಬಂತು'].filter(Boolean).join(', ') + '. ತಲುಪಿದ್ರಾ? ಇಲ್ಲಾಂದ್ರೆ ಯಾರನ್ನಾದ್ರೂ ಕೇಳಿ, ಎಲ್ರಿಗೂ ಗೊತ್ತು.',
    overshoot: (lm) => `${lm} ಬಂದ್ರೆ, ನೀವು ಮುಂದೆ ಹೋಗಿಬಿಟ್ಟಿದ್ದೀರಿ.`,
  },
};

function localName(lm, L) {
  if (!lm) return '';
  if (lm.nickname) return lm.nickname;
  if (lm.named) return lm.name;
  if (lm.isTree) {
    const species = lm.noun.replace(/\s*tree$/, '');
    return `${species} ${L.tree}`;
  }
  return L.nouns[lm.noun] || lm.noun;
}

export function localizedText(route, item, lang) {
  const L = LOCALE[lang];
  if (!L) return item.text;
  const mv = route.maneuvers[item.index];
  const d = item.distanceKey ? L.dist[item.distanceKey] : '';
  const lmName = localName(item.landmark, L);
  const lm = lmName ? L.near(lmName) : '';
  const act = L.action[directionWords(mv.modifier)] || L.action.straight;
  let text;
  switch (item.kind) {
    case 'depart': text = L.depart(streetLabel(mv)); break;
    case 'arrive': text = L.arrive(d, lmName); break;
    case 'roundabout': text = L.roundabout(d, mv.exit || 1); break;
    case 'fork': text = L.fork(d, act); break;
    case 'straight': text = L.turn(d, lm, L.action.straight); break;
    default: text = L.turn(d, lm, act);
  }
  if (item.overshoot) text += ` ${L.overshoot(localName(item.overshoot, L))}`;
  return text;
}

export const SPEECH_LANGS = {
  en: { label: 'English', prefix: 'en' },
  hi: { label: 'हिन्दी (Hindi)', prefix: 'hi' },
  kn: { label: 'ಕನ್ನಡ (Kannada)', prefix: 'kn' },
};
