// ─────────────────────────────────────────────────────────────────────────────
// LUMOKI — WhatsApp Diagnostic Chatbot v2
// Architecture : conversationnelle (Claude Haiku collecte) + Claude Opus diagnostic
// Stack: Node.js + Express + Twilio + Supabase + Resend
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const twilio     = require('twilio');
const { createClient } = require('@supabase/supabase-js');
const Anthropic  = require('@anthropic-ai/sdk');
const fetch      = require('node-fetch');
const { Resend } = require('resend');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── CLIENTS ──────────────────────────────────────────────────────────────────
const db        = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ai        = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend    = new Resend(process.env.RESEND_API_KEY);
const twilioCli = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ── LOGO LUMOKI (URL publique Supabase storage) ───────────────────────────────
const LUMOKI_LOGO_URL = process.env.LUMOKI_LOGO_URL || null;

// ── SITE TYPE MAPPING ─────────────────────────────────────────────────────────
const SITE_TYPE_MAP = {
  school: 'school', école: 'school', ecole: 'school', scuola: 'school',
  shule: 'school', makaranta: 'school', ile_iwe: 'school', kalanso: 'school',
  health: 'health', santé: 'health', sante: 'health', clinic: 'health',
  dispensaire: 'health', hopital: 'health', furaso: 'health', clinique: 'health',
  water: 'water', eau: 'water', pompe: 'water', pump: 'water',
  ji_pompe: 'water', bomba: 'water', familles: 'community', famille: 'community',
  homes: 'community', maisons: 'community', residential: 'community',
  community: 'community', village: 'community', sow: 'community',
  business: 'business', entreprise: 'business', commerce: 'business'
};

function mapSiteType(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[^a-zéèàùâêîôûäëïöü_]/g, '_');
  for (const [key, val] of Object.entries(SITE_TYPE_MAP)) {
    if (lower.includes(key)) return val;
  }
  // Numeric fallback (ancien format)
  const num = { '1':'community','2':'school','3':'health','4':'water','5':'business' };
  return num[raw.trim()] || null;
}

// ── COUNTRY MAP ───────────────────────────────────────────────────────────────
const COUNTRY_MAP = {
  '1':  { code: 'BEN', name: 'Bénin' },    '2':  { code: 'SEN', name: 'Sénégal' },
  '3':  { code: 'MLI', name: 'Mali' },      '4':  { code: 'BFA', name: 'Burkina Faso' },
  '5':  { code: 'GIN', name: 'Guinée' },    '6':  { code: 'CIV', name: "Côte d'Ivoire" },
  '7':  { code: 'NGA', name: 'Nigeria' },   '8':  { code: 'GHA', name: 'Ghana' },
  '9':  { code: 'TZA', name: 'Tanzanie' },  '10': { code: 'UGA', name: 'Ouganda' },
  '11': { code: 'ZMB', name: 'Zambie' },    '12': { code: 'AFR', name: 'Autre' }
};

// ── PHOTO SLOTS REQUIS ────────────────────────────────────────────────────────
const REQUIRED_PHOTOS = [
  { type: 'inverter_far',      label: 'onduleur — vue générale',     label_en: 'inverter — full view' },
  { type: 'inverter_brand',    label: 'onduleur — étiquette/marque', label_en: 'inverter — brand label' },
  { type: 'inverter_screen',   label: 'onduleur — écran/affichage',  label_en: 'inverter — screen/display' },
  { type: 'batteries_far',     label: 'batteries — vue générale',    label_en: 'batteries — full view' },
  { type: 'battery_brand',     label: 'batteries — étiquette',       label_en: 'batteries — label' },
  { type: 'battery_terminals', label: 'batteries — bornes/câbles',   label_en: 'batteries — terminals' },
  { type: 'tableau',           label: 'tableau électrique',          label_en: 'electrical panel' },
  { type: 'panels_far',        label: 'panneaux — vue générale',     label_en: 'panels — full view' },
  { type: 'panel_close',       label: 'panneaux — gros plan',        label_en: 'panels — close-up' },
];

// ── REVERSE GEOCODING ─────────────────────────────────────────────────────────
function guessCountryFromCoords(lat, lng) {
  const boxes = [
    { code:'BEN', name:'Bénin',         latMin:6.2,  latMax:12.4, lngMin:0.8,   lngMax:3.9  },
    { code:'SEN', name:'Sénégal',       latMin:12.3, latMax:16.7, lngMin:-17.6, lngMax:-11.4},
    { code:'MLI', name:'Mali',          latMin:10.1, latMax:25.0, lngMin:-12.2, lngMax:4.3  },
    { code:'BFA', name:'Burkina Faso',  latMin:9.4,  latMax:15.1, lngMin:-5.5,  lngMax:2.4  },
    { code:'GIN', name:'Guinée',        latMin:7.2,  latMax:12.7, lngMin:-15.1, lngMax:-7.7 },
    { code:'CIV', name:"Côte d'Ivoire",latMin:4.3,  latMax:10.7, lngMin:-8.6,  lngMax:-2.5 },
    { code:'NGA', name:'Nigeria',       latMin:4.3,  latMax:13.9, lngMin:2.7,   lngMax:14.7 },
    { code:'GHA', name:'Ghana',         latMin:4.7,  latMax:11.2, lngMin:-3.3,  lngMax:1.2  },
    { code:'TZA', name:'Tanzanie',      latMin:-11.7,latMax:-1.0, lngMin:29.3,  lngMax:40.5 },
    { code:'UGA', name:'Ouganda',       latMin:-1.5, latMax:4.2,  lngMin:29.6,  lngMax:35.0 },
    { code:'ZMB', name:'Zambie',        latMin:-18.1,latMax:-8.2, lngMin:22.0,  lngMax:33.7 },
  ];
  return boxes.find(b => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) || null;
}

