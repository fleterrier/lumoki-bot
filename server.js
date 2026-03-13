// ─────────────────────────────────────────────────────────────────────────────
// LUMOKI BOT — WhatsApp Diagnostic Webhook
// Stack: Twilio WhatsApp + Claude Vision + Supabase + Resend
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import twilio from 'twilio';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── CLIENTS ───────────────────────────────────────────────────────────────────
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const claude       = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const resend       = new Resend(process.env.RESEND_KEY);

// ── IN-MEMORY SESSION STORE ───────────────────────────────────────────────────
// En production: remplacer par Redis ou table Supabase sessions
const sessions = new Map();

// ── FLOW STEPS ────────────────────────────────────────────────────────────────
const STEPS = [
  'detect_lang',       // 0 - détection langue + accueil
  'location',          // 1 - pays + village
  'people_count',      // 2 - nb bénéficiaires
  'site_type',         // 3 - type installation
  'outage_duration',   // 4 - depuis quand
  'symptom',           // 5 - symptôme principal
  'recent_event',      // 6 - événement récent
  'photo_inverter_far',    // 7 - photo onduleur loin
  'photo_inverter_label',  // 8 - photo plaque onduleur
  'photo_inverter_screen', // 9 - photo écran onduleur
  'photo_inverter_cables', // 10 - photo câbles onduleur
  'photo_battery_far',     // 11 - photo batteries loin
  'photo_battery_label',   // 12 - photo plaque batterie
  'photo_battery_terminals',// 13 - photo bornes batteries
  'photo_panels_far',      // 14 - photo panneaux loin
  'photo_panels_close',    // 15 - photo panneaux proche (si anomalie)
  'photo_switchboard',     // 16 - photo tableau distribution
  'contact',           // 17 - nom + contact reporter
  'analyzing',         // 18 - analyse Claude en cours
  'done'               // 19 - terminé
];

