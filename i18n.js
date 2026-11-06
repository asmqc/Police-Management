// Police Management — version anglaise (phase 1) : site public, connexion, demande d'accès, navigation et menu.
// Les textes français restent la référence; les lois et le contrat de travail restent en français.
(function () {
  const EN = {
"Essayer": "Try it",
"Fonctionnalités": "Features",
"Horaire": "Schedule",
"Sécurité": "Security",
"FAQ": "FAQ",
"Contact": "Contact",
"Se connecter": "Sign in",
"Demander l'accès": "Request access",
"Gratuit · réservé aux policiers du Québec · accès vérifié": "Free · for Québec police officers · verified access",
"L'horaire, la route et les lois, réunis pour les policiers du Québec.": "Your schedule, the road and the law, together for Québec police officers.",
"Rotation et échanges de quarts, carte des postes avec les bornes kilométriques, Code de la sécurité routière et calculateur de vitesse, forum de votre corps de police. Une seule app, rapide à consulter en service, qui s'installe sur le téléphone ou l'ordinateur.": "Shift rotation and shift trades, a map of stations with kilometre markers, the Highway Safety Code and a speeding calculator, and a forum for your police service. One app, quick to check on duty, that installs on your phone or computer.",
"J'ai déjà un compte": "I already have an account",
"Essayer sans compte ↓": "Try without an account ↓",
"Données hébergées au Canada": "Data hosted in Canada",
"Conçu selon la Loi 25": "Built to comply with Québec's Law 25",
"Aucune publicité, aucun profilage": "No ads, no profiling",
"En 25 secondes": "In 25 seconds",
"Voyez Police Management en action": "See Police Management in action",
"L'accueil, l'horaire et la paie, la carte des postes, le calculateur de vitesse, le contrat de travail et le temps supplémentaire du poste, dans une seule app.": "Home screen, schedule and pay, station map, speeding calculator, collective agreement and station overtime, all in one app.",
"La présentation en une page": "The one-page overview",
"Essayez maintenant": "Try it now",
"Un aperçu, sans compte": "A preview, no account needed",
"Un avant-goût de ce que vous aurez en poche. Les données viennent de sources publiques (LégisQuébec, MRNF, Sûreté du Québec).": "A taste of what you'll have in your pocket. Data comes from public sources (LégisQuébec, MRNF, Sûreté du Québec).",
"Excès de vitesse": "Speeding",
"Article du CSR": "Highway Safety Code section",
"Qui couvre ?": "Who covers it?",
"Exemple en zone de": "Example in a zone of",
": choisissez une vitesse mesurée.": ": pick a measured speed.",
"Trois exemples d'articles du Code de la sécurité routière.": "Three sample sections of the Highway Safety Code.",
"443.1 · Cellulaire": "443.1 · Cell phone",
"396 · Ceinture": "396 · Seat belt",
"328 · Vitesse": "328 · Speed",
"Trois exemples : quel corps de police dessert la municipalité ?": "Three examples: which police service covers the municipality?",
"Ceci n'est qu'un aperçu. Toutes les limites, toutes les lois, la carte et le reste sont réservés aux membres.": "This is only a preview. All speed limits, all laws, the map and everything else are for members.",
"Tout ce qu'il faut pour un quart de travail": "Everything you need for a shift",
"Horaire et rotation": "Schedule and rotation",
"Vues jour, semaine, mois et liste. Rotation automatique, exceptions, temps supplémentaire détaillé et 2ᵉ calendrier pour votre conjoint·e.": "Day, week, month and list views. Automatic rotation, exceptions, detailed overtime and a second calendar for your partner.",
"Échanges de quarts": "Shift trades",
"Offrez un quart à votre poste : le premier collègue qui le prend l'obtient, et les deux horaires se mettent à jour.": "Offer a shift to your station: the first colleague who takes it gets it, and both schedules update.",
"Carte des postes": "Station map",
"Postes de la SQ, corps municipaux et autochtones, bornes kilométriques, sorties d'autoroute, codes municipaux et caméras du MTMD.": "SQ stations, municipal and Indigenous police services, kilometre markers, highway exits, municipal codes and MTMD traffic cameras.",
"Calculateur de vitesse": "Speeding calculator",
"Amende (art. 516 CSR), frais, contribution, réclamation totale et points d'inaptitude, en zone normale, de travaux ou scolaire.": "Fine (s. 516 HSC), court costs, contribution, total amount and demerit points, in regular, work or school zones.",
"Lois": "Laws",
"CSR, Code criminel, cannabis, drogues, véhicules hors route et plus, avec recherche, favoris et tableau des frais et contributions.": "Highway Safety Code, Criminal Code, cannabis, drugs, off-highway vehicles and more, with search, favourites and a table of costs and contributions.",
"Forum de votre corps": "Your service's forum",
"Échangez avec vos collègues sur les infractions et l'émission de constats. Chaque publication peut être signalée à l'administrateur.": "Talk with colleagues about offences and writing tickets. Any post can be reported to the administrator.",
"Feuille de poste": "Station sheet",
"La feuille de votre poste, partagée entre les membres du même poste seulement, toujours à jour.": "Your station's sheet, shared only with members of the same station, always up to date.",
"Idées et sondages": "Ideas and polls",
"Proposez des nouveautés, votez pour celles des autres et répondez aux sondages de l'administration.": "Suggest new features, vote on others' ideas and answer polls from the administrator.",
"Rappels et notifications": "Reminders and notifications",
"Rappel avant chaque quart, rappels d'événements, messages et annonces, même quand l'app est fermée.": "A reminder before each shift, event reminders, messages and announcements, even when the app is closed.",
"Paie et banques (SQ)": "Pay and banks (SQ)",
"Paie aux deux semaines estimée selon le contrat de travail, banques de vacances, de fériés et de temps en jours et en heures.": "Biweekly pay estimated from the collective agreement, plus vacation, holiday and time banks in days and hours.",
"IA du contrat de travail (SQ)": "Collective agreement AI (SQ)",
"Posez votre question en mots de tous les jours : l'IA cite mot pour mot les clauses qui répondent, avec la page du PDF officiel.": "Ask your question in plain words: the AI quotes the relevant clauses word for word, with the page of the official PDF.",
"Québec 511 de votre secteur": "Québec 511 for your area",
"Entraves et travaux sur le territoire de votre unité, actualisés automatiquement. Mode nuit rouge pour garder la vision nocturne.": "Road closures and construction in your unit's territory, updated automatically. Red night mode to protect your night vision.",
"Votre horaire, toujours à jour": "Your schedule, always up to date",
"Configurez votre rotation une seule fois : l'app calcule vos quarts pour les mois à venir. Ajoutez vacances, cour, formation ou temps supplémentaire en un toucher, avec les champs de la feuille de TS.": "Set up your rotation once: the app works out your shifts for the months ahead. Add vacation, court, training or overtime in one tap, with the fields of the overtime sheet.",
"Rotation partagée avec votre poste, sans vos notes ni vos événements": "Rotation shared with your station, without your notes or events",
"Statistiques d'heures et rapport de temps supplémentaire en PDF": "Hour statistics and an overtime report as a PDF",
"Calendrier abonné : votre horaire dans l'iPhone, Google ou Outlook, mis à jour tout seul": "Calendar subscription: your schedule in iPhone, Google or Outlook, updated automatically",
"Carte": "Map",
"Chaque poste, chaque borne, à portée de main": "Every station, every marker, at your fingertips",
"Entrez une route et un kilométrage, ou touchez la carte : Police Management indique le corps de police responsable, le poste, le code municipal, le district judiciaire et la borne la plus proche.": "Enter a road and a kilometre, or tap the map: Police Management shows the police service in charge, the station, the municipal code, the judicial district and the nearest marker.",
"Carte adaptée à votre corps de police et à votre territoire": "A map tailored to your police service and territory",
"Repères personnels, visibles par vous seulement": "Personal markers, visible only to you",
"Votre position reste sur votre appareil": "Your location stays on your device",
"Lois et routière": "Laws and traffic",
"Le bon article et le bon montant, tout de suite": "The right section and the right amount, right away",
"Cherchez un article par numéro ou par mot-clé, copiez-le, ouvrez le texte officiel. Pour la vitesse, entrez la limite et la vitesse mesurée : amende, frais, points et grand excès sont calculés.": "Search a section by number or keyword, copy it, open the official text. For speeding, enter the limit and the measured speed: fine, costs, points and excessive speeding are calculated.",
"Sécurité et confidentialité": "Security and privacy",
"Construite pour des données sensibles": "Built for sensitive data",
"Accès vérifié": "Verified access",
"Chaque demande d'accès est examinée par l'administrateur avant l'ouverture du compte. Le courriel doit être confirmé pour la carte et les lois.": "Every access request is reviewed by the administrator before the account opens. Your email must be confirmed for the map and laws.",
"Hébergé au Canada": "Hosted in Canada",
"Les comptes et les horaires sont hébergés à Montréal (région ca-central-1), chiffrés en transit et au repos.": "Accounts and schedules are hosted in Montréal (ca-central-1 region), encrypted in transit and at rest.",
"Corps de police séparés": "Police services kept separate",
"Chaque corps ne voit que son forum, ses idées et ses annonces. Le partage d'horaire entre corps se fait seulement si vous le choisissez.": "Each service sees only its own forum, ideas and announcements. Schedules are shared across services only if you choose to.",
"Consentement explicite conservé comme preuve, droits d'accès, de rectification, de suppression et de portabilité, aucune vente de données.": "Explicit consent kept as proof, rights of access, correction, deletion and portability, no sale of data.",
"Politique": "Policy",
"Gouvernance": "Governance",
"Publicité": "Advertising",
"Aucune": "None",
"Outils d'analyse": "Third-party analytics",
"Aucun": "None",
"Vente de données": "Sale of data",
"Jamais": "Never",
"Position GPS exacte transmise": "Exact GPS location sent",
"Corps de police": "Police services",
"Pensée pour la Sûreté du Québec, ouverte à tous les corps": "Designed for the Sûreté du Québec, open to every service",
"Postes MRC et autoroutiers, horaire hybride autoroutier et territoires de desserte de la SQ sont intégrés. Les corps de police municipaux et autochtones ont leur propre espace : territoire sur la carte, forum, idées et annonces.": "SQ MRC and highway stations, the hybrid highway schedule and SQ service areas are built in. Municipal and Indigenous police services have their own space: territory on the map, forum, ideas and announcements.",
"Demander l'accès pour mon corps": "Request access for my service",
"Membres de la Sûreté du Québec": "Sûreté du Québec members",
"Votre paie et votre contrat de travail, dans votre poche": "Your pay and collective agreement, in your pocket",
"Paie aux deux semaines estimée selon le contrat de travail, avec les primes, le temps supplémentaire, les impôts et vos retenues. Banques de vacances, de fériés et de temps en jours et en heures, comme SITHAR.": "Biweekly pay estimated from the collective agreement, with premiums, overtime, taxes and deductions. Vacation, holiday and time banks in days and hours, just like SITHAR.",
"IA Police Management : posez votre question comme à un collègue, elle cite mot pour mot les clauses du contrat, sans rien inventer": "Police Management AI: ask as you would a colleague, and it quotes the agreement's clauses word for word, without making anything up",
"Tous les congés du contrat (événements familiaux, parental, banque de temps) appliqués à votre horaire": "Every leave in the agreement (family events, parental, time bank) applied to your schedule",
"Rappels avant de perdre vos vacances ou vos fériés": "Reminders before you lose vacation or holidays",
"Nouveau · iPhone Duo": "New · iPhone Duo",
"S'adapte à l'iPhone Duo": "Adapts to the iPhone Duo",
"Dépliez-le : le calendrier, les lois et la carte profitent du grand écran de 7,6 po. Repliez-le : tout reste à portée de pouce sur l'écran de 5,4 po. En écran partagé, gardez Police Management ouverte à côté d'une autre app.": "Unfold it: the calendar, laws and map use the large 7.6-inch screen. Fold it: everything stays within thumb's reach on the 5.4-inch screen. In split screen, keep Police Management open next to another app.",
"Déplié, plié ou en écran partagé : l'interface s'ajuste d'elle-même": "Unfolded, folded or in split screen: the interface adjusts by itself",
"Le même compte sur l'iPhone, l'iPad, Android et l'ordinateur": "The same account on iPhone, iPad, Android and computer",
"Installation": "Installation",
"Une vraie app, sans magasin d'applications": "A real app, no app store needed",
"iPhone et iPad": "iPhone and iPad",
"Dans Safari, touchez Partager, puis « Sur l'écran d'accueil ».": "In Safari, tap Share, then “Add to Home Screen”.",
"Android": "Android",
"Dans Chrome, touchez le menu ⋮, puis « Installer l'application ».": "In Chrome, tap the ⋮ menu, then “Install app”.",
"Ordinateur": "Computer",
"Dans Chrome ou Edge, cliquez sur l'icône d'installation dans la barre d'adresse.": "In Chrome or Edge, click the install icon in the address bar.",
"Questions fréquentes": "Frequently asked questions",
"Avant de vous inscrire": "Before you sign up",
"Est-ce gratuit ?": "Is it free?",
"Oui. Police Management est gratuit, sans publicité et sans abonnement.": "Yes. Police Management is free, with no ads and no subscription.",
"Qui peut s'inscrire ?": "Who can sign up?",
"Les policières et policiers en fonction au Québec, de la Sûreté du Québec ou d'un corps municipal ou autochtone. Chaque demande est vérifiée par l'administrateur, et le courriel doit être confirmé.": "Serving police officers in Québec, from the Sûreté du Québec or a municipal or Indigenous police service. Every request is checked by the administrator, and your email must be confirmed.",
"Est-ce une application officielle de mon employeur ?": "Is this an official app from my employer?",
"Non. Police Management est un outil indépendant, créé par un policier, qui n'est affilié ni à la Sûreté du Québec ni à aucun corps de police. Les textes officiels et les directives de votre organisation prévalent toujours.": "No. Police Management is an independent tool, created by a police officer, not affiliated with the Sûreté du Québec or any police service. Official texts and your organization's directives always prevail.",
"Où vont mes données ?": "Where does my data go?",
"Les comptes et les horaires sont hébergés à Montréal, chiffrés en transit et au repos. Aucune donnée n'est vendue, aucun outil d'analyse ni de publicité. Votre position GPS exacte reste sur votre appareil (seule la météo, si vous la demandez, utilise une zone arrondie à environ 10 km). Tout est détaillé dans la": "Accounts and schedules are hosted in Montréal, encrypted in transit and at rest. No data is sold, and there are no third-party analytics or ads. Your exact GPS location stays on your device (only the weather, if you ask for it, uses an area rounded to about 10 km). Everything is explained in the",
"politique de confidentialité": "privacy policy",
", conforme à la Loi 25.": ", which complies with Law 25 (in French).",
"La messagerie est-elle chiffrée de bout en bout ?": "Is messaging end-to-end encrypted?",
"Non. Les messages sont chiffrés en transit et au repos, mais pas de bout en bout. N'y mettez jamais de renseignements opérationnels, d'enquête ou personnels sur des citoyens : la messagerie et le forum servent aux échanges courants entre collègues.": "No. Messages are encrypted in transit and at rest, but not end to end. Never put operational, investigative or personal information about citizens in them: messaging and the forum are for everyday conversations between colleagues.",
"Faut-il un iPhone ?": "Do I need an iPhone?",
"Non. Le site s'installe comme une app sur iPhone, Android et ordinateur, directement à partir du navigateur.": "No. The site installs as an app on iPhone, Android and computer, right from the browser.",
"Je peux supprimer mon compte ?": "Can I delete my account?",
"Oui, en tout temps dans Mon compte. Vos données sont alors effacées.": "Yes, at any time in My account. Your data is then erased.",
"Une question ?": "Questions?",
"Écrivez-nous ou rejoignez le Discord de soutien. Les membres approuvés peuvent aussi écrire directement à l'administrateur dans l'app.": "Email us or join the support Discord. Approved members can also message the administrator directly in the app.",
"Rejoindre le Discord": "Join the Discord",
"Faites connaître l'app à votre poste": "Spread the word at your station",
"Partagez le lien à un collègue ou imprimez l'affiche avec code QR pour le babillard.": "Share the link with a colleague or print the poster with a QR code for the bulletin board.",
"Partager le lien": "Share the link",
"Imprimer l'affiche": "Print the poster",
"Présentation en une page": "One-page overview",
"Politique de confidentialité": "Privacy policy (in French)",
"À propos": "About (in French)",
"Gouvernance des renseignements personnels": "Personal information governance (in French)",
"Outil indépendant de référence. Police Management n'est pas un produit officiel de la Sûreté du Québec ni d'un autre corps de police. Les textes officiels prévalent.": "Independent reference tool. Police Management is not an official product of the Sûreté du Québec or any other police service. Official texts prevail.",
"Sections du site": "Site sections",
"Vidéo de présentation de Police Management, sans son": "Police Management overview video, no sound",
"Lire la vidéo": "Play the video",
"Outils à essayer": "Tools to try",
"L'horaire du mois sur un iPhone, avec la rotation et les congés": "The month's schedule on an iPhone, with rotation and leave",
"La carte des territoires et des postes sur un iPhone": "The map of territories and stations on an iPhone",
"Le calculateur d'excès de vitesse sur un iPhone : amende, frais et points": "The speeding calculator on an iPhone: fine, costs and points",
"Recherche « cellulaire » dans le Code de la sécurité routière sur un iPhone": "Searching “cellulaire” in the Highway Safety Code on an iPhone",
"Le forum d'un corps de police sur un iPhone": "A police service's forum on an iPhone",
"Les banques de vacances en jours et en heures sur un iPhone": "Vacation banks in days and hours on an iPhone",
"L'IA Police Management cite la clause 23.03 du contrat de travail sur un iPhone": "Police Management AI quoting clause 23.03 of the collective agreement on an iPhone",
"Police Management sur l'iPhone Duo : l'horaire sur l'écran déplié et l'accueil sur l'écran plié": "Police Management on the iPhone Duo: the schedule on the unfolded screen and the home screen on the folded one",
"Code QR vers policemanagement.ca": "QR code to policemanagement.ca",
"Liens utiles": "Useful links",
"‹ Retour au site": "‹ Back to the site",
"Accès réservé au personnel policier et aux agents de la paix": "Access limited to police personnel and peace officers",
"Connexion": "Sign in",
"Demande d'accès": "Request access",
"Courriel": "Email",
"Mot de passe": "Password",
"Mot de passe oublié": "Forgot password",
"Remplissez la demande. L'administrateur vérifie chaque demande avant d'ouvrir l'accès.": "Fill out the request. The administrator checks every request before granting access.",
"Nom complet": "Full name",
"Grade": "Rank",
"Choisir…": "Choose…",
"Agent": "Constable",
"Sergent": "Sergeant",
"Sergent-enquêteur": "Detective sergeant",
"Sergent-détective": "Detective sergeant",
"Lieutenant": "Lieutenant",
"Lieutenant-détective": "Detective lieutenant",
"Capitaine": "Captain",
"Commandant": "Commander",
"Inspecteur": "Inspector",
"Inspecteur-chef": "Chief inspector",
"Directeur adjoint": "Deputy director",
"Directeur": "Director",
"Gendarme": "Constable (RCMP)",
"Caporal": "Corporal",
"Sergent d'état-major": "Staff sergeant",
"Surintendant": "Superintendent",
"Constable spécial": "Special constable",
"Contrôleur routier": "Highway controller",
"Agent des services correctionnels": "Correctional officer",
"Agent de libération conditionnelle": "Parole officer",
"Agent de probation": "Probation officer",
"Agent des services frontaliers": "Border services officer",
"Agent de protection de la faune": "Wildlife protection officer",
"Policier militaire": "Military police officer",
"Enquêteur": "Investigator",
"Policier temporaire": "Temporary officer",
"Agent auxiliaire": "Auxiliary officer",
"Cadet": "Cadet",
"Personnel civil": "Civilian staff",
"Autre": "Other",
"Matricule": "Badge number",
"Unité / poste": "Unit / station",
"Choisir le corps d'abord": "Choose the service first",
"Précisez l'unité ou le poste": "Specify the unit or station",
"Corps de police ou organisation": "Police service or organization",
"Autre corps de police municipal": "Other municipal police service",
"Corps de police autochtone": "Indigenous police service",
"Gendarmerie royale du Canada (GRC)": "Royal Canadian Mounted Police (RCMP)",
"Agence des services frontaliers du Canada (ASFC)": "Canada Border Services Agency (CBSA)",
"Service correctionnel du Canada": "Correctional Service Canada",
"Police militaire des Forces armées canadiennes": "Canadian Armed Forces Military Police",
"Constables spéciaux — Sécurité publique Québec": "Special constables — Québec Public Security",
"Services correctionnels du Québec": "Québec Correctional Services",
"Protection de la faune du Québec": "Québec Wildlife Protection",
"Bureau des enquêtes indépendantes (BEI)": "Bureau des enquêtes indépendantes (BEI)",
"Unité permanente anticorruption (UPAC)": "Anti-Corruption Unit (UPAC)",
"Constables spéciaux — transport et municipal": "Special constables — transit and municipal",
"Contrôle routier Québec": "Contrôle routier Québec",
"Courriel professionnel": "Work email",
"Mot de passe (10 caractères minimum)": "Password (at least 10 characters)",
"Facultatif : partager ma rotation avec les membres approuvés de mon poste (sans mes notes ni mes congés). Modifiable en tout temps dans Réglages › Confidentialité.": "Optional: share my rotation with approved members of my station (without my notes or leave). You can change this at any time in Settings › Privacy.",
"J'ai lu et j'accepte la": "I have read and accept the",
". Je confirme avoir 18 ans ou plus et je comprends que je ne dois inscrire aucune information confidentielle ni aucune donnée sur des citoyens.": ". I confirm I am 18 or older and I understand I must not enter any confidential information or any data about citizens.",
"Envoyer la demande": "Send request",
"Renvoyer le courriel de confirmation": "Resend the confirmation email",
"Comment installer l'app sur mon téléphone ou mon ordinateur": "How to install the app on my phone or computer",
"Outil indépendant de référence. Il ne remplace pas les textes officiels.": "Independent reference tool. It does not replace official texts.",
"Logo Police Management": "Police Management logo",
"Accueil": "Home",
"Poste": "Station",
"Admin": "Admin",
"Mode nuit rouge": "Red night mode",
"Mon compte": "My account",
"Convention collective": "Collective agreement",
"DÉMO": "DEMO",
"Forum": "Forum",
"Idées": "Ideas",
"Territoires": "Territories",
"Administration": "Administration",
"Bien-être et soutien": "Wellness and support",
"App (installer)": "App (install)",
"Se déconnecter": "Sign out",
"Messages": "Messages",
"Réglages": "Settings",
"Agents de la paix et autres organisations": "Peace officers and other organizations",
"Agents de la paix": "Peace officers",
"Autres statuts": "Other statuses",
"Grades GRC": "RCMP ranks",
"Grades policiers": "Police ranks",
"Corps de police municipaux": "Municipal police services",
"Langue": "Language"
};
  const ZONES = ["#ecran-site", "#ecran-auth", "nav.nav", "section.menu-feuille", "#btn-messages-haut", "#rg-langue-bloc"];
  const ATTRS = ["placeholder", "aria-label", "title", "alt", "label"];
  let langue = "fr";
  try { langue = localStorage.getItem("pm-langue") === "en" ? "en" : "fr"; } catch (e) { /* facultatif */ }
  const cle = (t) => t.replace(/\s+/g, " ").trim();
  let occupe = false;
  function traduireNoeud(racine) {
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const noeuds = []; let n;
    while ((n = marcheur.nextNode())) noeuds.push(n);
    for (const t of noeuds) {
      if (t.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(t.parentNode.nodeName)) continue;
      const fr = t.__fr !== undefined ? t.__fr : t.nodeValue;
      const k = cle(fr);
      if (!k) continue;
      if (langue === "en" && EN[k]) {
        if (t.__fr === undefined) t.__fr = t.nodeValue;
        const p = t.parentNode;
        // Une option sans valeur garde sa valeur française (ce qui est enregistré ne change pas)
        if (p && p.nodeName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", k);
        const deb = (fr.match(/^\s*/) || [""])[0], fin = (fr.match(/\s*$/) || [""])[0];
        const nv = deb + EN[k] + fin; if (t.nodeValue !== nv) t.nodeValue = nv;
      } else if (langue === "fr" && t.__fr !== undefined) {
        if (t.nodeValue !== t.__fr) t.nodeValue = t.__fr; delete t.__fr;
      }
    }
    const els = racine.nodeType === 1 ? [racine, ...racine.querySelectorAll("*")] : [];
    for (const el of els) for (const a of ATTRS) {
      const sauve = el.getAttribute("data-fr-" + a);
      const fr = sauve !== null ? sauve : el.getAttribute(a);
      if (!fr) continue;
      const k = cle(fr);
      if (langue === "en" && EN[k]) { if (sauve === null) el.setAttribute("data-fr-" + a, fr); if (el.getAttribute(a) !== EN[k]) el.setAttribute(a, EN[k]); }
      else if (langue === "fr" && sauve !== null) { el.setAttribute(a, sauve); el.removeAttribute("data-fr-" + a); }
    }
  }
  function appliquer() {
    occupe = true;
    document.documentElement.lang = langue === "en" ? "en-CA" : "fr-CA";
    for (const s of ZONES) document.querySelectorAll(s).forEach(traduireNoeud);
    document.querySelectorAll("[data-langue]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.langue === langue)));
    const sel = document.getElementById("rg-langue"); if (sel) sel.value = langue;
    obs.takeRecords();
    occupe = false;
  }
  // Contenu ajouté plus tard dans ces zones (démos, messages) : traduit s'il est connu
  const obs = new MutationObserver((muts) => {
    if (occupe || langue !== "en") return;
    occupe = true;
    for (const m of muts) {
      if (m.type === "characterData") { const t = m.target; if (t.__fr === undefined || cle(t.nodeValue) !== cle(EN[cle(t.__fr)] || "")) { delete t.__fr; } traduireNoeud(t.parentNode || t); }
      else m.addedNodes.forEach((x) => { if (x.nodeType === 1) traduireNoeud(x); else if (x.nodeType === 3 && x.parentNode) traduireNoeud(x.parentNode); });
    }
    obs.takeRecords();
    occupe = false;
  });
  function choisir(l) {
    langue = l === "en" ? "en" : "fr";
    try { localStorage.setItem("pm-langue", langue); } catch (e) { /* facultatif */ }
    appliquer();
  }
  window.pmLangue = { choisir, appliquer, actuelle: () => langue };
  function demarrer() {
    for (const s of ZONES) document.querySelectorAll(s).forEach((z) => obs.observe(z, { childList: true, subtree: true, characterData: true }));
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-langue]"); if (b) { e.preventDefault(); choisir(b.dataset.langue); } });
    document.addEventListener("change", (e) => { if (e.target && e.target.id === "rg-langue") choisir(e.target.value); });
    appliquer();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
