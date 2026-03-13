// ─────────────────────────────────────────────────────────────────────────────
// LUMOKI — WhatsApp Diagnostic Chatbot
// Stack: Node.js + Express + Twilio + Claude Vision + Supabase + Resend
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

// ── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  welcome: {
    fr:  "Bonjour ! 🌞 Je suis l'assistant Lumoki.\nJe vais vous aider à signaler une installation solaire en panne. Cela prend environ 10 minutes.\n\nDans quel *pays* et *village* se trouve l'installation ?",
    en:  "Hello! 🌞 I'm the Lumoki assistant.\nI'll help you report a broken solar installation. This takes about 10 minutes.\n\nIn which *country* and *village* is the installation?",
    wo:  "Salaam ! 🌞 Man mooy assistant Lumoki.\nDanga ma jënd ak installation solaire bu dëkk. Amna yënn fukki minit.\n\nFan la installation bi nekk ? *Réew* ak *dëkk* ?",
    bm:  "I ni ce ! 🌞 Ne ye Lumoki ka dɛmɛbaga ye.\nN bena i dɛmɛ solar installation minɛnin ka sɛbɛn.\n\nJamana ni dugu jumɛn na installation in be ?",
    sw:  "Habari! 🌞 Mimi ni msaidizi wa Lumoki.\nNitakusaidia kuripoti mfumo wa nishati ya jua uliovunjika. Inachukua dakika 10.\n\nMfumo uko nchi gani na kijiji gani?",
    ha:  "Sannu! 🌞 Ni ne mataimakin Lumoki.\nZan taimaka maka rahoton tsarin hasken rana da ya karye. Zai ɗauki mintoci 10.\n\nA wace ƙasa da wane ƙauye ne tsarin yake?",
    yo:  "Ẹ káàbọ̀! 🌞 Mo jẹ olùrànlọ́wọ́ Lumoki.\nEmi yoo ràn ọ lọ́wọ́ lati ròyìn ètò agbára oòrùn tí ó fọ́.\n\nNí orílẹ̀-èdè wo àti abúlé wo ni ètò náà wà?",
    fon: "Alo! 🌞 Nyɛ wɛ nye Lumoki tɔn azɔwanú.\nUn na d'acɛ we bo na gbɛ̌ nǔ e kúnkan solar gbɔjɛ tɔn.\n\nGan tɛ mɛ kpo toxo tɛ mɛ kpo wɛ solar ɔ ɖè?",
    dyu: "I ni ce! 🌞 Ne ye Lumoki ka dɛmɛbaga ye.\nN bena i dɛmɛ solar installation minɛnin sɛbɛn.\n\nDugukolo ni dugu jumɛn na installation in be?"
  },
  people: {
    fr: "Merci ! Combien de *familles ou personnes* utilisent cette installation ?",
    en: "Thanks! How many *families or people* use this installation?",
    wo: "Jërëjëf ! Naka *jëkër yi walla nit ñi* ngiy jëfandikoo installation bii ?",
    bm: "I ni ce ! *Somɔgɔ wɛrɛ joli* bɛ installation in kɛlɛ ?",
    sw: "Asante! *Familia au watu* wangapi wanatumia mfumo huu?",
    ha: "Na gode! Yaya *iyalai ko mutane* suke amfani da wannan tsarin?",
    yo: "Ẹ jẹ́ ká dúpẹ́! Iye *ìdílé tàbí ènìyàn* mélòó ni ń lo ètò yìí?",
    fon: "Akpé! *Xwédo lɛ kpo gbɛtɔ lɛ kpo* wɛ nɛ nú solar ɔ bló?",
    dyu: "I ni ce ! *Somɔgɔ wɛrɛ joli* bɛ installation in kɛlɛ ?"
  },
  site_type: {
    fr: "Quel type dinstallation ?\n\n1️⃣ Maisons / familles\n2️⃣ École\n3️⃣ Dispensaire / santé\n4️⃣ Pompe à eau\n5️⃣ Autre",
    en: "What type of installation?\n\n1️⃣ Homes / families\n2️⃣ School\n3️⃣ Health clinic\n4️⃣ Water pump\n5️⃣ Other",
    sw: "Aina gani ya mfumo?\n\n1️⃣ Nyumba / familia\n2️⃣ Shule\n3️⃣ Kliniki\n4️⃣ Pampu ya maji\n5️⃣ Nyingine",
    wo: "Ana install bi ?\n\n1️⃣ Kër yi / familles\n2️⃣ Daara\n3️⃣ Dispensaire\n4️⃣ Pompe\n5️⃣ Yeneen",
    bm: "Installation jɛn ye ?\n\n1️⃣ Sow / familles\n2️⃣ Kalanso\n3️⃣ Furaso\n4️⃣ Ji pompe\n5️⃣ Wɛrɛ",
    ha: "Wane irin tsari ne?\n\n1️⃣ Gidaje / iyalai\n2️⃣ Makaranta\n3️⃣ Asibitin lafiya\n4️⃣ Famfo ruwa\n5️⃣ Wani abu",
    yo: "Iru eto wo ni?\n\n1️⃣ Ile / ebi\n2️⃣ Ile-iwe\n3️⃣ Ile-iwosan\n4️⃣ Fampu omi\n5️⃣ Miiiran",
    fon: "Klasi solar tɛ wɛ?\n\n1️⃣ Xwé / xwédo\n2️⃣ Suklu\n3️⃣ Azɔ gbigbɔ\n4️⃣ Tomatin dji\n5️⃣ Vɔ ɖevo",
    dyu: "Installation jɛn ye ?\n\n1️⃣ Sow / familles\n2️⃣ Kalanso\n3️⃣ Furaso\n4️⃣ Ji pompe\n5️⃣ Wɛrɛ"
  },

  confirm: {
    fr: (val) => `Vous avez répondu : *${val}*\nC'est bien ça ? (oui / non)`,
    en: (val) => `You answered: *${val}*\nIs that correct? (yes / no)`,
    sw: (val) => `Ulijibu: *${val}*\nJe hiyo ni sahihi? (ndiyo / hapana)`,
    wo: (val) => `Defal na : *${val}*\nMoo rekk? (waaw / déedéet)`,
    bm: (val) => `I y'a jaabi : *${val}*\nA sɔrɔ wa? (ɔwɔ / ayi)`,
    fon: (val) => `A ná : *${val}*\nÉ nyí mɔ̌? (ɛɛn / eyi)`,
    ha: (val) => `Ka amsa: *${val}*\nHaka ne? (eh / a'a)`,
    yo: (val) => `O dáhùn: *${val}*\nṢé ìyẹn tọ́? (bẹ́ẹ̀ni / rárá)`,
    dyu: (val) => `I y'a jaabi : *${val}*\nA sɔrɔ wa? (ɔwɔ / ayi)`
  },
  confirm_no: {
    fr: "D'accord, recommençons. ",
    en: "OK, let's try again. ",
    sw: "Sawa, hebu tuanze tena. ",
    wo: "Waaw, jegelee. ",
    bm: "Aw, an dɔ lajɛ. ",
    fon: "Enyi, bɔ dó. ",
    ha: "To, mu sake. ",
    yo: "Ó dára, jẹ́ ká tún. ",
    dyu: "Aw, an dɔ lajɛ. "
  },
  gps: {
    fr: "📍 Partagez votre *position GPS* maintenant (bouton 📎 → Position)\nOu tapez *SKIP* si vous ne pouvez pas.",
    en: "📍 Share your *GPS location* now (button 📎 → Location)\nOr type *SKIP* if you can't.",
    sw: "📍 Shiriki *eneo lako la GPS* sasa (kitufe 📎 → Mahali)\nAu andika *SKIP* kama huwezi.",
    wo: "📍 Yónneel *position GPS* bi kanam (bouton 📎 → Position)\nWala def *SKIP* bu mën ul.",
    bm: "📍 I *GPS position* ci dɔ (bouton 📎 → Position)\nWala sɛbɛn *SKIP* ni i ma se.",
    fon: "📍 Sɛ́nd *position GPS* towe ɖíe (bouton 📎 → Position)\nEnyi a sixu ǎ wlan *SKIP*.",
    ha: "📍 Raba *wurin GPS* yanzu (maɓallin 📎 → Wuri)\nKo rubuta *SKIP* in ba za ku iya ba.",
    yo: "📍 Pín *ìpò GPS* rẹ bí (bọ́tìnnì 📎 → Ìpò)\nTàbí tẹ *SKIP* bí o kò bá lè.",
    dyu: "📍 I *GPS position* ci dɔ (bouton 📎 → Position)\nWala sɛbɛn *SKIP* ni i ma se."
  },
  duration: {
    fr: "Depuis *combien de temps* l'installation ne fonctionne plus ?\n_(Ex: 2 jours, 1 semaine, 1 mois)_",
    en: "For *how long* has the installation not been working?\n_(E.g: 2 days, 1 week, 1 month)_",
    sw: "Kwa *muda gani* mfumo haujafanya kazi?\n_(Mfano: siku 2, wiki 1, mwezi 1)_",
    wo: "*Jamm* la installation bi dëkkul ?\n_(Misaal: 2 fan, 1 ayu-bés, 1 wèr)_",
    bm: "*Waati joli* bɛ a sen installation in kɛlɛ ?\n_(Misali: tile 2, dɔgɔkun 1, kalo 1)_",
    ha: "Tsarin yana rashin aiki tun *yaushe*?\n_(Misali: kwana 2, mako 1, wata 1)_",
    yo: "Ètò náà ti dáwọ́ ṣiṣẹ́ fún *ìgbà mélòó*?\n_(Àpẹẹrẹ: ọjọ́ 2, ọ̀sẹ̀ 1, oṣù 1)_",
    fon: "*Hwenu* tɛ mɛ wɛ solar ɔ ma bló ǎ?\n_(Kpɔ́ndéwú: zǎn 2, vɔsatɔn 1, sín 1)_",
    dyu: "*Waati joli* bɛ a sen installation in kɛlɛ ?\n_(Misali: tile 2, dɔgɔkun 1, kalo 1)_"
  },
  symptom: {
    fr: "Qu'est-ce qui se passe exactement ?\nChoisissez le numéro :\n\n1️⃣ Rien ne s'allume du tout\n2️⃣ Ça s'allume le jour mais pas la nuit\n3️⃣ Ça coupe souvent\n4️⃣ La lumière est faible / les appareils marchent mal\n5️⃣ Il y a une odeur ou de la chaleur bizarre\n6️⃣ Autre (expliquez)",
    en: "What exactly is happening?\nChoose a number:\n\n1️⃣ Nothing works at all\n2️⃣ Works during day but not at night\n3️⃣ Cuts off frequently\n4️⃣ Weak light / appliances work poorly\n5️⃣ Strange smell or heat\n6️⃣ Other (explain)",
    sw: "Nini kinachotokea hasa?\nChagua nambari:\n\n1️⃣ Hakuna kinachofanya kazi\n2️⃣ Inafanya kazi mchana lakini si usiku\n3️⃣ Inakatika mara kwa mara\n4️⃣ Mwanga dhaifu / vifaa vinavyofanya kazi vibaya\n5️⃣ Harufu au joto la ajabu\n6️⃣ Nyingine (eleza)",
    wo: "Lan la xam ci kanam ?\nTann nimer bi:\n\n1️⃣ Dara du jëf\n2️⃣ Jëf ci cig këram, du jëf ci guddi\n3️⃣ Dafay tëdd lool\n4️⃣ Jant bi néew / appareils yi dañu metti\n5️⃣ Am na benn yëgël walla tangaay\n6️⃣ Yeneen (waxtaan)",
    bm: "Mun bɛ kɛ sisan ?\nNomoro dɔ sugandi:\n\n1️⃣ Fɛn si tɛ kɛlɛ\n2️⃣ Tile la kɛlɛ, su tɛ kɛlɛ\n3️⃣ A bɛ ban joona joona\n4️⃣ Yeelen dɔgɔman / machine tɛ kɛlɛ\n5️⃣ Bɔ cɛ wɛrɛ wala teliman\n6️⃣ Wɛrɛ (yira)",
    ha: "Menene ke faruwa?\nZaɓi lamba:\n\n1️⃣ Babu abin da ke aiki\n2️⃣ Yana aiki rana amma ba dare\n3️⃣ Yana yanke sau da yawa\n4️⃣ Haske mai rauni / na'urori suna aiki marasa kyau\n5️⃣ Wari ko zafi mai ban mamaki\n6️⃣ Wani abu (bayyana)",
    yo: "Kíni tó ń ṣẹlẹ̀ gangan?\nYan nọ́mbà:\n\n1️⃣ Ohunkóhun kò ń ṣiṣẹ́\n2️⃣ Ń ṣiṣẹ́ lọ́sàn ṣùgbọ́n kò ṣiṣẹ́ lóru\n3️⃣ Ń pa padà lọ́pọ̀ ìgbà\n4️⃣ Ìmọ̀lẹ̀ àìlera / ẹ̀rọ ń ṣiṣẹ́ àìdára\n5️⃣ Ará tàbí ìgbóná àjèjì\n6️⃣ Mìíràn (ṣàlàyé)",
    fon: "Nɛ nú ɖé wɛ nyí ɔ?\nNɔmblu ɖé sɔ:\n\n1️⃣ Nǔ ɖebǔ ma wà ǎ\n2️⃣ Wà azǎ mɛ, ma wà zǎn mɛ ǎ\n3️⃣ Cikɔn bɔ lɛkɔ\n4️⃣ Weziza kpɛví / nǔwlanwlan lɛ ma wà nɔ ǎ\n5️⃣ Wɛnsísá wɛ kpo vɔ kpo\n6️⃣ Vɔ ɖevo (ɖɔ)",
    dyu: "Mun bɛ kɛ sisan ?\nNomoro dɔ sugandi:\n\n1️⃣ Fɛn si tɛ kɛlɛ\n2️⃣ Tile la kɛlɛ, su tɛ kɛlɛ\n3️⃣ A bɛ ban joona joona\n4️⃣ Yeelen dɔgɔman\n5️⃣ Bɔ cɛ wɛrɛ\n6️⃣ Wɛrɛ (yira)"
  },
  event: {
    fr: "Est-ce qu'il s'est passé quelque chose récemment ?\n\n1️⃣ Orage / foudre\n2️⃣ Inondation\n3️⃣ Quelqu'un a touché l'installation\n4️⃣ Rien de particulier",
    en: "Did anything happen recently?\n\n1️⃣ Storm / lightning\n2️⃣ Flood\n3️⃣ Someone touched the installation\n4️⃣ Nothing in particular",
    sw: "Je, kuna chochote kilichotokea hivi karibuni?\n\n1️⃣ Dhoruba / umeme\n2️⃣ Mafuriko\n3️⃣ Mtu aligusa mfumo\n4️⃣ Hakuna kitu maalum",
    wo: "Am na dara mujj ci kanam ?\n\n1️⃣ Sanq / tulli\n2️⃣ Ndox bu baax\n3️⃣ Ku tànn installation bi\n4️⃣ Dara amul",
    bm: "Fɛn dɔ kɛra ka ɲɛ ?\n\n1️⃣ Saniya / sanji\n2️⃣ Ji bɔra\n3️⃣ Mɔgɔ dɔ ye installation in tɔ\n4️⃣ Fɛn si tɛ kɛ",
    ha: "Shin wani abu ya faru kwanan nan?\n\n1️⃣ Hadari / walƙiya\n2️⃣ Ambaliya\n3️⃣ Wani ya taɓa tsarin\n4️⃣ Babu komai na musamman",
    yo: "Ṣé ohunkóhun ṣẹlẹ̀ láìpẹ́?\n\n1️⃣ Ìjì / mànàmáná\n2️⃣ Ìkún omi\n3️⃣ Ẹnikan fọwọ́ kan ètò náà\n4️⃣ Ohunkóhun pàtàkì",
    fon: "Nǔ ɖé wɛ jɛ hwenu vɔvɔ ɔ mɛ à?\n\n1️⃣ Zɔ / avɔ\n2️⃣ Xù\n3️⃣ Mɛ ɖé zé solar ɔ sín nǔ\n4️⃣ Nǔ ɖevo ǎ",
    dyu: "Fɛn dɔ kɛra ka ɲɛ ?\n\n1️⃣ Saniya\n2️⃣ Ji bɔra\n3️⃣ Mɔgɔ dɔ ye installation in tɔ\n4️⃣ Fɛn si tɛ kɛ"
  },
  inv_far:       { fr: "Merci ! Maintenant les photos 📸\n\n*Onduleur / Boîte principale*\nEnvoie une photo *DE LOIN* pour voir toute la boîte", en: "Thanks! Now photos 📸\n\n*Inverter / Main box*\nSend a photo *FROM FAR* to see the whole box", sw: "Asante! Sasa picha 📸\n\n*Inverter*\nTuma picha *KWA MBALI*", wo: "Jërëjëf ! 📸\n*Boîte bi* — litrat gu *yomb*", bm: "I ni ce ! 📸\n*Boîte* — fɔtɔ ci *jan*", ha: "Na gode! 📸\n*Inverter* — hoto *daga nesa*", yo: "Ẹ dúpẹ́! 📸\n*Inverter* — fọ́tò *láti jíjìn*", fon: "Akpé! 📸\n*Onduleur* — foto *dó tó*", dyu: "I ni ce ! 📸\n*Boîte* — fɔtɔ ci *jan*" },
  inv_brand:     { fr: "Super ! Photo *PROCHE* de l'étiquette (marque, modèle, numéros)", en: "Great! *CLOSE* photo of the label (brand, model, numbers)", sw: "Vizuri! Picha *YA KARIBU* ya lebo (chapa, modeli, nambari)", wo: "Baax na ! Litrat gu *gudd* ci étiquette (marque, modèle, nimeero)", bm: "Aw ni baara ! Fɔtɔ *ka gɛlɛn* ci étiquette (marque, modèle, nimɔrɔ)", ha: "Kyau! Hoto *KUSA* na lakabi (alamar, samfurin, lambobi)", yo: "Ó dára! Fọ́tò *tímọ́* ti àmì (àmì, àpẹẹrẹ, nọ́mbà)", fon: "Nɔ wà! Foto *tɛnmɛ* sín étiquette (marque, modèle, nɔmblu)", dyu: "Aw ni baara ! Fɔtɔ *ka gɛlɛn* ci étiquette" },
  inv_screen:    { fr: "Il y a un *écran allumé* ? (oui/non)\nSi oui → photo de l'écran", en: "Is there a *lit screen*? (yes/no)\nIf yes → photo of the screen", sw: "Kuna *skrini inayowaka*? (ndiyo/hapana)\nKama ndiyo → picha ya skrini", wo: "Am na *écran bu yër* ? (waaw/déedéet)\nBu am na → litrat ci écran bi", bm: "*Écran* dɔ bɛ yɛrɛ ? (ɔwɔ/ayi)\nA bɛ yɛrɛ kɔ → fɔtɔ ci a kan", ha: "Akwai *allon da ke haskakawa*? (eh/a'a)\nIdan eh → hoto na allon", yo: "*Ojú-iwe tí ó ń tàn* wà? (bẹ́ẹ̀ni/rárá)\nBí bẹ́ẹ̀ni → fọ́tò rẹ̀", fon: "*Écran e tɔ́n* ɖè ɖò? (ɛɛn/eyi)\nɛɛn kɔ → foto sín écran ɔ", dyu: "*Écran* dɔ bɛ yɛrɛ ? (ɔwɔ/ayi)" },
  bat_far:       { fr: "Maintenant les *batteries* 🔋\nPhoto *DE LOIN* pour voir *toutes* les batteries", en: "Now the *batteries* 🔋\nPhoto *FROM FAR* to see *all* batteries", sw: "Sasa *betri* 🔋\nPicha *KWA MBALI* kuona *betri zote*", wo: "Kanam *pil yi* 🔋\nLitrat gu *yomb* ngir xam *pil yi bée*", bm: "Sisan *batɛri* 🔋\nFɔtɔ ci *jan* walasa *batɛri bɛɛ* ye", ha: "Yanzu *baturin* 🔋\nHoto *daga nesa* don ganin *duk baturin*", yo: "Báyìí àwọn *batiri* 🔋\nFọ́tò *láti jíjìn* kí a rí *gbogbo batiri*", fon: "Égbé ɔ, *batri lɛ* 🔋\nFoto *dó tó* bo na mɔ *batri lɛ bǐ*", dyu: "Sisan *batɛri* 🔋\nFɔtɔ ci *jan* walasa *batɛri bɛɛ* ye" },
  bat_brand:     { fr: "Photo *PROCHE* de l'étiquette d'une batterie (marque, chiffres)", en: "*CLOSE* photo of one battery label (brand, numbers)", sw: "Picha *YA KARIBU* ya lebo ya betri moja (chapa, nambari)", wo: "Litrat gu *gudd* ci étiquette pil (marque, nimeero)", bm: "Fɔtɔ *ka gɛlɛn* ci batɛri kelen kan (marque, nimɔrɔ)", ha: "Hoto *KUSA* na lakabi a kan baturin ɗaya (alamar, lambobi)", yo: "Fọ́tò *tímọ́* ti àmì lórí batiri kan (àmì, nọ́mbà)", fon: "Foto *tɛnmɛ* sín étiquette e ɖò batri ɖokpo jí", dyu: "Fɔtɔ *ka gɛlɛn* ci batɛri kelen kan" },
  bat_terminals: { fr: "Photo des *bornes et câbles* des batteries (corrosion ?)", en: "Photo of battery *terminals and cables* (corrosion?)", sw: "Picha ya *vituo na nyaya* za betri (kutu?)", wo: "Litrat ci *bornes ak câbles yi* ci pil yi (redd ?)", bm: "Fɔtɔ ci batɛri *bornes ni câbles* (kɔrɔsion ?)", ha: "Hoto na *tasoshin da wayoyin* na baturin (tsatsa?)", yo: "Fọ́tò ti *àwọn ìdúróṣinṣin àti okùn* batiri (àjàkálẹ̀?)", fon: "Foto sín *bornes kpo câbles lɛ kpo* sín batri lɛ (gbɔví?)", dyu: "Fɔtɔ ci batɛri *bornes ni câbles* (kɔrɔsion ?)" },
  panels_far:    { fr: "Maintenant les *panneaux* ☀️\nPhoto *DE LOIN* pour voir tous les panneaux sur le toit", en: "Now the *solar panels* ☀️\nPhoto *FROM FAR* to see all panels on the roof", sw: "Sasa *paneli za jua* ☀️\nPicha *KWA MBALI* kuona paneli zote paa", wo: "Kanam *panneau yi* ☀️\nLitrat gu *yomb* ngir xam panneau bée ci xëtt bi", bm: "Sisan *panneau* ☀️\nFɔtɔ ci *jan* ka panneau bɛɛ ye can kan", ha: "Yanzu *faifan rana* ☀️\nHoto *daga nesa* don ganin faifan a kan rufin", yo: "Báyìí *pánẹ́ẹ̀lì oòrùn* ☀️\nFọ́tò *láti jíjìn* láti rí gbogbo pánẹ́ẹ̀lì", fon: "Égbé ɔ, *panneau lɛ* ☀️\nFoto *dó tó* bo na mɔ panneau lɛ bǐ ɖò susu jí", dyu: "Sisan *panneau* ☀️\nFɔtɔ ci *jan* ka panneau bɛɛ ye" },
  panels_close:  { fr: "Anomalie visible (fissure, saleté, ombre) ? → Photo *PROCHE*\nSinon tapez *OK*", en: "Any visible anomaly (crack, dirt, shadow)? → *CLOSE* photo\nOtherwise type *OK*", sw: "Kuna hitilafu inayoonekana? → Picha *YA KARIBU*\nVinginevyo andika *OK*", wo: "Dara xam ci kanam (fenḍ, mbedd) ? → Litrat gu *gudd*\nYëg sax bind *OK*", bm: "Fɛn tɔ ye (fenɛ, kulun) ? → Fɔtɔ *ka gɛlɛn*\nKɔ tɔ sɛbɛn *OK*", ha: "Akwai wani abu maras al'ada? → Hoto *KUSA*\nIn ba haka ba buga *OK*", yo: "Ohunkóhun tí kò ní dára? → Fọ́tò *tímọ́*\nBí bẹ́ẹ̀ kọ́ tẹ *OK*", fon: "Nǔ ɖé e ma sɔgbe ǎ? → Foto *tɛnmɛ*\nBɔ mɔ ǎ kɔ tɛɛn *OK*", dyu: "Fɛn tɔ ye (fenɛ, kulun) ? → Fɔtɔ *ka gɛlɛn*\nKɔ tɔ sɛbɛn *OK*" },
  tableau:       { fr: "Dernières photos 💪 Le *tableau électrique* (fusibles/disjoncteurs)\nUne photo *DE LOIN* puis une *PROCHE* des fusibles", en: "Last photos 💪 The *electrical panel* (fuses/breakers)\nOne photo *FROM FAR* then *CLOSE* of the fuses", sw: "Picha za mwisho 💪 *Paneli ya umeme*\nPicha *KWA MBALI* kisha *YA KARIBU* ya fyusi", wo: "Litrati yi dëkk bi 💪 *Tableau bi*\nLitrat gu *yomb* gannaaw gu *gudd* ci fusible yi", bm: "Fɔtɔ kɔrɔw 💪 *Tableau*\nFɔtɔ ci *jan* ani ci *gɛlɛn* ka fusible ye", ha: "Hotuna na ƙarshe 💪 *Allon wutar lantarki*\nHoto *daga nesa* sannan *kusa* na fyus", yo: "Ẹgbẹ́ ìkẹyìn 💪 *Pánẹ́ẹ̀lì*\nFọ́tò *láti jíjìn* lẹ́hìn *tímọ́* ti fusi", fon: "Foto gudogudo lɛ 💪 *Tableau électrique*\nFoto *dó tó* bo bɛ *tɛnmɛ* sín fusible lɛ", dyu: "Fɔtɔ kɔrɔw 💪 *Tableau*\nFɔtɔ ci *jan* ani ci *gɛlɛn*" },
  contact:       { fr: "Excellent ! Dernière question 🙏\nVotre *nom* et votre *numéro de téléphone* pour vous recontacter ?", en: "Excellent! Last question 🙏\nYour *name* and *phone number* so we can contact you back?", sw: "Vizuri sana! Swali la mwisho 🙏\nJina lako na nambari ya simu?", wo: "Baax na lool ! Laaj bi bëgg bi 🙏\n*Turu* ak *nimeero téléphone* ?", bm: "Aw ni baara ! Ɲininkali kɔrɔ 🙏\nI *tɔgɔ* ni i *téléphone nimɔrɔ* ?", ha: "Kyau sosai! Tambaya ta ƙarshe 🙏\n*Sunanka* da *lambar wayarka* ?", yo: "Ó tayọ! Ìbéèrè ìkẹyìn 🙏\n*Orúkọ* àti *nọ́mbà fóònù* rẹ?", fon: "Nɔ wà tawun! Nùkanbyɔ gudogudo ɔ 🙏\n*Nyikɔ* kpo *nɔmblu téléphone* tɔn kpo?", dyu: "Aw ni baara ! Ɲininkali kɔrɔ 🙏\nI *tɔgɔ* ni i *téléphone nimɔrɔ* ?" },
  analyzing:     { fr: "Merci beaucoup ! 🙏\nToutes vos infos sont transmises à notre équipe technique.\nL'analyse IA est en cours... ⏳\n\nVous recevrez une confirmation dans quelques minutes.", en: "Thank you very much! 🙏\nAll your info has been sent to our technical team.\nAI analysis in progress... ⏳\n\nYou'll receive a confirmation in a few minutes.", sw: "Asante sana! 🙏\nTaarifa zote zimetumwa kwa timu yetu.\nUchambuzi wa AI unaendelea... ⏳", wo: "Jërëjëf lool ! 🙏\nDangu yónnee yépp ci sunu équipe technique.\nIA bi dafay jëfëf... ⏳", bm: "I ni ce kosɛbɛ ! 🙏\nKunnafoni bɛɛ tun ci sunu équipe yɛrɛ.\nIA ka ɲɛfɔ... ⏳", ha: "Na gode sosai! 🙏\nDuk bayanan sun isa ƙungiyarmu.\nBinciken AI yana gudana... ⏳", yo: "Ẹ jẹ́ ká dúpẹ́ gan an! 🙏\nGbogbo àlàyé ti lọ sí ẹgbẹ́ wa.\nÌgbékalẹ̀ AI ń lọ... ⏳", fon: "Akpé tawun! 🙏\nXógbe bǐ sɛ ɖo mɛtɔn lɛ sín nu.\nAI ɔ ɖò azɔ wà... ⏳", dyu: "I ni ce kosɛbɛ ! 🙏\nKunnafoni bɛɛ tun ci sunu équipe yɛrɛ.\nIA ka ɲɛfɔ... ⏳" }
};