// ── QUESTIONS PAR LANGUE ──────────────────────────────────────────────────────
function getQuestions(lang) {
  const q = {
    fr: {
      welcome: `Bonjour ! Je suis l'assistant Lumoki 🌞\nJe vais vous aider à diagnostiquer votre installation solaire.\nCela prend environ 10 minutes.\n\nDans quel *pays* et *village* se trouve l'installation ?`,
      people_count: `Combien de personnes ou de familles utilisent cette installation ? (donnez un chiffre approximatif)`,
      site_type: `Quel type d'installation ?\nRépondez par un chiffre :\n1 - Électricité pour des maisons/familles\n2 - École\n3 - Dispensaire / centre de santé\n4 - Pompe à eau\n5 - Autre`,
      outage_duration: `Depuis combien de temps l'installation ne fonctionne plus ?\n1 - Moins d'une semaine\n2 - 1 à 4 semaines\n3 - 1 à 6 mois\n4 - Plus de 6 mois`,
      symptom: `Que se passe-t-il exactement ?\n1 - Rien ne s'allume du tout\n2 - Ça marche le jour mais pas la nuit\n3 - Ça s'allume mais coupe souvent\n4 - Charge très lente, batteries vides vite\n5 - Odeur ou chaleur bizarre\n6 - La boîte principale affiche une erreur\n7 - Autre (décrivez)`,
      recent_event: `S'est-il passé quelque chose récemment ?\n1 - Orage ou foudre\n2 - Inondation\n3 - Quelqu'un a touché ou modifié l'installation\n4 - Surcharge (trop d'appareils branchés)\n5 - Rien de particulier`,
      photo_inverter_far: `Parfait, merci ! 📸\nMaintenant les photos.\n\nEnvoyez d'abord une *photo de loin* de la boîte principale (onduleur) — on doit voir toute la boîte.`,
      photo_inverter_label: `Merci ! Maintenant une *photo plus proche* de l'étiquette sur la boîte — celle avec la marque et les chiffres techniques.`,
      photo_inverter_screen: `Maintenant une photo de *l'écran ou des voyants* de la boîte (même si rien ne s'affiche, envoyez la photo).`,
      photo_inverter_cables: `Dernière photo de la boîte : les *câbles qui entrent et sortent* de la boîte principale.`,
      photo_battery_far: `Maintenant les batteries 🔋\nEnvoyez une *photo de loin* pour qu'on voie *toutes* les batteries ensemble.`,
      photo_battery_label: `Merci ! Maintenant une photo *proche de l'étiquette* sur une batterie (la plaque avec les chiffres).`,
      photo_battery_terminals: `Dernière photo batteries : les *bornes et câbles* de connexion des batteries.`,
      photo_panels_far: `Maintenant les panneaux solaires ☀️\nEnvoyez une *photo de loin* — on doit voir tous les panneaux sur le toit.`,
      photo_panels_close: `Y a-t-il des panneaux qui semblent abîmés, sales ou cassés ?\n1 - Oui (envoyez une photo proche)\n2 - Non (tapez 2 pour continuer)`,
      photo_switchboard: `Dernière photo 📋\nEnvoyez une photo du *tableau électrique* ou des *fusibles/disjoncteurs* si vous pouvez y accéder.`,
      contact: `Presque terminé ! 👍\nQuel est votre *nom* et votre *numéro de téléphone* pour qu'on puisse vous recontacter ?`,
      analyzing: `✅ Merci pour toutes ces informations !\n\n🔍 Notre système analyse maintenant les photos et vos réponses...\n\nVous recevrez un message dans quelques instants avec le diagnostic.`,
      done_prefix: `📊 *Diagnostic Lumoki*\n\n`,
      done_suffix: `\n\n_L'équipe Lumoki vous contactera sous 48h._\n\nMerci d'avoir signalé cette panne ! 🌞`,
      photo_skip: `(Si vous ne pouvez pas prendre cette photo, tapez *SKIP*)`,
      invalid: `Je n'ai pas compris. Pouvez-vous répondre avec le numéro correspondant à votre situation ?`
    },
    en: {
      welcome: `Hello! I'm the Lumoki assistant 🌞\nI'll help you diagnose your solar installation.\nThis takes about 10 minutes.\n\nIn which *country* and *village* is the installation located?`,
      people_count: `How many people or families use this installation? (give an approximate number)`,
      site_type: `What type of installation?\nReply with a number:\n1 - Electricity for homes/families\n2 - School\n3 - Health clinic\n4 - Water pump\n5 - Other`,
      outage_duration: `How long has the installation not been working?\n1 - Less than a week\n2 - 1 to 4 weeks\n3 - 1 to 6 months\n4 - More than 6 months`,
      symptom: `What exactly is happening?\n1 - Nothing turns on at all\n2 - Works during the day but not at night\n3 - Turns on but cuts off often\n4 - Very slow charging, batteries empty quickly\n5 - Strange smell or heat\n6 - Main box shows an error\n7 - Other (describe)`,
      recent_event: `Did anything happen recently?\n1 - Storm or lightning\n2 - Flooding\n3 - Someone touched or modified the installation\n4 - Overload (too many appliances connected)\n5 - Nothing in particular`,
      photo_inverter_far: `Great, thank you! 📸\nNow for the photos.\n\nFirst, send a *photo from far away* of the main box (inverter) — we need to see the whole box.`,
      photo_inverter_label: `Thanks! Now a *closer photo* of the label on the box — the one with the brand name and technical numbers.`,
      photo_inverter_screen: `Now a photo of the *screen or indicators* on the box (even if nothing is displayed, please send the photo).`,
      photo_inverter_cables: `Last photo of the box: the *cables going in and out* of the main box.`,
      photo_battery_far: `Now the batteries 🔋\nSend a *photo from far away* so we can see *all* the batteries together.`,
      photo_battery_label: `Thanks! Now a *close photo of the label* on one battery (the plate with numbers).`,
      photo_battery_terminals: `Last battery photo: the *terminals and connection cables* of the batteries.`,
      photo_panels_far: `Now the solar panels ☀️\nSend a *photo from far away* — we need to see all the panels on the roof.`,
      photo_panels_close: `Are there any panels that look damaged, dirty or broken?\n1 - Yes (send a close photo)\n2 - No (type 2 to continue)`,
      photo_switchboard: `Last photo 📋\nSend a photo of the *electrical switchboard* or *fuses/circuit breakers* if you can access them.`,
      contact: `Almost done! 👍\nWhat is your *name* and *phone number* so we can contact you back?`,
      analyzing: `✅ Thank you for all this information!\n\n🔍 Our system is now analyzing the photos and your answers...\n\nYou will receive a message shortly with the diagnosis.`,
      done_prefix: `📊 *Lumoki Diagnosis*\n\n`,
      done_suffix: `\n\n_The Lumoki team will contact you within 48 hours._\n\nThank you for reporting this outage! 🌞`,
      photo_skip: `(If you cannot take this photo, type *SKIP*)`,
      invalid: `I didn't understand. Can you reply with the number that matches your situation?`
    }
  };
  return q[lang] || q.fr;
}

