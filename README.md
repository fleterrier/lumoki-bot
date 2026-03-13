# Lumoki Bot — Guide de déploiement

## Stack
- **WhatsApp** via Twilio Sandbox (gratuit pour le PoC)
- **Webhook** Node.js hébergé sur Render (gratuit)
- **Diagnostic IA** Claude Vision API (~0.01€/diagnostic)
- **Base de données** Supabase (déjà en place)
- **Email** Resend (3000 emails/mois gratuit)

---

## Étape 1 — Supabase : créer la table diagnostics

1. Supabase → SQL Editor → colle le contenu de `schema_diagnostics.sql` → Run
2. Supabase → Storage → créer bucket `site-photos` → cocher **Public** → Save
3. Supabase → Settings → API → copier la **service_role key** (pas la anon key)

---

## Étape 2 — Twilio Sandbox WhatsApp

1. twilio.com → créer compte
2. Console → Messaging → Try it out → Send a WhatsApp message
3. Noter :
   - **Account SID** (commence par AC...)
   - **Auth Token**
   - **Numéro sandbox** (généralement +14155238886)
   - **Mot-clé** (ex: "join happy-tiger")
4. Partager le mot-clé avec tes testeurs : ils envoient "join happy-tiger" au numéro sandbox

---

## Étape 3 — Resend (emails)

1. resend.com → créer compte gratuit
2. API Keys → Create API Key → copier la clé
3. Domains → ajouter `lumoki.africa` si tu veux envoyer depuis bot@lumoki.africa
   (sinon utiliser le domaine par défaut resend.dev pour le PoC)

---

## Étape 4 — Render (hébergement webhook)

1. render.com → créer compte
2. New → **Web Service**
3. Connecter GitHub OU uploader le code manuellement
4. Paramètres :
   - **Name:** lumoki-bot
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free
5. Environment → Add Environment Variable → ajouter toutes les variables du `.env.example`
6. Deploy → noter l'URL (ex: `https://lumoki-bot.onrender.com`)

---

## Étape 5 — Connecter Twilio au webhook Render

1. Twilio Console → Messaging → Try it out → WhatsApp Sandbox Settings
2. **When a message comes in:** `https://lumoki-bot.onrender.com/webhook`
3. Méthode : **HTTP POST**
4. Save

---

## Étape 6 — Test

1. Depuis ton WhatsApp, envoyer le mot-clé sandbox au numéro Twilio
2. Envoyer n'importe quel message → le bot répond en détectant ta langue
3. Suivre le flow complet
4. Vérifier dans Supabase → tables `sites` et `diagnostics`
5. Vérifier l'email de notification reçu

---

## Notes importantes

- **Sessions en mémoire** : si Render redémarre (plan gratuit), les sessions en cours sont perdues.
  Pour le PoC c'est acceptable. En production → migrer vers table Supabase `sessions`.
  
- **Render free tier** : s'endort après 15 min d'inactivité → premier message peut prendre 30s.
  Solution PoC : acceptable. Production → plan payant ($7/mois) ou migrer vers Railway.

- **Photos** : stockées dans Supabase Storage bucket `site-photos`, organisées par numéro de téléphone.

- **Langue** : Claude détecte automatiquement FR, EN, Wolof, Bambara, Fon, Swahili, Hausa, Yoruba.
  Le bot répond en FR ou EN (traduction locale complète = phase 2).

---

## Migration vers production (post-PoC)

1. Twilio → WhatsApp Business API officielle (Meta) → gratuit jusqu'à 1000 conv/mois
2. Render → plan payant $7/mois (pas de sleep) ou Railway
3. Sessions → table Supabase au lieu de mémoire vive
4. Langues locales complètes (Fon, Bambara, Wolof...)
5. Géolocalisation GPS automatique depuis le message WhatsApp
