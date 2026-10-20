# Mapsplain

**Turn-by-turn directions the way a local Indian uncle gives them: landmarks, vague distances, confident instructions, and the timeless advice, “Ask anyone after that.”**

Mapsplain takes a real route on a real map and explains it in plain, funny language. Instead of “Continue for 400 metres, then turn left”, you get:

> “Keep going for a bit, then take a left near Shri Kalyana Subrahmanya Swamy Temple. Simple.”

The jokes are on top of a real route. The geometry, turn directions and landmarks all come from OpenStreetMap-based services, and the conventional, metre-accurate directions are always one click away.

Built for the **STEAL//REMAKE** remix hackathon. The original idea it remixes is conventional turn-by-turn navigation as popularised by [Google Maps](https://www.google.com/maps).

---

## Features

| Feature | What it does |
|---|---|
| Place search | Nominatim geocoding. Press Enter or the search button; results are cached. Recent places and demo places are suggested locally while you type, with no network calls. |
| Map picking | Tap the pin button and click the map, or just click an empty map to set A then B. Markers are draggable. Clicked points are reverse-geocoded into readable labels. |
| Real routing | OSRM driving (car profile) or walking (foot profile). The route polyline, numbered turn points, distance and duration are shown on a Leaflet map. |
| Landmark discovery | One batched Overpass query looks within 55 m of every maneuver for temples, mosques, churches, gurudwaras, petrol pumps, bakeries, sweet shops, banks, schools, hospitals, post offices, cafes, parks and identified trees. |
| Landmark naming | OSM tags become natural words: `amenity=fuel` → “the petrol pump”, `religion=hindu` → “the temple”, `species=Ficus benghalensis` → “the banyan tree”. Real mapped names are preferred. Nothing is invented. |
| “Gone too far” | Where a recognisable mapped place sits about 90 m straight past a turn (off the route you actually take), personas add “If you reach X, you went a little too far.” |
| Conversational distances | Under 100 m: *just a little ahead* · 100–399 m: *a short way* · 400–999 m: *keep going for a bit* · 1–2 km: *keep going for a while* · 2 km+: *stay on this road for a longer stretch*. Every bubble also shows the exact distance (≈ 450 m). |
| Four personas | Local Uncle, Auto Driver, Gen Z Bestie, Auntie. Each is a template set in `js/personas.js`. Switching persona rewrites every instruction instantly, with no new network request. Turn directions are never altered. |
| Side-by-side view | Conventional vs Mapsplain for the same steps, or either one alone. Clicking a step flies the map to its turn point and highlights it. Clicking a turn marker scrolls to the step. |
| Landmark match label | High / Medium / Low with a 0–100 internal score and a “why?” breakdown (distance, name, category, distance from the route, reuse). It is explicitly labelled as map-matching confidence, not proof the place still exists. |
| Voice mode | Web Speech API: Read aloud, Pause, Resume, Stop, with the spoken step highlighted. English is the default and prefers an `en-IN` voice when one exists. Hindi and Kannada appear only if the browser has those voices; they speak simple translated directions. |
| “Uncle got confused” | Shows a clearly badged **JOKE: do not follow** wrong instruction with a struck-through line, then the persona’s correction and the real direction. It never touches the route or the real directions. |
| Share card | html2canvas renders a branded card (persona, start/destination labels, distance, best 3–4 lines, signature joke, attribution). The labels are editable before rendering so you don’t share more than you want. Download PNG always works; the native Share button appears only where the Web Share API supports files. |
| Tree mode | Prefers mapped trees with identifying tags. Tells you when no identified trees are mapped near your route and falls back to other landmarks. |
| Landmark nicknames | Open a landmark’s map popup and give it your own name (“Sharma ji’s shop”). Stored in localStorage on your device only. |
| Demo mode | Four bundled routes (Bengaluru ×2, Mumbai, Delhi) work with no routing or landmark APIs. They are clearly labelled as demonstration snapshots. |
| Caching | The last successful route is saved locally and offered for restore. Geocoding results are cached. Preferences (persona, mode, view, voice language, tree mode) persist. |