// ── DETECT LANGUAGE ───────────────────────────────────────────────────────────
async function detectLanguage(text) {
  try {
    const response = await claude.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Detect the language of this text and respond with ONLY one of these codes: fr, en, wo (Wolof), bm (Bambara), fon (Fon), sw (Swahili), ha (Hausa), yo (Yoruba). Text: "${text}"`
      }]
    });
    const lang = response.content[0].text.trim().toLowerCase();
    // Map local languages to closest bot language for now
    // TODO: add full local language support
    const langMap = { wo: 'fr', bm: 'fr', fon: 'fr', sw: 'en', ha: 'en', yo: 'en' };
    return langMap[lang] || (lang === 'fr' ? 'fr' : 'en');
  } catch(e) {
    return 'fr'; // default
  }
}

// ── SEND WHATSAPP MESSAGE ─────────────────────────────────────────────────────
async function sendMessage(to, body) {
  await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${to}`,
    body
  });
}

// ── DOWNLOAD & ENCODE PHOTO FOR CLAUDE ───────────────────────────────────────
async function fetchPhotoBase64(mediaUrl) {
  const response = await fetch(mediaUrl, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`
      ).toString('base64')
    }
  });
  const buffer = await response.buffer();
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), mediaType: contentType };
}

// ── UPLOAD PHOTO TO SUPABASE STORAGE ─────────────────────────────────────────
async function uploadPhoto(mediaUrl, sessionId, photoType) {
  try {
    const { base64, mediaType } = await fetchPhotoBase64(mediaUrl);
    const ext = mediaType.includes('png') ? 'png' : 'jpg';
    const path = `${sessionId}/${photoType}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');
    
    const { data, error } = await supabase.storage
      .from('site-photos')
      .upload(path, buffer, { contentType: mediaType, upsert: true });
    
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('site-photos')
      .getPublicUrl(path);
    
    return { publicUrl, base64, mediaType };
  } catch(e) {
    console.error('Photo upload error:', e);
    return null;
  }
}

// ── CLAUDE DIAGNOSTIC ANALYSIS ────────────────────────────────────────────────
async function runDiagnostic(session) {
  const lang = session.lang || 'fr';
  
  // Build image content blocks from all collected photos
  const imageBlocks = [];
  for (const [photoType, photoData] of Object.entries(session.photos)) {
    if (photoData && photoData.base64) {
      imageBlocks.push({
        type: 'text',
        text: `Photo type: ${photoType}`
      });
      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: photoData.mediaType,
          data: photoData.base64
        }
      });
    }
  }

  const systemPrompt = `You are an expert solar installation diagnostic AI for Lumoki, an NGO that repairs failed solar assets in Sub-Saharan Africa.

Analyze the provided photos and information to produce a structured diagnostic report.

The reporter is a non-technical village contact, not an engineer. Your report will be read by Lumoki's technical team.

Always respond in ${lang === 'fr' ? 'French' : 'English'}.

Structure your response EXACTLY as follows:
---DIAGNOSTIC---
**Équipement identifié / Equipment identified:**
[List brand, model, capacity for inverter, batteries, panels if readable from photos]

**Panne probable / Probable fault (ranked):**
1. [Most likely fault - explain why based on photos/answers]
2. [Second possibility]
3. [Third possibility if relevant]

**Pièces probablement nécessaires / Parts likely needed:**
[List parts with estimated quantities]

**Urgence / Urgency:** [1-5 with explanation]
⚡ 5 = Health/water facility, immediate risk
🔴 4 = Major community impact
🟠 3 = Significant impact
🟡 2 = Moderate impact  
🟢 1 = Low urgency

**Observations visuelles / Visual observations:**
[Key findings from photos - corrosion, damage, error codes, battery count, panel condition]

**Actions recommandées / Recommended actions:**
[Specific steps for the field partner in priority order]

**Questions complémentaires / Additional questions if needed:**
[Any critical information still missing]
---END---`;

  const userContent = [
    {
      type: 'text',
      text: `Solar installation diagnostic request:

Location: ${session.location || 'Not provided'}
Beneficiaries: ${session.people_count || 'Not provided'}
Site type: ${session.site_type || 'Not provided'}
Outage duration: ${session.outage_duration || 'Not provided'}
Main symptom: ${session.symptom || 'Not provided'}
Recent event: ${session.recent_event || 'Not provided'}
Reporter: ${session.contact || 'Not provided'}

Photos provided: ${Object.keys(session.photos).join(', ')}

Please analyze all photos and provide a complete diagnostic report.`
    },
    ...imageBlocks
  ];

  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  });

  return response.content[0].text;
}