function t(key, lang) {
  return (T[key] && (T[key][lang] || T[key]['fr'] || T[key]['en'])) || '';
}

// ── LANGUAGE DETECTION ───────────────────────────────────────────────────────
async function detectLanguage(text) {
  try {
    const res = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: `Language code only (fr/en/wo/bm/sw/ha/yo/fon/dyu) for: "${text}"` }]
    });
    return res.content[0].text.trim().toLowerCase().slice(0, 3);
  } catch(e) { return 'fr'; }
}

// ── UPLOAD PHOTO ─────────────────────────────────────────────────────────────
async function uploadPhoto(mediaUrl, convId, type) {
  try {
    const auth = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const r    = await fetch(mediaUrl, { headers: { Authorization: auth } });
    const buf  = await r.buffer();
    const ext  = r.headers.get('content-type')?.includes('png') ? 'png' : 'jpg';
    const path = `conv-${convId}/${type}_${Date.now()}.${ext}`;
    const { error } = await db.storage.from('site-photos').upload(path, buf, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    return db.storage.from('site-photos').getPublicUrl(path).data.publicUrl;
  } catch(e) { console.error('Upload error:', e); return null; }
}

// ── ANALYZE PHOTO WITH CLAUDE VISION ─────────────────────────────────────────
async function analyzePhoto(url, context) {
  try {
    const res = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'url', url } },
        { type: 'text',  text: `Solar installation photo context: "${context}". Extract visible brand, model, numbers, count units, damage, corrosion, error codes. JSON only: {"observations":"","extracted_data":{},"anomalies":[],"confidence":0}` }
      ]}]
    });
    return JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
  } catch(e) { return { observations: 'Analysis failed', extracted_data: {}, anomalies: [], confidence: 0 }; }
}