---

## Tech stack

* HTML5, CSS3, vanilla JavaScript (ES modules). No framework, no build step, no backend.
* [Leaflet 1.9.4](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org) tiles
* [Nominatim](https://nominatim.org) for search and reverse geocoding
* [OSRM](https://project-osrm.org) public servers for routing
* [Overpass API](https://overpass-api.de) for landmarks
* Web Speech API (`speechSynthesis`) for voice
* [html2canvas 1.4.1](https://html2canvas.hertzen.com) for share cards (loaded on demand)
* `localStorage` for preferences, nicknames and the last route

No API keys. No paid services.

---

## Project structure

```
index.html          App shell, dialogs (credits, share)
style.css           All styling, responsive layout, share-card styles
js/app.js           UI controller and app state; wires everything together
js/map.js           Leaflet map: markers, route, turn points, landmark popups
js/geocoding.js     Nominatim search/reverse with a 1 req/s limiter and caching
js/routing.js       OSRM requests, route parsing, conventional instruction text
js/landmarks.js     Overpass query building, OSM tag naming, scoring, matching
js/personas.js      Distance bands, persona templates, joke generator, Hindi/Kannada speech text
js/voice.js         speechSynthesis queue with pause/resume/stop
js/share.js         Share card DOM, html2canvas loader, download and Web Share
js/storage.js       Safe localStorage wrapper
js/util.js          fetch with timeouts, rate limiter, geodesy, safe DOM builder
js/icons.js         Inline SVG icons for landmark categories
cache/demo.json     Bundled demo routes (real OSRM + Overpass snapshots)
assets/             logo.svg, favicon.svg, empty.svg
```

---

## Running locally

ES modules and `fetch('cache/demo.json')` do **not** work from `file://` URLs in most browsers, so serve the folder over HTTP. Any static server works.

**Option A: Python (already on macOS/Linux)**

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

**Option B: VS Code Live Server**

Install the “Live Server” extension, open the project folder, right-click `index.html`, then choose **Open with Live Server**.

**Option C: Node**

```bash
npx serve .
```

You need an internet connection for map tiles, search, routing, landmarks and the CDN-hosted Leaflet and html2canvas files.

### Using it

1. Type a start (e.g. “Mantri Square, Bengaluru”) and press **Enter**, then pick a result. Or tap the pin button and click the map.
2. Do the same for the destination.
3. Choose Driving or Walking, pick a persona, and press **Explain My Route**.
4. The route and street-based directions appear first. Landmarks follow when Overpass answers, which can take 10–60 s when the public server is busy.
5. Switch personas, toggle Tree mode, change the view, press **Read aloud**, try **Uncle got confused**, or make a **Share card**.

### Demo mode

Pick an entry under **Try a demo route**. Demo routes need no routing or landmark API, only map tiles to draw the background. They were captured once from OSRM and Overpass (date shown in the app) and are labelled “Demo snapshot” everywhere, including on share cards. They are not live results. The Lalbagh demo switches Tree mode on to show identified trees.

---

## Deployment (free static hosting)

The app is fully static and uses relative paths, so the folder can be uploaded as is.

**GitHub Pages**

1. Push this folder to a GitHub repository.
2. Go to *Settings → Pages → Build and deployment*, set *Source* to *Deploy from a branch*, and pick `main` / root.
3. Your app will be live at `https://<user>.github.io/<repo>/`.

**Netlify**: drag the folder onto <https://app.netlify.com/drop>, or connect the repo with no build command and `.` as the publish directory.

**Vercel**: `npx vercel` in the folder (framework preset: *Other*, no build command, output directory `.`).

Before a public launch, re-check the usage policies below. Public servers are shared community resources with no uptime guarantee.

---

## Public API dependencies and limits

| Service | Endpoint used | How Mapsplain respects it |
|---|---|---|
| OSM tiles | `tile.openstreetmap.org` | Visible attribution; standard Leaflet tile loading. [Tile policy](https://operations.osmfoundation.org/policies/tiles/) |
| Nominatim | `nominatim.openstreetmap.org` | No search-as-you-type (the [policy](https://operations.osmfoundation.org/policies/nominatim/) forbids client-side autocomplete), at most 1 request/second through a client-side queue, results cached in memory and localStorage. Browsers send the page’s Referer, which identifies the deployed app. |
| OSRM (driving) | `router.project-osrm.org` | Demo server: car profile only, one request per explain, fallback to FOSSGIS car. [Demo server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) |
| OSRM (walking) | `routing.openstreetmap.de/routed-foot` | FOSSGIS server with a real foot profile. The OSRM demo server is never used for walking, because it ignores the profile and always routes by car. [FOSSGIS terms](https://routing.openstreetmap.de/about.html) |
| Overpass | `overpass-api.de`, fallback `overpass.private.coffee` | One batched POST per route (up to 60 points; very long routes keep only the most important turns), sequential, never concurrent, one attempt per endpoint, no automatic retry loops; user-triggered “Retry landmarks” only. |

All requests have timeouts (search 12 s, routing 15 s, Overpass 55 s). Duplicate requests are prevented while one is in flight.

---

## Known limitations

* **Overpass can be slow.** During testing the main Overpass server often took 30–45 s to answer and sometimes timed out. The app shows the route right away with street names, explains that landmarks are still loading, and offers a retry if they fail.
* **Landmarks are only as good as OpenStreetMap.** A mapped temple may be hidden behind a wall, closed, or gone. Many Indian streets have sparse POI mapping; those steps fall back to street names or “watch the map for this one”.
* **Relationship words are cautious.** “At X” is used only when the landmark is within about 20 m of both the turn and the route line; otherwise “near X”. Mapsplain never claims “opposite”, “behind” or “beside”.
* **Driving uses OSRM’s car profile**, which knows nothing about Indian two-wheelers or autos. Durations are OSRM estimates without live traffic.
* **Voice quality depends on the device.** Mapsplain picks an `en-IN` voice when available but cannot produce an accent the installed voice lacks. Hindi/Kannada output is simple template translation of the core instruction; persona jokes stay in English.
* **Not offline navigation.** Demo routes work without the routing and landmark APIs, but map tiles still need the internet. There is no GPS tracking or rerouting; this is a route explainer, not a live navigator.
* **Share cards** use html2canvas, which approximates CSS. The Web Share button appears only where the browser supports sharing files (mostly mobile and Safari); Download always works.

---

## Attribution and licences

* Map data, tiles, places and landmarks: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). The bundled `cache/demo.json` contains OSM-derived data and is therefore also ODbL.
* [Leaflet](https://leafletjs.com): BSD-2-Clause.
* [OSRM](https://project-osrm.org): BSD-2-Clause; public demo server by the OSRM project; walking/fallback routing by [FOSSGIS e.V.](https://routing.openstreetmap.de).
* [Nominatim](https://nominatim.org): GPL-2.0 software; public server operated by the OpenStreetMap Foundation.
* [Overpass API](https://overpass-api.de): AGPL-3.0 software; public instances by their operators.
* [html2canvas](https://html2canvas.hertzen.com): MIT.
* Fonts: [Baloo 2](https://fonts.google.com/specimen/Baloo+2) and [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts (SIL Open Font License).
* **Conceptual inspiration:** Google Maps’ conventional turn-by-turn directions. Mapsplain is not affiliated with, sponsored by or endorsed by Google, and uses no Google logos, assets, APIs or data.

The in-app **About & Credits** dialog repeats these acknowledgements and explains what was changed from the original idea.