// ── SAVE TO SUPABASE ──────────────────────────────────────────────────────────
async function saveToSupabase(session, diagnostic) {
  // Generate site ID
  const { count } = await supabase
    .from('sites')
    .select('*', { count: 'exact', head: true });
  
  const siteId = `AFR-${String((count || 0) + 1).padStart(3, '0')}`;
  
  // Map site type
  const catMap = { '1': 'community', '2': 'school', '3': 'health', '4': 'water', '5': 'business' };
  const category = catMap[session.site_type] || 'community';

  // Insert site
  const { data: site, error: siteError } = await supabase.from('sites').insert({
    id: siteId,
    name: session.location || 'Unknown site',
    lat: session.lat || 0,
    lng: session.lng || 0,
    status: 'offline',
    category,
    kw: 0, // to be confirmed by technician
    country: session.country || 'Unknown',
    region: 'west', // to be updated
    people: parseInt(session.people_count) || 0,
    sourced_at: new Date().toISOString().split('T')[0],
    fault: diagnostic.substring(0, 500),
    update_date: new Date().toLocaleDateString('fr-BE', { month: 'short', year: 'numeric' }),
    update_text: `Signalé via WhatsApp par ${session.contact || 'anonyme'}`
  }).select().single();

  if (siteError) console.error('Site insert error:', siteError);

  // Insert diagnostic record
  const photoUrls = Object.fromEntries(
    Object.entries(session.photos).map(([k, v]) => [k, v?.publicUrl || null])
  );

  const { error: diagError } = await supabase.from('diagnostics').insert({
    site_id: siteId,
    reporter_phone: session.phone,
    reporter_name: session.contact,
    lang: session.lang,
    location_text: session.location,
    symptom: session.symptom,
    recent_event: session.recent_event,
    outage_duration: session.outage_duration,
    photo_urls: photoUrls,
    claude_report: diagnostic,
    raw_session: session
  });

  if (diagError) console.error('Diagnostic insert error:', diagError);

  return siteId;
}