async function reverseGeocode(lat, lng) {
  const urls = [
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=8`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Lumoki/1.0 contact@lumoki.africa' }, signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      if (d?.address) {
        const commune = d.address.village || d.address.town || d.address.city || d.address.county || d.address.state_district || '';
        const country = d.address.country || '';
        const cc      = d.address.country_code?.toUpperCase() || '';
        if (commune || country) return { commune, country, country_code: cc };
      }
    } catch(e) { /* try next */ }
  }
  const guess = guessCountryFromCoords(lat, lng);
  if (guess) return { commune: '', country: guess.name, country_code: guess.code };
  console.error('All geocode attempts failed — GPS stored, going manual');
  return null;
}

// ── FIND NEAREST CITY ─────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function findNearestCity(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const { data: cities, error } = await db.from('cities').select('city_name, lat, lng');
    if (error || !cities?.length) return null;
    let nearest = null, minDist = Infinity;
    for (const c of cities) {
      const d = haversineKm(lat, lng, c.lat, c.lng);
      if (d < minDist) { minDist = d; nearest = c; }
    }
    return nearest ? { name: nearest.city_name, distance_km: Math.round(minDist) } : null;
  } catch(e) { console.error('findNearestCity error:', e.message); return null; }
}

// ── UPLOAD PHOTO ─────────────────────────────────────────────────────────────
async function uploadPhoto(mediaUrl, convId, type) {
  try {
    const auth    = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const r       = await fetch(mediaUrl, { headers: { Authorization: auth } });
    const buf     = await r.buffer();
    const rawMime = r.headers.get('content-type') || 'image/jpeg';
    const mimeType = rawMime.includes('png') ? 'image/png' :
                     rawMime.includes('gif') ? 'image/gif' :
                     rawMime.includes('webp') ? 'image/webp' : 'image/jpeg';
    const ext  = mimeType.includes('png') ? 'png' : 'jpg';
    const path = `conv-${convId}/${type}_${Date.now()}.${ext}`;
    const { error } = await db.storage.from('site-photos').upload(path, buf, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const publicUrl = db.storage.from('site-photos').getPublicUrl(path).data.publicUrl;
    return { url: publicUrl, base64: buf.toString('base64'), mimeType };
  } catch(e) { console.error('Upload error:', e); return null; }
}

// ── DETECT LANGUAGE ───────────────────────────────────────────────────────────
async function detectLanguage(text) {
  try {
    const res = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 10,
      messages: [{ role: 'user', content: `Language code only (fr/en/wo/bm/sw/ha/yo/fon/dyu) for: "${text}"` }]
    });
    return res.content[0].text.trim().toLowerCase().slice(0, 3);
  } catch(e) { return 'fr'; }
}

// ── SEND WHATSAPP ─────────────────────────────────────────────────────────────
async function send(to, body, mediaUrl = null) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:')
    ? process.env.TWILIO_WHATSAPP_NUMBER
    : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
  const params = { from, to: `whatsapp:${to}`, body };
  if (mediaUrl) params.mediaUrl = [mediaUrl];
  await twilioCli.messages.create(params);
}

// ── HAIKU COLLECTION ENGINE ───────────────────────────────────────────────────
// Returns { reply, updates, location_confirmed, ready }
async function runHaiku(state, userMessage, lang, photos, hasGps, gpsLat, gpsLng) {

  const photosSummary = (state.photos || []).map(p =>
    `[${p.type}] ${p.analysis?.observations?.slice(0,80) || 'uploaded'}`
  ).join('\n') || 'none yet';

  const missingPhotos = REQUIRED_PHOTOS
    .filter(r => !(state.photos || []).find(p => p.type === r.type))
    .map(r => lang === 'en' ? r.label_en : r.label);

  const newPhotosCount = photos.length;

  const systemPrompt = `You are Lumoki's WhatsApp assistant collecting data about a broken off-grid solar installation in Sub-Saharan Africa.

CURRENT COLLECTED DATA:
- lang: ${lang}
- lat/lng: ${state.lat || 'missing'} / ${state.lng || 'missing'}
- location_confirmed: ${state.location_confirmed || false}
- village: ${state.village || 'missing'}
- country_name: ${state.country_name || 'missing'}
- site_type: ${state.site_type || 'missing'}  (must be one of: school/health/community/water/business)
- people_count: ${state.people_count || 'missing'}
- offline_duration: ${state.offline_duration || 'missing'}
- symptom: ${state.symptom || 'missing'}
- recent_event: ${state.recent_event || 'missing'}
- contact: ${state.contact || 'missing'}
- photos collected: ${(state.photos||[]).length}/9 required
${photosSummary !== 'none yet' ? `\nPHOTOS SO FAR:\n${photosSummary}` : ''}
${missingPhotos.length > 0 ? `\nMISSING PHOTOS: ${missingPhotos.join(', ')}` : '\nAll 9 photos received!'}
${newPhotosCount > 0 ? `\nUSER JUST SENT ${newPhotosCount} NEW PHOTO(S) — acknowledge them.` : ''}
${hasGps ? `\nUSER JUST SHARED GPS: ${gpsLat}, ${gpsLng} — it has been saved automatically.` : ''}

RULES:
1. Respond in the user's language (${lang}). If unknown language detected, adapt.
2. Be warm, concise, WhatsApp-style (no long lists).
3. Never re-ask something already collected.
4. Accept free-text answers — interpret intelligently. "since the storm last week" = recent_event storm.
5. For location: after GPS or village entry, ALWAYS confirm: "I found [village, country] — is that correct?" Wait for yes/no before setting location_confirmed=true.
6. For site_type: interpret freely but map to exactly one of: school/health/community/water/business.
7. Photos: accept batches. After receiving photos, tell user what you received and what's still missing.
8. When all 7 text fields collected AND 9 photos received AND location confirmed: set ready=true and say you're launching analysis.
9. TEST mode: if user sends "TEST", fill missing fields with defaults and set ready=true.
10. Never mention "JSON" or internal field names to the user.

PHOTO GUIDANCE (ask in this order if missing):
1. Inverter full view  2. Inverter brand label  3. Inverter screen
4. Batteries full view  5. Battery label  6. Battery terminals
7. Electrical panel  8. Solar panels full view  9. Panel close-up

RESPOND ONLY with valid JSON (no markdown):
{
  "reply": "your WhatsApp message to the user",
  "updates": {
    "village": null,
    "country_name": null,
    "country_code": null,
    "site_type": null,
    "people_count": null,
    "offline_duration": null,
    "symptom": null,
    "recent_event": null,
    "contact": null,
    "location_confirmed": null
  },
  "ready": false
}
Only include fields in "updates" that changed. Null fields are ignored.`;

  const userContent = userMessage || (newPhotosCount > 0 ? `[sent ${newPhotosCount} photo(s)]` : '[no message]');

  try {
    const res = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });
    const raw = res.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch(e) {
    console.error('Haiku error:', e.message);
    return { reply: lang === 'en'
      ? "Sorry, I had a technical issue. Could you repeat that?"
      : "Désolé, j'ai eu un problème technique. Pouvez-vous répéter ?",
      updates: {}, ready: false };
  }
}

// ── GENERATE DIAGNOSTIC (Claude Opus) ────────────────────────────────────────
async function generateDiagnostic(state, lang) {
  const imageBlocks = [];
  for (const p of (state.photos || [])) {
    if (p.base64 && p.mimeType) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const safeMime = allowedTypes.includes(p.mimeType) ? p.mimeType : 'image/jpeg';
      imageBlocks.push({ type: 'text', text: `Photo type: ${p.type} | Pre-analysis: ${p.analysis?.observations || 'none'}` });
      imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: safeMime, data: p.base64 } });
    } else if (p.analysis?.observations) {
      imageBlocks.push({ type: 'text', text: `[${p.type}] ${p.analysis.observations}` });
    }
  }

  const langName = { fr:'French', en:'English', wo:'Wolof', bm:'Bambara', sw:'Swahili', ha:'Hausa', yo:'Yoruba', fon:'Fon', dyu:'Dioula' }[lang] || 'French';

  const cityData = await findNearestCity(state.lat, state.lng);
  const nearestCity    = cityData?.name || 'nearest major city';
  const distanceKm     = cityData?.distance_km ?? 100;
  const roadDistanceKm = distanceKm * 2;
  const travelCost     = parseFloat((roadDistanceKm * 2 * 0.30).toFixed(2));

  const costContextBlock = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COST ESTIMATION CONTEXT:
  Labour rate:       €5.00 per hour
  Easy Kit IoT:      €100.00 — add to EVERY repair
  Nearest city:      ${nearestCity}
  Distance (road estimate): ${distanceKm} km x 2 (road factor) = ${roadDistanceKm} km
  Travel (2 trips):  ${roadDistanceKm} km x 2 x €0.30/km = €${travelCost}
  Community time:    3h fixed (presentation, training, handover)

Formula:
  total_cost_est = sum(parts_needed[].est_cost_eur x qty) + ((labor_hours + 3) x 5) + ${travelCost} + 100

Estimate labor_hours for TECHNICAL work only (community 3h added automatically):
  Config fix: 0.5h | Single swap: 1-2h | Multi-component: 3-5h | Full bank: 4-6h | Wiring: 6-8h
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const faultBibleBlock = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SSA FAULT BIBLE v1.0 — 50 most common off-grid faults
Return fault_primary, fault_secondary, fault_tertiary using these IDs when possible.

### INV — Inverter faults
INV-01|BUS voltage high|urgency:4|cause:PV over-voltage morning surge|action:Check PV Voc vs inverter max; replace MOSFET if blown
INV-02|BUS voltage low/no DC|urgency:3|cause:Battery discharged, blown fuse, corroded lug|action:Measure battery V, inspect DC fuse and lugs
INV-03|AC output over-voltage|urgency:4|cause:Faulty transformer tap, overloaded neutral|action:Measure AC output; adjust tap or replace filter
INV-04|AC output under-voltage|urgency:3|cause:Battery SOC low, overloaded circuit|action:Reduce load, check lug tightness, verify battery health
INV-05|Overload/output short|urgency:5|cause:Load exceeds rated VA, shorted AC wire|action:Disconnect loads one by one; inspect AC wiring
INV-06|Inverter overtemperature|urgency:4|cause:Blocked vent, failed fan, ambient>45C|action:Clean vents, replace fan, add ventilation
INV-07|Ground fault/isolation|urgency:5|cause:Degraded PV cable insulation, water ingress|action:Disconnect strings, megger test, inspect junction boxes
INV-08|MPPT fault/PV input error|urgency:3|cause:Faulty MPPT board, reverse polarity|action:Check polarity and Voc; replace MPPT if needed
INV-09|Communication/display failure|urgency:2|cause:Failed display PCB, firmware crash|action:Power-cycle; check ribbon cable; reflash firmware
INV-10|Charger not switching to grid|urgency:2|cause:ATS relay failed, wrong priority setting|action:Check ATS relay, verify AC input breaker

### BAT — Battery faults
BAT-01|Deep discharge/0V cell|urgency:5|cause:Extended outage, system unattended months|action:Slow-charge 0.1C for 4h; measure cells; replace if needed
BAT-02|Sulfation|urgency:3|cause:Chronic partial SOC, electrolyte loss|action:Equalization 2.35V/cell 2h; distilled water top-up
BAT-03|Over-voltage/gassing|urgency:4|cause:Charge voltage too high, failed regulator|action:Reduce charge voltage immediately; ventilate
BAT-04|Cell imbalance LiFePO4|urgency:4|cause:Manufacturing variance, failed balancer|action:Top-balance at 3.65V; replace balancer or weak cell
BAT-05|BMS communication lost|urgency:3|cause:Broken CANbus cable, firmware crash|action:Check cable continuity; verify protocol setting; power-cycle
BAT-06|Terminal corrosion|urgency:3|cause:Moisture, poor crimp, dissimilar metals|action:Clean with baking soda; re-crimp lugs; apply terminal grease
BAT-07|Capacity degradation>50%|urgency:3|cause:Age + chronic partial discharge|action:Full capacity test; replace if <60% rated
BAT-08|Wrong battery type setting|urgency:2|cause:AGM profile on flooded battery|action:Correct battery type in inverter menu

### PV — PV array faults
PV-01|String open-circuit|urgency:3|cause:MC4 UV degradation, rodent damage|action:Inspect cable run; replace MC4 connectors
PV-02|Panel hotspot/shading|urgency:2|cause:Partial shading, cell crack, failed bypass diode|action:Clean; trim vegetation; check bypass diode
PV-03|String reverse polarity|urgency:4|cause:Installation error|action:Disconnect; measure polarity; swap MC4
PV-04|Junction box water ingress|urgency:3|cause:Broken IP seal|action:Dry; treat with corrosion inhibitor; reseal
PV-05|Panel soiling/dust|urgency:1|cause:Dry season accumulation|action:Clean with soft brush and water
PV-06|String Voc exceeds inverter max|urgency:5|cause:Too many panels in series|action:Disconnect PV; remove panel per string; replace MPPT
PV-07|Broken panel glass|urgency:2|cause:Hail, falling branch, vandalism|action:Monitor if no moisture; replace if delamination

### WIR — Wiring faults
WIR-01|Undersized DC cable|urgency:3|cause:Wrong gauge installed|action:Measure voltage drop under load; replace cable
WIR-02|Corroded DC busbar|urgency:4|cause:Moisture + copper oxidation|action:Sand; anti-oxidant paste; re-torque connections
WIR-03|Blown DC fuse|urgency:3|cause:Overload, short circuit, age|action:Fix overcurrent cause first; replace fuse
WIR-04|Neutral/earth fault AC|urgency:5|cause:Incorrect installation|action:Full AC wiring audit; correct N-PE bridge
WIR-05|Loose AC output terminal|urgency:4|cause:Vibration, thermal cycling|action:Power off; tighten all AC terminals to spec
WIR-06|Wrong breaker sizing|urgency:3|cause:Load grew after install|action:Audit load currents; upsize breakers
WIR-07|PV earthing missing|urgency:3|cause:Installation skip|action:Install earth wire from frames to ground rod

### ENV — Environment faults
ENV-01|Inverter outdoors exposed|urgency:4|cause:No weatherproof cabinet|action:Relocate; dry PCB; apply conformal coating
ENV-02|Batteries unventilated|urgency:5|cause:Design oversight|action:IMMEDIATE: ventilate. Install 2 vent openings
ENV-03|Panels wrong angle|urgency:2|cause:Flat mounting|action:Adjust to latitude angle; clean
ENV-04|Room ambient>45C|urgency:3|cause:Equipment in hot room|action:Insulated ceiling; white roof; exhaust fan
ENV-05|Panels shaded|urgency:2|cause:Tree growth, building extension|action:Trim vegetation; reconfigure layout
ENV-06|Rodent cable damage|urgency:4|cause:No conduit protection|action:Replace cables; install armored conduit
ENV-07|Theft of cables/panels|urgency:5|cause:Unprotected site|action:Replace; install anti-theft clamps

### SYS — Configuration faults
SYS-01|Wrong output voltage|urgency:3|cause:Factory default not adjusted|action:Set 230V in inverter menu
SYS-02|Wrong output frequency|urgency:3|cause:Factory 60Hz in 50Hz country|action:Set 50Hz in inverter menu
SYS-03|Low battery cutoff too low|urgency:3|cause:Default not adjusted|action:Set LVC 11.5V (12V) or 23V (24V)
SYS-04|Charger current too high|urgency:4|cause:Default 60A regardless of bank|action:Set max charge 0.1-0.2C of Ah rating
SYS-05|Wrong priority mode|urgency:2|cause:Default grid-first|action:Switch to Solar-first/SBU mode
SYS-06|No equalization schedule|urgency:2|cause:Never activated|action:Enable monthly; Veq 2.4V/cell
SYS-07|Generator start misconfigured|urgency:2|cause:Default not site-specific|action:health=50%SOC; school=30%; residential=20%
SYS-08|MPPT mismatch with array|urgency:2|cause:Panels added without upgrading inverter|action:Add second MPPT; verify Isc < max current
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const res = await ai.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    system: `You are an expert solar diagnostic AI for Lumoki. Analyze the photos and data to produce a structured JSON diagnostic report. Respond ONLY with valid JSON.`,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: `
COMMON BATTERY FAILURE SIGNATURES (60% of cases in SSA):
- Sulfated lead-acid: white crust on terminals, low SG, rapid discharge
- Deep discharge: voltage <10.5V (12V system) or <21V (24V system)
- Cell failure: one cell reads 0V or <1V when others normal

${faultBibleBlock}

${costContextBlock}

SITE REPORT:
- Location: ${state.village || state.location}, ${state.country_name || ''}
- GPS: ${state.lat ? `${state.lat}, ${state.lng}` : 'not available'}
- Site type: ${state.site_type}
- People served: ${state.people_count}
- Offline since: ${state.offline_duration}
- Symptom: ${state.symptom}
- Recent event: ${state.recent_event}
- Reporter: ${state.contact}

Return ONLY this JSON structure (no markdown):
{
  "inverter_brand":"","inverter_model":"","inverter_error_code":"",
  "kva_estimated":0,"battery_brand":"","battery_tech":"","battery_count":0,
  "battery_ah":0,"battery_voltage":0,"kwh_estimated":0,
  "panel_count":0,"kwp_estimated":0,
  "fault_primary":"","fault_secondary":"","fault_tertiary":"",
  "urgency":3,"confidence":85,
  "parts_needed":[{"name":"","qty":1,"est_cost_eur":0}],
  "labor_hours":0,"total_cost_est":0,"days_offline":0,
  "ai_report":"detailed narrative in ${langName}",
  "ai_instructions":"step-by-step technician actions in ${langName}, starting with error code resolution if applicable"
}` }
      ]
    }]
  });

  const diag = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());

  // Server-side cost calculation — single source of truth
  const laborH      = parseFloat(diag.labor_hours) || 0;
  const communityH  = 3;
  const totalLaborH = laborH + communityH;
  const partsCost   = (diag.parts_needed || []).reduce((s, p) => s + ((p.est_cost_eur || 0) * (p.qty || 1)), 0);
  const laborCost   = parseFloat((totalLaborH * 5).toFixed(2));
  const iotCost     = 100;
  const totalCost   = parseFloat((partsCost + laborCost + travelCost + iotCost).toFixed(2));

  diag.total_cost_est = totalCost;
  diag._cost_meta = {
    nearest_city:      nearestCity,
    distance_km:       distanceKm,
    road_distance_km:  roadDistanceKm,
    travel_cost_eur:   travelCost,
    labor_h_technical: laborH,
    labor_h_community: communityH,
    labor_h_total:     totalLaborH,
    labor_cost_eur:    laborCost,
    parts_cost_eur:    parseFloat(partsCost.toFixed(2)),
    labor_rate_eur:    5,
    iot_kit_eur:       iotCost
  };

  return diag;
}

// ── NOTIFY TEAM (email Resend) ────────────────────────────────────────────────
async function notifyTeam(siteId, diagnostic, state) {
  const urg  = ['','🟢','🟡','🟠','🔴','🚨'][diagnostic.urgency] || '⚪';
  const lieu = [state.village, state.country_name].filter(Boolean).join(', ') || state.location || 'Non renseigné';
  const siteTypeLabel = { school:'École', health:'Dispensaire/santé', community:'Maisons/familles', water:'Pompe à eau', business:'Entreprise' }[state.site_type] || state.site_type || '—';
  const m = diagnostic._cost_meta || {};

  await resend.emails.send({
    from: 'Lumoki Bot <bot@lumoki.africa>',
    to:   ['fabien.leterrier.pro@gmail.com'],
    subject: `${urg} Nouveau site — ${siteId} | ${lieu} | Urgence ${diagnostic.urgency}/5`,
    html: `<div style="font-family:Outfit,Arial,sans-serif;max-width:680px;margin:0 auto;background:#FFF9F0;border-radius:12px;overflow:hidden;">
  <div style="background:#1C1009;padding:20px 24px;display:flex;align-items:center;gap:12px;">
    <span style="color:#F59E0B;font-size:22px;font-weight:bold;">LUMOKI</span>
    <span style="color:#9A8070;font-size:13px;">Nouveau diagnostic de site</span>
  </div>
  <div style="padding:24px;">
    <h2 style="color:#1C1009;margin:0 0 4px;">${urg} ${siteId}</h2>
    <p style="color:#9A8070;margin:0 0 20px;font-size:13px;">Urgence ${diagnostic.urgency}/5 · Confiance ${diagnostic.confidence}%</p>

    <h3 style="color:#1C1009;font-size:14px;margin:0 0 8px;">📍 Site</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Lieu</td><td style="padding:5px 8px;font-weight:bold;">${lieu}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Type d'installation</td><td style="padding:5px 8px;">${siteTypeLabel}</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Familles bénéficiaires</td><td style="padding:5px 8px;">${state.people_count || '—'}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Hors service depuis</td><td style="padding:5px 8px;">${state.offline_duration || '—'}</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Symptôme principal</td><td style="padding:5px 8px;">${state.symptom || '—'}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Événement récent</td><td style="padding:5px 8px;">${state.recent_event || '—'}</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Reporter</td><td style="padding:5px 8px;">${state.contact || '—'}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">GPS</td><td style="padding:5px 8px;">${state.lat ? `${state.lat.toFixed(4)}, ${state.lng.toFixed(4)}` : '—'}</td></tr>
    </table>

    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">${urg} Diagnostic IA (${diagnostic.confidence}% confiance)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Onduleur</td><td style="padding:5px 8px;">${diagnostic.inverter_brand || '—'} ${diagnostic.inverter_model || ''} · Code erreur: ${diagnostic.inverter_error_code || '—'}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Puissance estimée</td><td style="padding:5px 8px;">${diagnostic.kva_estimated || '—'} kVA</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Batteries</td><td style="padding:5px 8px;">${diagnostic.battery_count || '—'}× ${diagnostic.battery_brand || '—'}</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Capacité batterie estimée</td><td style="padding:5px 8px;">${diagnostic.kwh_estimated || '—'} kWh</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Panneaux</td><td style="padding:5px 8px;">${diagnostic.panel_count || '—'} panneaux · ${diagnostic.kwp_estimated || '—'} kWp</td></tr>
      <tr><td style="padding:5px 8px;color:#9A8070;">Urgence</td><td style="padding:5px 8px;">${urg} ${diagnostic.urgency}/5</td></tr>
      <tr style="background:#F3F0EB;"><td style="padding:5px 8px;color:#9A8070;">Budget estimé</td><td style="padding:5px 8px;font-weight:bold;">€${diagnostic.total_cost_est}</td></tr>
    </table>

    ${(diagnostic.fault_primary || diagnostic.fault_secondary || diagnostic.fault_tertiary) ? `
    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">⚠️ Pannes probables</h3>
    <p style="font-size:13px;margin:0 0 16px;">${[diagnostic.fault_primary, diagnostic.fault_secondary, diagnostic.fault_tertiary].filter(Boolean).join(' · ')}</p>
    ` : ''}

    ${(diagnostic.parts_needed?.length > 0) ? `
    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">🔧 Pièces nécessaires</h3>
    <ul style="font-size:13px;margin:0 0 16px;padding-left:20px;">
      ${diagnostic.parts_needed.map(p => `<li>${p.qty}× ${p.name} — ~€${p.est_cost_eur}</li>`).join('')}
    </ul>
    ` : ''}

    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">📋 Rapport IA</h3>
    <p style="font-size:13px;line-height:1.6;background:#fff;padding:12px;border-radius:8px;border-left:3px solid #F59E0B;">${(diagnostic.ai_report || '').replace(/\n/g,'<br>')}</p>

    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">👷 Instructions technicien</h3>
    <p style="font-size:13px;line-height:1.6;background:#fff;padding:12px;border-radius:8px;border-left:3px solid #16A34A;">${(diagnostic.ai_instructions || '').replace(/\n/g,'<br>')}</p>

    <h3 style="color:#1C1009;font-size:14px;margin:20px 0 8px;">💰 Détail du budget estimé</h3>
    ${(() => {
      const parts = (diagnostic.parts_needed || []);
      const rows = [
        ...parts.map(p => `<tr><td style="padding:4px 8px;color:#9A8070;">Pièce — ${p.name}</td><td style="padding:4px 8px;">${p.qty}× €${p.est_cost_eur} = <b>€${((p.qty||1)*(p.est_cost_eur||0)).toFixed(2)}</b></td></tr>`),
        `<tr style="background:#f9f9f9;"><td style="padding:4px 8px;color:#9A8070;">Main d'œuvre technique</td><td style="padding:4px 8px;">${m.labor_h_technical||0}h × €5/h</td></tr>`,
        `<tr><td style="padding:4px 8px;color:#9A8070;">Présentation / formation communauté</td><td style="padding:4px 8px;">3h fixes × €5/h</td></tr>`,
        `<tr style="background:#f9f9f9;"><td style="padding:4px 8px;color:#9A8070;">Total main d'œuvre</td><td style="padding:4px 8px;">${m.labor_h_total||0}h × €5/h = <b>€${m.labor_cost_eur||0}</b></td></tr>`,
        `<tr><td style="padding:4px 8px;color:#9A8070;">Déplacement (2 visites)</td><td style="padding:4px 8px;">${m.distance_km||'?'} km vol d'oiseau × 2 (route) × 2 A/R × €0.30/km (depuis ${m.nearest_city||'?'}) = <b>€${m.travel_cost_eur||0}</b></td></tr>`,
        `<tr style="background:#f9f9f9;"><td style="padding:4px 8px;color:#9A8070;">Kit IoT Easy</td><td style="padding:4px 8px;">Systématique = <b>€${m.iot_kit_eur||100}</b></td></tr>`,
        `<tr style="border-top:2px solid #F59E0B;"><td style="padding:6px 8px;font-weight:bold;">TOTAL ESTIMÉ</td><td style="padding:6px 8px;font-weight:bold;font-size:15px;color:#F59E0B;">€${diagnostic.total_cost_est}</td></tr>`,
      ].join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">${rows}</table>`;
    })()}

    <div style="text-align:center;margin-top:16px;">
      <a href="https://lumoki.africa/sites.html" style="background:#F59E0B;color:#1C1009;padding:10px 24px;border-radius:100px;text-decoration:none;font-weight:bold;font-size:13px;">Voir sur le dashboard →</a>
    </div>
  </div>
</div>`
  });
}

// ── FINALIZE SITE (Supabase insert) ──────────────────────────────────────────
async function finalizeSite(conv, state, diag, lang) {
  const { count } = await db.from('sites').select('*', { count: 'exact', head: true });
  const year        = new Date().getFullYear();
  const countryCode = state.country_code || 'AFR';
  const siteId      = `${countryCode}-${year}-${String((count || 0) + 1).padStart(3, '0')}`;
  const country     = state.country_name || state.village || 'Unknown';
  const category    = state.site_type || 'community';

  const { error: siteErr } = await db.from('sites').insert({
    id: siteId,
    name: `${state.village || state.location || 'Unknown'} — Solar Site`,
    lat: state.lat || 0, lng: state.lng || 0,
    status: 'offline', category,
    kwp: diag.kwp_estimated || 0,
    kwh: diag.kwh_estimated || 0,
    kva: diag.kva_estimated || 0,
    country, region: 'west',
    people: parseInt(state.people_count) || 0,
    photo_url:        state.photos?.find(p => p.type === 'inverter_far')?.url || null,
    photo_panels_url: state.photos?.find(p => p.type === 'panels_far')?.url || null,
    fault:            diag.fault_primary || 'À diagnostiquer',
    sourced_at:       new Date().toISOString().split('T')[0],
    budget:           diag.total_cost_est || null,
    workflow_status:  'received',
    kwhconso_total:   0,
    kwhconso_last24h: 0
  });
  if (siteErr) console.error('⚠️ Site insert error:', siteErr.message);
  else console.log('✅ Site created:', siteId);

  await db.from('diagnostics').insert({
    site_id:              siteId,
    reporter_phone:       state.contact || null,
    lang,
    location_text:        [state.village, state.country_name].filter(Boolean).join(', ') || null,
    symptom:              state.symptom || null,
    recent_event:         state.recent_event || null,
    outage_duration:      state.offline_duration || null,
    photo_urls:           (state.photos || []).map(p => p.url),
    inverter_brand:       diag.inverter_brand || null,
    inverter_model:       diag.inverter_model || null,
    inverter_error_code:  diag.inverter_error_code || null,
    kva_estimated:        diag.kva_estimated || null,
    battery_brand:        diag.battery_brand || null,
    battery_count:        diag.battery_count || null,
    battery_ah:           diag.battery_ah || null,
    battery_voltage:      diag.battery_voltage || null,
    battery_tech:         diag.battery_tech || null,
    kwh_estimated:        diag.kwh_estimated || null,
    panel_count:          diag.panel_count || null,
    kwp_estimated:        diag.kwp_estimated || null,
    fault_primary:        diag.fault_primary || null,
    fault_secondary:      diag.fault_secondary || null,
    fault_tertiary:       diag.fault_tertiary || null,
    urgency:              diag.urgency || null,
    confidence:           diag.confidence || null,
    parts_needed:         diag.parts_needed || null,
    labor_hours:          diag.labor_hours || null,
    total_cost_est:       diag.total_cost_est || null,
    nearest_city:         diag._cost_meta?.nearest_city || null,
    distance_km:          diag._cost_meta?.distance_km || null,
    ai_report:            diag.ai_report || null,
    ai_instructions:      diag.ai_instructions || null,
    raw_session:          state
  }).then(({error: e}) => e && console.error('⚠️ Diag insert error:', e.message));

  return siteId;
}

// ── MAIN WEBHOOK ──────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.set('Content-Type', 'text/xml').send('<Response/>');

  const phone    = req.body.From?.replace('whatsapp:', '') || '';
  const body     = (req.body.Body || '').trim();
  const isSkip   = body.toUpperCase() === 'SKIP';
  const isTest   = body.toUpperCase() === 'TEST';

  // Collect all media URLs (Twilio supports up to 10 per message)
  const mediaUrls = [];
  for (let i = 0; i <= 9; i++) {
    const u = req.body[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
  }

  console.log(`📩 Incoming | phone: ${phone} | body: "${body.substring(0,30)}" | media: ${mediaUrls.length}`);
  if (!phone) return;

  try {
    // Load or create conversation
    let { data: convData, error: convErr } = await db.from('conversations')
      .select('*').eq('phone', phone).eq('status', 'in_progress').single();
    let conv = convData;

    console.log(`🔍 Conv: ${conv ? `id=${conv.id}` : 'none'} | err: ${convErr?.code || 'ok'}`);

    if (!conv) {
      const lang = await detectLanguage(body);
      const { data: nc, error: insertErr } = await db.from('conversations')
        .insert({ phone, language: lang, step: 1, state: {} }).select().single();
      console.log(`➕ New conv id=${nc?.id} | err: ${insertErr?.message || 'ok'}`);
      if (!nc) return;

      // Send logo first (if available), then welcome message
      if (LUMOKI_LOGO_URL) await send(phone, '', LUMOKI_LOGO_URL);
      await send(phone, lang === 'en'
        ? `🌞 *Welcome to Lumoki*\n_Resurrecting solar across Sub-Saharan Africa_\n\nI'm your reporting assistant. In about 10 minutes, your report will help send a technician to bring this site back to life — *free of charge* for the community.\n\nLet's start! 📍 Share your *GPS location* (button 📎 → Location)\nOr type *SKIP* to continue without GPS.`
        : `🌞 *Bienvenue sur Lumoki*\n_Ressusciter le solaire en Afrique subsaharienne_\n\nJe suis votre assistant de signalement. En 10 minutes, votre rapport permettra d'envoyer un technicien et de remettre ce site en service — *gratuitement* pour la communauté.\n\nCommençons ! 📍 Partagez votre *position GPS* (bouton 📎 → Lieu)\nOu tapez *SKIP* pour continuer sans GPS.`
      );
      return;
    }

    const lang  = conv.language || 'fr';
    const state = { ...conv.state };

    // ── GPS HANDLING ─────────────────────────────────────────────────────────
    let hasGps = false;
    const rawLat = req.body.Latitude;
    const rawLng = req.body.Longitude;
    if (rawLat && rawLng) {
      state.lat = parseFloat(rawLat);
      state.lng = parseFloat(rawLng);
      console.log(`📍 GPS saved: ${state.lat}, ${state.lng}`);
      hasGps = true;
      // Auto reverse geocode — updates state if successful
      const geo = await reverseGeocode(state.lat, state.lng);
      if (geo) {
        if (geo.commune) state.village = geo.commune;
        if (geo.country) state.country_name = geo.country;
        if (geo.country_code) state.country_code = geo.country_code;
        state.location_confirmed = false; // Haiku will ask for confirmation
      }
    }

    // ── PHOTO HANDLING (batch) ────────────────────────────────────────────────
    const newPhotos = [];
    if (mediaUrls.length > 0) {
      const existingCount = (state.photos || []).length;
      for (let i = 0; i < mediaUrls.length; i++) {
        // Auto-assign photo type based on what's still missing
        const missing = REQUIRED_PHOTOS.filter(r => !(state.photos || []).find(p => p.type === r.type));
        const photoType = missing[i]?.type || `extra_${Date.now()}_${i}`;
        const result = await uploadPhoto(mediaUrls[i], conv.id, photoType);
        if (result) {
          // Quick Haiku vision analysis
          try {
            const slot = REQUIRED_PHOTOS.find(r => r.type === photoType);
            const context = slot ? slot.label_en : 'additional solar installation photo';
            const analysisRes = await ai.messages.create({
              model: 'claude-haiku-4-5-20251001', max_tokens: 300,
              messages: [{ role: 'user', content: [
                { type: 'image', source: { type: 'url', url: result.url } },
                { type: 'text', text: `Solar photo context: "${context}". Extract: brand, model, numbers, damage, error codes. JSON only: {"observations":"","extracted_data":{},"anomalies":[],"confidence":0}` }
              ]}]
            });
            const analysis = JSON.parse(analysisRes.content[0].text.replace(/```json|```/g,'').trim());
            result.analysis = analysis;
          } catch(e) { result.analysis = { observations: 'uploaded', confidence: 0 }; }

          result.type = photoType;
          newPhotos.push(result);
          state.photos = [...(state.photos || []), result];
        }
      }
      console.log(`📸 ${newPhotos.length} photo(s) processed, total: ${state.photos.length}`);
    }

    // ── TEST MODE ─────────────────────────────────────────────────────────────
    if (isTest) {
      state.village       = state.village       || 'Test Village';
      state.country_name  = state.country_name  || 'Bénin';
      state.country_code  = state.country_code  || 'BEN';
      state.site_type     = state.site_type     || 'school';
      state.people_count  = state.people_count  || '50';
      state.offline_duration = state.offline_duration || 'environ 2 mois';
      state.symptom       = state.symptom       || 'Rien ne s\'allume';
      state.recent_event  = state.recent_event  || 'Rien de particulier';
      state.contact       = state.contact       || 'Test User +0000000000';
      state.location_confirmed = true;
    }

    // ── CHECK IF READY ────────────────────────────────────────────────────────
    const textFieldsComplete = state.village && state.country_name && state.site_type &&
      state.people_count && state.offline_duration && state.symptom &&
      state.recent_event && state.contact && state.location_confirmed;
    const photosComplete = (state.photos || []).length >= 9;
    const alreadyReady   = textFieldsComplete && (photosComplete || isTest);

    let haikuResult = null;

    if (!alreadyReady) {
      // Run Haiku to collect missing info
      haikuResult = await runHaiku(state, body, lang, newPhotos, hasGps, state.lat, state.lng);

      // Apply updates from Haiku
      if (haikuResult.updates) {
        for (const [k, v] of Object.entries(haikuResult.updates)) {
          if (v !== null && v !== undefined) {
            if (k === 'site_type') state[k] = mapSiteType(v) || v;
            else state[k] = v;
          }
        }
      }

      // Send Haiku reply
      if (haikuResult.reply) await send(phone, haikuResult.reply);

      // Save state
      await db.from('conversations').update({ state, step: 2 }).eq('id', conv.id);

      // Check if now ready after Haiku updates
      const nowReady = haikuResult.ready || (
        state.village && state.country_name && state.site_type &&
        state.people_count && state.offline_duration && state.symptom &&
        state.recent_event && state.contact && state.location_confirmed &&
        (state.photos || []).length >= 9
      );

      if (!nowReady) return;
    }

    // ── LAUNCH DIAGNOSTIC ─────────────────────────────────────────────────────
    const analyzeMsg = lang === 'en'
      ? `✅ All information collected! 🙏\nLaunching AI analysis... ⏳\n\nYou'll receive a confirmation in a few minutes.`
      : `✅ Toutes les informations sont collectées ! 🙏\nLancement de l'analyse IA... ⏳\n\nVous recevrez une confirmation dans quelques minutes.`;
    await send(phone, analyzeMsg);

    await db.from('conversations').update({ state, step: 19, status: 'complete' }).eq('id', conv.id);

    let diag = {};
    try {
      diag = await generateDiagnostic(state, lang);
      console.log('✅ Diagnostic generated, urgency:', diag.urgency);
    } catch(diagErr) {
      console.error('⚠️ Diagnostic failed:', diagErr.message);
      diag = {
        fault_primary: 'Diagnostic IA indisponible — analyse manuelle requise',
        fault_secondary: '', urgency: 3, confidence: 0,
        kwp_estimated: 0, kwh_estimated: 0, kva_estimated: 0,
        battery_count: 0, battery_brand: '', inverter_brand: '', inverter_model: '',
        inverter_error_code: '', parts_needed: [], labor_hours: 0,
        total_cost_est: 0,
        ai_report: 'Analyse automatique échouée.',
        ai_instructions: 'Contacter le reporter directement.'
      };
    }

    const siteId = await finalizeSite(conv, state, diag, lang);

    try { await notifyTeam(siteId, diag, state); console.log('✅ Email sent for', siteId); }
    catch(e) { console.error('⚠️ Email error:', e.message); }

    // Confirmation message to reporter
    const doneMsg = lang === 'en'
      ? `✅ *Report registered!*\n\nReference: *${siteId}*\n\nOur technical team has received your report and photos. A technician will contact you within 48 hours.\n\nQuestions? Contact us: *info@lumoki.africa*\n\nThank you for helping your community! 🌞 lumoki.africa`
      : `✅ *Signalement enregistré !*\n\nRéférence : *${siteId}*\n\nNotre équipe technique a reçu votre rapport et les photos. Un technicien vous contactera dans les 48h.\n\nUne question ? Écrivez-nous : *info@lumoki.africa*\n\nMerci d'aider votre communauté ! 🌞 lumoki.africa`;
    await send(phone, doneMsg);

  } catch(err) {
    console.error('⚠️ Webhook error:', err);
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Lumoki Bot v2 — online'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Lumoki Bot v2 running on port ${PORT}`));