// ── GENERATE FINAL DIAGNOSTIC ─────────────────────────────────────────────────
async function generateDiagnostic(state, lang) {
  const photos = (state.photos || []).map(p => `[${p.type}] ${p.analysis?.observations || ''}`).join('\n');
  const langName = { fr:'French', en:'English', wo:'Wolof', bm:'Bambara', sw:'Swahili', ha:'Hausa', yo:'Yoruba', fon:'Fon', dyu:'Dioula' }[lang] || 'French';

  const res = await ai.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: `You are a solar energy expert for Sub-Saharan Africa off-grid installations.

SITE REPORT:
- Location: ${state.location}
- People: ${state.people_count}
- Offline since: ${state.offline_duration}
- Symptom: ${state.symptom}
- Recent event: ${state.recent_event}
- Reporter: ${state.contact}

PHOTO ANALYSES:
${photos}

Generate diagnostic JSON (respond ONLY with valid JSON, no markdown):
{
  "inverter_brand":"","inverter_model":"","inverter_kw":null,
  "battery_brand":"","battery_count":null,"battery_ah":null,"battery_voltage":null,"battery_tech":"",
  "panel_count":null,"panel_kw":null,
  "fault_primary":"","fault_secondary":"","fault_tertiary":"",
  "confidence":0,"urgency":1,
  "parts_needed":[{"name":"","qty":1,"est_cost_eur":0}],
  "total_cost_est":0,"days_offline":0,"recent_event":"",
  "ai_report":"narrative in ${langName}",
  "ai_instructions":"technician steps in ${langName}"
}` }]
  });

  return JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
}