// ── SEND EMAIL NOTIFICATION ───────────────────────────────────────────────────
async function sendEmailNotification(session, diagnostic, siteId) {
  const lang = session.lang || 'fr';
  
  await resend.emails.send({
    from: 'Lumoki Bot <bot@lumoki.africa>',
    to: process.env.TEAM_EMAIL,
    subject: `🔴 Nouveau site signalé — ${session.location || 'Localisation inconnue'} [${siteId}]`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #F59E0B; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #1C1009; margin: 0;">🌞 Lumoki — Nouveau site signalé</h1>
        </div>
        <div style="background: #FFF9F0; padding: 24px; border: 1px solid #E8DDD0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; color: #9A8070; width: 40%;">ID Site</td><td style="padding: 8px; font-weight: bold;">${siteId}</td></tr>
            <tr style="background: #fff;"><td style="padding: 8px; color: #9A8070;">Localisation</td><td style="padding: 8px;">${session.location || '—'}</td></tr>
            <tr><td style="padding: 8px; color: #9A8070;">Bénéficiaires</td><td style="padding: 8px;">${session.people_count || '—'}</td></tr>
            <tr style="background: #fff;"><td style="padding: 8px; color: #9A8070;">Symptôme</td><td style="padding: 8px;">${session.symptom || '—'}</td></tr>
            <tr><td style="padding: 8px; color: #9A8070;">Reporter</td><td style="padding: 8px;">${session.contact || '—'} — ${session.phone}</td></tr>
            <tr style="background: #fff;"><td style="padding: 8px; color: #9A8070;">Langue</td><td style="padding: 8px;">${lang.toUpperCase()}</td></tr>
          </table>
          
          <h2 style="color: #1C1009; border-bottom: 2px solid #F59E0B; padding-bottom: 8px;">Rapport de diagnostic IA</h2>
          <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #E8DDD0; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
${diagnostic}
          </div>
          
          <div style="margin-top: 20px; padding: 16px; background: #FEF3C7; border-radius: 8px; border-left: 4px solid #F59E0B;">
            <strong>Photos disponibles:</strong> ${Object.keys(session.photos).join(', ')}
          </div>
          
          <div style="margin-top: 20px; text-align: center;">
            <a href="https://lumoki.africa/sites.html" style="background: #F59E0B; color: #1C1009; padding: 12px 24px; border-radius: 100px; text-decoration: none; font-weight: bold;">
              Voir sur le dashboard →
            </a>
          </div>
        </div>
        <div style="background: #1C1009; padding: 16px; border-radius: 0 0 8px 8px; text-align: center; color: rgba(255,255,255,0.4); font-size: 12px;">
          Lumoki — Solar Resurrection · lumoki.africa
        </div>
      </div>
    `
  });
}

// ── MAIN WEBHOOK HANDLER ──────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  const from    = req.body.From?.replace('whatsapp:', '');
  const body    = req.body.Body?.trim() || '';
  const mediaUrl = req.body.MediaUrl0;
  const numMedia = parseInt(req.body.NumMedia || '0');

  if (!from) return;

  // Get or create session
  if (!sessions.has(from)) {
    sessions.set(from, {
      phone: from,
      step: 0,
      lang: 'fr',
      photos: {},
      location: null,
      country: null,
      lat: null,
      lng: null,
      people_count: null,
      site_type: null,
      outage_duration: null,
      symptom: null,
      recent_event: null,
      contact: null
    });
  }

  const session = sessions.get(from);
  const step = STEPS[session.step];
  const q = getQuestions(session.lang);

  try {

    // ── STEP 0: Detect language & welcome ────────────────────────────────────
    if (step === 'detect_lang') {
      session.lang = await detectLanguage(body);
      const qq = getQuestions(session.lang);
      session.step++;
      await sendMessage(from, qq.welcome);
      return;
    }

    // ── STEP 1: Location ─────────────────────────────────────────────────────
    if (step === 'location') {
      session.location = body;
      // Try to extract country from text
      const countries = ['sénégal','senegal','mali','burkina','guinée','guinee','côte d\'ivoire','nigeria','ghana','tanzanie','tanzania','ouganda','uganda','zambie','zambia','bénin','benin'];
      for (const c of countries) {
        if (body.toLowerCase().includes(c)) {
          session.country = c.charAt(0).toUpperCase() + c.slice(1);
          break;
        }
      }
      session.step++;
      await sendMessage(from, q.people_count);
      return;
    }

    // ── STEP 2: People count ─────────────────────────────────────────────────
    if (step === 'people_count') {
      session.people_count = body;
      session.step++;
      await sendMessage(from, q.site_type);
      return;
    }

    // ── STEP 3: Site type ────────────────────────────────────────────────────
    if (step === 'site_type') {
      session.site_type = body;
      session.step++;
      await sendMessage(from, q.outage_duration);
      return;
    }

    // ── STEP 4: Outage duration ──────────────────────────────────────────────
    if (step === 'outage_duration') {
      session.outage_duration = body;
      session.step++;
      await sendMessage(from, q.symptom);
      return;
    }

    // ── STEP 5: Symptom ──────────────────────────────────────────────────────
    if (step === 'symptom') {
      session.symptom = body;
      session.step++;
      await sendMessage(from, q.recent_event);
      return;
    }

    // ── STEP 6: Recent event ─────────────────────────────────────────────────
    if (step === 'recent_event') {
      session.recent_event = body;
      session.step++;
      await sendMessage(from, q.photo_inverter_far + '\n\n' + q.photo_skip);
      return;
    }

    // ── STEPS 7-16: Photo collection ─────────────────────────────────────────
    const photoSteps = {
      'photo_inverter_far':      { key: 'inverter_far',      next: 'photo_inverter_label',    msg: 'photo_inverter_label' },
      'photo_inverter_label':    { key: 'inverter_label',    next: 'photo_inverter_screen',   msg: 'photo_inverter_screen' },
      'photo_inverter_screen':   { key: 'inverter_screen',   next: 'photo_inverter_cables',   msg: 'photo_inverter_cables' },
      'photo_inverter_cables':   { key: 'inverter_cables',   next: 'photo_battery_far',       msg: 'photo_battery_far' },
      'photo_battery_far':       { key: 'battery_far',       next: 'photo_battery_label',     msg: 'photo_battery_label' },
      'photo_battery_label':     { key: 'battery_label',     next: 'photo_battery_terminals', msg: 'photo_battery_terminals' },
      'photo_battery_terminals': { key: 'battery_terminals', next: 'photo_panels_far',        msg: 'photo_panels_far' },
      'photo_panels_far':        { key: 'panels_far',        next: 'photo_panels_close',      msg: 'photo_panels_close' },
      'photo_panels_close':      { key: 'panels_close',      next: 'photo_switchboard',       msg: 'photo_switchboard' },
      'photo_switchboard':       { key: 'switchboard',       next: 'contact',                 msg: 'contact' }
    };

    if (photoSteps[step]) {
      const { key, next, msg } = photoSteps[step];
      
      // Handle SKIP
      if (body.toUpperCase() === 'SKIP' && numMedia === 0) {
        session.photos[key] = null;
      } else if (numMedia > 0 && mediaUrl) {
        // Upload photo and store base64 for Claude
        const photoData = await uploadPhoto(mediaUrl, from.replace('+', ''), key);
        session.photos[key] = photoData;
      } else {
        // No photo and no skip — re-ask
        await sendMessage(from, q[msg] + '\n\n' + q.photo_skip);
        return;
      }

      // Skip panels_close if user typed 2
      if (step === 'photo_panels_close' && body === '2') {
        session.photos[key] = null;
      }

      session.step = STEPS.indexOf(next);
      await sendMessage(from, q[msg] + '\n\n' + q.photo_skip);
      return;
    }

    // ── STEP 17: Contact ─────────────────────────────────────────────────────
    if (step === 'contact') {
      session.contact = body;
      session.step++;
      await sendMessage(from, q.analyzing);

      // Run diagnostic
      const diagnostic = await runDiagnostic(session);
      
      // Extract clean report
      const match = diagnostic.match(/---DIAGNOSTIC---([\s\S]*?)---END---/);
      const cleanReport = match ? match[1].trim() : diagnostic;

      // Save to Supabase
      const siteId = await saveToSupabase(session, cleanReport);

      // Send email to team
      await sendEmailNotification(session, cleanReport, siteId);

      // Send result to reporter (simplified version)
      const reporterMsg = q.done_prefix +
        (session.lang === 'fr'
          ? `Notre équipe a bien reçu votre signalement.\nRéférence : *${siteId}*\n\nNous analysons les photos et vous recontactons dans 48h.`
          : `Our team has received your report.\nReference: *${siteId}*\n\nWe are analyzing the photos and will contact you within 48 hours.`)
        + q.done_suffix;

      await sendMessage(from, reporterMsg);

      // Clear session
      sessions.delete(from);
      return;
    }

  } catch(e) {
    console.error('Webhook error:', e);
    await sendMessage(from, session.lang === 'fr'
      ? '❌ Une erreur technique est survenue. Veuillez réessayer en envoyant "restart".'
      : '❌ A technical error occurred. Please try again by sending "restart".');
  }
});

// ── RESTART COMMAND ───────────────────────────────────────────────────────────
app.post('/webhook', async (req, res, next) => {
  const from = req.body.From?.replace('whatsapp:', '');
  const body = req.body.Body?.trim().toLowerCase();
  if (body === 'restart' || body === 'recommencer') {
    sessions.delete(from);
    const q = getQuestions('fr');
    await sendMessage(from, q.welcome);
    return res.sendStatus(200);
  }
  next();
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'Lumoki Bot running 🌞', version: '1.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lumoki bot listening on port ${PORT}`));
