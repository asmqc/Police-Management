/* Police Management — application principale */
(() => {
  "use strict";

  const C = window.PE_CONFIG;
  // Ouvert dans l'app iPhone/iPad (WKWebView) : l'app ajoute « PoliceManagementApp » à l'identifiant du navigateur
  const estAppIOS = /PoliceManagementApp/.test(navigator.userAgent);
  // App ajoutée à l'écran d'accueil de l'iPhone : iOS donne au site une hauteur trop courte (il manque la hauteur de la barre d'état),
  // ce qui laissait une bande vide sous les onglets. On prend la hauteur réelle de l'écran pour que l'app aille jusqu'en bas.
  if (navigator.standalone && /iPhone|iPod/.test(navigator.userAgent)) {
    document.documentElement.classList.add("ios-pwa");
    const majHauteurEcran = () => {
      const paysage = matchMedia("(orientation: landscape)").matches;
      const h = paysage ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      document.documentElement.style.setProperty("--app-h", Math.max(h, window.innerHeight) + "px");
    };
    majHauteurEcran();
    addEventListener("resize", majHauteurEcran);
    addEventListener("orientationchange", () => setTimeout(majHauteurEcran, 350));
  }
  if (estAppIOS) document.documentElement.classList.add("app-ios");
  // Lien « point partagé » : #carte@46.81234,-71.21234
  { const m = (location.hash || "").match(/^#carte@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/); if (m) { try { sessionStorage.setItem("pm-point", JSON.stringify([+m[1], +m[2]])); } catch { /* facultatif */ } } }
  const pointPartageEnAttente = () => { try { return JSON.parse(sessionStorage.getItem("pm-point") || "null"); } catch { return null; } };
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`\-–—]/g, " ").replace(/\s+/g, " ").trim();
  const LEGIS = "https://www.legisquebec.gouv.qc.ca/fr/document/lc/C-24.2";

  const etat = { session: null, profil: null, vue: "csr", csr: null, corps: [], donnees: {}, carte: null };

  // Thème clair / sombre / automatique, mémorisé sur cet appareil
  function appliquerTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    const sombre = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", sombre ? "#0A1420" : "#0E1B2C");
  }
  // Styles d'interface (repris de l'app iOS)
  const STYLES = [
    { id: "moderne", nom: "Moderne", desc: "Clair ou sombre", c: ["#0E1B2C", "#F2B33D", "#EFF2F7"] },
    { id: "mdt", nom: "Terminal MDT", desc: "Noir, vert, chasse fixe", c: ["#000000", "#33FF66", "#0A140C"] },
    { id: "officiel", nom: "Terminal officiel", desc: "Noir et or", c: ["#0B0B0B", "#D4AF37", "#171512"] },
    { id: "marine", nom: "Marine", desc: "Bleu marine, accents cyan", c: ["#071A33", "#4FC3F7", "#0E2747"] },
    { id: "epure", nom: "Épuré clair", desc: "Sable et blanc", c: ["#3B2F24", "#B07A3C", "#F4EFE6"] },
    { id: "poste", nom: "Poste de police", desc: "Logiciel de poste rétro", c: ["#0A246A", "#3A6EA5", "#ECE9D8"] },
  ];
  let styleChoisi = "moderne";
  try { styleChoisi = localStorage.getItem("pm-style") || "moderne"; } catch { /* stockage indisponible */ }
  function appliquerStyle(id) {
    const st = STYLES.find((x) => x.id === id) || STYLES[0];
    if (st.id === "moderne") document.documentElement.removeAttribute("data-style");
    else document.documentElement.setAttribute("data-style", st.id);
    if (st.id !== "moderne") { const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", st.c[0]); }
  }
  appliquerStyle(styleChoisi);
  let themeChoisi = "auto";
  try { themeChoisi = localStorage.getItem("pm-theme") || "auto"; } catch { /* stockage indisponible */ }
  appliquerTheme(themeChoisi);
  if (styleChoisi !== "moderne") appliquerStyle(styleChoisi);
  function rendreStyles() {
    const el = document.getElementById("styles-choix");
    el.innerHTML = STYLES.map((st) => `<button type="button" role="radio" data-style-choix="${st.id}" aria-checked="${st.id === styleChoisi}">
      <span class="style-apercu" style="--a:${st.c[0]};--b:${st.c[1]};--c:${st.c[2]}"><i></i><i></i><i></i></span><b>${st.nom}</b><small>${st.desc}</small></button>`).join("");
    el.querySelectorAll("[data-style-choix]").forEach((b) => b.addEventListener("click", () => {
      styleChoisi = b.dataset.styleChoix;
      try { localStorage.setItem("pm-style", styleChoisi); } catch { /* stockage indisponible */ }
      appliquerStyle(styleChoisi); appliquerTheme(themeChoisi); if (styleChoisi !== "moderne") appliquerStyle(styleChoisi);
      rendreStyles();
    }));
    document.querySelector(".segmente-theme").classList.toggle("inactif", styleChoisi !== "moderne");
  }
  function majChoixTheme() { document.querySelectorAll("[data-theme-choix]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeChoix === themeChoisi))); }
  document.querySelectorAll("[data-theme-choix]").forEach((b) => b.addEventListener("click", () => {
    themeChoisi = b.dataset.themeChoix;
    try { localStorage.setItem("pm-theme", themeChoisi); } catch { /* stockage indisponible */ }
    appliquerTheme(themeChoisi);
    majChoixTheme();
  }));

  // Pas de zoom (pincement ou double toucher) ailleurs que sur la carte
  const surCarte = (e) => e.target && e.target.closest && e.target.closest("#carte");
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => { if (!surCarte(e)) e.preventDefault(); }, { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 && !surCarte(e)) e.preventDefault(); }, { passive: false });
  let dernierToucher = 0;
  document.addEventListener("touchend", (e) => {
    const t = Date.now();
    // Les boutons et champs gardent les touchers rapides (ex. changer plusieurs cases d'horaire) : seul le zoom est bloqué
    if (t - dernierToucher < 320 && !surCarte(e) && !(e.target.closest && e.target.closest("button, a, input, textarea, select, label, summary"))) e.preventDefault();
    dernierToucher = t;
  }, { passive: false });
  document.addEventListener("dblclick", (e) => { if (!surCarte(e)) e.preventDefault(); }, { passive: false });

  /* ---------------- Utilitaires d'interface ---------------- */
  let toastMinuteur;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastMinuteur);
    toastMinuteur = setTimeout(() => (t.hidden = true), 3200);
  }
  function montrer(ecran) {
    ["#ecran-chargement", "#ecran-site", "#ecran-auth", "#ecran-attente", "#ecran-mdp-temp", "#ecran-app"].forEach((id) => ($(id).hidden = id !== ecran));
    document.body.classList.toggle("mode-site", ecran === "#ecran-site");
  }
  // Site officiel : affiché aux visiteurs non connectés; « Se connecter » et « Demander l'accès » ouvrent l'écran d'authentification
  function montrerAccueilPublic() {
    const h = (location.hash || "").replace("#", "");
    if (etat.forcerAuth) { montrer("#ecran-auth"); return; }
    if (h === "connexion" || h === "demande") { montrer("#ecran-auth"); ongletAuth(h); return; }
    // App installée sur l'écran d'accueil : directement à la connexion
    if (estAppIOS || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) { montrer("#ecran-auth"); ongletAuth("connexion"); return; }
    montrer("#ecran-site");
  }
  function ouvrirAuth(onglet) {
    montrer("#ecran-auth"); ongletAuth(onglet);
    history.replaceState(null, "", "#" + onglet);
    window.scrollTo(0, 0);
    setTimeout(() => (onglet === "connexion" ? $("#cx-courriel") : $("#dm-nom")).focus(), 100);
  }
  document.querySelectorAll("[data-site-auth]").forEach((b) => b.addEventListener("click", () => ouvrirAuth(b.dataset.siteAuth)));
  document.getElementById("auth-retour").addEventListener("click", () => { history.replaceState(null, "", location.pathname); montrer("#ecran-site"); window.scrollTo(0, 0); });
  document.querySelectorAll("[data-site-lien]").forEach((a) => a.addEventListener("click", (e) => {
    const cible = document.querySelector(a.getAttribute("href"));
    if (!cible) return;
    e.preventDefault();
    cible.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  function messageAuth(texte, type = "") {
    const m = $("#auth-message");
    m.textContent = texte;
    m.className = "message " + type;
    m.hidden = !texte;
  }
  function traduireErreur(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Courriel ou mot de passe incorrect.";
    if (/banned/i.test(m)) return "Ce compte est bloqué. Communiquez avec l'administrateur.";
    if (/should be different/i.test(m)) return "Le nouveau mot de passe doit être différent de l'ancien.";
    if (/Email not confirmed/i.test(m)) return "Votre courriel n'est pas encore confirmé. Ouvrez le lien reçu par courriel, ou touchez « Renvoyer » ci-dessous. L'approbation de l'administrateur confirme aussi votre courriel.";
    if (/security purposes|rate limit/i.test(m)) return "Trop de demandes. Patientez une minute, puis réessayez.";
    if (/already registered|already been registered/i.test(m)) return "Ce courriel a déjà une demande. Utilisez « Connexion » ou « Mot de passe oublié ».";
    if (/Password should be at least/i.test(m)) return "Le mot de passe doit contenir au moins 10 caractères.";
    if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Attendez quelques minutes, puis réessayez.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Pas de connexion Internet. Vérifiez le réseau, puis réessayez.";
    return m;
  }
  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); toast("Copié"); }
    catch { toast("Copie impossible sur cet appareil"); }
  }

  /* ---------------- Authentification ---------------- */
  function ongletAuth(nom) {
    $$(".onglets-auth button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.auth === nom)));
    $("#form-connexion").hidden = nom !== "connexion";
    $("#form-demande").hidden = nom !== "demande";
    messageAuth("");
  }
  $$(".onglets-auth button").forEach((b) => b.addEventListener("click", () => ongletAuth(b.dataset.auth)));

  const urlRetour = () => location.origin + location.pathname;

  $("#form-connexion").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter || $("#form-connexion .btn-principal");
    btn.disabled = true;
    messageAuth("");
    const { error } = await sb.auth.signInWithPassword({
      email: $("#cx-courriel").value.trim().toLowerCase(),
      password: $("#cx-mdp").value,
    });
    btn.disabled = false;
    if (error) messageAuth(traduireErreur(error), "erreur");
    $("#btn-renvoyer").hidden = !(error && /Email not confirmed/i.test(error.message || ""));
  });

  // Lien de confirmation expiré ou perdu : on en renvoie un nouveau (l'approbation de l'administrateur confirme aussi le courriel)
  $("#btn-renvoyer").addEventListener("click", async (ev) => {
    const courriel = $("#cx-courriel").value.trim().toLowerCase();
    if (!courriel) return messageAuth("Écrivez votre courriel dans le champ ci-dessus, puis appuyez de nouveau sur « Renvoyer ».", "erreur");
    ev.currentTarget.disabled = true;
    const { error } = await sb.auth.resend({ type: "signup", email: courriel, options: { emailRedirectTo: urlRetour() } });
    ev.currentTarget.disabled = false;
    if (error) return messageAuth(traduireErreur(error), "erreur");
    $("#btn-renvoyer").hidden = true;
    messageAuth("Nouveau courriel de confirmation envoyé. Vérifiez aussi vos courriels indésirables. Si vous ne le recevez pas, votre accès s'ouvrira quand même dès que l'administrateur aura approuvé votre demande.", "ok");
  });

  // Retour d'un lien expiré (Supabase ajoute #error_code=otp_expired à l'adresse)
  {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    if (h.get("error_code") === "otp_expired" || h.get("error")) {
      history.replaceState(null, "", location.pathname + location.search);
      etat.forcerAuth = true;
      setTimeout(() => {
        montrer("#ecran-auth"); ongletAuth("connexion");
        messageAuth("Ce lien de confirmation a expiré. Écrivez votre courriel ci-dessus et touchez « Renvoyer le courriel de confirmation ». Votre accès s'ouvrira aussi dès que l'administrateur aura approuvé votre demande.", "erreur");
        $("#btn-renvoyer").hidden = false;
      }, 0);
    }
  }

  $("#btn-oubli").addEventListener("click", async () => {
    const courriel = $("#cx-courriel").value.trim().toLowerCase();
    if (!courriel) return messageAuth("Écrivez votre courriel dans le champ ci-dessus, puis appuyez de nouveau sur « Mot de passe oublié ».", "erreur");
    const { error } = await sb.auth.resetPasswordForEmail(courriel, { redirectTo: urlRetour() });
    if (error) return messageAuth(traduireErreur(error), "erreur");
    messageAuth("Si ce courriel a un compte, un lien pour choisir un nouveau mot de passe vient d'y être envoyé.", "ok");
  });

  $("#form-demande").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const champs = { nom: $("#dm-nom"), grade: $("#dm-grade"), matricule: $("#dm-matricule"), corps: $("#dm-corps"), courriel: $("#dm-courriel"), mdp: $("#dm-mdp") };
    if ($("#dm-corps").value && !$("#dm-poste").value) { $("#dm-poste").focus(); return messageAuth("Choisissez votre unité ou votre poste dans la liste.", "erreur"); }
    if ($("#dm-poste").value === AUTRE && !$("#dm-unite").value.trim()) { $("#dm-unite").focus(); return messageAuth("Précisez votre unité ou votre poste.", "erreur"); }
    for (const [k, el] of Object.entries(champs)) {
      if (!el.value.trim()) { el.focus(); return messageAuth("Remplissez tous les champs obligatoires.", "erreur"); }
      if (k === "courriel" && !el.checkValidity()) { el.focus(); return messageAuth("Le courriel n'est pas valide.", "erreur"); }
    }
    if (champs.mdp.value.length < 10) { champs.mdp.focus(); return messageAuth("Le mot de passe doit contenir au moins 10 caractères.", "erreur"); }
    if (!$("#dm-consent").checked) { $("#dm-consent").focus(); return messageAuth("Pour envoyer la demande, acceptez la politique de confidentialité.", "erreur"); }
    const btn = $("#form-demande .btn-principal");
    btn.disabled = true;
    const { data, error } = await sb.auth.signUp({
      email: champs.courriel.value.trim().toLowerCase(),
      password: champs.mdp.value,
      options: {
        emailRedirectTo: urlRetour(),
        data: {
          nom_complet: champs.nom.value.trim(),
          matricule: champs.matricule.value.trim(),
          grade: champs.grade.value,
          corps_police: champs.corps.value,
          unite: uniteChoisie(),
          consentement_version: VERSION_POLITIQUE,
        },
      },
    });
    btn.disabled = false;
    if (error) return messageAuth(traduireErreur(error), "erreur");
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return messageAuth("Ce courriel a déjà une demande. Utilisez « Connexion ».", "erreur");
    }
    $("#form-demande").reset();
    majChampPoste();
    ongletAuth("connexion");
    messageAuth(
      data.session
        ? "Demande envoyée. L'administrateur doit maintenant l'approuver."
        : "Demande envoyée. Ouvrez le courriel de confirmation que vous venez de recevoir, puis connectez-vous. L'accès s'ouvrira dès que l'administrateur aura approuvé votre demande.",
      "ok"
    );
  });

  /* Menu « Unité / poste » du formulaire d'inscription, selon le corps de police choisi */
  const SQ = "Sûreté du Québec";
  const UNITES_MUNICIPALES = ["Patrouille", "Enquêtes", "Sécurité routière", "Groupe d'intervention", "Soutien opérationnel"];
  const AUTRE = "__autre";
  let listeCorps = null, groupesSQ = null;

  async function corpsParType(type) {
    if (!listeCorps) {
      try { listeCorps = await charger("corps_police.json"); } catch { listeCorps = []; }
    }
    return listeCorps.filter((c) => c.type === type).map((c) => c.nom).sort((x, y) => x.localeCompare(y, "fr"));
  }

  // Unités spécialisées : noms généraux (la liste officielle détaillée n'est pas publiée en données ouvertes)
  const UNITES_SPECIALISEES_SQ = [
    "Centre de gestion des appels", "Crimes majeurs", "Crimes contre la personne", "Crime organisé", "Crimes économiques et produits de la criminalité",
    "Cybercriminalité", "Exploitation sexuelle des enfants sur Internet", "Renseignement criminel", "Surveillance", "Identité judiciaire",
    "Groupe tactique d'intervention", "Unité d'urgence", "Escouade canine", "Patrouille nautique", "Service aérien",
    "Sécurité routière et contrôle autoroutier", "Enquêtes sur les collisions (reconstitution)", "Protection de personnalités",
    "Normes professionnelles", "Formation", "Soutien administratif",
  ];
  // Agents de la paix et autres organisations : unités proposées à l'inscription (même liste dans l'app iPhone/iPad)
  const ORGANISATIONS = {
    "Gendarmerie royale du Canada (GRC)": ["Quartier général de la Division C (Montréal)", "Détachement", "Police fédérale — crimes graves et crime organisé", "Police fédérale — crimes financiers", "Intégrité des frontières", "Sécurité nationale", "Protection de personnalités", "Renseignement criminel", "Soutien opérationnel"],
    "Agence des services frontaliers du Canada (ASFC)": ["Point d'entrée terrestre", "Aéroport", "Port maritime", "Courrier et fret", "Exécution de la loi et renseignement", "Enquêtes criminelles", "Détention de l'immigration"],
    "Service correctionnel du Canada": ["Établissement à sécurité maximale", "Établissement à sécurité moyenne", "Établissement à sécurité minimale", "Établissement à niveaux de sécurité multiples", "Centre régional de réception", "Centre correctionnel communautaire", "Libérations conditionnelles"],
    "Police militaire des Forces armées canadiennes": ["Police militaire d'une base ou d'une escadre", "Service national des enquêtes des Forces canadiennes", "Groupe de la Police militaire des Forces canadiennes"],
    "Constables spéciaux — Sécurité publique Québec": ["Palais de justice", "Assemblée nationale", "Édifices gouvernementaux", "Transport de détenus"],
    "Services correctionnels du Québec": ["Établissement de détention de Montréal (Bordeaux)", "Établissement de détention de Rivière-des-Prairies", "Établissement Leclerc de Laval", "Établissement de détention de Québec", "Établissement de détention de Trois-Rivières", "Établissement de détention de Sherbrooke", "Établissement de détention de Hull", "Établissement de détention de Saint-Jérôme", "Établissement de détention de Sorel-Tracy", "Établissement de détention de Rimouski", "Établissement de détention de Roberval", "Établissement de détention d'Amos", "Établissement de détention de Baie-Comeau", "Établissement de détention de Sept-Îles", "Établissement de détention de New Carlisle", "Établissement de détention de Percé", "Établissement de détention de Havre-Aubert", "Services correctionnels dans la communauté (probation)"],
    "Protection de la faune du Québec": ["Bureau régional de protection de la faune", "Unité spécialisée", "Formation"],
    "Bureau des enquêtes indépendantes (BEI)": ["Enquêtes", "Direction"],
    "Unité permanente anticorruption (UPAC)": ["Enquêtes", "Vérification", "Prévention"],
    "Constables spéciaux — transport et municipal": ["Société de transport de Montréal (STM)", "Réseau de transport de la Capitale (RTC)", "Société de transport de Laval (STL)", "Réseau de transport de Longueuil (RTL)", "exo", "Sécurité municipale (ville)"],
    "Contrôle routier Québec": ["Contrôle sur route", "Poste de contrôle routier", "Enquêtes"],
  };
  const nomBureau = (n) => n.replace(/\s+/g, " ").trim()
    .replace(/^Bureau du /, "").replace(/^Bureau des /, "").replace(/^Bureau de l'/, "").replace(/^Bureau de la /, "")
    .replace(/^./, (c) => c.toUpperCase());

  async function postesSQ() {
    if (groupesSQ) return groupesSQ;
    const [bureaux, postes] = await Promise.all([charger("sq_bureaux.geojson"), charger("sq_postes.geojson")]);
    const qg = new Set(), autoroutiers = new Set(), centres = new Set(), parRegion = {};
    const ajout = (reg, nom) => (parRegion[reg] ||= new Set()).add(nom);
    for (const f of bureaux.features) {
      const p = f.properties, nom = nomBureau(p.NOM_ENT || "");
      if (!nom) continue;
      if (["Grand quartier général", "District", "Région"].includes(p.CAT_UNIT)) qg.add(nom);
      else if (p.CAT_UNIT === "Poste autoroutier") autoroutiers.add(nom);
      else ajout(p.NOM_REG && p.NOM_REG !== "s.o." ? p.NOM_REG : "Autres postes", nom);
    }
    for (const f of postes.features) {
      const p = f.properties;
      if (p.NOM_CS && p.NOM_CS !== "s.o.") centres.add(p.NOM_CS.replace(/\s+/g, " ").trim());
      if (p.NOM_REG && p.NOM_REG !== "s.o." && ![...(parRegion[p.NOM_REG] || [])].some((n) => n.includes(p.NOM_UNIT.replace(/^Poste /, "")))) ajout(p.NOM_REG, p.NOM_UNIT);
    }
    const tri = (set) => [...set].sort((a, b) => a.localeCompare(b, "fr"));
    const ordreQG = (n) => (/^Grand/.test(n) ? 0 : /district/i.test(n) ? 1 : 2);
    groupesSQ = [["Quartiers généraux", [...qg].sort((a, b) => ordreQG(a) - ordreQG(b) || a.localeCompare(b, "fr"))]];
    Object.keys(parRegion).sort((a, b) => (a === "Autres postes") - (b === "Autres postes") || a.localeCompare(b, "fr"))
      .forEach((r) => groupesSQ.push(["Postes — " + r, tri(parRegion[r])]));
    groupesSQ.push(["Postes autoroutiers", tri(autoroutiers)]);
    groupesSQ.push(["Centres de services MRC", tri(centres)]);
    groupesSQ.push(["Unités spécialisées", [...UNITES_SPECIALISEES_SQ].sort((a, b) => a.localeCompare(b, "fr"))]);
    return groupesSQ;
  }
  const opt = (v) => `<option>${esc(v)}</option>`;
  const optAutre = `<option value="${AUTRE}">Autre (préciser)</option>`;

  // p = préfixe du formulaire : "dm" (demande d'accès) ou "mc" (mon compte)
  async function majChampPoste(p = "dm") {
    const corps = $(`#${p}-corps`).value;
    const sel = $(`#${p}-poste`);
    let html = "";
    try {
      if (!corps) html = "";
      else if (corps === SQ) {
        html = (await postesSQ()).map(([r, us]) => `<optgroup label="${esc(r)}">${us.map(opt).join("")}</optgroup>`).join("") +
          `<optgroup label="Autre">${optAutre}</optgroup>`;
      } else if (corps === "Autre corps de police municipal") {
        const noms = (await corpsParType("municipal")).filter((n) => ![...$(`#${p}-corps`).options].some((o) => o.value === n));
        html = noms.map(opt).join("") + optAutre;
      } else if (corps === "Corps de police autochtone") {
        html = (await corpsParType("autochtone")).map(opt).join("") + optAutre;
      } else if (ORGANISATIONS[corps]) {
        html = ORGANISATIONS[corps].map(opt).join("") + optAutre;
      } else if (corps === "Autre") {
        html = optAutre;
      } else {
        html = UNITES_MUNICIPALES.map(opt).join("") + optAutre;
      }
    } catch { html = optAutre; }
    const titre = !corps ? "Choisir le corps d'abord"
      : corps === "Autre corps de police municipal" ? "Choisir le service…"
      : corps === "Corps de police autochtone" ? "Choisir le corps…" : "Choisir…";
    sel.innerHTML = `<option value="">${titre}</option>` + html;
    sel.disabled = !corps;
    if (html === optAutre) sel.value = AUTRE;
    majChampAutre(p);
  }
  function majChampAutre(p = "dm") {
    $(`#${p}-bloc-unite`).hidden = $(`#${p}-poste`).value !== AUTRE;
  }
  function uniteChoisie(p = "dm") {
    const v = $(`#${p}-poste`).value;
    return v === AUTRE ? $(`#${p}-unite`).value.trim() : v;
  }
  for (const p of ["dm", "mc"]) {
    $(`#${p}-corps`).addEventListener("change", () => majChampPoste(p));
    $(`#${p}-poste`).addEventListener("change", () => majChampAutre(p));
  }

  function formNouveauMdp() {
    montrer("#ecran-auth");
    ongletAuth("connexion");
    $("#form-connexion").hidden = true;
    let f = $("#form-mdp");
    if (!f) {
      f = document.createElement("form");
      f.id = "form-mdp";
      f.className = "formulaire";
      f.innerHTML = `<label for="nv-mdp">Nouveau mot de passe (10 caractères minimum)</label>
        <input id="nv-mdp" type="password" autocomplete="new-password" minlength="10" required>
        <button class="btn-principal" type="submit">Enregistrer le mot de passe</button>`;
      $("#form-connexion").after(f);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const v = $("#nv-mdp").value;
        if (v.length < 10) return messageAuth("Le mot de passe doit contenir au moins 10 caractères.", "erreur");
        const { error } = await sb.auth.updateUser({ password: v });
        if (error) return messageAuth(traduireErreur(error), "erreur");
        f.remove();
        toast("Mot de passe enregistré");
        demarrer();
      });
    }
    messageAuth("Choisissez votre nouveau mot de passe.", "");
  }

  $$("[data-action='deconnexion']").forEach((b) =>
    b.addEventListener("click", async () => {
      await sb.auth.signOut();
      location.hash = "";
      location.reload();
    })
  );
  $("#btn-reverifier").addEventListener("click", () => demarrer(true));

  /* ---------------- Démarrage ---------------- */
  async function chargerProfil() {
    const { data, error } = await sb.from("profiles").select("*").eq("id", etat.session.user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function demarrer(manuel = false) {
    const { data } = await sb.auth.getSession();
    etat.session = data.session;
    if (!etat.session) { montrerAccueilPublic(); return; }
    try {
      etat.profil = await chargerProfil();
    } catch (e) {
      montrer("#ecran-auth");
      messageAuth(traduireErreur(e), "erreur");
      return;
    }
    await verifierCourriel(); // lien du courriel ouvert : compte marqué confirmé, même en attente d'approbation
    const p = etat.profil;
    if (!p || p.statut !== "approuve") {
      const st = p ? p.statut : "en_attente";
      $("#attente-titre").textContent = { refuse: "Demande refusée", bloque: "Compte bloqué" }[st] || "Demande en attente";
      $("#attente-texte").textContent = {
        refuse: "Votre demande d'accès n'a pas été acceptée. Communiquez avec l'administrateur si vous croyez qu'il s'agit d'une erreur.",
        bloque: "L'accès à ce compte a été bloqué par l'administrateur.",
      }[st] || "Votre demande a été reçue. Vous aurez accès dès que l'administrateur l'aura approuvée.";
      $("#attente-details").innerHTML = p
        ? `<dt>Nom</dt><dd>${esc(p.nom_complet || "—")}</dd><dt>Courriel</dt><dd>${esc(p.email)}</dd><dt>Grade</dt><dd>${esc(p.grade || "—")}</dd><dt>Matricule</dt><dd>${esc(p.matricule || "—")}</dd><dt>Corps</dt><dd>${esc(p.corps_police || "—")}</dd>`
        : "";
      montrer("#ecran-attente");
      if (manuel) toast(p && p.statut === "refuse" ? "Demande refusée" : "Toujours en attente");
      return;
    }
    if (p.doit_changer_mdp) { montrer("#ecran-mdp-temp"); $("#mt-mdp").focus(); return; }
    majBarreCompte();
    $("#menu-admin").hidden = p.role !== "admin";
    $("#nav-admin").hidden = p.role !== "admin";
    if (p.role === "admin") { document.body.classList.add("est-admin"); comptesApprouves().then(() => remplirCorpsAdmin()); }
    montrer("#ecran-app");
    if (p.consentement_version !== VERSION_POLITIQUE) $("#consent-voile").hidden = false;
    chargerAvertissement().finally(afficherAvertissement);
    let depart = (location.hash || "").replace("#", "");
    if (depart.startsWith("carte@") || pointPartageEnAttente()) depart = "carte";
    document.body.classList.toggle("est-sq", accesConvention());
    afficherVue(["accueil", "csr", "carte", "corps", "horaire", "messages", "compte", "reglages", "aide", "admin", "forum", "idees", "convention", "feuille"].includes(depart) && (depart !== "admin" || p.role === "admin") && (depart !== "convention" || accesConvention()) ? depart : "accueil");
    chargerCorps();
    compterMessages();
    ecouterMessages();
    verifierAbonnement();
    if (p.role === "admin") compterAttente();
  }

  sb.auth.onAuthStateChange((evenement, session) => {
    if (evenement === "PASSWORD_RECOVERY") { etat.session = session; formNouveauMdp(); return; }
    if (evenement === "SIGNED_IN" && (!etat.session || etat.session.user.id !== session.user.id)) { etat.session = session; demarrer(); }
    else if (evenement === "SIGNED_IN" && etat.profil && !etat.profil.courriel_verifie_le) {
      // Lien de confirmation ouvert dans le même navigateur : on débloque sans recharger
      etat.session = session;
      verifierCourriel().then(() => { if (courrielVerifie() && VUES_VERROU.includes(etat.vue)) afficherVue(etat.vue); });
    }
    if (evenement === "SIGNED_OUT") { etat.session = null; favoris.liste = null; favoris.enCours = null; profilsAvatars.clear(); viderCacheFeuille(); montrerAccueilPublic(); }
  });

  /* ---------------- Confirmation du courriel ----------------
     Un policier approuvé entre dans l'app même sans avoir confirmé son courriel,
     mais la carte, le CSR et les territoires restent verrouillés jusqu'à la confirmation. */
  const VUES_VERROU = ["csr", "carte", "corps", "feuille"];
  const courrielVerifie = () => !!(etat.profil && etat.profil.courriel_verifie_le);
  async function verifierCourriel() {
    if (!etat.profil || etat.profil.courriel_verifie_le) return;
    const { data } = await sb.rpc("verifier_mon_courriel");
    if (typeof data === "string" && data) { etat.profil.courriel_verifie_le = data; toast("Courriel confirmé. Tout est déverrouillé."); }
  }
  function afficherVerrou(nom) {
    $("#verrou-titre").textContent = { csr: "CSR verrouillé", carte: "Carte verrouillée", corps: "Territoires verrouillés" }[nom];
    $("#verrou-courriel").textContent = etat.profil.email;
  }
  $("#verrou-envoyer").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email: etat.profil.email, options: { shouldCreateUser: false, emailRedirectTo: urlRetour() } });
    if (error) { btn.disabled = false; return toast(traduireErreur(error)); }
    $("#verrou-etat").hidden = false;
    $("#verrou-etat").textContent = `Lien envoyé à ${etat.profil.email}. Ouvrez-le sur cet appareil ou un autre, puis touchez « J'ai confirmé ». Vérifiez aussi vos courriels indésirables.`;
    setTimeout(() => (btn.disabled = false), 60000);
  });
  $("#verrou-verifier").addEventListener("click", async () => {
    const frais = await chargerProfil().catch(() => null);
    if (frais) etat.profil = frais;
    await verifierCourriel();
    if (courrielVerifie()) afficherVue(etat.vue);
    else toast("Pas encore confirmé. Ouvrez le lien reçu par courriel.");
  });

  /* ---------------- Loi 25 : consentement, nouveautés ---------------- */
  const VERSION_POLITIQUE = "2026.10.20.3";
  $("#consent-ok").addEventListener("click", async () => {
    const { error } = await sb.rpc("accepter_politique", { p_version: VERSION_POLITIQUE });
    if (error) return toast(traduireErreur(error));
    etat.profil.consentement_version = VERSION_POLITIQUE; etat.profil.consentement_le = new Date().toISOString();
    $("#consent-voile").hidden = true;
    toast("Merci. Votre consentement est enregistré.");
    afficherAvertissement();
  });
  $("#consent-non").addEventListener("click", async () => { $("#consent-voile").hidden = true; await sb.auth.signOut(); });
  function majConsentementReglages() {
    const p = etat.profil;
    $("#rg-consentement").textContent = p && p.consentement_le ? `acceptée le ${new Date(p.consentement_le).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}` : "à accepter";
  }
  // Seulement les nouveautés de la dernière version (remplacer à chaque mise à jour)
  const NOUVEAUTES = [
    { date: "2026-10-20", titre: "Feuille de poste", points: [
      "Nouvel onglet Feuille : la feuille aide-mémoire de votre poste, en photo ou en PDF, partagée avec les membres de votre poste.",
      "Tout membre du poste peut la remplacer ou la retirer. Lisez bien les règles : aucun code d'accès, aucune fréquence radio, aucun numéro interne, aucun renseignement sur une personne."] },
  ];
  function ouvrirNouveautes() {
    $("#nouv-liste").innerHTML = NOUVEAUTES.map((n) => `<article><small>${esc(new Date(n.date + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }))}</small>
      <b>${esc(n.titre)}</b><ul>${n.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></article>`).join("");
    $("#nouv-voile").hidden = false;
    try { localStorage.setItem("pm-nouv-vu", NOUVEAUTES[0].date); } catch { /* facultatif */ }
  }
  function montrerNouveautesUneFois() {
    let vu = null; try { vu = localStorage.getItem("pm-nouv-vu"); } catch { return; }
    if (vu !== NOUVEAUTES[0].date && $("#consent-voile").hidden && $("#avert-voile").hidden) ouvrirNouveautes();
  }
  $$("[data-action='nouveautes']").forEach((b) => b.addEventListener("click", ouvrirNouveautes));
  $("#nouv-fermer").addEventListener("click", () => ($("#nouv-voile").hidden = true));
  $("#nouv-voile").addEventListener("click", (e) => { if (e.target.id === "nouv-voile") e.target.hidden = true; });


  /* ---------------- Avertissement : à chaque ouverture et à chaque retour dans l'app ---------------- */
  const AVERT_DEFAUT = "Application indépendante : elle n'est affiliée à aucune entreprise ni à aucun corps de police.\nElle peut être utilisée par tous les policiers des corps de police du Canada.\nNe partagez aucune information confidentielle dans cette application.\nLe propriétaire de l'application n'est pas responsable des informations confidentielles qui pourraient y être partagées.\nAucune photo du CRPQ ni aucune donnée sur des civils ne sera tolérée dans l'application.\nLois et table des vitesses : les montants peuvent être inexacts ou non à jour. Vérifiez toujours que les articles et les barèmes sont les bons avant de vous y fier.";
  let texteAvert = AVERT_DEFAUT;
  async function chargerAvertissement() {
    const { data } = await sb.from("parametres_app").select("avertissement").eq("id", 1).maybeSingle();
    if (data && data.avertissement) texteAvert = data.avertissement;
  }
  function afficherAvertissement() {
    if (!etat.profil || etat.profil.statut !== "approuve" || $("#ecran-app").hidden) return;
    if (!$("#consent-voile").hidden) return; // le consentement passe d'abord; l'avertissement suit
    try { if (Date.now() - Number(sessionStorage.getItem("pm-averti") || 0) < 15000) return; } catch { /* facultatif */ } // simple rechargement juste après l'acceptation
    $("#avert-lignes").innerHTML = texteAvert.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("");
    $("#avert-voile").hidden = false;
    setTimeout(() => $("#avert-ok").focus(), 50);
  }
  $("#avert-ok").addEventListener("click", () => {
    $("#avert-voile").hidden = true;
    try { sessionStorage.setItem("pm-averti", String(Date.now())); } catch { /* facultatif */ }
    montrerNouveautesUneFois();
  });
  $("#avert-non").addEventListener("click", async () => { $("#avert-voile").hidden = true; await sb.auth.signOut(); });
  // Retour dans l'app après l'avoir quittée (autre app, autre onglet, écran verrouillé)
  let quitteLe = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { quitteLe = Date.now(); return; }
    if (quitteLe && Date.now() - quitteLe > 15000) chargerAvertissement().finally(afficherAvertissement); // 15 s : évite de l'afficher après un simple choix de photo
  });
  // Administration : modifier le message
  async function rendreAvertAdmin() {
    await chargerAvertissement();
    $("#adm-avert").value = texteAvert;
  }
  $("#adm-avert-defaut").addEventListener("click", () => { $("#adm-avert").value = AVERT_DEFAUT; toast("Texte par défaut remis : touchez « Publier le message »"); });
  $("#adm-avert-ok").addEventListener("click", async () => {
    const t = $("#adm-avert").value.trim();
    if (!t) return toast("Le message ne peut pas être vide");
    const { error } = await sb.from("parametres_app").update({ avertissement: t, modifie_le: new Date().toISOString() }).eq("id", 1);
    if (error) return toast(traduireErreur(error));
    texteAvert = t;
    toast("Message d'avertissement publié pour tous");
  });

  /* ---------------- Convention collective : question à voix haute, clause lue par la voix de l'appareil (membres de la Sûreté du Québec) ----------------
     Police Management trouve les clauses du contrat de travail APPQ, puis les lit à voix haute (synthèse vocale de l'appareil, comme Siri).
     La dictée utilise la reconnaissance vocale du navigateur quand elle existe, sinon le micro du clavier. */
  const accesConvention = () => !!etat.profil && (etat.profil.role === "admin" || /s[ûu]ret[ée] du qu[ée]bec/i.test(etat.profil.corps_police || ""));
  const PDF_CONVENTION = "https://www.sq.gouv.qc.ca/wp-content/uploads/2026/02/2025-01-23-contrat-travail-sq.pdf";
  const cv = { fil: (() => { try { return JSON.parse(sessionStorage.getItem("pm-convention3") || "[]"); } catch { return []; } })(), enCours: false, lecture: null, vocal: false };
  const sauverFilCv = () => { try { sessionStorage.setItem("pm-convention3", JSON.stringify(cv.fil.slice(-10))); } catch { /* facultatif */ } };
  const nomClause = (e) => (/^Annexe/.test(e.article || "") ? e.article : "clause " + (e.article || "?")) + (e.page ? `, p. ${e.page}` : "");
  const voixPossible = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Texte à lire : la clause la plus pertinente, nettoyée pour l'oreille (« un (1) an » → « un an »)
  function texteALire(extraits) {
    if (!extraits.length) return "Je n'ai trouvé aucune clause pour cette question. Essayez avec d'autres mots.";
    const e = extraits[0];
    let t = (e.texte || "").replace(/\s+/g, " ").replace(/\s\(\d+(?:[.,]\d+)?\)/g, "").replace(/^\d{1,2}\.\d{2}\s*/, "").trim();
    if (t.length > 650) { const coupe = t.slice(0, 650); const fin = Math.max(coupe.lastIndexOf(". "), coupe.lastIndexOf("; ")); t = (fin > 250 ? coupe.slice(0, fin + 1) : coupe) + " …"; }
    const lieu = /^Annexe/.test(e.article || "") ? e.article : "la clause " + (e.article || "");
    const autres = extraits.slice(1, 4).map((x) => (/^Annexe/.test(x.article || "") ? x.article : x.article)).filter(Boolean);
    return `Selon ${lieu} du contrat de travail${e.page ? ", page " + e.page : ""}. ${t}${autres.length ? ` Voir aussi : ${autres.join(", ")}.` : ""}`;
  }
  function voixFrancaise() {
    const v = speechSynthesis.getVoices();
    return v.find((x) => /^fr[-_]CA/i.test(x.lang)) || v.find((x) => /^fr/i.test(x.lang)) || null;
  }
  function arreterLecture() { if (voixPossible()) speechSynthesis.cancel(); cv.lecture = null; majBoutonsLecture(); }
  function lire(k) {
    if (!voixPossible()) return toast("La lecture à voix haute n'est pas offerte sur cet appareil.");
    if (cv.lecture === k) return arreterLecture();
    speechSynthesis.cancel();
    const m = cv.fil[k];
    const u = new SpeechSynthesisUtterance(m.claude ? m.claude.replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "") : texteALire(m.extraits || []));
    u.lang = "fr-CA";
    const v = voixFrancaise(); if (v) u.voice = v;
    u.rate = 1;
    u.onend = u.onerror = () => { if (cv.lecture === k) { cv.lecture = null; majBoutonsLecture(); } };
    cv.lecture = k;
    speechSynthesis.speak(u);
    majBoutonsLecture();
  }
  function majBoutonsLecture() {
    $$("[data-cv-lire]").forEach((b) => {
      const actif = cv.lecture === Number(b.dataset.cvLire);
      b.innerHTML = actif ? `${ICONE_STOP}Arrêter` : `${ICONE_HP}Écouter la réponse`;
      b.classList.toggle("actif", actif);
    });
  }
  // Texte envoyé à Claude (le policier utilise son propre compte). « court » : pour le lien claude.ai/new?q= (longueur limitée).
  function promptClaude(question, extraits, court) {
    const tete = `Je suis policier ou policière à la Sûreté du Québec. Réponds à ma question en te basant sur le Contrat de travail entre le gouvernement du Québec et l'APPQ (2022-2028). Texte officiel (PDF) : ${PDF_CONVENTION}\nCite les clauses et les pages. Si les extraits ne suffisent pas, dis-le et indique quoi vérifier. Ce n'est pas un avis juridique.\n\nQuestion : ${question}\n\n`;
    const liste = extraits.length ? `Clauses trouvées : ${extraits.map(nomClause).join(" ; ")}\n\n` : "";
    let corps = "Extraits du contrat :\n";
    for (const e of extraits) {
      const brut = (e.texte || "").replace(/\s+/g, " ").trim();
      const bloc = `\n[${nomClause(e)}] ${court ? brut.slice(0, 600) + (brut.length > 600 ? "…" : "") : brut}\n`;
      if (court && encodeURIComponent(tete + liste + corps + bloc).length > 3600) break;
      corps += bloc;
    }
    return tete + liste + (extraits.length ? corps : "");
  }
  // Mise en forme légère des réponses de Claude : gras, listes, paragraphes (le texte est d'abord échappé)
  function mdSimple(t) {
    const lignes = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let html = "", liste = null;
    for (const l of lignes) {
      const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (m) { if (!liste) { liste = /^\s*\d/.test(l) ? "ol" : "ul"; html += `<${liste}>`; } html += `<li>${m[1]}</li>`; continue; }
      if (liste) { html += `</${liste}>`; liste = null; }
      if (l.trim()) html += `<p>${l.replace(/^#+\s*/, "")}</p>`;
    }
    if (liste) html += `</${liste}>`;
    return html;
  }
  // Claude répond directement dans Police Management (fonction ia-convention, clé API de Police Management)
  async function demanderClaude(k) {
    const m = cv.fil[k];
    if (!m || m.claudeEnCours) return;
    reveillerVoix();
    m.claudeEnCours = true; m.claudeErreur = null; m.claudeLien = false;
    rendreConvention();
    const historique = [];
    cv.fil.slice(0, k).forEach((x) => { if (x.role === "resultat" && x.claude) historique.push({ role: "user", contenu: x.question }, { role: "assistant", contenu: x.claude }); });
    const { data, error } = await sb.functions.invoke("ia-convention", { body: { question: m.question, historique: historique.slice(-6) } });
    m.claudeEnCours = false;
    if (error || !data || data.erreur) {
      let j = data || null;
      try { if (error && error.context) j = await error.context.json(); } catch { /* message par défaut */ }
      m.claudeErreur = (j && j.erreur) || "Claude n'a pas pu répondre. Réessayez plus tard.";
      m.claudeLien = !!(j && (j.code === "non_active" || j.code === "limite"));
    } else {
      m.claude = data.reponse;
      if (data.restantes != null) toast(`${data.restantes} question${data.restantes > 1 ? "s" : ""} à Claude restante${data.restantes > 1 ? "s" : ""} aujourd'hui`);
    }
    sauverFilCv();
    rendreConvention();
    if (m.claude && cv.vocalClaude) lire(k);
  }
  const lienClaude = (texte) => "https://claude.ai/new?q=" + encodeURIComponent(texte);
  const ICONE_CLAUDE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.5l1.6 6.1 5.6-2.9-3.9 4.9 6.2 1.4-6.2 1.4 3.9 4.9-5.6-2.9L12 21.5l-1.6-6.1-5.6 2.9 3.9-4.9L2.5 12l6.2-1.4L4.8 5.7l5.6 2.9z" fill="currentColor"/></svg>`;
  const ICONE_HP = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICONE_STOP = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`;

  function rendreConvention() {
    const el = $("#cv-fil");
    el.innerHTML = cv.fil.map((m, k) => {
      if (m.role === "user") return `<div class="bulle moi cv-q"><span class="bulle-txt">${esc(m.question)}</span></div>`;
      if (m.erreur) return `<article class="panneau cv-r cv-erreur"><p>${esc(m.erreur)}</p></article>`;
      const ex = m.extraits || [];
      return `<article class="panneau cv-r">
        ${ex.length ? `<div class="cv-claude"><button type="button" class="btn-principal cv-btn-voix" data-cv-lire="${k}"></button>
          <a class="btn-principal cv-btn-claude" href="${esc(lienClaude(promptClaude(m.question, ex, true)))}" target="_blank" rel="noopener">${ICONE_CLAUDE}Demander à Claude</a>
          <button type="button" class="btn-secondaire" data-cv-copier="${k}">Copier pour Claude</button></div>
        <p class="aide">Claude s'ouvre avec votre question et les clauses, et vous répond avec votre compte Claude (le forfait gratuit suffit). Vérifiez toujours la clause citée.</p>
        ${m.claude ? `<section class="cv-reponse-claude"><p class="cv-claude-tete">${ICONE_CLAUDE}<b>Réponse de Claude</b></p>${mdSimple(m.claude)}<p class="aide">Générée par IA à partir des clauses du contrat : vérifiez toujours la clause citée.</p></section>` : ""}
        ${m.claudeErreur ? `<p class="cv-claude-err">${esc(m.claudeErreur)}${m.claudeLien ? ` <a href="${esc(lienClaude(promptClaude(m.question, ex, true)))}" target="_blank" rel="noopener">Ouvrir dans Claude ↗</a>` : ""}</p>` : ""}
        <p class="cv-principale"><span class="cv-num">${esc(nomClause(ex[0]))}</span> <small>${esc(ex[0].titre || "")}</small></p>
        <p class="cv-texte">${esc(ex[0].texte)}</p>
        <a class="cv-pdf" href="${PDF_CONVENTION}#page=${(ex[0].page || 0) + 8}" target="_blank" rel="noopener">Ouvrir le PDF à cette page ↗</a>
        ${ex.length > 1 ? `<p class="cv-titre-ex"><b>Autres clauses</b></p>` + ex.slice(1).map((e) => `<details class="cv-ex"><summary><span class="cv-num">${esc(nomClause(e))}</span><small>${esc(e.titre || "")}</small></summary><p>${esc(e.texte)}</p><a href="${PDF_CONVENTION}#page=${(e.page || 0) + 8}" target="_blank" rel="noopener">Ouvrir le PDF à cette page ↗</a></details>`).join("") : ""}`
        : `<p>Aucune clause trouvée avec ces mots. Essayez avec d'autres mots, par exemple « vacances », « temps supplémentaire » ou « prime de nuit ».</p>`}
      </article>`;
    }).join("") + (cv.enCours ? `<article class="panneau cv-r cv-attente"><span class="cv-points"><i></i><i></i><i></i></span> Recherche dans le contrat…</article>` : "");
    $("#cv-suggestions").hidden = cv.fil.length > 0 || !$("#cv-avis").hidden;
    $("#cv-effacer").hidden = !cv.fil.length;
    $$("[data-cv-lire]", el).forEach((b) => b.addEventListener("click", () => lire(Number(b.dataset.cvLire))));
    $$("[data-cv-copier]", el).forEach((b) => b.addEventListener("click", async () => {
      const m = cv.fil[Number(b.dataset.cvCopier)];
      try { await navigator.clipboard.writeText(promptClaude(m.question, m.extraits || [], false)); toast("Copié. Collez-le dans Claude."); }
      catch { toast("Copie impossible sur cet appareil. Utilisez « Demander à Claude »."); return; }
      setTimeout(() => window.open("https://claude.ai/new", "_blank", "noopener"), 700);
    }));
    majBoutonsLecture();
    const dernier = el.lastElementChild;
    if (dernier) dernier.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function initConvention() {
    if (!accesConvention()) { afficherVue("accueil"); return; }
    let accepte = false;
    try { accepte = localStorage.getItem("pm-convention-voix") === "1"; } catch { /* facultatif */ }
    $("#cv-avis").hidden = accepte;
    $("#cv-form").hidden = !accepte;
    rendreConvention();
  }
  $("#cv-avis-ok").addEventListener("click", () => {
    try { localStorage.setItem("pm-convention-voix", "1"); } catch { /* facultatif */ }
    initConvention();
    $("#cv-texte").focus();
  });
  // iOS exige un toucher avant la première lecture : on « réveille » la voix pendant le toucher
  function reveillerVoix() { if (voixPossible() && !cv.voixPrete) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); cv.voixPrete = true; } }
  async function poserQuestionConvention(question, vocal = false) {
    question = question.trim();
    if (!question || cv.enCours) return;
    if ($("#cv-form").hidden) { $("#cv-avis").scrollIntoView({ behavior: "smooth" }); return toast("Lisez l'avis, puis touchez « J'ai compris »."); }
    arreterLecture();
    cv.fil.push({ role: "user", question });
    cv.enCours = true; $("#cv-envoyer").disabled = true;
    rendreConvention();
    const { data, error } = await sb.rpc("convention_recherche", { p_q: question, p_n: 6 });
    cv.enCours = false; $("#cv-envoyer").disabled = false;
    cv.fil.push(error ? { role: "resultat", question, erreur: traduireErreur(error) } : { role: "resultat", question, extraits: data || [] });
    sauverFilCv();
    rendreConvention();
    // Question posée à voix haute : la réponse est lue tout de suite
    if (vocal && !error && voixPossible()) lire(cv.fil.length - 1);
  }
  $("#cv-form").addEventListener("submit", (e) => {
    e.preventDefault();
    reveillerVoix();
    const t = $("#cv-texte").value;
    $("#cv-texte").value = ""; $("#cv-texte").style.height = "auto";
    poserQuestionConvention(t, cv.vocal);
    cv.vocal = false;
  });
  $("#cv-texte").addEventListener("input", (e) => { const z = e.target; z.style.height = "auto"; z.style.height = Math.min(z.scrollHeight, 140) + "px"; });
  $("#cv-texte").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#cv-form").requestSubmit(); }
  });
  $$("[data-cv-q]").forEach((b) => b.addEventListener("click", () => { reveillerVoix(); poserQuestionConvention(b.dataset.cvQ); }));
  $("#cv-effacer").addEventListener("click", () => { arreterLecture(); cv.fil = []; sauverFilCv(); rendreConvention(); });
  // Micro : dictée du navigateur si elle existe; sinon, le micro du clavier de l'iPhone fait le travail
  $("#cv-micro").addEventListener("click", () => {
    reveillerVoix();
    arreterLecture();
    if (!Reconnaissance) {
      $("#cv-texte").focus();
      cv.vocal = true;
      return toast("Touchez le micro 🎤 du clavier pour dicter votre question, puis Envoyer : la réponse sera lue à voix haute.");
    }
    if (cv.ecoute) { cv.ecoute.stop(); return; }
    const r = new Reconnaissance();
    r.lang = "fr-CA"; r.interimResults = true; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (ev) => {
      let t = "";
      for (const res of ev.results) t += res[0].transcript;
      $("#cv-texte").value = t;
      if (ev.results[ev.results.length - 1].isFinal) final = t;
    };
    r.onerror = (ev) => { if (ev.error === "not-allowed") toast("Autorisez le micro pour ce site dans les réglages du navigateur."); };
    r.onend = () => {
      cv.ecoute = null; $("#cv-micro").classList.remove("ecoute");
      const t = (final || $("#cv-texte").value).trim();
      if (t) { $("#cv-texte").value = ""; poserQuestionConvention(t, true); }
    };
    cv.ecoute = r; $("#cv-micro").classList.add("ecoute");
    try { r.start(); } catch { cv.ecoute = null; $("#cv-micro").classList.remove("ecoute"); }
  });
  if (voixPossible()) speechSynthesis.getVoices(); // charge la liste des voix
  document.addEventListener("visibilitychange", () => { if (document.hidden) arreterLecture(); });

  /* ---------------- Navigation ---------------- */
  function afficherVue(nom) {
    etat.vue = nom;
    document.body.dataset.vue = nom;
    if (nom !== "carte") document.body.classList.remove("carte-plein");
    $$(".nav button").forEach((b) => (b.dataset.vue === nom ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    const verrou = VUES_VERROU.includes(nom) && !courrielVerifie();
    $$(".vue").forEach((v) => (v.hidden = v.id !== (verrou ? "vue-verrou" : "vue-" + nom)));
    history.replaceState(null, "", "#" + nom);
    if (verrou) { afficherVerrou(nom); return; }
    if (nom === "csr") initCsr();
    if (nom === "carte") {
      initCarte(); personnaliserCarte();
      const pt = pointPartageEnAttente();
      if (pt) { try { sessionStorage.removeItem("pm-point"); } catch { /* facultatif */ } setTimeout(() => etat.placer(pt[0], pt[1], "Point partagé", 16), 300); }
    }
    if (nom === "corps") initCorps();
    if (nom === "admin") initAdmin();
    if (nom === "compte") { initCompte(); majBlocsNotif(); }
    if (nom === "horaire") initHoraire();
    if (nom === "accueil") initAccueil();
    if (nom === "reglages") { majBlocsNotif(); majChoixTheme(); rendreStyles(); majReglagePartage(); majReglagesHoraire(); majConsentementReglages(); }
    if (nom === "messages") { initMessages(); majBlocsNotif(); }
    if (nom === "forum") initForum();
    if (nom === "idees") initIdees();
    if (nom === "convention") initConvention();
    if (nom === "feuille") initFeuille();
  }
  // Menu de la photo de profil
  function ouvrirMenu() {
    const p = etat.profil;
    $("#menu-nom").textContent = p.nom_complet || p.email;
    $("#menu-sous").textContent = [p.grade, p.corps_police].filter(Boolean).join(" · ") || p.email;
    remplirAvatar($("#menu-avatar"), p);
    $("#menu-voile").hidden = false;
    $("#btn-menu").setAttribute("aria-expanded", "true");
  }
  function fermerMenu() { $("#menu-voile").hidden = true; $("#btn-menu").setAttribute("aria-expanded", "false"); }
  $("#btn-menu").addEventListener("click", ouvrirMenu);
  // Rafraîchir : va chercher la dernière version de l'app et des données, puis recharge
  $("#btn-rafraichir").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (b.classList.contains("tourne")) return;
    b.classList.add("tourne");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
    } catch { /* sans gravité */ }
    const vue = etat.vue;
    setTimeout(() => { location.hash = vue; location.reload(); }, 350);
  });
  $("#btn-reglages").addEventListener("click", () => afficherVue("reglages"));
  $("#menu-voile").addEventListener("click", (e) => { if (e.target.id === "menu-voile") fermerMenu(); });
  $$("[data-menu]").forEach((b) => b.addEventListener("click", () => { fermerMenu(); afficherVue(b.dataset.menu); }));
  { const v = (document.querySelector('script[src^="app.js"]') || {}).src || ""; const m = v.match(/v=(\d{8})(\d{4})/); if (m) $("#rg-version").textContent = `Version du ${m[1].slice(6, 8)}/${m[1].slice(4, 6)}/${m[1].slice(0, 4)}`; }
  $$(".nav button").forEach((b) => b.addEventListener("click", () => afficherVue(b.dataset.vue)));

  /* ---------------- Horaire rotatif ---------------- */
  const QUARTS = {
    J: { nom: "Jour" }, S: { nom: "Soir" }, N: { nom: "Nuit" }, C: { nom: "Congé" },
    V: { nom: "Vacances" }, M: { nom: "Maladie" }, F: { nom: "Formation" }, T: { nom: "Cour" }, X: { nom: "Temps supp." },
    O: { nom: "Obligation familiale" }, H: { nom: "Férié" }, L: { nom: "Maladie longue durée" },
  };
  const QUARTS_CYCLE = ["J", "S", "N", "C"];
  const HEURES_DEFAUT = { J: ["07:00", "19:00"], S: ["15:00", "23:00"], N: ["19:00", "07:00"] };
  const MODELES = {
    "4-4J": "JJJJCCCC", "4-4JN": "JJJJCCCCNNNNCCCC", "223": "JJCCJJJCCJJCCCNNCCNNNCCNNCCC",
    "7-7": "JJJJJJJCCCCCCC", "3-3": "JJJCCC", "5-2": "JJJJJCC", "JSN": "JJJJJCCSSSSSCCNNNNNCC",
  };
  const MS_JOUR = 86400000;
  const jourUTC = (iso) => { const [a, m, j] = iso.split("-").map(Number); return Date.UTC(a, m - 1, j) / MS_JOUR; };
  const isoDe = (n) => new Date(n * MS_JOUR).toISOString().slice(0, 10);
  const aujourdhuiISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // hr.config / hr.exceptions = mon horaire ; hr.vue = horaire d'un collègue affiché en lecture seule
  const hr = { config: null, exceptions: {}, mois: null, brouillon: null, jourChoisi: null, vue: null, partages: [], conj: null, cible: "moi" };
  // hr.conj = 2e calendrier (conjoint·e), privé ; hr.cible = calendrier en cours d'édition
  const cibleEdition = () => (hr.cible === "conjoint" && hr.conj ? hr.conj : hr);
  const affichee = () => hr.vue || cibleEdition();

  function quartDu(iso, src = affichee()) {
    const e = (src.exceptions || {})[iso];
    const c = src.config;
    let prevu = null;
    if (c && c.cycle && c.cycle.length && c.debut) {
      const n = jourUTC(iso) - jourUTC(c.debut);
      prevu = c.cycle[((n % c.cycle.length) + c.cycle.length) % c.cycle.length];
    }
    return { code: e ? e.type : prevu, prevu, note: e ? e.note : "", exception: !!e };
  }
  // Heures d'un quart pour une date : exception (heures saisies), mode hybride autoroutier, heures de la rotation, défauts
  function heuresJour(code, iso, src = affichee()) {
    const e = iso && (src.exceptions || {})[iso];
    if (e && e.debut && e.fin) return [e.debut, e.fin];
    if (!["J", "S", "N"].includes(code)) return null;
    const c = src.config || {};
    if (c.hybride && iso) {
      const fds = [0, 6].includes(new Date(iso + "T12:00").getDay());
      return { J: fds ? ["06:30", "18:30"] : ["06:30", "15:30"], N: fds ? ["18:30", "06:30"] : ["22:30", "07:30"], S: ["14:30", "23:30"] }[code];
    }
    return (c.heures && c.heures[code]) || HEURES_DEFAUT[code];
  }
  const heuresDe = (code, src = affichee(), iso = null) => { const h = heuresJour(code, iso, src); return h ? `${h[0]} – ${h[1]}` : ""; };
  const dureeH = (h) => { if (!h) return 0; const [a, b] = h.map((t) => { const [x, y] = t.split(":").map(Number); return x * 60 + y; }); let d = b - a; if (d <= 0) d += 1440; return d / 60; };
  function chargerDonneesHoraire(data) {
    hr.config = data && data.config && data.config.cycle ? data.config : null;
    hr.exceptions = (data && data.exceptions) || {};
    const c = data && data.conjoint;
    hr.conj = c ? { nom: c.nom || "Conjoint·e", config: c.config && c.config.cycle ? c.config : null, exceptions: c.exceptions || {} } : null;
    if (!hr.conj) hr.cible = "moi";
    hr.chargé = true;
  }

  async function chargerMonHoraire() {
    if (hr.chargé) return;
    const { data, error } = await sb.from("horaires").select("config, exceptions, conjoint").eq("user_id", etat.profil.id).maybeSingle();
    if (error) throw error;
    chargerDonneesHoraire(data);
  }

  /* ---------------- Messagerie (BÊTA) : conversations entre l'administrateur et chaque policier ---------------- */
  const msg = { comptes: null, admin: null, autre: null, fil: [], canal: null, sondage: null };
  const estAdmin = () => etat.profil && etat.profil.role === "admin";
  const heureFr = (d) => new Date(d).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  const jourFr = (d) => {
    const x = new Date(d), auj = new Date(), hier = new Date(Date.now() - 86400000);
    if (x.toDateString() === auj.toDateString()) return "Aujourd'hui";
    if (x.toDateString() === hier.toDateString()) return "Hier";
    return x.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  };

  async function compterMessages() {
    if (!etat.profil) return 0;
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("destinataire", etat.profil.id).is("lu_le", null);
    const b = $("#badge-messages");
    b.textContent = count > 99 ? "99+" : count || "";
    b.hidden = !count;
    $("#beta-nav").hidden = !!count;
    compteurs.messages = count || 0;
    majPastille();
    const carte = $("#ac-msg");
    carte.hidden = !count;
    if (count) carte.innerHTML = `<b>${count}</b><span>nouveau${count > 1 ? "x" : ""} message${count > 1 ? "s" : ""}</span><i>Lire ›</i>`;
    carte.classList.toggle("urgent", !!count);
    return count || 0;
  }

  // Messages en direct (Supabase Realtime)
  function ecouterMessages() {
    if (msg.canal || !etat.profil) return;
    const moi = etat.profil.id;
    msg.canal = sb.channel("messages-" + moi)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `destinataire=eq.${moi}` }, (e) => nouveauMessage(e.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `expediteur=eq.${moi}` }, (e) => {
        const m = msg.fil.find((x) => x.id === e.new.id);
        if (m) { m.lu_le = e.new.lu_le; rendreFil(false); }
      })
      .subscribe();
  }
  function nouveauMessage(m) {
    const ouvert = etat.vue === "messages" && !$("#chat-vue").hidden && msg.autre && m.expediteur === msg.autre.id && document.visibilityState === "visible";
    if (ouvert) {
      if (!msg.fil.some((x) => x.id === m.id)) msg.fil.push(m);
      rendreFil(true);
      sb.rpc("conversation_lue", { p_autre: m.expediteur }).then(compterMessages);
    } else {
      compterMessages();
      if (etat.vue === "messages" && !$("#conv-vue").hidden) chargerConversations();
      toast("Nouveau message");
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !etat.profil || etat.profil.statut !== "approuve") return;
    compterMessages();
    if (estAdmin()) compterAttente();
    if (etat.vue === "messages" && msg.autre && !$("#chat-vue").hidden) ouvrirConversation(msg.autre.id, false);
  });

  async function comptesApprouves() {
    if (!msg.comptes) {
      const { data } = await sb.rpc("admin_comptes");
      msg.comptes = (data || []).filter((c) => c.id !== etat.profil.id);
    }
    return msg.comptes;
  }
  const nomCompte = (c) => (c ? c.nom_complet || c.email : "Compte supprimé");

  async function initMessages() {
    ecouterMessages();
    if (estAdmin()) {
      if (msg.ouvrir) { const id = msg.ouvrir; msg.ouvrir = null; return ouvrirConversation(id, true); }
      if (msg.autre && !$("#chat-vue").hidden) return ouvrirConversation(msg.autre.id, false);
      afficherListeConversations();
    } else {
      if (!msg.admin) {
        const { data } = await sb.rpc("contact_admin");
        msg.admin = (data && data[0]) || { id: null, nom: "Administrateur" };
      }
      ouvrirConversation(msg.admin.id, true);
    }
  }

  async function afficherListeConversations() {
    msg.autre = null;
    $("#chat-vue").hidden = true;
    $("#conv-vue").hidden = false;
    const comptes = await comptesApprouves();
    $("#conv-nouveau").innerHTML = `<option value="">+ Nouvelle conversation…</option>` + comptes
      .filter((c) => c.statut === "approuve")
      .sort((a, b) => nomCompte(a).localeCompare(nomCompte(b), "fr"))
      .map((c) => `<option value="${c.id}">${esc((c.grade ? c.grade + " " : "") + nomCompte(c))}${c.matricule ? " · " + esc(c.matricule) : ""}</option>`).join("");
    chargerConversations();
  }

  async function chargerConversations() {
    const moi = etat.profil.id;
    const { data, error } = await sb.from("messages").select("id, expediteur, destinataire, contenu, cree_le, lu_le").order("cree_le", { ascending: false }).limit(1000);
    const el = $("#conv-liste");
    if (error) { el.innerHTML = `<li class="vide">${esc(traduireErreur(error))}</li>`; return; }
    const convs = new Map();
    for (const m of data || []) {
      const autre = m.expediteur === moi ? m.destinataire : m.expediteur;
      if (!autre) continue;
      if (!convs.has(autre)) convs.set(autre, { autre, dernier: m, nonLus: 0 });
      if (m.destinataire === moi && !m.lu_le) convs.get(autre).nonLus++;
    }
    const comptes = await comptesApprouves();
    const liste = [...convs.values()];
    const urls = await urlsAvatars(liste.map((c) => (comptes.find((x) => x.id === c.autre) || {}).avatar_path));
    $("#conv-resume").textContent = liste.length ? `${liste.length} conversation${liste.length > 1 ? "s" : ""}` : "";
    el.innerHTML = liste.length ? liste.map((c, i) => {
      const p = comptes.find((x) => x.id === c.autre) || { nom_complet: "Compte supprimé" };
      const deMoi = c.dernier.expediteur === moi;
      return `<li><button class="conv ${c.nonLus ? "non-lu" : ""}" data-conv="${c.autre}">
        ${htmlAvatar(p, urls[i])}
        <span class="conv-txt"><span class="conv-haut"><b>${esc(nomCompte(p))}</b><small>${esc(jourFr(c.dernier.cree_le) === "Aujourd'hui" ? heureFr(c.dernier.cree_le) : jourFr(c.dernier.cree_le))}</small></span>
        <span class="conv-apercu">${deMoi ? "Vous : " : ""}${esc(c.dernier.contenu.slice(0, 90))}</span></span>
        ${c.nonLus ? `<b class="conv-badge">${c.nonLus}</b>` : ""}
      </button></li>`;
    }).join("") : `<li class="vide">Aucune conversation. Choisissez un policier ci-dessus pour lui écrire.</li>`;
    $$("[data-conv]", el).forEach((b) => b.addEventListener("click", () => ouvrirConversation(b.dataset.conv, true)));
  }
  $("#conv-nouveau").addEventListener("change", (e) => { if (e.target.value) ouvrirConversation(e.target.value, true); e.target.value = ""; });

  async function ouvrirConversation(id, defiler) {
    const moi = etat.profil.id;
    $("#conv-vue").hidden = true;
    $("#chat-vue").hidden = false;
    $("#chat-retour").hidden = !estAdmin();
    let personne;
    if (estAdmin()) {
      const p = (await comptesApprouves()).find((x) => x.id === id) || { id, nom_complet: "Compte supprimé" };
      personne = { id, nom: nomCompte(p), sous: [p.grade, p.corps_police].filter(Boolean).join(" · "), profil: p };
    } else {
      personne = { id: msg.admin.id, nom: msg.admin.nom, sous: "Administrateur" + (msg.admin.grade ? " · " + msg.admin.grade : ""), profil: { nom_complet: msg.admin.nom } };
    }
    msg.autre = personne;
    $("#chat-nom").textContent = personne.nom;
    $("#chat-sous").textContent = personne.sous;
    const [url] = estAdmin() ? await urlsAvatars([personne.profil.avatar_path]) : [null];
    $("#chat-avatar").innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc(initiales(personne.profil));
    if (!estAdmin() && personne.id) {
      $("#chat-avatar").dataset.av = personne.id; delete $("#chat-avatar").dataset.avOk;
      hydraterPastilles($("#chat-avatar").parentElement);
    }
    if (!id) { msg.fil = []; rendreFil(true); return; }
    const { data, error } = await sb.from("messages").select("id, expediteur, destinataire, contenu, cree_le, lu_le")
      .or(`and(expediteur.eq.${moi},destinataire.eq.${id}),and(expediteur.eq.${id},destinataire.eq.${moi})`)
      .order("cree_le", { ascending: true }).limit(500);
    if (error) return toast(traduireErreur(error));
    msg.fil = data || [];
    rendreFil(defiler);
    if (msg.fil.some((m) => m.destinataire === moi && !m.lu_le)) {
      await sb.rpc("conversation_lue", { p_autre: id });
      compterMessages();
    }
    clearInterval(msg.sondage);
    msg.sondage = setInterval(() => { if (etat.vue === "messages" && !$("#chat-vue").hidden && document.visibilityState === "visible") rafraichirFil(); else clearInterval(msg.sondage); }, 20000);
  }
  async function rafraichirFil() {
    const moi = etat.profil.id, id = msg.autre && msg.autre.id;
    if (!id) return;
    const { data } = await sb.from("messages").select("id, expediteur, destinataire, contenu, cree_le, lu_le")
      .or(`and(expediteur.eq.${moi},destinataire.eq.${id}),and(expediteur.eq.${id},destinataire.eq.${moi})`)
      .order("cree_le", { ascending: true }).limit(500);
    if (!data) return;
    const nouveau = data.length !== msg.fil.length;
    msg.fil = data;
    rendreFil(nouveau);
    if (data.some((m) => m.destinataire === moi && !m.lu_le)) { await sb.rpc("conversation_lue", { p_autre: id }); compterMessages(); }
  }

  function rendreFil(defiler) {
    const moi = etat.profil.id, el = $("#chat-fil");
    if (!msg.fil.length) {
      el.innerHTML = `<p class="chat-vide">${estAdmin() ? "Écrivez le premier message." : "Écrivez à l'administrateur. Il vous répondra ici."}</p>`;
      return;
    }
    let html = "", jour = "";
    const dernierDeMoi = [...msg.fil].reverse().find((m) => m.expediteur === moi);
    msg.fil.forEach((m, i) => {
      const j = jourFr(m.cree_le);
      if (j !== jour) { jour = j; html += `<div class="chat-jour">${esc(j)}</div>`; }
      const mien = m.expediteur === moi;
      const suivant = msg.fil[i + 1];
      const groupe = suivant && suivant.expediteur === m.expediteur && jourFr(suivant.cree_le) === j;
      html += `<div class="bulle ${mien ? "moi" : "eux"} ${groupe ? "groupe" : ""}"><span class="bulle-txt">${esc(m.contenu)}</span><span class="bulle-heure">${esc(heureFr(m.cree_le))}</span></div>`;
      if (m === dernierDeMoi) html += `<div class="chat-statut">${m.lu_le ? "Lu à " + esc(heureFr(m.lu_le)) : m.id < 0 ? "Envoi…" : "Envoyé"}</div>`;
    });
    el.innerHTML = html;
    if (defiler) el.scrollTop = el.scrollHeight;
  }

  // Zone de saisie : grandit avec le texte, Entrée envoie sur ordinateur (Maj+Entrée = nouvelle ligne)
  const zone = $("#chat-texte");
  zone.addEventListener("input", () => { zone.style.height = "auto"; zone.style.height = Math.min(zone.scrollHeight, 140) + "px"; });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#chat-form").requestSubmit(); }
  });
  $("#chat-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texte = zone.value.trim();
    if (!texte || !msg.autre) return;
    if (!msg.autre.id) return toast("Aucun administrateur disponible");
    const temp = { id: -Date.now(), expediteur: etat.profil.id, destinataire: msg.autre.id, contenu: texte, cree_le: new Date().toISOString(), lu_le: null };
    msg.fil.push(temp);
    zone.value = ""; zone.style.height = "auto";
    rendreFil(true);
    const { data, error } = await sb.rpc("envoyer_message", { p_contenu: texte, p_destinataire: estAdmin() ? msg.autre.id : null });
    const i = msg.fil.indexOf(temp);
    if (error) {
      if (i >= 0) msg.fil.splice(i, 1);
      zone.value = texte;
      rendreFil(true);
      return toast(traduireErreur(error));
    }
    if (i >= 0) msg.fil[i] = data;
    rendreFil(true);
  });
  $("#chat-retour").addEventListener("click", () => { clearInterval(msg.sondage); afficherListeConversations(); });

  function ecrireA(id) {
    afficherVue("messages");
    setTimeout(() => ouvrirConversation(id, true), 50);
  }

  /* ---------------- Réglage : partage de la rotation avec le poste (activé par défaut) ---------------- */
  const partageActif = () => !etat.profil || etat.profil.partage_poste !== false;
  function majReglagePartage() {
    const actif = partageActif();
    $("#rg-partage-poste").checked = actif;
    const etatTxt = $("#hr-partage-etat");
    if (etatTxt) etatTxt.textContent = actif ? "Votre rotation est partagée avec votre poste." : "Le partage de votre rotation avec votre poste est désactivé.";
  }
  $("#rg-partage-poste").addEventListener("change", async (e) => {
    const actif = e.target.checked;
    const { error } = await sb.rpc("regler_partage_poste", { p_actif: actif });
    if (error) { e.target.checked = !actif; return toast(traduireErreur(error)); }
    etat.profil.partage_poste = actif;
    majReglagePartage();
    toast(actif ? "Rotation partagée avec votre poste" : "Rotation retirée du partage avec votre poste");
  });

  /* ---------------- Notifications (Web Push) ---------------- */
  const pushPossible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const estInstallee = () => estAppIOS || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function cleVapid() {
    const b = C.vapidPublic.replace(/-/g, "+").replace(/_/g, "/");
    const brut = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    return Uint8Array.from(brut, (c) => c.charCodeAt(0));
  }
  async function abonnementActuel() {
    if (!pushPossible()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function enregistrerAbonnement(abo) {
    const j = abo.toJSON();
    const { error } = await sb.from("push_abonnements").upsert({
      user_id: etat.profil.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      appareil: navigator.userAgent.slice(0, 200),
    }, { onConflict: "endpoint" });
    if (error) throw error;
  }
  async function majBlocsNotif() {
    const blocs = $$("[data-notif]");
    let etatTxt, libelle, actif = false, desactive = false;
    if (estAppIOS) {
      etatTxt = "Les notifications ne sont pas encore offertes dans l'app iPhone et iPad. Pour les recevoir, utilisez le site ajouté à l'écran d'accueil.";
      libelle = "Bientôt"; desactive = true;
    } else if (!pushPossible()) {
      if (estIOS() && !estInstallee()) { etatTxt = "Sur iPhone, ajoutez d'abord l'app à l'écran d'accueil (tuile App de l'accueil), puis ouvrez-la à partir de son icône."; libelle = "Comment faire"; }
      else { etatTxt = "Ce navigateur ne permet pas les notifications."; libelle = "Non offert"; desactive = true; }
    } else if (Notification.permission === "denied") {
      etatTxt = "Notifications bloquées. Autorisez-les dans les réglages du navigateur ou du téléphone pour ce site."; libelle = "Bloquées"; desactive = true;
    } else {
      const abo = await abonnementActuel().catch(() => null);
      actif = !!abo && Notification.permission === "granted";
      etatTxt = actif ? "Activées sur cet appareil." : "Recevez une alerte pour chaque nouveau message, même app fermée.";
      libelle = actif ? "Désactiver" : "Activer";
    }
    blocs.forEach((b) => {
      $(".notif-etat", b).textContent = etatTxt;
      const btn = $(".notif-bouton", b);
      btn.textContent = libelle;
      btn.disabled = desactive;
      btn.classList.toggle("btn-ok", !actif && !desactive);
      btn.classList.toggle("btn-secondaire", actif || desactive);
      b.classList.toggle("actif", actif);
      b.hidden = b.classList.contains("compact") && actif; // dans Messages, on cache le rappel une fois activé
    });
  }
  async function basculerNotifications() {
    if (!pushPossible()) {
      if (estIOS() && !estInstallee()) afficherVue("aide");
      return;
    }
    try {
      const abo = await abonnementActuel();
      if (abo && Notification.permission === "granted") {
        await sb.from("push_abonnements").delete().eq("endpoint", abo.endpoint);
        await abo.unsubscribe();
        toast("Notifications désactivées sur cet appareil");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { toast("Notifications non autorisées"); return majBlocsNotif(); }
        const reg = await navigator.serviceWorker.ready;
        const nouvel = abo || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid() });
        await enregistrerAbonnement(nouvel);
        toast("Notifications activées");
      }
    } catch (e) { toast(traduireErreur(e)); }
    majBlocsNotif();
  }
  $$("[data-notif] .notif-bouton").forEach((b) => b.addEventListener("click", basculerNotifications));
  // À chaque connexion, on s'assure que l'appareil déjà autorisé est bien enregistré
  async function verifierAbonnement() {
    try {
      if (!pushPossible() || Notification.permission !== "granted") return majBlocsNotif();
      const abo = await abonnementActuel();
      if (abo) await enregistrerAbonnement(abo);
    } catch { /* sans gravité */ }
    majBlocsNotif();
  }
  // Clic sur une notification alors que l'app est déjà ouverte
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
    const cible = e.data && e.data.aller && e.data.aller.replace("#", "");
    if (cible && etat.profil && etat.profil.statut === "approuve") afficherVue(cible === "admin" && !estAdmin() ? "accueil" : cible);
  });
  // Pastille sur l'icône de l'app : messages non lus + demandes en attente (admin)
  // On attend d'avoir les deux chiffres avant de toucher à la pastille, pour ne jamais l'effacer par erreur
  const compteurs = { messages: null, demandes: null };
  function majPastille() {
    if (compteurs.messages === null || (estAdmin() && compteurs.demandes === null)) return;
    const total = compteurs.messages + (estAdmin() ? compteurs.demandes : 0);
    try {
      if (total > 0 && navigator.setAppBadge) navigator.setAppBadge(total).catch(() => {});
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch { /* non offert sur cet appareil */ }
  }

  /* ---------------- Accueil ---------------- */
  async function initAccueil() {
    const p = etat.profil;
    const h = new Date().getHours();
    const prenom = (p.nom_complet || "").trim().split(/\s+/)[0] || "";
    $("#ac-bonjour").textContent = `${h >= 18 || h < 5 ? "Bonsoir" : "Bonjour"}${prenom ? ", " + prenom : ""}`;
    $("#ac-date").textContent = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
    $("#ac-unite").textContent = [p.grade, p.corps_police, p.unite].filter(Boolean).join(" · ");
    remplirAvatar($("#ac-avatar"), p);
    // Quart du jour
    const carte = $("#ac-quart");
    try {
      await chargerMonHoraire();
      if (!hr.config) {
        carte.innerHTML = `<span class="pastille-q q q-C">?</span><span><small>Mon horaire</small><strong>Configurer ma rotation</strong><em>Votre quart du jour s'affichera ici</em></span>`;
      } else {
        const auj = aujourdhuiISO(), q = quartDu(auj, hr);
        const demain = quartDu(isoDe(jourUTC(auj) + 1), hr);
        const travail = !!heuresJour(q.code, auj, hr);
        carte.innerHTML = `<span class="pastille-q q q-${esc(q.code || "C")}">${esc(q.code || "–")}</span>
          <span><small>Aujourd'hui</small><strong>${esc(q.code ? QUARTS[q.code].nom : "—")}${travail ? ` <span class="heures">${esc(heuresDe(q.code, hr, auj))}</span>` : ""}</strong>
          <em>Demain : ${esc(demain.code ? QUARTS[demain.code].nom : "—")}${q.note ? " · " + esc(q.note) : ""}</em></span>`;
      }
    } catch { carte.innerHTML = `<span class="pastille-q q q-C">–</span><span><small>Mon horaire</small><strong>Ouvrir l'horaire</strong></span>`; }
    compterMessages();
    afficherAnnonces();
    // Demandes en attente (admin)
    const ad = $("#ac-admin");
    if (p.role === "admin") {
      const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
      ad.hidden = false;
      ad.innerHTML = count
        ? `<b>${count}</b><span>demande${count > 1 ? "s" : ""} d'accès en attente</span><i>Voir ›</i>`
        : `<b class="zero">0</b><span>Aucune demande en attente</span><i>Admin ›</i>`;
      ad.classList.toggle("urgent", !!count);
    }
  }

  function allerA(cible) {
    if (cible === "vitesse") { afficherVue("csr"); $("[data-csr-onglet='vitesse']").click(); return; }
    if (cible === "position") { afficherVue("carte"); setTimeout(() => $("#btn-position").click(), 300); return; }
    afficherVue(cible);
    const champ = { csr: "#csr-q", carte: "#adresse-q", corps: "#corps-q" }[cible];
    if (champ) setTimeout(() => $(champ).focus(), 150);
  }
  $$("[data-aller]").forEach((b) => b.addEventListener("click", () => allerA(b.dataset.aller)));

  async function initHoraire() {
    if (!hr.chargé) {
      const { data, error } = await sb.from("horaires").select("config, exceptions, conjoint").eq("user_id", etat.profil.id).maybeSingle();
      if (error) return toast(traduireErreur(error));
      chargerDonneesHoraire(data);
    }
    await chargerEvenements();
    rendreHoraire();
    chargerPartages();
    chargerEchanges();
  }

  /* Partage de l'horaire */
  async function chargerPartages() {
    const [{ data, error }, poste] = await Promise.all([sb.rpc("mes_partages_v2"), sb.rpc("collegues_poste")]);
    if (error) return;
    hr.partages = data || [];
    hr.poste = (poste && poste.data) || [];
    const p = etat.profil;
    $("#hr-poste-titre").textContent = p.unite ? `Mon poste · ${p.unite}` : "Mon poste";
    majReglagePartage();
    $("#hr-poste-liste").innerHTML = !p.unite
      ? `<li class="vide-petit">Indiquez votre unité ou votre poste dans Mon compte pour voir les rotations de vos collègues.</li>`
      : hr.poste.length ? hr.poste.map((x) => `
      <li><span class="avec-pastille">${pastille(x.id, x.nom, "petit")}<span><b>${esc(x.nom)}</b><small>${esc(x.grade || "")}${x.a_rotation ? "" : (x.grade ? " · " : "") + "rotation pas encore configurée"}</small></span></span>
      ${x.a_rotation ? `<button class="btn-secondaire petit" data-voir="${x.id}">Voir</button>` : ""}</li>`).join("")
      : `<li class="vide-petit">Aucun autre membre de votre poste n'utilise encore l'app.</li>`;
    const donnes = hr.partages.filter((x) => x.sens === "donne");
    const recus = hr.partages.filter((x) => x.sens === "recu");
    $("#hr-partages-donnes").innerHTML = donnes.length ? donnes.map((x) => `
      <li><span class="avec-pastille">${pastille(x.id, x.nom || x.email, "petit")}<span><b>${esc(x.nom || x.email)}</b><small>${esc([x.grade, x.corps, x.unite].filter(Boolean).join(" · ") || x.email)}</small></span></span>
      <button class="btn-danger petit" data-retirer="${x.id}">Retirer</button></li>`).join("")
      : `<li class="vide-petit">Votre horaire n'est partagé avec personne.</li>`;
    $("#hr-partages-recus").innerHTML = recus.length ? recus.map((x) => `
      <li><span class="avec-pastille">${pastille(x.id, x.nom || x.email, "petit")}<span><b>${esc(x.nom || x.email)}</b><small>${esc([x.grade, x.corps, x.unite].filter(Boolean).join(" · ") || x.email)}</small></span></span>
      <span class="fc-ligne"><button class="btn-secondaire petit" data-voir="${x.id}">Voir</button><button class="lien" data-quitter="${x.id}">Ne plus recevoir</button></span></li>`).join("")
      : `<li class="vide-petit">Personne ne vous a encore partagé son horaire.</li>`;
    const sel = $("#hr-qui");
    const duPoste = hr.poste.filter((x) => x.a_rotation);
    const autres = recus.filter((x) => !duPoste.some((y) => y.id === x.id));
    sel.innerHTML = `<option value="">Mon horaire</option>` +
      (duPoste.length ? `<optgroup label="Mon poste">${duPoste.map((x) => `<option value="${x.id}">${esc(x.nom)}</option>`).join("")}</optgroup>` : "") +
      (autres.length ? `<optgroup label="Partagés avec moi">${autres.map((x) => `<option value="${x.id}">${esc(x.nom || x.email)}</option>`).join("")}</optgroup>` : "");
    sel.value = hr.vue ? hr.vue.id : "";
    hr.quiVisible = !!(duPoste.length || autres.length);
    $("#hr-qui-bloc").hidden = !hr.quiVisible || hr.cible === "conjoint";
    ["#hr-poste-liste", "#hr-partages-donnes", "#hr-partages-recus"].forEach((s) => hydraterPastilles($(s)));
    $$("[data-retirer]").forEach((b) => b.addEventListener("click", () => retirerPartage(etat.profil.id, b.dataset.retirer, "Partage retiré")));
    $$("[data-quitter]").forEach((b) => b.addEventListener("click", () => retirerPartage(b.dataset.quitter, etat.profil.id, "Vous ne recevez plus cet horaire")));
    $$("[data-voir]").forEach((b) => b.addEventListener("click", () => { $("#hr-qui").value = b.dataset.voir; afficherHoraireDe(b.dataset.voir); window.scrollTo(0, 0); $("#vue-horaire").scrollTo(0, 0); }));
  }
  async function retirerPartage(proprietaire, destinataire, message) {
    const { error } = await sb.from("partages_horaire").delete().eq("proprietaire", proprietaire).eq("destinataire", destinataire);
    if (error) return toast(traduireErreur(error));
    if (hr.vue && (hr.vue.id === proprietaire)) { hr.vue = null; rendreHoraire(); }
    toast(message);
    chargerPartages();
  }
  async function afficherHoraireDe(id) {
    if (!id) { hr.vue = null; rendreHoraire(); return; }
    const pers = hr.partages.find((x) => x.id === id && x.sens === "recu") || (hr.poste || []).find((x) => x.id === id);
    // Seulement la rotation : les exceptions et les notes restent privées (vérifié aussi par la base de données)
    const { data, error } = await sb.rpc("rotation_collegue", { p_id: id });
    if (error) return toast(traduireErreur(error));
    hr.vue = { id, nom: pers ? pers.nom || pers.email : "Collègue", config: data && data.cycle ? data : null, exceptions: {} };
    rendreHoraire();
  }
  $("#hr-qui").addEventListener("change", (e) => afficherHoraireDe(e.target.value));
  $("#hr-form-partage").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const champ = $("#hr-partage-courriel");
    const courriel = champ.value.trim();
    if (!courriel || !champ.checkValidity()) { champ.focus(); return toast("Entrez le courriel d'un collègue inscrit à Police Management"); }
    const btn = $("#hr-form-partage button");
    btn.disabled = true;
    const { data, error } = await sb.rpc("partager_horaire", { p_email: courriel });
    btn.disabled = false;
    if (error) return toast(traduireErreur(error));
    champ.value = "";
    toast(`Horaire partagé avec ${data}`);
    chargerPartages();
  });

  async function sauverHoraire() {
    const conjoint = hr.conj ? { nom: hr.conj.nom, config: hr.conj.config || null, exceptions: hr.conj.exceptions || {} } : null;
    const { error } = await sb.from("horaires").upsert({ user_id: etat.profil.id, config: hr.config || {}, exceptions: hr.exceptions, conjoint, maj_le: new Date().toISOString() });
    if (error) throw error;
  }

  function rendreHoraire() {
    const src = affichee();
    const lecture = !!hr.vue;
    const conj = !lecture && hr.cible === "conjoint" && !!hr.conj;
    if (lecture) $("#hr-form").hidden = true;
    const enConfig = !$("#hr-form").hidden;
    $("#hr-titre").textContent = lecture ? `Horaire de ${hr.vue.nom}` : conj ? `Horaire de ${hr.conj.nom}` : "Mon horaire";
    $("#hr-cible").hidden = lecture || !hr.conj;
    $$("[data-cible]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cible === (conj ? "conjoint" : "moi"))));
    if (hr.conj) $("#hr-cible-conj").textContent = hr.conj.nom;
    $("#hr-qui-bloc").hidden = conj || !hr.quiVisible;
    $("#hr-echanges").hidden = lecture || conj || enConfig;
    $$(".hr-moi-seul").forEach((el) => (el.hidden = conj));
    $("#hr-vide-aide").textContent = conj ? `Entrez la rotation de ${hr.conj.nom} une seule fois : vous verrez ses quarts à côté des vôtres. Ce calendrier reste privé.` : "Configurez votre rotation une seule fois. L'app calcule ensuite votre horaire pour les mois à venir.";
    $("#hr-commencer").textContent = conj ? `Configurer la rotation de ${hr.conj.nom}` : "Configurer ma rotation";
    $("#hr-vide").hidden = lecture || !!affichee().config || enConfig;
    $("#hr-principal").hidden = !src.config || enConfig;
    $("#hr-lecture-vide").hidden = !(lecture && !src.config);
    $("#hr-partage").hidden = lecture || conj || enConfig;
    $$(".hr-mes-actions").forEach((el) => (el.hidden = lecture));
    $("#hr-astuce").textContent = lecture ? "Rotation seulement, en lecture seule. Les vacances, congés personnels et notes de votre collègue restent privés." : "Touchez une journée pour voir son agenda ou noter une exception. Glissez pour changer de période.";
    if (!src.config) { $("#hr-resume").textContent = lecture ? "Horaire partagé" : "Aucune rotation configurée"; return; }
    $("#hr-resume").textContent = `${lecture ? "Rotation seulement · " : conj ? "Calendrier 2 · privé · " : ""}Cycle de ${src.config.cycle.length} jours${src.config.hybride ? " · hybride" : ""}`;
    const auj = aujourdhuiISO();
    // Aujourd'hui
    const q = quartDu(auj);
    const travail = !!heuresJour(q.code, auj);
    $("#hr-aujourdhui").innerHTML = `
      <span class="pastille-q q q-${esc(q.code || "C")}">${esc(q.code || "–")}</span>
      <small>Aujourd'hui · ${esc(new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }))}</small>
      <div><strong>${esc(QUARTS[q.code] ? QUARTS[q.code].nom : "—")}</strong> ${travail ? `<span class="heures">${esc(heuresDe(q.code, undefined, auj))}</span>` : ""}</div>
      ${q.note ? `<span class="note">${esc(q.note)}</span>` : ""}`;
    // 7 prochains jours
    const n0 = jourUTC(auj);
    $("#hr-semaine").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const iso = isoDe(n0 + i), qq = quartDu(iso);
      const d = new Date(iso + "T12:00:00");
      return `<div class="q q-${esc(qq.code || "C")} ${i === 0 ? "auj" : ""}"><small>${esc(d.toLocaleDateString("fr-CA", { weekday: "short" }).replace(".", ""))}</small><b>${esc(qq.code || "–")}</b><small>${d.getDate()}</small></div>`;
    }).join("");
    rendreCalendrier();
  }


  /* ---------------- Calendrier façon Apple : vues Jour, Semaine, Mois, Liste, événements privés ---------------- */
  const CALENDRIERS = {
    perso: { nom: "Personnel", c: "#2F6BFF" }, travail: { nom: "Travail", c: "#E0A21B" }, famille: { nom: "Famille", c: "#1E9E5A" },
    cour: { nom: "Cour", c: "#D93644" }, formation: { nom: "Formation", c: "#7B4FC9" }, autre: { nom: "Autre", c: "#64748B" },
  };
  const REPETITIONS = { aucune: "Jamais", jour: "Chaque jour", semaine: "Chaque semaine", "2semaines": "Toutes les 2 semaines", mois: "Chaque mois", annee: "Chaque année" };
  const RAPPELS = [["", "Aucun", "Aucun"], ["0", "Au moment de l'événement", "Le jour même (9 h)"], ["5", "5 minutes avant"], ["15", "15 minutes avant"], ["30", "30 minutes avant"],
    ["60", "1 heure avant"], ["120", "2 heures avant"], ["1440", "1 jour avant", "La veille (9 h)"], ["2880", "2 jours avant", "2 jours avant (9 h)"], ["10080", "1 semaine avant", "1 semaine avant (9 h)"]];
  const lireLocal = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const ecrireLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
  const cal = { vue: lireLocal("pm-cal-vue", "mois"), date: aujourdhuiISO(), sel: aujourdhuiISO(), evs: [], chargé: false, masques: new Set(lireLocal("pm-cal-masques", [])), edition: null };
  const H_HEURE = 48; // hauteur d'une heure dans les vues Jour et Semaine
  const isoLoc = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ajoutJours = (iso, n) => isoDe(jourUTC(iso) + n);
  const minuit = (iso) => new Date(iso + "T00:00:00");
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const heureCourte = (d) => `${d.getHours()} h${d.getMinutes() ? " " + String(d.getMinutes()).padStart(2, "0") : ""}`; // 17 h, 9 h 30
  const lundiDe = (iso) => ajoutJours(iso, -((minuit(iso).getDay() + 6) % 7));
  const avecEvenements = () => !hr.vue && hr.cible !== "conjoint"; // événements privés : jamais affichés pour un collègue ni dans le calendrier du conjoint

  async function chargerEvenements(forcer = false) {
    if (cal.chargé && !forcer) return;
    const { data, error } = await sb.from("evenements").select("*").order("debut");
    if (error) { toast(traduireErreur(error)); return; }
    cal.evs = data || [];
    cal.chargé = true;
  }

  // Toutes les occurrences (répétitions comprises) qui touchent l'intervalle [deb, fin[
  function occurrences(deb, fin) {
    const res = [];
    if (!avecEvenements()) return res;
    for (const ev of cal.evs) {
      if (cal.masques.has(ev.calendrier)) continue;
      const d0 = new Date(ev.debut), duree = new Date(ev.fin) - d0;
      const limite = ev.repetition_fin ? new Date(ev.repetition_fin + "T23:59:59") : null;
      const ajouter = (d) => { const f = new Date(d.getTime() + duree); if (d < fin && (f > deb || (duree === 0 && d >= deb))) res.push({ ev, debut: d, fin: f }); };
      if (ev.repetition === "aucune") { ajouter(d0); continue; }
      const parMois = ev.repetition === "mois" ? 1 : ev.repetition === "annee" ? 12 : 0;
      const pasJours = { jour: 1, semaine: 7, "2semaines": 14 }[ev.repetition] || 0;
      let k = parMois
        ? Math.max(0, Math.floor(((deb.getFullYear() - d0.getFullYear()) * 12 + deb.getMonth() - d0.getMonth()) / parMois) - 1 - Math.ceil(duree / (28 * MS_JOUR * parMois)))
        : Math.max(0, Math.floor((deb - d0 - duree) / (pasJours * MS_JOUR)) - 1);
      for (let i = 0; i < 1000; i++, k++) {
        const d = new Date(d0);
        if (parMois) { d.setMonth(d0.getMonth() + k * parMois); if (d.getDate() !== d0.getDate()) continue; } // 31 du mois, 29 février : sauté comme dans Calendrier
        else d.setDate(d0.getDate() + k * pasJours);
        if (d >= fin || (limite && d > limite)) break;
        ajouter(d);
      }
    }
    return res.sort((a, b) => isoLoc(a.debut).localeCompare(isoLoc(b.debut)) || (b.ev.journee - a.ev.journee) || (a.debut - b.debut));
  }
  const occDuJour = (iso) => occurrences(minuit(iso), minuit(ajoutJours(iso, 1)));
  const couleurEv = (ev) => (CALENDRIERS[ev.calendrier] || CALENDRIERS.perso).c;
  const rotationVisible = () => !cal.masques.has("rotation");
  function plageTexte(o, iso) {
    if (o.ev.journee) return "Toute la journée";
    const memeDebut = isoLoc(o.debut) === iso, memeFin = isoLoc(new Date(o.fin - 1)) === iso;
    if (memeDebut && memeFin) return `${heureCourte(o.debut)} – ${heureCourte(o.fin)}`;
    if (memeDebut) return `À partir de ${heureCourte(o.debut)}`;
    if (memeFin) return `Jusqu'à ${heureCourte(o.fin)}`;
    return "Toute la journée";
  }

  function rendreCalendrier() {
    const lecture = !!hr.vue;
    $$("[data-cal-vue]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.calVue === cal.vue)));
    $("#cal-ajout").hidden = lecture;
    $("#cal-mois").hidden = cal.vue !== "mois";
    $("#cal-temps").hidden = !["jour", "semaine"].includes(cal.vue);
    $("#cal-liste").hidden = cal.vue !== "liste";
    $("#hr-prec").hidden = $("#hr-suiv").hidden = cal.vue === "liste";
    $("#cal-temps").classList.toggle("une-colonne", cal.vue === "jour");
    if (cal.vue === "mois") rendreMois();
    else if (cal.vue === "liste") rendreListe();
    else rendreTemps();
    $("#hr-legende").innerHTML = Object.entries(QUARTS).map(([k, v]) => `<span><i class="q q-${k}"></i>${k} ${esc(v.nom)}</span>`).join("");
  }

  // Vue Mois : grille avec le quart et des points de couleur, agenda du jour choisi en dessous (comme sur iPhone)
  function rendreMois() {
    const [a, m] = cal.date.split("-").map(Number);
    $("#hr-mois").textContent = new Date(a, m - 1, 15).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
    const debutGrille = lundiDe(`${a}-${String(m).padStart(2, "0")}-01`);
    const nbJoursMois = new Date(a, m, 0).getDate();
    const nbSemaines = Math.ceil((jourUTC(`${a}-${String(m).padStart(2, "0")}-01`) - jourUTC(debutGrille) + nbJoursMois) / 7);
    const occs = occurrences(minuit(debutGrille), minuit(ajoutJours(debutGrille, nbSemaines * 7)));
    const parJour = {};
    for (const o of occs) {
      for (let d = isoLoc(o.debut); d <= isoLoc(new Date(Math.max(o.fin - 1, o.debut))); d = ajoutJours(d, 1)) (parJour[d] = parJour[d] || []).push(o);
    }
    const auj = aujourdhuiISO();
    let html = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => `<span class="jsem">${j}</span>`).join("");
    for (let i = 0; i < nbSemaines * 7; i++) {
      const iso = ajoutJours(debutGrille, i), qq = quartDu(iso);
      const dansMois = Number(iso.slice(5, 7)) === m;
      const evs = parJour[iso] || [];
      html += `<button data-jour="${iso}" class="${dansMois ? "" : "hors"} ${iso === auj ? "auj" : ""} ${iso === cal.sel ? "choisi" : ""} ${qq.exception && rotationVisible() ? "exc" : ""}" aria-label="${esc(new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }))} : ${esc(QUARTS[qq.code] ? QUARTS[qq.code].nom : "aucun quart")}${evs.length ? `, ${evs.length} événement${evs.length > 1 ? "s" : ""}` : ""}">
        <span class="num">${Number(iso.slice(8))}</span>${qq.code && rotationVisible() ? `<span class="chip q q-${esc(qq.code)}">${esc(qq.code)}</span>` : ""}
        <span class="points">${evs.slice(0, 3).map((o) => `<i style="background:${couleurEv(o.ev)}"></i>`).join("")}</span></button>`;
    }
    $("#hr-grille").innerHTML = html;
    $$("#hr-grille button").forEach((b) => b.addEventListener("click", () => { cal.sel = b.dataset.jour; rendreMois(); }));
    rendreAgenda(cal.sel);
  }

  function rendreAgenda(iso) {
    const lecture = !!hr.vue, qq = quartDu(iso), occs = occDuJour(iso);
    const travail = !!heuresJour(qq.code, iso);
    const peutOffrir = !lecture && hr.cible !== "conjoint" && ["J", "S", "N", "X"].includes(qq.code) && iso >= aujourdhuiISO();
    $("#cal-agenda").innerHTML = `
      <h4>${esc(new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }))}</h4>
      ${rotationVisible() && qq.code ? `<button type="button" class="ag-quart" data-quart="${iso}">
        <span class="chip-grand q q-${esc(qq.code)}">${esc(qq.code)}</span>
        <span><b>${esc(QUARTS[qq.code].nom)}</b>${travail ? ` <span class="ref">${esc(heuresDe(qq.code, undefined, iso))}</span>` : ""}${qq.note ? `<small>${esc(qq.note)}</small>` : ""}</span>
        ${lecture ? "" : `<i>Modifier</i>`}</button>${peutOffrir ? `<button type="button" class="lien ag-offrir" data-offrir="${iso}">Offrir ce quart à mon poste</button>` : ""}` : ""}
      ${occs.map((o) => `<button type="button" class="ag-ev" data-ev="${o.ev.id}" data-occ="${o.debut.toISOString()}" style="--c:${couleurEv(o.ev)}">
        <span class="ag-heure">${esc(plageTexte(o, iso))}</span><span><b>${esc(o.ev.titre)}</b>${o.ev.lieu ? `<small>${esc(o.ev.lieu)}</small>` : ""}</span></button>`).join("")}
      ${!occs.length && avecEvenements() ? `<p class="aide">Aucun événement.</p>` : ""}
      ${lecture ? "" : `<button type="button" class="btn-secondaire petit ag-ajout" data-ajout="${iso}">+ Ajouter un événement</button>`}`;
    brancherCal($("#cal-agenda"));
  }

  // Vues Jour et Semaine : grille horaire avec les quarts en bandes et les événements positionnés
  function rendreTemps() {
    const jours = cal.vue === "jour" ? [cal.date] : Array.from({ length: 7 }, (_, i) => ajoutJours(lundiDe(cal.date), i));
    const premier = minuit(jours[0]), dernier = minuit(jours[jours.length - 1]);
    $("#hr-mois").textContent = cal.vue === "jour"
      ? premier.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })
      : `${premier.toLocaleDateString("fr-CA", { day: "numeric", month: premier.getMonth() === dernier.getMonth() ? undefined : "short" })} – ${dernier.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}`;
    const auj = aujourdhuiISO(), lecture = !!hr.vue;
    $("#cal-entetes").innerHTML = `<span></span>` + jours.map((iso) => {
      const d = minuit(iso);
      return `<button type="button" data-allerjour="${iso}" class="${iso === auj ? "auj" : ""}"><small>${esc(d.toLocaleDateString("fr-CA", { weekday: "short" }).replace(".", ""))}</small><b>${d.getDate()}</b></button>`;
    }).join("");
    $("#cal-jourentier").innerHTML = `<span class="ref">jour</span>` + jours.map((iso) => {
      const qq = quartDu(iso);
      const entiers = occDuJour(iso).filter((o) => o.ev.journee || (o.fin - o.debut >= MS_JOUR));
      return `<div>${qq.code && rotationVisible() ? `<button type="button" class="chip q q-${esc(qq.code)}" data-quart="${iso}" title="${esc(QUARTS[qq.code].nom)}">${esc(cal.vue === "jour" ? QUARTS[qq.code].nom : qq.code)}</button>` : ""}
        ${entiers.map((o) => `<button type="button" class="ev-entier" data-ev="${o.ev.id}" data-occ="${o.debut.toISOString()}" style="--c:${couleurEv(o.ev)}">${esc(o.ev.titre)}</button>`).join("")}</div>`;
    }).join("");
    $("#cal-heures").innerHTML = Array.from({ length: 24 }, (_, h) => `<span>${h ? `${h} h` : ""}</span>`).join("");
    $("#cal-colonnes").innerHTML = jours.map((iso) => {
      const debutJ = minuit(iso), finJ = minuit(ajoutJours(iso, 1));
      let bandes = "";
      if (rotationVisible()) {
        // Quart du jour, et la fin d'un quart de nuit commencé la veille
        for (const [jourQ, decal] of [[iso, 0], [ajoutJours(iso, -1), -1]]) {
          const qq = quartDu(jourQ);
          const h = heuresJour(qq.code, jourQ);
          if (!h) continue;
          const [h0, m0] = h[0].split(":").map(Number), [h1, m1] = h[1].split(":").map(Number);
          let a = h0 * 60 + m0, b = h1 * 60 + m1;
          if (b <= a) b += 1440;
          a += decal * 1440; b += decal * 1440;
          const top = Math.max(a, 0), bas = Math.min(b, 1440);
          if (bas <= top) continue;
          bandes += `<div class="cal-bande q q-${qq.code}" style="top:${top * H_HEURE / 60}px;height:${(bas - top) * H_HEURE / 60}px"><span>${esc(QUARTS[qq.code].nom)} ${esc(h[0])}–${esc(h[1])}</span></div>`;
        }
      }
      // Événements avec heure : colonnes côte à côte quand ils se chevauchent
      const occs = occurrences(debutJ, finJ).filter((o) => !o.ev.journee && o.fin - o.debut < MS_JOUR);
      const blocs = occs.map((o) => ({ o, a: Math.max(0, (o.debut - debutJ) / 60000), b: Math.min(1440, (o.fin - debutJ) / 60000) }));
      const voies = []; let groupe = [], finGroupe = -1, html = "";
      const vider = () => { const n = Math.max(1, ...groupe.map((x) => x.voie + 1)); groupe.forEach((x) => (x.n = n)); groupe = []; };
      for (const x of blocs) {
        if (x.a >= finGroupe && groupe.length) { vider(); voies.length = 0; }
        let v = voies.findIndex((f) => f <= x.a); if (v < 0) { v = voies.length; voies.push(0); }
        voies[v] = Math.max(x.b, x.a + 20); x.voie = v; groupe.push(x); finGroupe = Math.max(finGroupe, voies[v]);
      }
      if (groupe.length) vider();
      for (const x of blocs) {
        const haut = Math.max(22, (x.b - x.a) * H_HEURE / 60);
        html += `<button type="button" class="cal-ev" data-ev="${x.o.ev.id}" data-occ="${x.o.debut.toISOString()}" style="--c:${couleurEv(x.o.ev)};top:${x.a * H_HEURE / 60}px;height:${haut}px;left:calc(${(x.voie / x.n) * 100}% + 2px);width:calc(${100 / x.n}% - 4px)">
          <b>${esc(x.o.ev.titre)}</b>${haut > 34 ? `<small>${esc(heureCourte(x.o.debut))}${x.o.ev.lieu ? " · " + esc(x.o.ev.lieu) : ""}</small>` : ""}</button>`;
      }
      const maintenant = iso === auj ? `<div class="cal-maintenant" style="top:${(new Date().getHours() * 60 + new Date().getMinutes()) * H_HEURE / 60}px"></div>` : "";
      return `<div class="cal-col ${iso === auj ? "auj" : ""}" data-col="${iso}">${bandes}${html}${maintenant}</div>`;
    }).join("");
    brancherCal($("#cal-temps"));
    if (!lecture) $$("#cal-colonnes .cal-col").forEach((col) => col.addEventListener("click", (e) => {
      if (e.target !== col && !e.target.classList.contains("cal-bande")) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const h = Math.min(23, Math.max(0, Math.floor(y / H_HEURE)));
      editerEvenement(null, { iso: col.dataset.col, heure: `${String(h).padStart(2, "0")}:00` });
    }));
    // Défile vers le début de la journée (ou l'heure actuelle)
    const cible = jours.includes(auj) ? Math.max(0, new Date().getHours() - 2) : 7;
    requestAnimationFrame(() => { $("#cal-defile").scrollTop = cible * H_HEURE; });
  }

  // Vue Liste : événements à venir, ou résultats de recherche
  function rendreListe() {
    $("#hr-mois").textContent = "À venir";
    const q = $("#cal-recherche").value.trim().toLowerCase();
    const auj = aujourdhuiISO();
    let occs;
    if (q) {
      $("#hr-mois").textContent = "Recherche";
      occs = occurrences(minuit(ajoutJours(auj, -365)), minuit(ajoutJours(auj, 366)))
        .filter((o) => [o.ev.titre, o.ev.lieu, o.ev.notes].some((t) => (t || "").toLowerCase().includes(q)));
    } else occs = occurrences(minuit(auj), minuit(ajoutJours(auj, 120)));
    occs = occs.slice(0, 250);
    if (!avecEvenements()) { $("#cal-liste-contenu").innerHTML = `<p class="vide">Les événements de vos collègues restent privés.</p>`; return; }
    if (!occs.length) {
      $("#cal-liste-contenu").innerHTML = `<p class="vide">${q ? "Aucun événement ne correspond à cette recherche." : "Aucun événement dans les 4 prochains mois. Touchez + pour en ajouter un."}</p>`;
      return;
    }
    let html = "", jourCourant = "";
    for (const o of occs) {
      const iso = isoLoc(o.debut);
      if (iso !== jourCourant) {
        if (jourCourant) html += `</div>`;
        jourCourant = iso;
        const qq = quartDu(iso);
        html += `<h4 class="liste-jour ${iso === auj ? "auj" : ""}">${esc(new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: iso.slice(0, 4) === auj.slice(0, 4) ? undefined : "numeric" }))}
          ${qq.code && rotationVisible() ? `<span class="chip q q-${esc(qq.code)}">${esc(qq.code)}</span>` : ""}</h4><div class="liste-groupe">`;
      }
      html += `<button type="button" class="ag-ev" data-ev="${o.ev.id}" data-occ="${o.debut.toISOString()}" style="--c:${couleurEv(o.ev)}">
        <span class="ag-heure">${esc(plageTexte(o, iso))}</span><span><b>${esc(o.ev.titre)}</b>${o.ev.lieu ? `<small>${esc(o.ev.lieu)}</small>` : ""}</span></button>`;
    }
    $("#cal-liste-contenu").innerHTML = html + "</div>";
    brancherCal($("#cal-liste-contenu"));
  }
  $("#cal-recherche").addEventListener("input", () => rendreListe());

  function brancherCal(racine) {
    $$("[data-ev]", racine).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (!hr.vue) editerEvenement(cal.evs.find((x) => x.id === b.dataset.ev)); }));
    $$("[data-ajout]", racine).forEach((b) => b.addEventListener("click", () => editerEvenement(null, { iso: b.dataset.ajout })));
    $$("[data-quart]", racine).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); ouvrirJour(b.dataset.quart); }));
    $$("[data-offrir]", racine).forEach((b) => b.addEventListener("click", () => ouvrirOffre(b.dataset.offrir)));
    $$("[data-allerjour]", racine).forEach((b) => b.addEventListener("click", () => { cal.date = cal.sel = b.dataset.allerjour; changerVue("jour"); }));
  }

  function changerVue(v) { cal.vue = v; ecrireLocal("pm-cal-vue", v); rendreCalendrier(); }
  $$("[data-cal-vue]").forEach((b) => b.addEventListener("click", () => { if (cal.vue === "mois" || cal.vue === "liste") cal.date = cal.sel; changerVue(b.dataset.calVue); }));
  function deplacer(sens) {
    if (cal.vue === "mois") { const d = minuit(cal.date.slice(0, 8) + "01"); d.setMonth(d.getMonth() + sens); cal.date = isoLoc(d); const [a, m] = cal.sel.split("-"); if (`${a}-${m}` !== cal.date.slice(0, 7)) cal.sel = cal.date; }
    else if (cal.vue === "semaine") cal.date = cal.sel = ajoutJours(cal.date, 7 * sens);
    else if (cal.vue === "jour") cal.date = cal.sel = ajoutJours(cal.date, sens);
    rendreCalendrier();
  }
  $("#hr-prec").addEventListener("click", () => deplacer(-1));
  $("#hr-suiv").addEventListener("click", () => deplacer(1));
  $("#hr-auj").addEventListener("click", () => { cal.date = cal.sel = aujourdhuiISO(); if (cal.vue === "liste") $("#cal-recherche").value = ""; rendreCalendrier(); });
  $("#cal-ajout").addEventListener("click", () => editerEvenement(null, { iso: cal.vue === "liste" ? aujourdhuiISO() : cal.sel }));
  // Glisser pour changer de période
  {
    let x0 = null, y0 = 0;
    $("#cal-zone").addEventListener("touchstart", (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    $("#cal-zone").addEventListener("touchend", (e) => {
      if (x0 === null || cal.vue === "liste") return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) deplacer(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // Calendriers affichés
  function rendreCalendriersChoix() {
    const lignes = [["rotation", "Rotation (quarts de travail)", "var(--ambre-vif)"], ...Object.entries(CALENDRIERS).map(([k, v]) => [k, v.nom, v.c])];
    $("#cals-liste").innerHTML = lignes.map(([k, nom, c]) => `<label class="ev-ligne interrupteur" for="cal-m-${k}">
      <span class="interrupteur-txt"><span class="cal-pastille" style="background:${c}"></span>${esc(nom)}</span>
      <input type="checkbox" id="cal-m-${k}" data-masque="${k}" role="switch" ${cal.masques.has(k) ? "" : "checked"}><span class="interrupteur-piste" aria-hidden="true"></span></label>`).join("");
    $$("[data-masque]").forEach((c) => c.addEventListener("change", () => {
      if (c.checked) cal.masques.delete(c.dataset.masque); else cal.masques.add(c.dataset.masque);
      ecrireLocal("pm-cal-masques", [...cal.masques]);
      rendreCalendrier();
    }));
  }
  $("#cal-calendriers").addEventListener("click", () => { rendreCalendriersChoix(); $("#cals-voile").hidden = false; });
  $("#cals-fermer").addEventListener("click", () => ($("#cals-voile").hidden = true));
  $("#cals-voile").addEventListener("click", (e) => { if (e.target.id === "cals-voile") e.target.hidden = true; });

  // Éditeur d'événement
  $("#ev-repetition").innerHTML = Object.entries(REPETITIONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("#ev-calendrier").innerHTML = Object.entries(CALENDRIERS).map(([k, v]) => `<option value="${k}">● ${esc(v.nom)}</option>`).join("");
  function majRappels() {
    const journee = $("#ev-journee").checked, val = $("#ev-rappel").value;
    $("#ev-rappel").innerHTML = RAPPELS.filter((r) => !journee || ["", "0", "1440", "2880", "10080"].includes(r[0]))
      .map((r) => `<option value="${r[0]}">${esc(journee && r[2] ? r[2] : r[1])}</option>`).join("");
    if ([...$("#ev-rappel").options].some((o) => o.value === val)) $("#ev-rappel").value = val;
  }
  function majChampsEv() {
    const j = $("#ev-journee").checked;
    $("#ev-debut-h").hidden = $("#ev-fin-h").hidden = j;
    $("#ev-bloc-rep-fin").hidden = $("#ev-repetition").value === "aucune";
    $("#ev-calendrier").style.color = couleurEv({ calendrier: $("#ev-calendrier").value });
    majRappels();
  }
  $("#ev-journee").addEventListener("change", majChampsEv);
  $("#ev-repetition").addEventListener("change", majChampsEv);
  $("#ev-calendrier").addEventListener("change", majChampsEv);
  // La fin suit le début quand on déplace le début (même durée), comme dans Calendrier
  let dureeEv = 3600000;
  const lireDebut = () => new Date(`${$("#ev-debut-d").value}T${$("#ev-journee").checked ? "00:00" : $("#ev-debut-h").value || "00:00"}`);
  const lireFin = () => new Date(`${$("#ev-fin-d").value}T${$("#ev-journee").checked ? "00:00" : $("#ev-fin-h").value || "00:00"}`);
  ["#ev-debut-d", "#ev-debut-h"].forEach((id) => $(id).addEventListener("change", () => {
    const d = lireDebut(); if (isNaN(d)) return;
    const f = new Date(d.getTime() + dureeEv);
    $("#ev-fin-d").value = isoLoc(f); $("#ev-fin-h").value = hhmm(f);
  }));
  ["#ev-fin-d", "#ev-fin-h"].forEach((id) => $(id).addEventListener("change", () => { const x = lireFin() - lireDebut(); if (x >= 0) dureeEv = x; }));

  function editerEvenement(ev, defaut = {}) {
    cal.edition = ev || null;
    $("#ev-entete").textContent = ev ? "Modifier l'événement" : "Nouvel événement";
    $("#ev-ok").textContent = ev ? "OK" : "Ajouter";
    $("#ev-supprimer").hidden = !ev;
    $("#ev-supprimer").textContent = ev && ev.repetition !== "aucune" ? "Supprimer toute la série" : "Supprimer l'événement";
    $("#ev-aide").textContent = ev && ev.repetition !== "aucune"
      ? "Événement répété : les changements s'appliquent à toute la série. Privé : vos collègues ne voient jamais vos événements."
      : "Privé : vos collègues ne voient jamais vos événements, seulement votre rotation.";
    let debut, fin;
    if (ev) { debut = new Date(ev.debut); fin = new Date(ev.fin); if (ev.journee) fin = new Date(fin.getTime() - MS_JOUR); }
    else {
      const iso = defaut.iso || aujourdhuiISO();
      let h = defaut.heure;
      if (!h) { const n = new Date(); h = `${String(Math.min(23, n.getHours() + 1)).padStart(2, "0")}:00`; }
      debut = new Date(`${iso}T${h}`); fin = new Date(debut.getTime() + 3600000);
    }
    $("#ev-titre").value = ev ? ev.titre : "";
    $("#ev-lieu").value = ev ? ev.lieu || "" : "";
    $("#ev-journee").checked = ev ? ev.journee : false;
    $("#ev-debut-d").value = isoLoc(debut); $("#ev-debut-h").value = hhmm(debut);
    $("#ev-fin-d").value = isoLoc(fin); $("#ev-fin-h").value = hhmm(fin);
    dureeEv = Math.max(0, fin - debut) || 3600000;
    $("#ev-repetition").value = ev ? ev.repetition : "aucune";
    $("#ev-rep-fin").value = ev && ev.repetition_fin ? ev.repetition_fin : "";
    $("#ev-calendrier").value = ev ? ev.calendrier : (lireLocal("pm-cal-dernier", "perso"));
    majChampsEv();
    $("#ev-rappel").value = ev ? (ev.rappel_min == null ? "" : String(ev.rappel_min)) : "";
    $("#ev-notes").value = ev ? ev.notes || "" : "";
    $("#ev-supprimer").dataset.arme = "";
    $("#ev-voile").hidden = false;
    if (!ev) setTimeout(() => $("#ev-titre").focus(), 250);
  }
  const fermerEv = () => { $("#ev-voile").hidden = true; cal.edition = null; };
  $("#ev-annuler").addEventListener("click", fermerEv);
  $("#ev-voile").addEventListener("click", (e) => { if (e.target.id === "ev-voile") fermerEv(); });
  $("#ev-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = $("#ev-titre").value.trim();
    if (!titre) { $("#ev-titre").focus(); return toast("Donnez un titre à l'événement"); }
    const journee = $("#ev-journee").checked;
    let debut = lireDebut(), fin = lireFin();
    if (isNaN(debut) || isNaN(fin)) return toast("Choisissez la date de début et de fin");
    if (journee) fin = new Date(minuit(isoLoc(fin)).getTime() + MS_JOUR); // fin exclusive : lendemain à minuit
    if (fin < debut) return toast("La fin doit être après le début");
    const rep = $("#ev-repetition").value;
    const donnees = {
      titre, lieu: $("#ev-lieu").value.trim() || null, notes: $("#ev-notes").value.trim() || null,
      debut: debut.toISOString(), fin: fin.toISOString(), journee, calendrier: $("#ev-calendrier").value,
      repetition: rep, repetition_fin: rep !== "aucune" && $("#ev-rep-fin").value ? $("#ev-rep-fin").value : null,
      rappel_min: $("#ev-rappel").value === "" ? null : Number($("#ev-rappel").value), modifie_le: new Date().toISOString(),
    };
    const btn = $("#ev-ok"); btn.disabled = true;
    const req = cal.edition ? sb.from("evenements").update(donnees).eq("id", cal.edition.id).select().single() : sb.from("evenements").insert(donnees).select().single();
    const { data, error } = await req;
    btn.disabled = false;
    if (error) return toast(traduireErreur(error));
    if (cal.edition) cal.evs = cal.evs.map((x) => (x.id === data.id ? data : x)); else cal.evs.push(data);
    ecrireLocal("pm-cal-dernier", donnees.calendrier);
    const nouveau = !cal.edition;
    fermerEv();
    if (nouveau) cal.sel = isoLoc(debut);
    rendreCalendrier();
    toast(nouveau ? (donnees.rappel_min != null ? "Événement ajouté, avec rappel" : "Événement ajouté") : "Événement modifié");
    if (donnees.rappel_min != null && !(await verifierAbonnementSilencieux())) setTimeout(() => toast("Activez les notifications dans Réglages pour recevoir le rappel"), 2600);
  });
  $("#ev-supprimer").addEventListener("click", async () => {
    const b = $("#ev-supprimer");
    if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Toucher encore pour confirmer"; b.classList.add("plein"); return; }
    b.classList.remove("plein");
    const ev = cal.edition; if (!ev) return;
    const { error } = await sb.from("evenements").delete().eq("id", ev.id);
    if (error) return toast(traduireErreur(error));
    cal.evs = cal.evs.filter((x) => x.id !== ev.id);
    fermerEv(); rendreCalendrier(); toast("Événement supprimé");
  });
  async function verifierAbonnementSilencieux() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!(reg && (await reg.pushManager.getSubscription()));
    } catch { return false; }
  }


  /* ---------------- Calendrier du conjoint·e (2e calendrier, privé) ---------------- */
  $$("[data-cible]").forEach((b) => b.addEventListener("click", () => {
    hr.cible = b.dataset.cible === "conjoint" && hr.conj ? "conjoint" : "moi";
    hr.vue = null; $("#hr-qui").value = ""; $("#hr-form").hidden = true;
    rendreHoraire();
  }));

  /* ---------------- Statistiques d'heures et rapport de temps supplémentaire ---------------- */
  const stats = { mode: "mois", a: new Date().getFullYear(), m: new Date().getMonth() };
  const fmtH = (h) => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h${t % 60 ? " " + String(t % 60).padStart(2, "0") : ""}`; };
  function calculerMois(a, m, src) {
    const r = { jours: {}, heures: 0, ts: 0, travailles: 0, lignesTS: [] };
    const n = new Date(a, m + 1, 0).getDate();
    for (let j = 1; j <= n; j++) {
      const iso = `${a}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
      const q = quartDu(iso, src);
      if (!q.code) continue;
      r.jours[q.code] = (r.jours[q.code] || 0) + 1;
      if (!["J", "S", "N", "X"].includes(q.code)) continue;
      const h = heuresJour(q.code, iso, src), d = dureeH(h);
      r.travailles++; r.heures += d;
      if (q.code === "X") { r.ts += d; r.lignesTS.push({ iso, h, d, note: q.note, ts: ((src.exceptions || {})[iso] || {}).ts || {} }); }
    }
    for (const [iso, e] of Object.entries(src.exceptions || {})) { // formations avec détails, pour le rapport
      if (e.type === "F" && e.ts && iso.startsWith(`${a}-${String(m + 1).padStart(2, "0")}`)) r.lignesTS.push({ iso, h: e.debut ? [e.debut, e.fin] : null, d: e.debut ? dureeH([e.debut, e.fin]) : 0, note: e.note, ts: e.ts, formation: true });
    }
    r.lignesTS.sort((x, y) => x.iso.localeCompare(y.iso));
    return r;
  }
  function rendreStats() {
    const src = affichee();
    $$("[data-stats]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.stats === stats.mode)));
    $("#stats-rapport").hidden = stats.mode !== "mois";
    if (!src.config) { $("#stats-contenu").innerHTML = `<p class="vide">Configurez d'abord la rotation.</p>`; return; }
    if (stats.mode === "mois") {
      $("#stats-periode").textContent = new Date(stats.a, stats.m, 15).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
      const r = calculerMois(stats.a, stats.m, src);
      $("#stats-contenu").innerHTML = `
        <div class="stats-totaux">
          <div><small>Heures travaillées</small><b>${fmtH(r.heures)}</b><span>${r.travailles} jour${r.travailles > 1 ? "s" : ""} de quart</span></div>
          <div class="ts"><small>Temps supplémentaire</small><b>${fmtH(r.ts)}</b><span>Total du mois</span></div>
        </div>
        <div class="stats-cats">${Object.entries(r.jours).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<span class="q q-${esc(k)}"><b>${esc(QUARTS[k] ? QUARTS[k].nom : k)}</b>${n} jour${n > 1 ? "s" : ""}</span>`).join("")}</div>`;
    } else {
      $("#stats-periode").textContent = `Année ${stats.a}`;
      let tH = 0, tTS = 0, tJ = 0;
      const lignes = Array.from({ length: 12 }, (_, m) => {
        const r = calculerMois(stats.a, m, src); tH += r.heures; tTS += r.ts; tJ += r.travailles;
        return `<tr><td>${esc(new Date(stats.a, m, 15).toLocaleDateString("fr-CA", { month: "long" }))}</td><td>${r.travailles}</td><td>${fmtH(r.heures)}</td><td>${r.ts ? fmtH(r.ts) : "—"}</td></tr>`;
      }).join("");
      $("#stats-contenu").innerHTML = `<div class="table-defile"><table class="table-vitesse stats-table"><thead><tr><th>Mois</th><th>Jours</th><th>Heures</th><th>Temps supp.</th></tr></thead>
        <tbody>${lignes}</tbody><tfoot><tr><td>Total</td><td>${tJ}</td><td>${fmtH(tH)}</td><td>${fmtH(tTS)}</td></tr></tfoot></table></div>`;
    }
  }
  $("#hr-stats").addEventListener("click", () => { const d = new Date(); stats.a = d.getFullYear(); stats.m = d.getMonth(); rendreStats(); $("#stats-voile").hidden = false; });
  $("#stats-fermer").addEventListener("click", () => ($("#stats-voile").hidden = true));
  $("#stats-voile").addEventListener("click", (e) => { if (e.target.id === "stats-voile") e.target.hidden = true; });
  $$("[data-stats]").forEach((b) => b.addEventListener("click", () => { stats.mode = b.dataset.stats; rendreStats(); }));
  $("#stats-prec").addEventListener("click", () => { if (stats.mode === "annee") stats.a--; else if (stats.m === 0) { stats.m = 11; stats.a--; } else stats.m--; rendreStats(); });
  $("#stats-suiv").addEventListener("click", () => { if (stats.mode === "annee") stats.a++; else if (stats.m === 11) { stats.m = 0; stats.a++; } else stats.m++; rendreStats(); });
  $("#stats-rapport").addEventListener("click", () => {
    const src = affichee(), r = calculerMois(stats.a, stats.m, src), p = etat.profil;
    const mois = new Date(stats.a, stats.m, 15).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
    const det = (ts) => CHAMPS_TS.filter(([k]) => ts[k]).map(([k, l]) => `<b>${esc(l)} :</b> ${esc(ts[k])}`).join("<br>");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Temps supplémentaire — ${esc(mois)}</title>
      <style>body{font:13px/1.45 system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#444}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}tfoot td{font-weight:700}
      .imprimer{margin:16px 0;padding:10px 16px;font-weight:700;border:0;border-radius:8px;background:#F2B33D;cursor:pointer}@media print{.imprimer{display:none}body{margin:12mm}}</style></head><body>
      <h1>Rapport de temps supplémentaire — ${esc(mois)}</h1>
      <p>${esc([p.grade, p.nom_complet].filter(Boolean).join(" "))}${p.matricule ? " · Matricule " + esc(p.matricule) : ""}${p.unite ? " · " + esc(p.unite) : ""}${p.corps_police ? " · " + esc(p.corps_police) : ""}</p>
      <button class="imprimer" onclick="print()">Imprimer ou enregistrer en PDF</button>
      ${r.lignesTS.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Heures</th><th>Durée</th><th>Détails</th><th>Note</th></tr></thead><tbody>
      ${r.lignesTS.map((l) => `<tr><td>${esc(new Date(l.iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }))}</td><td>${l.formation ? "Formation" : "Temps supp."}</td><td>${l.h ? esc(l.h[0] + " – " + l.h[1]) : "—"}</td><td>${l.d ? fmtH(l.d) : "—"}</td><td>${det(l.ts) || "—"}</td><td>${esc(l.note || "")}</td></tr>`).join("")}
      </tbody><tfoot><tr><td colspan="3">Total du temps supplémentaire</td><td>${fmtH(r.ts)}</td><td colspan="2"></td></tr></tfoot></table>` : "<p>Aucun temps supplémentaire ce mois-ci.</p>"}
      <p style="margin-top:18px;font-size:11px">Généré par Police Management le ${esc(new Date().toLocaleString("fr-CA"))}. Document de travail : la feuille officielle de votre organisation prévaut.</p></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) { const a = document.createElement("a"); a.href = url; a.download = `temps-supplementaire-${stats.a}-${String(stats.m + 1).padStart(2, "0")}.html`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  /* ---------------- Échanges de quarts au poste ---------------- */
  let echanges = [];
  async function chargerEchanges() {
    if (hr.vue || !etat.profil) return;
    const { data, error } = await sb.rpc("liste_echanges");
    if (error) return;
    echanges = data || [];
    const moi = etat.profil.id, auj = aujourdhuiISO();
    const offerts = echanges.filter((e) => e.offreur !== moi && e.statut === "offert" && e.jour >= auj);
    const miens = echanges.filter((e) => e.offreur === moi || e.preneur === moi);
    const libelle = (e) => `${QUARTS[e.code] ? QUARTS[e.code].nom : e.code} · ${new Date(e.jour + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}${e.debut ? ` · ${e.debut}–${e.fin}` : ""}`;
    $("#hr-echanges-nb").textContent = offerts.length || ""; $("#hr-echanges-nb").hidden = !offerts.length;
    $("#ech-offerts").innerHTML = !etat.profil.unite ? `<li class="vide-petit">Indiquez votre unité ou votre poste dans Mon compte pour échanger des quarts.</li>`
      : offerts.length ? offerts.map((e) => `<li><span><b>${esc(libelle(e))}</b><small class="qui">${pastille(e.offreur, e.offreur_nom)}<span>Offert par ${esc(e.offreur_nom)}${e.note ? " · " + esc(e.note) : ""}</span></small></span>
        <button class="btn-ok petit" data-prendre="${e.id}">Prendre</button></li>`).join("")
      : `<li class="vide-petit">Aucun quart offert à votre poste pour le moment.</li>`;
    $("#ech-miens").innerHTML = miens.length ? miens.map((e) => `<li><span><b>${esc(libelle(e))}</b><small class="qui">${
      e.offreur !== moi ? `${pastille(e.offreur, e.offreur_nom)}<span>Pris de ${esc(e.offreur_nom)} ✅</span>` : e.statut === "pris" ? `${pastille(e.preneur, e.preneur_nom)}<span>Pris par ${esc(e.preneur_nom)} ✅</span>` : "En attente d'un preneur"}</small></span>
      ${e.offreur === moi && e.statut === "offert" ? `<button class="btn-danger petit" data-retirer-offre="${e.id}">Retirer</button>` : ""}</li>`).join("")
      : `<li class="vide-petit">Vous n'avez offert ni pris aucun quart.</li>`;
    hydraterPastilles($("#ech-offerts")); hydraterPastilles($("#ech-miens"));
    $$("[data-prendre]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      b.disabled = true;
      const { error } = await sb.rpc("prendre_quart", { p_id: b.dataset.prendre });
      if (error) { toast(traduireErreur(error)); chargerEchanges(); return; }
      toast("Quart pris : il est ajouté à votre horaire");
      hr.chargé = false; await initHoraire();
    }));
    $$("[data-retirer-offre]").forEach((b) => b.addEventListener("click", async () => {
      const { error } = await sb.from("echanges_quarts").update({ statut: "annule" }).eq("id", b.dataset.retirerOffre);
      if (error) return toast(traduireErreur(error));
      toast("Offre retirée"); chargerEchanges();
    }));
  }
  let offreJour = null;
  function ouvrirOffre(isoChoisi) {
    if (!etat.profil.unite) return toast("Indiquez votre unité ou votre poste dans Mon compte pour offrir un quart");
    const auj = aujourdhuiISO(), deja = new Set(echanges.filter((e) => e.offreur === etat.profil.id && e.statut !== "annule").map((e) => e.jour));
    const choix = Array.from({ length: 14 }, (_, i) => ajoutJours(auj, i))
      .map((iso) => ({ iso, q: quartDu(iso, hr) }))
      .filter((x) => ["J", "S", "N", "X"].includes(x.q.code) && !deja.has(x.iso));
    if (isoChoisi && !choix.some((x) => x.iso === isoChoisi)) return toast(deja.has(isoChoisi) ? "Ce quart est déjà offert" : "Seuls les quarts des 14 prochains jours peuvent être offerts");
    offreJour = isoChoisi || (choix[0] && choix[0].iso) || null;
    $("#offre-choix").innerHTML = choix.length ? choix.map((x) => `<button type="button" class="q q-${esc(x.q.code)}" data-offre-jour="${x.iso}" aria-pressed="${x.iso === offreJour}">
      <b>${esc(new Date(x.iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }))}</b>
      <span>${esc(QUARTS[x.q.code].nom)}${heuresJour(x.q.code, x.iso, hr) ? " · " + esc(heuresDe(x.q.code, hr, x.iso)) : ""}</span></button>`).join("")
      : `<p class="vide">Aucun quart à offrir dans les 14 prochains jours.</p>`;
    $$("[data-offre-jour]").forEach((b) => b.addEventListener("click", () => { offreJour = b.dataset.offreJour; $$("[data-offre-jour]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
    $("#offre-ok").hidden = !choix.length;
    $("#offre-note").value = "";
    $("#offre-voile").hidden = false;
  }
  $("#hr-offrir").addEventListener("click", () => ouvrirOffre());
  $("#ech-offrir").addEventListener("click", () => ouvrirOffre());
  $("#offre-fermer").addEventListener("click", () => ($("#offre-voile").hidden = true));
  $("#offre-voile").addEventListener("click", (e) => { if (e.target.id === "offre-voile") e.target.hidden = true; });
  $("#offre-ok").addEventListener("click", async () => {
    if (!offreJour) return toast("Choisissez un quart");
    const q = quartDu(offreJour, hr), h = heuresJour(q.code, offreJour, hr);
    const btn = $("#offre-ok"); btn.disabled = true;
    const { error } = await sb.from("echanges_quarts").insert({ jour: offreJour, code: q.code, debut: h ? h[0] : null, fin: h ? h[1] : null, note: $("#offre-note").value.trim() || null });
    btn.disabled = false;
    if (error) return toast(traduireErreur(error));
    $("#offre-voile").hidden = true;
    $("#hr-echanges").open = true;
    toast("Quart offert : vos collègues du poste sont avisés");
    chargerEchanges();
  });

  /* ---------------- Réglages de l'horaire : rappel avant les quarts, 2e calendrier ---------------- */
  function majReglagesHoraire() {
    $("#rg-rappel-quart").value = etat.profil && etat.profil.rappel_quart_min ? String(etat.profil.rappel_quart_min) : "";
    chargerMonHoraire().then(() => {
      $("#rg-conjoint").checked = !!hr.conj;
      $("#rg-conjoint-nom").hidden = !hr.conj;
      $("#rg-conjoint-nom").value = hr.conj ? hr.conj.nom : "";
    }).catch(() => {});
  }
  $("#rg-rappel-quart").addEventListener("change", async (e) => {
    const v = e.target.value ? Number(e.target.value) : null;
    const { error } = await sb.rpc("regler_rappel_quart", { p_min: v });
    if (error) { toast(traduireErreur(error)); return majReglagesHoraire(); }
    etat.profil.rappel_quart_min = v;
    toast(v ? `Rappel ${e.target.selectedOptions[0].textContent.toLowerCase()} chaque quart` : "Rappel des quarts désactivé");
    if (v && !(await verifierAbonnementSilencieux())) setTimeout(() => toast("Activez aussi les notifications ci-dessus pour recevoir les rappels"), 2600);
  });
  $("#rg-conjoint").addEventListener("change", async (e) => {
    await chargerMonHoraire();
    if (e.target.checked) {
      hr.conj = hr.conj || { nom: "Conjoint·e", config: null, exceptions: {} };
    } else {
      if (hr.conj && hr.conj.config && !confirm(`Supprimer le calendrier de ${hr.conj.nom} ? Sa rotation et ses exceptions seront effacées.`)) { e.target.checked = true; return; }
      hr.conj = null; hr.cible = "moi";
    }
    try { await sauverHoraire(); } catch (err) { toast(traduireErreur(err)); }
    majReglagesHoraire();
    toast(e.target.checked ? "Deuxième calendrier ajouté dans Horaire" : "Deuxième calendrier retiré");
  });
  $("#rg-conjoint-nom").addEventListener("change", async (e) => {
    if (!hr.conj) return;
    hr.conj.nom = e.target.value.trim() || "Conjoint·e";
    try { await sauverHoraire(); toast("Nom enregistré"); } catch (err) { toast(traduireErreur(err)); }
  });

  /* ---------------- Administration : modèles d'horaire ---------------- */
  async function rendreModelesAdmin() {
    if (!estAdmin()) return;
    const liste = await chargerModelesAdmin();
    $("#adm-modeles").innerHTML = liste.length ? liste.map((m) => `<li><span><b>${esc(m.nom)}</b><small>${esc(m.corps || "Tous les corps")} · cycle de ${m.cycle.length} jours${m.hybride ? " · hybride" : ""} · ${esc(m.cycle.join(""))}</small></span>
      <button class="btn-danger petit" data-suppr-modele="${m.id}">Retirer</button></li>`).join("") : `<li class="vide-petit">Aucun modèle publié.</li>`;
    $$("[data-suppr-modele]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error } = await sb.from("modeles_rotation").delete().eq("id", b.dataset.supprModele);
      if (error) return toast(traduireErreur(error));
      toast("Modèle retiré"); rendreModelesAdmin();
    }));
  }
  $("#adm-modele-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = $("#adm-modele-nom").value.trim();
    if (!nom) return $("#adm-modele-nom").focus();
    await chargerMonHoraire();
    if (!hr.config) return toast("Configurez d'abord votre propre rotation dans Horaire, puis publiez-la ici");
    const { error } = await sb.from("modeles_rotation").insert({ nom, cycle: hr.config.cycle, heures: hr.config.heures || null, hybride: !!hr.config.hybride, corps: $("#adm-modele-corps").value || null });
    if (error) return toast(traduireErreur(error));
    $("#adm-modele-nom").value = ""; toast("Modèle publié pour tous"); rendreModelesAdmin();
  });


  /* ---------------- Communauté : Forum par corps de police ---------------- */
  const quand = (d) => {
    const x = new Date(d), s = (Date.now() - x) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return x.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: x.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  };
  const forum = { sujets: [], ouvert: null };
  async function initForum() {
    $("#forum-corps").textContent = estAdmin() ? (etat.corpsAdmin ? `${etat.corpsAdmin} · vue administrateur` : "Tous les corps · vue administrateur") : (etat.profil.corps_police || "Votre corps de police");
    montrerFil(false);
    const { data, error } = await sb.rpc("forum_liste_v2");
    if (error) { $("#forum-sujets").innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    forum.sujets = (data || []).filter((x) => corpsVisible(x.corps));
    $("#forum-sujets").innerHTML = forum.sujets.length ? forum.sujets.map((x) => `
      <button type="button" class="forum-ligne" data-sujet="${x.id}">
        <b>${esc(x.titre)}</b>
        <span class="forum-extrait">${esc(x.contenu.slice(0, 140))}</span>
        <small class="qui">${pastille(x.auteur, x.auteur_nom)}<span>${esc(x.auteur_nom)} · ${esc(quand(x.cree_le))}${estAdmin() ? " · " + esc(x.corps) : ""}</span></small>
        <i>${x.nb_reponses} réponse${x.nb_reponses > 1 ? "s" : ""}</i>
      </button>`).join("") : `<p class="vide">Aucune discussion pour le moment. Lancez la première !</p>`;
    $$("[data-sujet]").forEach((b) => b.addEventListener("click", () => ouvrirSujet(b.dataset.sujet)));
    hydraterPastilles($("#forum-sujets"));
  }
  function montrerFil(v) { $("#forum-liste-vue").hidden = v; $("#forum-fil-vue").hidden = !v; }
  $("#forum-nouveau").addEventListener("click", () => { $("#forum-form").hidden = false; $("#forum-nouveau").hidden = true; $("#forum-titre").focus(); });
  $("#forum-annuler").addEventListener("click", () => { $("#forum-form").hidden = true; $("#forum-nouveau").hidden = false; });
  $("#forum-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = $("#forum-titre").value.trim(), contenu = $("#forum-contenu").value.trim();
    if (titre.length < 3) return toast("Donnez un titre d'au moins 3 caractères");
    if (!contenu) return toast("Écrivez votre message");
    const { error } = await sb.from("forum_sujets").insert({ titre, contenu, corps: (estAdmin() && etat.corpsAdmin) || (etat.profil.corps_police || "").trim() || "Sans corps" });
    if (error) return toast(traduireErreur(error));
    $("#forum-titre").value = ""; $("#forum-contenu").value = "";
    $("#forum-form").hidden = true; $("#forum-nouveau").hidden = false;
    toast("Sujet publié"); initForum();
  });
  async function ouvrirSujet(id) {
    const x = forum.sujets.find((y) => y.id === id);
    if (!x) return;
    forum.ouvert = x;
    montrerFil(true);
    $("#vue-forum").scrollTo(0, 0);
    $("#forum-sujet").innerHTML = `<h3>${esc(x.titre)}</h3><small class="ref qui">${pastille(x.auteur, x.auteur_nom, "petit")}<span>${esc(x.auteur_nom)} · ${esc(quand(x.cree_le))}</span></small>
      <div class="msg-texte">${esc(x.contenu)}</div>
      <div class="fc-ligne">${x.est_moi || estAdmin() ? `<button class="lien rouge" data-suppr-sujet>Supprimer le sujet</button>` : ""}${!x.est_moi ? `<button class="lien" data-signaler="sujet" data-cible="${x.id}">Signaler à l'administrateur</button>` : ""}</div>`;
    const sup = $("[data-suppr-sujet]", $("#forum-sujet"));
    if (sup) sup.addEventListener("click", async () => {
      if (!sup.dataset.arme) { sup.dataset.arme = "1"; sup.textContent = "Toucher encore pour supprimer"; return; }
      const { error } = await sb.from("forum_sujets").delete().eq("id", x.id);
      if (error) return toast(traduireErreur(error));
      toast("Sujet supprimé"); initForum();
    });
    brancherSignalements($("#forum-sujet"), x.contenu);
    hydraterPastilles($("#forum-sujet"));
    await chargerReponses();
  }
  async function chargerReponses() {
    const x = forum.ouvert;
    const { data, error } = await sb.rpc("forum_reponses_liste_v2", { p_sujet: x.id });
    if (error) return toast(traduireErreur(error));
    $("#forum-reponses").innerHTML = (data || []).length ? data.map((r) => `
      <div class="forum-rep ${r.est_moi ? "moi" : ""}"><small class="qui">${pastille(r.auteur, r.auteur_nom)}<span><b>${esc(r.auteur_nom)}</b> · ${esc(quand(r.cree_le))}</span></small><div class="msg-texte">${esc(r.contenu)}</div>
        <div class="fc-ligne">${r.est_moi || estAdmin() ? `<button class="lien rouge" data-suppr-rep="${r.id}">Supprimer</button>` : ""}${!r.est_moi ? `<button class="lien" data-signaler="reponse" data-cible="${r.id}" data-extrait="${esc(r.contenu.slice(0, 200))}">Signaler</button>` : ""}</div></div>`).join("")
      : `<p class="aide">Aucune réponse pour le moment.</p>`;
    $$("[data-suppr-rep]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error } = await sb.from("forum_reponses").delete().eq("id", b.dataset.supprRep);
      if (error) return toast(traduireErreur(error));
      chargerReponses();
    }));
    brancherSignalements($("#forum-reponses"));
    hydraterPastilles($("#forum-reponses"));
  }
  function brancherSignalements(racine, extraitParDefaut = "") {
    $$("[data-signaler]", racine).forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer le signalement"; return; }
      b.disabled = true;
      const { error } = await sb.from("signalements").insert({ type: b.dataset.signaler, cible: b.dataset.cible, extrait: (b.dataset.extrait || extraitParDefaut).slice(0, 300) });
      if (error) { b.disabled = false; return toast(traduireErreur(error)); }
      b.textContent = "Signalé ✓";
      toast("L'administrateur a été avisé et examinera la publication");
    }));
  }
  $("#forum-retour").addEventListener("click", () => initForum());
  $("#forum-rep-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const contenu = $("#forum-rep").value.trim();
    if (!contenu || !forum.ouvert) return;
    const { error } = await sb.from("forum_reponses").insert({ sujet_id: forum.ouvert.id, contenu });
    if (error) return toast(traduireErreur(error));
    $("#forum-rep").value = "";
    chargerReponses();
  });
  $("#forum-rep").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(140, e.target.scrollHeight) + "px"; });


  /* ---------------- Feuille de poste (photo ou PDF partagé entre les membres d'un même poste) ---------------- */
  const fp = { donnees: null, url: null, zoom: 1 };
  const SEAU_FEUILLES = "feuilles-poste";
  // La feuille est gardée sur l'appareil : elle n'est téléchargée de nouveau que lorsqu'elle change (moins de données, affichage instantané)
  const CACHE_FEUILLE = "pm-feuille-poste";
  async function blobFeuille(chemin) {
    const cle = new Request(`${location.origin}/__feuille/${encodeURIComponent(chemin)}`);
    let cache = null;
    try { cache = await caches.open(CACHE_FEUILLE); const r = await cache.match(cle); if (r) return await r.blob(); } catch { cache = null; }
    const { data: signe, error } = await sb.storage.from(SEAU_FEUILLES).createSignedUrl(chemin, 600);
    if (error || !signe) throw new Error("La feuille n'a pas pu être chargée. Réessayez dans un instant.");
    const r = await fetch(signe.signedUrl);
    if (!r.ok) throw new Error("La feuille n'a pas pu être chargée. Réessayez dans un instant.");
    const blob = await r.blob();
    if (cache) {
      try {
        for (const k of await cache.keys()) await cache.delete(k); // une seule feuille gardée : la plus récente
        await cache.put(cle, new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
      } catch { /* facultatif */ }
    }
    return blob;
  }
  async function viderCacheFeuille() { try { await caches.delete(CACHE_FEUILLE); } catch { /* facultatif */ } }
  function ouvrirAvertFeuille() { $("#fp-voile").hidden = false; $("#fp-compris").focus({ preventScroll: true }); $("#fp-voile .avert-carte").scrollTop = 0; }
  $("#fp-compris").addEventListener("click", () => { $("#fp-voile").hidden = true; });
  $("#fp-quitter").addEventListener("click", () => { $("#fp-voile").hidden = true; afficherVue("accueil"); });
  $("#fp-revoir").addEventListener("click", ouvrirAvertFeuille);
  $("#fp-confirme").addEventListener("change", (e) => { $("#fp-choisir").disabled = !e.target.checked; });
  $("#fp-choisir").addEventListener("click", () => $("#fp-fichier").click());
  $("#fp-fichier").addEventListener("change", envoyerFeuille);

  function initFeuille() {
    ouvrirAvertFeuille(); // l'avertissement s'affiche à chaque entrée dans la page
    chargerFeuille();
  }
  async function chargerFeuille() {
    const p = etat.profil;
    $("#fp-poste").textContent = p.unite ? [p.unite, p.corps_police].filter(Boolean).join(" · ") : "Aucun poste indiqué";
    $("#fp-confirme").checked = false; $("#fp-choisir").disabled = true;
    $("#fp-envoi").hidden = !p.unite;
    if (estAdmin()) chargerFeuillesAdmin();
    if (!p.unite) {
      $("#fp-contenu").innerHTML = `<div class="panneau fp-vide"><b>Aucun poste indiqué</b><span>Indiquez votre unité ou votre poste dans Mon compte pour voir et partager la feuille de votre poste.</span><button type="button" class="btn-secondaire" data-menu-compte>Ouvrir Mon compte</button></div>`;
      $("[data-menu-compte]").addEventListener("click", () => afficherVue("compte"));
      return;
    }
    $("#fp-contenu").innerHTML = `<p class="etat">Chargement de la feuille…</p>`;
    const { data, error } = await sb.rpc("feuille_poste");
    if (error) { $("#fp-contenu").innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    fp.donnees = (data && data[0]) || null;
    fp.zoom = 1;
    rendreFeuille();
  }
  async function rendreFeuille() {
    const el = $("#fp-contenu"), f = fp.donnees;
    $("#fp-envoi-titre").textContent = f ? "Remplacer la feuille" : "Ajouter la feuille de votre poste";
    if (!f) {
      el.innerHTML = `<div class="panneau fp-vide"><b>Votre poste n'a pas encore de feuille</b><span>Ajoutez-en une ci-dessous : elle sera visible par tous les membres approuvés de votre poste.</span></div>`;
      return;
    }
    el.innerHTML = `<p class="etat">Chargement de la feuille…</p>`;
    try {
      const blob = await blobFeuille(f.chemin);
      if (fp.url) URL.revokeObjectURL(fp.url);
      fp.url = URL.createObjectURL(blob);
    } catch (err) { el.innerHTML = `<p class="vide">${esc(err.message)}</p>`; return; }
    const image = f.type === "image";
    el.innerHTML = `<div class="panneau fp-vue">
      <div class="fp-barre">
        <small class="ref">Mise à jour ${esc(quand(f.ajoute_le))} par ${esc(f.ajoute_par_nom)}</small>
        <span class="fp-outils">${image ? `<button type="button" class="btn-icone" data-fp-zoom="-1" aria-label="Réduire">−</button><b class="fp-pc" id="fp-pc">100 %</b><button type="button" class="btn-icone" data-fp-zoom="1" aria-label="Agrandir">+</button>` : ""}
          <a class="btn-secondaire petit" href="${esc(fp.url)}" target="_blank" rel="noopener">Ouvrir</a></span>
      </div>
      ${image ? `<div class="fp-cadre" id="fp-cadre"><img id="fp-img" src="${esc(fp.url)}" alt="Feuille de poste de ${esc(f.unite)}"></div><p class="aide fp-astuce">Touchez deux fois la feuille pour l'agrandir, puis glissez pour vous déplacer.</p>`
        : `<div class="fp-pdf"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l6 6v14H6zM14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><text x="12.5" y="18" text-anchor="middle" font-size="5.5" font-weight="700" fill="currentColor">PDF</text></svg><b>Feuille en PDF</b><a class="btn-principal" href="${esc(fp.url)}" target="_blank" rel="noopener">Ouvrir le PDF</a></div>`}
      <div class="fc-ligne">${estAdmin() ? "" : `<button type="button" class="lien" id="fp-signaler">Signaler à l'administrateur</button>`}<button type="button" class="lien rouge" id="fp-retirer">Retirer la feuille</button></div>
    </div>`;
    if (image) {
      const img = $("#fp-img"), cadre = $("#fp-cadre");
      const appliquer = () => { img.style.width = fp.zoom * 100 + "%"; $("#fp-pc").textContent = Math.round(fp.zoom * 100) + " %"; cadre.classList.toggle("zoom", fp.zoom > 1); };
      $$("[data-fp-zoom]", el).forEach((b) => b.addEventListener("click", () => { fp.zoom = Math.min(4, Math.max(1, fp.zoom + 0.5 * Number(b.dataset.fpZoom))); appliquer(); }));
      img.addEventListener("dblclick", (e) => {
        const r = img.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        fp.zoom = fp.zoom > 1 ? 1 : 2.5; appliquer();
        cadre.scrollLeft = fx * img.offsetWidth - cadre.clientWidth / 2; cadre.scrollTop = fy * img.offsetHeight - cadre.clientHeight / 2;
      });
      appliquer();
    }
    const sig = $("#fp-signaler");
    if (sig) sig.addEventListener("click", async () => {
      if (!sig.dataset.arme) { sig.dataset.arme = "1"; sig.textContent = "Confirmer le signalement"; return; }
      sig.disabled = true;
      const { error } = await sb.rpc("envoyer_message", { p_destinataire: null, p_contenu: `Signalement — Feuille de poste de ${f.unite}${etat.profil.corps_police ? " (" + etat.profil.corps_police + ")" : ""} : elle pourrait contenir un élément interdit (code d'accès, fréquence radio, numéro interne ou renseignement sur une personne). Merci de la vérifier.` });
      if (error) { sig.disabled = false; return toast(traduireErreur(error)); }
      sig.textContent = "Signalé ✓"; toast("L'administrateur a été avisé et vérifiera la feuille");
    });
    const ret = $("#fp-retirer");
    ret.addEventListener("click", async () => {
      if (!ret.dataset.arme) { ret.dataset.arme = "1"; ret.textContent = "Toucher encore pour retirer la feuille du poste"; return; }
      ret.disabled = true;
      const { data: ancien, error } = await sb.rpc("feuille_poste_retirer", {});
      if (error) { ret.disabled = false; return toast(traduireErreur(error)); }
      if (ancien) await sb.storage.from(SEAU_FEUILLES).remove([ancien]);
      viderCacheFeuille();
      toast("Feuille retirée"); chargerFeuille();
    });
  }
  // Photo : redimensionnée (2600 px max.) et recréée en JPEG, ce qui retire la position GPS et les données de l'appareil
  function reduireFeuille(fichier, max = 2600) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? ok(b) : ko(new Error("Image illisible"))), "image/jpeg", 0.86);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => ko(new Error("Cette photo n'est pas lisible. Essayez en JPEG ou en PNG."));
      img.src = URL.createObjectURL(fichier);
    });
  }
  async function envoyerFeuille(e) {
    const fichier = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!fichier) return;
    if (!$("#fp-confirme").checked) return toast("Cochez d'abord la confirmation");
    const pdf = fichier.type === "application/pdf" || /\.pdf$/i.test(fichier.name);
    if (!pdf && !/^image\//.test(fichier.type)) return toast("Choisissez une photo ou un PDF");
    if (pdf && fichier.size > 10 * 1024 * 1024) return toast("Le PDF dépasse 10 Mo");
    const b = $("#fp-choisir");
    b.disabled = true; b.textContent = "Envoi en cours…";
    let chemin = null;
    try {
      const contenu = pdf ? fichier : await reduireFeuille(fichier);
      const { data: cle, error: eCle } = await sb.rpc("feuille_poste_cle");
      if (eCle) throw eCle;
      if (!cle) throw new Error("Indiquez votre unité ou votre poste dans Mon compte pour partager une feuille de poste.");
      chemin = `${cle}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;
      const { error: eEnvoi } = await sb.storage.from(SEAU_FEUILLES).upload(chemin, contenu, { contentType: pdf ? "application/pdf" : "image/jpeg", upsert: false });
      if (eEnvoi) { chemin = null; throw eEnvoi; }
      const { data: ancien, error: ePub } = await sb.rpc("feuille_poste_publier", { p_chemin: chemin, p_type: pdf ? "pdf" : "image" });
      if (ePub) throw ePub;
      chemin = null;
      if (ancien) await sb.storage.from(SEAU_FEUILLES).remove([ancien]);
      toast("Feuille publiée pour votre poste");
      chargerFeuille();
    } catch (err) {
      if (chemin) await sb.storage.from(SEAU_FEUILLES).remove([chemin]);
      toast(traduireErreur(err));
    } finally {
      b.textContent = "Choisir une photo ou un PDF";
      $("#fp-confirme").checked = false; b.disabled = true;
    }
  }
  // Administrateur : toutes les feuilles, pour vérifier et retirer une feuille non conforme
  async function chargerFeuillesAdmin() {
    let bloc = $("#fp-admin");
    if (!bloc) { $("#vue-feuille").insertAdjacentHTML("beforeend", `<div class="panneau" id="fp-admin"></div>`); bloc = $("#fp-admin"); }
    const { data, error } = await sb.rpc("admin_feuilles_poste");
    if (error) { bloc.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    bloc.innerHTML = `<h3>Toutes les feuilles · administrateur</h3>` + ((data || []).length ? `<ul class="liste-partages">${data.map((f) => `
      <li><span><b>${esc(f.unite)}</b><small>${esc(f.corps || "")} · ${esc(quand(f.ajoute_le))} · ${esc(f.ajoute_par_nom)}</small></span>
        <span class="fc-ligne"><button type="button" class="btn-secondaire petit" data-fpa-voir="${esc(f.chemin)}">Voir</button><button type="button" class="btn-danger petit" data-fpa-retirer="${esc(f.cle)}">Retirer</button></span></li>`).join("")}</ul>`
      : `<p class="aide">Aucun poste n'a encore partagé de feuille.</p>`);
    $$("[data-fpa-voir]", bloc).forEach((b) => b.addEventListener("click", async () => {
      const fen = window.open("", "_blank");
      try {
        const { data: signe, error: eS } = await sb.storage.from(SEAU_FEUILLES).createSignedUrl(b.dataset.fpaVoir, 600);
        if (eS || !signe) throw new Error("Fichier introuvable");
        if (fen) fen.location.href = signe.signedUrl; else window.open(signe.signedUrl, "_blank");
      } catch (err) { if (fen) fen.close(); toast(err.message); }
    }));
    $$("[data-fpa-retirer]", bloc).forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { data: ancien, error: e2 } = await sb.rpc("feuille_poste_retirer", { p_cle: b.dataset.fpaRetirer });
      if (e2) return toast(traduireErreur(e2));
      if (ancien) await sb.storage.from(SEAU_FEUILLES).remove([ancien]);
      toast("Feuille retirée"); chargerFeuille();
    }));
  }

  /* ---------------- Communauté : Idées et sondages ---------------- */
  const STATUTS_IDEE = { proposee: "Proposée", planifiee: "Planifiée", realisee: "Réalisée ✅", refusee: "Non retenue" };
  let ongletIdees = "demandes";
  function initIdees() {
    $$("[data-idees]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.idees === ongletIdees)));
    $("#idees-demandes").hidden = ongletIdees !== "demandes";
    $("#idees-sondages").hidden = ongletIdees !== "sondages";
    $("#sondage-form").hidden = !estAdmin();
    if (estAdmin() && !$("#sondage-options").children.length) { ajouterOptionSondage(); ajouterOptionSondage(); }
    if (ongletIdees === "demandes") chargerIdees(); else chargerSondages();
  }
  $$("[data-idees]").forEach((b) => b.addEventListener("click", () => { ongletIdees = b.dataset.idees; initIdees(); }));
  async function chargerIdees() {
    const { data: brut, error } = await sb.rpc("idees_liste_v3");
    const data = (brut || []).filter((i) => corpsVisible(i.corps));
    if (error) { $("#idees-liste").innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    $("#idees-liste").innerHTML = (data || []).length ? data.map((i) => `
      <div class="idee">
        <button type="button" class="idee-vote ${i.j_ai_vote ? "vote" : ""}" data-voter="${i.id}" data-a="${i.j_ai_vote}" aria-pressed="${i.j_ai_vote}" aria-label="Voter pour cette idée">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${i.nb_votes}</b></button>
        <div class="idee-txt"><b>${esc(i.titre)}</b>${i.description ? `<span>${esc(i.description)}</span>` : ""}
          <small class="qui">${pastille(i.auteur, i.auteur_nom)}<span>${esc(i.auteur_nom)} · ${esc(quand(i.cree_le))} · <span class="statut-idee ${esc(i.statut)}">${esc(STATUTS_IDEE[i.statut])}</span>${estAdmin() && !etat.corpsAdmin ? ` · ${esc(i.corps)}` : ""}</span></small>
          ${estAdmin() ? `<span class="fc-ligne"><select data-statut-idee="${i.id}" aria-label="Statut">${Object.entries(STATUTS_IDEE).map(([k, v]) => `<option value="${k}" ${k === i.statut ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></span>` : ""}
          ${i.est_moi || estAdmin() ? `<button class="lien rouge" data-suppr-idee="${i.id}">Supprimer</button>` : ""}
        </div>
      </div>`).join("") : `<p class="vide">Aucune demande pour le moment. Proposez la première !</p>`;
    hydraterPastilles($("#idees-liste"));
    $$("[data-voter]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const r = b.dataset.a === "true"
        ? await sb.from("idees_votes").delete().eq("idee_id", b.dataset.voter).eq("user_id", etat.profil.id)
        : await sb.from("idees_votes").insert({ idee_id: b.dataset.voter });
      if (r.error) toast(traduireErreur(r.error));
      chargerIdees();
    }));
    $$("[data-statut-idee]").forEach((sel) => sel.addEventListener("change", async () => {
      const { error } = await sb.from("idees").update({ statut: sel.value }).eq("id", sel.dataset.statutIdee);
      if (error) return toast(traduireErreur(error));
      toast("Statut mis à jour"); chargerIdees();
    }));
    $$("[data-suppr-idee]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error } = await sb.from("idees").delete().eq("id", b.dataset.supprIdee);
      if (error) return toast(traduireErreur(error));
      chargerIdees();
    }));
  }
  $("#idee-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = $("#idee-titre").value.trim();
    if (titre.length < 3) return toast("Décrivez votre idée en au moins 3 caractères");
    const { error } = await sb.from("idees").insert({ titre, description: $("#idee-desc").value.trim() || null, ...(estAdmin() && etat.corpsAdmin ? { corps: etat.corpsAdmin } : {}) });
    if (error) return toast(traduireErreur(error));
    $("#idee-titre").value = ""; $("#idee-desc").value = "";
    toast("Idée proposée : les autres membres peuvent voter"); chargerIdees();
  });
  async function chargerSondages() {
    const { data: brut, error } = await sb.rpc("sondages_liste_v2");
    const data = (brut || []).filter((x) => !x.corps || corpsVisible(x.corps));
    if (error) { $("#sondages-liste").innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    $("#sondages-liste").innerHTML = (data || []).length ? data.map((sd) => {
      const total = Number(sd.total) || 0, a_vote = sd.mon_choix !== null && sd.mon_choix !== undefined;
      return `<div class="panneau sondage"><b>${esc(sd.question)}</b><small class="ref">${total} vote${total > 1 ? "s" : ""}${sd.ferme ? " · terminé" : ""}${estAdmin() ? ` · ${esc(sd.corps || "tous les corps")}` : ""}</small>
        ${sd.options.map((o, i) => {
          const n = Number(sd.votes[i]) || 0, pc = total ? Math.round((n / total) * 100) : 0;
          return `<button type="button" class="sondage-option ${sd.mon_choix === i ? "choisie" : ""}" data-sondage="${sd.id}" data-choix="${i}" ${sd.ferme ? "disabled" : ""} style="--pc:${a_vote || sd.ferme ? pc : 0}%">
            <span>${esc(o)}</span>${a_vote || sd.ferme ? `<b>${pc} %</b>` : ""}</button>`;
        }).join("")}
        ${estAdmin() ? `<div class="fc-ligne"><button class="lien" data-fermer-sondage="${sd.id}" data-ferme="${sd.ferme}">${sd.ferme ? "Rouvrir" : "Terminer le sondage"}</button><button class="lien rouge" data-suppr-sondage="${sd.id}">Supprimer</button></div>` : ""}</div>`;
    }).join("") : `<p class="vide">Aucun sondage en cours.</p>`;
    $$("[data-sondage]").forEach((b) => b.addEventListener("click", async () => {
      await sb.from("sondages_votes").delete().eq("sondage_id", b.dataset.sondage).eq("user_id", etat.profil.id);
      const { error } = await sb.from("sondages_votes").insert({ sondage_id: b.dataset.sondage, choix: Number(b.dataset.choix) });
      if (error) toast(traduireErreur(error)); else toast("Vote enregistré");
      chargerSondages();
    }));
    $$("[data-fermer-sondage]").forEach((b) => b.addEventListener("click", async () => {
      const { error } = await sb.from("sondages").update({ ferme: b.dataset.ferme !== "true" }).eq("id", b.dataset.fermerSondage);
      if (error) return toast(traduireErreur(error));
      chargerSondages();
    }));
    $$("[data-suppr-sondage]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error } = await sb.from("sondages").delete().eq("id", b.dataset.supprSondage);
      if (error) return toast(traduireErreur(error));
      chargerSondages();
    }));
  }
  function ajouterOptionSondage() {
    const n = $("#sondage-options").children.length;
    if (n >= 6) return toast("6 options au maximum");
    const i = document.createElement("input");
    i.maxLength = 80; i.placeholder = `Option ${n + 1}`; i.className = "sondage-opt";
    $("#sondage-options").appendChild(i);
  }
  $("#sondage-ajout-option").addEventListener("click", ajouterOptionSondage);
  $("#sondage-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = $("#sondage-question").value.trim();
    const options = $$(".sondage-opt").map((i) => i.value.trim()).filter(Boolean);
    if (question.length < 3) return toast("Écrivez la question");
    if (options.length < 2) return toast("Il faut au moins 2 options");
    const { error } = await sb.from("sondages").insert({ question, options, corps: etat.corpsAdmin || null });
    if (error) return toast(traduireErreur(error));
    $("#sondage-question").value = ""; $("#sondage-options").innerHTML = ""; ajouterOptionSondage(); ajouterOptionSondage();
    toast("Sondage publié"); chargerSondages();
  });

  /* ---------------- Communauté : Annonces de l'administrateur ---------------- */
  async function urlsAnnonces(chemins) {
    const c = chemins.filter(Boolean);
    if (!c.length) return {};
    const { data } = await sb.storage.from("annonces").createSignedUrls(c, 3600);
    return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  async function afficherAnnonces() {
    const { data } = await sb.from("annonces").select("*").eq("actif", true).order("cree_le", { ascending: false }).limit(10);
    const el = $("#ac-annonces");
    let vues = []; try { vues = JSON.parse(localStorage.getItem("pm-annonces-masquees") || "[]"); } catch { /* facultatif */ }
    const liste = (data || []).filter((a) => !vues.includes(a.id) && (!a.corps || corpsVisible(a.corps)));
    el.hidden = !liste.length;
    if (!liste.length) return;
    const urls = await urlsAnnonces(liste.map((a) => a.image_path));
    el.innerHTML = liste.map((a) => `<article class="annonce">
      ${a.image_path && urls[a.image_path] ? `<img src="${esc(urls[a.image_path])}" alt="" loading="lazy">` : ""}
      <div><small>Annonce · ${esc(quand(a.cree_le))}</small><b>${esc(a.titre)}</b>${a.texte ? `<p>${esc(a.texte)}</p>` : ""}</div>
      <button class="btn-icone annonce-fermer" data-masquer-annonce="${a.id}" aria-label="Masquer cette annonce">✕</button></article>`).join("");
    $$("[data-masquer-annonce]", el).forEach((b) => b.addEventListener("click", () => {
      try { localStorage.setItem("pm-annonces-masquees", JSON.stringify([...vues, b.dataset.masquerAnnonce].slice(-50))); } catch { /* facultatif */ }
      afficherAnnonces();
    }));
  }
  $("#adm-annonce-image").addEventListener("change", (e) => { const f = e.target.files[0]; $("#adm-annonce-fichier").textContent = f ? `Image : ${f.name}` : ""; });
  $("#adm-annonce-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titre = $("#adm-annonce-titre").value.trim();
    if (!titre) return $("#adm-annonce-titre").focus();
    const btn = $("#adm-annonce-form .btn-principal"); btn.disabled = true;
    let image_path = null;
    const f = $("#adm-annonce-image").files[0];
    if (f) {
      if (f.size > 5 * 1024 * 1024) { btn.disabled = false; return toast("Image trop lourde (5 Mo maximum)"); }
      image_path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
      const { error } = await sb.storage.from("annonces").upload(image_path, f, { contentType: f.type });
      if (error) { btn.disabled = false; return toast(traduireErreur(error)); }
    }
    const { error } = await sb.from("annonces").insert({ titre, texte: $("#adm-annonce-texte").value.trim() || null, image_path, corps: $("#adm-annonce-corps").value || null });
    btn.disabled = false;
    if (error) return toast(traduireErreur(error));
    $("#adm-annonce-titre").value = ""; $("#adm-annonce-texte").value = ""; $("#adm-annonce-image").value = ""; $("#adm-annonce-fichier").textContent = "";
    toast("Annonce publiée : les membres sont avisés"); rendreAnnoncesAdmin();
  });
  async function rendreAnnoncesAdmin() {
    const { data: brut } = await sb.from("annonces").select("*").order("cree_le", { ascending: false }).limit(60);
    const data = (brut || []).filter((a) => !a.corps || corpsVisible(a.corps));
    $("#adm-annonces").innerHTML = (data || []).length ? data.map((a) => `<li><span><b>${esc(a.titre)}</b><small>${esc(a.corps || "Tous les corps")} · ${esc(dateFr(a.cree_le))}${a.actif ? "" : " · masquée"}${a.image_path ? " · avec image" : ""}</small></span>
      <span class="fc-ligne"><button class="btn-secondaire petit" data-basculer-annonce="${a.id}" data-actif="${a.actif}">${a.actif ? "Masquer" : "Afficher"}</button>
      <button class="btn-danger petit" data-suppr-annonce="${a.id}" data-image="${esc(a.image_path || "")}">Supprimer</button></span></li>`).join("") : `<li class="vide-petit">Aucune annonce publiée.</li>`;
    $$("[data-basculer-annonce]").forEach((b) => b.addEventListener("click", async () => {
      const { error } = await sb.from("annonces").update({ actif: b.dataset.actif !== "true" }).eq("id", b.dataset.basculerAnnonce);
      if (error) return toast(traduireErreur(error));
      rendreAnnoncesAdmin();
    }));
    $$("[data-suppr-annonce]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      if (b.dataset.image) await sb.storage.from("annonces").remove([b.dataset.image]);
      const { error } = await sb.from("annonces").delete().eq("id", b.dataset.supprAnnonce);
      if (error) return toast(traduireErreur(error));
      toast("Annonce supprimée"); rendreAnnoncesAdmin();
    }));
  }
  async function rendreSignalements() {
    const { data } = await sb.from("signalements").select("*").eq("traite", false).order("cree_le", { ascending: false });
    const n = (data || []).length;
    $("#adm-sig-nb").textContent = n || ""; $("#adm-sig-nb").hidden = !n;
    $("#adm-signalements").innerHTML = n ? data.map((x) => `<li><span><b>${x.type === "sujet" ? "Sujet" : "Réponse"} signalé${x.type === "reponse" ? "e" : ""}</b><small>« ${esc(x.extrait || "")} » · ${esc(dateFr(x.cree_le))}</small></span>
      <span class="fc-ligne"><button class="btn-danger petit" data-retirer-pub="${x.id}" data-type="${x.type}" data-cible="${x.cible}">Retirer la publication</button>
      <button class="btn-secondaire petit" data-traiter="${x.id}">Rien à faire</button></span></li>`).join("") : `<li class="vide-petit">Aucun signalement à traiter.</li>`;
    const traiter = (id) => sb.from("signalements").update({ traite: true }).eq("id", id);
    $$("[data-traiter]").forEach((b) => b.addEventListener("click", async () => { await traiter(b.dataset.traiter); rendreSignalements(); }));
    $$("[data-retirer-pub]").forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error } = await sb.from(b.dataset.type === "sujet" ? "forum_sujets" : "forum_reponses").delete().eq("id", b.dataset.cible);
      if (error) return toast(traduireErreur(error));
      await traiter(b.dataset.retirerPub); toast("Publication retirée"); rendreSignalements();
    }));
  }


  /* ---------------- Administration : corps de police affiché, sous-onglets, messagerie par corps ---------------- */
  const corpsDe = (p) => ((p && (p.corps_police || p.corps)) || "").trim() || "Sans corps";
  etat.corpsAdmin = (() => { try { return localStorage.getItem("pm-corps-admin") || ""; } catch { return ""; } })();
  const corpsVisible = (c) => !estAdmin() || !etat.corpsAdmin || (c || "Sans corps") === etat.corpsAdmin;
  const estSQ = () => /s[ûu]ret[ée] du qu[ée]bec/i.test((etat.profil && etat.profil.corps_police) || "");
  function corpsConnus() {
    const noms = new Set(["Sûreté du Québec"]);
    (etat.corps || []).forEach((c) => noms.add(c.nom));
    Object.keys(ORGANISATIONS).forEach((n) => noms.add(n));
    (comptesAdmin || []).forEach((p) => noms.add(corpsDe(p)));
    ((msg && msg.comptes) || []).forEach((p) => noms.add(corpsDe(p)));
    return [...noms].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
  }
  function remplirCorpsAdmin() {
    if (!estAdmin()) return;
    const sel = $("#corps-admin");
    const avecComptes = new Set((comptesAdmin || []).map(corpsDe));
    const noms = corpsConnus();
    const opt = (n) => `<option value="${esc(n)}">${esc(n)}</option>`;
    sel.innerHTML = `<option value="">Tous les corps</option>` +
      `<optgroup label="Avec des membres">${noms.filter((n) => avecComptes.has(n)).map(opt).join("")}</optgroup>` +
      `<optgroup label="Autres corps">${noms.filter((n) => !avecComptes.has(n)).map(opt).join("")}</optgroup>`;
    sel.value = etat.corpsAdmin;
    if (sel.value !== etat.corpsAdmin) { etat.corpsAdmin = ""; sel.value = ""; }
    sel.hidden = false;
    document.body.classList.add("est-admin");
    $("#adm-corps-titre").textContent = etat.corpsAdmin || "Tous les corps de police";
    const cible = (id, defaut) => { const s2 = $(id); const v = s2.value; s2.innerHTML = `<option value="">Tous les corps</option>` + noms.map(opt).join(""); s2.value = v || defaut; };
    cible("#adm-annonce-corps", etat.corpsAdmin);
    cible("#adm-modele-corps", etat.corpsAdmin);
  }
  $("#corps-admin").addEventListener("change", (e) => {
    etat.corpsAdmin = e.target.value;
    try { localStorage.setItem("pm-corps-admin", etat.corpsAdmin); } catch { /* facultatif */ }
    $("#adm-annonce-corps").value = etat.corpsAdmin; $("#adm-modele-corps").value = etat.corpsAdmin;
    toast(etat.corpsAdmin ? `Affichage : ${etat.corpsAdmin}` : "Affichage : tous les corps");
    afficherVue(etat.vue);
  });

  let ongletAdmin = "demandes";
  $$("[data-adm-onglet]").forEach((b) => b.addEventListener("click", () => {
    ongletAdmin = b.dataset.admOnglet;
    $$("[data-adm-onglet]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $$("[data-adm-panneau]").forEach((p) => (p.hidden = p.dataset.admPanneau !== ongletAdmin));
    if (ongletAdmin === "messagerie") rendreMessagerieAdmin();
  }));

  async function rendreMessagerieAdmin() {
    if (!estAdmin()) return;
    const moi = etat.profil.id;
    const comptes = await comptesApprouves();
    // Nouvelle conversation : policiers approuvés, regroupés par corps
    const parCorps = {};
    comptes.filter((c) => c.statut === "approuve" && corpsVisible(corpsDe(c))).forEach((c) => (parCorps[corpsDe(c)] = parCorps[corpsDe(c)] || []).push(c));
    $("#adm-conv-nouveau").innerHTML = `<option value="">+ Écrire à un policier…</option>` + Object.keys(parCorps).sort((a, b) => a.localeCompare(b, "fr")).map((k) =>
      `<optgroup label="${esc(k)}">${parCorps[k].sort((a, b) => nomCompte(a).localeCompare(nomCompte(b), "fr")).map((c) => `<option value="${c.id}">${esc((c.grade ? c.grade + " " : "") + nomCompte(c))}${c.unite ? " · " + esc(c.unite) : ""}</option>`).join("")}</optgroup>`).join("");
    const { data, error } = await sb.from("messages").select("id, expediteur, destinataire, contenu, cree_le, lu_le").order("cree_le", { ascending: false }).limit(2000);
    const el = $("#adm-conv");
    if (error) { el.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    const convs = new Map();
    for (const m of data || []) {
      const autre = m.expediteur === moi ? m.destinataire : m.expediteur;
      if (!autre) continue;
      if (!convs.has(autre)) convs.set(autre, { autre, dernier: m, nonLus: 0 });
      if (m.destinataire === moi && !m.lu_le) convs.get(autre).nonLus++;
    }
    const groupes = {};
    for (const c of convs.values()) {
      const p = comptes.find((x) => x.id === c.autre) || { nom_complet: "Compte supprimé", corps_police: "" };
      c.p = p;
      const k = corpsDe(p);
      if (!corpsVisible(k)) continue;
      (groupes[k] = groupes[k] || []).push(c);
    }
    const cles = Object.keys(groupes).sort((a, b) => a.localeCompare(b, "fr"));
    const toutes = cles.flatMap((k) => groupes[k]);
    const urls = await urlsAvatars(toutes.map((c) => c.p.avatar_path));
    let i = 0;
    el.innerHTML = cles.length ? cles.map((k) => {
      const nl = groupes[k].reduce((t, c) => t + c.nonLus, 0);
      return `<h4 class="groupe-corps"><span>${esc(k)}</span>${nl ? `<b class="nl">${nl} non lu${nl > 1 ? "s" : ""}</b>` : `<b>${groupes[k].length}</b>`}</h4>
      <ul class="liste-conv">${groupes[k].map((c) => {
        const deMoi = c.dernier.expediteur === moi;
        return `<li><button class="conv ${c.nonLus ? "non-lu" : ""}" data-adm-conv="${c.autre}">
          ${htmlAvatar(c.p, urls[i++])}
          <span class="conv-txt"><span class="conv-haut"><b>${esc((c.p.grade ? c.p.grade + " " : "") + nomCompte(c.p))}</b><small>${esc(jourFr(c.dernier.cree_le) === "Aujourd'hui" ? heureFr(c.dernier.cree_le) : jourFr(c.dernier.cree_le))}</small></span>
          <span class="conv-apercu">${deMoi ? "Vous : " : ""}${esc(c.dernier.contenu.slice(0, 90))}</span></span>
          ${c.nonLus ? `<b class="conv-badge">${c.nonLus}</b>` : ""}</button></li>`;
      }).join("")}</ul>`;
    }).join("") : `<p class="vide">Aucune conversation${etat.corpsAdmin ? " pour ce corps de police" : ""}. Choisissez un policier ci-dessus pour lui écrire.</p>`;
    $$("[data-adm-conv]", el).forEach((b) => b.addEventListener("click", () => ouvrirDepuisAdmin(b.dataset.admConv)));
  }
  function ouvrirDepuisAdmin(id) { msg.ouvrir = id; afficherVue("messages"); }
  $("#adm-conv-nouveau").addEventListener("change", (e) => { if (e.target.value) ouvrirDepuisAdmin(e.target.value); e.target.value = ""; });


  /* ---------------- Carte personnalisée selon le corps de police ----------------
     Couches utiles en premier et activées par défaut, autres couches regroupées,
     territoire du policier surligné, choix mémorisés par corps. L'administrateur suit le corps choisi en haut. */
  const COUCHES = ["mien", "sq", "mun", "aut", "km", "sorties", "bur", "limites", "cam", "autres", "reperes"];
  const PROFILS_CARTE = {
    sq: { utiles: ["mien", "sq", "aut", "km", "bur", "sorties", "mun", "reperes"], defauts: { mien: 1, sq: 1, mun: 1, aut: 1, km: 1, reperes: 1 } },
    municipal: { utiles: ["mien", "mun", "limites", "km", "cam", "autres", "reperes"], defauts: { mien: 1, mun: 1, limites: 1, km: 1, cam: 1, autres: 1, reperes: 1 } },
    autochtone: { utiles: ["mien", "mun", "limites", "km", "autres", "reperes"], defauts: { mien: 1, mun: 1, limites: 1, km: 1, autres: 1, reperes: 1 } },
    autre: { utiles: ["sq", "mun", "aut", "km", "reperes"], defauts: { sq: 1, mun: 1, aut: 1, km: 1, reperes: 1 } },
  };
  function profilCarte() {
    const admin = estAdmin() && etat.corpsAdmin;
    const corps = (admin ? etat.corpsAdmin : (etat.profil && etat.profil.corps_police) || "").trim();
    const unite = admin ? "" : ((etat.profil && etat.profil.unite) || "").trim();
    if (/s[ûu]ret[ée] du qu[ée]bec/i.test(corps)) return { type: "sq", corps: "Sûreté du Québec", unite };
    const c = (etat.corps || []).find((x) => norm(x.nom) === norm(corps));
    if (c) return { type: c.type === "autochtone" ? "autochtone" : "municipal", corps: c.nom, unite, c };
    return { type: "autre", corps, unite };
  }
  const cleCouches = (pr) => `pm-couches:${pr.type}:${pr.corps}`;
  function lireCouches(pr) { try { return JSON.parse(localStorage.getItem(cleCouches(pr))); } catch { return null; } }
  function sauverCouches() {
    if (!etat.profilCarte) return;
    const etatC = Object.fromEntries(COUCHES.map((k) => [k, $("#c-" + k) && $("#c-" + k).checked ? 1 : 0]));
    try { localStorage.setItem(cleCouches(etat.profilCarte), JSON.stringify(etatC)); } catch { /* facultatif */ }
  }
  function appliquerCouches(valeurs) {
    for (const k of COUCHES) {
      const cb = $("#c-" + k);
      if (!cb) continue;
      const v = !!valeurs[k];
      if (cb.checked !== v) { cb.checked = v; cb.dispatchEvent(new Event("change")); }
    }
  }
  function ordonnerLegende(pr) {
    const corpsEl = $("#legende-corps");
    let autres = $(".legende-autres", corpsEl);
    if (!autres) {
      autres = document.createElement("details");
      autres.className = "legende-autres";
      autres.innerHTML = `<summary>Autres couches</summary><div class="legende-autres-corps"></div>`;
      corpsEl.appendChild(autres);
    }
    const boite = $(".legende-autres-corps", autres);
    const ligne = (k) => $("#c-" + k) && $("#c-" + k).closest("label");
    const utiles = PROFILS_CARTE[pr.type].utiles;
    utiles.forEach((k) => { const l = ligne(k); if (l) corpsEl.insertBefore(l, autres); });
    COUCHES.filter((k) => !utiles.includes(k)).forEach((k) => { const l = ligne(k); if (l) boite.appendChild(l); });
    autres.hidden = !boite.children.length;
    let reinit = $(".legende-reinit", corpsEl);
    if (!reinit) {
      reinit = document.createElement("button");
      reinit.type = "button"; reinit.className = "lien legende-reinit"; reinit.textContent = "Couches par défaut de mon corps";
      reinit.addEventListener("click", () => { try { localStorage.removeItem(cleCouches(etat.profilCarte)); } catch { /* facultatif */ } appliquerCouches(PROFILS_CARTE[etat.profilCarte.type].defauts); toast("Couches par défaut rétablies"); });
      corpsEl.appendChild(reinit);
    }
    const p = $("#legende-profil");
    p.hidden = pr.type === "autre";
    p.textContent = pr.type === "autre" ? "" : `Couches pour : ${pr.corps}${pr.unite ? " · " + pr.unite : ""}`;
  }
  // Territoire du policier (poste SQ ou corps municipal/autochtone), surligné en violet
  async function dessinerMonTerritoire(pr, centrer) {
    const carte = etat.carte;
    if (!etat.couches.mien) etat.couches.mien = L.layerGroup();
    const g = etat.couches.mien;
    g.clearLayers();
    let titre = "", bornes = null;
    const style = { color: getComputedStyle(document.documentElement).getPropertyValue("--marque").trim() || "#6A3FE0", weight: 3, dashArray: "6 5", fillOpacity: 0.06 };
    try {
      if (pr.type === "sq" && pr.unite) {
        const bureaux = await charger("sq_bureaux.geojson");
        const f = bureaux.features.find((x) => norm(nomBureau(x.properties.NOM_ENT || "")) === norm(pr.unite) || norm(x.properties.NOM_UNIT || "") === norm(pr.unite))
          || bureaux.features.find((x) => norm(nomBureau(x.properties.NOM_ENT || "")).includes(norm(pr.unite)));
        if (f) {
          const pp = f.properties, unite = pp.NOM_UNIT;
          titre = nomBureau(pp.NOM_ENT);
          const fichier = pp.CAT_UNIT === "Poste autoroutier" ? "sq_autoroutier.geojson" : "sq_postes.geojson";
          const fc = await charger(fichier);
          const terr = fc.features.filter((x) => x.properties.NOM_UNIT === unite);
          if (terr.length) { const l = L.geoJSON({ type: "FeatureCollection", features: terr }, { interactive: false, style: pp.CAT_UNIT === "Poste autoroutier" ? { ...style, weight: 7, dashArray: null, opacity: 0.8 } : style }).addTo(g); bornes = l.getBounds(); }
          const [lon, lat] = f.geometry.coordinates;
          L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 2.5, fillColor: style.color, fillOpacity: 1 }).bindTooltip(titre).addTo(g);
          bornes = bornes ? bornes.extend([lat, lon]) : L.latLngBounds([[lat, lon]]);
        }
      } else if ((pr.type === "municipal" || pr.type === "autochtone") && pr.c) {
        titre = pr.c.nom;
        const toutes = await charger("municipalites_hors_sq.geojson");
        const noms = new Set((pr.c.municipalites || []).map(norm));
        const fs = toutes.features.filter((x) => noms.has(norm(x.properties.nom)));
        if (fs.length) { const l = L.geoJSON({ type: "FeatureCollection", features: fs }, { interactive: false, style }).addTo(g); bornes = l.getBounds(); }
      }
    } catch { /* données pas encore chargées */ }
    $("#ligne-mien").hidden = !g.getLayers().length;
    $("#txt-mien").textContent = titre ? `Mon territoire · ${titre}` : "Mon territoire";
    if ($("#c-mien").checked && g.getLayers().length) g.addTo(carte); else carte.removeLayer(g);
    if (centrer && bornes && bornes.isValid()) carte.fitBounds(bornes.pad(0.2), { maxZoom: 12 });
    // Raccourci en tête du menu des postes
    await etat.choixUnitePret;
    const sel = $("#choix-unite");
    $$("optgroup[data-mien]", sel).forEach((o) => o.remove());
    let val = null;
    if (pr.type === "sq" && titre) { const bureaux = await charger("sq_bureaux.geojson"); const i = bureaux.features.findIndex((x) => nomBureau(x.properties.NOM_ENT || "") === titre); if (i >= 0) val = "b:" + i; }
    else if (pr.c) val = "c:" + pr.c.nom;
    if (val && sel.options.length > 1) {
      const og = document.createElement("optgroup");
      og.label = "Mon corps de police"; og.dataset.mien = "1";
      og.innerHTML = `<option value="${esc(val)}">★ ${esc(titre || pr.corps)}</option>`;
      sel.insertBefore(og, sel.options[1].parentElement === sel ? sel.options[1] : sel.options[1].parentElement);
    }
  }
  async function personnaliserCarte() {
    if (!etat.carte) return;
    if (!etat.corps || !etat.corps.length) await chargerCorps();
    const pr = profilCarte();
    const cle = `${pr.type}|${pr.corps}|${pr.unite}`;
    if (etat.cleCarte === cle) return;
    etat.cleCarte = cle; etat.profilCarte = pr;
    ordonnerLegende(pr);
    appliquerCouches(lireCouches(pr) || PROFILS_CARTE[pr.type].defauts);
    await dessinerMonTerritoire(pr, true); // recentre sur le territoire à l'ouverture et à chaque changement de corps
  }
  $("#c-mien").addEventListener("change", (e) => { if (!etat.couches || !etat.couches.mien) return; e.target.checked ? etat.couches.mien.addTo(etat.carte) : etat.carte.removeLayer(etat.couches.mien); });
  $("#legende-corps").addEventListener("change", (e) => { if (e.target.matches("input[type=checkbox]")) setTimeout(sauverCouches, 0); });

  // Configuration de la rotation
  let modelesAdmin = [];
  async function chargerModelesAdmin() {
    const { data } = await sb.from("modeles_rotation").select("*").order("nom");
    modelesAdmin = (data || []).filter((m) => (estAdmin() ? !m.corps || corpsVisible(m.corps) : (!m.hybride || estSQ())));
    const g = $("#hr-modeles-admin");
    g.innerHTML = modelesAdmin.map((m) => `<option value="m:${m.id}">${esc(m.nom)}</option>`).join("");
    g.hidden = !modelesAdmin.length;
    return modelesAdmin;
  }
  function ouvrirConfig() {
    const c = cibleEdition().config;
    hr.brouillon = { cycle: c ? [...c.cycle] : MODELES["4-4J"].split(""), debut: c ? c.debut : aujourdhuiISO(), heures: { ...HEURES_DEFAUT, ...(c && c.heures) }, hybride: !!(c && c.hybride) };
    $("#hr-hybride").checked = hr.brouillon.hybride;
    // Quarts de 12 h la fin de semaine : horaire hybride autoroutier de la Sûreté du Québec seulement
    $(".hr-hybride").hidden = !(estSQ() || hr.cible === "conjoint" || hr.brouillon.hybride);
    chargerModelesAdmin().then(() => { if (c && c.modele && String(c.modele).startsWith("m:")) $("#hr-modele").value = c.modele; });
    $("#hr-modele").value = c ? (c.modele || "perso") : "4-4J";
    $("#hr-debut").value = hr.brouillon.debut;
    $("#hr-form").hidden = false;
    rendreBrouillon();
    rendreHoraire();
  }
  function rendreBrouillon() {
    const b = hr.brouillon;
    $("#hr-longueur").textContent = b.cycle.length;
    $("#hr-cycle").innerHTML = b.cycle.map((q, i) => `<button type="button" class="q q-${q}" data-i="${i}" aria-label="Jour ${i + 1} : ${QUARTS[q].nom}">${q}<small>${i + 1}</small></button>`).join("");
    $$("#hr-cycle button").forEach((btn) => btn.addEventListener("click", () => {
      const i = +btn.dataset.i;
      b.cycle[i] = QUARTS_CYCLE[(QUARTS_CYCLE.indexOf(b.cycle[i]) + 1) % QUARTS_CYCLE.length];
      $("#hr-modele").value = "perso";
      rendreBrouillon();
    }));
    $("#hr-heures").innerHTML = ["J", "S", "N"].map((k) => `<div class="ligne"><span><i class="q q-${k}"></i>${QUARTS[k].nom}</span>
      <input type="time" data-h="${k}" data-pos="0" value="${esc(b.heures[k][0])}" aria-label="${QUARTS[k].nom} : début">
      <input type="time" data-h="${k}" data-pos="1" value="${esc(b.heures[k][1])}" aria-label="${QUARTS[k].nom} : fin"></div>`).join("");
    $$("#hr-heures input").forEach((inp) => inp.addEventListener("change", () => { b.heures[inp.dataset.h][+inp.dataset.pos] = inp.value; }));
    $("#hr-heures").hidden = $("#hr-heures-titre").hidden = !!b.hybride;
  }
  $("#hr-hybride").addEventListener("change", (e) => { hr.brouillon.hybride = e.target.checked; rendreBrouillon(); });
  $("#hr-modele").addEventListener("change", (e) => {
    if (MODELES[e.target.value]) { hr.brouillon.cycle = MODELES[e.target.value].split(""); rendreBrouillon(); }
    const m = e.target.value.startsWith("m:") && modelesAdmin.find((x) => "m:" + x.id === e.target.value);
    if (m) {
      hr.brouillon.cycle = [...m.cycle];
      if (m.heures) hr.brouillon.heures = { ...HEURES_DEFAUT, ...m.heures };
      hr.brouillon.hybride = !!m.hybride; $("#hr-hybride").checked = hr.brouillon.hybride;
      rendreBrouillon();
      toast(`Modèle « ${m.nom} » appliqué : choisissez le premier jour du cycle`);
    }
  });
  $("#hr-ajout-jour").addEventListener("click", () => { if (hr.brouillon.cycle.length < 84) { hr.brouillon.cycle.push("C"); $("#hr-modele").value = "perso"; rendreBrouillon(); } });
  $("#hr-retrait-jour").addEventListener("click", () => { if (hr.brouillon.cycle.length > 1) { hr.brouillon.cycle.pop(); $("#hr-modele").value = "perso"; rendreBrouillon(); } });
  $("#hr-commencer").addEventListener("click", ouvrirConfig);
  $("#hr-config").addEventListener("click", ouvrirConfig);
  $("#hr-annuler").addEventListener("click", () => { $("#hr-form").hidden = true; rendreHoraire(); });
  $("#hr-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const debut = $("#hr-debut").value;
    if (!debut) { $("#hr-debut").focus(); return toast("Choisissez le premier jour du cycle"); }
    const cible = cibleEdition();
    const ancien = cible.config;
    cible.config = { cycle: hr.brouillon.cycle, debut, heures: hr.brouillon.heures, modele: $("#hr-modele").value || "perso", hybride: !!hr.brouillon.hybride };
    try {
      await sauverHoraire();
      $("#hr-form").hidden = true;
      rendreHoraire();
      toast("Rotation enregistrée");
    } catch (e) { cible.config = ancien; toast(traduireErreur(e)); }
  });

  // Exceptions sur une journée
  function ouvrirJour(iso) {
    hr.jourChoisi = iso;
    const q = quartDu(iso);
    const lecture = !!hr.vue;
    $$(".hr-edition").forEach((el) => (el.hidden = lecture));
    $("#hr-jour-lecture").hidden = !lecture;
    if (lecture) {
      $("#hr-jour-lecture").innerHTML = `<span class="chip-grand q q-${esc(q.code || "C")}">${esc(q.code ? QUARTS[q.code].nom : "—")}</span>
        ${heuresJour(q.code, iso) ? `<span class="ref">${esc(heuresDe(q.code, undefined, iso))}</span>` : ""}
        ${q.note ? `<p>${esc(q.note)}</p>` : ""}`;
    }
    $("#hr-jour-titre").textContent = new Date(iso + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("#hr-jour-prevu").textContent = `Selon la rotation : ${q.prevu ? QUARTS[q.prevu].nom + (heuresDe(q.prevu) && q.prevu !== "C" ? " (" + heuresDe(q.prevu) + ")" : "") : "—"}`;
    $("#hr-jour-choix").innerHTML = Object.entries(QUARTS).map(([k, v]) => `<button type="button" class="q q-${k}" data-q="${k}" aria-pressed="${String(q.code === k)}">${k} · ${esc(v.nom)}</button>`).join("");
    $$("#hr-jour-choix button").forEach((b) => b.addEventListener("click", () => $$("#hr-jour-choix button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)))));
    $("#hr-jour-note").value = q.note || "";
    const ex = (cibleEdition().exceptions || {})[iso] || {};
    $("#hr-jour-debut").value = ex.debut || ""; $("#hr-jour-fin").value = ex.fin || "";
    $$("#hr-ts-champs input").forEach((i) => (i.value = (ex.ts && ex.ts[i.dataset.ts]) || ""));
    $("#hr-jour-ts").open = !!(ex.ts && Object.values(ex.ts).some(Boolean));
    $("#hr-jour-retirer").hidden = !q.exception;
    $("#hr-jour-offrir").hidden = lecture || hr.cible === "conjoint" || !["J", "S", "N", "X"].includes(q.code) || iso < aujourdhuiISO();
    majChampsJour();
    $("#hr-voile").hidden = false;
  }
  const CHAMPS_TS = [["codeGain", "Code gain"], ["gain", "Gain"], ["activite", "Activité"], ["nature", "Nature"], ["projet", "Projet"], ["psa", "PSA"], ["noDossier", "No dossier / No cours"],
    ["fonctionRemplacee", "Fonction remplacée"], ["uoImpute", "UO imputée"], ["nbreRepas", "Nbre de repas"], ["tempsRepas", "Temps de repas (hh:mm)"], ["demandePar", "Demandé par"], ["remarque", "Remarque"]];
  $("#hr-ts-champs").innerHTML = CHAMPS_TS.map(([k, l]) => `<label><span>${esc(l)}</span><input data-ts="${k}" maxlength="120" autocomplete="off"></label>`).join("");
  const typeChoisi = () => { const b = $("#hr-jour-choix button[aria-pressed='true']"); return b ? b.dataset.q : quartDu(hr.jourChoisi, cibleEdition()).prevu; };
  function majChampsJour() {
    const t = typeChoisi();
    $("#hr-jour-heures").hidden = !!hr.vue || !["J", "S", "N", "X", "F", "T"].includes(t);
    $("#hr-jour-ts").hidden = !!hr.vue || !["X", "F"].includes(t);
    const h = heuresJour(t, null, cibleEdition());
    $("#hr-jour-debut").placeholder = h ? h[0] : ""; $("#hr-jour-fin").placeholder = h ? h[1] : "";
  }
  $("#hr-jour-choix").addEventListener("click", () => setTimeout(majChampsJour, 0));
  $("#hr-jour-offrir").addEventListener("click", () => { fermerJour(); ouvrirOffre(hr.jourChoisi); });
  const fermerJour = () => ($("#hr-voile").hidden = true);
  $("#hr-jour-fermer").addEventListener("click", fermerJour);
  $("#hr-voile").addEventListener("click", (e) => { if (e.target.id === "hr-voile") fermerJour(); });
  $("#hr-jour-ok").addEventListener("click", async () => {
    const iso = hr.jourChoisi, cible = cibleEdition();
    cible.exceptions = cible.exceptions || {};
    const type = typeChoisi();
    const note = $("#hr-jour-note").value.trim();
    const avecHeures = !$("#hr-jour-heures").hidden;
    const debut = avecHeures ? $("#hr-jour-debut").value : "", fin = avecHeures ? $("#hr-jour-fin").value : "";
    if ((debut && !fin) || (!debut && fin)) return toast("Indiquez l'heure de début et de fin");
    const ts = {};
    if (!$("#hr-jour-ts").hidden) $$("#hr-ts-champs input").forEach((i) => { if (i.value.trim()) ts[i.dataset.ts] = i.value.trim(); });
    const avant = cible.exceptions[iso];
    if (type === quartDu(iso, cible).prevu && !note && !debut && !Object.keys(ts).length) delete cible.exceptions[iso];
    else cible.exceptions[iso] = { type, note, ...(debut ? { debut, fin } : {}), ...(Object.keys(ts).length ? { ts } : {}) };
    try { await sauverHoraire(); fermerJour(); rendreHoraire(); toast("Journée mise à jour"); }
    catch (e) { if (avant) cible.exceptions[iso] = avant; else delete cible.exceptions[iso]; toast(traduireErreur(e)); }
  });
  $("#hr-jour-retirer").addEventListener("click", async () => {
    const iso = hr.jourChoisi, cible = cibleEdition(), avant = cible.exceptions[iso];
    delete cible.exceptions[iso];
    try { await sauverHoraire(); fermerJour(); rendreHoraire(); toast("Retour à la rotation"); }
    catch (e) { cible.exceptions[iso] = avant; toast(traduireErreur(e)); }
  });

  // Export vers le calendrier du téléphone (.ics), 6 mois à partir d'aujourd'hui
  $("#hr-ics").addEventListener("click", () => {
    const n0 = jourUTC(aujourdhuiISO());
    const pad = (x) => String(x).padStart(2, "0");
    const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Police Management//Horaire//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Horaire Police Management"];
    const maintenant = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    for (let i = 0; i < 183; i++) {
      const iso = isoDe(n0 + i), q = quartDu(iso, hr);
      if (!q.code || q.code === "C") continue;
      const date = iso.replace(/-/g, "");
      const titre = (QUARTS[q.code] ? QUARTS[q.code].nom : q.code) + (q.note ? " — " + q.note : "");
      const h = heuresJour(q.code, iso, hr);
      lignes.push("BEGIN:VEVENT", `UID:${date}-${q.code}@police-management`, `DTSTAMP:${maintenant}`);
      if (h) {
        const fin = h[1] <= h[0] ? isoDe(n0 + i + 1).replace(/-/g, "") : date; // quart de nuit : se termine le lendemain
        lignes.push(`DTSTART:${date}T${h[0].replace(":", "")}00`, `DTEND:${fin}T${h[1].replace(":", "")}00`);
      } else {
        lignes.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${isoDe(n0 + i + 1).replace(/-/g, "")}`);
      }
      lignes.push(`SUMMARY:${titre.replace(/[,;\\]/g, (c) => "\\" + c)}`, "END:VEVENT");
    }
    // Événements personnels des 6 prochains mois (répétitions comprises)
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const echap = (t) => String(t).replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    for (const o of occurrences(minuit(aujourdhuiISO()), minuit(isoDe(n0 + 183)))) {
      lignes.push("BEGIN:VEVENT", `UID:${o.ev.id}-${o.debut.getTime()}@police-management`, `DTSTAMP:${maintenant}`);
      if (o.ev.journee) lignes.push(`DTSTART;VALUE=DATE:${isoLoc(o.debut).replace(/-/g, "")}`, `DTEND;VALUE=DATE:${isoLoc(o.fin).replace(/-/g, "")}`);
      else lignes.push(`DTSTART:${fmt(o.debut)}`, `DTEND:${fmt(o.fin)}`);
      lignes.push(`SUMMARY:${echap(o.ev.titre)}`);
      if (o.ev.lieu) lignes.push(`LOCATION:${echap(o.ev.lieu)}`);
      if (o.ev.notes) lignes.push(`DESCRIPTION:${echap(o.ev.notes)}`);
      lignes.push("END:VEVENT");
    }
    lignes.push("END:VCALENDAR");
    const blob = new Blob([lignes.join("\r\n")], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "horaire-police-management.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("Fichier prêt : ouvrez-le pour l'ajouter à votre calendrier");
  });

  /* ---------------- Aide : installation ---------------- */
  function plateformeProbable() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/.test(ua)) return "android";
    if (/Macintosh|Mac OS X/.test(ua)) return "mac";
    return "windows";
  }
  function brancherAide(racine) {
    const choisir = (pf) => {
      $$("[data-plateforme]", racine).forEach((el) => {
        if (el.getAttribute("role") === "tab") el.setAttribute("aria-selected", String(el.dataset.plateforme === pf));
        else el.hidden = el.dataset.plateforme !== pf;
      });
    };
    $$("button[data-plateforme]", racine).forEach((b) => b.addEventListener("click", () => choisir(b.dataset.plateforme)));
    choisir(plateformeProbable());
    const btn = $("#btn-installer", racine);
    if (btn) btn.addEventListener("click", installer);
  }
  let invitationInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invitationInstall = e;
    $$(".installer-direct").forEach((el) => (el.hidden = false));
  });
  async function installer() {
    if (!invitationInstall) return;
    invitationInstall.prompt();
    await invitationInstall.userChoice;
    invitationInstall = null;
    $$(".installer-direct").forEach((el) => (el.hidden = true));
  }
  brancherAide($("#vue-aide"));
  $("#btn-aide-auth").addEventListener("click", () => {
    const cible = $("#aide-voile-contenu");
    if (!cible.childElementCount) {
      cible.innerHTML = $("#aide-contenu").innerHTML;
      brancherAide(cible);
      if (invitationInstall) $$(".installer-direct", cible).forEach((el) => (el.hidden = false));
    }
    $("#aide-voile").hidden = false;
  });
  $("#aide-fermer").addEventListener("click", () => ($("#aide-voile").hidden = true));
  $("#aide-voile").addEventListener("click", (e) => { if (e.target.id === "aide-voile") e.currentTarget.hidden = true; });
  // Mise à jour automatique : dès qu'une nouvelle version du site est publiée, l'app se recharge une fois
  if ("serviceWorker" in navigator) {
    const avaitControleur = !!navigator.serviceWorker.controller;
    let recharge = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (avaitControleur && !recharge) { recharge = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      })
      .catch(() => {});
  }

  /* ---------------- Avatars ---------------- */
  const cacheAvatars = new Map();
  async function urlsAvatars(chemins) {
    const manquants = [...new Set(chemins.filter((c) => c && !cacheAvatars.has(c)))];
    if (manquants.length) {
      const { data } = await sb.storage.from("avatars").createSignedUrls(manquants, 3600);
      (data || []).forEach((d) => d.signedUrl && cacheAvatars.set(d.path, d.signedUrl));
    }
    return chemins.map((c) => cacheAvatars.get(c) || null);
  }
  const initiales = (p) => (p.nom_complet || p.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("");
  function htmlAvatar(p, url, taille = "moyen") {
    return `<span class="avatar ${taille}">${url ? `<img src="${esc(url)}" alt="">` : esc(initiales(p))}</span>`;
  }
  // Pastille à côté d'un nom : initiales tout de suite, photo ensuite (si la personne en a une et qu'on peut la voir)
  const profilsAvatars = new Map();
  function pastille(id, nom, taille = "mini") {
    if (!id) return "";
    return `<span class="avatar ${taille}" data-av="${esc(id)}" aria-hidden="true">${esc(initiales({ nom_complet: nom || "?" }))}</span>`;
  }
  async function hydraterPastilles(racine) {
    const els = $$("[data-av]", racine || document).filter((e) => !e.dataset.avOk);
    if (!els.length) return;
    const ids = [...new Set(els.map((e) => e.dataset.av))];
    const manquants = ids.filter((i) => !profilsAvatars.has(i));
    if (manquants.length) {
      const { data } = await sb.rpc("avatars_visibles", { p_ids: manquants });
      manquants.forEach((i) => profilsAvatars.set(i, null));
      (data || []).forEach((p) => profilsAvatars.set(p.id, p));
    }
    const urls = await urlsAvatars(ids.map((i) => (profilsAvatars.get(i) || {}).avatar_path));
    const parId = new Map(ids.map((i, k) => [i, urls[k]]));
    els.forEach((e) => { e.dataset.avOk = "1"; const u = parId.get(e.dataset.av); if (u) e.innerHTML = `<img src="${esc(u)}" alt="">`; });
  }
  async function remplirAvatar(el, p) {
    const [url] = await urlsAvatars([p.avatar_path]);
    el.innerHTML = url ? `<img src="${esc(url)}" alt="">` : esc(initiales(p));
  }
  function majBarreCompte() {
    const p = etat.profil;
    $("#barre-usager").textContent = p.nom_complet || p.email;
    remplirAvatar($("#barre-avatar"), p);
  }

  // Réduit la photo à 320 px (JPEG) avant l'envoi
  function reduireImage(fichier, cote = 320) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const r = Math.min(img.width, img.height);
        c.width = c.height = cote;
        c.getContext("2d").drawImage(img, (img.width - r) / 2, (img.height - r) / 2, r, r, 0, 0, cote, cote);
        c.toBlob((b) => (b ? ok(b) : ko(new Error("Image illisible"))), "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => ko(new Error("Ce fichier n'est pas une image lisible."));
      img.src = URL.createObjectURL(fichier);
    });
  }

  /* ---------------- Mon compte ---------------- */
  async function enregistrerProfil(avatar) {
    const p = etat.profil;
    const { error } = await sb.rpc("modifier_mon_profil", {
      p_nom: $("#mc-nom").value, p_matricule: $("#mc-matricule").value, p_grade: $("#mc-grade").value, p_corps: $("#mc-corps").value,
      p_unite: uniteChoisie("mc"), p_avatar: avatar === undefined ? p.avatar_path || "" : avatar,
    });
    if (error) throw error;
    etat.profil = await chargerProfil();
    majBarreCompte();
  }

  async function initCompte() {
    const p = etat.profil;
    $("#mc-courriel").textContent = p.email;
    $("#mc-nom").value = p.nom_complet || "";
    $("#mc-matricule").value = p.matricule || "";
    const g = $("#mc-grade");
    if (p.grade && ![...g.options].some((o) => o.value === p.grade)) g.insertAdjacentHTML("beforeend", `<option>${esc(p.grade)}</option>`);
    g.value = p.grade || "";
    const corps = $("#mc-corps");
    corps.value = [...corps.options].some((o) => o.value === p.corps_police) ? p.corps_police : (p.corps_police ? "Autre" : "");
    await majChampPoste("mc");
    const poste = $("#mc-poste");
    if (p.unite && [...poste.options].some((o) => o.value === p.unite)) poste.value = p.unite;
    else if (p.unite) { poste.value = AUTRE; $("#mc-unite").value = p.unite; }
    majChampAutre("mc");
    remplirAvatar($("#mc-avatar"), p);
    $("#mc-retirer-avatar").hidden = !p.avatar_path;
    $("#mc-confirmer-suppr").value = "";
    $("#mc-supprimer").disabled = true;
  }

  $("#form-compte").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!$("#mc-nom").value.trim()) { $("#mc-nom").focus(); return toast("Le nom est obligatoire"); }
    if ($("#mc-poste").value === AUTRE && !$("#mc-unite").value.trim()) { $("#mc-unite").focus(); return toast("Précisez votre unité ou votre poste"); }
    const btn = $("#form-compte .btn-principal");
    btn.disabled = true;
    try { await enregistrerProfil(); toast("Compte mis à jour"); }
    catch (e) { toast(traduireErreur(e)); }
    btn.disabled = false;
  });

  $("#mc-fichier").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast("Photo trop lourde (15 Mo maximum)");
    toast("Envoi de la photo…");
    try {
      const blob = await reduireImage(f);
      const ancien = etat.profil.avatar_path;
      const chemin = `${etat.profil.id}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("avatars").upload(chemin, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      await enregistrerProfil(chemin);
      if (ancien) await sb.storage.from("avatars").remove([ancien]);
      remplirAvatar($("#mc-avatar"), etat.profil);
      $("#mc-retirer-avatar").hidden = false;
      toast("Photo mise à jour");
    } catch (e) { toast(traduireErreur(e)); }
  });

  $("#mc-retirer-avatar").addEventListener("click", async () => {
    const ancien = etat.profil.avatar_path;
    try {
      await enregistrerProfil("");
      if (ancien) await sb.storage.from("avatars").remove([ancien]);
      remplirAvatar($("#mc-avatar"), etat.profil);
      $("#mc-retirer-avatar").hidden = true;
      toast("Photo retirée");
    } catch (e) { toast(traduireErreur(e)); }
  });

  async function changerMotDePasse(v1, v2) {
    if (v1.length < 10) throw new Error("Le mot de passe doit contenir au moins 10 caractères.");
    if (v1 !== v2) throw new Error("Les deux mots de passe ne sont pas identiques.");
    const { error } = await sb.auth.updateUser({ password: v1 });
    if (error) throw error;
    await sb.rpc("mot_de_passe_change");
  }
  $("#form-mdp-compte").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await changerMotDePasse($("#mc-mdp").value, $("#mc-mdp2").value);
      ev.target.reset();
      toast("Mot de passe changé");
    } catch (e) { toast(traduireErreur(e)); }
  });
  $("#form-mdp-temp").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const m = $("#mt-message");
    m.hidden = true;
    try {
      await changerMotDePasse($("#mt-mdp").value, $("#mt-mdp2").value);
      ev.target.reset();
      toast("Mot de passe enregistré");
      demarrer();
    } catch (e) { m.textContent = traduireErreur(e); m.hidden = false; }
  });

  // Appel de la fonction sécurisée (Supabase Edge Function)
  async function actionCompte(corps) {
    const { data, error } = await sb.functions.invoke("admin-comptes", { body: corps });
    if (error) {
      let message = error.message;
      try { const j = await error.context.json(); if (j && j.erreur) message = j.erreur; } catch { /* message par défaut */ }
      throw new Error(message);
    }
    if (data && data.erreur) throw new Error(data.erreur);
    return data;
  }

  $("#mc-confirmer-suppr").addEventListener("input", (e) => {
    $("#mc-supprimer").disabled = e.target.value.trim().toUpperCase() !== "SUPPRIMER";
  });
  $("#mc-supprimer").addEventListener("click", async () => {
    const btn = $("#mc-supprimer");
    btn.disabled = true;
    btn.textContent = "Suppression…";
    try {
      await actionCompte({ action: "supprimer_mon_compte" });
      await sb.auth.signOut({ scope: "local" });
      montrer("#ecran-auth");
      ongletAuth("connexion");
      messageAuth("Votre compte a été supprimé définitivement.", "ok");
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Supprimer mon compte pour toujours";
      toast(traduireErreur(e));
    }
  });

  /* ---------------- Table des vitesses (mêmes règles que l'app Police Management iOS) ---------------- */
  const LIMITES = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
  const vt = { limite: 90, vitesse: 118, zone: "normale" };
  function calculVitesse(limite, vitesse, zone) {
    const exces = Math.max(0, vitesse - limite);
    const tarif = exces <= 20 ? 10 : exces <= 30 ? 15 : exces <= 45 ? 20 : exces <= 60 ? 25 : 30;
    const tranches = Math.floor(exces / 5);
    const amendeBase = exces > 0 ? 30 + tranches * tarif : 0;
    const gev = exces > 0 && (limite <= 60 ? exces >= 40 : limite <= 90 ? exces >= 50 : exces >= 60);
    let amende = amendeBase;
    if (gev) amende *= 2;
    if (zone !== "normale") amende *= 2;
    const pointsBase = exces <= 10 ? 0 : exces <= 20 ? 1 : exces <= 30 ? 2 : exces <= 45 ? 3 : exces <= 60 ? 5 : exces <= 80 ? 7 : exces <= 100 ? 9 : 12 + Math.floor((exces - 101) / 20) * 3;
    const points = gev ? pointsBase * 2 : pointsBase;
    const frais = amende <= 0 ? 0 : amende <= 10 ? 7 : amende < 50 ? 16 : amende < 100 ? 33 : amende < 150 ? 59 : amende < 300 ? 86 : amende < 600 ? 172 : amende < 1500 ? 343
      : amende <= 10000 ? Math.round(amende * 0.25) : 2500 + Math.round((amende - 10000) * 0.01);
    const contribution = amende <= 0 ? 0 : amende <= 100 ? 28 : amende <= 300 ? 52 : amende <= 500 ? 75 : Math.round(amende * 0.25);
    return { exces, tarif, tranches, amende, gev, points, frais, contribution, total: amende + frais + contribution };
  }
  const dollars = (n) => n.toLocaleString("fr-CA") + " $";

  function initVitesse() {
    const sel = $("#vt-limite");
    if (!sel.options.length) {
      sel.innerHTML = LIMITES.map((l) => `<option value="${l}">${l} km/h</option>`).join("");
      sel.value = vt.limite;
      sel.addEventListener("change", () => { vt.limite = +sel.value; rendreVitesse(); });
      $("#vt-vitesse").addEventListener("input", (e) => { vt.vitesse = Math.max(0, Math.min(260, +e.target.value || 0)); rendreVitesse(false); });
      $$(".segmente button").forEach((b) => b.addEventListener("click", () => {
        vt.zone = b.dataset.zone;
        $$(".segmente button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        rendreVitesse();
      }));
    }
    rendreVitesse();
  }

  function rendreVitesse(table = true) {
    const r = calculVitesse(vt.limite, vt.vitesse, vt.zone);
    const zoneTxt = vt.zone === "travaux" ? "de travaux" : "scolaire";
    $("#vt-resultat").innerHTML = r.exces <= 0
      ? `<p class="message ok">Aucun excès de vitesse.</p>`
      : `<div class="vt-carte ${r.gev ? "gev" : ""}">
          <div class="vt-chiffres">
            <div><small>Excès</small><b>${r.exces} km/h</b></div>
            <div><small>Amende</small><b class="rouge">${dollars(r.amende)}</b></div>
            <div><small>Points</small><b class="orange">${r.points}</b></div>
          </div>
          <dl class="vt-detail">
            <dt>Calcul (art. 516)</dt><dd>30 $ + ${r.tranches} × ${r.tarif} $</dd>
            ${r.gev ? `<dt>Grand excès (art. 516.1)</dt><dd>amende × 2, points × 2</dd>` : ""}
            ${vt.zone !== "normale" ? `<dt>Zone ${zoneTxt}</dt><dd>amende × 2</dd>` : ""}
            <dt>Frais judiciaires</dt><dd>${dollars(r.frais)}</dd>
            <dt>Contribution</dt><dd>${dollars(r.contribution)}</dd>
            <dt class="total">Réclamation totale</dt><dd class="total">${dollars(r.total)}</dd>
          </dl>
          ${r.gev ? `<div class="vt-gev"><b>GRAND EXCÈS DE VITESSE</b>
            <ul><li>Amende et points doublés (déjà inclus)</li><li>Suspension immédiate du permis : 7 jours</li><li>Récidive (10 ans) : suspension de 30 jours, saisie du véhicule possible, amende triplée (plus de deux GEV)</li></ul></div>` : ""}
        </div>`;
    if (!table) { surlignerLigne(); return; }
    $("#vt-table-titre").textContent = `· zone de ${vt.limite} km/h${vt.zone !== "normale" ? ", " + zoneTxt : ""}`;
    let lignes = "";
    for (let v = vt.limite + 5; v <= vt.limite + 150 && v <= 260; v += 5) {
      const x = calculVitesse(vt.limite, v, vt.zone);
      lignes += `<tr data-v="${v}" class="${x.gev ? "gev" : ""}"><td>${v}</td><td>+${x.exces}</td><td>${dollars(x.amende)}</td><td class="opt">${dollars(x.frais)}</td><td class="opt">${dollars(x.contribution)}</td><td><b>${dollars(x.total)}</b></td><td>${x.points}</td><td>${x.gev ? "GEV" : ""}</td></tr>`;
    }
    $("#vt-table").innerHTML = `<thead><tr><th>Vitesse</th><th>Excès</th><th>Amende</th><th class="opt">Frais</th><th class="opt">Contrib.</th><th>Total</th><th>Pts</th><th></th></tr></thead><tbody>${lignes}</tbody>`;
    $$("#vt-table tbody tr").forEach((tr) => tr.addEventListener("click", () => { vt.vitesse = +tr.dataset.v; $("#vt-vitesse").value = vt.vitesse; rendreVitesse(false); }));
    surlignerLigne();
  }
  function surlignerLigne() {
    $$("#vt-table tbody tr").forEach((tr) => tr.classList.toggle("choisie", +tr.dataset.v === Math.floor(vt.vitesse / 5) * 5));
  }
  function ongletLois(nom) {
    $$("[data-csr-onglet]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.csrOnglet === nom)));
    $("#csr-vitesse").hidden = nom !== "vitesse";
    $("#csr-articles").hidden = nom !== "articles";
    $("#csr-favoris").hidden = nom !== "favoris";
    if (nom === "vitesse") initVitesse();
    if (nom === "favoris") rendreFavoris();
  }
  $$("[data-csr-onglet]").forEach((b) => b.addEventListener("click", () => ongletLois(b.dataset.csrOnglet)));

  /* ---------------- Code de la sécurité routière ---------------- */
  const RACCOURCIS = [
    ["Cellulaire", "443.1"], ["Vitesse", "vitesse excède"], ["Ceinture", "ceinture de sécurité"], ["Alcool", "alcool"],
    ["Feu rouge", "feu rouge"], ["Arrêt obligatoire", "panneau arrêt"], ["Pneus d'hiver", "pneus conçus spécifiquement pour la conduite hivernale"],
    ["Corridor de sécurité", "véhicule d'urgence immobilisé"], ["Permis", "permis de conduire"], ["Immatriculation", "immatriculation"],
    ["Délit de fuite", "accident"], ["Grand excès", "grand excès de vitesse"],
  ];

  // Lois et règlements offerts (textes publics, dans data/)
  const JUSTICE = "https://laws-lois.justice.gc.ca/fra/";
  const LOIS = {
    csr: { nom: "Code de la sécurité routière", court: "CSR", ref: "RLRQ, c. C-24.2", fichier: "csr.json", lien: (n) => `${LEGIS}#se:${n.replace(/\./g, "_")}`, site: "LégisQuébec" },
    vhr: { nom: "Loi sur les véhicules hors route", court: "LVHR", ref: "RLRQ, c. V-1.3", fichier: "lois/vhr.json", lien: (n) => `https://www.legisquebec.gouv.qc.ca/fr/document/lc/V-1.3#se:${n.replace(/\./g, "_")}`, site: "LégisQuébec" },
    transport: { nom: "Loi concernant le transport rémunéré de personnes par automobile", court: "LTRPA", ref: "RLRQ, c. T-11.2", fichier: "lois/transport.json", lien: (n) => `https://www.legisquebec.gouv.qc.ca/fr/document/lc/T-11.2#se:${n.replace(/\./g, "_")}`, site: "LégisQuébec" },
    assurance: { nom: "Loi sur l'assurance automobile", court: "LAA", ref: "RLRQ, c. A-25", fichier: "lois/assurance.json", lien: (n) => `https://www.legisquebec.gouv.qc.ca/fr/document/lc/A-25#se:${n.replace(/\./g, "_")}`, site: "LégisQuébec" },
    "petits-batiments": { nom: "Règlement sur les petits bâtiments", court: "RPB", ref: "DORS/2010-91", fichier: "lois/petits-batiments.json", lien: () => `${JUSTICE}reglements/DORS-2010-91/TexteComplet.html`, site: "Justice Canada" },
    competence: { nom: "Règlement sur la compétence des conducteurs d'embarcations de plaisance", court: "RCCEP", ref: "DORS/99-53", fichier: "lois/competence.json", lien: () => `${JUSTICE}reglements/DORS-99-53/TexteComplet.html`, site: "Justice Canada" },
    restrictions: { nom: "Règlement sur les restrictions visant l'utilisation des bâtiments", court: "RRVUB", ref: "DORS/2008-120", fichier: "lois/restrictions.json", lien: () => `${JUSTICE}reglements/DORS-2008-120/TexteComplet.html`, site: "Justice Canada" },
    marine: { nom: "Loi de 2001 sur la marine marchande du Canada", court: "LMMC", ref: "L.C. 2001, ch. 26", fichier: "lois/marine.json", lien: () => `${JUSTICE}lois/c-10.15/TexteComplet.html`, site: "Justice Canada" },
  };
  etat.loi = (() => { try { const l = localStorage.getItem("pm-loi"); return LOIS[l] ? l : "csr"; } catch { return "csr"; } })();
  $("#loi-choix").value = etat.loi;
  $("#loi-choix").addEventListener("change", (e) => {
    etat.loi = e.target.value;
    try { localStorage.setItem("pm-loi", etat.loi); } catch { /* facultatif */ }
    etat.csr = null; $("#csr-q").value = ""; $("#csr-article").hidden = true; $(".csr-corps").classList.remove("avec-article");
    initCsr();
  });
  const loiCourante = () => LOIS[etat.loi] || LOIS.csr;

  /* Favoris : articles marqués d'une étoile, par membre (table lois_favoris, visible par lui seul) */
  const favoris = { liste: null, enCours: null };
  const cleFav = (loi, no) => loi + "|" + no;
  const ETOILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.2 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  async function chargerFavoris(forcer) {
    if (favoris.liste && !forcer) return favoris.liste;
    if (!favoris.enCours || forcer) {
      favoris.enCours = sb.from("lois_favoris").select("loi, numero, cree_le").order("cree_le", { ascending: false })
        .then(({ data }) => { favoris.liste = data || []; majNbFavoris(); return favoris.liste; });
    }
    return favoris.enCours;
  }
  const estFavori = (loi, no) => !!(favoris.liste || []).some((f) => cleFav(f.loi, f.numero) === cleFav(loi, no));
  function majNbFavoris() { $("#nb-fav").textContent = favoris.liste && favoris.liste.length ? favoris.liste.length : ""; }
  async function basculerFavori(loi, no) {
    await chargerFavoris();
    const deja = estFavori(loi, no);
    const { error } = deja
      ? await sb.from("lois_favoris").delete().eq("loi", loi).eq("numero", no)
      : await sb.from("lois_favoris").insert({ loi, numero: no });
    if (error) { toast(traduireErreur(error)); return deja; }
    if (deja) favoris.liste = favoris.liste.filter((f) => cleFav(f.loi, f.numero) !== cleFav(loi, no));
    else favoris.liste.unshift({ loi, numero: no, cree_le: new Date().toISOString() });
    majNbFavoris();
    toast(deja ? "Retiré des favoris" : `${(LOIS[loi] || {}).court || ""} art. ${no} ajouté aux favoris ★`);
    return !deja;
  }
  async function rendreFavoris() {
    const el = $("#fav-contenu");
    if (!favoris.liste) el.innerHTML = `<p class="etat">Chargement de vos favoris…</p>`;
    const liste = await chargerFavoris();
    if (!liste.length) {
      el.innerHTML = `<div class="fav-vide"><b>Aucun favori pour le moment</b>Ouvrez un article dans l'onglet Articles, puis touchez « Ajouter aux favoris ».</div>`;
      return;
    }
    const parLoi = Object.keys(LOIS).map((k) => [k, liste.filter((f) => f.loi === k)]).filter(([, l]) => l.length);
    const textes = {};
    await Promise.all(parLoi.map(async ([k]) => {
      try { const brut = await charger(LOIS[k].fichier); textes[k] = Array.isArray(brut) ? brut : brut.articles; } catch { textes[k] = []; }
    }));
    const ordre = (k, no) => { const a = textes[k].find((x) => x.numero === no); return a ? a.ordre ?? textes[k].indexOf(a) : 1e9; };
    el.innerHTML = parLoi.map(([k, l]) => `<section class="fav-groupe"><h4>${esc(LOIS[k].nom)} · ${esc(LOIS[k].court)}</h4><ul class="fav-liste">${
      l.slice().sort((a, b) => ordre(k, a.numero) - ordre(k, b.numero)).map((f) => {
        const a = textes[k].find((x) => x.numero === f.numero);
        return `<li><button class="fav-ouvrir" data-fav-loi="${esc(k)}" data-fav-no="${esc(f.numero)}"><span class="no-art">${esc(f.numero)}</span>
          <span class="extrait-bloc"><small>${esc(a ? a.section || a.chapitre || a.titre || "" : "")}</small><span class="extrait">${esc(a ? a.texte.replace(/\s+/g, " ").slice(0, 260) : "Article introuvable dans la version actuelle du texte.")}</span></span></button>
          <button class="fav-retirer" data-fav-retirer data-fav-loi="${esc(k)}" data-fav-no="${esc(f.numero)}" aria-label="Retirer l'article ${esc(f.numero)} des favoris" title="Retirer des favoris">★</button></li>`;
      }).join("")}</ul></section>`).join("");
    $$(".fav-ouvrir", el).forEach((b) => b.addEventListener("click", () => ouvrirFavori(b.dataset.favLoi, b.dataset.favNo)));
    $$("[data-fav-retirer]", el).forEach((b) => b.addEventListener("click", async () => { await basculerFavori(b.dataset.favLoi, b.dataset.favNo); rendreFavoris(); }));
  }
  async function ouvrirFavori(loi, no) {
    ongletLois("articles");
    if (etat.loi !== loi || !etat.csr || !etat.csr.length) {
      etat.loi = loi; $("#loi-choix").value = loi;
      try { localStorage.setItem("pm-loi", loi); } catch { /* facultatif */ }
      etat.csr = null;
      await initCsr();
    }
    $("#csr-q").value = no;
    chercherCsr();
    ouvrirArticle(etat.csr.find((a) => a.numero === no));
  }

  async function initCsr() {
    chargerFavoris().then(() => { if (etat.csr && etat.csr.length && $("#csr-q")) marquerEtoiles(); });
    if (etat.csr) return;
    etat.csr = [];
    const loi = loiCourante();
    $("#loi-titre").textContent = loi.nom;
    $("#loi-ref").textContent = loi.ref;
    $("#csr-q").placeholder = etat.loi === "csr" ? "Article (ex. 328) ou mots-clés (ex. cellulaire)" : "Numéro d'article ou mots-clés";
    $("#csr-raccourcis").hidden = etat.loi !== "csr";
    $("#csr-raccourcis").innerHTML = RACCOURCIS.map(([l, q]) => `<button data-q="${esc(q)}">${esc(l)}</button>`).join("");
    $$("#csr-raccourcis button").forEach((b) => b.addEventListener("click", () => { $("#csr-q").value = b.dataset.q; chercherCsr(); }));
    $("#csr-etat").textContent = "Chargement du Code…";
    try {
      const brut = await charger(loi.fichier);
      const tous = Array.isArray(brut) ? brut : brut.articles;
      if (!Array.isArray(brut) && brut.maj) $("#loi-ref").textContent = `${loi.ref} · texte du ${new Date(brut.maj + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}`;
      etat.csr = tous.map((a) => ({ ...a, _n: norm(a.numero + " " + (a.section || "") + " " + a.texte) }));
    } catch (e) {
      $("#csr-etat").textContent = traduireErreur(e);
      return;
    }
    if (!etat.csr.length) {
      $("#csr-etat").innerHTML = `Le texte du Code n'est pas encore chargé dans Police Management. Consultez-le sur <a href="${LEGIS}" target="_blank" rel="noopener">LégisQuébec</a>.`;
      return;
    }
    chercherCsr();
  }

  function surligner(texte, termes) {
    let h = esc(texte);
    if (!termes.length) return h;
    const motif = termes.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    // Correspondance tolérante aux accents : on construit une regex par caractère.
    const tolerant = motif.replace(/[aeiouc]/g, (c) => ({ a: "[aàâä]", e: "[eéèêë]", i: "[iîï]", o: "[oôö]", u: "[uùûü]", c: "[cç]" }[c]));
    try { return h.replace(new RegExp("(" + tolerant + ")", "gi"), "<mark>$1</mark>"); } catch { return h; }
  }

  function extrait(a, termes) {
    const t = a.texte.replace(/\s+/g, " ");
    if (!termes.length) return t.slice(0, 180);
    const n = norm(t);
    const i = n.indexOf(termes[0]);
    const debut = Math.max(0, i - 50);
    return (debut ? "… " : "") + t.slice(debut, debut + 200);
  }

  let csrMinuteur;
  $("#csr-q").addEventListener("input", () => { clearTimeout(csrMinuteur); csrMinuteur = setTimeout(chercherCsr, 160); });

  function chercherCsr() {
    if (!etat.csr || !etat.csr.length) return;
    const brut = $("#csr-q").value.trim();
    const q = norm(brut).replace(/^(art(icle)?\.?\s*)/, "");
    let res;
    let termes = [];
    if (!q) {
      res = etat.csr;
    } else if (/^\d+(\.\d+)*$/.test(q)) {
      const exact = etat.csr.filter((a) => a.numero === q);
      const prefixe = etat.csr.filter((a) => a.numero !== q && a.numero.startsWith(q + "."));
      res = exact.concat(prefixe);
      if (exact.length === 1 && !prefixe.length) ouvrirArticle(exact[0]);
    } else {
      termes = q.split(" ").filter((t) => t.length > 1);
      res = etat.csr
        .filter((a) => termes.every((t) => a._n.includes(t)))
        .map((a) => ({ a, s: termes.reduce((s, t) => s + a._n.split(t).length - 1, 0) + (a._n.includes(q) ? 20 : 0) }))
        .sort((x, y) => y.s - x.s || x.a.ordre - y.a.ordre)
        .map((x) => x.a);
    }
    const max = q ? 120 : 60;
    $("#csr-etat").textContent = q
      ? res.length ? `${res.length} article${res.length > 1 ? "s" : ""}${res.length > max ? ` (les ${max} plus pertinents)` : ""}` : "Aucun article ne correspond. Essayez un autre mot ou un numéro d'article."
      : `${etat.csr.length} articles. Cherchez par numéro ou par mot-clé.`;
    $("#csr-liste").innerHTML = res.slice(0, max).map((a) => `
      <li><button data-no="${esc(a.numero)}">
        <span class="no-art">${esc(a.numero)}${estFavori(etat.loi, a.numero) ? `<i class="etoile" aria-label="Favori">★</i>` : ""}</span>
        <span class="extrait-bloc"><small>${esc(a.section || a.chapitre || a.titre || "")}</small><span class="extrait">${surligner(extrait(a, termes), termes)}</span></span>
      </button></li>`).join("");
    $$("#csr-liste button").forEach((b) => b.addEventListener("click", () => ouvrirArticle(etat.csr.find((a) => a.numero === b.dataset.no), termes)));
  }

  function marquerEtoiles() {
    $$("#csr-liste button[data-no]").forEach((b) => {
      const no = $(".no-art", b), oui = estFavori(etat.loi, b.dataset.no), e = $(".etoile", no);
      if (oui && !e) no.insertAdjacentHTML("beforeend", `<i class="etoile" aria-label="Favori">★</i>`);
      if (!oui && e) e.remove();
    });
  }
  function ouvrirArticle(a, termes = []) {
    if (!a) return;
    const el = $("#csr-article");
    const loi = loiCourante();
    el.innerHTML = `
      <p class="fil">${esc([a.titre, a.chapitre, a.section].filter(Boolean).join(" › "))}</p>
      <h3>${esc(a.numero)}</h3>
      <div class="texte">${surligner(a.texte, termes)}</div>
      <div class="outils-art">
        <button class="btn-secondaire btn-favori" data-favori aria-pressed="${estFavori(etat.loi, a.numero)}">${ETOILE}<span>${estFavori(etat.loi, a.numero) ? "Dans mes favoris" : "Ajouter aux favoris"}</span></button>
        <button class="btn-secondaire" data-copier>Copier le texte</button>
        <a class="btn-secondaire" href="${esc(loi.lien(a.numero))}" target="_blank" rel="noopener">Texte officiel (${loi.site})</a>
        <button class="btn-secondaire" data-prec>‹ Précédent</button>
        <button class="btn-secondaire" data-suiv>Suivant ›</button>
      </div>`;
    el.hidden = false;
    $(".csr-corps").classList.add("avec-article");
    $$("#csr-liste button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.no === a.numero)));
    const i = etat.csr.indexOf(a);
    $("[data-copier]", el).addEventListener("click", () => copier(`${loi.court}, art. ${a.numero}\n${a.texte}`));
    const loiArt = etat.loi;
    $("[data-favori]", el).addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      const oui = await basculerFavori(loiArt, a.numero);
      b.disabled = false; b.setAttribute("aria-pressed", String(oui));
      $("span", b).textContent = oui ? "Dans mes favoris" : "Ajouter aux favoris";
      if (loiArt === etat.loi) marquerEtoiles();
    });
    $("[data-prec]", el).addEventListener("click", () => ouvrirArticle(etat.csr[i - 1], termes));
    $("[data-suiv]", el).addEventListener("click", () => ouvrirArticle(etat.csr[i + 1], termes));
    if (window.innerWidth < 900) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- Données géographiques ---------------- */
  const fichiers = {};
  function charger(nom) {
    if (!fichiers[nom]) {
      fichiers[nom] = fetch("data/" + nom, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error("Fichier de données manquant : " + nom);
        return r.json();
      });
    }
    return fichiers[nom];
  }

  // Point dans polygone (GeoJSON Polygon / MultiPolygon), coordonnées [lon, lat]
  function dansAnneau(x, y, anneau) {
    let dedans = false;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }
  function dansGeometrie(x, y, g) {
    if (!g) return false;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    return polys.some((p) => dansAnneau(x, y, p[0]) && !p.slice(1).some((trou) => dansAnneau(x, y, trou)));
  }
  function bbox(g) {
    if (g._bb) return g._bb;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    const parcourir = (arr) => { if (typeof arr[0] === "number") { a = Math.min(a, arr[0]); c = Math.max(c, arr[0]); b = Math.min(b, arr[1]); d = Math.max(d, arr[1]); } else arr.forEach(parcourir); };
    parcourir(g.coordinates);
    return (g._bb = [a, b, c, d]);
  }
  function trouverPolygone(fc, x, y) {
    return fc.features.find((f) => { const bb = bbox(f.geometry); return x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && dansGeometrie(x, y, f.geometry); });
  }
  function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function distSegmentM(lat, lon, a, b) {
    // approximation plane locale, suffisante à l'échelle de quelques kilomètres
    const kx = Math.cos((lat * Math.PI) / 180) * 111320, ky = 110540;
    const px = lon * kx, py = lat * ky, ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  const PALETTE = ["#2467C4", "#7B4FC9", "#C2410C", "#0E7C86", "#B5179E", "#3D6B21", "#9A6B00", "#B42318", "#3949AB", "#00796B"];
  function couleurCorps(c) {
    if (!c) return getComputedStyle(document.documentElement).getPropertyValue("--mun").trim() || "#2467C4";
    if (c.couleur) return c.couleur;
    let h = 0;
    for (const ch of c.nom) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  async function chargerCorps() {
    let data;
    try { data = await charger("corps_police.json"); } catch (e) { console.warn(e); return; }
    etat.corps = data.map((c) => ({ ...c, _munis: new Set((c.municipalites || []).map(norm)) })).sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
    if (etat.vue === "corps") rendreCorps();
    if (etat.couches && etat.couches.mun) restylerMunicipal();
  }

  const corpsPourMunicipalite = (nom) => etat.corps.find((c) => c._munis.has(norm(nom)));

  async function identifier(lat, lon) {
    const [mun, postes, aut, rep] = await Promise.all([
      charger("municipalites_hors_sq.geojson"), charger("sq_postes.geojson"), charger("sq_autoroutier.geojson"), charger("reperes.json"),
    ]);
    const res = { lat, lon };
    try {
      const toutes = await charger("municipalites.geojson");
      const f = trouverPolygone(toutes, lon, lat);
      if (f) res.muni = f.properties;
    } catch { /* fichier pas encore généré */ }
    const fm = trouverPolygone(mun, lon, lat);
    if (fm) {
      const c = corpsPourMunicipalite(fm.properties.nom);
      res.corps = c ? { nom: c.nom, type: c.type, telephone: c.telephone, couleur: couleurCorps(c) } : { nom: "Corps de police municipal ou autochtone", type: "municipal", inconnu: true, couleur: couleurCorps(null) };
      res.municipalite = fm.properties;
    } else {
      const fp = trouverPolygone(postes, lon, lat);
      if (fp) res.sq = fp.properties;
    }
    // Patrouille autoroutière à moins de 250 m
    let meilleure = null;
    for (const f of aut.features) {
      const bb = bbox(f.geometry);
      if (lon < bb[0] - 0.01 || lon > bb[2] + 0.01 || lat < bb[1] - 0.01 || lat > bb[3] + 0.01) continue;
      const lignes = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const l of lignes) for (let i = 1; i < l.length; i++) {
        const d = distSegmentM(lat, lon, l[i - 1], l[i]);
        if (!meilleure || d < meilleure.d) meilleure = { d, p: f.properties };
      }
    }
    if (meilleure && meilleure.d < 250) res.autoroutier = meilleure.p;
    // Borne la plus proche
    let proche = null;
    for (const r of rep.reperes) {
      if (Math.abs(r[4] - lat) > 0.1 || Math.abs(r[3] - lon) > 0.15) continue;
      const d = distanceM(lat, lon, r[4], r[3]);
      if (!proche || d < proche.d) proche = { d, r };
    }
    if (proche && proche.d < 5000) res.borne = proche;
    return res;
  }

  function nomRoute(no, rep) {
    const autoroute = no < 100 || (no >= 400 && no < 1000);
    let n = (rep.routes && rep.routes[String(no)]) || "";
    if (!autoroute && /^autoroute/i.test(n)) n = "route " + no;
    const prefixe = autoroute ? "A-" : "R-";
    return { court: prefixe + no, long: n };
  }

  async function ficheLieu(res, titre) {
    const rep = await charger("reperes.json");
    const lignes = [];
    if (res.corps) {
      lignes.push(["Corps de police", `<span class="etiquette-corps" style="--c:${res.corps.couleur}">${esc(res.corps.nom)}</span>${res.corps.inconnu ? `<br><small>Municipalité non desservie par la SQ. Ajoutez le corps de police dans Admin.</small>` : ""}${res.corps.telephone ? `<br><span class="ref">${esc(res.corps.telephone)}</span>` : ""}`]);
      if (!res.muni) lignes.push(["Municipalité", esc(res.municipalite.nom) + (res.municipalite.mrc ? `<br><small>${esc(res.municipalite.mrc)}</small>` : "")]);
    } else if (res.sq) {
      lignes.push(["Corps de police", `<span class="etiquette-corps" style="--c:var(--sq)">Sûreté du Québec</span>`]);
      lignes.push(["Poste", esc(res.sq.NOM_UNIT)]);
      lignes.push(["Centre de services", esc(res.sq.NOM_CS)]);
      lignes.push(["Région / district", esc(res.sq.NOM_REG + (res.sq.NOM_DIST && res.sq.NOM_DIST !== "s.o." ? " · " + res.sq.NOM_DIST : ""))]);
    } else {
      lignes.push(["Corps de police", "Hors des territoires connus (plan d'eau, terres non organisées ou limite de données)."]);
    }
    if (res.muni) {
      lignes.push(["Code municipal", `<span class="code-mun">${esc(res.muni.code)}</span> <button class="lien" data-copier-code="${esc(res.muni.code)}">Copier</button>`]);
      lignes.push(["Municipalité", esc(res.muni.nom) + `<br><small>${esc([res.muni.mrc, res.muni.region].filter(Boolean).join(" · "))}</small>`]);
      try {
        const dj = await charger("districts_judiciaires.json");
        const d = dj[String(res.muni.code).padStart(5, "0")];
        if (d) lignes.push(["District judiciaire", esc(d)]);
      } catch { /* facultatif */ }
    }
    if (res.autoroutier) lignes.push(["Autoroute", `Patrouille : ${esc(res.autoroutier.NOM_UNIT)}`]);
    if (res.borne) {
      const [no, km, dir, , , muni] = res.borne.r;
      const nr = nomRoute(no, rep);
      lignes.push(["Borne proche", `<span class="borne"><small>${esc(nr.court)}</small><b>${km % 1 ? km.toFixed(1) : km}</b></span> ${dir ? esc(dirNom(dir)) + " · " : ""}${Math.round(res.borne.d)} m${nr.long ? `<br><small>${esc(nr.long)}${muni ? " · " + esc(muni) : ""}</small>` : ""}`]);
    }
    lignes.push(["Coordonnées", `<span class="ref">${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}</span>`]);
    const f = $("#fiche-lieu");
    f.innerHTML = `<button class="btn-icone fermer" aria-label="Fermer">✕</button>
      <h4>${esc(titre || "Ce point")}</h4>
      ${lignes.map(([a, b]) => `<div class="ligne-info"><span>${a}</span><span>${b}</span></div>`).join("")}
      ${liensAller(res.lat, res.lon)}
      <div class="fiche-actions"><button class="lien" data-copier-pos>Copier la position</button><button class="lien" data-partager-pos>Partager ce point</button></div>`;
    f.hidden = false;
    $(".fermer", f).addEventListener("click", () => (f.hidden = true));
    $("[data-copier-pos]", f).addEventListener("click", () => copier(`${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}`));
    $("[data-partager-pos]", f).addEventListener("click", () => partagerPoint(res.lat, res.lon, titre));
    $$("[data-copier-code]", f).forEach((b) => b.addEventListener("click", () => copier(b.dataset.copierCode)));
  }
  // « Y aller » : itinéraire dans Plans (Apple), Google Maps ou Waze
  const liensAller = (lat, lon) => {
    const ll = `${(+lat).toFixed(6)},${(+lon).toFixed(6)}`;
    return `<div class="aller"><span>Y aller</span><a href="https://maps.apple.com/?daddr=${ll}&dirflg=d" target="_blank" rel="noopener">Plans</a><a href="https://www.google.com/maps/dir/?api=1&destination=${ll}" target="_blank" rel="noopener">Google Maps</a><a href="https://waze.com/ul?ll=${ll}&navigate=yes" target="_blank" rel="noopener">Waze</a></div>`;
  };
  // Partager un point : lien vers la carte de Police Management (le collègue doit être connecté)
  async function partagerPoint(lat, lon, titre) {
    const url = `${location.origin}${location.pathname}#carte@${(+lat).toFixed(5)},${(+lon).toFixed(5)}`;
    const texte = `${titre || "Point"} — Police Management`;
    if (navigator.share) { try { await navigator.share({ title: texte, text: texte, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    copier(url);
  }
  const dirNom = (d) => ({ N: "Nord", S: "Sud", E: "Est", O: "Ouest" }[d] || d);

  /* ---------------- Carte ---------------- */
  function initCarte() {
    if (etat.carte) { setTimeout(() => etat.carte.invalidateSize(), 50); return; }
    const carte = (etat.carte = L.map("carte", { zoomControl: false, preferCanvas: true }).setView([46.9, -71.8], 6));
    L.control.zoom({ position: "bottomright" }).addTo(carte);
    // Fonds : plan OpenStreetMap (assombri en thème foncé) ou imagerie satellite Esri avec noms de routes et de lieux
    const fonds = {
      plan: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap", className: "tuiles-plan" }),
      satellite: L.layerGroup([
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagerie © Esri, Maxar, Earthstar Geographics" }),
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: 0.9 }),
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
      ]),
    };
    let fond = (() => { try { return localStorage.getItem("pm-fond") === "satellite" ? "satellite" : "plan"; } catch { return "plan"; } })();
    const choisirFond = (f) => {
      Object.entries(fonds).forEach(([k, c]) => (k === f ? c.addTo(carte) : carte.removeLayer(c)));
      fond = f;
      $$("[data-fond]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.fond === f)));
      $("#carte").classList.toggle("fond-satellite", f === "satellite");
      try { localStorage.setItem("pm-fond", f); } catch { /* facultatif */ }
    };
    choisirFond(fond);
    $$("[data-fond]").forEach((b) => b.addEventListener("click", () => choisirFond(b.dataset.fond)));
    const rendu = L.canvas({ padding: 0.3 });
    etat.couches = {};

    charger("sq_postes.geojson").then((fc) => {
      const sq = getComputedStyle(document.documentElement).getPropertyValue("--sq").trim();
      etat.couches.sq = L.geoJSON(fc, {
        renderer: rendu, interactive: false,
        style: { color: sq, weight: 1.2, fillColor: sq, fillOpacity: 0.07 },
      });
      if ($("#c-sq").checked) etat.couches.sq.addTo(carte).bringToBack();
    }).catch((e) => toast(e.message));

    charger("municipalites_hors_sq.geojson").then((fc) => {
      etat.couches.mun = L.geoJSON(fc, { renderer: rendu, interactive: false, style: styleMunicipal });
      if ($("#c-mun").checked) etat.couches.mun.addTo(carte);
    }).catch((e) => toast(e.message));

    charger("sq_autoroutier.geojson").then((fc) => {
      etat.couches.aut = L.geoJSON(fc, { renderer: rendu, interactive: false, style: { color: "#F2B33D", weight: 4, opacity: 0.85 } });
      if ($("#c-aut").checked) etat.couches.aut.addTo(carte);
    }).catch(() => {});

    charger("sq_bureaux.geojson").then((fc) => {
      etat.couches.bur = L.geoJSON(fc, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { renderer: rendu, radius: 6, color: "#fff", weight: 2, fillColor: "#C62F3A", fillOpacity: 1 }),
        onEachFeature: (f, l) => l.bindPopup(() => `<div class="popup-poste"><b>${esc(f.properties.NOM_ENT)}</b><span>${esc(f.properties.ADRESSE)}, ${esc(f.properties.MUNICIPALITE)} ${esc(f.properties.CODE_POST)}</span>${liensAller(f.geometry.coordinates[1], f.geometry.coordinates[0])}</div>`),
      });
      if ($("#c-bur").checked) etat.couches.bur.addTo(carte);
    }).catch(() => {});

    etat.couches.sorties = L.tileLayer.wms("https://ws.mapserver.transports.gouv.qc.ca/swtq", {
      layers: "sortie_aut", format: "image/png", transparent: true, version: "1.3.0", minZoom: 10, attribution: "MTMD",
    });

    // Limites municipales avec nom et code (chargées à la demande)
    etat.couches.limites = L.layerGroup();
    etat.couches.etiquettes = L.layerGroup();
    const fg = () => getComputedStyle(document.documentElement).getPropertyValue("--fg-doux").trim() || "#556479";
    const chargerLimites = async () => {
      if (etat.couches.limites.getLayers().length) return;
      try {
        const fc = await charger("municipalites.geojson");
        L.geoJSON(fc, { renderer: rendu, interactive: false, style: { color: fg(), weight: 1, opacity: 0.8, fill: false, dashArray: "3 3" } }).addTo(etat.couches.limites);
      } catch { toast("Les limites municipales seront offertes après la prochaine mise à jour des données"); }
    };
    const dessinerEtiquettes = async () => {
      const g = etat.couches.etiquettes;
      g.clearLayers();
      if (!$("#c-limites").checked || carte.getZoom() < 11) return;
      const idx = await charger("municipalites.json");
      const b = carte.getBounds();
      let n = 0;
      for (const m of idx.municipalites) {
        if (m[4] < b.getSouth() || m[4] > b.getNorth() || m[3] < b.getWest() || m[3] > b.getEast() || /^TNO aquatique/.test(m[0])) continue;
        if (++n > 300) break;
        L.marker([m[4], m[3]], { interactive: false, icon: L.divIcon({ className: "etiquette-mun", html: `<b>${esc(m[0])}</b><span>${esc(m[1])}</span>`, iconSize: null }) }).addTo(g);
      }
    };
    carte.on("moveend zoomend", dessinerEtiquettes);

    // Caméras de circulation du MTMD
    etat.couches.cam = L.layerGroup();
    const chargerCameras = async () => {
      if (etat.couches.cam.getLayers().length) return;
      try {
        const fc = await charger("cameras.geojson");
        L.geoJSON(fc, {
          pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: "icone-camera", html: "", iconSize: [22, 22] }), title: champCamera(f.properties).nom }),
          onEachFeature: (f, l) => l.bindPopup(() => popupCamera(f.properties), { maxWidth: 340, minWidth: 260 }),
        }).addTo(etat.couches.cam);
      } catch { toast("Les caméras seront offertes après la prochaine mise à jour des données"); }
    };

    // Bornes kilométriques dessinées à partir du fichier local
    etat.couches.km = L.layerGroup().addTo(carte);
    const dessinerBornes = async () => {
      const g = etat.couches.km;
      g.clearLayers();
      if (!$("#c-km").checked || carte.getZoom() < 11) return;
      const rep = await charger("reperes.json");
      const b = carte.getBounds().pad(0.1);
      const z = carte.getZoom();
      let n = 0;
      for (const r of rep.reperes) {
        if (r[4] < b.getSouth() || r[4] > b.getNorth() || r[3] < b.getWest() || r[3] > b.getEast()) continue;
        if (z < 13 && r[1] % 5 !== 0) continue;
        if (++n > 1500) break;
        const nr = nomRoute(r[0], rep);
        const titre = `${nr.court} · km ${r[1]}${r[2] ? " " + dirNom(r[2]) : ""}`;
        if (z >= 14) {
          L.marker([r[4], r[3]], { icon: L.divIcon({ className: "icone-borne", html: String(r[1]), iconSize: [34, 20] }), title: titre }).addTo(g);
        } else {
          L.circleMarker([r[4], r[3]], { renderer: rendu, radius: 4, color: "#fff", weight: 1.5, fillColor: "#1F7A3A", fillOpacity: 1 }).bindTooltip(titre).addTo(g);
        }
      }
    };
    carte.on("moveend zoomend", dessinerBornes);

    const bascule = (id, cle, versArriere) => $(id).addEventListener("change", (e) => {
      const c = etat.couches[cle];
      if (cle === "km") return dessinerBornes();
      if (cle === "limites") {
        if (e.target.checked) { chargerLimites(); etat.couches.limites.addTo(carte); etat.couches.etiquettes.addTo(carte); dessinerEtiquettes(); }
        else { carte.removeLayer(etat.couches.limites); carte.removeLayer(etat.couches.etiquettes); }
        return;
      }
      if (cle === "cam") {
        if (e.target.checked) { chargerCameras(); etat.couches.cam.addTo(carte); } else carte.removeLayer(etat.couches.cam);
        return;
      }
      if (!c) return;
      e.target.checked ? (c.addTo(carte), versArriere && c.bringToBack && c.bringToBack()) : carte.removeLayer(c);
    });
    // Autres postes de police (municipaux, GRC, autochtones…) — OpenStreetMap, filtrés au Québec
    etat.couches.autres = L.layerGroup();
    const chargerAutres = async () => {
      if (etat.couches.autres.getLayers().length) return;
      const fc = await charger("postes_autres.geojson");
      L.geoJSON(fc, {
        pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: "icone-poste-autre", html: "", iconSize: [20, 20] }), title: f.properties.nom }),
        onEachFeature: (f, l) => l.bindPopup(() => {
          const p = f.properties, [lon, lat] = f.geometry.coordinates;
          return `<div class="popup-poste"><b>${esc(p.nom || "Poste de police")}</b>${p.exploitant && p.exploitant !== p.nom ? `<small>${esc(p.exploitant)}</small>` : ""}
            ${p.adresse ? `<span>${esc(p.adresse)}${p.municipalite ? ", " + esc(p.municipalite) : ""}</span>` : ""}
            ${p.telephone ? `<a href="tel:${esc(p.telephone.replace(/[^+\d]/g, ""))}">${esc(p.telephone)}</a>` : ""}
            ${liensAller(lat, lon)}
            <small class="ref">Source : OpenStreetMap</small></div>`;
        }),
      }).addTo(etat.couches.autres);
    };
    $("#c-autres").addEventListener("change", (e) => { if (e.target.checked) { chargerAutres(); etat.couches.autres.addTo(carte); } else carte.removeLayer(etat.couches.autres); });

    // Entraves et travaux routiers en temps réel (Québec 511, relayés par la fonction trafic-511)
    etat.couches.t511 = L.layerGroup();
    const date511 = (t) => { if (!t) return ""; const d = new Date(t.replace(/\//g, "-").replace(" ", "T")); return isNaN(d) ? t : d.toLocaleString("fr-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
    const popup511 = (p, ll) => `<div class="popup-poste popup-511"><small class="genre-511 ${p.genre}">${p.genre === "chantier" ? "Travaux routiers" : "Avertissement routier"}${p.route ? " · route " + esc(p.route) : ""}</small>
      <b>${esc(p.titre || p.travaux || "Entrave")}</b>
      ${p.travaux && p.titre ? `<span>${esc(p.travaux)}</span>` : ""}
      ${p.lieu ? `<span>${esc(p.lieu)}</span>` : ""}
      ${p.direction ? `<span>Direction : ${esc(p.direction)}</span>` : ""}
      ${p.municipalite ? `<span>${esc(p.municipalite)}</span>` : ""}
      ${p.cause ? `<span>Cause : ${esc(p.cause)}</span>` : ""}
      ${p.consequence ? `<span>${esc(p.consequence)}</span>` : ""}
      ${p.debut || p.fin ? `<small>Du ${esc(date511(p.debut))} au ${esc(date511(p.fin))}</small>` : ""}
      ${p.depuis ? `<small>En vigueur depuis ${esc(date511(p.depuis))}${p.duree ? " · durée : " + esc(p.duree) : ""}</small>` : ""}
      ${p.detour ? `<span>Détour : ${esc(p.detour)}</span>` : ""}
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Plus d'information</a>` : ""}
      ${ll ? liensAller(ll.lat, ll.lng) : ""}
      <small class="ref">Source : Québec 511 (MTMD)</small></div>`;
    const charger511 = async () => {
      const { data, error } = await sb.functions.invoke("trafic-511", { method: "GET" });
      if (error || !data || !data.features) { toast("Québec 511 ne répond pas pour le moment. Réessayez plus tard."); return; }
      etat.couches.t511.clearLayers();
      L.geoJSON(data, {
        style: (f) => f.properties.genre === "chantier" ? { color: "#E67E22", weight: 6, opacity: 0.9, dashArray: "8 6" } : { color: f.properties.couleur || "#C62F3A", weight: 7, opacity: 0.95 },
        pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: "icone-511 " + f.properties.genre, html: "!", iconSize: [22, 22] }) }),
        onEachFeature: (f, l) => l.bindPopup(() => popup511(f.properties, l.getLatLng ? l.getLatLng() : l.getBounds().getCenter()), { maxWidth: 320 }),
      }).addTo(etat.couches.t511);
      etat.maj511 = Date.now();
    };
    $("#c-511").addEventListener("change", (e) => {
      if (e.target.checked) { etat.couches.t511.addTo(carte); if (!etat.maj511 || Date.now() - etat.maj511 > 300000) charger511(); }
      else carte.removeLayer(etat.couches.t511);
    });

    // Lieux utiles : urgences et hôpitaux, palais de justice, établissements de détention (OpenStreetMap)
    etat.couches.lieux = L.layerGroup();
    const TYPES_LIEUX = { urgence: ["Urgence", "H"], hopital: ["Hôpital", "H"], justice: ["Palais de justice", "⚖"], detention: ["Établissement de détention", "🔒"] };
    const chargerLieux = async () => {
      if (etat.couches.lieux.getLayers().length) return;
      try {
        const { data, error } = await sb.from("lieux_utiles").select("type, nom, lat, lon, adresse, telephone");
        if (error) throw error;
        for (const { type, nom, lat, lon, adresse, telephone: tel } of data || []) {
          const [libelle, sym] = TYPES_LIEUX[type] || ["Lieu", "•"];
          L.marker([lat, lon], { icon: L.divIcon({ className: "icone-lieu " + type, html: sym, iconSize: [24, 24] }), title: nom })
            .bindPopup(() => `<div class="popup-poste"><small>${esc(libelle)}</small><b>${esc(nom || libelle)}</b>${adresse ? `<span>${esc(adresse)}</span>` : ""}${tel ? `<a href="tel:${esc(tel.replace(/[^+\d]/g, ""))}">${esc(tel)}</a>` : ""}${liensAller(lat, lon)}<small class="ref">Source : OpenStreetMap — vérifiez avant de vous déplacer</small></div>`)
            .addTo(etat.couches.lieux);
        }
      } catch { toast("Les lieux utiles seront offerts après la prochaine mise à jour des données"); }
    };
    $("#c-lieux").addEventListener("change", (e) => { if (e.target.checked) { chargerLieux(); etat.couches.lieux.addTo(carte); } else carte.removeLayer(etat.couches.lieux); });

    // Districts judiciaires : municipalités colorées par district, nom du district au centre
    etat.couches.districts = L.layerGroup();
    const couleurDistrict = (nom) => { let h = 0; for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h}, 62%, 48%)`; };
    const chargerDistricts = async () => {
      if (etat.couches.districts.getLayers().length) return;
      try {
        const [fc, dj, idx] = await Promise.all([charger("municipalites.geojson"), charger("districts_judiciaires.json"), charger("municipalites.json")]);
        const dist = (code) => dj[String(code).padStart(5, "0")];
        L.geoJSON(fc, {
          renderer: rendu, interactive: false,
          style: (f) => { const d = dist(f.properties.code); return d ? { color: couleurDistrict(d), weight: 0.6, fillColor: couleurDistrict(d), fillOpacity: 0.22 } : { stroke: false, fill: false }; },
        }).addTo(etat.couches.districts);
        const centres = {};
        for (const m of idx.municipalites) { const d = dist(m[1]); if (!d) continue; const c = (centres[d] ||= [0, 0, 0]); c[0] += m[4]; c[1] += m[3]; c[2]++; }
        for (const [d, c] of Object.entries(centres)) {
          L.marker([c[0] / c[2], c[1] / c[2]], { interactive: false, icon: L.divIcon({ className: "etiquette-district", html: `<span style="--c:${couleurDistrict(d)}">${esc(d)}</span>`, iconSize: null }) }).addTo(etat.couches.districts);
        }
      } catch { toast("Districts judiciaires indisponibles pour le moment"); }
    };
    $("#c-districts").addEventListener("change", (e) => { if (e.target.checked) { chargerDistricts(); etat.couches.districts.addTo(carte); } else carte.removeLayer(etat.couches.districts); });

    // Mesurer une distance : chaque toucher ajoute un point
    const mesure = { points: [], ligne: L.polyline([], { color: "#F2B33D", weight: 4, dashArray: "6 6" }), marques: L.layerGroup() };
    const majMesure = () => {
      mesure.ligne.setLatLngs(mesure.points);
      let d = 0; for (let i = 1; i < mesure.points.length; i++) d += carte.distance(mesure.points[i - 1], mesure.points[i]);
      $("#mesure-total").textContent = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(d < 10000 ? 2 : 1).replace(".", ",")} km`;
      $("#mesure-aide").textContent = mesure.points.length < 2 ? "Touchez la carte pour ajouter des points" : `${mesure.points.length} points · distance totale`;
    };
    const finMesure = (effacer) => {
      etat.modeMesure = false;
      $("#btn-mesure").setAttribute("aria-pressed", "false"); $("#carte").classList.remove("mode-repere");
      if (effacer) { mesure.points = []; mesure.marques.clearLayers(); carte.removeLayer(mesure.ligne); carte.removeLayer(mesure.marques); $("#mesure-boite").hidden = true; }
      else $("#mesure-aide").textContent = "Mesure terminée";
    };
    $("#btn-mesure").addEventListener("click", () => {
      if (etat.modeMesure) return finMesure(true);
      etat.modeRepere = false; $("#btn-repere").setAttribute("aria-pressed", "false");
      etat.modeMesure = true; mesure.points = []; mesure.marques.clearLayers();
      mesure.ligne.addTo(carte); mesure.marques.addTo(carte);
      $("#btn-mesure").setAttribute("aria-pressed", "true"); $("#carte").classList.add("mode-repere");
      $("#mesure-boite").hidden = false; $("#fiche-lieu").hidden = true; majMesure();
    });
    $("#mesure-annuler").addEventListener("click", () => finMesure(true));
    $("#mesure-fin").addEventListener("click", () => finMesure(false));
    etat.ajouterPointMesure = (ll) => {
      mesure.points.push(ll);
      L.circleMarker(ll, { radius: 5, color: "#fff", weight: 2, fillColor: "#F2B33D", fillOpacity: 1 }).addTo(mesure.marques);
      majMesure();
    };

    // Mes repères (privés, enregistrés dans mon compte)
    etat.couches.reperes = L.layerGroup().addTo(carte);
    etat.dessinerReperes = () => {
      const g = etat.couches.reperes; g.clearLayers();
      for (const r of etat.reperes || []) {
        L.marker([r.lat, r.lon], { icon: L.divIcon({ className: "icone-repere", html: "", iconSize: [26, 26], iconAnchor: [13, 24] }), title: r.nom })
          .bindPopup(() => {
            const div = document.createElement("div");
            div.className = "popup-poste";
            div.innerHTML = `<b>${esc(r.nom)}</b>${r.note ? `<span>${esc(r.note)}</span>` : ""}<span class="ref">${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}</span>
              ${liensAller(r.lat, r.lon)}
              <button type="button" class="lien rouge" data-suppr>Supprimer ce repère</button>`;
            div.querySelector("[data-suppr]").addEventListener("click", async () => {
              const { error } = await sb.from("reperes_perso").delete().eq("id", r.id);
              if (error) return toast(traduireErreur(error));
              etat.reperes = etat.reperes.filter((x) => x.id !== r.id); etat.dessinerReperes(); toast("Repère supprimé");
            });
            return div;
          }).addTo(g);
      }
    };
    sb.from("reperes_perso").select("*").order("cree_le").then(({ data }) => { etat.reperes = data || []; etat.dessinerReperes(); });
    $("#c-reperes").addEventListener("change", (e) => (e.target.checked ? etat.couches.reperes.addTo(carte) : carte.removeLayer(etat.couches.reperes)));
    etat.modeRepere = false;
    $("#btn-repere").addEventListener("click", () => {
      etat.modeRepere = !etat.modeRepere;
      $("#btn-repere").setAttribute("aria-pressed", String(etat.modeRepere));
      $("#carte").classList.toggle("mode-repere", etat.modeRepere);
      if (etat.modeRepere) toast("Touchez la carte à l'endroit du repère");
    });
    const formRepere = (lat, lon) => {
      const f = $("#fiche-lieu");
      f.innerHTML = `<button class="btn-icone fermer" aria-label="Fermer">✕</button>
        <h4>Nouveau repère</h4>
        <form class="form-repere" novalidate>
          <input name="nom" maxlength="80" placeholder="Nom (ex. Point de contrôle, accès sentier)" required>
          <input name="note" maxlength="500" placeholder="Note (facultatif)">
          <p class="ref">${lat.toFixed(5)}, ${lon.toFixed(5)} · visible par vous seulement</p>
          <button class="btn-principal" type="submit">Enregistrer le repère</button>
        </form>`;
      f.hidden = false;
      $(".fermer", f).addEventListener("click", () => (f.hidden = true));
      setTimeout(() => $("input[name=nom]", f).focus(), 100);
      $("form", f).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const nom = ev.target.nom.value.trim();
        if (!nom) return ev.target.nom.focus();
        const { data, error } = await sb.from("reperes_perso").insert({ nom, note: ev.target.note.value.trim() || null, lat, lon }).select().single();
        if (error) return toast(traduireErreur(error));
        (etat.reperes = etat.reperes || []).push(data); etat.dessinerReperes();
        f.hidden = true; toast("Repère enregistré");
      });
    };
    etat.formRepere = formRepere;

    bascule("#c-sq", "sq", true); bascule("#c-mun", "mun"); bascule("#c-aut", "aut"); bascule("#c-km", "km"); bascule("#c-sorties", "sorties"); bascule("#c-bur", "bur"); bascule("#c-limites", "limites"); bascule("#c-cam", "cam");
    etat.surligne = L.layerGroup().addTo(carte);
    etat.choixUnitePret = remplirChoixUnite();
    $("#legende-bascule").addEventListener("click", (e) => {
      const ouvert = e.currentTarget.getAttribute("aria-expanded") === "true";
      e.currentTarget.setAttribute("aria-expanded", String(!ouvert));
      $("#legende-corps").hidden = ouvert;
    });
    if (window.innerWidth < 600) $("#legende-bascule").click();

    let marqueur;
    etat.placer = async (lat, lon, titre, zoom) => {
      if (marqueur) carte.removeLayer(marqueur);
      marqueur = L.marker([lat, lon]).addTo(carte);
      if (zoom) carte.setView([lat, lon], zoom);
      const res = await identifier(lat, lon);
      ficheLieu(res, titre);
    };
    carte.on("click", (e) => {
      if (etat.modeMesure) return etat.ajouterPointMesure(e.latlng);
      if (etat.modeRepere) {
        etat.modeRepere = false; $("#btn-repere").setAttribute("aria-pressed", "false"); $("#carte").classList.remove("mode-repere");
        return etat.formRepere(e.latlng.lat, e.latlng.lng);
      }
      etat.placer(e.latlng.lat, e.latlng.lng, "Point sélectionné");
    });
    setTimeout(() => carte.invalidateSize(), 50);
  }

  function styleMunicipal(f) {
    const c = corpsPourMunicipalite(f.properties.nom);
    const col = couleurCorps(c);
    return { color: col, weight: 1.2, fillColor: col, fillOpacity: c ? 0.22 : 0.12, dashArray: c ? null : "4 3" };
  }
  function restylerMunicipal() { etat.couches.mun.setStyle(styleMunicipal); }

  /* Caméras : les noms de champs du MTMD sont détectés automatiquement */
  function champCamera(p) {
    p = p || {};
    const no = parseInt(p.NumeroRoute, 10);
    return {
      nom: p.DescriptionLocalisationFr || p.DescriptionLocalisationEn || "Caméra de circulation",
      route: no ? (no < 100 || (no >= 400 && no < 1000) ? "Autoroute " : "Route ") + no : "",
      direction: [p.NomRegionDiffusion, p.NomPosteFrontalier, p.NomPontFrontalier].filter(Boolean).join(" · "),
      image: null,
      video: p.URL_FLUX_DONNEE || null,
      numero: p.NumeroCamera || "",
    };
  }
  function popupCamera(p) {
    const c = champCamera(p);
    const img = c.image ? `${c.image}${c.image.includes("?") ? "&" : "?"}t=${Date.now()}` : null;
    return `<div class="popup-camera">
      <b>${esc(c.nom)}</b>
      ${c.route || c.direction ? `<small>${esc([c.route, c.direction].filter(Boolean).join(" · "))}</small>` : ""}
      ${c.numero ? `<small class="ref">Caméra ${esc(c.numero)}</small>` : ""}
      ${img ? `<img src="${esc(img)}" alt="Image de la caméra" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('small'),{textContent:'Image non disponible pour le moment.'}))">` : ""}
      ${c.video ? `<a href="${esc(c.video)}" target="_blank" rel="noopener">Voir la caméra en direct (Québec 511)</a>` : ""}
    </div>`;
  }

  /* Menu « Poste ou corps de police » : toutes les infos + territoire surligné */
  async function remplirChoixUnite() {
    const sel = $("#choix-unite");
    let bureaux, corps;
    try { [bureaux, corps] = await Promise.all([charger("sq_bureaux.geojson"), charger("corps_police.json")]); }
    catch { return; }
    const groupes = {};
    const ajouter = (g, v, t) => (groupes[g] ||= []).push([v, t]);
    bureaux.features.forEach((f, i) => {
      const p = f.properties, nom = nomBureau(p.NOM_ENT || "");
      if (["Grand quartier général", "District", "Région"].includes(p.CAT_UNIT)) ajouter("SQ — Quartiers généraux", "b:" + i, nom);
      else if (p.CAT_UNIT === "Poste autoroutier") ajouter("SQ — Postes autoroutiers", "b:" + i, nom);
      else ajouter("SQ — " + (p.NOM_REG && p.NOM_REG !== "s.o." ? p.NOM_REG : "Autres postes"), "b:" + i, nom);
    });
    corps.filter((c) => c.type === "municipal").forEach((c) => ajouter("Corps de police municipaux", "c:" + c.nom, c.nom));
    corps.filter((c) => c.type === "autochtone").forEach((c) => ajouter("Corps de police autochtones", "c:" + c.nom, c.nom));
    const ordre = (g) => (g.startsWith("SQ — Quartiers") ? 0 : g.startsWith("SQ — Postes auto") ? 2 : g.startsWith("SQ") ? 1 : g.includes("municipaux") ? 3 : 4);
    sel.innerHTML = `<option value="">Choisir un poste ou un corps de police…</option>` +
      Object.keys(groupes).sort((a, b) => ordre(a) - ordre(b) || a.localeCompare(b, "fr")).map((g) =>
        `<optgroup label="${esc(g)}">${groupes[g].sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</optgroup>`).join("");
  }

  async function afficherUnite(valeur) {
    if (!valeur) return;
    const carte = etat.carte;
    const g = etat.surligne;
    g.clearLayers();
    const style = { color: "#F2B33D", weight: 3, fillColor: "#F2B33D", fillOpacity: 0.18 };
    const lignes = [];
    let titre = "", bornes = null;
    const idx = await charger("municipalites.json");
    const codeDe = (nom, horsSQ = valeur.startsWith("c:")) =>
      (idx.municipalites.find((m) => norm(m[0]) === norm(nom) && (!horsSQ || !m[5])) || idx.municipalites.find((m) => norm(m[0]) === norm(nom)) || [])[1];
    const listeMunis = (noms) => {
      const tri = [...noms].sort((a, b) => a.localeCompare(b, "fr"));
      return `<details><summary>${tri.length} municipalité${tri.length > 1 ? "s" : ""}</summary><ul class="liste-munis">${tri.map((n) => {
        const code = codeDe(n);
        return `<li>${esc(n)}${code ? ` <span class="ref">${esc(code)}</span>` : ""}</li>`;
      }).join("")}</ul></details>`;
    };

    if (valeur.startsWith("b:")) {
      const bureaux = await charger("sq_bureaux.geojson");
      const f = bureaux.features[+valeur.slice(2)];
      const p = f.properties;
      titre = nomBureau(p.NOM_ENT);
      const [lon, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#C62F3A", fillOpacity: 1 }).addTo(g);
      bornes = L.latLngBounds([[lat, lon]]);
      lignes.push(["Corps de police", `<span class="etiquette-corps" style="--c:var(--sq)">Sûreté du Québec</span>`]);
      lignes.push(["Type", esc(p.CAT_UNIT || "—")]);
      const adresse = [p.ADRESSE, p.MUNICIPALITE, p.CODE_POST].filter((x) => x && x !== "s.o.").join(", ");
      if (adresse) lignes.push(["Adresse", `${esc(adresse)}<br><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse + ", Québec")}" target="_blank" rel="noopener">Itinéraire</a>`]);
      if (p.CODE_MUN && p.CODE_MUN !== "s.o.") lignes.push(["Code municipal", `<span class="code-mun">${esc(p.CODE_MUN)}</span> <small>(lieu du bureau)</small>`]);
      if (p.NOM_CS && p.NOM_CS !== "s.o.") lignes.push(["Centre de services", esc(p.NOM_CS)]);
      const rd = [p.NOM_REG, p.NOM_DIST].filter((x) => x && x !== "s.o.").join(" · ");
      if (rd) lignes.push(["Région / district", esc(rd)]);
      // Territoire desservi
      const unite = p.NOM_UNIT;
      if (p.CAT_UNIT === "Poste autoroutier") {
        const aut = await charger("sq_autoroutier.geojson");
        const tr = aut.features.filter((x) => x.properties.NOM_UNIT === unite);
        if (tr.length) { const l = L.geoJSON({ type: "FeatureCollection", features: tr }, { style: { color: "#F2B33D", weight: 7, opacity: 0.9 } }).addTo(g); bornes.extend(l.getBounds()); }
        lignes.push(["Territoire", tr.length ? `${tr.length} tronçon${tr.length > 1 ? "s" : ""} d'autoroute (en jaune)` : "—"]);
      } else if (unite) {
        const postes = await charger("sq_postes.geojson");
        const terr = postes.features.filter((x) => x.properties.NOM_UNIT === unite);
        if (terr.length) {
          const l = L.geoJSON({ type: "FeatureCollection", features: terr }, { style }).addTo(g);
          bornes.extend(l.getBounds());
          const munis = idx.municipalites.filter((m) => m[5] && !/^TNO aquatique/.test(m[0]) && terr.some((t) => dansGeometrie(m[3], m[4], t.geometry))).map((m) => m[0]);
          lignes.push(["Territoire", listeMunis(new Set(munis))]);
        }
      }
    } else if (valeur.startsWith("c:")) {
      const c = etat.corps.find((x) => x.nom === valeur.slice(2));
      if (!c) return;
      titre = c.nom;
      lignes.push(["Corps de police", `<span class="etiquette-corps" style="--c:${couleurCorps(c)}">${esc(c.nom)}</span>${c.sigle ? ` <span class="ref">${esc(c.sigle)}</span>` : ""}`]);
      lignes.push(["Type", c.type === "autochtone" ? "Corps de police autochtone" : "Corps de police municipal"]);
      if (c.telephone) lignes.push(["Téléphone", `<span class="ref">${esc(c.telephone)}</span>`]);
      if (c.notes) lignes.push(["Notes", esc(c.notes)]);
      lignes.push(["Territoire", listeMunis(c.municipalites || [])]);
      try {
        const toutes = await charger("municipalites_hors_sq.geojson"); // évite les homonymes desservis par la SQ
        const noms = new Set((c.municipalites || []).map(norm));
        const fs = toutes.features.filter((x) => noms.has(norm(x.properties.nom)));
        if (fs.length) { const l = L.geoJSON({ type: "FeatureCollection", features: fs }, { style }).addTo(g); bornes = l.getBounds(); }
      } catch { /* limites pas encore générées */ }
    }
    if (bornes && bornes.isValid()) carte.fitBounds(bornes.pad(0.15), { maxZoom: 13 });
    const f = $("#fiche-lieu");
    f.innerHTML = `<button class="btn-icone fermer" aria-label="Fermer">✕</button>
      <h4>${esc(titre)}</h4>
      ${lignes.map(([a, b]) => `<div class="ligne-info"><span>${a}</span><span>${b}</span></div>`).join("")}`;
    f.hidden = false;
    $(".fermer", f).addEventListener("click", () => { f.hidden = true; g.clearLayers(); $("#choix-unite").value = ""; });
  }
  $("#choix-unite").addEventListener("change", (e) => { if (e.target.value) fermerOutilsKm(); afficherUnite(e.target.value); });

  $("#form-km").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const no = parseInt($("#km-route").value.replace(/\D/g, ""), 10);
    const km = parseFloat($("#km-km").value.replace(",", "."));
    if (!no || isNaN(km)) return toast("Entrez un numéro de route et un kilométrage");
    const rep = await charger("reperes.json");
    const liste = rep.reperes.filter((r) => r[0] === no);
    if (!liste.length) return toast(`Aucune borne trouvée pour la route ${no}`);
    let best = liste[0];
    for (const r of liste) if (Math.abs(r[1] - km) < Math.abs(best[1] - km)) best = r;
    const nr = nomRoute(no, rep);
    const titre = `${nr.court} · km ${best[1]}${best[1] !== km ? ` (borne la plus proche du km ${km})` : ""}`;
    fermerOutilsKm(); $("#km-route").blur(); $("#km-km").blur();
    etat.placer(best[4], best[3], titre, 15);
  });

  /* Recherche d'adresse ou de coordonnées (géocodage OpenStreetMap Nominatim, au Québec seulement) */
  async function chercherAdresse(q) {
    const liste = $("#adresse-res");
    liste.hidden = true; liste.innerHTML = "";
    q = q.trim();
    if (!q) return;
    const c = q.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (c) {
      let lat = parseFloat(c[1].replace(",", ".")), lon = parseFloat(c[2].replace(",", "."));
      if (lon > 0 && lat < 0) [lat, lon] = [lon, lat];
      if (lon > 0) lon = -lon; // au Québec, la longitude est toujours négative
      return etat.placer(lat, lon, `Coordonnées ${lat.toFixed(5)}, ${lon.toFixed(5)}`, 16);
    }
    let res;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ca&accept-language=fr&addressdetails=1&viewbox=-79.8,62.6,-57.1,44.9&bounded=1&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      res = r.ok ? await r.json() : [];
    } catch { return toast("Recherche d'adresse impossible pour le moment"); }
    if (!res.length) return toast(`Aucun résultat au Québec pour « ${q} »`);
    const nomCourt = (x) => {
      const a = x.address || {};
      const rue = [a.house_number, a.road].filter(Boolean).join(" ");
      const ville = a.city || a.town || a.village || a.municipality || a.hamlet || "";
      return [x.name && x.name !== a.road ? x.name : "", rue, ville].filter(Boolean).join(", ") || x.display_name.split(",").slice(0, 3).join(",");
    };
    if (res.length === 1) return etat.placer(+res[0].lat, +res[0].lon, nomCourt(res[0]), 17);
    liste.innerHTML = res.map((x, i) => `<li><button type="button" data-i="${i}"><b>${esc(nomCourt(x))}</b><small>${esc(x.display_name)}</small></button></li>`).join("");
    liste.hidden = false;
    $$("button[data-i]", liste).forEach((b) => b.addEventListener("click", () => {
      const x = res[+b.dataset.i];
      liste.hidden = true;
      etat.placer(+x.lat, +x.lon, nomCourt(x), 17);
    }));
  }
  // Outils de la carte : panneau borne km / poste, plein écran
  $("#btn-outils-km").addEventListener("click", () => {
    const f = $("#form-km"), ouvrir = f.hidden;
    f.hidden = !ouvrir;
    $("#btn-outils-km").setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) setTimeout(() => $("#km-route").focus(), 50);
  });
  const fermerOutilsKm = () => { $("#form-km").hidden = true; $("#btn-outils-km").setAttribute("aria-expanded", "false"); };
  $("#btn-plein-ecran").addEventListener("click", () => {
    const plein = document.body.classList.toggle("carte-plein");
    $("#btn-plein-ecran").setAttribute("aria-pressed", String(plein));
    $("#btn-plein-ecran").title = plein ? "Quitter le plein écran" : "Plein écran";
    setTimeout(() => etat.carte && etat.carte.invalidateSize(), 60);
  });
  $("#form-adresse").addEventListener("submit", (e) => { e.preventDefault(); $("#adresse-q").blur(); chercherAdresse($("#adresse-q").value); });
  $("#adresse-q").addEventListener("input", (e) => { if (!e.target.value) { $("#adresse-res").hidden = true; } });

  $("#btn-position").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("La localisation n'est pas offerte sur cet appareil");
    toast("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => etat.placer(p.coords.latitude, p.coords.longitude, "Ma position", 14),
      () => toast("Position refusée ou introuvable. Autorisez la localisation pour ce site."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  /* ---------------- Territoires ---------------- */
  async function initCorps() {
    rendreCorps();
    try {
      const postes = await charger("sq_postes.geojson");
      const parReg = {};
      postes.features.forEach((f) => (parReg[f.properties.NOM_REG] ||= new Set()).add(f.properties.NOM_UNIT));
      $("#sq-liste").innerHTML = Object.keys(parReg).sort().map((r) => `
        <details><summary>${esc(r)} <span class="ref">(${parReg[r].size})</span></summary>
        <ul>${[...parReg[r]].sort().map((u) => `<li>${esc(u)}</li>`).join("")}</ul></details>`).join("");
    } catch (e) { $("#sq-liste").innerHTML = `<p class="vide">${esc(e.message)}</p>`; }
  }

  function rendreCorps() {
    const el = $("#corps-liste");
    if (!etat.corps.length) { el.innerHTML = `<p class="vide">Aucun corps de police enregistré pour l'instant.</p>`; return; }
    el.innerHTML = etat.corps.filter((c) => c.type !== "SQ").map((c) => `
      <div class="carte-corps">
        <span class="type ${esc(c.type)}">${esc(c.type)}</span>
        <h4><i class="pastille" style="background:${couleurCorps(c)}"></i>${esc(c.nom)} ${c.sigle ? `<span class="sigle">${esc(c.sigle)}</span>` : ""}</h4>
        ${c.telephone ? `<span class="tel">${esc(c.telephone)}</span>` : ""}
        <span class="munis">${esc((c.municipalites || []).join(", "))}</span>
        ${c.notes ? `<span class="munis">${esc(c.notes)}</span>` : ""}
      </div>`).join("");
  }

  let corpsMinuteur;
  $("#corps-q").addEventListener("input", () => { clearTimeout(corpsMinuteur); corpsMinuteur = setTimeout(chercherTerritoire, 200); });
  async function chercherTerritoire() {
    const q = norm($("#corps-q").value);
    const out = $("#corps-resultat");
    if (q.length < 2) { out.innerHTML = ""; return; }
    let munis;
    try { munis = await charger("municipalites.json"); } catch (e) { out.innerHTML = `<p class="vide">${esc(e.message)}</p>`; return; }
    const trouvees = munis.municipalites.filter((m) => !/^tno aquatique/.test(norm(m[0])) && norm(m[0]).includes(q)).sort((a, b) => (norm(a[0]) === q ? -1 : norm(b[0]) === q ? 1 : norm(a[0]).startsWith(q) ? -1 : 1)).slice(0, 8);
    if (!trouvees.length) { out.innerHTML = `<p class="vide">Aucune municipalité trouvée pour « ${esc($("#corps-q").value)} ».</p>`; return; }
    const blocs = await Promise.all(trouvees.map(async (m) => {
      const [nom, , mrc, lon, lat] = m;
      const res = await identifier(lat, lon);
      let qui, ou, c;
      const corps = corpsPourMunicipalite(nom);
      if (corps) { qui = corps.nom; c = couleurCorps(corps); ou = corps.telephone || ""; }
      else if (res.corps) { qui = res.corps.nom; c = res.corps.couleur; ou = "Corps à préciser dans Admin"; }
      else if (res.sq) { qui = "Sûreté du Québec"; c = "var(--sq)"; ou = `${res.sq.NOM_UNIT} · ${res.sq.NOM_CS}`; }
      else { qui = "Indéterminé"; c = "var(--fg-doux)"; ou = ""; }
      return `<div class="reponse" style="--c:${c}">
        <span class="ou">${esc(nom)}${mrc ? " · " + esc(mrc) : ""}</span>
        <span class="qui">${esc(qui)}</span>
        ${ou ? `<span class="ou">${esc(ou)}</span>` : ""}
        <button class="lien" data-lat="${lat}" data-lon="${lon}" data-nom="${esc(nom)}">Voir sur la carte</button>
      </div>`;
    }));
    out.innerHTML = blocs.join("");
    $$("button[data-lat]", out).forEach((b) => b.addEventListener("click", () => {
      afficherVue("carte");
      setTimeout(() => etat.placer(+b.dataset.lat, +b.dataset.lon, b.dataset.nom, 12), 120);
    }));
  }

  /* ---------------- Administration ---------------- */
  let filtreAdmin = "en_attente";
  $$(".filtres button").forEach((b) => b.addEventListener("click", () => {
    filtreAdmin = b.dataset.filtre;
    $$(".filtres button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    initAdmin();
  }));

  async function compterAttente() {
    const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    const b = $("#badge-attente");
    b.textContent = count || "";
    b.hidden = !count;
    $("#badge-menu").textContent = count || ""; $("#badge-menu").hidden = !count;
    $("#badge-nav-admin").textContent = count || ""; $("#badge-nav-admin").hidden = !count;
    compteurs.demandes = count || 0;
    majPastille();
  }

  let comptesAdmin = [];
  const dateFr = (d) => d ? new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const NOM_STATUT = { en_attente: "En attente", approuve: "Approuvé", refuse: "Refusé", bloque: "Bloqué" };

  async function initAdmin() {
    if (!etat.profil || etat.profil.role !== "admin") return;
    const el = $("#admin-liste");
    const { data, error } = await sb.rpc("admin_comptes");
    if (error) { el.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    comptesAdmin = data || [];
    remplirCorpsAdmin();
    const tousComptes = comptesAdmin;
    const vus = tousComptes.filter((p) => corpsVisible(corpsDe(p)));
    const compte = (st) => vus.filter((p) => p.statut === st).length;
    const enAttenteTous = tousComptes.filter((p) => p.statut === "en_attente").length;
    $("#nb-attente").textContent = compte("en_attente");
    $("#nb-approuve").textContent = compte("approuve");
    $("#nb-refuse").textContent = compte("refuse");
    $("#nb-bloque").textContent = compte("bloque");
    const b = $("#badge-attente"); b.textContent = enAttenteTous || ""; b.hidden = !enAttenteTous;
    compteurs.demandes = enAttenteTous; majPastille();
    $("#badge-menu").textContent = enAttenteTous || ""; $("#badge-menu").hidden = !enAttenteTous;
    $("#badge-nav-admin").textContent = enAttenteTous || ""; $("#badge-nav-admin").hidden = !enAttenteTous;
    $("#adm-onglet-nb").textContent = compte("en_attente") || ""; $("#adm-onglet-nb").hidden = !compte("en_attente");
    // Confirmation du courriel (colonne lue directement : l'administrateur voit tous les profils)
    const { data: verif } = await sb.from("profiles").select("id, courriel_verifie_le");
    const verifies = new Map((verif || []).map((v) => [v.id, v.courriel_verifie_le]));
    comptesAdmin.forEach((p) => (p.courriel_verifie_le = verifies.get(p.id) || null));
    const nonConfirme = (p) => !p.courriel_verifie_le && (p.statut === "approuve" || p.statut === "en_attente");
    $("#nb-non-confirme").textContent = vus.filter(nonConfirme).length;
    // Trié par corps de police, puis du plus récent au plus ancien
    const liste = vus.filter((p) => (filtreAdmin === "non_confirme" ? nonConfirme(p) : p.statut === filtreAdmin))
      .sort((x, y) => corpsDe(x).localeCompare(corpsDe(y), "fr") || String(y.cree_le).localeCompare(String(x.cree_le)));
    const urls = await urlsAvatars(liste.map((p) => p.avatar_path));
    el.innerHTML = liste.length ? liste.map((p, i) => `${i === 0 || corpsDe(liste[i - 1]) !== corpsDe(p) ? `<h4 class="groupe-corps"><span>${esc(corpsDe(p))}</span><b>${liste.filter((x) => corpsDe(x) === corpsDe(p)).length}</b></h4>` : ""}
      <div class="demande">
        <div class="personne">
          ${htmlAvatar(p, urls[i])}
          <div>
            <h4>${esc(p.nom_complet || "(sans nom)")} ${p.role === "admin" ? '<span class="type SQ">admin</span>' : ""}</h4>
            <div class="meta">
              <span>${esc(p.email)}</span>
              ${p.grade ? `<span>${esc(p.grade)}</span>` : ""}
              <span>Matricule <b>${esc(p.matricule || "—")}</b></span>
              <span>${esc(p.corps_police || "—")}${p.unite ? " · " + esc(p.unite) : ""}</span>
              <span>Demande : ${esc(dateFr(p.cree_le))}</span>
              ${nonConfirme(p) ? '<span class="etiquette-alerte">Courriel non confirmé</span>' : ""}
            </div>
          </div>
        </div>
        <div class="boutons">
          ${p.statut === "en_attente" ? `<button class="btn-ok" data-id="${p.id}" data-statut="approuve">Approuver</button>
            <button class="btn-danger" data-id="${p.id}" data-statut="refuse">Refuser</button>` : ""}
          ${filtreAdmin === "non_confirme" ? `<button class="btn-secondaire" data-relance="${esc(p.email)}">Renvoyer le lien</button>` : ""}
          ${nonConfirme(p) ? `<button class="btn-ok" data-confirmer="${p.id}" title="Vous avez vérifié l'adresse vous-même">Confirmer le courriel</button>` : ""}
          <button class="btn-secondaire" data-fiche="${p.id}">Voir le compte</button>
        </div>
      </div>`).join("")
      : `<p class="vide">${filtreAdmin === "en_attente" ? "Aucune demande en attente." : filtreAdmin === "non_confirme" ? "Tout le monde a confirmé son courriel." : "Aucun compte dans cette catégorie."}</p>`;
    $$("button[data-relance]", el).forEach((btn) => btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email: btn.dataset.relance, options: { shouldCreateUser: false, emailRedirectTo: urlRetour() } });
      if (error) { btn.disabled = false; return toast(traduireErreur(error)); }
      btn.textContent = "Lien envoyé";
    }));
    $$("button[data-statut]", el).forEach((btn) => btn.addEventListener("click", () => decider(btn, btn.dataset.id, btn.dataset.statut)));
    $$("button[data-confirmer]", el).forEach((btn) => btn.addEventListener("click", () => confirmerCourrielAdmin(btn, btn.dataset.confirmer)));
    $$("button[data-fiche]", el).forEach((btn) => btn.addEventListener("click", () => ouvrirFiche(btn.dataset.fiche)));
    rendreAdminCorps();
    rendreModelesAdmin();
    rendreAvertAdmin();
    rendreAnnoncesAdmin();
    rendreSignalements();
    if (ongletAdmin === "messagerie") rendreMessagerieAdmin();
  }

  // L'administrateur confirme lui-même le courriel (ex. vérifié de vive voix) : Carte, Lois et Territoires se déverrouillent
  async function confirmerCourrielAdmin(btn, id) {
    if (btn) btn.disabled = true;
    const { error } = await sb.rpc("admin_confirmer_courriel", { p_id: id });
    if (error) { if (btn) btn.disabled = false; toast(traduireErreur(error)); return false; }
    toast("Courriel confirmé par l'administrateur");
    await initAdmin();
    return true;
  }

  async function decider(btn, id, statut) {
    if (btn) btn.disabled = true;
    const { error } = await sb.rpc("decider_demande", { p_id: id, p_statut: statut });
    if (error) { if (btn) btn.disabled = false; toast(traduireErreur(error)); return false; }
    toast({ approuve: "Accès approuvé", refuse: "Accès refusé", en_attente: "Remis en attente" }[statut]);
    await initAdmin();
    return true;
  }

  function motDePasseAleatoire() {
    const car = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const v = new Uint32Array(12);
    crypto.getRandomValues(v);
    return [...v].map((n) => car[n % car.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
  }

  // Bouton à double confirmation : le premier toucher arme, le second exécute
  function confirmer(btn, libelleConfirmation, action) {
    btn.addEventListener("click", async () => {
      if (btn.dataset.arme !== "1") {
        btn.dataset.arme = "1";
        btn.dataset.libelle = btn.textContent;
        btn.textContent = libelleConfirmation;
        btn.classList.add("plein");
        setTimeout(() => { if (btn.isConnected && btn.dataset.arme === "1") { btn.dataset.arme = ""; btn.textContent = btn.dataset.libelle; btn.classList.remove("plein"); } }, 5000);
        return;
      }
      btn.disabled = true;
      try { await action(); } catch (e) { toast(traduireErreur(e)); btn.disabled = false; }
    });
  }

  async function ouvrirFiche(id) {
    const p = comptesAdmin.find((c) => c.id === id);
    if (!p) return;
    const [url] = await urlsAvatars([p.avatar_path]);
    const moi = p.id === etat.profil.id;
    const ligne = (t, v) => `<dt>${t}</dt><dd>${v}</dd>`;
    $("#fc-contenu").innerHTML = `
      <div class="fc-tete">
        ${htmlAvatar(p, url, "grand")}
        <div>
          <h3 id="fc-nom">${esc(p.nom_complet || "(sans nom)")}</h3>
          <p class="ref">${esc(p.email)}</p>
          <span class="pastille-statut ${esc(p.statut)}">${esc(NOM_STATUT[p.statut] || p.statut)}</span>
          ${p.role === "admin" ? '<span class="pastille-statut approuve">Admin</span>' : ""}
        </div>
      </div>
      <dl class="fc-donnees">
        ${ligne("Grade", esc(p.grade || "—"))}
        ${ligne("Matricule", esc(p.matricule || "—"))}
        ${ligne("Corps de police", esc(p.corps_police || "—"))}
        ${ligne("Unité / poste", esc(p.unite || "—"))}
        ${ligne("Demande", esc(dateFr(p.cree_le)))}
        ${ligne("Courriel confirmé", p.courriel_verifie_le ? esc(dateFr(p.courriel_verifie_le)) : (moi ? "Non" : `Non <button class="lien" id="fc-confirmer" type="button">Confirmer moi-même</button>`))}
        ${ligne("Dernière connexion", esc(dateFr(p.derniere_connexion)))}
        ${ligne("Décision", esc(dateFr(p.decide_le)))}
        ${ligne("Compte modifié", esc(dateFr(p.modifie_le)))}
        ${p.doit_changer_mdp ? ligne("Mot de passe", "Temporaire, à changer à la prochaine connexion") : ""}
        ${ligne("Identifiant", `<span class="ref">${esc(p.id)}</span>`)}
      </dl>
      ${moi ? `<div class="fc-section"><p>C'est votre compte. Modifiez-le dans « Mon compte ».</p></div>` : `
      <div class="fc-section">
        <h4>Accès</h4>
        <div class="fc-ligne">
          ${p.statut === "bloque" ? `<button class="btn-ok" id="fc-debloquer">Débloquer</button>` : `
            ${p.statut !== "approuve" ? `<button class="btn-ok" data-fc-statut="approuve">Approuver</button>` : ""}
            ${p.statut === "approuve" ? `<button class="btn-danger" data-fc-statut="refuse">Retirer l'accès</button>` : ""}
            ${p.statut === "en_attente" ? `<button class="btn-danger" data-fc-statut="refuse">Refuser</button>` : ""}
            ${p.statut === "refuse" ? `<button class="btn-secondaire" data-fc-statut="en_attente">Remettre en attente</button>` : ""}`}
        </div>
      </div>
      ${p.statut === "approuve" ? `<div class="fc-section">
        <h4>Message <span class="beta">BÊTA</span></h4>
        <div class="fc-ligne"><button class="btn-secondaire" id="fc-ecrire">Envoyer un message personnel</button></div>
      </div>` : ""}
      <div class="fc-section">
        <h4>Mot de passe temporaire</h4>
        <p>La personne devra choisir son propre mot de passe à sa prochaine connexion. Transmettez-le-lui de vive voix ou par un moyen sûr.</p>
        <div class="fc-ligne">
          <input id="fc-mdp" type="text" autocomplete="off" spellcheck="false" aria-label="Mot de passe temporaire" value="${motDePasseAleatoire()}">
          <button class="btn-secondaire" id="fc-generer" type="button">Générer</button>
          <button class="btn-secondaire" id="fc-copier" type="button">Copier</button>
        </div>
        <div class="fc-ligne"><button class="btn-ok" id="fc-appliquer">Appliquer ce mot de passe</button></div>
      </div>
      <div class="fc-section">
        <h4>Bloquer ou supprimer</h4>
        <p>Bloquer empêche toute connexion et empêche la personne de refaire une demande avec ce courriel. Supprimer efface le compte, la photo et toutes les données de Supabase, définitivement.</p>
        <div class="fc-ligne">
          ${p.statut === "bloque" ? "" : `<button class="btn-danger" id="fc-bloquer">Bloquer</button>`}
          <button class="btn-danger" id="fc-supprimer">Supprimer définitivement</button>
        </div>
      </div>`}`;
    $("#fiche-compte").hidden = false;
    $("#fc-fermer").focus();
    if (moi) return;

    const recharger = async (message) => {
      toast(message);
      await initAdmin();
      if (comptesAdmin.some((c) => c.id === id)) ouvrirFiche(id); else fermerFiche();
    };
    $$("[data-fc-statut]").forEach((btn) => btn.addEventListener("click", async () => {
      if (await decider(btn, id, btn.dataset.fcStatut)) ouvrirFiche(id);
    }));
    if ($("#fc-ecrire")) $("#fc-ecrire").addEventListener("click", () => { fermerFiche(); ecrireA(id); });
    if ($("#fc-confirmer")) $("#fc-confirmer").addEventListener("click", async (e) => { if (await confirmerCourrielAdmin(e.currentTarget, id)) ouvrirFiche(id); });
    $("#fc-generer").addEventListener("click", () => { $("#fc-mdp").value = motDePasseAleatoire(); });
    $("#fc-copier").addEventListener("click", () => copier($("#fc-mdp").value));
    $("#fc-appliquer").addEventListener("click", async (e) => {
      const v = $("#fc-mdp").value.trim();
      if (v.length < 10) return toast("Au moins 10 caractères");
      e.target.disabled = true;
      try { await actionCompte({ action: "mot_de_passe_temporaire", id, mot_de_passe: v }); await copier(v); await recharger("Mot de passe temporaire appliqué et copié"); }
      catch (err) { e.target.disabled = false; toast(traduireErreur(err)); }
    });
    if ($("#fc-debloquer")) $("#fc-debloquer").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { await actionCompte({ action: "debloquer", id }); await recharger("Compte débloqué"); }
      catch (err) { e.target.disabled = false; toast(traduireErreur(err)); }
    });
    if ($("#fc-bloquer")) confirmer($("#fc-bloquer"), "Confirmer le blocage", async () => {
      await actionCompte({ action: "bloquer", id });
      await recharger("Compte bloqué");
    });
    confirmer($("#fc-supprimer"), "Confirmer : supprimer pour toujours", async () => {
      await actionCompte({ action: "supprimer", id });
      fermerFiche();
      toast("Compte supprimé définitivement");
      await initAdmin();
    });
  }
  function fermerFiche() { $("#fiche-compte").hidden = true; }
  $("#fc-fermer").addEventListener("click", fermerFiche);
  $("#fiche-compte").addEventListener("click", (e) => { if (e.target.id === "fiche-compte") fermerFiche(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#fiche-compte").hidden) fermerFiche(); });

  const LIEN_EDITION_CORPS = "https://github.com/asmqc/Police-Management/edit/main/data/corps_police.json";
  function rendreAdminCorps() {
    $("#admin-corps").innerHTML = `
      <div class="liste-sq">${etat.corps.map((c) => `
        <details><summary>${esc(c.nom)} <span class="ref">${(c.municipalites || []).length} municipalité(s)</span></summary>
        <ul>${(c.municipalites || []).map((m) => `<li>${esc(m)}</li>`).join("") || "<li>—</li>"}</ul></details>`).join("")}
      </div>`;
  }
  $("#lien-edition-corps").href = LIEN_EDITION_CORPS;

  demarrer();
})();