// ── NOTIFICATION EMAIL ────────────────────────────────────────────────────────
async function notifyTeam(siteId, diagnostic, state) {
  const urg = ['','🟢','🟡','🟠','🔴','🚨'][diagnostic.urgency] || '⚪';
  await resend.emails.send({
    from: 'Lumoki Bot <bot@lumoki.africa>',
    to:   process.env.NOTIFY_EMAIL,
    subject: `${urg} Nouveau site — ${state.location} (Urgence ${diagnostic.urgency}/5)`,
    html: `<h2>🌞 Nouveau site Lumoki</h2>
<b>ID:</b> ${siteId}<br><b>Lieu:</b> ${state.location}<br>
<b>Reporter:</b> ${state.contact}<br><b>Personnes:</b> ${state.people_count}<br>
<b>Hors service:</b> ${state.offline_duration}<br><b>Symptôme:</b> ${state.symptom}<br>
<hr><h3>${urg} Diagnostic IA (${diagnostic.confidence}% confiance)</h3>
<b>Panne:</b> ${diagnostic.fault_primary}<br>
<b>Équipement:</b> ${diagnostic.inverter_brand} ${diagnostic.inverter_model} | ${diagnostic.battery_count}x batteries ${diagnostic.battery_brand}<br>
<b>Budget estimé:</b> €${diagnostic.total_cost_est}<br>
<hr><p>${diagnostic.ai_report}</p>
<p><b>Instructions technicien:</b><br>${diagnostic.ai_instructions}</p>
<a href="https://lumoki.africa/sites.html">Voir sur Lumoki →</a>`
  });
}

// ── SEND WHATSAPP ─────────────────────────────────────────────────────────────
async function send(to, body) {
  const from = process.env.TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:')
    ? process.env.TWILIO_WHATSAPP_NUMBER
    : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
  await twilioCli.messages.create({
    from,
    to: `whatsapp:${to}`,
    body
  });
}

// ── MAIN WEBHOOK ──────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  // Twilio attend une réponse TwiML vide — pas de texte sinon il l'envoie comme message
  res.set('Content-Type', 'text/xml').send('<Response/>');

  const phone    = req.body.From?.replace('whatsapp:', '') || '';
  const body     = (req.body.Body || '').trim();
  const mediaUrl = req.body.MediaUrl0 || null;
  console.log(`📩 Incoming | phone: ${phone} | body: "${body}" | media: ${mediaUrl ? 'yes' : 'no'}`);
  if (!phone) return;

  try {
    // Load or create conversation
    let { data: conv } = await db.from('conversations')
      .select('*').eq('phone', phone).eq('status', 'in_progress').single();

    if (!conv) {
      const lang = await detectLanguage(body);
      const { data: nc } = await db.from('conversations')
        .insert({ phone, language: lang, step: 0, state: {} }).select().single();
      conv = nc;
      await send(phone, t('welcome', lang));
      return;
    }

    const lang  = conv.language || 'fr';
    const step  = conv.step;
    const state = { ...conv.state };
    let next    = step + 1;

    // Handle photo upload helper
    // Helper: upload photo + analyse Claude
    const uploadIfMedia = async (type, context) => {
      if (!mediaUrl) return;
      const url = await uploadPhoto(mediaUrl, conv.id, type);
      const analysis = url ? await analyzePhoto(url, context) : null;
      state.photos = [...(state.photos || []), { type, url, analysis }];
    };

    // Helper: messages d'aide photo par langue
    const photoHelp = {
      fr: (hint) => `📸 Merci d'envoyer une *photo* ${hint}\n\nSi vous ne pouvez pas, répondez *SKIP* pour passer.`,
      en: (hint) => `📸 Please send a *photo* ${hint}\n\nIf you can't, reply *SKIP* to continue.`,
      sw: (hint) => `📸 Tafadhali tuma *picha* ${hint}\n\nUkishindwa, jibu *SKIP* kuendelea.`,
      wo: (hint) => `📸 Yónneel *litrat* ${hint}\n\nBu mën ul, def *SKIP*.`,
      bm: (hint) => `📸 *Fɔtɔ* ci dɔ ${hint}\n\nNi i ma se, sɛbɛn *SKIP*.`,
      fon: (hint) => `📸 Sɛ́nd *foto* ɖé ${hint}\n\nEnyi a sixu ǎ, wlan *SKIP*.`,
      ha: (hint) => `📸 Aika *hoto* ${hint}\n\nIn ba za ku iya ba, rubuta *SKIP*.`,
      yo: (hint) => `📸 Fi *fọ́tò* ránṣẹ́ ${hint}\n\nTí o kò bá lè, dahùn *SKIP*.`,
      dyu: (hint) => `📸 *Fɔtɔ* ci dɔ ${hint}\n\nNi i ma se, sɛbɛn *SKIP*.`
    };
    const ph = photoHelp[lang] || photoHelp.fr;
    const isSkip = body.toUpperCase() === 'SKIP';

    // Helper: confirmation for free-text inputs
    const isYes = /^(oui|yes|ok|waaw|ɔwɔ|ɛɛn|eh|bẹ̀ẹni|ndiyo|si|da|1)$/i.test(body.trim());
    const isNo  = /^(non|no|déedéet|ayi|eyi|a'a|rárá|hapana|2)$/i.test(body.trim());

    const confirmOrSave = async (field, value, nextQuestion, nextStep) => {
      if (state.pending_confirm === field) {
        // User is responding to confirmation
        if (isYes) {
          state[field] = state[`pending_${field}`];
          delete state.pending_confirm;
          delete state[`pending_${field}`];
          await send(phone, nextQuestion);
        } else {
          // No — re-ask
          delete state.pending_confirm;
          delete state[`pending_${field}`];
          const confirmNo = T.confirm_no[lang] || T.confirm_no.fr;
          await send(phone, confirmNo + nextQuestion.split('\n')[0]);
          next = step; // stay on same step
        }
      } else {
        // First time — ask confirmation
        state.pending_confirm = field;
        state[`pending_${field}`] = value;
        const confirmFn = T.confirm[lang] || T.confirm.fr;
        await send(phone, confirmFn(value));
        next = step; // stay on same step
      }
    };

    switch(step) {
      case 1:
        await confirmOrSave('location', body, t('people', lang), 2);
        break;
      case 2:
        await confirmOrSave('people_count', body, t('site_type', lang), 3);
        break;
      case 3:  state.site_type          = body; await send(phone, t('duration', lang));  break;
      case 4:
        await confirmOrSave('offline_duration', body, t('symptom', lang), 5);
        break;
      case 5:  state.symptom            = body; await send(phone, t('event', lang));      break;
      case 6:  state.recent_event       = body; await send(phone, t('gps', lang));    break;

      case 7: {
        // GPS location
        const lat = req.body.Latitude;
        const lng = req.body.Longitude;
        if (lat && lng) {
          state.lat = parseFloat(lat);
          state.lng = parseFloat(lng);
          await send(phone, t('inv_far', lang));
        } else if (isSkip || body) {
          // No GPS shared — continue anyway
          await send(phone, t('inv_far', lang));
        } else {
          await send(phone, t('gps', lang));
          return;
        }
        break;
      }

      case 8:
        if (!mediaUrl && !isSkip) { await send(phone, ph('de la boîte principale (de loin)')); return; }
        await uploadIfMedia('inverter_far', 'inverter main box far shot');
        await send(phone, t('inv_brand', lang)); break;

      case 9:
        if (!mediaUrl && !isSkip) { await send(phone, ph("de l'étiquette (marque et modèle)")); return; }
        await uploadIfMedia('inverter_brand', 'inverter label brand model numbers');
        await send(phone, t('inv_screen', lang)); break;

      case 10:
        if (!mediaUrl && !isSkip) { await send(phone, ph("de l'écran ou des voyants")); return; }
        await uploadIfMedia('inverter_screen', 'inverter screen error codes display');
        await send(phone, t('bat_far', lang)); break;

      case 11:
        if (!mediaUrl && !isSkip) { await send(phone, ph('de toutes les batteries (de loin)')); return; }
        await uploadIfMedia('batteries_far', 'battery bank far shot count units');
        await send(phone, t('bat_brand', lang)); break;

      case 12:
        if (!mediaUrl && !isSkip) { await send(phone, ph("de l'étiquette sur une batterie")); return; }
        await uploadIfMedia('battery_brand', 'battery label brand capacity voltage');
        await send(phone, t('bat_terminals', lang)); break;

      case 13:
        if (!mediaUrl && !isSkip) { await send(phone, ph('des bornes et câbles des batteries')); return; }
        await uploadIfMedia('battery_terminals', 'battery terminals corrosion cables');
        await send(phone, t('panels_far', lang)); break;

      case 14:
        if (!mediaUrl && !isSkip) { await send(phone, ph('des panneaux sur le toit (de loin)')); return; }
        await uploadIfMedia('panels_far', 'solar panels far shot roof count');
        await send(phone, t('panels_close', lang)); break;

      case 15:
        if (!mediaUrl && !isSkip) { await send(phone, ph('des panneaux (de proche si abîmés)')); return; }
        await uploadIfMedia('panel_close', 'solar panel close-up cracks dirt');
        await send(phone, t('tableau', lang)); break;

      case 16:
        if (!mediaUrl && !isSkip) { await send(phone, ph('du tableau électrique ou des fusibles')); return; }
        await uploadIfMedia('tableau', 'electrical panel fuses breakers');
        await send(phone, t('contact', lang)); break;

      case 17:
        if (state.pending_confirm === 'contact') {
          if (isYes) {
            state.contact = state.pending_contact;
            delete state.pending_confirm;
            delete state.pending_contact;
          } else {
            delete state.pending_confirm;
            delete state.pending_contact;
            await send(phone, (T.confirm_no[lang] || T.confirm_no.fr) + t('contact', lang));
            next = step;
            break;
          }
        } else if (!state.contact) {
          state.pending_confirm = 'contact';
          state.pending_contact = body;
          const confirmFn = T.confirm[lang] || T.confirm.fr;
          await send(phone, confirmFn(body));
          next = step;
          break;
        }
        await send(phone, t('analyzing', lang));

        // Save state first
        await db.from('conversations').update({ state, step: 18, status: "complete" }).eq('id', conv.id);

        // Generate AI diagnostic
        const diag = await generateDiagnostic(state, lang);

        // Create site in Supabase
        const { count } = await db.from('sites').select('*', { count: 'exact', head: true });
        const year = new Date().getFullYear();

        // Country code from location text
        const countryCodeMap = {
          'senegal': 'SEN', 'sénégal': 'SEN',
          'mali': 'MLI',
          'burkina': 'BFA',
          'guinee': 'GIN', 'guinée': 'GIN',
          'cote': 'CIV', 'ivory': 'CIV',
          'nigeria': 'NGA',
          'ghana': 'GHA',
          'tanzanie': 'TZA', 'tanzania': 'TZA',
          'ouganda': 'UGA', 'uganda': 'UGA',
          'zambie': 'ZMB', 'zambia': 'ZMB',
          'benin': 'BEN', 'bénin': 'BEN'
        };
        const locationLower = (state.location || '').toLowerCase();
        const countryCode = Object.entries(countryCodeMap).find(([k]) => locationLower.includes(k))?.[1] || 'AFR';
        const siteId = `${countryCode}-${year}-${String((count || 0) + 1).padStart(3, '0')}`;
        const country = state.location.split(/,|\s+en\s+|\s+in\s+/i).pop()?.trim() || state.location;

        await db.from('sites').insert({
          id: siteId, name: `${state.location} — Solar Site`,
          lat: state.lat || 0, lng: state.lng || 0, status: 'offline', category: 'community',
          kw: diag.panel_kw || 0, country, region: 'west',
          category: ({'1':'community','2':'school','3':'health','4':'water','5':'business'})[state.site_type] || 'community',
          people: parseInt(state.people_count) || 0,
          photo_url: state.photos?.[0]?.url || null,
          fault: diag.fault_primary,
          sourced_at: new Date().toISOString().split('T')[0]
        });

        await db.from('diagnostics').insert({
          site_id: siteId, conversation_id: conv.id, ...diag, photos: state.photos
        });

        await db.from('conversations').update({ site_id: siteId }).eq('id', conv.id);
        await notifyTeam(siteId, diag, state);

        // Confirmation message to reporter
        const doneMsg = {
          fr: `✅ *Signalement enregistré !*

Référence : *${siteId}*

Notre équipe technique a reçu votre rapport et les photos. Un technicien vous contactera dans les 48h.

Merci d'aider votre communauté ! 🌞`,
          en: `✅ *Report registered!*

Reference: *${siteId}*

Our technical team has received your report and photos. A technician will contact you within 48 hours.

Thank you for helping your community! 🌞`,
          sw: `✅ *Ripoti imesajiliwa!*

Nambari ya kumbukumbu: *${siteId}*

Timu yetu imepokea ripoti na picha zako. Fundi atawasiliana nawe ndani ya masaa 48.

Asante kwa kusaidia jamii yako! 🌞`,
          wo: `✅ *Siiña bi dëkk na!*

Référence : *${siteId}*

Sunu équipe technique jël na rapport ak litrati yii. Benn technicien dinaa nekk ak yow ci 48h.

Jërëjëf ! 🌞`,
          bm: `✅ *Sɛbɛnni kɛra!*

Référence : *${siteId}*

Sunu équipe ye i ka rapport ni fɔtɔw sɔrɔ. Technicien dɔ bɛna i weele tile 2 kɔnɔ.

I ni ce ! 🌞`,
          fon: `✅ *Gbɛ̌ nǔ e kúnkan ɔ sɛ́ do!*

Référence : *${siteId}*

Mɛtɔn lɛ ɖó ripɔti kpo foto lɛ kpo. Technicien ɖé na ylɔ we ɖò wɛkɛ ɖokpo mɛ.

Akpé ! 🌞`,
          ha: `✅ *An yi rajista rahoto!*

Lamba ta: *${siteId}*

ƙungiyarmu ta karɓi rahoton ku da hotuna. Masanin fasaha zai sadar da ku cikin awanni 48.

Na gode ! 🌞`,
          yo: `✅ *Ìròyìn ti forúkọsilẹ̀!*

Àtọ́kasí: *${siteId}*

Ẹgbẹ́ wa ti gbà ìròyìn àti àwọn fọ́tò rẹ. Onímọ̀ ẹ̀rọ yóò kan sí ọ láàárọ̀ 48.

Ẹ ṣéun ! 🌞`,
          dyu: `✅ *Sɛbɛnni kɛra!*

Référence : *${siteId}*

Sunu équipe ye i ka rapport ni fɔtɔw sɔrɔ. Technicien dɔ bɛna i weele tile 2 kɔnɔ.

I ni ce ! 🌞`
        };
        await send(phone, doneMsg[lang] || doneMsg.fr);
        return;

      default:
        if (/bonjour|hello|nouveau|new|start/i.test(body)) {
          await db.from('conversations').update({ status: 'abandoned' }).eq('id', conv.id);
          const newLang = await detectLanguage(body);
          await db.from("conversations").insert({ phone, language: newLang, step: 0, state: {} });
          await send(phone, t('welcome', newLang));
        }
        return;
    }

    await db.from('conversations').update({ state, step: next, updated_at: new Date() }).eq('id', conv.id);

  } catch(e) {
    console.error('Webhook error:', e);
  }
});

app.get('/', (req, res) => res.json({ status: 'Lumoki Bot 🌞', version: '1.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lumoki Bot on port ${PORT}`));
