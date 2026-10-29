/* Police Management — application principale */
(() => {
  "use strict";

  const C = window.PE_CONFIG;
  // Ouvert dans l'app iPhone/iPad (WKWebView) : l'app ajoute « PoliceManagementApp » à l'identifiant du navigateur
  const estAppIOS = /PoliceManagementApp/.test(navigator.userAgent);
  // Effet de verre allégé sur les appareils modestes (flou moins coûteux)
  try { if ((navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && !/iPhone|iPad|Mac/.test(navigator.userAgent))) document.documentElement.classList.add("verre-leger"); } catch { /* facultatif */ }
  // App iOS « glass » : les barres (haut et onglets) sont natives, le site cache les siennes
  const pontNatif = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pm;
  if (pontNatif) document.documentElement.classList.add("app-natif");
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
    if (meta) meta.setAttribute("content", sombre ? "#06070D" : "#E4ECF5");
  }
  // Styles d'interface (repris de l'app iOS)
  const STYLES = [
    { id: "moderne", nom: "Liquid Glass", desc: "Verre clair ou sombre", c: ["#06070D", "#E0263B", "#2563EB"] },
    { id: "mdt", nom: "Terminal MDT", desc: "Noir, vert, chasse fixe", c: ["#000000", "#33FF66", "#0A140C"] },
    { id: "officiel", nom: "Terminal officiel", desc: "Noir et or", c: ["#0B0B0B", "#D4AF37", "#171512"] },
    { id: "marine", nom: "Marine", desc: "Bleu marine, accents cyan", c: ["#071A33", "#4FC3F7", "#0E2747"] },
    { id: "epure", nom: "Épuré clair", desc: "Sable et blanc", c: ["#3B2F24", "#B07A3C", "#F4EFE6"] },
    { id: "poste", nom: "Poste de police", desc: "Logiciel de poste rétro", c: ["#0A246A", "#3A6EA5", "#ECE9D8"] },
    { id: "nuit", nom: "Nuit rouge", desc: "Auto-patrouille la nuit", c: ["#000000", "#D23A3A", "#140303"] },
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
  // Intro : étapes qui défilent, puis fondu dès que le premier écran est prêt (au moins 1,2 s pour être lisible)
  const intro = { debut: performance.now(), i: 0, fini: false };
  const ETAPES_INTRO = ["Connexion sécurisée…", "Vérification de votre compte…", "Chargement de votre horaire…", "Lois et carte à jour…", "Bienvenue"];
  intro.minuteur = setInterval(() => {
    if (intro.i < ETAPES_INTRO.length - 2) intro.i++;
    const e = $("#intro-etape"); if (e) e.textContent = ETAPES_INTRO[intro.i];
    const p = $("#intro-progres"); if (p) p.style.width = Math.round(((intro.i + 1) / ETAPES_INTRO.length) * 100) + "%";
  }, 380);
  function terminerIntro() {
    if (intro.fini) return;
    intro.fini = true;
    const reste = Math.max(0, 1200 - (performance.now() - intro.debut));
    setTimeout(() => {
      clearInterval(intro.minuteur);
      $("#intro-etape").textContent = ETAPES_INTRO[ETAPES_INTRO.length - 1];
      $("#intro-progres").style.width = "100%";
      setTimeout(() => { $("#intro").classList.add("intro-sortie"); setTimeout(() => $("#intro").remove(), 500); }, 220);
    }, reste);
  }
  function montrer(ecran) {
    ["#ecran-chargement", "#ecran-site", "#ecran-auth", "#ecran-attente", "#ecran-mdp-temp", "#ecran-app"].forEach((id) => ($(id).hidden = id !== ecran));
    document.body.classList.toggle("mode-site", ecran === "#ecran-site");
    if (ecran !== "#ecran-chargement") terminerIntro();
    if (ecran !== "#ecran-site" && !document.documentElement.hasAttribute("data-style")) {
      const t = document.documentElement.getAttribute("data-theme");
      const sombre = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", sombre ? "#06070D" : "#E4ECF5");
    }
  }
  // Site officiel : affiché aux visiteurs non connectés; « Se connecter » et « Demander l'accès » ouvrent l'écran d'authentification
  function montrerAccueilPublic() {
    const h = (location.hash || "").replace("#", "");
    if (etat.forcerAuth) { montrer("#ecran-auth"); return; }
    if (h === "connexion" || h === "demande") { montrer("#ecran-auth"); ongletAuth(h); return; }
    // App installée sur l'écran d'accueil : directement à la connexion
    if (estAppIOS || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) { montrer("#ecran-auth"); ongletAuth("connexion"); return; }
    montrer("#ecran-site");
    { const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", "#06070D"); }
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

  // Lien d'invitation d'un collègue : ?invitation=code (préremplit le corps et le poste de la demande d'accès)
  {
    const code = new URLSearchParams(location.search).get("invitation");
    if (code && /^[a-z0-9]{10}$/i.test(code)) {
      try { sessionStorage.setItem("pm-invitation", code.toLowerCase()); } catch { /* facultatif */ }
      history.replaceState(null, "", location.pathname + "#demande");
    }
  }
  const codeInvitation = () => { try { return sessionStorage.getItem("pm-invitation"); } catch { return null; } };
  async function appliquerInvitation() {
    const code = codeInvitation();
    if (!code) return;
    const { data } = await sb.rpc("invitation_info", { p_code: code });
    if (!data || !data.corps) { try { sessionStorage.removeItem("pm-invitation"); } catch { /* facultatif */ } return; }
    const c = $("#dm-corps");
    for (let i = 0; i < 25 && ![...c.options].some((o) => o.value === data.corps); i++) await new Promise((r) => setTimeout(r, 200)); // liste des corps encore en chargement
    if ([...c.options].some((o) => o.value === data.corps)) {
      c.value = data.corps; await majChampPoste("dm");
      const p = $("#dm-poste");
      if (data.unite && [...p.options].some((o) => o.value === data.unite)) p.value = data.unite;
      else if (data.unite) { p.value = AUTRE; majChampAutre("dm"); $("#dm-unite").value = data.unite; }
    }
    const t = $("#dm-invitation");
    t.textContent = `Invitation d'un collègue : ${data.corps}${data.unite ? " · " + data.unite : ""}. Vérifiez votre poste, au besoin.`;
    t.hidden = false;
  }
  setTimeout(() => { if (codeInvitation()) appliquerInvitation().catch(() => {}); }, 400);

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
          ...(codeInvitation() ? { invitation: codeInvitation() } : {}),
        },
      },
    });
    btn.disabled = false;
    if (error) return messageAuth(traduireErreur(error), "erreur");
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return messageAuth("Ce courriel a déjà une demande. Utilisez « Connexion ».", "erreur");
    }
    $("#form-demande").reset();
    try { sessionStorage.removeItem("pm-invitation"); } catch { /* facultatif */ }
    $("#dm-invitation").hidden = true;
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
    if (typeof rendreEtatService === "function") rendreEtatService(); // panne : seul l'administrateur garde l'accès
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
    majOngletConstats();
    if (p.role === "admin") { document.body.classList.add("est-admin"); comptesApprouves().then(() => remplirCorpsAdmin()); }
    montrer("#ecran-app");
    if (p.consentement_version !== VERSION_POLITIQUE) $("#consent-voile").hidden = false;
    chargerAvertissement().finally(afficherAvertissement);
    let depart = (location.hash || "").replace("#", "");
    if (depart.startsWith("carte@") || pointPartageEnAttente()) depart = "carte";
    document.body.classList.toggle("est-sq", accesConvention());
    afficherVue(["accueil", "csr", "carte", "corps", "horaire", "messages", "compte", "reglages", "aide", "admin", "forum", "idees", "convention", "feuille", "soutien"].includes(depart) && (depart !== "admin" || p.role === "admin") && (depart !== "convention" || accesConvention()) ? depart : "accueil");
    chargerCorps();
    etat.paie = undefined; chargerPaie().catch(() => {});
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
  const VERSION_POLITIQUE = "2026.10.28";
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
    { id: "2026-10-28-lot", date: "2026-10-28", titre: "Soleil, météo, échéances et plus", points: [
      "Accueil › Soleil et météo : lever et coucher du soleil, crépuscule civil et météo où vous êtes, avec « Copier pour mon rapport ». Votre position exacte ne quitte pas l'appareil.",
      "Mon compte › Mes échéances : requalification au tir, RCR, permis, formations… avec un rappel jusqu'à 2 mois avant. Elles paraissent aussi dans « À ne pas oublier ».",
      "Mon compte › Inviter un collègue : votre lien personnel ouvre sa demande d'accès avec votre corps et votre poste déjà choisis.",
      "Menu › Bien-être et soutien : La Vigile, le PAE, la ligne de prévention du suicide et Info-Social, en un toucher, en tout temps.",
      "App iPhone : ajoutez votre prochain quart à l'écran d'accueil avec le widget Raccourcis (voir Menu › App).",
    ] },
    { id: "2026-10-24-poste", date: "2026-10-24", titre: "Horaire du poste et temps supplémentaire (SQ)", points: [
      "Deux nouveaux onglets dans Horaire : Poste et TS. Votre horaire personnel ne change pas.",
      "Publier un horaire de travail : prenez l'horaire du poste en photo (en liste ou en grille) et l'app le lit sur votre appareil, puis efface la photo. Vérifiez, ajoutez les heures et publiez : les membres de votre poste sont avisés.",
      "Le TS de l'horaire est offert au poste : inscrivez-vous avec votre matricule. Le mercredi, un membre du poste approuve; les inscrits sont proposés en ordre d'ancienneté.",
      "Si vous obtenez le TS, vous recevez un avis et le quart s'ajoute à votre horaire, avant ou après votre quart s'il y est collé.",
      "TS du poste : tout le temps supplémentaire du poste, mois par mois, avec les matricules retenus. Il reste même quand l'horaire du poste est supprimé, chaque mardi.",
    ] },
    { id: "2026-10-23-constats", date: "2026-10-23", titre: "Registre des constats (app iPhone et iPad)", points: [
      "Nouvel onglet Lois › Constats d'infraction : inscrivez le numéro du constat, le type (100400 ou 100391), la date, l'article du CSR, l'emplacement exact (et votre position GPS) et votre narration.",
      "Retrouvez un constat par son numéro, un article ou un lieu, puis copiez votre narration en un toucher.",
      "Prenez le constat en photo : l'app lit le numéro, le type, la date et l'heure, l'article et le lieu, sur l'appareil. La photo n'est pas conservée, et le nom, l'adresse, la date de naissance, le permis et la plaque sont ignorés.",
      "Tout reste sur votre appareil : fichier chiffré, exclu d'iCloud et protégé par Face ID. Rien n'est envoyé au serveur. Pas offert sur le site web pour l'instant.",
    ] },
    { id: "2026-10-23-ia", date: "2026-10-23", titre: "IA Police Management (SQ)", points: [
      "Posez votre question sur le contrat de travail comme vous la diriez à un collègue (« je me marie, j'ai combien de jours ? », « on m'appelle chez nous pour rentrer »).",
      "L'IA trouve les passages exacts qui répondent et les cite mot pour mot, avec le numéro de clause et la page du PDF. Elle n'écrit jamais ses propres phrases : rien n'est inventé.",
      "Questions de suivi : « et pour un décès ? » garde le sujet de la question précédente. « Écouter la réponse » lit les passages à voix haute.",
    ] },
    { id: "2026-10-23-visite", date: "2026-10-23", titre: "Visite guidée", points: [
      "Une courte visite explique l'app aux nouveaux membres, puis chaque nouvelle section la première fois que vous l'ouvrez.",
      "Revoyez n'importe quelle visite, ou désactivez les explications automatiques, dans Réglages › Visite guidée.",
      "Convention : la recherche comprend mieux les questions de tous les jours (« je me marie », « on m'appelle chez nous », « mon TS en banque »), et Claude reçoit la consigne de répondre seulement à partir du contrat, en citant chaque clause.",
    ] },
    { id: "2026-10-22-c", date: "2026-10-22", titre: "Horaire", points: [
      "Le « + » propose : modifier le quart, planifier le congé des Fêtes ou ajouter un événement.",
      "Nouvel onglet Rémunération dans l'horaire (Statistiques pour les autres corps) : paie, banques, heures du mois et de l'année. La fiche d'une journée a deux onglets : Quart et Temps supp.",
      "Ajoutez du temps supplémentaire avant ET après votre quart (ex. arrivé 2 h plus tôt et resté après un soir), chacun payé ou compensé.",
      "Nouveaux codes : B · Banque de temps, E · Événement familial, P · Congé parental, D · Congé D repris, A · Accident de travail, Y · Libération syndicale, U · Sans traitement, chacun avec son motif selon le contrat.",
      "Congés de plusieurs jours inscrits d'un coup : mariage (7 jours), décès, déménagement, maternité, paternité, adoption.",
      "Plus de 20 modèles de rotation (Pitman, DuPont, 4-3/3-4, Southern swing, 6-2, 5-4/9…) et, pour la SQ, l'horaire hybride H1 avec le choix de l'équipe, plus des gabarits H2, H3, annexe I, 13-15-28, 16-19-35, Alma et 4-3.",
      "Heures facultatives pour une demi-journée de V, H ou B.",
      "Alertes de repos : travail continu de 17 h, plus de 14 h dans la journée, moins de 8 h avant le quart suivant (12.16).",
      "Calendrier abonné : votre horaire dans le Calendrier de l'iPhone, Google Agenda ou Outlook, avec le temps supplémentaire et les dates limites du contrat.",
    ] },
    { date: "2026-10-22", titre: "Paie et temps supplémentaire (Sûreté du Québec)", points: [
      "Paie aux deux semaines dans Horaire › Rémunération › Paie : brut et net, primes de nuit, de soir et de fin de semaine (selon le quart remplacé pour un V ou une maladie), impôts et cotisations 2026, retenues de votre talon.",
      "Temps supplémentaire calculé selon l'art. 12 : taux et demi ou double, arrondi (12.09), heure de repas et indemnité de 6 $ (12.08), repas non pris (12.06), minimums de rappel (12.03, 12.04, annexe I).",
      "Disponibilité de service (art. 13), remplacement temporaire d'un grade supérieur (17.04), allocations régionales (art. 18), allocation vestimentaire (19.01), repas de nuit (21.07).",
      "Absences sans traitement déduites de la paie; congés payés par le RQAP ou la CNESST signalés.",
    ] },
    { date: "2026-10-22", titre: "Banques et dates limites (Sûreté du Québec)", points: [
      "Mes banques en jours et heures, comme SITHAR : vacances, fériés, maladie (avec avis de certificat médical), banques de temps de 189 h et 1 040 h, congés D et autres congés de l'année.",
      "Vos soldes, votre rémunération, vos retenues et vos allocations se modifient dans Mon compte.",
      "À l'accueil, « À ne pas oublier » : choix des vacances, demande des Fêtes avant le 31 octobre, fériés et vacances à prendre, changement d'heure.",
      "Échelle salariale de l'annexe T dans Convention.",
    ] },
    { date: "2026-10-22", titre: "Outils et lois", points: [
      "Convention : calculateur de frais (repas, kilométrage, coucher, annexe K) et délai de grief (art. 31).",
      "Lois : Code criminel, Loi sur le cannabis et Loi réglementant certaines drogues, avec raccourcis.",
      "Accueil : recherche d'un article, d'une municipalité ou d'une section, et entraves Québec 511 du territoire de votre unité, actualisées automatiquement.",
    ] },
    { date: "2026-10-22", titre: "App et service", points: [
      "Bandeau d'état du service : avis d'une panne prévue, et écran d'attente pendant une panne ou une mise à jour des serveurs.",
      "Mode nuit rouge dans le menu du compte, pour la nuit en auto-patrouille.",
      "Les pages ne glissent plus de côté sur iPhone.",
      "App iPhone : « Dis Siri, mon prochain quart dans Police Management ».",
    ] },
  ];
  function ouvrirNouveautes() {
    $("#nouv-liste").innerHTML = NOUVEAUTES.map((n) => `<article><small>${esc(new Date(n.date + "T12:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }))}</small>
      <b>${esc(n.titre)}</b><ul>${n.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></article>`).join("");
    $("#nouv-voile").hidden = false;
    try { localStorage.setItem("pm-nouv-vu", NOUVEAUTES[0].id || NOUVEAUTES[0].date); } catch { /* facultatif */ }
  }
  function montrerNouveautesUneFois() {
    let vu = null; try { vu = localStorage.getItem("pm-nouv-vu"); } catch { return; }
    if (vu !== (NOUVEAUTES[0].id || NOUVEAUTES[0].date) && $("#consent-voile").hidden && $("#avert-voile").hidden) ouvrirNouveautes();
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
    const ia = m.ia || repondreIA(m.question, m.extraits || [], null);
    const u = new SpeechSynthesisUtterance(m.claude ? m.claude.replace(/\*\*/g, "").replace(/^\s*[-•*]\s+/gm, "") : ia.ok ? texteReponseIA(ia) : texteALire(m.extraits || []));
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
    const tete = `Je suis membre de la Sûreté du Québec. Réponds à ma question UNIQUEMENT à partir des extraits ci-dessous du Contrat de travail entre le gouvernement du Québec et l'APPQ (2022-2028). Texte officiel (PDF) : ${PDF_CONVENTION}

Règles strictes :
1. N'utilise aucune autre source ni connaissance générale. N'invente aucun chiffre, montant, délai, pourcentage ni numéro de clause.
2. Chaque affirmation cite sa clause entre crochets, par exemple [25.01].
3. Si les extraits ne permettent pas de répondre (ou sont coupés « … »), écris « Le contrat ne le précise pas dans ces extraits » et indique la clause à vérifier ou de s'adresser à l'APPQ ou à son gestionnaire. Ne devine pas.
4. Si ma question est ambiguë, pose-moi une seule question de précision avant de répondre.
5. Format : la réponse directe en une ou deux phrases, puis les détails et conditions, puis « Clauses : » avec la liste.
6. Termine par : « Ce n'est pas un avis juridique. »

Question : ${question}

`;
    const liste = extraits.length ? `Clauses trouvées : ${extraits.map(nomClause).join(" ; ")}\n\n` : "";
    let corps = "Extraits du contrat :\n";
    for (const e of extraits) {
      const brut = (e.texte || "").replace(/\s+/g, " ").trim();
      const bloc = `\n[${nomClause(e)}] ${court ? brut.slice(0, 600) + (brut.length > 600 ? "…" : "") : brut}\n`;
      if (court && encodeURIComponent(tete + liste + corps + bloc).length > 6500) break;
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
  const ICONE_IA = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg>`;
  const ICONE_HP = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICONE_STOP = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`;

  /* ---------------- IA Police Management : réponses extraites mot pour mot du contrat ----------------
     Comprend la question (sujets, synonymes, type de question), découpe les clauses trouvées en phrases et alinéas,
     et cite les passages qui répondent. Aucune phrase n'est générée : rien ne peut être inventé. */
  const IA_SYNONYMES = [
    [/(mari|noce|epous|union civile)/, "mariage union civile"],
    [/(deces|funerail|enterrement|\bmort|decede)/, "deces funerailles"],
    [/(blonde|chum|femme|conjoint|epoux|mari\b)/, "conjoint"],
    [/(pere|mere|parent)\b/, "pere mere"],
    [/(enfant|fils|fille|bebe)/, "enfant fils fille"],
    [/(accouch|naissance|bebe|enceinte|grossesse)/, "naissance accouchement maternite paternite"],
    [/(paternit)/, "paternite naissance enfant"],
    [/(maternit)/, "maternite grossesse accouchement"],
    [/(adopt)/, "adoption enfant"],
    [/\bts\b|temps supp|heures? supp|overtime/, "temps supplementaire"],
    [/(rappel|appel(le|e)? (a|chez)|rentrer|rappele)/, "rappel revenir travail requis"],
    [/(banque|compens|en temps)/, "banque temps accumuler"],
    [/(payer|paye|paie|argent|cash|monnayer)/, "paye taux traitement"],
    [/(vacance)/, "vacances annuelles"],
    [/(ferie)/, "conges feries"],
    [/(fetes|noel|jour de l an)/, "periode fetes"],
    [/(malad|malade|certificat|billet|medecin)/, "maladie certificat medical absence"],
    [/(prime)/, "prime"],
    [/\bnuit/, "nuit prime"], [/\bsoir/, "soir prime"], [/(fin de semaine|weekend|samedi|dimanche)/, "fin semaine samedi dimanche"],
    [/(salaire|echelle|echelon|augmentation|gagne)/, "traitement echelle salariale"],
    [/(repas|manger|diner|souper|dejeuner)/, "repas frais"],
    [/(kilometr|\bkm\b|millage|char|voiture perso)/, "kilometre vehicule personnel"],
    [/(hotel|coucher|dormir)/, "coucher hebergement"],
    [/(demenag)/, "demenagement"],
    [/(disponib|pagette|garde)/, "disponibilite service"],
    [/(grief|contester|plainte)/, "grief"],
    [/(suspen|disciplin|reprimande|sanction)/, "discipline mesure suspension"],
    [/(uniforme|linge|vetement|botte)/, "tenue vestimentaire uniforme"],
    [/(sans solde|sans traitement|sans paye)/, "sans traitement"],
    [/(cour|temoign|subpoena)/, "cour temoigner assignation"],
    [/(horaire|rotation|releve|quart|cycle)/, "releve horaire travail"],
    [/(remplac|interim|acting)/, "remplacement temporaire"],
    [/(delai|combien de temps pour|date limite|avant quand)/, "delai jours suivant"],
    [/(retraite)/, "retraite"],
    [/(accident|blesse|cnesst|lesion)/, "accident travail lesion"],
    [/(formation|cours\b)/, "formation"],
    [/(promotion|grade)/, "promotion"],
  ];
  const IA_VIDES = new Set("les des une un le la de du au aux et ou en a à pour par sur dans avec est sont que qui quoi quel quelle quels quelles comment combien quand est-ce ce cet cette ces se sa son ses mon ma mes ton ta tes notre votre vos leur leurs je tu il elle on nous vous ils elles me te lui y si ne pas plus moins tres peu fait faire peut peux doit dois veux avoir etre suis es ai as avez ont droit membre jour jours heure heures ca cela ceci alors donc mais aussi tout tous toute toutes chez quoi oui non bien la-bas".split(" "));
  const normIA = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");
  function racine(m) {
    m = m.replace(/(ements|ement|ations|ation|ements|ments|ment|euses|euse|eux|ives|ive|ites|ite|aux|ees|ee|es|er|ez|ent|e|s|x)$/, "");
    return m.slice(0, 6);
  }
  function motsIA(t) { return (normIA(t).match(/[a-z0-9]+/g) || []).filter((m) => (m.length > 2 || /^\d+$/.test(m)) && !IA_VIDES.has(m)).map(racine); }
  const IA_NOMBRE = /\(\s*\d[\d\s,½]*\)|\b\d+(?:[,.]\d+)?\s*(?:%|\$|h\b|heures?|jours?|semaines?|mois|ans?|minutes?)|\b(?:une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente)\s+\(?\d*\)?\s*(?:heures?|jours?|semaines?|mois|ans?)/i;
  // Découpe une clause en passages (phrases et alinéas a), b)…), en gardant la phrase d'introduction des listes
  function decouperClause(e) {
    const brut = (e.texte || "").replace(/^\s*\d+\.\d+\s*/, "").replace(/\r/g, "");
    const lignes = brut.split("\n");
    let txt = "";
    for (const l of lignes) {
      const ls = l.trim();
      if (!ls) continue;
      txt += (/^(?:[a-z]|[ivx]+|\d{1,2})\)\s/.test(ls) ? "\n" : txt && !txt.endsWith("\n") ? " " : "") + ls;
    }
    const blocs = txt.split("\n");
    const passages = [];
    let intro = "";
    for (const b of blocs) {
      const m = b.match(/^((?:[a-z]|[ivx]+|\d{1,2})\))\s+(.*)$/);
      if (m) {
        // l'alinéa peut se terminer par une phrase qui n'en fait plus partie (ex. « Aux fins du présent article… »)
        const parts = m[2].split(/(?<=[;.])\s+(?=[A-ZÀ-Ý«])/);
        passages.push({ marque: m[1], intro, texte: parts[0] });
        for (const p of parts.slice(1)) passages.push({ marque: m[1], intro: "", texte: p, suite: true });
        continue;
      }
      const phrases = b.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý«])/);
      for (const p of phrases) {
        passages.push({ marque: "", intro: "", texte: p });
        if (/:\s*$/.test(p)) intro = p;
      }
    }
    return passages.filter((p) => p.texte && p.texte.length > 12).map((p) => ({ ...p, clause: e }));
  }
  const mots_synonymes = (qn) => IA_SYNONYMES.filter(([re]) => re.test(qn)).map(([, m]) => m).join(" ");
  function repondreIA(question, extraits, precedente) {
    const qn = normIA(question);
    let mq = motsIA(question);
    // Les mots familiers traduits par un synonyme (« rentrer » → rappel) ne comptent plus dans ce qui doit être trouvé
    const remplaces = new Set();
    for (const [re, mots] of IA_SYNONYMES) if (re.test(qn)) {
      mq = mq.concat(motsIA(mots));
      for (const w of qn.match(/[a-z0-9]+/g) || []) if (w.length > 2 && re.test(w)) remplaces.add(racine(w));
    }
    for (const m of motsIA(mots_synonymes(qn))) remplaces.delete(m);
    // Question de suivi courte (« et pour un décès ? ») : on garde le contexte de la question précédente, avec moins de poids
    const suivi = precedente && (motsIA(question).length <= 2 || /^\s*(et|pis|puis|pour)\b/.test(qn));
    const mqPrec = suivi ? motsIA(precedente) : [];
    const cles = new Set(mq);
    if (!cles.size && !mqPrec.length) return { ok: false, citations: [] };
    const passages = [];
    extraits.forEach((e, rang) => decouperClause(e).forEach((p) => passages.push({ ...p, rang })));
    if (!passages.length) return { ok: false, citations: [] };
    // Poids des mots : rares dans les passages = plus importants
    const df = new Map();
    // Le titre de l'article (ex. « Vacances annuelles ») compte aussi pour chacun de ses passages
    const motsP = passages.map((p) => new Set(motsIA(p.intro + " " + p.texte + " " + (p.clause.titre || "").replace(/^(Article|Annexe)\s+\S+\s+—\s*/, ""))));
    const nombresQ = (qn.match(/\b\d+\b/g) || []);
    motsP.forEach((s) => s.forEach((m) => df.set(m, (df.get(m) || 0) + 1)));
    const idf = (m) => Math.log(1 + passages.length / (1 + (df.get(m) || 0)));
    const veutNombre = /(combien|nombre|duree|long|taux|montant|pourcentage|maximum|minimum|\bmax\b|\bmin\b)/.test(qn);
    const veutDelai = /(quand|delai|avant|date|limite|jusqu)/.test(qn);
    const veutDroit = /(peux|peut|droit|permis|est-ce que|ai-je|oblig|dois)/.test(qn);
    // Un mot absent de tous les passages compte à moitié : il peut s'agir d'une formulation différente
    const totalQ = [...cles].filter((m) => !remplaces.has(m)).reduce((s, m) => s + idf(m) * (df.get(m) ? 1 : 0.5), 0) || 1;
    let meilleur = 0;
    for (let i = 0; i < passages.length; i++) {
      const p = passages[i], s = motsP[i];
      let pts = 0, trouves = [];
      for (const m of cles) if (s.has(m)) { pts += idf(m); trouves.push(m); }
      for (const m of mqPrec) if (s.has(m) && !cles.has(m)) pts += idf(m) * 0.35;
      const couverture = pts / totalQ;
      let score = couverture;
      if (veutNombre && IA_NOMBRE.test(p.texte)) score *= 1.35;
      if (nombresQ.some((n) => new RegExp("\\(" + n + "\\)|\\b" + n + "\\b").test(p.texte))) score *= 1.5; // même nombre que dans la question (ex. 6 ans)
      if (veutDelai && /(au plus tard|jours? suivant|avant le|dans les|delai|délai)/i.test(p.texte)) score *= 1.3;
      if (veutDroit && /(a droit|peut |est autoris|doit )/i.test(p.texte)) score *= 1.15;
      score *= 1 + 0.25 * (1 - p.rang / Math.max(1, extraits.length)); // clauses mieux classées par la recherche
      score /= Math.pow(Math.max(1, p.texte.length / 260), 0.35); // les passages courts et précis d'abord
      p.score = score; p.couverture = couverture; p.trouves = trouves;
      if (score > meilleur) meilleur = score;
    }
    const tries = passages.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
    const choisis = [];
    for (const p of tries) {
      if (choisis.length >= 3 || p.score < meilleur * 0.55) break;
      if (choisis.some((c) => c.clause === p.clause && c.marque === p.marque && !p.marque === !c.marque && c.texte === p.texte)) continue;
      choisis.push(p);
    }
    const ok = !!choisis.length && choisis[0].couverture >= 0.34;
    const surligner = new Set(choisis.flatMap((c) => c.trouves));
    return {
      ok,
      citations: (ok ? choisis : []).map((c) => ({
        article: c.clause.article, page: c.clause.page, marque: c.marque, intro: c.marque && c.intro ? c.intro : "",
        texte: c.texte, mots: [...surligner],
      })),
    };
  }
  // Met en évidence les mots de la question dans une citation (le texte est d'abord échappé)
  function surlignerIA(t, mots) {
    const set = new Set(mots);
    return esc(t).replace(/[A-Za-zÀ-ÿ0-9]+/g, (w) => ((w.length > 2 || /^\d+$/.test(w)) && set.has(racine(normIA(w))) ? `<mark>${w}</mark>` : w));
  }
  const nomCitation = (c) => (/^Annexe/.test(c.article || "") ? c.article : "clause " + (c.article || "?")) + (c.marque ? " " + c.marque : "") + (c.page ? `, p. ${c.page}` : "");
  const texteReponseIA = (r) => r.ok ? "Selon le contrat. " + r.citations.map((c) => `${nomCitation(c).replace(/, p\. \d+/, "")} : ${c.intro ? c.intro + " " : ""}${c.texte}`).join(" ") : "";

  function rendreConvention() {
    const el = $("#cv-fil");
    el.innerHTML = cv.fil.map((m, k) => {
      if (m.role === "user") return `<div class="bulle moi cv-q"><span class="bulle-txt">${esc(m.question)}</span></div>`;
      if (m.erreur) return `<article class="panneau cv-r cv-erreur"><p>${esc(m.erreur)}</p></article>`;
      const ex = m.extraits || [];
      const ia = m.ia || (ex.length ? repondreIA(m.question, ex, null) : { ok: false, citations: [] });
      const blocIA = `<section class="cv-ia${ia.ok ? "" : " cv-ia-vide"}">
          <p class="cv-ia-tete">${ICONE_IA}<b>IA Police Management</b></p>
          ${ia.ok ? `<p class="cv-ia-intro">Voici ce que dit le contrat :</p>` + ia.citations.map((c) => `<blockquote class="cv-citation">
              ${c.intro ? `<p class="cv-cit-intro">${esc(c.intro)}</p>` : ""}<p>${surlignerIA(c.texte, c.mots)}</p>
              <cite><span class="cv-num">${esc(nomCitation(c))}</span> <a href="${PDF_CONVENTION}#page=${(c.page || 0) + 8}" target="_blank" rel="noopener">PDF ↗</a></cite></blockquote>`).join("")
            : `<p>Je n'ai pas trouvé de passage du contrat qui répond clairement à cette question. ${ex.length ? "Voici les clauses les plus proches : précisez votre question ou consultez-les ci-dessous." : ""} Je ne réponds jamais au-delà du texte du contrat.</p>`}
          <p class="aide">Citations exactes du contrat, sans reformulation. Lisez la clause complète pour les exceptions.</p>
        </section>`;
      return `<article class="panneau cv-r">
        ${ex.length ? `${blocIA}<div class="cv-claude"><button type="button" class="btn-principal cv-btn-voix" data-cv-lire="${k}"></button>
          <a class="btn-secondaire cv-btn-claude" href="${esc(lienClaude(promptClaude(m.question, ex, true)))}" target="_blank" rel="noopener">${ICONE_CLAUDE}Expliquer avec Claude</a>
          <button type="button" class="btn-secondaire" data-cv-copier="${k}">Copier pour Claude</button></div>
        <p class="aide">Besoin d'une explication en vos mots ? Claude s'ouvre avec votre question et les clauses, avec la consigne de répondre seulement à partir du contrat (votre compte Claude gratuit suffit).</p>
        <details class="cv-clauses"><summary>Voir les ${ex.length} clause${ex.length > 1 ? "s" : ""} trouvée${ex.length > 1 ? "s" : ""}</summary>
        ${m.claude ? `<section class="cv-reponse-claude"><p class="cv-claude-tete">${ICONE_CLAUDE}<b>Réponse de Claude</b></p>${mdSimple(m.claude)}<p class="aide">Générée par IA à partir des clauses du contrat : vérifiez toujours la clause citée.</p></section>` : ""}
        ${m.claudeErreur ? `<p class="cv-claude-err">${esc(m.claudeErreur)}${m.claudeLien ? ` <a href="${esc(lienClaude(promptClaude(m.question, ex, true)))}" target="_blank" rel="noopener">Ouvrir dans Claude ↗</a>` : ""}</p>` : ""}
        ${ex.map((e) => `<details class="cv-ex"><summary><span class="cv-num">${esc(nomClause(e))}</span><small>${esc(e.titre || "")}</small></summary><p>${esc(e.texte)}</p><a href="${PDF_CONVENTION}#page=${(e.page || 0) + 8}" target="_blank" rel="noopener">Ouvrir le PDF à cette page ↗</a></details>`).join("")}</details>`
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
    rendreEchelle();
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
    // Question de suivi courte : la recherche garde le sujet de la question précédente
    const prec = [...cv.fil].reverse().find((x) => x.role === "resultat" && !x.erreur);
    const suivi = prec && (motsIA(question).length <= 2 || /^\s*(et|pis|puis|pour)\b/.test(normIA(question)));
    const { data, error } = await sb.rpc("convention_recherche", { p_q: suivi ? prec.question + " " + question : question, p_n: 10 });
    cv.enCours = false; $("#cv-envoyer").disabled = false;
    const extraits = data || [];
    cv.fil.push(error ? { role: "resultat", question, erreur: traduireErreur(error) } : { role: "resultat", question, extraits, ia: repondreIA(question, extraits, suivi ? prec.question : null) });
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
    visiteDeVue(nom);
    if (nom === "reglages") { rendreVisitesReglages(); majBlocsNotif(); majChoixTheme(); rendreStyles(); majReglagePartage(); majReglagesHoraire(); majConsentementReglages(); }
    if (nom === "messages") { initMessages(); majBlocsNotif(); }
    if (nom === "forum") initForum();
    if (nom === "idees") initIdees();
    if (nom === "convention") initConvention();
    if (nom === "feuille") initFeuille();
    informerNatif();
  }
  // Phrase lue par Siri dans l'app iOS (« Prochain quart ») : calculée ici, gardée par l'app
  function phraseProchainQuart() {
    try {
      if (!hr.config || !hr.chargé) return null;
      const n0 = jourUTC(aujourdhuiISO());
      for (let i = 0; i < 45; i++) {
        const iso = isoDe(n0 + i), q = quartDu(iso, hr);
        if (!q.code || !["J", "S", "N", "X", "F", "T"].includes(q.code)) continue;
        const h = heuresJour(q.code, iso, hr);
        const quand = i === 0 ? "aujourd'hui" : i === 1 ? "demain" : new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
        const heures = h ? `, de ${h[0].replace(":", " h ").replace(" h 00", " h")} à ${h[1].replace(":", " h ").replace(" h 00", " h")}` : "";
        return `Votre prochain quart : ${QUARTS[q.code] ? QUARTS[q.code].nom.toLowerCase() : q.code}, ${quand}${heures}.`;
      }
      return "Aucun quart prévu dans les 45 prochains jours.";
    } catch { return null; }
  }
  // Pont avec l'app iOS : le site informe l'app (onglet, badges, fenêtres ouvertes) et l'app pilote la navigation
  let natifPrevu = false;
  function informerNatif() {
    if (!pontNatif || natifPrevu) return;
    natifPrevu = true;
    requestAnimationFrame(() => {
      natifPrevu = false;
      const nb = (id) => { const b = document.getElementById(id); return b && !b.hidden ? parseInt(b.textContent, 10) || 1 : 0; };
      try {
        pontNatif.postMessage({
          vue: etat.vue || "accueil",
          connecte: !$("#ecran-app").hidden,
          modal: !!document.querySelector(".voile:not([hidden]), .avert:not([hidden])"),
          plein: document.body.classList.contains("carte-plein"),
          admin: !!(etat.profil && etat.profil.role === "admin"),
          messages: nb("badge-messages"),
          attente: nb("badge-nav-admin"),
          prochain: phraseProchainQuart(),
        });
      } catch { /* l'app n'écoute pas */ }
    });
  }
  if (pontNatif) {
    new MutationObserver(informerNatif).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class"] });
    window.pmNatif = {
      aller: (v) => { if (!$("#ecran-app").hidden) { fermerMenu(); afficherVue(v); } },
      menu: () => { if (!$("#ecran-app").hidden) ouvrirMenu(); },
      actualiser: () => location.reload(),
    };
    informerNatif();
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
  // Mode nuit rouge : bascule rapide depuis le menu (revient ensuite au style précédent)
  function majBoutonNuit() { const b = $("#menu-nuit"); if (b) $("span", b).textContent = styleChoisi === "nuit" ? "Quitter le mode nuit rouge" : "Mode nuit rouge"; }
  $("#menu-nuit").addEventListener("click", () => {
    let avant = "moderne";
    try { avant = localStorage.getItem("pm-style-avant-nuit") || "moderne"; } catch { /* facultatif */ }
    if (styleChoisi === "nuit") styleChoisi = avant === "nuit" ? "moderne" : avant;
    else { try { localStorage.setItem("pm-style-avant-nuit", styleChoisi); } catch { /* facultatif */ } styleChoisi = "nuit"; }
    try { localStorage.setItem("pm-style", styleChoisi); } catch { /* facultatif */ }
    appliquerStyle(styleChoisi); majBoutonNuit(); fermerMenu();
    toast(styleChoisi === "nuit" ? "Mode nuit rouge activé" : "Mode nuit rouge désactivé");
  });
  majBoutonNuit();
  { const v = (document.querySelector('script[src^="app.js"]') || {}).src || ""; const m = v.match(/v=(\d{8})(\d{4})/); if (m) $("#rg-version").textContent = `Version du ${m[1].slice(6, 8)}/${m[1].slice(4, 6)}/${m[1].slice(0, 4)}`; }
  $$(".nav button").forEach((b) => b.addEventListener("click", () => afficherVue(b.dataset.vue)));

  /* ---------------- Horaire rotatif ---------------- */
  const QUARTS = {
    J: { nom: "Jour" }, S: { nom: "Soir" }, N: { nom: "Nuit" }, C: { nom: "Congé" },
    V: { nom: "Vacances" }, M: { nom: "Maladie" }, F: { nom: "Formation" }, T: { nom: "Cour" }, X: { nom: "Temps supp." },
    O: { nom: "Obligation familiale" }, H: { nom: "Férié" }, L: { nom: "Maladie longue durée" }, B: { nom: "Banque de temps" },
    E: { nom: "Événement familial" }, P: { nom: "Congé parental" }, D: { nom: "Congé D repris" }, A: { nom: "Accident de travail" },
    Y: { nom: "Libération syndicale" }, U: { nom: "Sans traitement" },
  };
  // Motifs des congés selon le contrat de travail APPQ (art. 25, 26, 27, 33, 36) : [clé, libellé, jours, payé]
  const MOTIFS = {
    E: [
      ["mariage", "Mon mariage ou union civile", "7 jours consécutifs, payés (25.01 a)"],
      ["mariage-famille", "Mariage de mon père, ma mère, mon enfant, mon frère ou ma sœur", "Le jour du mariage, payé, si j'y assiste (25.01 b)"],
      ["deces-conjoint", "Décès de mon conjoint ou de mon enfant", "7 jours consécutifs, payés (25.01 c)"],
      ["deces-parent", "Décès de mon père, ma mère, mon frère ou ma sœur", "3 jours payés, plus 2 jours sans traitement au besoin (25.01 d)"],
      ["deces-beaux", "Décès de mon beau-père ou de ma belle-mère", "3 jours consécutifs, payés (25.01 e)"],
      ["deces-domicile", "Décès d'un beau-frère, belle-sœur, gendre, bru ou grand-parent qui habitait chez moi", "3 jours consécutifs, payés (25.01 f)"],
      ["deces-autre", "Décès d'un beau-frère, belle-sœur, gendre, bru ou grand-parent", "Le jour des funérailles ou du décès, payé (25.01 g)"],
      ["deces-enfant-conjoint", "Décès de l'enfant de mon conjoint", "5 jours, dont 2 payés (25.03)"],
      ["distance", "Jour additionnel : événement à plus de 240 km", "1 jour payé (25.04)"],
      ["demenagement", "Mon déménagement", "2 jours payés, au plus 2 jours par année civile (25.05)"],
      ["serieux", "Présence requise auprès de ma famille immédiate (raisons sérieuses)", "Payé, sur demande écrite motivée (25.07)"],
    ],
    P: [
      ["naissance", "Naissance de mon enfant", "5 jours ouvrables payés, entre l'accouchement et le 15ᵉ jour après le retour à la maison (33.32)"],
      ["maternite", "Congé de maternité", "21 semaines; indemnité de 93 % du traitement moins le RQAP (33.09, 33.19)"],
      ["paternite", "Congé de paternité", "5 semaines; traitement complété au-delà du RQAP (33.33, 33.34)"],
      ["adoption-jours", "Adoption : congé de 5 jours", "5 jours ouvrables payés (33.37)"],
      ["adoption", "Congé pour adoption", "5 semaines (33.38)"],
      ["adoption-prep", "En vue d'une adoption", "Jusqu'à 10 semaines sans traitement (33.43)"],
      ["parental", "Congé parental sans traitement", "Jusqu'à 104 semaines après la maternité, la paternité ou l'adoption (33.44)"],
      ["grossesse", "Congé spécial : complication de grossesse", "Durée prescrite par certificat médical (33.30)"],
      ["retrait", "Retrait préventif (grossesse ou allaitement)", "Affectation ou congé spécial (33.29)"],
      ["enfant-malade", "Enfant mineur malade ou handicapé ayant besoin de moi", "Jusqu'à 1 an sans traitement (33.47)"],
    ],
    U: [
      ["general", "Congé sans traitement", "Jusqu'à 12 mois, sur demande écrite (26.01)"],
      ["dix-ans", "Congé sans traitement : 10 ans de service", "Jusqu'à 12 mois, demande 30 jours avant, une fois par 10 ans (26.02)"],
      ["evenement", "Événement familial sans traitement", "Décès d'un petit-enfant, mariage de l'enfant du conjoint, jours additionnels (25.01 d, 25.02, 25.03)"],
      ["obligation", "Obligation familiale non payée", "Au-delà des 2 premières journées payées (25.08)"],
      ["differe", "Congé à traitement différé", "Selon l'entente (art. 27)"],
      ["ecole", "Libération : École nationale de police", "Sans traitement (art. 36)"],
    ],
  };
  const NON_PAYES_P = ["adoption-prep", "parental", "enfant-malade"];
  // Congés de plusieurs jours consécutifs (les jours de congé hebdomadaire sont inclus, 25.06) : [jours, jours payés]
  const DUREES_MOTIF = {
    "E:mariage": [7, 7], "E:deces-conjoint": [7, 7], "E:deces-parent": [3, 3], "E:deces-beaux": [3, 3], "E:deces-domicile": [3, 3],
    "E:deces-enfant-conjoint": [5, 2], "E:demenagement": [2, 2], "P:maternite": [147, 147], "P:paternite": [35, 35], "P:adoption": [35, 35],
  };
  const RQAP_P = ["maternite", "paternite", "adoption", "grossesse", "retrait"];
  const QUARTS_CYCLE = ["J", "S", "N", "C"];
  const HEURES_DEFAUT = { J: ["07:00", "19:00"], S: ["15:00", "23:00"], N: ["19:00", "07:00"] };
  const MODELES = {
    "4-4J": "JJJJCCCC", "4-4JN": "JJJJCCCCNNNNCCCC", "223": "JJCCJJJCCJJCCCNNCCNNNCCNNCCC",
    "7-7": "JJJJJJJCCCCCCC", "3-3": "JJJCCC", "5-2": "JJJJJCC", "JSN": "JJJJJCCSSSSSCCNNNNNCC",
    // Rotations 12 h courantes
    "dupont": "NNNNCCCJJJCNNNCCCJJJJCCCCCCC", "3-3JN": "JJJCCCNNNCCC", "4-3-3-4": "JJJJCCCJJJCCCC",
    "4-3-3-4JN": "JJJJCCCJJJCCCCNNNNCCCNNNCCCC", "2-3-2": "JJCCCJJCCJJJCC", "5-5-4-4": "JJJJJCCCCCNNNNCCCC",
    "223J": "JJCCJJJCCJJCCC",
    // Rotations 8 h
    "swing": "JJJJJJJCCSSSSSSSCCNNNNNNNCCC", "6-2": "JJJJJJCCSSSSSSCCNNNNNNCC", "6-3": "JJJJJJCCC",
    "4-2": "JJJJCCSSSSCCNNNNCC", "JSN5-2": "JJJJJCCSSSSSCCNNNNNCC",
    // Autres
    "4-3": "JJJJCCC", "5-4-9": "JJJJJCCJJJJCCC", "4-4S": "SSSSCCCC", "4-4N": "NNNNCCCC",
    // Sûreté du Québec : horaire hybride H1 (annexe J), cycle de 35 jours, 3 fins de semaine de congé sur 5
    "SQ-H1": "JJJJCCCSSCCJJJCCSSSCCNNNNNNNCCCCCCC",
    // Gabarits conformes aux règles du contrat (10.15, annexe I) : l'ordre exact des jours est à l'annexe J et à l'horaire affiché
    "SQ-H2": "CCJJJCCCCJJJCCCCJJJCCCCJJJCCCJJJJCC",
    "SQ-H3-9": "CJJJJCCCSSSSCCCNNNNCCCJJJJCCSSSSSCC",
    "SQ-H3-12": "CCCCJJCCCNNNCCCJJJCCCNNCCCJJJCCCNNN",
    "SQ-I12": "CCJJJCCCCNNNCCCJJJJCCCNNNNCC",
    "SQ-13-15-28": "CJJJCCCCNNNCCCCJJJCCCNNNNCCC",
    "SQ-16-19-35": "CCJJJCCCCNNNCCCCJJJCCCCNNNCCCJJJJCC",
    "SQ-ALMA": "JJJCCJJCCCNNNCCNNCCC",
    "SQ-4-3": "JJJJCCC",
  };
  // Référence : l'équipe 2 commence le cycle le lundi 5 octobre 2026; chaque équipe suivante une semaine plus tard
  const H12_SQ = { J: ["07:00", "19:00"], S: ["16:00", "04:00"], N: ["19:00", "07:00"] };
  const H9_SQ = { J: ["07:00", "16:00"], S: ["15:00", "00:00"], N: ["23:00", "08:00"] };
  const MODELES_SQ = {
    "SQ-H1": { debut: "2026-10-05", equipeRef: 2, hybride: true },
    "SQ-H2": { heures: H12_SQ, gabarit: true }, "SQ-H3-9": { heures: H9_SQ, gabarit: true }, "SQ-H3-12": { heures: H12_SQ, gabarit: true },
    "SQ-I12": { heures: H12_SQ, gabarit: true }, "SQ-13-15-28": { heures: H12_SQ, gabarit: true }, "SQ-16-19-35": { heures: H12_SQ, gabarit: true },
    "SQ-ALMA": { heures: H12_SQ, gabarit: true }, "SQ-4-3": { heures: H9_SQ, gabarit: true },
  };
  document.getElementById("hr-equipe").addEventListener("change", () => {
    const m = document.getElementById("hr-modele").value;
    if (!MODELES_SQ[m]) return;
    const deb = debutEquipeSQ(m, document.getElementById("hr-equipe").value);
    hr.brouillon.debut = deb; document.getElementById("hr-debut").value = deb; rendreBrouillon();
  });
  function debutEquipeSQ(modele, equipe) {
    const sq = MODELES_SQ[modele], L = MODELES[modele].length;
    const ref = jourUTC(sq.debut) + ((+equipe || sq.equipeRef) - sq.equipeRef) * 7;
    const n = Math.floor((jourUTC(aujourdhuiISO()) - ref) / L);
    return isoDe(ref + n * L);
  }
  const H8 = { J: ["07:00", "15:00"], S: ["15:00", "23:00"], N: ["23:00", "07:00"] };
  const H12 = { J: ["07:00", "19:00"], S: ["11:00", "23:00"], N: ["19:00", "07:00"] };
  const MODELES_HEURES = { dupont: H12, "3-3JN": H12, "4-3-3-4": H12, "4-3-3-4JN": H12, "2-3-2": H12, "5-5-4-4": H12, "223J": H12, "223": H12, "4-4JN": H12, "7-7": H12,
    swing: H8, "6-2": H8, "6-3": H8, "4-2": H8, "JSN5-2": H8, "JSN": H8, "4-3": { ...H8, J: ["07:00", "16:00"] }, "5-4-9": { ...H8, J: ["07:00", "16:00"] } };
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
    const mo = e && e.motif && MOTIFS[e.type] ? MOTIFS[e.type].find(([k]) => k === e.motif) : null;
    const tsps = e ? [e.tspAvant && e.tspAvant.debut ? { ...e.tspAvant, moment: "avant" } : null, e.tsp && e.tsp.debut ? { ...e.tsp, moment: "apres" } : null].filter(Boolean) : [];
    return { code: e ? e.type : prevu, prevu, note: e ? e.note : "", exception: !!e, tsp: tsps[0] || null, tsps, motif: mo ? mo[1] : "", motifCle: e && e.motif || "" };
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
  // Accueil : recherche globale (sections de l'app, articles de loi, municipalités)
  const SECTIONS_RECHERCHE = [
    ["Horaire", "horaire rotation quart calendrier conge vacances", "horaire"], ["Carte", "carte borne kilometre route position", "carte"],
    ["Lois", "lois csr code securite routiere article", "csr"], ["Table des vitesses", "vitesse amende points grand exces", "vitesse"],
    ["Frais et contribution", "frais contribution amende tarif", "frais"], ["Feuille de poste", "feuille pad poste aide memoire", "feuille"],
    ["Messages", "messages messagerie administrateur", "messages"], ["Forum", "forum discussion", "forum"], ["Idées et sondages", "idees sondages vote", "idees"],
    ["Corps de police et territoires", "corps police territoire municipal autochtone", "corps"], ["Mon compte", "compte profil photo mot de passe", "compte"],
    ["Réglages", "reglages theme style notifications nuit", "reglages"], ["Favoris des lois", "favoris etoile", "favoris"],
  ];
  let rechMinuteur;
  $("#ac-q").addEventListener("input", () => { clearTimeout(rechMinuteur); rechMinuteur = setTimeout(rechercheGlobale, 180); });
  async function rechercheGlobale() {
    const brut = $("#ac-q").value.trim(), q = norm(brut).replace(/^(art(icle)?\.?\s*)/, "");
    const el = $("#ac-resultats");
    if (q.length < 2) { el.hidden = true; el.innerHTML = ""; return; }
    const res = [];
    for (const [nom, mots, cible] of SECTIONS_RECHERCHE) {
      if (cible === "convention" && !accesConvention()) continue;
      if (norm(nom).includes(q) || mots.split(" ").some((m) => m.startsWith(q))) res.push({ g: "Sections", titre: nom, sous: "Ouvrir", agir: () => (cible === "frais" ? (afficherVue("csr"), ongletLois("frais")) : cible === "favoris" ? (afficherVue("csr"), ongletLois("favoris")) : allerA(cible)) });
    }
    const estNumero = /^\d+(\.\d+)*$/.test(q);
    try {
      const lois = estNumero ? [["csr", "csr.json"], ["criminel", "lois/criminel.json"]] : [["csr", "csr.json"]];
      for (const [cle, fichier] of lois) {
        const brutLoi = await charger(fichier);
        const arts = Array.isArray(brutLoi) ? brutLoi : brutLoi.articles;
        const trouves = estNumero
          ? arts.filter((x) => x.numero === q || x.numero.startsWith(q + ".")).slice(0, 4)
          : q.length >= 3 ? arts.filter((x) => norm(x.section || "").includes(q) || norm(x.texte).includes(q)).slice(0, 4) : [];
        for (const x of trouves) res.push({ g: "Articles de loi", titre: `${LOIS[cle].court} art. ${x.numero}`, sous: (x.section || x.texte).replace(/\s+/g, " ").slice(0, 90), agir: () => { afficherVue("csr"); ouvrirFavori(cle, x.numero); } });
      }
    } catch { /* données non disponibles */ }
    if (!estNumero && q.length >= 2) {
      try {
        const idx = await charger("municipalites.json");
        const munis = idx.municipalites.filter((m) => norm(m[0]).startsWith(q) || (q.length >= 3 && norm(m[0]).includes(q))).slice(0, 5);
        for (const m of munis) res.push({ g: "Municipalités", titre: m[0], sous: `MRC ${m[2]} · code ${m[1]}${m[5] ? " · desservie par la SQ" : ""}`, agir: () => { afficherVue("carte"); setTimeout(() => etat.placer && etat.placer(m[4], m[3], m[0], 12), 450); } });
      } catch { /* facultatif */ }
    }
    if ($("#ac-q").value.trim() !== brut) return; // une autre recherche a commencé
    el.hidden = false;
    if (!res.length) { el.innerHTML = `<p class="aide">Aucun résultat pour « ${esc(brut)} ».</p>`; return; }
    let groupe = "";
    el.innerHTML = res.map((r, i) => {
      const tete = r.g !== groupe ? `<h4>${esc(r.g)}</h4>` : ""; groupe = r.g;
      return `${tete}<button type="button" data-res="${i}"><b>${esc(r.titre)}</b><small>${esc(r.sous)}</small></button>`;
    }).join("");
    $$("[data-res]", el).forEach((b) => b.addEventListener("click", () => { const r = res[+b.dataset.res]; $("#ac-q").value = ""; el.hidden = true; r.agir(); }));
  }

  // Accueil : entraves Québec 511 autour de la position (calcul fait sur l'appareil)
  function kmEntre(a, b) {
    const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function pointsGeo(g) {
    if (!g) return [];
    if (g.type === "Point") return [g.coordinates];
    if (g.type === "LineString" || g.type === "MultiPoint") return g.coordinates;
    if (g.type === "MultiLineString" || g.type === "Polygon") return g.coordinates.flat();
    if (g.type === "MultiPolygon") return g.coordinates.flat(2);
    return [];
  }
  // Accueil : entraves Québec 511 sur le territoire de l'unité du membre, actualisées automatiquement.
  // Aucune localisation : le territoire vient du profil (poste SQ, poste autoroutier ou corps municipal/autochtone).
  const t511 = { terr: null, cle: "", minuteur: null, enCours: false, tout: false, liste: [] };
  const ACTU_511_MS = 3 * 60 * 1000;
  function distSegmentKm(p, a, b) {
    // Distance approximative (projection locale) entre un point et un segment, en km
    const kx = 111.32 * Math.cos(p[1] * Math.PI / 180), ky = 110.57;
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }
  function lignesDe(g) {
    if (!g) return [];
    if (g.type === "LineString") return [g.coordinates];
    if (g.type === "MultiLineString") return g.coordinates;
    return [];
  }
  async function territoire511() {
    const p = etat.profil || {};
    const corps = (p.corps_police || "").trim(), unite = (p.unite || "").trim();
    const cle = corps + "|" + unite;
    if (t511.cle === cle && t511.terr !== null) return t511.terr;
    let terr = false;
    if (/s[ûu]ret[ée] du qu[ée]bec/i.test(corps) && unite) {
      const bureaux = await charger("sq_bureaux.geojson");
      const f = bureaux.features.find((x) => norm(nomBureau(x.properties.NOM_ENT || "")) === norm(unite) || norm(x.properties.NOM_UNIT || "") === norm(unite))
        || bureaux.features.find((x) => norm(nomBureau(x.properties.NOM_ENT || "")).includes(norm(unite)));
      if (f) {
        const pp = f.properties, auto = pp.CAT_UNIT === "Poste autoroutier";
        const fc = await charger(auto ? "sq_autoroutier.geojson" : "sq_postes.geojson");
        const fs = fc.features.filter((x) => x.properties.NOM_UNIT === pp.NOM_UNIT);
        if (fs.length) terr = { nom: nomBureau(pp.NOM_ENT), auto, fs };
      }
    } else if (corps) {
      if (!etat.corps) await chargerCorps();
      const c = (etat.corps || []).find((x) => norm(x.nom) === norm(corps));
      if (c && (c.municipalites || []).length) {
        const toutes = await charger("municipalites_hors_sq.geojson");
        const fs = toutes.features.filter((x) => c._munis.has(norm(x.properties.nom)));
        if (fs.length) terr = { nom: c.nom, auto: false, fs };
      }
    }
    t511.cle = cle; t511.terr = terr;
    return terr;
  }
  function dansTerritoire(f, terr) {
    const pts = pointsGeo(f.geometry);
    if (!pts.length) return false;
    if (terr.auto) {
      // Poste autoroutier : entrave à moins de 1 km d'un tronçon patrouillé
      return pts.some((pt) => terr.fs.some((t) => lignesDe(t.geometry).some((l) => {
        for (let i = 1; i < l.length; i++) if (distSegmentKm(pt, l[i - 1], l[i]) <= 1) return true;
        return false;
      })));
    }
    return pts.some((pt) => terr.fs.some((t) => {
      const bb = bbox(t.geometry);
      return pt[0] >= bb[0] && pt[0] <= bb[2] && pt[1] >= bb[1] && pt[1] <= bb[3] && dansGeometrie(pt[0], pt[1], t.geometry);
    }));
  }
  function rendre511() {
    const liste = $("#ac-511-liste"), max = 2;
    const vus = t511.tout ? t511.liste : t511.liste.slice(0, max);
    liste.hidden = !vus.length;
    liste.innerHTML = vus.map((x, i) => `<li><button type="button" data-511="${i}">
        <span class="genre-511 ${esc(x.p.genre || "")}">${x.p.genre === "chantier" ? "Travaux" : "Avertissement"}${x.p.route ? " · route " + esc(x.p.route) : ""}</span>
        <b>${esc(x.p.titre || x.p.travaux || "Entrave")}</b>
        <small>${esc([x.p.lieu, x.p.municipalite, x.p.direction].filter(Boolean).join(" · "))}</small></button></li>`).join("")
      + (t511.liste.length > max ? `<li class="ac-511-plus"><button type="button" id="ac-511-plus">${t511.tout ? "Voir moins" : `Voir plus (${t511.liste.length - max} autre${t511.liste.length - max > 1 ? "s" : ""})`}</button></li>` : "");
    $$("[data-511]", liste).forEach((btn) => btn.addEventListener("click", () => {
      const x = t511.liste[+btn.dataset["511"]];
      afficherVue("carte");
      setTimeout(() => {
        const c = $("#c-511"); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event("change")); }
        if (etat.placer) etat.placer(x.pt[1], x.pt[0], x.p.titre || "Entrave Québec 511", 14);
      }, 400);
    }));
    const plus = $("#ac-511-plus");
    if (plus) plus.addEventListener("click", () => { t511.tout = !t511.tout; rendre511(); });
  }
  async function charger511(silencieux) {
    if (t511.enCours) return;
    const etatEl = $("#ac-511-etat"), b = $("#ac-511-btn");
    t511.enCours = true; b.disabled = true;
    if (!silencieux || !t511.liste.length) etatEl.textContent = "Chargement des entraves…";
    try {
      const terr = await territoire511();
      if (!terr) {
        $("#ac-511-titre").textContent = "Circulation · Québec 511";
        etatEl.textContent = "Territoire de votre unité introuvable. Indiquez votre corps de police et votre poste dans Mon compte pour voir les entraves de votre secteur.";
        $("#ac-511-liste").hidden = true; return;
      }
      $("#ac-511-titre").innerHTML = `Circulation · Québec 511<small>${esc(terr.nom)}</small>`;
      const { data, error } = await sb.functions.invoke("trafic-511", { method: "GET" });
      if (error || !data || !data.features) {
        etatEl.textContent = t511.liste.length ? "Québec 511 ne répond pas. Nouvel essai dans quelques minutes." : "Québec 511 ne répond pas pour le moment. Nouvel essai dans quelques minutes.";
        return;
      }
      const rang = (x) => (x.p.genre === "chantier" ? 1 : 0);
      t511.liste = data.features.filter((f) => dansTerritoire(f, terr)).map((f) => ({ p: f.properties || {}, pt: pointsGeo(f.geometry)[0] }))
        .sort((a, c) => rang(a) - rang(c) || String(a.p.route || "").localeCompare(String(c.p.route || ""), "fr", { numeric: true }));
      const n = t511.liste.length, heure = new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
      etatEl.textContent = n ? `${n} entrave${n > 1 ? "s" : ""} sur votre territoire · à jour à ${heure}, actualisé automatiquement` : `Aucune entrave signalée sur votre territoire · vérifié à ${heure}`;
      rendre511();
    } catch (e) {
      console.warn(e);
      etatEl.textContent = "Impossible de charger les entraves pour le moment.";
    } finally { t511.enCours = false; b.disabled = false; }
  }
  function demarrer511() {
    charger511(false);
    clearInterval(t511.minuteur);
    t511.minuteur = setInterval(() => {
      if (etat.vue !== "accueil" || $("#ecran-app").hidden) { clearInterval(t511.minuteur); t511.minuteur = null; return; }
      if (document.visibilityState === "visible") charger511(true);
    }, ACTU_511_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && etat.vue === "accueil" && t511.minuteur) charger511(true);
  });
  $("#ac-511-btn").addEventListener("click", () => charger511(false));

  // Dates limites du contrat de travail SQ (art. 23, 24, 10.15) affichées à l'accueil
  function echeancesSQ() {
    const auj = aujourdhuiISO(), an = +auj.slice(0, 4), res = [];
    const jours = (iso) => Math.round((jourUTC(iso) - jourUTC(auj)));
    const ajouter = (debutAff, limite, titre, detail, urgent) => { if (auj >= debutAff && auj <= limite) res.push({ limite, titre, detail, j: jours(limite), urgent }); };
    ajouter(`${an}-01-01`, `${an}-03-15`, "Choix des vacances d'été", "Pour la période du 1ᵉʳ avril au 30 septembre, attribuées par ancienneté (23.06 a).");
    ajouter(`${an}-07-01`, `${an}-09-15`, "Choix des vacances d'hiver et des Fêtes", "Pour la période du 1ᵉʳ octobre au 31 mars et les Fêtes, attribuées par ancienneté (23.06 b, 24.01 d).");
    ajouter(`${an}-09-16`, `${an}-10-31`, "Vacances pendant les Fêtes : dernière chance", "Demande au supérieur immédiat au plus tard le 31 octobre, au premier qui la fait (24.01 e).", true);
    ajouter(`${an}-11-01`, `${an}-11-30`, "Horaire des Fêtes", "Congé de Noël (22 au 28 déc.) ou du Jour de l'An (29 déc. au 4 janv.); horaire affiché au plus tard le 30 novembre (24.02).");
    // Changement d'heure : 2ᵉ dimanche de mars
    const m = new Date(an, 2, 1), dim = 1 + ((7 - m.getDay()) % 7) + 7;
    const heure = `${an}-03-${String(dim).padStart(2, "0")}`;
    ajouter(isoPlus(heure, -10), heure, "Passage à l'heure avancée", "Si vous travaillez cette nuit-là, l'heure non travaillée se remet la journée même (10.15).");
    if (etat.paie && etat.paie.date_entree) {
      try {
        const B = banquesSQ();
        // Rappel quand il reste moins de 3 fois plus de jours que de jours de congé à placer (au-delà de ce qui est reportable)
        const base = B.type === "12" ? 12 : 9;
        const rappel = (soldeH, reportable, fin, titre, regle, cle) => {
          const aPlacer = Math.max(0, soldeH - reportable), joursConge = aPlacer / base, joursRestants = jourUTC(fin) - jourUTC(auj) + 1;
          if (aPlacer > 0 && joursRestants > 0 && joursRestants < 3 * joursConge) {
            res.push({ limite: fin, titre, detail: `Il vous reste ${fmtJH(aPlacer, base)} à placer (${Math.ceil(joursConge)} jour${Math.ceil(joursConge) > 1 ? "s" : ""}) et ${joursRestants} jours pour les prendre. ${regle}`, j: joursRestants - 1, urgent: true, cle, aPlacer, base });
          }
        };
        rappel(B.fer.soldeFin, 12, B.fer.fin, "Fériés à planifier", "Au plus 12 h peuvent être reportées ou payées au 31 décembre (23.17 c).", "fer");
        rappel(B.vac.soldeFin, 36, B.vac.fin, "Vacances à planifier", "Au plus 36 h peuvent être reportées au 31 mars (23.13).", "vac");
      } catch { /* horaire pas encore chargé */ }
    }
    return res.sort((a, b) => a.j - b.j);
  }
  // Notification de l'appareil (si permise), au plus une fois par semaine pour chaque banque
  async function notifierRappelsConges(rappels) {
    if (!rappels.length || !("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    for (const r of rappels) {
      const cle = `pm-rappel-${r.cle}`;
      let dernier = null; try { dernier = localStorage.getItem(cle); } catch { /* facultatif */ }
      if (dernier && jourUTC(aujourdhuiISO()) - jourUTC(dernier) < 7) continue;
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(r.titre, { body: r.detail, tag: cle, icon: "assets/icone-192.png", badge: "assets/icone-192.png", data: { url: "#horaire" } });
        localStorage.setItem(cle, aujourdhuiISO());
      } catch { /* notification indisponible */ }
    }
  }
  // Mes échéances (requalification, RCR, permis…) : événements « échéance » d'une journée, avec rappel
  const mesEcheances = () => (cal.evs || []).filter((e) => e.calendrier === "echeance").map((e) => ({ ...e, iso: isoLoc(new Date(e.debut)) })).sort((a, b) => a.iso.localeCompare(b.iso));
  function rendreMesEcheances() {
    const auj = aujourdhuiISO();
    const l = mesEcheances();
    $("#mc-ech-liste").innerHTML = l.length ? l.map((e) => {
      const j = jourUTC(e.iso) - jourUTC(auj);
      const r = RAPPELS.find((x) => x[0] === String(e.rappel_min));
      return `<li class="${j < 0 ? "passee" : j <= 30 ? "proche" : ""}"><span><b>${esc(e.titre)}</b><small>${esc(dateCourte(e.iso, true))} · ${j < 0 ? "passée" : j === 0 ? "aujourd'hui" : `dans ${j} jour${j > 1 ? "s" : ""}`}${r ? ` · rappel ${esc((r[1] || "").toLowerCase())}` : ""}</small></span><button type="button" class="btn-icone" data-ech-suppr="${esc(e.id)}" aria-label="Retirer ${esc(e.titre)}">✕</button></li>`;
    }).join("") : `<li class="vide">Aucune échéance pour l'instant.</li>`;
  }
  $("#mc-ech-type").addEventListener("change", () => { if (!$("#mc-ech-type").value) $("#mc-ech-titre").focus(); });
  $("#mc-ech-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = $("#mc-ech-type").value, prec = $("#mc-ech-titre").value.trim(), iso = $("#mc-ech-date").value;
    const titre = [type, prec].filter(Boolean).join(" · ");
    if (!titre) return toast("Choisissez l'échéance ou écrivez une précision.");
    if (!iso) return toast("Choisissez la date limite.");
    const debut = minuit(iso), fin = new Date(debut.getTime() + MS_JOUR);
    const { data, error } = await sb.from("evenements").insert({ titre: titre.slice(0, 120), journee: true, calendrier: "echeance", repetition: "aucune", debut: debut.toISOString(), fin: fin.toISOString(), rappel_min: Number($("#mc-ech-rappel").value), modifie_le: new Date().toISOString() }).select().single();
    if (error) return toast(traduireErreur(error));
    cal.evs.push(data);
    $("#mc-ech-titre").value = ""; $("#mc-ech-date").value = "";
    rendreMesEcheances(); rendreEcheances();
    toast("Échéance ajoutée, avec rappel.");
    if (!(await verifierAbonnementSilencieux())) setTimeout(() => toast("Activez les notifications dans Réglages pour recevoir le rappel"), 2600);
  });
  $("#mc-ech-liste").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ech-suppr]"); if (!b) return;
    if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Retirer ?"; b.classList.add("arme"); setTimeout(() => { if (b.isConnected) { delete b.dataset.arme; b.textContent = "✕"; b.classList.remove("arme"); } }, 3000); return; }
    const { error } = await sb.from("evenements").delete().eq("id", b.dataset.echSuppr);
    if (error) return toast(traduireErreur(error));
    cal.evs = cal.evs.filter((x) => x.id !== b.dataset.echSuppr);
    rendreMesEcheances(); rendreEcheances();
  });
  function rendreEcheances() {
    const sec = $("#ac-echeances");
    // Mes échéances des 60 prochains jours, pour tous les membres
    const auj = aujourdhuiISO();
    const perso = mesEcheances().map((e) => ({ titre: e.titre, detail: "Mon échéance.", limite: e.iso, j: jourUTC(e.iso) - jourUTC(auj) })).filter((e) => e.j >= 0 && e.j <= 60);
    const l = (estSQ() ? echeancesSQ() : []).concat(perso).sort((a, b) => a.j - b.j);
    sec.hidden = !l.length;
    if (estSQ()) notifierRappelsConges(l.filter((e) => e.cle));
    $("#ac-echeances-liste").innerHTML = l.map((e) => `<li class="${e.urgent || e.j <= 10 ? "urgent" : ""}"><span class="ech-j"><b>${e.j <= 0 ? "Auj." : e.j}</b>${e.j > 0 ? `<small>jour${e.j > 1 ? "s" : ""}</small>` : ""}</span><span><b>${esc(e.titre)}</b><small>${esc(e.detail)} Date limite : ${esc(dateCourte(e.limite, true))}.</small></span></li>`).join("");
  }

  // Position du soleil : lever, coucher et crépuscule civil, calculés sur l'appareil (formules astronomiques usuelles)
  function heuresSoleil(date, lat, lon) {
    const rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009, e = rad * 23.4397, jour = 864e5;
    const midi = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const d = midi.valueOf() / jour - 0.5 + J1970 - J2000;
    const lw = rad * -lon, phi = rad * lat;
    const n = Math.round(d - J0 - lw / (2 * Math.PI));
    const approx = (ht) => J0 + (ht + lw) / (2 * Math.PI) + n;
    const ds = approx(0);
    const M = rad * (357.5291 + 0.98560028 * ds);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const transit = (a) => J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const Jmidi = transit(ds);
    const enDate = (j) => new Date((j + 0.5 - J1970) * jour);
    const paire = (h) => {
      const c = (Math.sin(h * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
      if (c < -1 || c > 1) return [null, null]; // soleil de minuit ou nuit polaire
      const Jcouche = transit(approx(Math.acos(c)));
      return [enDate(Jmidi - (Jcouche - Jmidi)), enDate(Jcouche)];
    };
    const [lever, coucher] = paire(-0.833), [aube, crepuscule] = paire(-6);
    return { lever, coucher, aube, crepuscule, midi: enDate(Jmidi) };
  }

  // Soleil (calculé ici) et météo (Open-Meteo, position arrondie à environ 10 km, seulement quand on touche « Ma position »)
  const METEO_CODES = { 0: "Ciel dégagé", 1: "Plutôt dégagé", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine faible", 53: "Bruine", 55: "Bruine forte", 56: "Bruine verglaçante", 57: "Bruine verglaçante forte", 61: "Pluie faible", 63: "Pluie", 65: "Pluie forte", 66: "Pluie verglaçante", 67: "Pluie verglaçante forte", 71: "Neige faible", 73: "Neige", 75: "Neige forte", 77: "Grains de neige", 80: "Averses faibles", 81: "Averses", 82: "Averses fortes", 85: "Averses de neige", 86: "Averses de neige fortes", 95: "Orage", 96: "Orage et grêle", 99: "Orage et forte grêle" };
  const ciel = { pos: undefined, meteo: null, quand: null };
  const hFr = (d) => (d ? d.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "—");
  function rendreCiel() {
    if (ciel.pos === undefined) ciel.pos = lireLocal("pm-ciel-pos", null); // dernière position arrondie, gardée sur l'appareil
    if (!ciel.pos) return;
    const s = heuresSoleil(new Date(), ciel.pos.lat, ciel.pos.lon);
    const maintenant = new Date();
    const jourOk = s.lever && s.coucher;
    const etatJour = !jourOk ? "" : maintenant < s.aube || maintenant > s.crepuscule ? "Nuit" : maintenant < s.lever || maintenant > s.coucher ? "Crépuscule (lumière civile)" : "Jour";
    const m = ciel.meteo;
    $("#ac-ciel-contenu").innerHTML = `
      <div class="ciel-grille">
        <div><small>Lever</small><b>${hFr(s.lever)}</b></div><div><small>Coucher</small><b>${hFr(s.coucher)}</b></div>
        <div><small>Aube civile</small><b>${hFr(s.aube)}</b></div><div><small>Fin du crépuscule</small><b>${hFr(s.crepuscule)}</b></div>
      </div>
      ${etatJour ? `<p class="ciel-etat">En ce moment : <b>${etatJour}</b></p>` : ""}
      ${m ? `<div class="ciel-meteo"><b>${Math.round(m.temperature_2m)} °C</b><span>${esc(METEO_CODES[m.weather_code] || "—")} · ressentie ${Math.round(m.apparent_temperature)} °C<br>Vent ${Math.round(m.wind_speed_10m)} km/h${m.wind_gusts_10m ? `, rafales ${Math.round(m.wind_gusts_10m)}` : ""}${m.visibility != null ? ` · visibilité ${m.visibility >= 10000 ? "10 km et plus" : (m.visibility / 1000).toFixed(1).replace(".", ",") + " km"}` : ""}${m.precipitation ? ` · précipitations ${String(m.precipitation).replace(".", ",")} mm` : ""}</span></div>` : ""}
      <div class="ciel-actions"><button type="button" class="btn-secondaire petit" id="ac-ciel-copier">Copier pour mon rapport</button>${m ? `<small>Météo : <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · position arrondie à environ 10 km</small>` : `<small>Soleil calculé sur l'appareil.</small>`}</div>`;
    $("#ac-ciel-copier").addEventListener("click", async () => {
      const d = new Date();
      const t = `Le ${d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })} à ${hFr(d)} : lever du soleil ${hFr(s.lever)}, coucher ${hFr(s.coucher)}, fin du crépuscule civil ${hFr(s.crepuscule)}${etatJour ? ` (${etatJour.toLowerCase()})` : ""}.`
        + (m ? ` Météo : ${(METEO_CODES[m.weather_code] || "").toLowerCase()}, ${Math.round(m.temperature_2m)} °C, vent ${Math.round(m.wind_speed_10m)} km/h${m.visibility != null ? `, visibilité ${m.visibility >= 10000 ? "10 km et plus" : (m.visibility / 1000).toFixed(1).replace(".", ",") + " km"}` : ""} (source : Open-Meteo, ${hFr(new Date(ciel.quand))}).` : "");
      try { await navigator.clipboard.writeText(t); toast("Copié. Collez-le dans votre rapport."); } catch { toast("Copie impossible sur cet appareil."); }
    });
  }
  async function chargerMeteo() {
    if (!ciel.pos) return;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${ciel.pos.lat}&longitude=${ciel.pos.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,visibility&wind_speed_unit=kmh&timezone=America%2FToronto`;
      const r = await fetch(u, { cache: "no-store", referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      ciel.meteo = j.current; ciel.quand = Date.now();
    } catch { ciel.meteo = null; toast("Météo indisponible pour l'instant. Les heures du soleil restent affichées."); }
    rendreCiel();
  }
  $("#ac-ciel-btn").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("La localisation n'est pas offerte sur cet appareil.");
    $("#ac-ciel-btn").disabled = true;
    navigator.geolocation.getCurrentPosition((p) => {
      $("#ac-ciel-btn").disabled = false;
      // Arrondie à 0,1° (environ 10 km) : c'est tout ce qui est gardé sur l'appareil et envoyé pour la météo
      ciel.pos = { lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10 };
      ecrireLocal("pm-ciel-pos", ciel.pos);
      rendreCiel(); chargerMeteo();
    }, () => { $("#ac-ciel-btn").disabled = false; toast("Position refusée ou introuvable."); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  });

  async function initAccueil() {
    const p = etat.profil;
    const h = new Date().getHours();
    const prenom = (p.nom_complet || "").trim().split(/\s+/)[0] || "";
    $("#ac-bonjour").textContent = `${h >= 18 || h < 5 ? "Bonsoir" : "Bonjour"}${prenom ? ", " + prenom : ""}`;
    $("#ac-date").textContent = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
    $("#ac-unite").textContent = [p.grade, p.corps_police, p.unite].filter(Boolean).join(" · ");
    remplirAvatar($("#ac-avatar"), p);
    demarrer511();
    try { rendreCiel(); } catch (e) { console.warn(e); }
    try { rendreEcheances(); } catch (e) { console.warn(e); }
    chargerEvenements().then(() => { try { rendreEcheances(); } catch (e) { console.warn(e); } }).catch(() => {});
    // Quart du jour
    const carte = $("#ac-quart");
    try {
      await chargerMonHoraire();
      chargerPaie().then(rendreEcheances).catch(() => {});
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
    integrerTsRetenus();
    if (estSQ() || estAdmin()) chargerPoste(true).catch(() => {});
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
    $("#hr-echanges").hidden = lecture || conj || enConfig || (hr.onglet === "stats" && !!affichee().config);
    $$(".hr-moi-seul").forEach((el) => (el.hidden = conj));
    $("#hr-vide-aide").textContent = conj ? `Entrez la rotation de ${hr.conj.nom} une seule fois : vous verrez ses quarts à côté des vôtres. Ce calendrier reste privé.` : "Configurez votre rotation une seule fois. L'app calcule ensuite votre horaire pour les mois à venir.";
    $("#hr-commencer").textContent = conj ? `Configurer la rotation de ${hr.conj.nom}` : "Configurer ma rotation";
    $("#hr-vide").hidden = lecture || !!affichee().config || enConfig;
    const ongletStats = hr.onglet === "stats" && !!src.config && !enConfig;
    const posteOk = (estSQ() || estAdmin()) && !lecture && !conj;
    const ongletPoste = posteOk && !enConfig && (hr.onglet === "poste" || hr.onglet === "ts");
    $$("[data-hr-vue='poste'], [data-hr-vue='ts']").forEach((b) => (b.hidden = !posteOk));
    $("#hr-onglets-vue").hidden = (!src.config && !posteOk) || enConfig;
    $("#hr-poste-vue").hidden = !ongletPoste;
    if (ongletPoste) {
      $$("[data-hr-vue]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hrVue === hr.onglet)));
      for (const id of ["#hr-vide", "#hr-principal", "#stats-voile", "#hr-partage", "#hr-echanges", "#hr-lecture-vide"]) $(id).hidden = true;
      rendrePoste();
      return;
    }
    $("[data-hr-vue='stats']").textContent = estSQ() && !lecture && !conj ? "Rémunération" : "Statistiques";
    $$("[data-hr-vue]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hrVue === (ongletStats ? "stats" : "calendrier"))));
    $("#stats-voile").hidden = !ongletStats;
    if (ongletStats) setTimeout(() => { try { rendreStats(); } catch (e) { console.warn(e); } }, 0);
    $("#hr-principal").hidden = !src.config || enConfig || ongletStats;
    $("#hr-lecture-vide").hidden = !(lecture && !src.config);
    $("#hr-partage").hidden = lecture || conj || enConfig || ongletStats;
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
    echeance: { nom: "Échéance", c: "#C2410C" },
  };
  const REPETITIONS = { aucune: "Jamais", jour: "Chaque jour", semaine: "Chaque semaine", "2semaines": "Toutes les 2 semaines", mois: "Chaque mois", annee: "Chaque année" };
  const RAPPELS = [["", "Aucun", "Aucun"], ["0", "Au moment de l'événement", "Le jour même (9 h)"], ["5", "5 minutes avant"], ["15", "15 minutes avant"], ["30", "30 minutes avant"],
    ["60", "1 heure avant"], ["120", "2 heures avant"], ["1440", "1 jour avant", "La veille (9 h)"], ["2880", "2 jours avant", "2 jours avant (9 h)"], ["10080", "1 semaine avant", "1 semaine avant (9 h)"],
    ["20160", "2 semaines avant", "2 semaines avant (9 h)"], ["43200", "1 mois avant", "1 mois avant (9 h)"], ["86400", "2 mois avant", "2 mois avant (9 h)"]];
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
        <span class="num">${Number(iso.slice(8))}</span>${qq.code && rotationVisible() ? `<span class="chip q q-${esc(qq.code)}">${esc(qq.code)}${qq.tsp ? `<sup class="tsp-plus">+X</sup>` : ""}</span>` : ""}
        <span class="points">${evs.slice(0, 3).map((o) => `<i style="background:${couleurEv(o.ev)}"></i>`).join("")}</span></button>`;
    }
    $("#hr-grille").innerHTML = html;
    $$("#hr-grille button").forEach((b) => b.addEventListener("click", () => { cal.sel = b.dataset.jour; rendreMois(); }));
    rendreAgenda(cal.sel);
  }

  // Congé des Fêtes (art. 24) : 7 jours regroupés à Noël ou au Jour de l'An
  const fetes = { periode: "noel", plan: [] };
  function anneeFetes() { const a = aujourdhuiISO(); return +a.slice(5, 7) === 1 && +a.slice(8, 10) <= 4 ? +a.slice(0, 4) - 1 : +a.slice(0, 4); }
  function planFetes() {
    const y = anneeFetes(), debut = fetes.periode === "noel" ? `${y}-12-22` : `${y}-12-29`;
    let soldeD = 0; try { if (etat.paie && etat.paie.date_entree) soldeD = banquesSQ().cd.solde; } catch { /* sans banques */ }
    const reste = $("#fetes-reste").value, plan = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoPlus(debut, i), q = quartDu(iso, hr), ex = (hr.exceptions || {})[iso];
      if (ex && !["H", "V", "B", "D", "C"].includes(ex.type)) { plan.push({ iso, code: ex.type, garde: true }); continue; }
      if (!["J", "S", "N"].includes(q.prevu)) { plan.push({ iso, code: "C", hebdo: true }); continue; }
      const h = heuresAbsence(iso);
      if (soldeD >= h && h > 0) { soldeD -= h; plan.push({ iso, code: "D", h }); }
      else plan.push({ iso, code: reste, h });
    }
    return plan;
  }
  function rendreFetes() {
    $$("[data-fetes]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.fetes === fetes.periode)));
    fetes.plan = planFetes();
    $("#fetes-liste").innerHTML = fetes.plan.map((p) => `<li><span>${esc(dateCourte(p.iso, "jour"))}</span><span class="q q-${esc(p.code)}">${esc(p.code)}</span><small>${p.garde ? "Déjà modifiée : laissée telle quelle" : p.hebdo ? "Congé hebdomadaire" : `${esc(QUARTS[p.code].nom)}${p.h ? ` · ${fmtH(p.h)}` : ""}`}</small></li>`).join("");
    const tot = (c) => fetes.plan.filter((p) => p.code === c && !p.garde).reduce((s, p) => s + (p.h || 0), 0);
    $("#fetes-note").textContent = `Utilise ${["D", "H", "V", "B"].filter((c) => tot(c)).map((c) => `${fmtH(tot(c))} de ${QUARTS[c].nom.toLowerCase()}`).join(", ") || "seulement des congés hebdomadaires"}. Choix entre le 1ᵉʳ juillet et le 15 septembre par ancienneté, sinon au plus tard le 31 octobre au premier qui le demande (24.01). L'horaire des Fêtes est affiché au plus tard le 30 novembre (24.02 g).`;
  }
  function ouvrirFetes() { rendreFetes(); $("#fetes-voile").hidden = false; }
  $$("[data-fetes]").forEach((b) => b.addEventListener("click", () => { fetes.periode = b.dataset.fetes; rendreFetes(); }));
  $("#fetes-reste").addEventListener("change", rendreFetes);
  $("#fetes-fermer").addEventListener("click", () => ($("#fetes-voile").hidden = true));
  $("#fetes-voile").addEventListener("click", (e) => { if (e.target.id === "fetes-voile") e.target.hidden = true; });
  $("#fetes-ok").addEventListener("click", async () => {
    const sauvegarde = { ...(hr.exceptions || {}) };
    hr.exceptions = hr.exceptions || {};
    let n = 0;
    for (const p of fetes.plan) { if (p.garde || p.hebdo) continue; hr.exceptions[p.iso] = { type: p.code, note: "Congé des Fêtes" }; n++; }
    try { await sauverHoraire(); $("#fetes-voile").hidden = true; rendreHoraire(); toast(`Congé des Fêtes inscrit (${n} jour${n > 1 ? "s" : ""})`); }
    catch (e) { hr.exceptions = sauvegarde; toast(traduireErreur(e)); }
  });

  // Repos et durée du travail (12.16, annexe I 1.6) : alertes pour la journée choisie
  function intervallesTravail(iso, src = affichee()) {
    const q = quartDu(iso, src), base = jourUTC(iso) * 1440, res = [];
    const ajouter = (h, quoi) => { if (!h) return; const [a, b] = h.map((t) => { const [x, y] = t.split(":").map(Number); return x * 60 + y; }); res.push({ d: base + a, f: base + (b <= a ? b + 1440 : b), quoi }); };
    if (["J", "S", "N", "X", "F", "T"].includes(q.code)) ajouter(heuresJour(q.code, iso, src), QUARTS[q.code].nom.toLowerCase());
    q.tsps.forEach((t) => ajouter([t.debut, t.fin], "temps supplémentaire"));
    return res;
  }
  function alertesRepos(iso, src = affichee()) {
    const tout = [-1, 0, 1].flatMap((k) => intervallesTravail(isoPlus(iso, k), src)).sort((a, b) => a.d - b.d);
    // Regrouper le travail continu (moins de 30 min d'arrêt)
    const blocs = [];
    for (const it of tout) { const der = blocs[blocs.length - 1]; if (der && it.d - der.f <= 30) der.f = Math.max(der.f, it.f); else blocs.push({ d: it.d, f: it.f }); }
    const jour0 = jourUTC(iso) * 1440, jour1 = jour0 + 1440, alertes = [];
    const touche = (b) => b.f > jour0 && b.d < jour1;
    const hhmm = (m) => fmtH(m / 60);
    blocs.forEach((b, i) => {
      if (!touche(b)) return;
      const duree = b.f - b.d;
      if (duree >= 17 * 60) alertes.push(`Travail continu de ${hhmm(duree)} : vous avez droit à 8 h de repos consécutives sans perte de traitement (12.16).`);
      else if (duree > 14 * 60) alertes.push(`${hhmm(duree)} de travail : vous pouvez refuser plus de 14 h par 24 h ou plus de 2 h au-delà de votre journée, sauf urgence (12.16).`);
      const suiv = blocs[i + 1];
      if (suiv && suiv.d - b.f < 8 * 60) alertes.push(`Seulement ${hhmm(suiv.d - b.f)} de repos avant le quart suivant. Si c'est à cause d'une assignation à la cour ou des Fêtes, le repos est prolongé jusqu'à 8 h sans perte de traitement (annexe I, 1.6).`);
    });
    return [...new Set(alertes)];
  }

  function rendreAgenda(iso) {
    const lecture = !!hr.vue, qq = quartDu(iso), occs = occDuJour(iso);
    const travail = !!heuresJour(qq.code, iso);
    const peutOffrir = !lecture && hr.cible !== "conjoint" && ["J", "S", "N", "X"].includes(qq.code) && iso >= aujourdhuiISO();
    $("#cal-agenda").innerHTML = `
      <h4>${esc(new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }))}</h4>
      ${rotationVisible() && qq.code ? `<button type="button" class="ag-quart" data-quart="${iso}">
        <span class="chip-grand q q-${esc(qq.code)}">${esc(qq.code)}</span>
        <span><b>${esc(QUARTS[qq.code].nom)}</b>${travail ? ` <span class="ref">${esc(heuresDe(qq.code, undefined, iso))}</span>` : ""}${qq.motif ? `<small>${esc(qq.motif)}</small>` : ""}${qq.tsps.map((t) => `<small class="tsp-ligne">+ Temps supp. ${t.moment === "avant" ? "avant" : "après"} : ${esc(t.debut)} – ${esc(t.fin)}${+t.maj === 2 ? " (× 2)" : ""}${t.pris === "banque" ? " · compensé" : ""}</small>`).join("")}${qq.note ? `<small>${esc(qq.note)}</small>` : ""}</span>
        ${lecture ? "" : `<i>Modifier</i>`}</button>${peutOffrir ? `<button type="button" class="lien ag-offrir" data-offrir="${iso}">Offrir ce quart à mon poste</button>` : ""}` : ""}
      ${(() => { try { const al = estSQ() ? alertesRepos(iso) : []; return al.map((a) => `<p class="ag-alerte">${esc(a)}</p>`).join(""); } catch { return ""; } })()}
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
  // « + » : modifier le quart du jour choisi, ou ajouter un événement
  const menuPlus = $("#cal-plus-menu");
  const fermerMenuPlus = () => { menuPlus.hidden = true; $("#cal-ajout").setAttribute("aria-expanded", "false"); };
  $("#cal-ajout").addEventListener("click", (e) => {
    e.stopPropagation();
    const iso = cal.vue === "liste" ? aujourdhuiISO() : cal.sel;
    const titre = new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
    $("[data-plus='quart'] b", menuPlus).textContent = `Modifier le quart du ${titre}`;
    menuPlus.hidden = !menuPlus.hidden;
    $("#cal-ajout").setAttribute("aria-expanded", String(!menuPlus.hidden));
  });
  $$("[data-plus]", menuPlus).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); fermerMenuPlus();
    const iso = cal.vue === "liste" ? aujourdhuiISO() : cal.sel;
    if (b.dataset.plus === "quart") ouvrirJour(iso); else if (b.dataset.plus === "fetes") ouvrirFetes(); else editerEvenement(null, { iso });
  }));
  document.addEventListener("click", (e) => { if (!menuPlus.hidden && !menuPlus.contains(e.target)) fermerMenuPlus(); });
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
  const stats = { mode: "mois", a: new Date().getFullYear(), m: new Date().getMonth(), paie: 0 };
  const fmtH = (h) => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h${t % 60 ? " " + String(t % 60).padStart(2, "0") : ""}`; };
  function calculerMois(a, m, src) {
    const r = { jours: {}, heures: 0, ts: 0, travailles: 0, lignesTS: [], tsEq: 0, tsVal: 0, valPaie: 0, eqBanque: 0, valBanque: 0, hPaie: 0, hBanque: 0 };
    const compter = (pris, d, maj, iso, o) => {
      if (pris === "banque") r.hBanque += d; else r.hPaie += d;
      if (!paie) return;
      const sal = salaireSQ(paie, iso), t = eqTS(d, maj, o), v = t.eq * sal.tauxTS;
      r.tsEq += t.eq; r.tsVal += v; r.indemnites = (r.indemnites || 0) + t.indemnite;
      if (pris === "banque") { r.eqBanque += t.eq; r.valBanque += v; } else r.valPaie += v;
    };
    const paie = paieActive() ? etat.paie : null;
    const n = new Date(a, m + 1, 0).getDate();
    for (let j = 1; j <= n; j++) {
      const iso = `${a}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
      const q = quartDu(iso, src);
      if (!q.code) continue;
      r.jours[q.code] = (r.jours[q.code] || 0) + 1;
      if (q.code !== "X") for (const t of q.tsps) {
        const d = dureeH([t.debut, t.fin]), maj = +t.maj || 1.5, ex = (src.exceptions || {})[iso] || {};
        const pris = t.pris === "banque" ? "banque" : "paie";
        r.ts += d; r.lignesTS.push({ iso, h: [t.debut, t.fin], d, note: [`${t.moment === "avant" ? "Avant" : "Après"} le quart ${QUARTS[q.code] ? QUARTS[q.code].nom.toLowerCase() : q.code}`, pris === "banque" ? "compensé en banque" : "payé", q.note].filter(Boolean).join(" · "), ts: ex.ts || {}, maj, pris });
        compter(pris, d, maj, iso, { rappel: t.rappel, adjacent: !t.rappel });
      }
      if (["J", "S", "N"].includes(q.code) && ((src.exceptions || {})[iso] || {}).repasNP) {
        const hrp = paie ? heuresRepasNonPris() : 1;
        r.ts += hrp; r.lignesTS.push({ iso, h: null, d: hrp, note: "Repas ou repos non pris (12.06)", ts: {}, maj: 1.5, pris: "paie" });
        compter("paie", hrp, 1.5, iso, {});
      }
      if (!["J", "S", "N", "X"].includes(q.code)) continue;
      const h = heuresJour(q.code, iso, src), d = dureeH(h);
      r.travailles++; r.heures += d;
      if (q.code === "X") {
        const ex = (src.exceptions || {})[iso] || {}, maj = +ex.maj || 1.5;
        const pris = ex.pris === "banque" ? "banque" : "paie";
        r.ts += d; r.lignesTS.push({ iso, h, d, note: [pris === "banque" ? "Compensé en banque" : "Payé", q.note].filter(Boolean).join(" · "), ts: ex.ts || {}, maj, pris });
        compter(pris, d, maj, iso, { rappel: ex.rappel });
      }
    }
    for (const [iso, e] of Object.entries(src.exceptions || {})) { // formations avec détails, pour le rapport
      if (e.type === "F" && e.ts && iso.startsWith(`${a}-${String(m + 1).padStart(2, "0")}`)) r.lignesTS.push({ iso, h: e.debut ? [e.debut, e.fin] : null, d: e.debut ? dureeH([e.debut, e.fin]) : 0, note: e.note, ts: e.ts, formation: true });
    }
    r.lignesTS.sort((x, y) => x.iso.localeCompare(y.iso));
    return r;
  }
  /* ---------------- Rémunération Sûreté du Québec (contrat de travail APPQ 2022-2028, annexe T et art. 11 et 12) ---------------- */
  // Échelles en vigueur depuis la révision de la classification (1er janvier 2025). Taux annuels en $.
  const DATES_ECHELLE_SQ = ["2025-01-01", "2025-04-01", "2026-04-01", "2027-04-01"];
  const EMPLOIS_SQ = {
    agent: { nom: "Agent", echelons: [
      { mois: 0, libelle: "Entrée", taux: [55000, 56100, 57222, 59225] },
      { mois: 6, libelle: "6 mois", taux: [56757, 57892, 59050, 61117] },
      { mois: 12, libelle: "12 mois", taux: [60305, 61511, 62741, 64937] },
      { mois: 18, libelle: "18 mois", taux: [64070, 65351, 66658, 68991] },
      { mois: 24, libelle: "24 mois", taux: [68081, 69443, 70832, 73311] },
      { mois: 30, libelle: "30 mois", taux: [72331, 73778, 75254, 77888] },
      { mois: 36, libelle: "36 mois", taux: [78391, 79959, 81558, 84413] },
      { mois: 48, libelle: "48 mois", taux: [85442, 87151, 88894, 92005] },
      { mois: 60, libelle: "60 mois", taux: [93138, 95001, 96901, 100293] }] },
    agent_specialiste: { nom: "Agent spécialiste", echelons: [{ mois: 0, libelle: "Taux unique", taux: [102452, 104501, 106591, 110322] }] },
    sergent_gestionnaire: { nom: "Sergent gestionnaire", echelons: [{ mois: 0, libelle: "Taux unique", taux: [107109, 109251, 111436, 115337] }] },
    sergent_enqueteur: { nom: "Sergent enquêteur", echelons: [{ mois: 0, libelle: "Taux unique", taux: [108040, 110201, 112405, 116340] }] },
    sergent_gestionnaire_enquete: { nom: "Sergent gestionnaire enquête", echelons: [{ mois: 0, libelle: "Taux unique", taux: [108040, 110201, 112405, 116340] }] },
    sergent_responsable: { nom: "Sergent responsable d'unité", echelons: [{ mois: 0, libelle: "Taux unique", taux: [118751, 121126, 123549, 127874] }] },
  };
  // Art. 11.09 : majoration selon les années d'ancienneté
  const ANCIENNETE_SQ = [[21, 11], [14, 9], [10, 7], [6, 6]];
  // Art. 11.17 : reconnaissance du niveau de service 6 (Loi sur la police)
  const NIVEAU6_SQ = [["2026-04-01", 6], ["2025-04-01", 5], ["2024-04-01", 3.5], ["2023-04-01", 2], ["2022-04-01", 1]];
  function moisEntre(a, b) { // mois complets entre deux dates ISO
    const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  }
  function salaireSQ(paie, iso = aujourdhuiISO()) {
    if (!paie || !paie.date_entree || !paie.emploi || !EMPLOIS_SQ[paie.emploi]) return null;
    const emploi = EMPLOIS_SQ[paie.emploi];
    let k = 0; DATES_ECHELLE_SQ.forEach((d, i) => { if (iso >= d) k = i; });
    const mois = Math.max(0, moisEntre(paie.date_entree, iso));
    const ech = [...emploi.echelons].reverse().find((e) => mois >= e.mois) || emploi.echelons[0];
    const base = ech.taux[k];
    const ans = mois / 12;
    const anc = (ANCIENNETE_SQ.find(([a]) => ans >= a) || [0, 0])[1];
    const niv6 = (NIVEAU6_SQ.find(([d]) => iso >= d) || [0, 0])[1];
    const calcule = Math.round(base * (1 + anc / 100) * (1 + niv6 / 100));
    const annuel = paie.salaire_manuel ? +paie.salaire_manuel : calcule;
    const suivant = emploi.echelons.find((e) => e.mois > mois);
    return { emploi: emploi.nom, echelon: ech.libelle, base, anc, niv6, calcule, annuel, manuel: !!paie.salaire_manuel,
      ans, tauxTS: annuel / 2000, tauxRegulier: annuel / 2080, dateTaux: DATES_ECHELLE_SQ[k], prochainEchelon: suivant ? suivant.libelle : null };
  }
  // Taux annuel minimum d'un emploi à une date (17.04), avec l'ajustement du niveau de service 6 (11.17)
  function tauxMinimumEmploi(emploi, iso) {
    const e = EMPLOIS_SQ[emploi]; if (!e) return 0;
    let k = 0; DATES_ECHELLE_SQ.forEach((d, i) => { if (iso >= d) k = i; });
    const niv6 = (NIVEAU6_SQ.find(([d]) => iso >= d) || [0, 0])[1];
    return e.echelons[0].taux[k] * (1 + niv6 / 100);
  }
  // Art. 12.09 : 1 à 14 min ne comptent pas, 15 à 44 min = ½ h, 45 min et plus = 1 h
  const arrondiTS = (h) => { const t = Math.round(h * 60), r = t % 60; return Math.floor(t / 60) + (r >= 45 ? 1 : r >= 15 ? 0.5 : 0); };
  // Valeur d'une période de temps supplémentaire selon l'art. 12 : arrondi (12.09), heure de repas (12.08),
  // minimums de rappel (12.03, 12.04, annexe I 2.1) et indemnité de 6 $ par 4 h (12.08). eq = heures × taux à payer.
  const RAPPELS_TS = {
    hors: { nom: "Rappel en dehors de mon quart", min: 3 * 1.5, aide: "Minimum 3 h à temps et demi (12.03)" },
    hebdo12: { nom: "Rappel sur un congé hebdomadaire (horaire 12 h)", min: 4 * 1.5, aide: "Minimum 4 h à temps et demi (annexe I, 2.1 b)" },
    vacances: { nom: "Rappel pendant mes vacances ou un férié", min: null, aide: "Minimum 9 h (12 h sur l'horaire de 12 h) au taux régulier (12.04 b); heures travaillées à temps double (12.02)" },
    "cour-annulee": { nom: "Assignation à la cour annulée pendant mon congé", min: 3, aide: "Indemnité de 3 h au taux régulier (12.03)" },
  };
  function eqTS(d, maj, o = {}) {
    const h = arrondiTS(d);
    let eq = h * maj, repasH = 0;
    if (o.rappel !== "cour-annulee" && h > 4) { repasH = h >= 12 ? 1.5 : 1; eq += repasH * maj; } // 12.08 : heure de repas (+ 30 min de repos sur 12 h)
    const r = RAPPELS_TS[o.rappel];
    const minimum = r ? (r.min !== null ? r.min : (typeHoraireSQ() === "12" ? 12 : 9)) : 0;
    const total = Math.max(eq, minimum);
    const indemnite = o.adjacent && h >= 4 ? Math.floor(h / 4) * 6 : 0; // 12.08 : 6 $ par 4 h avant ou après le quart
    return { h, eq: total, repasH, minimum: total > eq ? minimum : 0, indemnite };
  }
  // Repas ou repos non pris pendant le quart (12.06) : payé à temps et demi
  const heuresRepasNonPris = () => (typeHoraireSQ() === "12" ? 1.5 : 1);
  async function chargerPaie(forcer) {
    if (!estSQ()) { etat.paie = null; return null; }
    if (etat.paie !== undefined && !forcer) return etat.paie;
    const { data } = await sb.from("paie_sq").select("date_entree, emploi, salaire_manuel, retenues, banques").eq("user_id", etat.profil.id).maybeSingle();
    etat.paie = data || null;
    return etat.paie;
  }
  const paieActive = () => estSQ() && affichee() === hr && etat.paie && salaireSQ(etat.paie);

  /* ---------------- Paie aux deux semaines (SQ) : traitement, primes (art. 16), temps supp., retenues et impôts 2026 ---------------- */
  const PAIE_ANCRE = "2026-10-29";
  // Allocations annuelles d'isolement, d'éloignement et de rétention (art. 18), versées sur la paie (18.20)
  const ALLOCATIONS_SQ = {
    "": { nom: "Aucune allocation régionale" },
    isoleA: { nom: "Poste isolé, catégorie A (Kuujjuaq, Schefferville) : 23 753 $ par an", an: 23753 },
    isoleB: { nom: "Poste isolé, catégorie B (Blanc-Sablon, Radisson, Fermont) : 19 792 $ par an", an: 19792 },
    eloigneA: { nom: "Poste éloigné, catégorie A (Îles-de-la-Madeleine, Havre-Saint-Pierre)", an: 7155, anCharge: 10730 },
    eloigneB: { nom: "Poste éloigné, catégorie B (Chibougamau, Matagami, Ville-Marie, Témiscaming, Lebel-sur-Quévillon)", an: 6074, anCharge: 8682 },
    retention: { nom: "Sept-Îles ou Port-Cartier : 8 % du traitement (18.14)", pct: 8 },
  }; // un jeudi de paie (art. 20.01 : paie tous les deux jeudis)
  const FISC_2026 = {
    fed: { paliers: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]], base: 16452, emploi: 1501, credit: 0.14, abattement: 0.165 },
    qc: { paliers: [[54345, 0.14], [108680, 0.19], [132245, 0.24], [Infinity, 0.2575]], base: 18952, credit: 0.14, travailleur: 1450 },
    rrq: { mga: 74600, exemptionPaie: 134.61, taux: 0.063, tauxBase: 0.053, max: 4479.30, plafond2: 85000, taux2: 0.04, max2: 416 },
    rqap: { taux: 0.0043, max: 442.90 },
    ae: { taux: 0.013, max: 895.70 },
  };
  const isoPlus = (iso, n) => isoDe(jourUTC(iso) + n);
  const FERIES_FIXES = ["01-01", "06-24", "07-01", "12-25", "12-26"];
  function datePaie(k) { // k = 0 : prochaine paie à partir d'aujourd'hui
    const auj = aujourdhuiISO();
    let n = Math.ceil((jourUTC(auj) - jourUTC(PAIE_ANCRE)) / 14);
    const jeudi = isoPlus(PAIE_ANCRE, (n + k) * 14);
    let verse = jeudi; // jour férié : jour ouvrable précédent (art. 20.01)
    while (FERIES_FIXES.includes(verse.slice(5)) || [0, 6].includes(new Date(verse + "T12:00").getDay())) verse = isoPlus(verse, -1);
    return { jeudi, verse };
  }
  const reglagesPaie = () => ({ decalage: 12, rrmsq: 0, syndicat: 0, assurances: 0, autres: 0, ...((etat.paie && etat.paie.retenues) || {}) });
  // Répartition des minutes d'un quart régulier selon les primes
  function primesQuart(iso, h, sal, ansService) {
    const [a, b] = h.map((t) => { const [x, y] = t.split(":").map(Number); return x * 60 + y; });
    let duree = b - a; if (duree <= 0) duree += 1440;
    const t2080 = sal.annuel / 2080;
    const relève194 = h[0] === "19:00" && h[1] === "04:00", relève164 = h[0] === "16:00" && h[1] === "04:00";
    let nuit = 0, soirZone = 0, fds = 0;
    const jour0 = new Date(iso + "T12:00").getDay();
    for (let m = 0; m < duree; m += 5) {
      const abs = a + m, hd = (abs % 1440) / 60, jour = (jour0 + Math.floor(abs / 1440)) % 7;
      const estNuit = relève194 || (relève164 ? (hd >= 19 || hd < 4) : hd < 7);
      if (estNuit) nuit += 5;
      if (hd >= 19 && !estNuit) soirZone += 5;
      if (jour === 6 || jour === 0) fds += 5;
    }
    // Prime de soir (16.01) : toutes les heures si la moitié ou plus du quart est entre 19 h et minuit
    let enSoir = 0; for (let m = 0; m < duree; m += 5) { const hd = ((a + m) % 1440) / 60; if (hd >= 19) enSoir += 5; }
    const soir = enSoir * 2 >= duree ? duree - nuit : soirZone;
    const pctNuit = ansService >= 10 ? 0.14 : ansService >= 5 ? 0.12 : 0.11;
    return { heures: duree / 60, nuitH: nuit / 60, soirH: Math.max(0, soir) / 60, fdsH: fds / 60,
      nuit: nuit / 60 * t2080 * pctNuit, soir: Math.max(0, soir) / 60 * 0.73, fds: fds / 60 * t2080 * 0.04, pctNuit };
  }
  function impotAnnuel(paliers, revenu) { let impot = 0, bas = 0; for (const [haut, taux] of paliers) { if (revenu <= bas) break; impot += (Math.min(revenu, haut) - bas) * taux; bas = haut; } return impot; }
  function calculPaie(k, avecDetails = true) {
    const paie = etat.paie, src = hr;
    const { jeudi, verse } = datePaie(k);
    const r = reglagesPaie();
    const fin = isoPlus(jeudi, -r.decalage), debut = isoPlus(fin, -13);
    const sal = salaireSQ(paie, jeudi);
    const base = sal.annuel / 26;
    const jours = [];
    let prNuit = 0, prSoir = 0, prFds = 0, tsVal = 0, tsH = 0, tsBanque = 0, regTrav = 0, regPrevus = 0, retenueST = 0, hST = 0, indemRepas = 0;
    let dispoVal = 0, remplVal = 0, repasNuit = 0, habitVal = 0;
    const autreRegime = new Set();
    for (let i = 0; i < 14; i++) {
      const iso = isoPlus(debut, i), q = quartDu(iso, src);
      const salJ = salaireSQ(paie, iso), ans = Math.max(0, moisEntre(paie.date_entree, iso)) / 12;
      const prevuTravail = ["J", "S", "N"].includes(q.prevu);
      if (prevuTravail) regPrevus++;
      const ligne = { iso, code: q.code, prevu: q.prevu, note: q.note };
      if (["J", "S", "N"].includes(q.code)) {
        const h = heuresJour(q.code, iso, src);
        if (h) { const pq = primesQuart(iso, h, salJ, ans); prNuit += pq.nuit; prSoir += pq.soir; prFds += pq.fds; ligne.h = h; ligne.primes = pq.nuit + pq.soir + pq.fds; ligne.detail = pq; regTrav++; }
      } else if (q.code === "X") {
        const ex = (src.exceptions || {})[iso] || {}, h = heuresJour("X", iso, src) || (ex.debut ? [ex.debut, ex.fin] : null);
        const maj = +ex.maj || 1.5, t = eqTS(h ? dureeH(h) : 0, maj, { rappel: ex.rappel }), d = t.h;
        ligne.h = h; ligne.maj = maj; ligne.rappel = ex.rappel; ligne.minimum = t.minimum; ligne.repasH = t.repasH;
        if (ex.pris === "banque") { tsBanque += t.eq; ligne.banque = t.eq; }
        else { tsH += d; tsVal += t.eq * salJ.tauxTS; ligne.ts = t.eq * salJ.tauxTS; }
      } else if (prevuTravail && q.code && q.code !== q.prevu) {
        const h = heuresJour(q.prevu, iso, src);
        if (h) { const pq = primesQuart(iso, h, salJ, ans); ligne.perdu = pq.nuit + pq.soir + pq.fds; ligne.hPrevu = h; }
      }
      // Absences sans traitement (art. 25, 26, 33) et congés payés par d'autres régimes (RQAP, CNESST)
      const rangO = q.code === "O" ? Object.entries(src.exceptions || {}).filter(([k, e]) => e.type === "O" && k.slice(0, 4) === iso.slice(0, 4) && k <= iso).length : 0;
      const sansTraitement = q.code === "U" || (q.code === "P" && NON_PAYES_P.includes(q.motifCle)) || (q.code === "O" && rangO > 2);
      if (sansTraitement && prevuTravail) {
        const hp = heuresJour(q.prevu, iso, src);
        if (hp) { const m = dureeH(hp) * salJ.annuel / 2080; retenueST += m; hST += dureeH(hp); ligne.sansTraitement = m; }
      }
      if ((q.code === "P" && RQAP_P.includes(q.motifCle)) || q.code === "A") autreRegime.add(q.code === "A" ? "CNESST (accident de travail)" : "RQAP et indemnité de la Sûreté (art. 33)");
      if (q.code !== "X") for (const p of q.tsps) {
        const maj = +p.maj || 1.5, t = eqTS(dureeH([p.debut, p.fin]), maj, { rappel: p.rappel, adjacent: !p.rappel }), d = t.h, v = t.eq * salJ.tauxTS;
        ligne.tspMaj = maj; indemRepas += t.indemnite;
        if (p.pris === "banque") { tsBanque += t.eq; ligne.tspBanque = (ligne.tspBanque || 0) + t.eq; }
        else { tsH += d; tsVal += v; ligne.tsp = (ligne.tsp || 0) + v; }
      }
      const exJ = (src.exceptions || {})[iso] || {};
      // Disponibilité de service (art. 13) : 1 h payée par 4 h (domicile), 3 h (hébergement) ou 8 h (régulière, annexe V)
      if (exJ.dispo && +exJ.dispo.h > 0) { const ratio = { domicile: 4, hebergement: 3, reguliere: 8 }[exJ.dispo.type] || 4; const v = +exJ.dispo.h / ratio * salJ.annuel / 2080; dispoVal += v; ligne.dispo = v; }
      // Remplacement temporaire d'un emploi supérieur (17.04) : taux minimum de l'emploi remplacé
      if (exJ.remplace && ["J", "S", "N"].includes(q.code) && EMPLOIS_SQ[exJ.remplace]) {
        const hR = heuresJour(q.code, iso, src), minAn = tauxMinimumEmploi(exJ.remplace, iso);
        const v = hR ? Math.max(0, (minAn - salJ.annuel) / 2080 * dureeH(hR)) : 0;
        if (v) { remplVal += v; ligne.remplacement = v; }
      }
      // Repas de nuit (21.07) et allocation vestimentaire (19.01) pour chaque relève travaillée
      if (["J", "S", "N"].includes(q.code)) {
        const hR = heuresJour(q.code, iso, src);
        if (hR && r.repasNuit !== false) { const deb = hR[0], douze = dureeH(hR) >= 11.5; if (deb >= "19:00" || deb <= "01:00" || (douze && deb === "16:00")) { repasNuit += 30.5; ligne.repasNuit = 30.5; } }
        if (r.habit === "ville") habitVal += 9.1; else if (r.habit === "civil") habitVal += 7.3;
      }
      if (exJ.repasNP && ["J", "S", "N"].includes(q.code)) { const v = heuresRepasNonPris() * 1.5 * salJ.tauxTS; tsVal += v; ligne.repasNP = v; }
      jours.push(ligne);
    }
    const primes = prNuit + prSoir + prFds;
    const al = ALLOCATIONS_SQ[r.alloc || ""] || {};
    const allocation = al.pct ? sal.annuel * al.pct / 100 / 26 : (al.an ? ((r.aCharge && al.anCharge) || al.an) / 26 : 0);
    const brut = Math.max(0, base - retenueST) + primes + tsVal + indemRepas + dispoVal + remplVal + allocation + habitVal;
    const rotation = sal.annuel * 0.018 / 26 * (regPrevus ? Math.min(1, regTrav / regPrevus) : 0); // 16.04 : versée au REER collectif
    return { k, jeudi, verse, debut, fin, sal, base, prNuit, prSoir, prFds, primes, tsVal, tsH, tsBanque, brut, rotation, jours, r, retenueST, hST, indemRepas, dispoVal, remplVal, allocation, allocNom: al.nom, habitVal, repasNuit, autreRegime: [...autreRegime] };
  }
  function retenuesPaie(p) {
    const F = FISC_2026, an = p.verse.slice(0, 4);
    // Cumuls de l'année avant cette paie (pour les maximums RRQ, AE, RQAP)
    let cumul = 0;
    for (let k = -1; k > -30; k--) { const q = calculPaie(k + p.k, false); if (q.verse.slice(0, 4) !== an) break; cumul += q.brut; }
    const assurable = (max, taux, montant) => Math.max(0, Math.min(montant * taux, max - Math.min(max, cumul * taux)));
    const rrqCumul = Math.max(0, Math.min(cumul, F.rrq.mga) - 3500 * Math.min(1, cumul / F.rrq.mga)) * F.rrq.taux;
    const rrq = Math.max(0, Math.min((Math.max(0, Math.min(p.brut, Math.max(0, F.rrq.mga - cumul))) - F.rrq.exemptionPaie) * F.rrq.taux, F.rrq.max - rrqCumul));
    const rrq2 = Math.max(0, Math.min(Math.max(0, Math.min(cumul + p.brut, F.rrq.plafond2) - Math.max(cumul, F.rrq.mga)) * F.rrq.taux2, F.rrq.max2));
    const ae = assurable(F.ae.max, F.ae.taux, p.brut), rqap = assurable(F.rqap.max, F.rqap.taux, p.brut);
    const r = p.r, deductible = (+r.rrmsq || 0) + (+r.syndicat || 0);
    // Impôts retenus : revenu annualisé (paie × 26), méthode simplifiée
    const partieSupp = rrq * ((F.rrq.taux - F.rrq.tauxBase) / F.rrq.taux) + rrq2;
    const A = Math.max(0, (p.brut - deductible - partieSupp) * 26);
    const creditsFed = F.fed.credit * (F.fed.base + F.fed.emploi + (rrq - rrq * ((F.rrq.taux - F.rrq.tauxBase) / F.rrq.taux) + ae + rqap) * 26);
    const fed = Math.max(0, impotAnnuel(F.fed.paliers, A) - creditsFed) * (1 - F.fed.abattement) / 26;
    const qc = Math.max(0, impotAnnuel(F.qc.paliers, Math.max(0, A - Math.min(F.qc.travailleur, A * 0.06))) - F.qc.credit * F.qc.base) / 26;
    const autres = (+r.rrmsq || 0) + (+r.syndicat || 0) + (+r.assurances || 0) + (+r.autres || 0);
    const total = fed + qc + rrq + rrq2 + ae + rqap + autres;
    return { fed, qc, rrq, rrq2, ae, rqap, autres, total, net: p.brut - total };
  }

  /* ---------------- Mes banques (SQ) : vacances, fériés, maladie, temps supplémentaire (art. 23, annexes C et I, art. 12) ---------------- */
  const VAC_9 = [[32, 288], [30, 279], [28, 270], [25, 252], [23, 243], [21, 234], [20, 225], [19, 207], [17, 198], [14, 189], [10, 180], [6, 171], [1, 162]];
  const VAC_12 = [[32, 315], [30, 303], [28, 291], [25, 267], [23, 255], [21, 243], [20, 231], [19, 219], [17, 207], [14, 195], [10, 186], [6, 177], [1, 168]];
  const reglagesBanques = () => ({ horaire: "auto", vacReport: 0, ferReport: 0, vacSolde: null, ferSolde: null, ts189: null, ts1040: null, ...((etat.paie && etat.paie.banques) || {}) });
  function typeHoraireSQ() {
    const b = reglagesBanques();
    if (b.horaire === "9" || b.horaire === "12") return b.horaire;
    const c = hr.config || {};
    if (c.hybride) return "9";
    const h = (c.heures && c.heures.J) || HEURES_DEFAUT.J;
    return dureeH(h) >= 11.5 ? "12" : "9";
  }
  const anneesEntre = (a, b) => (jourUTC(b) - jourUTC(a)) / 365.25;
  function heuresAbsence(iso) { // heures du quart remplacé (rotation prévue ou heures saisies)
    const q = quartDu(iso, hr);
    const h = heuresJour(["J", "S", "N"].includes(q.prevu) ? q.prevu : "X", iso, hr);
    return h ? dureeH(h) : 0;
  }
  function banquesSQ() {
    const paie = etat.paie, b = reglagesBanques(), type = typeHoraireSQ(), auj = aujourdhuiISO();
    const an = +auj.slice(0, 4), mo = +auj.slice(5, 7);
    const fDebut = `${mo >= 4 ? an : an - 1}-04-01`, fFin = `${mo >= 4 ? an + 1 : an}-03-31`;
    const cDebut = `${an}-01-01`, cFin = `${an}-12-31`;
    const jours = (a, z, f) => { for (let n = jourUTC(a); n <= jourUTC(z); n++) f(isoDe(n)); };
    // Vacances
    const ansAvril = anneesEntre(paie.date_entree, fDebut);
    let droitVac;
    if (paie.date_entree >= fDebut) droitVac = 0;
    else if (ansAvril < 1) droitVac = Math.round(Math.min(1, (jourUTC(fDebut) - jourUTC(paie.date_entree)) / 364) * (type === "12" ? 156 : 144));
    else droitVac = ((type === "12" ? VAC_12 : VAC_9).find(([a]) => ansAvril >= a) || [0, 0])[1];
    const vac = { debut: fDebut, fin: fFin, droit: droitVac, report: Math.min(36, +b.vacReport || 0), pris: 0, prevus: 0, jours: [] };
    jours(fDebut, fFin, (iso) => { const q = quartDu(iso, hr); if (q.code === "V") { const h = heuresAbsence(iso); if (iso <= auj) vac.pris += h; else vac.prevus += h; vac.jours.push({ iso, h, prevu: q.prevu }); } });
    vac.total = vac.droit + vac.report;
    if (b.vacSolde && b.vacSolde.date >= fDebut && b.vacSolde.date <= fFin) {
      let apres = 0, apresFutur = 0; vac.jours.forEach((j) => { if (j.iso > b.vacSolde.date) { if (j.iso <= auj) apres += j.h; else apresFutur += j.h; } });
      vac.depart = b.vacSolde; vac.solde = +b.vacSolde.h - apres; vac.soldeFin = vac.solde - apresFutur;
    } else { vac.solde = vac.total - vac.pris; vac.soldeFin = vac.solde - vac.prevus; }
    // Fériés (année civile)
    let droitFer = type === "12" ? 120 : 81;
    if (paie.date_entree > cDebut) droitFer = paie.date_entree > cFin ? 0 : Math.round((jourUTC(cFin) - jourUTC(paie.date_entree)) / 364 * (type === "12" ? 108 : 72));
    const special = auj >= "2027-04-01" ? (type === "12" ? 12 : 9) : 0;
    const fer = { debut: cDebut, fin: cFin, droit: droitFer, special, report: Math.min(12, +b.ferReport || 0), pris: 0, prevus: 0, jours: [] };
    jours(cDebut, cFin, (iso) => { const q = quartDu(iso, hr); if (q.code === "H") { const h = heuresAbsence(iso); if (iso <= auj) fer.pris += h; else fer.prevus += h; fer.jours.push({ iso, h }); } });
    fer.total = fer.droit + fer.report;
    if (b.ferSolde && b.ferSolde.date >= cDebut && b.ferSolde.date <= cFin) {
      let apres = 0, apresFutur = 0; fer.jours.forEach((j) => { if (j.iso > b.ferSolde.date) { if (j.iso <= auj) apres += j.h; else apresFutur += j.h; } });
      fer.depart = b.ferSolde; fer.solde = +b.ferSolde.h - apres; fer.soldeFin = fer.solde - apresFutur;
    } else { fer.solde = fer.total - fer.pris; fer.soldeFin = fer.solde - fer.prevus; }
    // Maladie (année financière) et avis de certificat médical (annexe C, art. 2)
    const mal = { jours: 0, heures: 0, avis: [] };
    const estM = (iso) => ["M", "L"].includes(quartDu(iso, hr).code);
    const codeDe = (iso) => quartDu(iso, hr).code;
    let adjacentsHebdo = 0;
    const seuil = type === "12" ? 4 : 3;
    jours(fDebut, fFin, (iso) => {
      if (!estM(iso)) return;
      mal.jours++; mal.heures += heuresAbsence(iso);
      if (estM(isoPlus(iso, -1))) return; // début d'une période de maladie seulement
      let fin = iso, n = 1; while (estM(isoPlus(fin, 1))) { fin = isoPlus(fin, 1); n++; }
      const avant = codeDe(isoPlus(iso, -1)), apres = codeDe(isoPlus(fin, 1));
      const periode = n > 1 ? `du ${dateCourte(iso)} au ${dateCourte(fin)}` : `le ${dateCourte(iso)}`;
      if (["V", "H"].includes(avant) || ["V", "H"].includes(apres)) mal.avis.push({ iso, texte: `Maladie ${periode}, collée à des vacances ou à un férié : certificat médical requis (2.06).`, fort: true });
      else if (avant === "C" || apres === "C") {
        adjacentsHebdo++;
        if (n >= seuil) mal.avis.push({ iso, texte: `Maladie ${periode} (${n} jours) collée à un congé : certificat médical requis dès le ${seuil}ᵉ jour (2.07).`, fort: true });
        else if (adjacentsHebdo >= seuil) mal.avis.push({ iso, texte: `Maladie ${periode} : ${adjacentsHebdo}ᵉ fois cette année collée à un congé hebdomadaire, certificat médical requis (2.07).`, fort: true });
      }
      if (n > 3 && !mal.avis.some((a) => a.iso === iso)) mal.avis.push({ iso, texte: `Maladie ${periode} (${n} jours) : certificat médical exigible sur demande (2.04 a).` });
      if (n >= 36) mal.avis.push({ iso, texte: `Absence de ${n} jours : à partir du 36ᵉ jour, votre régime de rotation change (annexe C-1).` });
    });
    // Temps compensé : heures ajoutées à la banque de temps (12.11)
    const tsb = { annee: 0, apresSolde: 0, prevu: 0, utilise: 0, utilisePrevu: 0 };
    jours(fDebut, fFin, (iso) => {
      const e = (hr.exceptions || {})[iso];
      if (!e) return;
      if (e.type === "B") { // congé pris à même la banque de temps : heures du quart remplacé
        const hb = heuresAbsence(iso);
        if (iso <= auj) { tsb.utilise += hb; if (b.ts189 && iso > b.ts189.date) tsb.apresSolde -= hb; } else tsb.utilisePrevu += hb;
        return;
      }
      let eq = 0;
      if (e.type === "X" && e.pris === "banque") { const h = heuresJour("X", iso, hr); eq += eqTS(h ? dureeH(h) : 0, +e.maj || 1.5, { rappel: e.rappel }).eq; }
      if (e.type !== "X") for (const p of [e.tspAvant, e.tsp]) if (p && p.pris === "banque" && p.debut) eq += eqTS(dureeH([p.debut, p.fin]), +p.maj || 1.5, { rappel: p.rappel, adjacent: !p.rappel }).eq;
      if (!eq) return;
      if (iso <= auj) { tsb.annee += eq; if (b.ts189 && iso > b.ts189.date) tsb.apresSolde += eq; } else tsb.prevu += eq;
    });
    tsb.solde = b.ts189 ? +b.ts189.h + tsb.apresSolde : null;
    tsb.soldeFin = tsb.solde === null ? null : tsb.solde + tsb.prevu - tsb.utilisePrevu;
    // Congés D : congés hebdomadaires travaillés accumulés (10.11) et repris (code D); max. 45 h (9 h) ou 60 h (12 h ou hybride) (10.21)
    const cd = { gagne: 0, repris: 0, gagnePrevu: 0, reprisPrevu: 0, max: type === "12" || (hr.config && hr.config.hybride) ? 60 : 45 };
    const depD = b.dSolde && b.dSolde.date ? b.dSolde.date : "0000-00-00";
    for (const [iso, e] of Object.entries(hr.exceptions || {})) {
      if (iso <= depD) continue;
      if (e.gainD && ["J", "S", "N"].includes(e.type)) { const h = heuresJour(e.type, iso, hr); const n = h ? dureeH(h) : 0; if (iso <= auj) cd.gagne += n; else cd.gagnePrevu += n; }
      if (e.type === "D") { const n = heuresAbsence(iso); if (iso <= auj) cd.repris += n; else cd.reprisPrevu += n; }
    }
    cd.solde = (b.dSolde ? +b.dSolde.h : 0) + cd.gagne - cd.repris;
    cd.soldeFin = cd.solde + cd.gagnePrevu - cd.reprisPrevu;
    return { type, vac, fer, mal, b, fDebut, fFin, tsb, cd };
  }
  function barreBanque(utilise, total) {
    const p = total > 0 ? Math.max(0, Math.min(100, utilise / total * 100)) : 0;
    return `<span class="banque-barre"><i style="width:${p.toFixed(1)}%"></i></span>`;
  }
  // Comme SITHAR : soldes en jours et heures (1 jour = 9 h, ou 12 h sur l'horaire de 12 heures)
  function fmtJH(h, base) {
    const neg = h < 0, t = Math.round(Math.abs(h) * 60), jour = base * 60;
    const j = Math.floor(t / jour), r = t - j * jour, hh = Math.floor(r / 60), mm = r % 60;
    const txt = [j ? `${j} j` : "", hh || mm || !j ? `${hh} h${mm ? String(mm).padStart(2, "0") : ""}` : ""].filter(Boolean).join(" ");
    return (neg ? "− " : "") + txt;
  }
  function rendreBanquesStats() {
    const el = $("#stats-contenu");
    $("#stats-periode").textContent = "Mes banques";
    if (!etat.paie || !etat.paie.date_entree) {
      el.innerHTML = `<div class="paie-vide"><p>Pour calculer vos banques, indiquez d'abord votre date d'entrée dans <b>Mon compte › Paie et banques</b>.</p><button type="button" class="btn-principal" id="banq-aller">Configurer</button></div>`;
      $("#banq-aller").addEventListener("click", () => { $("#stats-voile").hidden = true; afficherVue("compte"); setTimeout(() => $("#rg-paie-bloc").scrollIntoView({ behavior: "smooth", block: "start" }), 250); });
      return;
    }
    const B = banquesSQ(), { vac, fer, mal, b } = B;
    const base = B.type === "12" ? 12 : 9;
    const jh = (n) => fmtJH(n, base);
    const h = (n) => jh(Math.max(0, n)) + (n < 0 ? " (dépassé de " + jh(-n) + ")" : "");
    const dc = (iso) => dateCourte(iso, true);
    el.innerHTML = `
      <p class="aide">Soldes en jours et heures, comme SITHAR (1 jour = ${base} h). Horaire ${B.type === "12" ? "de 12 heures (annexe I)" : "de 9 heures ou hybride"}${b.horaire === "auto" ? " · détecté selon votre rotation" : ""}. Les heures prises viennent de votre horaire : chaque V ou H compte les heures du quart qu'il remplace.</p>
      <section class="banque">
        <h4>Vacances <small>${esc(dc(vac.debut))} – ${esc(dc(vac.fin))}</small></h4>
        <div class="banque-chiffre"><b>${h(vac.solde)}</b><span>${vac.depart ? `solde selon votre talon du ${esc(dc(vac.depart.date))}` : "restantes aujourd'hui"}</span></div>
        ${barreBanque(vac.depart ? (+vac.depart.h - vac.solde) : vac.pris, vac.depart ? +vac.depart.h : vac.total)}
        <dl class="vt-detail">
          ${vac.depart ? `<dt>Solde au ${esc(dc(vac.depart.date))} (talon)</dt><dd>${jh(+vac.depart.h)}</dd>` : `<dt>Droit de l'année (23.03${B.type === "12" ? ", annexe I 6.3" : ""})</dt><dd>${jh(vac.droit)}</dd>${vac.report ? `<dt>Reportées de l'an dernier (23.13)</dt><dd>${jh(vac.report)}</dd>` : ""}`}
          <dt>Prises</dt><dd>${jh(vac.pris)}</dd>
          <dt>Prévues à l'horaire</dt><dd>${jh(vac.prevus)}</dd>
          <dt class="total">Restantes au 31 mars</dt><dd class="total">${h(vac.soldeFin)}</dd>
        </dl>
        ${vac.soldeFin > 36 && +vac.fin.slice(0, 4) === +aujourdhuiISO().slice(0, 4) && aujourdhuiISO() >= vac.fin.slice(0, 4) + "-01-15" ? `<p class="banque-avis">Au plus 36 h peuvent être reportées après le 31 mars (23.13). Planifiez le reste avant.</p>` : ""}
      </section>
      <section class="banque">
        <h4>Congés fériés <small>année ${esc(fer.debut.slice(0, 4))}</small></h4>
        <div class="banque-chiffre"><b>${h(fer.solde)}</b><span>${fer.depart ? `solde selon votre talon du ${esc(dc(fer.depart.date))}` : "restantes aujourd'hui"}</span></div>
        ${barreBanque(fer.depart ? (+fer.depart.h - fer.solde) : fer.pris, fer.depart ? +fer.depart.h : fer.total)}
        <dl class="vt-detail">
          ${fer.depart ? `<dt>Solde au ${esc(dc(fer.depart.date))} (talon)</dt><dd>${jh(+fer.depart.h)}</dd>` : `<dt>Droit de l'année (23.17${B.type === "12" ? ", annexe I 7.1" : ""})</dt><dd>${jh(fer.droit)}</dd>${fer.report ? `<dt>Reportées (23.17 c)</dt><dd>${jh(fer.report)}</dd>` : ""}`}
          <dt>Pris</dt><dd>${jh(fer.pris)}</dd>
          <dt>Prévus à l'horaire</dt><dd>${jh(fer.prevus)}</dd>
          <dt class="total">Restants au 31 décembre</dt><dd class="total">${h(fer.soldeFin)}</dd>
        </dl>
        ${fer.special ? `<p class="aide">Congé spécial de ${fer.special} h en plus (23.17 d), à convenir avec la Sûreté.</p>` : `<p class="aide">À partir du 1ᵉʳ avril 2027 : congé spécial de ${B.type === "12" ? 12 : 9} h de plus par année (23.17 d).</p>`}
        ${fer.soldeFin > 12 ? `<p class="banque-avis">Au 31 décembre, au plus 12 h peuvent être reportées ou payées (23.17 c). Il vous en resterait ${jh(fer.soldeFin)}.</p>` : ""}
      </section>
      <section class="banque">
        <h4>Maladie <small>${esc(dc(B.fDebut))} – ${esc(dc(B.fFin))}</small></h4>
        <div class="banque-chiffre"><b>${mal.jours} jour${mal.jours > 1 ? "s" : ""}</b><span>${jh(mal.heures)} · payés à 100 % par la banque collective</span></div>
        <p class="aide">À la SQ, la maladie est payée par la banque collective (annexe C) : aucun solde personnel ne diminue. Avisez au moins 1 heure avant votre quart (2.09). Une déclaration écrite suffit jusqu'à 3 jours (2.03).</p>
        ${mal.avis.length ? `<ul class="banque-avis-liste">${mal.avis.map((a) => `<li class="${a.fort ? "fort" : ""}">${esc(a.texte)}</li>`).join("")}</ul>` : `<p class="aide">Aucun certificat médical à prévoir selon votre horaire.</p>`}
      </section>
      ${(() => {
        // Autres congés de l'année civile (art. 25, 26, 33, annexe C)
        const an = aujourdhuiISO().slice(0, 4), c = {}, motifs = {};
        for (const [iso, e] of Object.entries(hr.exceptions || {})) {
          if (iso.slice(0, 4) !== an || !["E", "O", "P", "U", "D", "A", "Y"].includes(e.type)) continue;
          c[e.type] = (c[e.type] || 0) + 1;
          if (e.motif) motifs[e.type + ":" + e.motif] = (motifs[e.type + ":" + e.motif] || 0) + 1;
        }
        const dem = motifs["E:demenagement"] || 0, o = c.O || 0;
        const lignes = [];
        if (c.E) lignes.push(`<dt>Événements familiaux (25.01)</dt><dd>${c.E} j</dd>`);
        lignes.push(`<dt>Obligations familiales (25.08)</dt><dd>${o} / 10 j</dd>`);
        if (dem) lignes.push(`<dt>Déménagement (25.05)</dt><dd>${dem} / 2 j</dd>`);
        if (c.P) lignes.push(`<dt>Droits parentaux (art. 33)</dt><dd>${c.P} j</dd>`);
        if (c.D) lignes.push(`<dt>Congés D repris</dt><dd>${c.D} j</dd>`);
        if (c.U) lignes.push(`<dt>Sans traitement</dt><dd>${c.U} j</dd>`);
        if (c.A) lignes.push(`<dt>Accident de travail</dt><dd>${c.A} j</dd>`);
        if (c.Y) lignes.push(`<dt>Libération syndicale (art. 8)</dt><dd>${c.Y} j</dd>`);
        const avis = [];
        if (o > 2) avis.push(`Obligations familiales : seules les 2 premières journées de l'année sont payées (25.08). ${o - 2} journée${o - 2 > 1 ? "s" : ""} sans traitement.`);
        if (o > 10) avis.push("Obligations familiales : le maximum est de 10 journées par année (25.08).");
        if (dem > 2) avis.push("Déménagement : au plus 2 jours par année civile (25.05).");
        return `<section class="banque">
        <h4>Autres congés <small>année ${an}</small></h4>
        <dl class="vt-detail">${lignes.join("")}</dl>
        ${avis.map((a) => `<p class="banque-avis">${esc(a)}</p>`).join("")}
        <p class="aide">Dans l'horaire, choisissez le code puis le motif (événement familial, droits parentaux, sans traitement…). L'app applique les règles du contrat et ajuste la paie.</p>
      </section>`;
      })()}
      <section class="banque">
        <h4>Congés D <small>congés hebdomadaires travaillés</small></h4>
        <div class="banque-chiffre"><b>${B.cd.solde < 0 ? "− " + jh(-B.cd.solde) : jh(B.cd.solde)}</b><span>à reprendre · max. ${B.cd.max} h (10.21)</span></div>
        ${barreBanque(B.cd.solde, B.cd.max)}
        <dl class="vt-detail">
          ${b.dSolde ? `<dt>Solde au ${esc(dc(b.dSolde.date))} (talon)</dt><dd>${jh(+b.dSolde.h)}</dd>` : ""}
          <dt>Accumulés</dt><dd>${jh(B.cd.gagne)}</dd>
          <dt>Repris (code D)</dt><dd>${jh(B.cd.repris)}</dd>
          ${B.cd.gagnePrevu || B.cd.reprisPrevu ? `<dt>Après ce qui est prévu à l'horaire</dt><dd>${jh(B.cd.soldeFin)}</dd>` : ""}
        </dl>
        ${B.cd.soldeFin > B.cd.max ? `<p class="banque-avis">Vous dépasseriez le maximum de ${B.cd.max} h de congés hebdomadaires travaillés (10.21).</p>` : ""}
        ${B.cd.solde < 0 ? `<p class="banque-avis">Vous avez repris plus de congés D que vous en avez accumulés.</p>` : ""}
        <p class="aide">Quand vous travaillez un congé hebdomadaire avec l'accord de la Sûreté, cochez « accumuler en congé D » dans la journée. Reprenez-le avec le code D.</p>
      </section>
      <section class="banque">
        <h4>Banques de temps supplémentaire</h4>
        <dl class="vt-detail">
          <dt>Compensé cette année (selon l'horaire)</dt><dd>${fmtH(B.tsb.annee)}</dd>
          ${B.tsb.prevu ? `<dt>Compensé à venir</dt><dd>${fmtH(B.tsb.prevu)}</dd>` : ""}
          <dt>Congés pris en banque (B)</dt><dd>${fmtH(B.tsb.utilise)}</dd>
          ${B.tsb.utilisePrevu ? `<dt>Congés B prévus</dt><dd>${fmtH(B.tsb.utilisePrevu)}</dd>` : ""}
          <dt class="total">Banque régulière (max. 189 h, 12.11)</dt><dd class="total">${B.tsb.solde !== null ? (B.tsb.solde < 0 ? "− " + fmtH(-B.tsb.solde) : fmtH(B.tsb.solde)) : "—"}</dd>
          ${B.tsb.soldeFin !== null && B.tsb.soldeFin !== B.tsb.solde ? `<dt>Après ce qui est prévu à l'horaire</dt><dd>${B.tsb.soldeFin < 0 ? "− " + fmtH(-B.tsb.soldeFin) : fmtH(B.tsb.soldeFin)}</dd>` : ""}
          <dt>Banque de fin de carrière (max. 1 040 h, 12.12)</dt><dd>${b.ts1040 ? fmtH(+b.ts1040.h) : "—"}</dd>
        </dl>
        ${B.tsb.solde !== null ? barreBanque(B.tsb.solde, 189) : `<p class="aide">Inscrivez le solde de votre banque dans Mon compte : l'app y ajoutera ensuite le temps compensé de votre horaire.</p>`}
        ${B.tsb.solde > 189 ? `<p class="banque-avis">Votre banque dépasserait 189 h : l'excédent ne peut pas y être accumulé (12.11).</p>` : ""}
        ${B.tsb.soldeFin !== null && B.tsb.soldeFin < 0 ? `<p class="banque-avis">Vos congés B prévus dépassent le solde de votre banque de temps.</p>` : ""}
        <p class="aide">Pour prendre un congé à même votre banque, mettez la journée en <b>B · Banque de temps</b> dans l'horaire. Minimum d'une demi-journée (12.11).</p>
        <p class="aide">Chaque heure de temps supplémentaire mise en banque vaut 1 h 30 (ou 2 h) (12.11). La banque de 1 040 h est offerte au maximum de l'échelle (12.12).</p>
      </section>
      <button type="button" class="btn-secondaire banque-modifier" data-aller-reglages="rg-soldes-bloc">Modifier mes soldes dans Mon compte</button>
      <p class="aide">Estimation selon le contrat de travail APPQ 2022-2028. Le service continu est compté à partir de votre date d'entrée. Votre talon de paie et votre gestionnaire font foi.</p>`;
    brancherAllerReglages(el);
  }

  // Valeur du temps supplémentaire : taux gardés sur cet appareil seulement
  const tsReglages = (() => { try { return { taux: 0, mult: 1.5, mode: "paie", ...JSON.parse(localStorage.getItem("pm-ts-reglages") || "{}") }; } catch { return { taux: 0, mult: 1.5, mode: "paie" }; } })();
  const dollarsTS = (n) => n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
  function htmlCalculTS(heuresTS, libelle, sq) {
    if (sq) {
      const sal = salaireSQ(etat.paie);
      return `<div class="stats-ts-calc">
      <h4>Valeur du temps supplémentaire <small>${esc(libelle)} · calcul automatique SQ</small></h4>
      <dl class="vt-detail ts-resultat">
        <dt>Temps payé (${fmtH(sq.hPaie)})</dt><dd>${dollarsTS(sq.valPaie)}</dd>
        <dt>Temps compensé (${fmtH(sq.hBanque)})</dt><dd>${fmtH(sq.eqBanque)} en banque</dd>
        ${sq.eqBanque ? `<dt>Valeur de la banque ajoutée</dt><dd>${dollarsTS(sq.valBanque)}</dd>` : ""}
        <dt class="total">Montant brut payé estimé</dt><dd class="total">${dollarsTS(sq.valPaie)}</dd>
      </dl>
      <p class="aide">Salaire ${sal.manuel ? "ajusté" : "estimé"} de ${dollarsTS(sal.annuel)} (${esc(sal.emploi)}, ${esc(sal.echelon)}), soit ${dollarsTS(sal.tauxTS)}/h pour le temps supplémentaire (traitement ÷ 2 000, art. 12.01). Heures arrondies selon l'art. 12.09, à temps et demi ou à temps double, payées ou compensées selon votre choix pour chaque journée (art. 12.02, 12.10). Estimation : la paie officielle prévaut. Indemnité de repas (12.08) et rappels minimums (12.03) non inclus.</p>
    </div>`;
    }
    return `<div class="stats-ts-calc">
      <h4>Valeur du temps supplémentaire <small>${esc(libelle)}</small></h4>
      <div class="ts-reglages">
        <label><span>Taux horaire</span><input type="number" inputmode="decimal" min="0" step="0.01" id="ts-taux" value="${tsReglages.taux || ""}" placeholder="ex. 52,40"></label>
        <label><span>Majoration</span><select id="ts-mult"><option value="1">Temps simple</option><option value="1.5">Temps et demi</option><option value="2">Temps double</option></select></label>
        <label><span>Je le prends en</span><select id="ts-mode"><option value="paie">Paie</option><option value="banque">Banque de temps</option><option value="moitie">Moitié paie, moitié banque</option></select></label>
      </div>
      <dl class="vt-detail ts-resultat" id="ts-resultat" data-heures="${heuresTS}"></dl>
      <p class="aide">Estimation. Les taux et la majoration dépendent de votre convention collective et du type de temps supplémentaire : vérifiez-les. Vos taux restent sur cet appareil.</p>
    </div>`;
  }
  function majCalculTS() {
    const el = $("#ts-resultat");
    if (!el) return;
    const partPaie = tsReglages.mode === "paie" ? 1 : tsReglages.mode === "moitie" ? 0.5 : 0;
    if (el.dataset.sq) {
      const h = +el.dataset.heures || 0, eq = +el.dataset.eq || 0, val = +el.dataset.val || 0;
      el.innerHTML = `<dt>Heures supplémentaires</dt><dd>${fmtH(h)}</dd>
        <dt>Équivalent majoré</dt><dd>${fmtH(eq)}</dd>
        ${partPaie < 1 ? `<dt>En banque de temps (art. 12.11)</dt><dd>${fmtH(eq * (1 - partPaie))}</dd>` : ""}
        ${partPaie < 1 ? `<dt>Valeur de la banque</dt><dd>${dollarsTS(val * (1 - partPaie))}</dd>` : ""}
        ${partPaie > 0 ? `<dt class="total">Montant brut estimé</dt><dd class="total">${dollarsTS(val * partPaie)}</dd>` : ""}`;
      return;
    }
    const h = +el.dataset.heures || 0, eq = h * tsReglages.mult;
    const montant = eq * partPaie * (tsReglages.taux || 0);
    el.innerHTML = `<dt>Heures supplémentaires</dt><dd>${fmtH(h)}</dd>
      <dt>Équivalent majoré (× ${String(tsReglages.mult).replace(".", ",")})</dt><dd>${fmtH(eq)}</dd>
      ${partPaie < 1 ? `<dt>En banque de temps</dt><dd>${fmtH(eq * (1 - partPaie))}</dd>` : ""}
      ${partPaie > 0 ? `<dt class="total">Montant brut estimé</dt><dd class="total">${tsReglages.taux ? dollarsTS(montant) : "—"}</dd>` : ""}`;
  }
  function brancherCalculTS() {
    if (!$("#ts-taux") && $("#ts-mode")) {
      $("#ts-mode").value = tsReglages.mode;
      $("#ts-mode").addEventListener("input", () => { tsReglages.mode = $("#ts-mode").value; try { localStorage.setItem("pm-ts-reglages", JSON.stringify(tsReglages)); } catch { /* facultatif */ } majCalculTS(); });
      majCalculTS(); return;
    }
    if (!$("#ts-taux")) return;
    $("#ts-mult").value = String(tsReglages.mult); $("#ts-mode").value = tsReglages.mode;
    const sauver = () => {
      tsReglages.taux = Math.max(0, parseFloat(String($("#ts-taux").value).replace(",", ".")) || 0);
      tsReglages.mult = +$("#ts-mult").value || 1.5; tsReglages.mode = $("#ts-mode").value;
      try { localStorage.setItem("pm-ts-reglages", JSON.stringify(tsReglages)); } catch { /* facultatif */ }
      majCalculTS();
    };
    ["#ts-taux", "#ts-mult", "#ts-mode"].forEach((id) => $(id).addEventListener("input", sauver));
    majCalculTS();
  }
  const dateCourte = (iso, an) => new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: an === "jour" ? "short" : undefined, day: "numeric", month: "long", ...(an === true ? { year: "numeric" } : {}) });
  function rendrePaieStats() {
    const el = $("#stats-contenu");
    if (!etat.paie || !salaireSQ(etat.paie)) {
      $("#stats-periode").textContent = "Paie aux deux semaines";
      el.innerHTML = `<div class="paie-vide"><p>Pour calculer votre paie, indiquez d'abord votre date d'entrée et votre emploi dans <b>Mon compte › Paie et banques</b>.</p><button type="button" class="btn-principal" id="paie-aller">Configurer ma rémunération</button></div>`;
      $("#paie-aller").addEventListener("click", () => { $("#stats-voile").hidden = true; afficherVue("compte"); setTimeout(() => $("#rg-paie-bloc").scrollIntoView({ behavior: "smooth", block: "start" }), 250); });
      return;
    }
    const p = calculPaie(stats.paie), ret = retenuesPaie(p), r = p.r;
    const $$d = dollarsTS;
    $("#stats-periode").textContent = `Paie du ${dateCourte(p.verse, true)}`;
    const nomQ = (c) => (c && QUARTS[c] ? QUARTS[c].nom : "—");
    const lignesJours = p.jours.map((j) => {
      let quoi = "", val = "";
      if (j.primes !== undefined) { quoi = `${esc(nomQ(j.code))} ${j.h ? `<small>${esc(j.h[0])}–${esc(j.h[1])}</small>` : ""}`; val = j.primes ? "+ " + $$d(j.primes) : "—"; }
      else if (j.ts !== undefined) { quoi = `Temps supp. ${j.maj === 2 ? "× 2" : "× 1,5"} <small>payé${j.rappel && RAPPELS_TS[j.rappel] ? " · " + esc(RAPPELS_TS[j.rappel].nom.toLowerCase()) : ""}${j.minimum ? " · minimum appliqué" : ""}${j.repasH ? ` · repas ${fmtH(j.repasH)}` : ""}</small>`; val = "+ " + $$d(j.ts); }
      else if (j.banque !== undefined) { quoi = `Temps supp. ${j.maj === 2 ? "× 2" : "× 1,5"} <small>compensé</small>`; val = `<span class="perdu">+ ${fmtH(j.banque)} en banque</span>`; }
      else if (j.perdu !== undefined) { quoi = `${esc(nomQ(j.code))} <small>au lieu de ${esc(nomQ(j.prevu).toLowerCase())}</small>`; val = j.perdu ? `<span class="perdu">${$$d(j.perdu)} non versé</span>` : "—"; }
      else { quoi = esc(nomQ(j.code)); val = ""; }
      if (j.dispo) { quoi += `<small>+ disponibilité</small>`; val = (val ? val + "<br>" : "") + "+ " + $$d(j.dispo); }
      if (j.remplacement) { quoi += `<small>+ remplacement (17.04)</small>`; val = (val ? val + "<br>" : "") + "+ " + $$d(j.remplacement); }
      if (j.repasNuit) { quoi += `<small>+ repas de nuit</small>`; }
      if (j.repasNP) { quoi += `<small>+ repas non pris (12.06)</small>`; val = (val ? val + "<br>" : "") + "+ " + $$d(j.repasNP); }
      if (j.sansTraitement) val = (val ? val + "<br>" : "") + `<span class="perdu">− ${$$d(j.sansTraitement)} sans traitement</span>`;
      if (j.tsp) { quoi += `<small>+ temps supp. payé ${j.tspMaj === 2 ? "× 2" : "× 1,5"}</small>`; val = (val ? val + "<br>" : "") + "+ " + $$d(j.tsp); }
      if (j.tspBanque) { quoi += `<small>+ temps supp. compensé ${j.tspMaj === 2 ? "× 2" : "× 1,5"}</small>`; val = (val ? val + "<br>" : "") + `<span class="perdu">+ ${fmtH(j.tspBanque)} en banque</span>`; }
      return `<tr><td>${esc(dateCourte(j.iso, "jour"))}</td><td>${quoi}</td><td>${val}</td></tr>`;
    }).join("");
    el.innerHTML = `
      <div class="paie-resume">
        <div><small>Brut</small><b>${$$d(p.brut)}</b></div>
        <div class="net"><small>Net estimé</small><b>${$$d(ret.net + p.repasNuit)}</b></div>
      </div>
      <p class="aide paie-periode">Versée le ${esc(dateCourte(p.verse, true))}${p.verse !== p.jeudi ? " (jour férié le jeudi)" : ""} · primes et temps supp. de la période du ${esc(dateCourte(p.debut))} au ${esc(dateCourte(p.fin, true))}</p>
      <dl class="vt-detail">
        <dt>Traitement (${$$d(p.sal.annuel)} ÷ 26)</dt><dd>${$$d(p.base)}</dd>
        ${p.retenueST ? `<dt>Absence sans traitement (${fmtH(p.hST)})</dt><dd>− ${$$d(p.retenueST)}</dd>` : ""}
        <dt>Prime de nuit (16.02, ${Math.round((p.jours.find((j) => j.detail) || { detail: { pctNuit: 0.11 } }).detail.pctNuit * 100)} %)</dt><dd>${$$d(p.prNuit)}</dd>
        <dt>Prime de soir (16.01, 0,73 $/h)</dt><dd>${$$d(p.prSoir)}</dd>
        <dt>Prime de fin de semaine (16.03, 4 %)</dt><dd>${$$d(p.prFds)}</dd>
        ${p.tsVal ? `<dt>Temps supplémentaire payé (${fmtH(p.tsH)})</dt><dd>${$$d(p.tsVal)}</dd>` : ""}
        ${p.indemRepas ? `<dt>Indemnités de repas (12.08)</dt><dd>${$$d(p.indemRepas)}</dd>` : ""}
        ${p.dispoVal ? `<dt>Disponibilité de service (art. 13)</dt><dd>${$$d(p.dispoVal)}</dd>` : ""}
        ${p.remplVal ? `<dt>Remplacement temporaire (17.04)</dt><dd>${$$d(p.remplVal)}</dd>` : ""}
        ${p.allocation ? `<dt>Allocation régionale (art. 18)</dt><dd>${$$d(p.allocation)}</dd>` : ""}
        ${p.habitVal ? `<dt>Allocation vestimentaire (19.01)</dt><dd>${$$d(p.habitVal)}</dd>` : ""}
        <dt class="total">Brut</dt><dd class="total">${$$d(p.brut)}</dd>
      </dl>
      <h4 class="paie-inter">Retenues</h4>
      <dl class="vt-detail">
        <dt>Impôt fédéral</dt><dd>${$$d(ret.fed)}</dd>
        <dt>Impôt du Québec</dt><dd>${$$d(ret.qc)}</dd>
        <dt>RRQ</dt><dd>${ret.rrq + ret.rrq2 ? $$d(ret.rrq + ret.rrq2) : `<span class="perdu">max. annuel atteint</span>`}</dd>
        <dt>Assurance-emploi</dt><dd>${ret.ae ? $$d(ret.ae) : `<span class="perdu">max. annuel atteint</span>`}</dd>
        <dt>RQAP</dt><dd>${ret.rqap ? $$d(ret.rqap) : `<span class="perdu">max. annuel atteint</span>`}</dd>
        <dt>Mes retenues du talon</dt><dd>${ret.autres ? $$d(ret.autres) : `<span class="perdu">à inscrire</span>`}</dd>
        ${p.repasNuit ? `<dt>Repas de nuit (21.07, non imposable)</dt><dd>+ ${$$d(p.repasNuit)}</dd>` : ""}
        <dt class="total">Net estimé</dt><dd class="total">${$$d(ret.net + p.repasNuit)}</dd>
      </dl>
      ${p.autreRegime.length ? `<p class="banque-avis">Cette période comprend un congé payé en partie par ${esc(p.autreRegime.join(" et par "))}. Ces montants ne sont pas estimés ici : la paie réelle sera différente.</p>` : ""}
      ${p.tsBanque ? `<p class="aide">Temps compensé : ${fmtH(p.tsBanque)} ajoutées à votre banque de temps (pas sur cette paie).</p>` : ""}
      ${p.rotation ? `<p class="aide">Prime de rotation (16.04) : environ ${$$d(p.rotation)} versés directement au REER collectif de l'APPQ, hors de votre paie nette.</p>` : ""}
      <details class="paie-jours"><summary>Détail des 14 jours</summary>
        <div class="table-defile"><table class="table-vitesse paie-table"><tbody>${lignesJours}</tbody></table></div>
        <p class="aide">Les primes sont versées seulement pour les heures régulières effectivement travaillées. Pour un V, une maladie ou une formation, l'app prend le quart prévu à votre rotation pour montrer la prime qui n'est pas versée.</p>
      </details>
      <button type="button" class="btn-secondaire banque-modifier" data-aller-reglages="rg-paie-bloc">Modifier mes retenues dans Mon compte</button>
      <p class="aide">Estimation : impôts calculés avec les taux 2026 sur la paie annualisée (méthode simplifiée), RRQ, assurance-emploi et RQAP avec leurs maximums annuels. Le temps supplémentaire est compté dans la paie de sa période, mais la Sûreté peut le verser jusqu'à 45 jours après la réclamation (20.03). Votre talon de paie fait foi.</p>`;
    brancherAllerReglages(el);
  }
  function rendreStats() {
    const src = affichee();
    $$("[data-stats]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.stats === stats.mode)));
    $("#stats-rapport").hidden = stats.mode !== "mois";
    $("[data-stats='paie']").hidden = $("[data-stats='banques']").hidden = !(estSQ() && affichee() === hr);
    $(".stats-mode").classList.toggle("quatre", !$("[data-stats='paie']").hidden);
    $(".hr-mois-tete", $("#stats-voile")).classList.toggle("sans-fleches", stats.mode === "banques");
    if (!src.config) { $("#stats-contenu").innerHTML = `<p class="vide">Configurez d'abord la rotation.</p>`; return; }
    if (stats.mode === "paie") { rendrePaieStats(); return; }
    if (stats.mode === "banques") { rendreBanquesStats(); return; }
    if (stats.mode === "mois") {
      $("#stats-periode").textContent = new Date(stats.a, stats.m, 15).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
      const r = calculerMois(stats.a, stats.m, src);
      $("#stats-contenu").innerHTML = `
        <div class="stats-totaux">
          <div><small>Heures travaillées</small><b>${fmtH(r.heures)}</b><span>${r.travailles} jour${r.travailles > 1 ? "s" : ""} de quart</span></div>
          <div class="ts"><small>Temps supplémentaire</small><b>${fmtH(r.ts)}</b><span>Total du mois</span></div>
        </div>
        <div class="stats-cats">${Object.entries(r.jours).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<span class="q q-${esc(k)}"><b>${esc(QUARTS[k] ? QUARTS[k].nom : k)}</b>${n} jour${n > 1 ? "s" : ""}</span>`).join("")}</div>
        ${htmlCalculTS(r.ts, "du mois", paieActive() ? r : null)}`;
      brancherCalculTS();
    } else {
      $("#stats-periode").textContent = `Année ${stats.a}`;
      let tH = 0, tTS = 0, tJ = 0; const tot = { valPaie: 0, eqBanque: 0, valBanque: 0, hPaie: 0, hBanque: 0 };
      const lignes = Array.from({ length: 12 }, (_, m) => {
        const r = calculerMois(stats.a, m, src); tH += r.heures; tTS += r.ts; tJ += r.travailles; for (const k in tot) tot[k] += r[k];
        return `<tr><td>${esc(new Date(stats.a, m, 15).toLocaleDateString("fr-CA", { month: "long" }))}</td><td>${r.travailles}</td><td>${fmtH(r.heures)}</td><td>${r.ts ? fmtH(r.ts) : "—"}</td></tr>`;
      }).join("");
      $("#stats-contenu").innerHTML = `<div class="table-defile"><table class="table-vitesse stats-table"><thead><tr><th>Mois</th><th>Jours</th><th>Heures</th><th>Temps supp.</th></tr></thead>
        <tbody>${lignes}</tbody><tfoot><tr><td>Total</td><td>${tJ}</td><td>${fmtH(tH)}</td><td>${fmtH(tTS)}</td></tr></tfoot></table></div>
        ${htmlCalculTS(tTS, "de l'année", paieActive() ? tot : null)}`;
      brancherCalculTS();
    }
  }
  // Onglet Rémunération (SQ) ou Statistiques de l'horaire
  async function ouvrirOngletStats() {
    const d = new Date(); stats.a = d.getFullYear(); stats.m = d.getMonth(); stats.paie = 0;
    if (!stats.dejaOuvert) { stats.mode = estSQ() && affichee() === hr ? "paie" : "mois"; stats.dejaOuvert = true; }
    try { await chargerPaie(); } catch { /* facultatif */ }
    rendreStats();
  }
  $$("[data-hr-vue]").forEach((b) => b.addEventListener("click", () => {
    hr.onglet = b.dataset.hrVue;
    if (hr.onglet === "stats") setTimeout(() => visiteAutomatique("remuneration"), 900);
    rendreHoraire();
    if (hr.onglet === "stats") ouvrirOngletStats();
    if (hr.onglet === "poste" || hr.onglet === "ts") chargerPoste(true);
    $("#vue-horaire").scrollTop = 0;
  }));
  $$("[data-stats]").forEach((b) => b.addEventListener("click", () => { stats.mode = b.dataset.stats; rendreStats(); }));
  $("#stats-prec").addEventListener("click", () => { if (stats.mode === "paie") { stats.paie--; rendreStats(); return; } if (stats.mode === "annee") stats.a--; else if (stats.m === 0) { stats.m = 11; stats.a--; } else stats.m--; rendreStats(); });
  $("#stats-suiv").addEventListener("click", () => { if (stats.mode === "paie") { stats.paie++; rendreStats(); return; } if (stats.mode === "annee") stats.a++; else if (stats.m === 11) { stats.m = 0; stats.a++; } else stats.m++; rendreStats(); });
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
  // Version web de la feuille (créée avec Claude) : désactivée pour tout le monde pour le moment. Mettre true pour la réactiver.
  const FEUILLE_WEB_ACTIVE = false;
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
    $("#fp-envoi").hidden = !p.unite; $("#fp-claude").hidden = !p.unite || !FEUILLE_WEB_ACTIVE;
    if (estAdmin()) chargerFeuillesAdmin();
    if (!p.unite) {
      $("#fp-contenu").innerHTML = `<div class="panneau fp-vide"><b>Aucun poste indiqué</b><span>Indiquez votre unité ou votre poste dans Mon compte pour voir et partager la feuille de votre poste.</span><button type="button" class="btn-secondaire" data-menu-compte>Ouvrir Mon compte</button></div>`;
      $("[data-menu-compte]").addEventListener("click", () => afficherVue("compte"));
      return;
    }
    $("#fp-contenu").innerHTML = `<p class="etat">Chargement de la feuille…</p>`;
    const { data, error } = await sb.rpc("feuille_poste_v2");
    if (error) { $("#fp-contenu").innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    fp.donnees = (data && data[0]) || null;
    fp.zoom = 1;
    rendreFeuille();
  }
  async function rendreFeuille() {
    const el = $("#fp-contenu"), f = fp.donnees;
    const aPhoto = !!(f && f.chemin), aWeb = FEUILLE_WEB_ACTIVE && !!(f && f.donnees);
    $("#fp-envoi-titre").textContent = aPhoto ? "Remplacer la photo de la feuille" : "Ajouter la photo de la feuille de votre poste";
    if (!aPhoto && !aWeb) {
      el.innerHTML = `<div class="panneau fp-vide"><b>Votre poste n'a pas encore de feuille</b><span>Ajoutez-en une ci-dessous : elle sera visible par tous les membres approuvés de votre poste.</span></div>`;
      return;
    }
    if (!fp.mode || (fp.mode === "web" && !aWeb) || (fp.mode === "photo" && !aPhoto)) fp.mode = aWeb ? "web" : "photo";
    el.innerHTML = (aPhoto && aWeb ? `<div class="segmente fp-modes" role="radiogroup" aria-label="Affichage de la feuille">
        <button type="button" role="radio" data-fp-mode="web" aria-checked="${fp.mode === "web"}">Version web</button>
        <button type="button" role="radio" data-fp-mode="photo" aria-checked="${fp.mode === "photo"}">Photo</button></div>` : "") + `<div id="fp-zone"></div>`;
    $$("[data-fp-mode]", el).forEach((b) => b.addEventListener("click", () => { fp.mode = b.dataset.fpMode; rendreFeuille(); }));
    if (fp.mode === "web") rendreWeb($("#fp-zone"), f); else await rendrePhoto($("#fp-zone"));
  }
  function rendreWeb(zone, f) {
    zone.innerHTML = `<div class="panneau fpw">
      <div class="fp-barre"><small class="ref">Version web · mise à jour ${esc(quand(f.donnees_le))} par ${esc(f.donnees_par_nom)}</small></div>
      ${htmlFeuilleWeb(filtrerAffichage(f.donnees))}
      <div class="fc-ligne">${estAdmin() ? "" : `<button type="button" class="lien" id="fp-signaler-web">Signaler à l'administrateur</button>`}<button type="button" class="lien rouge" id="fp-retirer-web">Retirer la version web</button></div>
    </div>`;
    const sig = $("#fp-signaler-web");
    if (sig) sig.addEventListener("click", () => signalerFeuille(sig, f));
    const ret = $("#fp-retirer-web");
    ret.addEventListener("click", async () => {
      if (!ret.dataset.arme) { ret.dataset.arme = "1"; ret.textContent = "Toucher encore pour retirer la version web"; return; }
      const { error } = await sb.rpc("feuille_poste_donnees_retirer", {});
      if (error) return toast(traduireErreur(error));
      toast("Version web retirée"); chargerFeuille();
    });
  }
  async function signalerFeuille(sig, f) {
    if (!sig.dataset.arme) { sig.dataset.arme = "1"; sig.textContent = "Confirmer le signalement"; return; }
    sig.disabled = true;
    const { error } = await sb.rpc("envoyer_message", { p_destinataire: null, p_contenu: `Signalement — Feuille de poste de ${f.unite}${etat.profil.corps_police ? " (" + etat.profil.corps_police + ")" : ""} : elle pourrait contenir un élément interdit (code d'accès, fréquence radio, numéro interne ou renseignement sur une personne). Merci de la vérifier.` });
    if (error) { sig.disabled = false; return toast(traduireErreur(error)); }
    sig.textContent = "Signalé ✓"; toast("L'administrateur a été avisé et vérifiera la feuille");
  }
  async function rendrePhoto(el) {
    const f = fp.donnees;
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
      <div class="fc-ligne">${estAdmin() ? "" : `<button type="button" class="lien" id="fp-signaler">Signaler à l'administrateur</button>`}<button type="button" class="lien rouge" id="fp-retirer">Retirer la photo</button></div>
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
    if (sig) sig.addEventListener("click", () => signalerFeuille(sig, f));
    const ret = $("#fp-retirer");
    ret.addEventListener("click", async () => {
      if (!ret.dataset.arme) { ret.dataset.arme = "1"; ret.textContent = "Toucher encore pour retirer la photo du poste"; return; }
      ret.disabled = true;
      const { data: ancien, error } = await sb.rpc("feuille_poste_retirer", {});
      if (error) { ret.disabled = false; return toast(traduireErreur(error)); }
      if (ancien) await sb.storage.from(SEAU_FEUILLES).remove([ancien]);
      viderCacheFeuille();
      toast("Photo retirée"); chargerFeuille();
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

  /* Version web de la feuille : Claude (compte gratuit du membre) lit la photo et renvoie un JSON uniforme */
  const CONSIGNE_FEUILLE = `Tu transcris la photo jointe d'une feuille aide-mémoire de poste de police (Québec) pour l'application Police Management.

Règles :
1. Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après.
2. Recopie fidèlement, n'invente rien. Si un élément est illisible, écris "?".
3. N'INCLUS JAMAIS, même s'ils sont sur la photo : codes d'accès (porte, barrière, guérite, cadenas, alarme, clés), mots de passe, fréquences ou canaux radio (ex. RITP, RENIR), numéros de téléphone internes ou non publics (urgence du poste, détention, lignes directes, cellulaires personnels), renseignements sur des personnes, et le tableau des vitesses ou des amendes (déjà dans l'application). Inscris seulement le nom de ce que tu as omis dans "exclus".
4. Regroupe le contenu dans ces sections, avec ces titres exacts, si elles s'appliquent : "Tribunaux et poursuivants", "Postes de police", "Numéros utiles", "Remorqueurs", "Codes de lieux", "Limites de territoire", "Autres". Mets les repères kilométriques dans "reperes_km".

Format :
{"poste":"nom du poste ou de la région","maj":"date de mise à jour inscrite, ou null","sections":[{"titre":"Postes de police","type":"tableau","colonnes":["Poste","Code","Téléphone"],"lignes":[["SQ Roberval","PQ40256","418-275-0433"]]},{"titre":"Numéros utiles","type":"liste","elements":[{"libelle":"SAAQ Police","valeur":"418-643-5482"}]}],"reperes_km":[{"route":"167","km":"274","lieu":"Lac Bordeleau"}],"exclus":["Codes de porte","Fréquences radio"]}`;
  const MOTIF_INTERDIT = /(codes?\s+(de\s+)?(porte|d'?acc[eè]s|alarme|barri[eè]re|cadenas|gu[ée]rite)|fr[ée]quences?|\bradio\b|\bcanal\b|\bRITP\b|\bRENIR\b|gu[ée]rite|mots?\s+de\s+passe|urgence\s+poste|#\s?\d{3,})/i;
  const txt = (v, max = 200) => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
  function nettoyerFeuille(brut) {
    let d;
    const m = String(brut || "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Je ne trouve pas la réponse de Claude. Copiez toute sa réponse (le bloc qui commence par « { »).");
    try { d = JSON.parse(m[0]); } catch { throw new Error("La réponse de Claude est incomplète. Demandez-lui : « Redonne seulement le JSON complet », puis recopiez."); }
    const retires = [];
    let lignesRetirees = 0;
    const sections = (Array.isArray(d.sections) ? d.sections : []).slice(0, 30).map((sec) => {
      const titre = txt(sec && sec.titre, 80) || "Autres";
      if (MOTIF_INTERDIT.test(titre)) { retires.push(titre); return null; }
      if (sec.type === "tableau") {
        const colonnes = (Array.isArray(sec.colonnes) ? sec.colonnes : []).slice(0, 10).map((c) => txt(c, 60));
        const lignes = (Array.isArray(sec.lignes) ? sec.lignes : []).slice(0, 250).map((l) => (Array.isArray(l) ? l : [l]).slice(0, 10).map((c) => txt(c)))
          .filter((l) => { const bad = MOTIF_INTERDIT.test(l.join(" ")); if (bad) lignesRetirees++; return !bad && l.some(Boolean); });
        return lignes.length ? { titre, type: "tableau", colonnes, lignes } : null;
      }
      const elements = (Array.isArray(sec.elements) ? sec.elements : []).slice(0, 250).map((e) => ({ libelle: txt(e && e.libelle, 120), valeur: txt(e && e.valeur) }))
        .filter((e) => { const bad = MOTIF_INTERDIT.test(e.libelle + " " + e.valeur); if (bad) lignesRetirees++; return !bad && (e.libelle || e.valeur); });
      return elements.length ? { titre, type: "liste", elements } : null;
    }).filter(Boolean);
    const reperes_km = (Array.isArray(d.reperes_km) ? d.reperes_km : []).slice(0, 500)
      .map((r) => ({ route: txt(r && r.route, 20), km: txt(r && r.km, 12), lieu: txt(r && r.lieu, 120) }))
      .filter((r) => (r.km || r.lieu) && !MOTIF_INTERDIT.test(r.lieu));
    const exclus = [...new Set([...(Array.isArray(d.exclus) ? d.exclus : []).slice(0, 20).map((x) => txt(x, 80)), ...retires])].filter(Boolean);
    if (!sections.length && !reperes_km.length) throw new Error("La réponse de Claude ne contient aucune donnée utilisable.");
    return { donnees: { poste: txt(d.poste, 120), maj: txt(d.maj, 40) || null, sections, reperes_km, exclus }, lignesRetirees, sectionsRetirees: retires.length };
  }
  // À l'affichage aussi, on retire tout élément interdit (au cas où une feuille aurait été publiée autrement)
  const filtrerAffichage = (d) => { try { return nettoyerFeuille(JSON.stringify(d)).donnees; } catch { return d; } };
  const avecTel = (v) => esc(v).replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, (t) => `<a href="tel:${t.replace(/[^\d+]/g, "")}">${t}</a>`);
  function htmlFeuilleWeb(d) {
    if (!d) return "";
    const tete = `<div class="fpw-tete"><b>${esc(d.poste || "Feuille de poste")}</b>${d.maj ? `<small>Feuille d'origine : ${esc(d.maj)}</small>` : ""}</div>`;
    const sections = (d.sections || []).map((sec) => `<section class="fpw-sec"><h4>${esc(sec.titre)}</h4>${sec.type === "tableau"
      ? `<div class="table-defile"><table class="fpw-table">${(sec.colonnes || []).some(Boolean) ? `<thead><tr>${sec.colonnes.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${sec.lignes.map((l) => `<tr>${l.map((c) => `<td>${avecTel(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<dl class="fpw-liste">${sec.elements.map((e) => `<div><dt>${esc(e.libelle)}</dt><dd>${avecTel(e.valeur)}</dd></div>`).join("")}</dl>`}</section>`).join("");
    const routes = {};
    (d.reperes_km || []).forEach((r) => (routes[r.route || "—"] = routes[r.route || "—"] || []).push(r));
    const km = Object.keys(routes).length ? `<section class="fpw-sec"><h4>Repères kilométriques</h4>${Object.entries(routes).map(([route, l]) => `<h5>${/^\d/.test(route) ? "Route " : ""}${esc(route)}</h5><ul class="fpw-km">${l.map((r) => `<li><b>km ${esc(r.km)}</b><span>${esc(r.lieu)}</span></li>`).join("")}</ul>`).join("")}</section>` : "";
    const exclus = (d.exclus || []).length ? `<p class="fpw-exclus">Laissé de côté par sécurité : ${d.exclus.map(esc).join(", ")}.</p>` : "";
    return tete + sections + km + exclus;
  }
  $("#fp-ouvrir-claude").addEventListener("click", async () => {
    await copier(CONSIGNE_FEUILLE);
    window.open(lienClaude(CONSIGNE_FEUILLE), "_blank", "noopener");
  });
  $("#fp-copier-consigne").addEventListener("click", () => copier(CONSIGNE_FEUILLE));
  $("#fp-creer-web").addEventListener("click", () => {
    const ap = $("#fp-apercu");
    let res;
    try { res = nettoyerFeuille($("#fp-json").value); } catch (err) { ap.hidden = true; return toast(err.message); }
    fp.brouillon = res.donnees;
    const n = res.lignesRetirees + res.sectionsRetirees;
    ap.hidden = false;
    ap.innerHTML = `<h4 class="fp-apercu-titre">Aperçu : vérifiez avant de publier</h4>
      ${n ? `<p class="message ok">${n} élément${n > 1 ? "s" : ""} interdit${n > 1 ? "s" : ""} retiré${n > 1 ? "s" : ""} automatiquement (codes, radio, numéros internes).</p>` : ""}
      <div class="fpw fpw-apercu">${htmlFeuilleWeb(res.donnees)}</div>
      <label class="fp-case"><input type="checkbox" id="fp-confirme-web"> <span>J'ai vérifié l'aperçu : il ne contient <b>aucun élément interdit</b>.</span></label>
      <div class="fc-ligne"><button type="button" class="btn-principal" id="fp-publier-web" disabled style="margin:0">Publier pour mon poste</button><button type="button" class="lien" id="fp-annuler-web">Annuler</button></div>`;
    $("#fp-confirme-web").addEventListener("change", (e) => { $("#fp-publier-web").disabled = !e.target.checked; });
    $("#fp-annuler-web").addEventListener("click", () => { ap.hidden = true; fp.brouillon = null; });
    $("#fp-publier-web").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const { error } = await sb.rpc("feuille_poste_donnees_publier", { p_donnees: fp.brouillon });
      if (error) { e.currentTarget.disabled = false; return toast(traduireErreur(error)); }
      ap.hidden = true; $("#fp-json").value = ""; fp.brouillon = null; fp.mode = "web";
      toast("Version web publiée pour votre poste"); chargerFeuille(); $("#vue-feuille").scrollTo({ top: 0, behavior: "smooth" });
    });
    ap.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // Administrateur : toutes les feuilles, pour vérifier et retirer une feuille non conforme
  async function chargerFeuillesAdmin() {
    let bloc = $("#fp-admin");
    if (!bloc) { $("#vue-feuille").insertAdjacentHTML("beforeend", `<div class="panneau" id="fp-admin"></div>`); bloc = $("#fp-admin"); }
    const { data, error } = await sb.rpc("admin_feuilles_poste_v2");
    if (error) { bloc.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    bloc.innerHTML = `<h3>Toutes les feuilles · administrateur</h3>` + ((data || []).length ? `<ul class="liste-partages">${data.map((f) => `
      <li><span><b>${esc(f.unite)}</b><small>${esc(f.corps || "")} · ${esc(quand(f.ajoute_le))} · ${esc(f.ajoute_par_nom)}</small></span>
        <span class="fc-ligne">${f.chemin ? `<button type="button" class="btn-secondaire petit" data-fpa-voir="${esc(f.chemin)}">Photo</button><button type="button" class="btn-danger petit" data-fpa-retirer="${esc(f.cle)}">Retirer la photo</button>` : ""}${f.donnees ? `<button type="button" class="btn-secondaire petit" data-fpa-web="${esc(f.cle)}">Version web</button><button type="button" class="btn-danger petit" data-fpa-retirer-web="${esc(f.cle)}">Retirer la version web</button>` : ""}</span></li>`).join("")}</ul><div id="fp-admin-web"></div>`
      : `<p class="aide">Aucun poste n'a encore partagé de feuille.</p>`);
    $$("[data-fpa-voir]", bloc).forEach((b) => b.addEventListener("click", async () => {
      const fen = window.open("", "_blank");
      try {
        const { data: signe, error: eS } = await sb.storage.from(SEAU_FEUILLES).createSignedUrl(b.dataset.fpaVoir, 600);
        if (eS || !signe) throw new Error("Fichier introuvable");
        if (fen) fen.location.href = signe.signedUrl; else window.open(signe.signedUrl, "_blank");
      } catch (err) { if (fen) fen.close(); toast(err.message); }
    }));
    $$("[data-fpa-web]", bloc).forEach((b) => b.addEventListener("click", () => {
      const f = data.find((x) => x.cle === b.dataset.fpaWeb);
      $("#fp-admin-web").innerHTML = `<div class="fpw fpw-apercu">${htmlFeuilleWeb(f.donnees)}</div>`;
      $("#fp-admin-web").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    $$("[data-fpa-retirer-web]", bloc).forEach((b) => b.addEventListener("click", async () => {
      if (!b.dataset.arme) { b.dataset.arme = "1"; b.textContent = "Confirmer"; return; }
      const { error: e3 } = await sb.rpc("feuille_poste_donnees_retirer", { p_cle: b.dataset.fpaRetirerWeb });
      if (e3) return toast(traduireErreur(e3));
      toast("Version web retirée"); chargerFeuille();
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
    if (ongletAdmin === "outils") { initAdminEtat(); chargerEtatService(); }
    if (ongletAdmin === "stats") rendreBilanAdmin();
  }));
  // Bilan (tableau de bord) : agrégats seulement, aucun suivi individuel
  async function rendreBilanAdmin() {
    const el = $("#adm-stats");
    el.innerHTML = `<p class="aide">Chargement…</p>`;
    const [{ data: b, error }, { data: cap }] = await Promise.all([sb.rpc("admin_tableau_bord"), sb.rpc("admin_capacite")]);
    if (error) { el.innerHTML = ""; return toast(traduireErreur(error)); }
    const m = b.membres, a = b.adoption, ap = Math.max(1, m.approuves);
    const pct = (n) => `${Math.round((100 * n) / ap)} %`;
    const tuile = (n, l, s) => `<div class="adm-tuile"><b>${n}</b><span>${esc(l)}</span>${s ? `<small>${esc(s)}</small>` : ""}</div>`;
    const barres = (liste, cle = "nom") => { const max = Math.max(1, ...liste.map((x) => x.n)); return `<ul class="adm-barres">${liste.map((x) => `<li><span>${esc(x[cle])}${x.corps && x.corps !== x[cle] ? `<small>${esc(x.corps)}</small>` : ""}</span><i style="--p:${(100 * x.n) / max}%"></i><b>${x.n}</b></li>`).join("")}</ul>`; };
    const sem = b.inscriptions || [];
    // Capacité du serveur (forfait gratuit de Supabase) : ce que la base peut mesurer elle-même
    const taille = (o) => o >= 1e9 ? `${(o / 1e9).toFixed(2).replace(".", ",")} Go` : o >= 1e6 ? `${(o / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.round(o / 1e3)} ko`;
    const jauge = (nom, val, max, txt, note) => {
      const p = Math.min(100, (100 * val) / max), niveau = p >= 90 ? "rouge" : p >= 70 ? "orange" : "vert";
      return `<div class="adm-jauge ${niveau}"><div class="adm-jauge-tete"><b>${esc(nom)}</b><span>${esc(txt)}</span></div><i style="--p:${Math.max(p, 1.5)}%"></i><small>${p < 1 ? "moins de 1" : Math.round(p)} % utilisé${note ? " · " + esc(note) : ""}</small></div>`;
    };
    const capHtml = cap ? `
      <h3 class="intertitre">Capacité du serveur <small class="adm-forfait">Supabase · forfait gratuit</small></h3>
      <div class="adm-jauges">
        ${jauge("Base de données", cap.base_octets, 500e6, `${taille(cap.base_octets)} sur 500 Mo`)}
        ${jauge("Fichiers (photos, feuilles)", cap.stockage_octets, 1e9, `${taille(cap.stockage_octets)} sur 1 Go`, `${cap.fichiers} fichier${cap.fichiers > 1 ? "s" : ""}`)}
        ${jauge("Utilisateurs actifs ce mois-ci", cap.actifs_30j, 50000, `${cap.actifs_30j.toLocaleString("fr-CA")} sur 50 000`, `${cap.comptes} comptes au total`)}
        ${jauge("Connexions à la base en ce moment", cap.connexions, cap.connexions_max, `${cap.connexions} sur ${cap.connexions_max}`, "la plupart sont des services internes de Supabase")}
      </div>
      <p class="aide">Non mesurables d'ici : la <b>bande passante</b> (5 Go par mois) et les <b>appels de fonctions</b> (500 000 par mois). Consultez-les dans <a href="https://supabase.com/dashboard/org/lkfsaapbrnipntaalrau/usage" target="_blank" rel="noopener">Supabase › Usage</a>. Au forfait gratuit, un projet sans aucune activité pendant 7 jours est mis en pause et il n'y a pas de sauvegarde automatique téléchargeable.</p>` : "";
    el.innerHTML = capHtml + `
      <h3 class="intertitre">Membres</h3>
      <div class="adm-tuiles">${tuile(m.approuves, "membres approuvés")}${tuile(m.attente, "demandes en attente")}${tuile(b.actifs.j7, "actifs 7 jours", pct(b.actifs.j7))}${tuile(b.actifs.j30, "actifs 30 jours", pct(b.actifs.j30))}</div>
      <h3 class="intertitre">Fonctions utilisées</h3>
      <div class="adm-tuiles">${tuile(a.rotation, "rotation configurée", pct(a.rotation))}${tuile(a.notifications, "notifications activées", pct(a.notifications))}${tuile(a.paie, "paie SQ remplie")}${tuile(a.calendrier_abonne, "calendrier abonné")}${tuile(a.evenements, "utilisent le calendrier")}${tuile(a.echeances, "ont des échéances")}${tuile(a.horaires_poste, "horaires de poste publiés")}${tuile(a.ts_attribues, "TS attribués")}${tuile(a.messages_30j, "messages (30 jours)")}${tuile(a.forum_30j, "sujets au forum (30 jours)")}${tuile(a.idees, "idées proposées")}</div>
      <h3 class="intertitre">Membres par corps de police</h3>${barres(b.par_corps)}
      <h3 class="intertitre">Postes les plus représentés</h3>${barres(b.par_poste)}
      <h3 class="intertitre">Nouvelles demandes par semaine</h3>${sem.length ? barres(sem.map((x) => ({ nom: "Semaine du " + dateCourte(x.semaine), n: x.n }))) : `<p class="aide">Aucune demande depuis 10 semaines.</p>`}
      <p class="aide">Mis à jour le ${esc(new Date(b.genere_le).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }))}.</p>`;
  }

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
    { const og = $("#hr-modele optgroup.seulement-sq"); if (og) { og.hidden = og.disabled = !estSQ(); } }
    $("#hr-equipe-bloc").hidden = !(MODELES_SQ[$("#hr-modele").value] && MODELES_SQ[$("#hr-modele").value].debut);
    if (c && c.equipe) $("#hr-equipe").value = String(c.equipe);
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
    if (MODELES[e.target.value]) {
      hr.brouillon.cycle = MODELES[e.target.value].split("");
      if (MODELES_HEURES[e.target.value]) hr.brouillon.heures = { ...MODELES_HEURES[e.target.value] };
      const sq = MODELES_SQ[e.target.value];
      if (sq) {
        hr.brouillon.hybride = !!sq.hybride; if ($("#hr-hybride")) $("#hr-hybride").checked = !!sq.hybride;
        if (sq.heures) hr.brouillon.heures = { ...sq.heures };
        if (sq.debut) { const deb = debutEquipeSQ(e.target.value, $("#hr-equipe").value); hr.brouillon.debut = deb; $("#hr-debut").value = deb; }
        if (sq.gabarit) toast("Gabarit conforme au contrat : ajustez les cases pour qu'elles correspondent à l'horaire affiché à votre poste");
      }
      $("#hr-equipe-bloc").hidden = !(sq && sq.debut);
      rendreBrouillon();
    } else $("#hr-equipe-bloc").hidden = true;
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
    cible.config = { cycle: hr.brouillon.cycle, debut, heures: hr.brouillon.heures, modele: $("#hr-modele").value || "perso", hybride: !!hr.brouillon.hybride,
      ...(MODELES_SQ[$("#hr-modele").value] && MODELES_SQ[$("#hr-modele").value].debut ? { equipe: +$("#hr-equipe").value } : {}) };
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
    hr.motifInitial = (((cibleEdition().exceptions || {})[iso]) || {}).motif || "";
    $("#hr-periode").checked = !(((cibleEdition().exceptions || {})[iso]) || {}).motif; $("#hr-periode-extra").checked = false; $("#hr-periode-extra").disabled = !$("#hr-periode").checked;
    const ex = (cibleEdition().exceptions || {})[iso] || {};
    $("#hr-jour-debut").value = ex.debut || ""; $("#hr-jour-fin").value = ex.fin || "";
    $$("#hr-ts-champs input").forEach((i) => (i.value = (ex.ts && ex.ts[i.dataset.ts]) || ""));
    $("#hr-jour-ts").open = !!(ex.ts && Object.values(ex.ts).some(Boolean));
    $("#hr-jour-maj").value = String(+ex.maj || 1.5);
    $("#hr-jour-pris").value = ex.pris === "banque" ? "banque" : "paie";
    remplirBlocTS("tsp", ex.tsp); remplirBlocTS("tspa", ex.tspAvant);
    $("#hr-jour-rappel").value = ex.rappel && RAPPELS_TS[ex.rappel] ? ex.rappel : "";
    $("#hr-repasnp").checked = !!ex.repasNP; $("#hr-gaind").checked = !!ex.gainD;
    $("#hr-remplace").value = ex.remplace && EMPLOIS_SQ[ex.remplace] ? ex.remplace : "";
    $("#hr-dispo-actif").checked = !!(ex.dispo && +ex.dispo.h > 0);
    $("#hr-dispo-type").value = (ex.dispo && ex.dispo.type) || "domicile"; $("#hr-dispo-h").value = ex.dispo ? ex.dispo.h : "";
    $("#hr-jour-retirer").hidden = !q.exception;
    $("#hr-jour-offrir").hidden = lecture || hr.cible === "conjoint" || !["J", "S", "N", "X"].includes(q.code) || iso < aujourdhuiISO();
    $("#hr-fiche-jour").dataset.onglet = "quart"; $$("[data-hr-onglet]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hrOnglet === "quart")));
    majChampsJour();
    $("#hr-voile").hidden = false;
    if (!lecture) setTimeout(() => visiteAutomatique("jour"), 700);
  }
  const CHAMPS_TS = [["codeGain", "Code gain"], ["gain", "Gain"], ["activite", "Activité"], ["nature", "Nature"], ["projet", "Projet"], ["psa", "PSA"], ["noDossier", "No dossier / No cours"],
    ["fonctionRemplacee", "Fonction remplacée"], ["uoImpute", "UO imputée"], ["nbreRepas", "Nbre de repas"], ["tempsRepas", "Temps de repas (hh:mm)"], ["demandePar", "Demandé par"], ["remarque", "Remarque"]];
  $("#hr-ts-champs").innerHTML = CHAMPS_TS.map(([k, l]) => `<label><span>${esc(l)}</span><input data-ts="${k}" maxlength="120" autocomplete="off"></label>`).join("");
  const typeChoisi = () => { const b = $("#hr-jour-choix button[aria-pressed='true']"); return b ? b.dataset.q : quartDu(hr.jourChoisi, cibleEdition()).prevu; };
  function majChampsJour() {
    const t = typeChoisi();
    $("#hr-jour-heures").hidden = !!hr.vue || !["J", "S", "N", "X", "F", "T", "B", "V", "H", "D", "Y", "O"].includes(t);
    const motifs = MOTIFS[t];
    $("#hr-motif-bloc").hidden = !!hr.vue || !motifs;
    if (motifs) {
      const sel = $("#hr-jour-motif"), avant = sel.dataset.type === t ? sel.value : hr.motifInitial;
      if (sel.dataset.type !== t) { sel.innerHTML = motifs.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(""); sel.dataset.type = t; }
      if (avant && motifs.some(([k]) => k === avant)) sel.value = avant;
      const m = motifs.find(([k]) => k === sel.value);
      $("#hr-motif-aide").textContent = m ? m[2] : "";
    }
    const duree = motifs ? DUREES_MOTIF[`${t}:${$("#hr-jour-motif").value}`] : null;
    $("#hr-periode-bloc").hidden = !!hr.vue || !duree;
    $("#hr-periode-extra-bloc").hidden = !!hr.vue || !duree || `${t}:${$("#hr-jour-motif").value}` !== "E:deces-parent";
    if (duree) {
      const [n, payes] = duree, fin = isoPlus(hr.jourChoisi, n - 1);
      const txt = n >= 14 ? `${n / 7} semaines` : `${n} jours`;
      $("#hr-periode-titre").textContent = `Inscrire les ${txt} d'un coup`;
      $("#hr-periode-aide").textContent = `Du ${dateCourte(hr.jourChoisi)} au ${dateCourte(fin, true)}, congés hebdomadaires inclus (25.06)${payes < n ? ` · ${payes} jours payés, ${n - payes} sans traitement` : ""}.`;
    }
    $("#hr-tsp-bloc").hidden = $("#hr-tspa-bloc").hidden = !!hr.vue || !t || t === "X";
    { const hq = heuresJour(t, hr.jourChoisi, cibleEdition());
      $("#hr-tspa-aide").textContent = hq ? `Avant le début de mon quart (${hq[0]}) : arrivé plus tôt ou rappelé` : "Arrivé plus tôt ou rappelé avant le début";
      $("#hr-tsp-aide").textContent = hq ? `Après la fin de mon quart (${hq[1]}) : prolongation ou rappel` : "Prolongation ou rappel après la fin"; }
    $("#hr-jour-pris-bloc").hidden = !!hr.vue || t !== "X";
    const sqEdition = estSQ() && cibleEdition() === hr;
    const prevuJour = quartDu(hr.jourChoisi, cibleEdition()).prevu;
    $("#hr-options-quart").hidden = !!hr.vue || !sqEdition || !["J", "S", "N"].includes(t);
    $("#hr-gaind-bloc").hidden = !(["J", "S", "N"].includes(t) && prevuJour === "C");
    $("#hr-dispo-bloc").hidden = !!hr.vue || !sqEdition || !t;
    $("#hr-dispo-champs").hidden = $("#hr-dispo-bloc").hidden || !$("#hr-dispo-actif").checked;
    majValeurDispo();
    // Les heures d'une journée de temps supplémentaire (X) se règlent dans l'onglet Temps supp.
    $("#hr-jour-heures").dataset.tab = t === "X" ? "ts" : "quart";
    $("#hr-jour-ts").dataset.tab = t === "F" ? "quart" : "ts";
    const tsActif = t === "X" || $("#hr-tsp-actif").checked || $("#hr-tspa-actif").checked || $("#hr-dispo-actif").checked;
    $("#hr-onglet-point").hidden = !tsActif;
    const rienTs = ["#hr-dispo-bloc", "#hr-tsp-bloc", "#hr-tspa-bloc", "#hr-jour-pris-bloc", "#hr-ts-valeur"].every((q) => $(q).hidden) && t !== "X";
    $("#hr-ts-vide").hidden = !rienTs;
    $("#hr-ts-vide").textContent = rienTs ? "Choisissez d'abord le quart dans l'onglet Quart. Pour une journée complète de temps supplémentaire, choisissez X · Temps supp." : "";
    $("#hr-tsp-champs").hidden = $("#hr-tsp-bloc").hidden || !$("#hr-tsp-actif").checked;
    $("#hr-tspa-champs").hidden = $("#hr-tspa-bloc").hidden || !$("#hr-tspa-actif").checked;
    $("#hr-jour-ts").hidden = !!hr.vue || !(["X", "F"].includes(t) || !$("#hr-tsp-champs").hidden || !$("#hr-tspa-champs").hidden);
    majValeurJour();
    const prevuJ = quartDu(hr.jourChoisi, cibleEdition()).prevu;
    const h = ["B", "V", "H"].includes(t) ? heuresJour(prevuJ, hr.jourChoisi, { ...cibleEdition(), exceptions: {} }) : heuresJour(t, null, cibleEdition());
    $("#hr-jour-debut").placeholder = h ? h[0] : ""; $("#hr-jour-fin").placeholder = h ? h[1] : "";
    $("#hr-jour-defaut").textContent = h ? ` · par défaut ${h[0]} – ${h[1]}` : "";
  }
  // Onglets de la fiche de la journée : Quart / Temps supp.
  function ongletJour(nom) {
    $("#hr-fiche-jour").dataset.onglet = nom;
    $$("[data-hr-onglet]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hrOnglet === nom)));
    majChampsJour();
  }
  $$("[data-hr-onglet]").forEach((b) => b.addEventListener("click", () => ongletJour(b.dataset.hrOnglet)));
  $("#hr-jour-choix").addEventListener("click", (e) => {
    const b = e.target.closest("[data-q]");
    setTimeout(() => { if (b && b.dataset.q === "X") ongletJour("ts"); else majChampsJour(); }, 0);
  });
  $("#hr-jour-motif").addEventListener("change", () => { hr.motifInitial = $("#hr-jour-motif").value; majChampsJour(); });
  $("#hr-periode").addEventListener("change", () => ($("#hr-periode-extra").disabled = !$("#hr-periode").checked));
  // Valeur estimée d'une journée de temps supplémentaire (membres SQ dont la rémunération est configurée)
  function majValeurJour() {
    majValeurTsp();
    const bloc = $("#hr-ts-valeur"), tq = typeChoisi();
    const actif = !hr.vue && cibleEdition() === hr && tq === "X" && estSQ() && etat.paie && salaireSQ(etat.paie, hr.jourChoisi);
    bloc.hidden = !actif;
    if (!actif) return;
    const sal = salaireSQ(etat.paie, hr.jourChoisi);
    const debut = $("#hr-jour-debut").value || $("#hr-jour-debut").placeholder, fin = $("#hr-jour-fin").value || $("#hr-jour-fin").placeholder;
    const d = debut && fin ? dureeH([debut, fin]) : 0, maj = +$("#hr-jour-maj").value || 1.5, rap = $("#hr-jour-rappel").value;
    const t = eqTS(d, maj, { rappel: rap }), h = t.h;
    $("#hr-ts-montant").innerHTML = d || rap
      ? `<b>${dollarsTS(t.eq * sal.tauxTS)}</b><span>${fmtH(h)} × ${String(maj).replace(".", ",")}${t.repasH ? ` + repas ${fmtH(t.repasH)} (12.08)` : ""} × ${dollarsTS(sal.tauxTS)}/h${h !== d && d ? ` · ${fmtH(d)} arrondies (12.09)` : ""}</span>${t.minimum ? `<small class="tsp-ligne">Minimum garanti appliqué : ${RAPPELS_TS[rap].aide}</small>` : rap ? `<small>${RAPPELS_TS[rap].aide}</small>` : ""}<small>${$("#hr-jour-pris").value === "banque" ? `Compensé : ${fmtH(t.eq)} ajoutées à votre banque de temps` : `Payé sur la paie · en banque, ce serait ${fmtH(t.eq)}`} · estimation</small>`
      : `<span>Indiquez les heures pour voir la valeur estimée.</span>`;
  }
  ["#hr-jour-debut", "#hr-jour-fin", "#hr-jour-maj"].forEach((q) => $(q).addEventListener("input", majValeurJour));
  // Périodes de temps supplémentaire avant et après le quart (préfixes « tspa » et « tsp »)
  function remplirBlocTS(p, d) {
    $(`#hr-${p}-actif`).checked = !!(d && d.debut);
    $(`#hr-${p}-debut`).value = (d && d.debut) || ""; $(`#hr-${p}-fin`).value = (d && d.fin) || "";
    $(`#hr-${p}-maj`).value = String((d && +d.maj) || 1.5);
    $(`#hr-${p}-rappel`).value = d && d.rappel === "hors" ? "hors" : "";
    $(`#hr-${p}-pris`).value = d && d.pris === "banque" ? "banque" : "paie";
  }
  function lireBlocTS(p) {
    if ($(`#hr-${p}-champs`).hidden) return null;
    const td = $(`#hr-${p}-debut`).value, tf = $(`#hr-${p}-fin`).value;
    if (!td || !tf) return false;
    return { debut: td, fin: tf, ...($(`#hr-${p}-maj`).value === "2" ? { maj: 2 } : {}), ...($(`#hr-${p}-pris`).value === "banque" ? { pris: "banque" } : {}), ...($(`#hr-${p}-rappel`).value ? { rappel: $(`#hr-${p}-rappel`).value } : {}) };
  }
  ["tspa", "tsp"].forEach((p) => {
    $(`#hr-${p}-actif`).addEventListener("change", () => {
      const h = heuresJour(typeChoisi(), hr.jourChoisi, cibleEdition());
      if ($(`#hr-${p}-actif`).checked && h) { // suggestion : collé au début ou à la fin du quart
        if (p === "tsp" && !$("#hr-tsp-debut").value) $("#hr-tsp-debut").value = $("#hr-jour-fin").value || h[1];
        if (p === "tspa" && !$("#hr-tspa-fin").value) $("#hr-tspa-fin").value = $("#hr-jour-debut").value || h[0];
      }
      majChampsJour();
    });
    [`#hr-${p}-debut`, `#hr-${p}-fin`, `#hr-${p}-maj`, `#hr-${p}-pris`, `#hr-${p}-rappel`].forEach((q) => $(q).addEventListener("input", () => majValeurBlocTS(p)));
  });
  function majValeurBlocTS(p) {
    const out = $(`#hr-${p}-montant`);
    const actif = !$(`#hr-${p}-champs`).hidden && cibleEdition() === hr && estSQ() && etat.paie && salaireSQ(etat.paie, hr.jourChoisi);
    const deb = $(`#hr-${p}-debut`).value, fin = $(`#hr-${p}-fin`).value;
    out.hidden = !actif || !deb || !fin;
    if (out.hidden) return;
    const sal = salaireSQ(etat.paie, hr.jourChoisi), d = dureeH([deb, fin]), maj = +$(`#hr-${p}-maj`).value || 1.5, rap = $(`#hr-${p}-rappel`).value;
    const t = eqTS(d, maj, { rappel: rap, adjacent: !rap }), h = t.h;
    out.innerHTML = `<b>${dollarsTS(t.eq * sal.tauxTS + t.indemnite)}</b><span>${fmtH(h)} × ${String(maj).replace(".", ",")}${t.repasH ? ` + repas ${fmtH(t.repasH)} (12.08)` : ""} × ${dollarsTS(sal.tauxTS)}/h${h !== d ? ` · ${fmtH(d)} arrondies (12.09)` : ""}${t.indemnite ? ` + ${dollarsTS(t.indemnite)} d'indemnité de repas` : ""}</span>${t.minimum ? `<small class="tsp-ligne">Minimum garanti appliqué : ${RAPPELS_TS[rap].aide}</small>` : ""}<small>${$(`#hr-${p}-pris`).value === "banque" ? `Compensé : ${fmtH(t.eq)} ajoutées à votre banque de temps` : `Payé sur la paie · en banque, ce serait ${fmtH(t.eq)}`} · estimation</small>`;
  }
  function majValeurTsp() { majValeurBlocTS("tsp"); majValeurBlocTS("tspa"); }
  function majValeurDispo() {
    const out = $("#hr-dispo-montant");
    const h = +$("#hr-dispo-h").value, actif = !$("#hr-dispo-champs").hidden && h > 0 && etat.paie && salaireSQ(etat.paie, hr.jourChoisi);
    out.hidden = !actif;
    if (!actif) return;
    const ratio = { domicile: 4, hebergement: 3, reguliere: 8 }[$("#hr-dispo-type").value], sal = salaireSQ(etat.paie, hr.jourChoisi);
    out.innerHTML = `<b>${dollarsTS(h / ratio * sal.tauxRegulier)}</b><span>${fmtH(h)} ÷ ${ratio} = ${fmtH(h / ratio)} au taux régulier (${dollarsTS(sal.tauxRegulier)}/h)</span><small>Si vous êtes rappelé pendant la disponibilité, les minimums de rappel ne s'appliquent pas (13.03).</small>`;
  }
  $("#hr-dispo-actif").addEventListener("change", majChampsJour);
  ["#hr-dispo-type", "#hr-dispo-h"].forEach((q) => $(q).addEventListener("input", majValeurDispo));
  $("#hr-jour-rappel").addEventListener("input", () => { if ($("#hr-jour-rappel").value === "vacances") $("#hr-jour-maj").value = "2"; majValeurJour(); });
  $("#hr-jour-pris").addEventListener("input", () => majValeurJour());
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
    const tsp = lireBlocTS("tsp"), tspAvant = lireBlocTS("tspa");
    if (tsp === false || tspAvant === false) return toast("Indiquez le début et la fin du temps supplémentaire");
    const avant = cible.exceptions[iso], sauvegarde = { ...cible.exceptions };
    const options = (!$("#hr-options-quart").hidden && ($("#hr-repasnp").checked || $("#hr-remplace").value)) || (!$("#hr-dispo-champs").hidden && +$("#hr-dispo-h").value > 0);
    if (type === quartDu(iso, cible).prevu && !note && !debut && !Object.keys(ts).length && !tsp && !tspAvant && !options) delete cible.exceptions[iso];
    else cible.exceptions[iso] = { type, note, ...(debut ? { debut, fin } : {}), ...(Object.keys(ts).length ? { ts } : {}), ...(type === "X" && $("#hr-jour-maj").value === "2" ? { maj: 2 } : {}), ...(type === "X" && $("#hr-jour-pris").value === "banque" ? { pris: "banque" } : {}), ...(tsp ? { tsp } : {}), ...(tspAvant ? { tspAvant } : {}), ...(MOTIFS[type] ? { motif: $("#hr-jour-motif").value } : {}),
      ...(type === "X" && $("#hr-jour-rappel").value ? { rappel: $("#hr-jour-rappel").value } : {}),
      ...(!$("#hr-options-quart").hidden && $("#hr-repasnp").checked ? { repasNP: true } : {}),
      ...(!$("#hr-options-quart").hidden && !$("#hr-gaind-bloc").hidden && $("#hr-gaind").checked ? { gainD: true } : {}),
      ...(!$("#hr-options-quart").hidden && $("#hr-remplace").value ? { remplace: $("#hr-remplace").value } : {}),
      ...(!$("#hr-dispo-champs").hidden && +$("#hr-dispo-h").value > 0 ? { dispo: { type: $("#hr-dispo-type").value, h: Math.min(24, +$("#hr-dispo-h").value) } } : {}) };
    // Congé de plusieurs jours : inscrire chaque journée de la période
    let nbJours = 1, sautes = 0;
    const cleMotif = MOTIFS[type] ? `${type}:${$("#hr-jour-motif").value}` : "";
    if (cleMotif && DUREES_MOTIF[cleMotif] && !$("#hr-periode-bloc").hidden && $("#hr-periode").checked) {
      const [n, payes] = DUREES_MOTIF[cleMotif];
      const extra = cleMotif === "E:deces-parent" && $("#hr-periode-extra").checked ? 2 : 0;
      for (let i = 1; i < n + extra; i++) {
        const j = isoPlus(iso, i), deja = sauvegarde[j];
        if (deja && deja.type !== type && deja.type !== "U") { sautes++; continue; } // ne pas écraser une journée déjà modifiée (TS, cour…)
        cible.exceptions[j] = i < payes ? { type, note: "", motif: $("#hr-jour-motif").value } : { type: "U", note: "", motif: "evenement" };
      }
      nbJours = n + extra;
    }
    try { await sauverHoraire(); fermerJour(); rendreHoraire(); toast(nbJours > 1 ? `${nbJours - sautes} journées inscrites à l'horaire${sautes ? ` · ${sautes} journée${sautes > 1 ? "s" : ""} déjà modifiée${sautes > 1 ? "s" : ""} laissée${sautes > 1 ? "s" : ""} telle${sautes > 1 ? "s" : ""} quelle${sautes > 1 ? "s" : ""}` : ""}` : "Journée mise à jour"); }
    catch (e) { cible.exceptions = sauvegarde; toast(traduireErreur(e)); }
  });
  $("#hr-jour-retirer").addEventListener("click", async () => {
    const iso = hr.jourChoisi, cible = cibleEdition(), avant = cible.exceptions[iso];
    delete cible.exceptions[iso];
    try { await sauverHoraire(); fermerJour(); rendreHoraire(); toast("Retour à la rotation"); }
    catch (e) { cible.exceptions[iso] = avant; toast(traduireErreur(e)); }
  });

  // Calendrier abonné (lien webcal secret, révocable) : fonction serveur « calendrier »
  const urlCalendrier = (j) => `${C.supabaseUrl}/functions/v1/calendrier?j=${j}`;
  async function rendreAbonnement(creer) {
    const el = $("#hr-abo-contenu");
    let jeton = null;
    if (creer) {
      const { data, error } = await sb.rpc("calendrier_lien", { p_nouveau: creer === "nouveau" });
      if (error) { el.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
      jeton = data;
    } else {
      const { data: actif } = await sb.rpc("calendrier_lien_etat");
      if (actif) { const { data } = await sb.rpc("calendrier_lien", { p_nouveau: false }); jeton = data; }
    }
    if (!jeton) {
      el.innerHTML = `<button type="button" class="btn-principal" id="hr-abo-creer" style="margin:0">Créer mon lien d'abonnement</button>`;
      $("#hr-abo-creer").addEventListener("click", () => rendreAbonnement("oui"));
      return;
    }
    const https = urlCalendrier(jeton), webcal = https.replace(/^https:/, "webcal:");
    const google = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal);
    el.innerHTML = `<div class="hr-abo-boutons">
        <a class="btn-principal" href="${esc(webcal)}" style="margin:0">Ajouter au Calendrier (iPhone, Mac, Outlook)</a>
        <a class="btn-secondaire" href="${esc(google)}" target="_blank" rel="noopener">Ajouter à Google Agenda</a>
        <button type="button" class="btn-secondaire" id="hr-abo-copier">Copier le lien</button>
      </div>
      <div class="fc-ligne"><button type="button" class="lien" id="hr-abo-nouveau">Créer un nouveau lien</button><button type="button" class="lien rouge" id="hr-abo-retirer">Désactiver le lien</button></div>`;
    $("#hr-abo-copier").addEventListener("click", () => copier(https));
    const nouv = $("#hr-abo-nouveau");
    nouv.addEventListener("click", () => {
      if (!nouv.dataset.arme) { nouv.dataset.arme = "1"; nouv.textContent = "Confirmer : l'ancien lien cessera de fonctionner"; return; }
      rendreAbonnement("nouveau").then(() => toast("Nouveau lien créé. Abonnez-vous de nouveau avec celui-ci."));
    });
    const ret = $("#hr-abo-retirer");
    ret.addEventListener("click", async () => {
      if (!ret.dataset.arme) { ret.dataset.arme = "1"; ret.textContent = "Confirmer la désactivation"; return; }
      const { error } = await sb.rpc("calendrier_lien_retirer");
      if (error) return toast(traduireErreur(error));
      toast("Lien désactivé"); rendreAbonnement(false);
    });
  }
  $("#hr-abo-btn").addEventListener("click", () => {
    const p = $("#hr-abo"), ouvrir = p.hidden;
    p.hidden = !ouvrir; $("#hr-abo-btn").setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) { rendreAbonnement(false); p.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
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

  async function lienInvitation() {
    const { data, error } = await sb.rpc("mon_invitation");
    if (error) { toast(traduireErreur(error)); return null; }
    return `https://policemanagement.ca/?invitation=${data}`;
  }
  $("#mc-inv-partager").addEventListener("click", async () => {
    const url = await lienInvitation(); if (!url) return;
    const texte = "Je t'invite sur Police Management, l'outil de poche des policiers du Québec (horaire, paie, lois, carte). Ta demande d'accès sera vérifiée par l'administrateur.";
    if (navigator.share) { try { await navigator.share({ title: "Police Management", text: texte, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(`${texte} ${url}`); toast("Lien copié. Collez-le dans un message à votre collègue."); } catch { $("#mc-inv-etat").textContent = url; }
  });
  $("#mc-inv-copier").addEventListener("click", async () => {
    const url = await lienInvitation(); if (!url) return;
    try { await navigator.clipboard.writeText(url); toast("Lien d'invitation copié."); } catch { $("#mc-inv-etat").textContent = url; }
  });
  async function initCompte() {
    const p = etat.profil;
    initPaieReglages();
    chargerEvenements().then(rendreMesEcheances).catch(() => {});
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
  // Frais judiciaires inclus au constat (C-25.1, r. 6, art. 1, par. 7°, indexés au 1er janvier 2026)
  function fraisJudiciaires(amende) {
    return amende <= 0 ? 0 : amende <= 10 ? 7 : amende < 50 ? 16 : amende < 100 ? 33 : amende < 150 ? 59 : amende < 300 ? 86 : amende < 600 ? 172 : amende < 1500 ? 343
      : amende <= 10000 ? Math.round(amende * 0.25) : 2500 + Math.round((amende - 10000) * 0.01);
  }
  // Moins de 18 ans (C-25.1, r. 3, art. 2, par. 6°) : null au-delà de 750 $
  const fraisMineur = (amende) => (amende <= 0 ? 0 : amende <= 10 ? 7 : amende < 50 ? 16 : amende <= 750 ? 23 : null);
  // Contribution pénale (art. 8.1 C.p.p.)
  function contributionPenale(amende) {
    return amende <= 0 ? 0 : amende <= 100 ? 28 : amende <= 300 ? 52 : amende <= 500 ? 75 : Math.round(amende * 0.25);
  }
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
    const frais = fraisJudiciaires(amende);
    const contribution = contributionPenale(amende);
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
  /* Frais et contribution selon le montant de l'amende */
  const fr = { age: "adulte", pret: false };
  function initFrais() {
    if (!fr.pret) {
      fr.pret = true;
      $("#fr-amende").addEventListener("input", rendreFraisCalcul);
      $$("[data-fr-age]").forEach((b) => b.addEventListener("click", () => { fr.age = b.dataset.frAge; $$("[data-fr-age]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); rendreFraisCalcul(); }));
      const tranches = [["10 $ ou moins", 10], ["11 $ à 49 $", 49], ["50 $ à 99 $", 99], ["100 $ à 149 $", 149], ["150 $ à 299 $", 299], ["300 $ à 599 $", 599], ["600 $ à 1 499 $", 1499], ["1 500 $ à 10 000 $", null], ["Plus de 10 000 $", null]];
      $("#fr-table-frais").innerHTML = `<thead><tr><th>Amende</th><th>18 ans et plus</th><th>Moins de 18 ans</th></tr></thead><tbody>${tranches.map(([t, a], i) => {
        const adulte = a !== null ? dollars(fraisJudiciaires(a)) : i === 7 ? "25 % de l'amende" : "2 500 $ + 1 % de l'excédent de 10 000 $";
        const mineur = i <= 1 ? dollars(fraisMineur(a)) : i <= 6 ? "23 $" + (i === 6 ? " (jusqu'à 750 $)" : "") : "—";
        return `<tr><td>${t}</td><td><b>${adulte}</b></td><td>${mineur}</td></tr>`;
      }).join("")}</tbody>`;
      $("#fr-table-contrib").innerHTML = `<thead><tr><th>Amende</th><th>Contribution pénale</th></tr></thead><tbody>
        <tr><td>100 $ ou moins</td><td><b>28 $</b></td></tr><tr><td>101 $ à 300 $</td><td><b>52 $</b></td></tr>
        <tr><td>301 $ à 500 $</td><td><b>75 $</b></td></tr><tr><td>501 $ et plus</td><td><b>25 % de l'amende</b></td></tr></tbody>`;
      const courantes = [50, 75, 100, 150, 200, 250, 300, 350, 500, 750, 1000, 1500, 2000, 3000];
      $("#fr-table-total").innerHTML = `<thead><tr><th>Amende</th><th>Frais</th><th>Contrib.</th><th>Total</th></tr></thead><tbody>${courantes.map((a) => {
        const f = fraisJudiciaires(a), c = contributionPenale(a);
        return `<tr data-fr="${a}"><td>${dollars(a)}</td><td>${dollars(f)}</td><td>${dollars(c)}</td><td><b>${dollars(a + f + c)}</b></td></tr>`;
      }).join("")}</tbody>`;
      $$("#fr-table-total tbody tr").forEach((tr) => tr.addEventListener("click", () => { $("#fr-amende").value = tr.dataset.fr; rendreFraisCalcul(); $("#fr-amende").scrollIntoView({ behavior: "smooth", block: "center" }); }));
    }
    rendreFraisCalcul();
  }
  function rendreFraisCalcul() {
    const a = Math.max(0, Math.min(100000, Math.round(+$("#fr-amende").value || 0)));
    const mineur = fr.age === "mineur";
    let f = mineur ? fraisMineur(a) : fraisJudiciaires(a);
    const c = contributionPenale(a);
    if (mineur && f === null) {
      $("#fr-resultat").innerHTML = `<p class="message">Pour une personne de moins de 18 ans, le règlement prévoit des frais seulement pour une amende de 750 $ ou moins.</p>`;
      return;
    }
    let total = a + f + c;
    $("#fr-resultat").innerHTML = a <= 0 ? `<p class="aide">Inscrivez le montant de l'amende inscrit au constat.</p>` : `<dl class="vt-detail frais-detail">
      <dt>Amende</dt><dd>${dollars(a)}</dd>
      <dt>Frais judiciaires</dt><dd>${dollars(f)}</dd>
      <dt>Contribution pénale</dt><dd>${dollars(c)}</dd>
      <dt class="total">Total à payer</dt><dd class="total">${dollars(total)}</dd></dl>
      ${mineur ? `<p class="aide">Moins de 18 ans : les frais totaux sont plafonnés à 100 $. La contribution pénale indiquée est celle de l'art. 8.1 C.p.p.; vérifiez son application au dossier.</p>` : ""}`;
    $$("#fr-table-total tbody tr").forEach((tr) => tr.classList.toggle("choisie", +tr.dataset.fr === a));
  }
  function ongletLois(nom) {
    $$("[data-csr-onglet]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.csrOnglet === nom)));
    $("#csr-constats").hidden = nom !== "constats";
    if (nom === "constats") initConstats();
    $("#csr-vitesse").hidden = nom !== "vitesse";
    $("#csr-articles").hidden = nom !== "articles";
    $("#csr-favoris").hidden = nom !== "favoris";
    $("#csr-frais").hidden = nom !== "frais";
    if (nom === "frais") initFrais();
    if (nom === "vitesse") initVitesse();
    if (nom === "favoris") rendreFavoris();
  }
  $$("[data-csr-onglet]").forEach((b) => b.addEventListener("click", () => ongletLois(b.dataset.csrOnglet)));

  /* ---------------- Registre des constats d'infraction (app iPhone et iPad seulement) ----------------
     Stocké par l'app, sur l'appareil seulement (Registre.swift) : fichier chiffré par iOS, exclu des sauvegardes,
     ouvert avec Face ID. Rien n'est envoyé à Supabase. Sur le site web, l'onglet n'apparaît pas. */
  const pontNatifRegistre = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.registre;
  // Mode test (administrateur seulement, sans l'app à jour) : même fonctionnement, mais le registre est gardé
  // dans le stockage de ce navigateur, sur cet appareil. Rien n'est envoyé au serveur. Pas de Face ID.
  const registreTest = (() => {
    let ouvert = false;
    const cle = (compte) => "pm-constats-test-" + compte;
    return { postMessage: async (m) => {
      if (m.action === "etat") return { disponible: true, deverrouille: ouvert };
      if (m.action === "deverrouiller") { ouvert = true; return true; }
      if (m.action === "verrouiller") { ouvert = false; return true; }
      if (!ouvert) throw new Error("verrouille");
      if (!/^[0-9a-f-]{36}$/.test(m.compte || "")) throw new Error("compte invalide");
      try {
        if (m.action === "lire") return localStorage.getItem(cle(m.compte)) || "[]";
        if (m.action === "ecrire") { localStorage.setItem(cle(m.compte), m.donnees); return true; }
        if (m.action === "effacer") { localStorage.removeItem(cle(m.compte)); return true; }
      } catch { throw new Error("Stockage du navigateur indisponible."); }
      throw new Error("action inconnue");
    } };
  })();
  const estAdminRegistre = () => !!(etat.profil && etat.profil.role === "admin");
  const modeTestRegistre = () => !pontNatifRegistre && estAdminRegistre();
  let pontRegistre = pontNatifRegistre;
  const ct = { liste: [], ouvert: false, edition: null, type: "100400", lat: null, lon: null };
  function majOngletConstats() {
    pontRegistre = pontNatifRegistre || (estAdminRegistre() ? registreTest : null);
    $("#csr-onglet-constats").hidden = !(estAppIOS || estAdminRegistre());
    $("#ct-test").hidden = !modeTestRegistre();
    $("#ct-avis").hidden = modeTestRegistre();
  }
  const compteRegistre = () => (etat.profil && etat.profil.id) || (etat.session && etat.session.user && etat.session.user.id) || "";
  async function appelRegistre(action, extra = {}) {
    return pontRegistre.postMessage({ action, compte: compteRegistre(), ...extra });
  }
  async function initConstats() {
    majOngletConstats();
    $("#ct-maj").hidden = !!pontRegistre;
    if (!pontRegistre) { $("#ct-verrou").hidden = true; $("#ct-registre").hidden = true; return; }
    try {
      const e = await appelRegistre("etat");
      ct.ouvert = !!(e && e.deverrouille);
    } catch { ct.ouvert = false; }
    if (ct.ouvert) await lireConstats(); else afficherVerrouConstats();
  }
  function afficherVerrouConstats() { ct.ouvert = false; ct.liste = []; $("#ct-verrou").hidden = false; $("#ct-registre").hidden = true; }
  async function ouvrirConstats() {
    try { await appelRegistre("deverrouiller"); ct.ouvert = true; await lireConstats(); }
    catch (e) { const m = String((e && e.message) || e); if (!/annule/.test(m)) toast(m.replace(/^Error:\s*/, "")); afficherVerrouConstats(); }
  }
  async function lireConstats() {
    try {
      const t = await appelRegistre("lire");
      const l = JSON.parse(t || "[]");
      ct.liste = Array.isArray(l) ? l : [];
      $("#ct-verrou").hidden = true; $("#ct-registre").hidden = false;
      rendreConstats();
    } catch (e) {
      if (/verrouille/.test(String(e && e.message || e))) return afficherVerrouConstats();
      toast("Lecture du registre impossible.");
    }
  }
  async function sauverConstats() {
    try { await appelRegistre("ecrire", { donnees: JSON.stringify(ct.liste) }); return true; }
    catch (e) {
      if (/verrouille/.test(String(e && e.message || e))) { afficherVerrouConstats(); toast("Le registre s'est verrouillé. Déverrouillez-le, puis recommencez."); return false; }
      toast("Enregistrement impossible sur cet appareil."); return false;
    }
  }
  const dateConstat = (d) => { try { return new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }); } catch { return d; } };
  function rendreConstats() {
    const q = norm($("#ct-q").value.trim());
    const tries = [...ct.liste].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const liste = q ? tries.filter((c) => norm([c.numero, c.article, "art " + c.article, c.lieu, c.narration, c.type].join(" ")).includes(q)) : tries;
    $("#ct-compte").textContent = ct.liste.length ? (q ? `${liste.length} résultat${liste.length > 1 ? "s" : ""} sur ${ct.liste.length}` : `${ct.liste.length} constat${ct.liste.length > 1 ? "s" : ""} sur cet appareil`) : "";
    $("#ct-liste").innerHTML = liste.length ? liste.map((c) => `
      <article class="panneau ct-item" data-ct="${esc(c.id)}">
        <button type="button" class="ct-tete" data-ct-ouvrir="${esc(c.id)}" aria-expanded="false">
          <span class="ct-num">${esc(c.numero)}</span>
          <span class="ct-art">CSR art. ${esc(c.article)}</span>
          <small>${esc(dateConstat(c.date))} · ${c.type === "100391" ? "Municipal" : "National"}${c.lieu ? " · " + esc(c.lieu.slice(0, 60)) : ""}</small>
        </button>
        <div class="ct-detail" hidden>
          ${c.lieu ? `<p><b>Emplacement</b><br>${esc(c.lieu)}</p>` : ""}
          ${c.lat != null ? `<p class="aide">GPS : ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</p>` : ""}
          ${c.narration ? `<p><b>Narration</b></p><p class="ct-narr">${esc(c.narration)}</p>` : `<p class="aide">Aucune narration.</p>`}
          <div class="ct-actions">
            ${c.narration ? `<button type="button" class="btn-principal" data-ct-copier="${esc(c.id)}">Copier la narration</button>` : ""}
            <button type="button" class="btn-secondaire" data-ct-article="${esc(c.article)}">Voir l'article</button>
            ${c.lat != null ? `<button type="button" class="btn-secondaire" data-ct-carte="${esc(c.id)}">Sur la carte</button>` : ""}
            <button type="button" class="btn-secondaire" data-ct-modifier="${esc(c.id)}">Modifier</button>
          </div>
        </div>
      </article>`).join("")
      : `<p class="vide">${ct.liste.length ? "Aucun constat ne correspond à cette recherche." : "Aucun constat. Touchez « + Nouveau » pour inscrire votre premier constat."}</p>`;
    const trouve = (id) => ct.liste.find((x) => x.id === id);
    $$("[data-ct-ouvrir]").forEach((b) => b.addEventListener("click", () => {
      const d = b.nextElementSibling, ouvrir = d.hidden;
      d.hidden = !ouvrir; b.setAttribute("aria-expanded", String(ouvrir));
    }));
    $$("[data-ct-copier]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(trouve(b.dataset.ctCopier).narration); toast("Narration copiée."); }
      catch { toast("Copie impossible sur cet appareil."); }
    }));
    $$("[data-ct-article]").forEach((b) => b.addEventListener("click", () => ouvrirFavori("csr", b.dataset.ctArticle)));
    $$("[data-ct-modifier]").forEach((b) => b.addEventListener("click", () => editerConstat(trouve(b.dataset.ctModifier))));
    $$("[data-ct-carte]").forEach((b) => b.addEventListener("click", () => {
      const c = trouve(b.dataset.ctCarte);
      afficherVue("carte");
      setTimeout(() => etat.placer && etat.placer(c.lat, c.lon, "Constat " + c.numero, 16), 500);
    }));
    // Une seule correspondance exacte au numéro : on l'ouvre directement
    if (q && liste.length === 1 && norm(liste[0].numero) === q) { const b = $(`[data-ct-ouvrir="${CSS.escape(liste[0].id)}"]`); if (b && b.nextElementSibling.hidden) b.click(); }
  }
  /* Lecture d'une photo de constat : on garde seulement le numéro, le type, la date, l'article et le lieu.
     Tout le reste (nom, adresse, date de naissance, permis, plaque) est ignoré et n'est jamais conservé. */
  const MOIS_FR = { janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
  const PERSONNEL = /(naissance|\bne\b|\bnee\b|ddn|defendeur|adresse|domicile|permis|plaque|immatricul|telephone|\btel\b|courriel|nom\b|prenom|sexe|taille|yeux|proprietaire|code postal)/;
  function rangeesTexte(lignes) {
    // Regroupe les morceaux de texte d'une même rangée (même hauteur sur la photo), de haut en bas
    const tri = [...lignes].filter((l) => l && l.t && l.t.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
    const rangees = [];
    for (const l of tri) {
      const r = rangees.find((x) => Math.abs(x.y - l.y) < Math.max(0.006, (l.h || 0.01) * 0.5));
      if (r) r.morceaux.push(l); else rangees.push({ y: l.y, morceaux: [l] });
    }
    return rangees.map((r) => r.morceaux.sort((a, b) => a.x - b.x).map((m) => m.t.trim()).join("  "));
  }
  function dateValide(a, m, j) { const d = new Date(a, m - 1, j); return a >= 2000 && a <= 2100 && d.getMonth() === m - 1 && d.getDate() === j; }
  function trouverDate(t) {
    let m;
    if ((m = t.match(/\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/)) && dateValide(+m[1], +m[2], +m[3])) return [+m[1], +m[2], +m[3]];
    if ((m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d)\b/)) && dateValide(+m[3], +m[2], +m[1])) return [+m[3], +m[2], +m[1]];
    if ((m = normIA(t).match(/\b(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(20\d\d)\b/)) && MOIS_FR[m[2]] && dateValide(+m[3], MOIS_FR[m[2]], +m[1])) return [+m[3], MOIS_FR[m[2]], +m[1]];
    return null;
  }
  function trouverHeure(t) { const m = t.match(/\b([01]?\d|2[0-3])\s?[:hH]\s?([0-5]\d)\b/); return m ? [+m[1], +m[2]] : null; }
  function analyserConstat(lignes, articlesConnus) {
    const rangees = rangeesTexte(lignes);
    const res = {};
    const n = (t) => normIA(t);
    const deux = (x) => String(x).padStart(2, "0");
    // Type : 100400 (national, BIA) ou 100391 (municipal)
    const tout = n(rangees.join(" \n "));
    if (/100\s?391|cour municipale|\bmunicipal\b/.test(tout) && !/100\s?400/.test(tout)) res.type = "100391";
    else if (/100\s?400|\bnational\b|bureau des infractions/.test(tout)) res.type = "100400";
    // Numéro du constat : d'abord près d'une étiquette, sinon le plus long code chiffré plausible
    const candidat = (t) => (t.match(/\b[A-Z]{0,3}\s?\d[\d\s-]{5,18}\d\b/g) || []).map((x) => x.replace(/[\s-]/g, "")).filter((x) => x.length >= 7 && x.length <= 16 && !/^100(400|391)$/.test(x) && !/^(20\d\d)(0[1-9]|1[0-2])\d\d$/.test(x));
    for (let i = 0; i < rangees.length && !res.numero; i++) {
      const r = n(rangees[i]);
      if (/(constat|n[o°]\s*d[eu]\s*constat|numero du constat|no\s*constat|constat\s*#)/.test(r) && !PERSONNEL.test(r)) {
        const apres = rangees[i].replace(/^.*?(constat\s*(#|n[o°]|no\.?|num[ée]ro)?\s*:?)/i, "");
        const c = candidat(apres).concat(candidat(rangees[i + 1] || ""));
        if (c.length) res.numero = c[0];
      }
    }
    if (!res.numero) {
      const tous = rangees.filter((r) => !PERSONNEL.test(n(r))).flatMap(candidat).filter((x) => !/^\d{10}$/.test(x)); // pas un numéro de téléphone
      tous.sort((a, b) => b.length - a.length);
      if (tous.length) { res.numero = tous[0]; res.numeroIncertain = true; }
    }
    // Date et heure de l'infraction (jamais la date de naissance)
    for (const r of rangees) {
      const rn = n(r);
      if (/naissance|ddn|\bne le\b|\bnee le\b|echeance|expir/.test(rn)) continue;
      const d = trouverDate(r);
      if (d && !res.date) { res.date = `${d[0]}-${deux(d[1])}-${deux(d[2])}`; const h = trouverHeure(r.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]20\d\d\b|\b20\d\d[-/.]\d{1,2}[-/.]\d{1,2}\b/, "")); if (h) res.heure = `${deux(h[0])}:${deux(h[1])}`; }
      if (!res.heure && /(heure|\bvers\b|\ba\s+\d{1,2}\s?h)/.test(rn)) { const h = trouverHeure(r); if (h) res.heure = `${deux(h[0])}:${deux(h[1])}`; }
    }
    // Article : « art. 443.1 », « article 328 », « CSR 396 »; vérifié dans le CSR de l'app quand c'est possible
    const articles = [];
    rangees.forEach((r) => {
      for (const m of r.matchAll(/\b(?:art(?:icle)?s?\.?|a\.|c\.?\s?s\.?\s?r\.?|csr)\s*:?\s*(\d{1,4}(?:\.\d{1,2})?)(?:\s*(?:al(?:inea)?\.?|para(?:graphe)?\.?|par\.)\s*\d{1,2})?/gi)) {
        const no = m[1];
        articles.push({ no, connu: !!(articlesConnus && articlesConnus.has(no)), csr: /c\.?\s?s\.?\s?r|securite routiere/i.test(r) });
      }
    });
    articles.sort((a, b) => (b.connu - a.connu) || (b.csr - a.csr));
    if (articles.length) { res.article = articles[0].no; res.articleIncertain = !articles[0].connu; }
    // Lieu de l'infraction : rangée étiquetée « lieu », « endroit », « à la hauteur de »… (jamais l'adresse du défendeur)
    for (let i = 0; i < rangees.length; i++) {
      const rn = n(rangees[i]);
      if (PERSONNEL.test(rn)) continue;
      if (/(lieu|endroit|a la hauteur|intersection|localisation|emplacement)/.test(rn)) {
        let v = rangees[i].replace(/^.*?(lieu de l['’]infraction|lieu|endroit|localisation|emplacement)\s*:?\s*/i, "").trim();
        if (v.length < 4 && rangees[i + 1] && !PERSONNEL.test(n(rangees[i + 1]))) v = rangees[i + 1].trim();
        if (v.length >= 4) { res.lieu = v; break; }
      }
    }
    const muni = rangees.find((r) => /^\s*(municipalite|ville)\b/.test(n(r)) && !PERSONNEL.test(n(r)));
    if (muni) { const v = muni.replace(/^\s*(municipalit[ée]|ville)\s*:?\s*/i, "").trim(); if (v && (!res.lieu || !n(res.lieu).includes(n(v)))) res.lieu = res.lieu ? `${res.lieu}, ${v}` : v; }
    return res;
  }

  // Prépare la photo : bonne orientation, réduite à 2200 px (assez pour lire, plus léger)
  async function preparerPhoto(fichier) {
    const bmp = await createImageBitmap(fichier);
    const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return c;
  }
  // Lecture du texte, sur l'appareil : Vision d'Apple dans l'app, sinon Tesseract dans le navigateur (mode test)
  async function lireTextePhoto(canvas, natifPermis = true) {
    if (natifPermis && pontNatifRegistre) {
      const b64 = canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
      return await appelRegistre("lireTexte", { image: b64 });
    }
    if (!window.Tesseract) {
      await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = ok; s.onerror = () => ko(new Error("Le module de lecture n'a pas pu être chargé.")); document.head.appendChild(s); });
    }
    // Le moteur peut échouer sans rejeter sa promesse (téléchargement bloqué) : délai maximal et gestion d'erreur
    let w = null, echec;
    const erreur = new Promise((_, ko) => { echec = ko; setTimeout(() => ko(new Error("délai dépassé")), 90000); });
    try {
      w = await Promise.race([window.Tesseract.createWorker("fra", 1, { errorHandler: (e) => echec(new Error(String((e && e.message) || e))) }), erreur]);
      const { data } = await Promise.race([w.recognize(canvas), erreur]);
      return (data.lines || []).map((l) => ({ t: l.text, x: l.bbox.x0 / canvas.width, y: l.bbox.y0 / canvas.height, w: (l.bbox.x1 - l.bbox.x0) / canvas.width, h: (l.bbox.y1 - l.bbox.y0) / canvas.height }));
    } finally { if (w) w.terminate().catch(() => {}); }
  }
  function marquerAuto(id, valeur) {
    const el = $(id);
    if (!valeur || el.value.trim()) return false;
    el.value = valeur; el.classList.add("ct-auto");
    el.addEventListener("input", () => el.classList.remove("ct-auto"), { once: true });
    return true;
  }
  $("#ct-photo").addEventListener("click", () => $("#ct-photo-fichier").click());
  $("#ct-photo-fichier").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const etatP = $("#ct-photo-etat"), btn = $("#ct-photo");
    btn.disabled = true; etatP.textContent = pontNatifRegistre ? "Lecture de la photo…" : "Lecture de la photo… (la première fois, le module de lecture se télécharge : quelques secondes)";
    let canvas = null, lignes = null;
    try {
      await remplirArticlesCsr();
      canvas = await preparerPhoto(f);
      lignes = await lireTextePhoto(canvas);
      const r = analyserConstat(lignes || [], articlesCsr);
      const trouves = [];
      if (marquerAuto("#ct-numero", r.numero)) trouves.push("numéro" + (r.numeroIncertain ? " (à confirmer)" : ""));
      if (r.type) { choisirTypeConstat(r.type); trouves.push("type"); }
      if (r.date) { const v = r.date + "T" + (r.heure || "00:00"); $("#ct-date").value = v; $("#ct-date").classList.add("ct-auto"); trouves.push(r.heure ? "date et heure" : "date"); }
      if (marquerAuto("#ct-article", r.article)) { majArticleConstat(); trouves.push("article" + (r.articleIncertain ? " (à confirmer)" : "")); }
      if (marquerAuto("#ct-lieu", r.lieu)) trouves.push("lieu");
      etatP.textContent = trouves.length ? `Lu sur l'appareil : ${trouves.join(", ")}. Vérifiez chaque champ surligné avant d'enregistrer. La photo n'a pas été conservée.` : "Aucune information reconnue. Reprenez la photo bien à plat, avec un bon éclairage, ou remplissez les champs à la main.";
    } catch (err) {
      etatP.textContent = "Lecture impossible : " + String((err && err.message) || err).replace(/^Error:\s*/, "") + ". Remplissez les champs à la main.";
    } finally {
      // On oublie la photo et le texte lu : seuls les champs du formulaire restent
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      lignes = null;
      btn.disabled = false;
    }
  });
  let articlesCsr = null;
  async function remplirArticlesCsr() {
    if (articlesCsr) return;
    try {
      const d = await charger("csr.json");
      articlesCsr = new Map(d.map((a) => [String(a.numero), a]));
      $("#ct-articles").innerHTML = d.map((a) => `<option value="${esc(a.numero)}"></option>`).join("");
    } catch { articlesCsr = new Map(); }
  }
  function majArticleConstat() {
    const no = $("#ct-article").value.trim().replace(/^art\.?\s*/i, "");
    const a = articlesCsr && articlesCsr.get(no);
    $("#ct-article-texte").textContent = a ? (a.texte || "").replace(/\s+/g, " ").slice(0, 160) + ((a.texte || "").length > 160 ? "…" : "") : no ? "Article introuvable dans le CSR de l'app : vérifiez le numéro." : "";
  }
  function choisirTypeConstat(t) { ct.type = t; $$("[data-ct-type]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.ctType === t))); }
  function majCoordConstat() { $("#ct-coord").textContent = ct.lat != null ? `${ct.lat.toFixed(5)}, ${ct.lon.toFixed(5)}` : ""; $("#ct-position").textContent = ct.lat != null ? "Mettre à jour ma position" : "Ajouter ma position GPS"; }
  function editerConstat(c) {
    remplirArticlesCsr();
    ct.edition = c ? c.id : null;
    $("#ct-titre").textContent = c ? "Modifier le constat" : "Nouveau constat";
    $("#ct-numero").value = c ? c.numero : "";
    choisirTypeConstat(c ? c.type || "100400" : "100400");
    const maintenant = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("#ct-date").value = c ? c.date : maintenant;
    $("#ct-article").value = c ? c.article : "";
    $("#ct-lieu").value = c ? c.lieu || "" : "";
    $("#ct-narration").value = c ? c.narration || "" : "";
    ct.lat = c && c.lat != null ? c.lat : null; ct.lon = c && c.lon != null ? c.lon : null;
    majCoordConstat(); majArticleConstat();
    $("#ct-supprimer").hidden = !c;
    $$("#ct-form .ct-auto").forEach((x) => x.classList.remove("ct-auto"));
    $("#ct-photo-etat").textContent = "La photo est lue sur cet appareil, puis oubliée : seuls le numéro, le type, la date, l'article et le lieu sont gardés. Le nom, l'adresse, la date de naissance, le permis et la plaque sont ignorés.";
    $("#ct-voile").hidden = false;
    if (!c) setTimeout(() => $("#ct-numero").focus(), 50);
  }
  $("#ct-ouvrir").addEventListener("click", ouvrirConstats);
  $("#ct-verrouiller").addEventListener("click", async () => { try { await appelRegistre("verrouiller"); } catch { /* déjà verrouillé */ } afficherVerrouConstats(); });
  $("#ct-q").addEventListener("input", rendreConstats);
  $("#ct-nouveau").addEventListener("click", () => editerConstat(null));
  $("#ct-fermer").addEventListener("click", () => ($("#ct-voile").hidden = true));
  $$("[data-ct-type]").forEach((b) => b.addEventListener("click", () => choisirTypeConstat(b.dataset.ctType)));
  $("#ct-article").addEventListener("input", majArticleConstat);
  $("#ct-position").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("La localisation n'est pas offerte sur cet appareil.");
    toast("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => { ct.lat = Math.round(p.coords.latitude * 1e6) / 1e6; ct.lon = Math.round(p.coords.longitude * 1e6) / 1e6; majCoordConstat(); },
      () => toast("Position refusée ou introuvable."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
  $("#ct-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numero = $("#ct-numero").value.trim().toUpperCase();
    const article = $("#ct-article").value.trim().replace(/^art\.?\s*/i, "");
    if (!numero || !article) return toast("Inscrivez le numéro du constat et l'article.");
    if (ct.liste.some((x) => x.id !== ct.edition && norm(x.numero) === norm(numero))) return toast("Ce numéro de constat est déjà dans le registre.");
    const fiche = { numero, type: ct.type, date: $("#ct-date").value, article, lieu: $("#ct-lieu").value.trim(), lat: ct.lat, lon: ct.lon, narration: $("#ct-narration").value.trim(), modifie: new Date().toISOString() };
    const avant = ct.liste.slice();
    if (ct.edition) ct.liste = ct.liste.map((x) => (x.id === ct.edition ? { ...x, ...fiche } : x));
    else ct.liste.push({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), cree: fiche.modifie, ...fiche });
    if (!(await sauverConstats())) { ct.liste = avant; return; }
    $("#ct-voile").hidden = true;
    toast(ct.edition ? "Constat modifié." : "Constat enregistré sur cet appareil.");
    rendreConstats();
  });
  $("#ct-supprimer").addEventListener("click", async () => {
    const c = ct.liste.find((x) => x.id === ct.edition);
    if (!c || !confirm(`Supprimer le constat ${c.numero} de cet appareil ?`)) return;
    const avant = ct.liste.slice();
    ct.liste = ct.liste.filter((x) => x.id !== c.id);
    if (!(await sauverConstats())) { ct.liste = avant; return; }
    $("#ct-voile").hidden = true; toast("Constat supprimé."); rendreConstats();
  });
  $("#ct-tout-effacer").addEventListener("click", async () => {
    if (!ct.liste.length || !confirm(`Effacer les ${ct.liste.length} constats de cet appareil ? Cette action est définitive.`)) return;
    try { await appelRegistre("effacer"); ct.liste = []; rendreConstats(); toast("Registre effacé."); } catch { toast("Effacement impossible."); }
  });

  /* ---------------- Code de la sécurité routière ---------------- */
  const RACCOURCIS = [
    ["Cellulaire", "443.1"], ["Vitesse", "vitesse excède"], ["Ceinture", "ceinture de sécurité"], ["Alcool", "alcool"],
    ["Feu rouge", "feu rouge"], ["Arrêt obligatoire", "panneau arrêt"], ["Pneus d'hiver", "pneus conçus spécifiquement pour la conduite hivernale"],
    ["Corridor de sécurité", "véhicule d'urgence immobilisé"], ["Permis", "permis de conduire"], ["Immatriculation", "immatriculation"],
    ["Délit de fuite", "accident"], ["Grand excès", "grand excès de vitesse"],
  ];

  const RACCOURCIS_LOI = {
    csr: RACCOURCIS,
    criminel: [["Capacité affaiblie", "320.14"], ["Refus d'obtempérer", "320.15"], ["Délit de fuite", "320.16"], ["Conduite dangereuse", "320.13"],
      ["Voies de fait", "265"], ["Menaces", "264.1"], ["Harcèlement", "264"], ["Vol", "334"], ["Méfait", "430"], ["Bris de condition", "145"],
      ["Arrestation sans mandat", "495"], ["Entrave", "129"]],
    cannabis: [["Possession", "8"], ["Distribution", "9"], ["Vente", "10"], ["Culture", "12"]],
    drogues: [["Possession", "4"], ["Trafic", "5"], ["Production", "7"], ["Définitions", "2"]],
  };
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
    criminel: { nom: "Code criminel", court: "C.cr.", ref: "L.R.C. 1985, ch. C-46", fichier: "lois/criminel.json", lien: (n) => `${JUSTICE}lois/C-46/section-${n}.html`, site: "Justice Canada" },
    cannabis: { nom: "Loi sur le cannabis", court: "LC", ref: "L.C. 2018, ch. 16", fichier: "lois/cannabis.json", lien: (n) => `${JUSTICE}lois/C-24.5/section-${n}.html`, site: "Justice Canada" },
    drogues: { nom: "Loi réglementant certaines drogues et autres substances", court: "LRCDAS", ref: "L.C. 1996, ch. 19", fichier: "lois/drogues.json", lien: (n) => `${JUSTICE}lois/C-38.8/section-${n}.html`, site: "Justice Canada" },
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
    const raccourcis = RACCOURCIS_LOI[etat.loi] || [];
    $("#csr-raccourcis").hidden = !raccourcis.length;
    $("#csr-raccourcis").innerHTML = raccourcis.map(([l, q]) => `<button data-q="${esc(q)}">${esc(l)}</button>`).join("");
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

  /* ---------------- Réglages : retenues et soldes (SQ) ---------------- */
  function brancherAllerReglages(racine) {
    $$("[data-aller-reglages]", racine).forEach((b) => b.addEventListener("click", () => {
      $("#stats-voile").hidden = true; afficherVue("compte");
      setTimeout(() => { const c = document.getElementById(b.dataset.allerReglages); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250);
    }));
  }
  function rendreRetenuesReglages() {
    const el = $("#rg-retenues");
    if (!el || !estSQ()) return;
    const r = reglagesPaie();
    el.innerHTML = `
      
        <p class="aide">Copiez les montants par paie de votre talon. Ils restent dans votre compte, visibles par vous seulement.</p>
        <div class="paie-champs">
          <label><span>Régime de retraite RRMSQ ($)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-ret="rrmsq" value="${r.rrmsq || ""}"></label>
          <label><span>Cotisation syndicale APPQ ($)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-ret="syndicat" value="${r.syndicat || ""}"></label>
          <label><span>Assurances collectives ($)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-ret="assurances" value="${r.assurances || ""}"></label>
          <label><span>Autres retenues ($)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-ret="autres" value="${r.autres || ""}"></label>
          <label class="large"><span>Période de travail payée</span><select data-ret="decalage">
            <option value="11"${+r.decalage === 11 ? " selected" : ""}>Du lundi au dimanche (ex. 5 au 18 octobre pour la paie du 29)</option>
            <option value="12"${+r.decalage === 12 ? " selected" : ""}>Se termine le samedi, 12 jours avant la paie</option>
            <option value="5"${+r.decalage === 5 ? " selected" : ""}>Se termine le samedi précédant la paie</option>
            <option value="19"${+r.decalage === 19 ? " selected" : ""}>Se termine 19 jours avant la paie</option>
          </select></label>
        </div>
        <p class="rg-sous" style="margin:6px 0">Allocations (art. 18, 19 et 21)</p>
        <div class="paie-champs">
          <label class="large"><span>Affectation</span><select data-ret="alloc">
            ${Object.entries(ALLOCATIONS_SQ).map(([k, a]) => `<option value="${k}"${(r.alloc || "") === k ? " selected" : ""}>${esc(a.nom)}</option>`).join("")}
          </select></label>
          <label class="large hr-tsp-interrupteur"><input type="checkbox" data-ret="aCharge"${r.aCharge ? " checked" : ""}><span><b>J'ai une personne à charge</b><small>Montant plus élevé pour un poste éloigné (18.10)</small></span></label>
          <label class="large"><span>Tenue de travail</span><select data-ret="habit">
            <option value=""${!r.habit ? " selected" : ""}>Uniforme</option>
            <option value="ville"${r.habit === "ville" ? " selected" : ""}>Habit de ville : 9,10 $ par jour travaillé (19.01)</option>
            <option value="civil"${r.habit === "civil" ? " selected" : ""}>Habit civil : 7,30 $ par jour travaillé (19.01)</option>
          </select></label>
          <label class="large hr-tsp-interrupteur"><input type="checkbox" data-ret="repasNuit"${r.repasNuit !== false ? " checked" : ""}><span><b>Repas de nuit (21.07)</b><small>30,50 $ par relève qui commence entre 19 h et 1 h (16 h sur 12 h), sans pièce justificative</small></span></label>
        </div>
        <button type="button" class="btn-secondaire" id="paie-ret-ok">Enregistrer mes retenues et allocations</button>
`;
    $("#paie-ret-ok", el).addEventListener("click", async () => {
      const nouv = { ...reglagesPaie() };
      $$("[data-ret]", el).forEach((i) => {
        const k = i.dataset.ret, v = parseFloat(String(i.value).replace(",", "."));
        if (i.type === "checkbox") nouv[k] = i.checked;
        else if (k === "alloc" || k === "habit") nouv[k] = i.value;
        else nouv[k] = k === "decalage" ? (+i.value || 12) : (v > 0 && v < 10000 ? Math.round(v * 100) / 100 : 0);
      });
      const { error } = await sb.from("paie_sq").upsert({ user_id: etat.profil.id, retenues: nouv, maj_le: new Date().toISOString() });
      if (error) return toast(traduireErreur(error));
      etat.paie = { ...(etat.paie || {}), retenues: nouv }; toast("Retenues enregistrées");
    });
  }
  function rendreSoldesReglages() {
    const el = $("#rg-soldes");
    if (!el || !estSQ()) return;
    const b = reglagesBanques(), base = typeHoraireSQ() === "12" ? 12 : 9;
    el.innerHTML = `
      
        <p class="aide">Pour un compte exact, inscrivez les soldes de votre talon et leur date. L'app soustrait ensuite les V et les H de votre horaire après cette date.</p>
        <div class="paie-champs">
          <label class="large"><span>Type d'horaire</span><select data-banq="horaire">
            <option value="auto"${b.horaire === "auto" ? " selected" : ""}>Détecter selon ma rotation</option>
            <option value="9"${b.horaire === "9" ? " selected" : ""}>9 heures ou hybride</option>
            <option value="12"${b.horaire === "12" ? " selected" : ""}>12 heures (annexe I)</option></select></label>
          <label><span>Vacances : solde (jours)</span><input type="number" inputmode="numeric" min="0" max="45" step="1" data-banq="vacSoldeJ" value="${b.vacSolde ? Math.floor(b.vacSolde.h / base + 1e-9) : ""}"></label>
          <label><span>+ heures</span><input type="number" inputmode="decimal" min="0" max="11.75" step="0.25" data-banq="vacSoldeH" value="${b.vacSolde ? Math.round((b.vacSolde.h - Math.floor(b.vacSolde.h / base + 1e-9) * base) * 100) / 100 : ""}"></label>
          <label class="large"><span>Solde de vacances en date du</span><input type="date" data-banq="vacSoldeD" value="${b.vacSolde ? b.vacSolde.date : ""}"></label>
          <label><span>Fériés : solde (jours)</span><input type="number" inputmode="numeric" min="0" max="25" step="1" data-banq="ferSoldeJ" value="${b.ferSolde ? Math.floor(b.ferSolde.h / base + 1e-9) : ""}"></label>
          <label><span>+ heures</span><input type="number" inputmode="decimal" min="0" max="11.75" step="0.25" data-banq="ferSoldeH" value="${b.ferSolde ? Math.round((b.ferSolde.h - Math.floor(b.ferSolde.h / base + 1e-9) * base) * 100) / 100 : ""}"></label>
          <label class="large"><span>Solde de fériés en date du</span><input type="date" data-banq="ferSoldeD" value="${b.ferSolde ? b.ferSolde.date : ""}"></label>
          <label><span>Vacances reportées (max. 36 h)</span><input type="number" inputmode="decimal" min="0" max="36" step="0.25" data-banq="vacReport" value="${b.vacReport || ""}"></label>
          <label><span>Fériés reportés (max. 12 h)</span><input type="number" inputmode="decimal" min="0" max="12" step="0.25" data-banq="ferReport" value="${b.ferReport || ""}"></label>
          <label><span>Banque TS 189 h (solde)</span><input type="number" inputmode="decimal" min="0" max="189" step="0.25" data-banq="ts189" value="${b.ts189 ? b.ts189.h : ""}"></label>
          <label><span>Banque 1 040 h (solde)</span><input type="number" inputmode="decimal" min="0" max="1040" step="0.25" data-banq="ts1040" value="${b.ts1040 ? b.ts1040.h : ""}"></label>
          <label><span>Congés D à reprendre (h)</span><input type="number" inputmode="decimal" min="0" max="60" step="0.25" data-banq="dSolde" value="${b.dSolde ? b.dSolde.h : ""}"></label>
        </div>
        <button type="button" class="btn-secondaire" id="banq-ok">Enregistrer mes soldes</button>
`;
    $("#banq-ok").addEventListener("click", async () => {
      const v = (k) => { const i = $(`[data-banq='${k}']`, el); return i ? String(i.value).trim() : ""; };
      const num = (k, max) => { const n = parseFloat(v(k).replace(",", ".")); return n >= 0 && n <= max ? Math.round(n * 100) / 100 : null; };
      const auj = aujourdhuiISO();
      const solde = (jK, hK, dK, max) => {
        if (v(jK) === "" && v(hK) === "") return null;
        const t = (num(jK, 60) || 0) * base + (num(hK, 24) || 0);
        return t <= max ? { h: Math.round(t * 100) / 100, date: v(dK) || auj } : null;
      };
      const nouv = { horaire: v("horaire") || "auto", vacReport: num("vacReport", 36) || 0, ferReport: num("ferReport", 12) || 0,
        vacSolde: solde("vacSoldeJ", "vacSoldeH", "vacSoldeD", 400), ferSolde: solde("ferSoldeJ", "ferSoldeH", "ferSoldeD", 200),
        ts189: v("ts189") === "" ? null : { h: num("ts189", 189) || 0, date: auj }, ts1040: v("ts1040") === "" ? null : { h: num("ts1040", 1040) || 0, date: auj },
        dSolde: v("dSolde") === "" ? null : { h: num("dSolde", 60) || 0, date: auj } };
      const { error } = await sb.from("paie_sq").upsert({ user_id: etat.profil.id, banques: nouv, maj_le: new Date().toISOString() });
      if (error) return toast(traduireErreur(error));
      etat.paie = { ...(etat.paie || {}), banques: nouv }; toast("Soldes enregistrés"); rendreSoldesReglages();
    });
  }
  async function initPaieReglages() {
    if (!estSQ()) return;
    await initPaie();
    rendreRetenuesReglages(); rendreSoldesReglages();
  }

  /* ---------------- Convention : calculateur de frais (art. 21, annexe K) et délai de grief (art. 31) ---------------- */
  function calculerFrais() {
    const v = (k) => { const i = $(`[data-frais='${k}']`); return i.type === "checkbox" ? i.checked : Math.max(0, parseFloat(String(i.value).replace(",", ".")) || 0); };
    const maj = 1 + v("zone") / 100;
    const repas = (v("dej") * 14.7 + v("din") * 20.2 + v("soup") * 30.5 + v("nuit") * 30.5) * maj;
    const avant = v("kmAvant"), km = v("km");
    const kmTaux1 = Math.max(0, Math.min(km, 8000 - avant)), kmTaux2 = km - kmTaux1;
    const kilometrage = kmTaux1 * 0.62 + kmTaux2 * 0.545 + v("kmExtra") * 0.155 + v("peage");
    const couchers = v("couchers"), coucher = couchers * (7.75 + (v("horsHotel") ? 22.25 : 0)) + (couchers >= 2 ? couchers * 2.45 : 0);
    const total = repas + kilometrage + coucher, $$d = dollarsTS;
    $("#frais-res").innerHTML = `<dt>Repas${maj > 1 ? ` (+${Math.round((maj - 1) * 100)} %)` : ""}</dt><dd>${$$d(repas)}</dd>
      <dt>Kilométrage${kmTaux2 ? ` (${Math.round(kmTaux1)} km à 0,62 $, ${Math.round(kmTaux2)} km à 0,545 $)` : ""}</dt><dd>${$$d(kilometrage)}</dd>
      <dt>Coucher${couchers >= 2 ? " et appels (21.12)" : ""}</dt><dd>${$$d(coucher)}</dd>
      <dt class="total">Total à réclamer</dt><dd class="total">${$$d(total)}</dd>`;
  }
  $$("[data-frais]").forEach((i) => i.addEventListener("input", calculerFrais));
  calculerFrais();
  function calculerGrief() {
    const d = $("#grief-date").value, out = $("#grief-res");
    if (!d) { out.innerHTML = `<span>Indiquez la date de l'événement.</span>`; return; }
    const t = $("#grief-type").value;
    let limite;
    if (t === "harcelement") { const x = new Date(d + "T12:00"); x.setMonth(x.getMonth() + 24); limite = x.toISOString().slice(0, 10); }
    else limite = isoPlus(d, t === "accelere" ? 10 : 90);
    const reste = jourUTC(limite) - jourUTC(aujourdhuiISO());
    out.innerHTML = `<b>${esc(dateCourte(limite, true))}</b><span>${reste > 0 ? `Il reste ${reste} jour${reste > 1 ? "s" : ""}` : reste === 0 ? "C'est aujourd'hui la dernière journée" : `Délai dépassé depuis ${-reste} jour${-reste > 1 ? "s" : ""}`}</span>`;
    out.classList.toggle("depasse", reste < 0);
  }
  ["#grief-date", "#grief-type"].forEach((q) => $(q).addEventListener("input", calculerGrief));
  calculerGrief();

  /* ---------------- Mon compte : rémunération SQ ---------------- */
  const pctFr = (n) => String(n).replace(".", ",") + " %";
  function lirePaieForm() {
    const manuel = parseFloat(String($("#paie-manuel").value).replace(/\s/g, "").replace(",", "."));
    return { date_entree: $("#paie-entree").value || null, emploi: $("#paie-emploi").value || null, salaire_manuel: manuel >= 20000 && manuel <= 400000 ? manuel : null };
  }
  function rendrePaie() {
    const out = $("#paie-resultat"), f = lirePaieForm();
    if (f.date_entree && f.date_entree > aujourdhuiISO()) { out.innerHTML = `<p class="message erreur">La date d'entrée ne peut pas être dans le futur.</p>`; return; }
    const s = salaireSQ(f);
    if (!s) { out.innerHTML = `<p class="aide">Indiquez votre date d'entrée et votre emploi pour voir votre traitement.</p>`; return; }
    const ans = Math.floor(s.ans), mois = Math.floor((s.ans - ans) * 12 + 1e-9);
    out.innerHTML = `<div class="paie-carte">
        <div class="paie-total"><small>Traitement annuel ${s.manuel ? "inscrit" : "estimé"}</small><b>${dollarsTS(s.annuel)}</b><span>${esc(s.emploi)} · échelon ${esc(s.echelon)}</span></div>
        <dl class="vt-detail">
          <dt>Ancienneté</dt><dd>${ans} an${ans > 1 ? "s" : ""}${mois ? ` ${mois} mois` : ""}</dd>
          <dt>Échelle (taux au ${esc(s.dateTaux.split("-").reverse().join("-"))})</dt><dd>${dollarsTS(s.base)}</dd>
          <dt>Ancienneté (art. 11.09)</dt><dd>${s.anc ? "+ " + pctFr(s.anc) : "—"}</dd>
          <dt>Niveau de service 6 (art. 11.17)</dt><dd>+ ${pctFr(s.niv6)}</dd>
          ${s.manuel ? `<dt>Estimation selon l'échelle</dt><dd>${dollarsTS(s.calcule)}</dd>` : ""}
          <dt>Taux horaire régulier (÷ 2 080)</dt><dd>${dollarsTS(s.tauxRegulier)}</dd>
          <dt class="total">Taux pour le temps supp. (÷ 2 000)</dt><dd class="total">${dollarsTS(s.tauxTS)}</dd>
          <dt>Temps et demi · temps double</dt><dd>${dollarsTS(s.tauxTS * 1.5)} · ${dollarsTS(s.tauxTS * 2)}</dd>
        </dl>
        ${s.prochainEchelon ? `<p class="aide">Prochain échelon : ${esc(s.prochainEchelon)} de service.</p>` : ""}
        <p class="aide">Estimation selon l'échelle et l'ancienneté comptée depuis la date d'entrée. Les ajustements de fonction (annexe B), les primes (soir, nuit, fin de semaine, rotation) et les absences ne sont pas inclus. Votre talon de paie fait foi.</p>
      </div>`;
  }
  async function initPaie() {
    if (!estSQ()) return;
    const p = await chargerPaie(true).catch(() => null);
    $("#paie-entree").max = aujourdhuiISO();
    $("#paie-entree").value = (p && p.date_entree) || "";
    $("#paie-emploi").value = (p && p.emploi) || "";
    $("#paie-manuel").value = (p && p.salaire_manuel) ? Math.round(p.salaire_manuel) : "";
    $("#paie-ajuster").open = !!(p && p.salaire_manuel);
    rendrePaie();
  }
  ["#paie-entree", "#paie-emploi", "#paie-manuel"].forEach((q) => $(q).addEventListener("input", rendrePaie));
  $("#form-paie").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = lirePaieForm();
    if (!f.date_entree || !f.emploi) return toast("Indiquez votre date d'entrée et votre emploi");
    if (f.date_entree > aujourdhuiISO()) return toast("La date d'entrée ne peut pas être dans le futur");
    const { error } = await sb.from("paie_sq").upsert({ user_id: etat.profil.id, ...f, maj_le: new Date().toISOString() });
    if (error) return toast(traduireErreur(error));
    etat.paie = { ...(etat.paie || {}), ...f }; toast("Rémunération enregistrée");
  });
  $("#paie-effacer").addEventListener("click", async () => {
    const { error } = await sb.from("paie_sq").delete().eq("user_id", etat.profil.id);
    if (error) return toast(traduireErreur(error));
    etat.paie = null; $("#paie-entree").value = ""; $("#paie-emploi").value = ""; $("#paie-manuel").value = ""; rendrePaie();
    toast("Données de rémunération effacées");
  });
  // Convention : échelle salariale (annexe T)
  function rendreEchelle() {
    const el = $("#cv-echelle-contenu");
    if (!el || el.dataset.fait) return;
    const dates = DATES_ECHELLE_SQ.map((d) => d.split("-").reverse().join("-"));
    const k = DATES_ECHELLE_SQ.reduce((acc, d, i) => (aujourdhuiISO() >= d ? i : acc), 0);
    const lignes = Object.entries(EMPLOIS_SQ).map(([, e]) => e.echelons.map((ech, i) => `<tr${i === 0 ? ' class="debut-emploi"' : ""}><th>${i === 0 ? `<b>${esc(e.nom)}</b>` : ""}${e.echelons.length > 1 ? `<small>${esc(ech.libelle)}</small>` : ""}</th>${ech.taux.map((t, j) => `<td${j === k ? ' class="actuel"' : ""}>${t.toLocaleString("fr-CA")}</td>`).join("")}</tr>`).join("")).join("");
    el.innerHTML = `<div class="table-defile"><table class="table-vitesse cv-table-echelle"><thead><tr><th>Emploi · échelon</th>${dates.map((d, j) => `<th${j === k ? ' class="actuel"' : ""}>${d}</th>`).join("")}</tr></thead><tbody>${lignes}</tbody></table></div>
      <ul class="cv-echelle-notes">
        <li><b>Ancienneté (11.09)</b> : + 6 % à 6 ans, 7 % à 10 ans, 9 % à 14 ans, 11 % à 21 ans.</li>
        <li><b>Niveau de service 6 (11.17)</b> : + 5 % depuis le 1ᵉʳ avril 2025, + 6 % depuis le 1ᵉʳ avril 2026.</li>
        <li><b>Taux horaire</b> : traitement ÷ 2 080 (2.22). Temps supplémentaire : traitement ÷ 2 000, à temps et demi, ou temps double dans les cas de l'art. 12.02.</li>
        <li>Taux en vigueur à la révision de la classification (1ᵉʳ janvier 2025), puis aux 1ᵉʳˢ avril. La colonne en couleur est celle d'aujourd'hui.</li>
      </ul>
      <button type="button" class="btn-secondaire" id="cv-mon-salaire">Calculer mon salaire</button>`;
    el.dataset.fait = "1";
    $("#cv-mon-salaire").addEventListener("click", () => { afficherVue("compte"); setTimeout(() => $("#rg-paie-bloc").scrollIntoView({ behavior: "smooth", block: "start" }), 250); });
  }

  /* ---------------- Site public : outils à essayer sans compte (données publiques, aucun appel au serveur) ---------------- */
  (function essaiPublic() {
    const racine = document.getElementById("essai");
    if (!racine) return;
    $$("[data-essai]", racine).forEach((b) => b.addEventListener("click", () => {
      $$("[data-essai]", racine).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      $$("[data-panneau]", racine).forEach((p) => (p.hidden = p.dataset.panneau !== b.dataset.essai));
    }));
    const choisir = (zone, b) => $$("button", zone).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    // Vitesse : 100 km/h seulement, trois exemples
    function rendreV(v) {
      const r = calculVitesse(100, v, "normale");
      $("#es-vitesse-res").innerHTML = `
        <div class="essai-chiffres">
          <div><small>Excès</small><b>${r.exces} km/h</b></div>
          <div><small>Amende</small><b>${dollars(r.amende)}</b></div>
          <div><small>Total à payer</small><b>${dollars(r.total)}</b></div>
          <div><small>Points</small><b>${r.points}</b></div>
        </div>
        ${r.gev ? `<p class="essai-gev">Grand excès de vitesse : amende et points doublés, suspension immédiate du permis.</p>` : ""}`;
    }
    $$("#es-vitesses button").forEach((b) => b.addEventListener("click", () => { choisir($("#es-vitesses"), b); rendreV(+b.dataset.v); }));
    rendreV(120);
    // Article : trois exemples, extrait seulement
    $$("#es-articles button").forEach((b) => b.addEventListener("click", async () => {
      choisir($("#es-articles"), b);
      const out = $("#es-article-res");
      let arts;
      try { arts = await charger("csr.json"); } catch { out.innerHTML = `<p class="essai-aide">Impossible de charger l'exemple.</p>`; return; }
      const x = arts.find((a) => a.numero === b.dataset.a);
      if (!x) { out.innerHTML = ""; return; }
      const t = x.texte.replace(/\n/g, " ");
      out.innerHTML = `<article class="essai-article"><b>Art. ${esc(x.numero)} CSR</b><p>${esc(t.length > 180 ? t.slice(0, 180).replace(/\s\S*$/, "") + "…" : t)}</p></article>`;
    }));
    // Qui couvre : trois exemples
    $$("#es-munis button").forEach((b) => b.addEventListener("click", async () => {
      choisir($("#es-munis"), b);
      const out = $("#es-muni-res");
      let idx;
      try { idx = await charger("municipalites.json"); if (!etat.corps) await chargerCorps(); } catch { out.innerHTML = `<p class="essai-aide">Exemple indisponible.</p>`; return; }
      const m = idx.municipalites.find((x) => norm(x[0]) === norm(b.dataset.m));
      if (!m) { out.innerHTML = ""; return; }
      const [nom, , mrc, , , sq] = m;
      const c = etat.corps && corpsPourMunicipalite(nom);
      const qui = c && !/s[ûu]ret[ée] du qu[ée]bec/i.test(c.nom) ? c.nom : sq ? "Sûreté du Québec" : "Corps de police municipal ou régional";
      out.innerHTML = `<div class="essai-muni"><small>${esc(nom)}${mrc ? " · MRC " + esc(mrc) : ""}</small><b>${esc(qui)}</b></div>`;
    }));
  })();
  // Vidéo de présentation : joue sans son quand elle est visible (sauf si l'appareil demande moins d'animations)
  (() => {
    const v = $("#site-annonce"), b = $("#site-annonce-jouer");
    if (!v) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const jouer = () => { v.preload = "auto"; v.play().then(() => (b.hidden = true)).catch(() => (b.hidden = false)); };
    b.addEventListener("click", () => { v.controls = true; jouer(); });
    v.addEventListener("pause", () => { if (!v.controls) b.hidden = false; });
    if (reduit || !("IntersectionObserver" in window)) return;
    new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) jouer(); else v.pause(); }), { threshold: .45 }).observe(v);
  })();
  $("#site-partager") && $("#site-partager").addEventListener("click", async () => {
    const donnees = { title: "Police Management", text: "L'outil de poche des policiers du Québec : horaire, lois, vitesses, carte et Québec 511. Gratuit.", url: "https://policemanagement.ca" };
    try { if (navigator.share) { await navigator.share(donnees); return; } } catch { return; }
    copier(donnees.url); toast("Lien copié");
  });

  /* ---------------- État du service : panne, mise à jour ou panne annoncée (publié par l'administrateur) ----------------
     Pendant une panne ou une mise à jour, seul l'administrateur a accès à l'app. Une panne annoncée affiche un avis,
     puis bloque l'app automatiquement de l'heure de début à l'heure de fin. */
  const etatSvc = { donnees: null, injoignable: false, minuteur: null, passeConnexion: false };
  const TEXTES_ETAT = {
    panne: { titre: "Panne en cours", defaut: "Le service est interrompu. Nous travaillons à régler le problème." },
    maintenance: { titre: "Mise à jour des serveurs en cours", defaut: "Le service est interrompu le temps de la mise à jour." },
    planifiee: { titre: "Interruption prévue en cours", defaut: "Le service est interrompu pour une intervention planifiée." },
    annonce: { titre: "Panne de service prévue", defaut: "Le service sera interrompu pendant cette période. Planifiez en conséquence." },
    injoignable: { titre: "Serveurs injoignables", defaut: "Impossible de joindre les serveurs pour le moment. Réessayez dans quelques minutes." },
  };
  const dateEtat = (iso, long) => new Date(iso).toLocaleString("fr-CA", { weekday: long ? "long" : "short", day: "numeric", month: long ? "long" : "short", hour: "2-digit", minute: "2-digit" });
  function dansDelai(iso) {
    const min = Math.round((new Date(iso) - Date.now()) / 60000);
    if (min <= 0) return "d'un instant à l'autre";
    if (min < 60) return `dans ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return h < 48 ? `dans ${h} h${m ? " " + String(m).padStart(2, "0") : ""}` : `dans ${Math.round(h / 24)} jours`;
  }
  function etatEffectif() {
    if (etatSvc.injoignable) return { type: "injoignable", bloque: false };
    const d = etatSvc.donnees;
    if (!d || d.mode === "normal") return { type: "normal", bloque: false };
    if (d.mode === "annonce") {
      const maint = Date.now();
      if (d.debut_prevu && maint < new Date(d.debut_prevu)) return { type: "annonce", bloque: false };
      if (d.fin_prevue && maint < new Date(d.fin_prevue)) return { type: "planifiee", bloque: true };
      return { type: "normal", bloque: false };
    }
    return { type: d.mode, bloque: true };
  }
  async function chargerEtatService() {
    try {
      const { data, error } = await sb.from("etat_service").select("mode, message, debut_prevu, fin_prevue, depuis").eq("id", 1).maybeSingle();
      if (error) throw error;
      etatSvc.donnees = data; etatSvc.injoignable = false;
    } catch (e) {
      etatSvc.injoignable = navigator.onLine !== false; // hors ligne : ce n'est pas une panne du service
    }
    rendreEtatService();
  }
  function rendreEtatService() {
    const e = etatEffectif(), d = etatSvc.donnees || {}, t = TEXTES_ETAT[e.type];
    const admin = !!(etat.profil && etat.profil.role === "admin");
    const cle = `${e.type}|${d.depuis || ""}`;
    let masque = false; try { masque = sessionStorage.getItem("pm-etat-masque") === cle; } catch { /* facultatif */ }
    // Bandeau : avis de panne prévue, état en cours (vu par l'admin), serveurs injoignables
    const bandeau = $("#etat-bandeau");
    const montrerBandeau = !!t && !masque && (!e.bloque || admin);
    bandeau.hidden = !montrerBandeau;
    bandeau.className = "etat-bandeau etat-m-" + (e.type === "planifiee" ? "maintenance" : e.type);
    if (t) {
      $("#etat-titre").textContent = t.titre + (e.bloque && admin ? " · accès réservé à l'admin" : "");
      let detail = d.message || t.defaut;
      if (e.type === "annonce") detail = `Du ${dateEtat(d.debut_prevu)} au ${dateEtat(d.fin_prevue)} (${dansDelai(d.debut_prevu)}). ` + (d.message || t.defaut);
      else if (e.bloque && d.fin_prevue) detail += ` Fin prévue : ${dateEtat(d.fin_prevue)}.`;
      $("#etat-detail").textContent = detail;
    }
    // Écran bloquant : tout le monde sauf l'administrateur
    const nonConnecte = !etat.profil;
    const bloquer = e.bloque && !admin && !(nonConnecte && etatSvc.passeConnexion);
    $("#etat-voile").hidden = !bloquer;
    if (bloquer) {
      $("#etat-voile-titre").textContent = t.titre;
      $("#etat-voile-msg").textContent = d.message || t.defaut;
      $("#etat-voile-fin").innerHTML = d.fin_prevue
        ? `La panne devrait être terminée le <b>${esc(dateEtat(d.fin_prevue, true))}</b> (${esc(dansDelai(d.fin_prevue))}).`
        : "Revenez dans quelques minutes.";
      $("#etat-admin-passer").hidden = !nonConnecte;
    }
    document.documentElement.classList.toggle("etat-actif", montrerBandeau);
    majAdminEtat();
  }
  $("#etat-fermer").addEventListener("click", () => {
    const e = etatEffectif();
    try { sessionStorage.setItem("pm-etat-masque", `${e.type}|${(etatSvc.donnees || {}).depuis || ""}`); } catch { /* facultatif */ }
    rendreEtatService();
  });
  $("#etat-reessayer").addEventListener("click", () => { $("#etat-reessayer").disabled = true; chargerEtatService().finally(() => ($("#etat-reessayer").disabled = false)); });
  // Avant connexion : l'administrateur peut ouvrir l'écran de connexion; tout autre compte est bloqué une fois connecté
  $("#etat-admin-passer").addEventListener("click", () => { etatSvc.passeConnexion = true; rendreEtatService(); if ($("#ecran-auth").hidden) ouvrirAuth("connexion"); });
  function surveillerEtatService() {
    chargerEtatService();
    clearInterval(etatSvc.minuteur);
    etatSvc.minuteur = setInterval(() => { if (document.visibilityState === "visible") chargerEtatService(); else rendreEtatService(); }, 60000);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") chargerEtatService(); });
  window.addEventListener("online", chargerEtatService);
  surveillerEtatService();

  // Administration : publier l'état
  let modeAdminEtat = "normal";
  const valeurDateHeure = (iso) => { if (!iso) return ["", ""]; const f = new Date(iso); f.setMinutes(f.getMinutes() - f.getTimezoneOffset()); const x = f.toISOString(); return [x.slice(0, 10), x.slice(11, 16)]; };
  const lireDateHeure = (dq, hq) => { const dd = $(dq).value, hh = $(hq).value; return dd ? new Date(`${dd}T${hh || "00:00"}`).toISOString() : null; };
  function majAdminEtat() {
    const el = $("#adm-etat-actuel");
    if (!el) return;
    const d = etatSvc.donnees, e = etatEffectif();
    if (!d) { el.textContent = ""; return; }
    el.textContent = e.type === "normal" ? "En ce moment : service normal." :
      e.type === "annonce" ? `En ce moment : panne annoncée du ${dateEtat(d.debut_prevu)} au ${dateEtat(d.fin_prevue)}. L'app sera bloquée automatiquement pendant cette période.` :
      `En ce moment : ${TEXTES_ETAT[e.type].titre.toLowerCase()} depuis ${dateEtat(d.mode === "annonce" ? d.debut_prevu : d.depuis)}. Les membres n'ont pas accès à l'app.`;
  }
  function choisirModeAdmin(m) {
    modeAdminEtat = m;
    $$("[data-etat-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.etatMode === m)));
    $("#adm-etat-champs").hidden = m === "normal";
    $("#adm-etat-debut-bloc").hidden = m !== "annonce";
    $("#adm-etat-fin-titre").textContent = m === "annonce" ? "Fin de la panne prévue" : "La panne sera terminée le (facultatif)";
    $("#adm-etat-aide").textContent = m === "annonce"
      ? "Un avis s'affiche dès maintenant. À l'heure du début, l'app se bloque automatiquement pour tout le monde sauf vous, puis se rouvre à l'heure de fin."
      : m === "normal" ? "Le service revient à la normale pour tout le monde." : "Dès la publication, seuls vous (administrateur) avez accès à l'app. Les membres voient l'écran de panne et l'heure de fin prévue.";
  }
  $$("[data-etat-mode]").forEach((b) => b.addEventListener("click", () => choisirModeAdmin(b.dataset.etatMode)));
  function initAdminEtat() {
    const d = etatSvc.donnees || {};
    choisirModeAdmin(d.mode || "normal");
    $("#adm-etat-msg").value = d.message || "";
    const [fd, fh] = valeurDateHeure(d.fin_prevue); $("#adm-etat-fin-date").value = fd; $("#adm-etat-fin-heure").value = fh;
    const [dd, dh] = valeurDateHeure(d.debut_prevu); $("#adm-etat-debut-date").value = dd; $("#adm-etat-debut-heure").value = dh;
    majAdminEtat();
  }
  $("#adm-etat-ok").addEventListener("click", async () => {
    const m = modeAdminEtat;
    const debut = m === "annonce" ? lireDateHeure("#adm-etat-debut-date", "#adm-etat-debut-heure") : null;
    const fin = m === "normal" ? null : lireDateHeure("#adm-etat-fin-date", "#adm-etat-fin-heure");
    if (m === "annonce" && (!debut || !fin)) return toast("Indiquez la date et l'heure du début et de la fin");
    if (fin && new Date(fin) <= new Date(debut || Date.now())) return toast("La fin doit être après " + (debut ? "le début" : "maintenant"));
    const b = $("#adm-etat-ok"); b.disabled = true;
    const { data, error } = await sb.rpc("admin_etat_service_v2", { p_mode: m, p_message: $("#adm-etat-msg").value, p_debut: debut, p_fin: fin });
    b.disabled = false;
    if (error) return toast(traduireErreur(error));
    etatSvc.donnees = data; etatSvc.injoignable = false;
    try { sessionStorage.removeItem("pm-etat-masque"); } catch { /* facultatif */ }
    rendreEtatService();
    toast(m === "normal" ? "Service revenu à la normale" : m === "annonce" ? "Panne annoncée à tous les membres" : "Panne publiée : les membres n'ont plus accès");
  });

  /* ---------------- Visite guidée : explications pour les nouveaux membres et les nouvelles sections ----------------
     nouveau: true = montrée aussi aux membres existants (nouvelle fonction); sinon seulement aux nouveaux comptes. */
  const DEBUT_VISITES = "2026-10-23";
  const VISITES = {
    bienvenue: { titre: "Bienvenue dans Police Management", vue: "accueil", etapes: [
      { titre: "Bienvenue !", texte: "Voici une visite rapide de l'app. Vous pourrez la revoir en tout temps dans Réglages › Visite guidée." },
      { sel: "#ac-q", titre: "Recherche", texte: "Trouvez un article de loi, une municipalité ou une section de l'app en tapant quelques lettres." },
      { sel: "#ac-quart", titre: "Votre quart", texte: "Votre quart d'aujourd'hui et de demain, selon votre rotation. Touchez pour ouvrir l'horaire." },
      { sel: "#ac-echeances", titre: "À ne pas oublier", texte: "Les dates limites du contrat de travail et les congés à planifier avant de les perdre." },
      { sel: ".ac-511", titre: "Québec 511", texte: "Les entraves et travaux sur le territoire de votre unité, mis à jour automatiquement." },
      { sel: ".nav [data-vue='csr']", titre: "Lois", texte: "CSR, Code criminel et autres lois, vitesses et amendes, frais et vos articles favoris." },
      { sel: ".nav [data-vue='carte']", titre: "Carte", texte: "Postes, territoires, bornes kilométriques et « Où suis-je ? »." },
      { sel: ".nav [data-vue='horaire']", titre: "Horaire", texte: "Votre rotation, vos congés, votre temps supplémentaire et, pour la SQ, votre paie et vos banques." },
      { sel: ".nav [data-vue='feuille']", titre: "Feuille de poste", texte: "La feuille de votre poste, partagée seulement entre les membres du même poste." },
      { sel: ".nav [data-vue='messages']", titre: "Messages", texte: "Écrivez à vos collègues ou à l'administrateur. Ne partagez jamais d'informations opérationnelles." },
      { sel: "#btn-menu", titre: "Votre compte", texte: "Votre profil, votre rémunération, vos soldes de banques et la déconnexion." },
      { sel: "#btn-reglages", titre: "Réglages", texte: "Apparence (dont le mode nuit rouge), notifications et cette visite guidée." },
    ] },
    horaire: { titre: "L'horaire", vue: "horaire", nouveau: true, etapes: [
      { sel: "#hr-onglets-vue", titre: "Calendrier et Rémunération", texte: "Nouveau : votre calendrier d'un côté, et de l'autre votre paie, vos banques et vos heures (Statistiques hors SQ)." },
      { sel: "#cal-ajout", titre: "Le bouton +", texte: "Modifier le quart d'une journée, planifier le congé des Fêtes ou ajouter un événement personnel." },
      { sel: "#hr-grille, #cal-zone", titre: "Toucher une journée", texte: "Touchez une journée pour voir son détail, puis « Modifier » pour noter vacances, maladie, temps supplémentaire, etc." },
      { sel: "#hr-config", titre: "Votre rotation", texte: "Configurez votre rotation une seule fois (H1 hybride et autres modèles). L'app calcule ensuite tous vos quarts." },
      { sel: "#hr-abo-btn", titre: "Calendrier abonné", texte: "Votre horaire dans le Calendrier de l'iPhone, Google Agenda ou Outlook, mis à jour tout seul." },
    ] },
    jour: { titre: "La fiche d'une journée", nouveau: true, etapes: [
      { sel: "#hr-onglets", titre: "Deux onglets", texte: "Nouveau : l'onglet Quart pour le code de la journée, l'onglet Temps supp. pour le temps supplémentaire avant ou après votre quart." },
      { sel: "#hr-jour-choix", titre: "Le code de la journée", texte: "J, S, N, vacances, maladie, férié, banque de temps, événement familial… Chaque code suit les règles du contrat." },
      { sel: "#hr-jour-ok", titre: "Enregistrer", texte: "Enregistre les deux onglets. « Revenir à la rotation » efface les changements de la journée." },
    ] },
    remuneration: { titre: "Rémunération (SQ)", nouveau: true, sq: true, etapes: [
      { sel: ".hr-stats-vue .stats-mode", titre: "Quatre sections", texte: "Paie aux deux semaines (brut et net), Banques (vacances, fériés, TS, congés D), heures du mois et de l'année." },
      { sel: "#stats-contenu", titre: "Calcul selon le contrat", texte: "Primes, temps supplémentaire, impôts et cotisations 2026. Entrez vos retenues et vos soldes dans Mon compte pour un résultat exact." },
    ] },
    csr: { titre: "Les lois", vue: "csr", etapes: [
      { sel: "#loi-choix", titre: "Choisir la loi", texte: "CSR, Code criminel, cannabis, drogues, véhicules hors route et plus." },
      { sel: "#csr-q", titre: "Chercher", texte: "Un numéro d'article (ex. 328) ou des mots-clés (ex. cellulaire)." },
      { sel: "[data-csr-onglet='vitesse']", titre: "Vitesses et frais", texte: "Calculez l'amende, les frais, la contribution et les points d'un excès de vitesse." },
      { sel: "[data-csr-onglet='favoris']", titre: "Favoris", texte: "Touchez l'étoile d'un article pour le retrouver ici." },
    ] },
    carte: { titre: "La carte", vue: "carte", etapes: [
      { sel: "#adresse-q", titre: "Chercher un lieu", texte: "Une adresse, un lieu ou des coordonnées : l'app indique le corps de police, le poste et la borne la plus proche." },
      { sel: "#btn-position", titre: "Ma position", texte: "Votre position reste sur votre appareil : la carte ne la transmet jamais." },
    ] },
    feuille: { titre: "La feuille de poste", vue: "feuille", etapes: [
      { titre: "Feuille de poste", texte: "La feuille de votre poste, visible seulement par les membres du même poste. N'y mettez aucun renseignement opérationnel ou personnel." },
    ] },
    convention: { titre: "La convention (SQ)", vue: "convention", sq: true, etapes: [
      { sel: "#cv-echelle", titre: "Échelle salariale", texte: "Les taux de l'annexe T, avec la colonne d'aujourd'hui en couleur." },
      { sel: "#cv-frais", titre: "Calculateur de frais", texte: "Repas, kilométrage et coucher selon l'annexe K." },
      { sel: "#cv-grief", titre: "Délai de grief", texte: "La date limite pour déposer un grief selon l'article 31." },
      { sel: "#cv-texte", titre: "Poser une question", texte: "Écrivez ou dictez votre question comme à un collègue : l'IA Police Management cite mot pour mot les passages du contrat qui répondent." },
    ] },
  };
  const visite = { cle: null, etapes: [], i: 0 };
  const lireVisites = () => { try { return JSON.parse(localStorage.getItem("pm-visites") || "{}"); } catch { return {}; } };
  const visitesAuto = () => { try { return localStorage.getItem("pm-visites-auto") !== "0"; } catch { return true; } };
  function marquerVisite(cle) { const v = lireVisites(); v[cle] = aujourdhuiISO(); try { localStorage.setItem("pm-visites", JSON.stringify(v)); } catch { /* facultatif */ } }
  function cibleVisible(sel) {
    if (!sel) return null;
    for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && !el.closest("[hidden]")) return el; }
    return null;
  }
  function lancerVisite(cle, force) {
    const v = VISITES[cle];
    if (!v || (v.sq && !estSQ())) return false;
    if (v.vue && etat.vue !== v.vue) { afficherVue(v.vue); setTimeout(() => lancerVisite(cle, force), 700); return true; }
    visite.cle = cle; visite.etapes = v.etapes; visite.i = 0;
    $("#visite").hidden = false; document.documentElement.classList.add("visite-active");
    montrerEtape();
    return true;
  }
  function montrerEtape() {
    const e = visite.etapes[visite.i], el = cibleVisible(e.sel);
    $("#visite-etape").textContent = `${visite.i + 1} / ${visite.etapes.length}`;
    $("#visite-titre").textContent = e.titre; $("#visite-texte").textContent = e.texte;
    $("#visite-prec").hidden = visite.i === 0;
    $("#visite-suiv").textContent = visite.i === visite.etapes.length - 1 ? "Terminé" : "Suivant";
    const trou = $("#visite-trou"), bulle = $("#visite-bulle");
    if (!el) { trou.style.cssText = "left:50%;top:50%;width:0;height:0"; bulle.className = "visite-bulle centre"; bulle.style.cssText = ""; return; }
    el.scrollIntoView({ block: "center", behavior: "instant" in el ? "instant" : "auto" });
    setTimeout(() => {
      const r = el.getBoundingClientRect(), m = 6, W = window.innerWidth, Hh = window.innerHeight;
      trou.style.cssText = `left:${r.left - m}px;top:${r.top - m}px;width:${r.width + 2 * m}px;height:${r.height + 2 * m}px`;
      bulle.className = "visite-bulle";
      const largeur = Math.min(340, W - 24), gauche = Math.max(12, Math.min(W - largeur - 12, r.left + r.width / 2 - largeur / 2));
      const enBas = r.bottom + 14 + 190 < Hh || r.top < Hh / 2;
      bulle.style.cssText = `left:${gauche}px;width:${largeur}px;${enBas ? `top:${Math.min(Hh - 200, r.bottom + 14)}px` : `bottom:${Math.max(12, Hh - r.top + 14)}px`}`;
    }, 260);
  }
  function fermerVisite(terminee) {
    if (visite.cle) marquerVisite(visite.cle);
    $("#visite").hidden = true; document.documentElement.classList.remove("visite-active");
    if (terminee && visite.cle === "bienvenue") toast("Bonne utilisation ! Revoyez la visite dans Réglages › Visite guidée.");
    visite.cle = null;
  }
  $("#visite-suiv").addEventListener("click", () => { if (visite.i < visite.etapes.length - 1) { visite.i++; montrerEtape(); } else fermerVisite(true); });
  $("#visite-prec").addEventListener("click", () => { if (visite.i > 0) { visite.i--; montrerEtape(); } });
  $("#visite-passer").addEventListener("click", () => fermerVisite(false));
  document.addEventListener("keydown", (e) => { if ($("#visite").hidden) return; if (e.key === "Escape") fermerVisite(false); else if (e.key === "ArrowRight") $("#visite-suiv").click(); else if (e.key === "ArrowLeft" && visite.i > 0) $("#visite-prec").click(); });
  window.addEventListener("resize", () => { if (!$("#visite").hidden) montrerEtape(); });
  // Déclenchement automatique : nouveaux comptes (toutes les visites) ou nouvelles fonctions (visites « nouveau »)
  function visiteAutomatique(cle) {
    if (guideAVoir()) { guideVideoAutomatique(); return; } // la vidéo de présentation passe en premier
    if (!visitesAuto() || !etat.profil || !$("#visite").hidden || !$("#guide-video").hidden) return;
    if (["#consent-voile", "#avert-voile", "#nouv-voile", "#etat-voile", "#intro"].some((q) => { const x = $(q); return x && !x.hidden; })) return;
    const v = VISITES[cle];
    if (!v || lireVisites()[cle] || (v.sq && !estSQ())) return;
    const nouveauCompte = (etat.profil.cree_le || "") >= DEBUT_VISITES;
    if (!nouveauCompte && !v.nouveau) return;
    if (cle !== "bienvenue" && nouveauCompte && !lireVisites().bienvenue) return; // d'abord la visite de bienvenue
    lancerVisite(cle);
  }
  function visiteDeVue(nom) {
    const cle = nom === "accueil" ? "bienvenue" : nom;
    setTimeout(() => visiteAutomatique(cle), 1200);
  }
  // Vidéo de présentation : une fois par membre (enregistré sur le compte), avant les visites guidées
  const guideVuLocal = () => { try { return !!(etat.profil && localStorage.getItem("pm-guide-vu-" + etat.profil.id)); } catch { return false; } };
  const guideAVoir = () => etat.profil && etat.profil.statut === "approuve" && !etat.profil.guide_video_vu_le && !guideVuLocal();
  function ouvrirGuideVideo() {
    const g = $("#guide-video"), v = $("#guide-lecteur");
    if (!v.src) v.src = "assets/guide/guide.mp4";
    $("#guide-fin").hidden = true; g.hidden = false; document.documentElement.classList.add("visite-active");
    try { v.currentTime = 0; } catch { /* pas encore chargée */ }
    const p = v.play(); if (p && p.catch) p.catch(() => { v.controls = true; });
  }
  async function fermerGuideVideo() {
    const v = $("#guide-lecteur"); v.pause();
    $("#guide-video").hidden = true; document.documentElement.classList.remove("visite-active");
    if (etat.profil && !etat.profil.guide_video_vu_le) {
      try { localStorage.setItem("pm-guide-vu-" + etat.profil.id, "1"); } catch { /* facultatif */ }
      etat.profil.guide_video_vu_le = new Date().toISOString();
      sb.rpc("marquer_guide_video").then(() => {}, () => {});
      visiteDeVue(etat.vue || "accueil"); // ensuite, la visite guidée habituelle s'il y a lieu
    }
  }
  function guideVideoAutomatique() {
    if (!guideAVoir() || !$("#guide-video").hidden || !$("#visite").hidden) return false;
    if (["#consent-voile", "#avert-voile", "#nouv-voile", "#etat-voile", "#intro", "#fp-voile"].some((q) => { const x = $(q); return x && !x.hidden; })) return false;
    ouvrirGuideVideo(); return true;
  }
  $("#guide-lecteur").addEventListener("ended", () => { $("#guide-fin").hidden = false; });
  $("#guide-passer").addEventListener("click", fermerGuideVideo);
  $("#guide-commencer").addEventListener("click", fermerGuideVideo);
  $("#guide-revoir").addEventListener("click", () => { $("#guide-fin").hidden = true; const v = $("#guide-lecteur"); v.currentTime = 0; v.play().catch(() => {}); });
  $("#rg-guide-video").addEventListener("click", ouvrirGuideVideo);
  // Réglages › Visite guidée
  function rendreVisitesReglages() {
    $("#rg-visites-auto").checked = visitesAuto();
    const faites = lireVisites();
    $("#rg-visites-liste").innerHTML = Object.entries(VISITES).filter(([, v]) => !v.sq || estSQ()).map(([k, v]) => `<button type="button" data-revoir="${k}"><span>${esc(v.titre)}</span><small>${faites[k] ? "Vue" : "Pas encore vue"} · ${v.etapes.length} étape${v.etapes.length > 1 ? "s" : ""}</small><i>›</i></button>`).join("");
    $$("[data-revoir]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.revoir;
      if (k === "jour") { afficherVue("horaire"); setTimeout(() => { ouvrirJour(aujourdhuiISO()); setTimeout(() => lancerVisite("jour", true), 500); }, 900); }
      else if (k === "remuneration") { afficherVue("horaire"); setTimeout(() => { const t = $("[data-hr-vue='stats']"); if (t) t.click(); setTimeout(() => lancerVisite("remuneration", true), 900); }, 900); }
      else lancerVisite(k, true);
    }));
  }
  $("#rg-visites-auto").addEventListener("change", () => { try { localStorage.setItem("pm-visites-auto", $("#rg-visites-auto").checked ? "1" : "0"); } catch { /* facultatif */ } });
  $("#rg-visites-tout").addEventListener("click", () => { try { localStorage.removeItem("pm-visites"); localStorage.setItem("pm-visites-auto", "1"); } catch { /* facultatif */ } rendreVisitesReglages(); lancerVisite("bienvenue", true); });

  /* ---------------- Horaire du poste et temps supplémentaire (membres de la SQ) ----------------
     Un membre publie l'horaire du poste (lu d'une photo, sur l'appareil, puis corrigé). Les quarts de TS sont offerts aux
     membres du poste, qui s'inscrivent avec leur matricule. Un membre approuve (le mercredi) : les retenus sont avisés et
     le quart s'ajoute à leur horaire personnel. Tout passe par des fonctions du serveur qui vérifient le poste. */
  const hp = { debut: null, quarts: [], de: null, a: null, chargement: null, tsVue: "offert", hMois: null };
  // TS du poste : historique par mois (conservé après la suppression hebdomadaire de l'horaire)
  async function rendreTsPoste() {
    if (!hp.hMois) hp.hMois = aujourdhuiISO().slice(0, 7) + "-01";
    const d = new Date(hp.hMois + "T12:00");
    const fin = isoDe(jourUTC(isoPlus(hp.hMois, 32).slice(0, 7) + "-01") - 1);
    $("#hph-mois").textContent = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
    $("#hph-liste").innerHTML = `<p class="aide">Chargement…</p>`;
    const { data, error } = await sb.rpc("ts_poste_historique", { p_debut: hp.hMois, p_fin: fin });
    if (error) { $("#hph-liste").innerHTML = ""; return toast(traduireErreur(error)); }
    const l = data || [];
    const heures = (q) => (q.debut && q.fin ? dureeH([q.debut, q.fin]) : 0);
    const attribues = l.filter((q) => q.statut === "attribue");
    const hTot = attribues.reduce((s, q) => s + heures(q) * Math.max(1, (q.retenus || []).length), 0);
    $("#hph-resume").innerHTML = l.length ? `<span><b>${l.length}</b> quart${l.length > 1 ? "s" : ""} de TS</span><span><b>${attribues.length}</b> attribué${attribues.length > 1 ? "s" : ""}</span>${hTot ? `<span><b>${fmtH(hTot)}</b> attribuées</span>` : ""}` : "";
    const auj = aujourdhuiISO();
    $("#hph-liste").innerHTML = l.length ? l.map((q) => {
      const etatTs = q.statut === "attribue" ? `<span class="hp-etat ok">Attribué</span>` : q.jour < auj ? `<span class="hp-etat">Non attribué</span>` : `<span class="hp-etat inscrit">Ouvert</span>`;
      return `<article class="panneau hp-carte"><div class="hp-carte-tete"><b>${esc(jourLong(q.jour))}</b>${etatTs}</div>
        <p>${esc(heuresQ(q))} · ${esc(q.code)} · ${q.places} place${q.places > 1 ? "s" : ""} · ${q.inscrits} inscrit${q.inscrits > 1 ? "s" : ""}</p>
        ${(q.retenus || []).length ? `<p>Matricule${q.retenus.length > 1 ? "s" : ""} retenu${q.retenus.length > 1 ? "s" : ""} : <b>${q.retenus.map(esc).join(", ")}</b></p>` : ""}</article>`;
    }).join("") : `<p class="vide">Aucun temps supplémentaire ce mois-ci.</p>`;
  }
  function choisirTsVue(v) {
    hp.tsVue = v;
    $$("[data-hp-tsvue]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hpTsvue === v)));
    $("#hp-ts-poste").hidden = v !== "poste"; $("#hp-ts-offert").hidden = v === "poste";
    if (v === "poste") rendreTsPoste();
  }
  $$("[data-hp-tsvue]").forEach((b) => b.addEventListener("click", () => choisirTsVue(b.dataset.hpTsvue)));
  $("#hph-prec").addEventListener("click", () => { hp.hMois = isoPlus(hp.hMois, -1).slice(0, 7) + "-01"; rendreTsPoste(); });
  $("#hph-suiv").addEventListener("click", () => { hp.hMois = isoPlus(hp.hMois, 32).slice(0, 7) + "-01"; rendreTsPoste(); });
  const jourLong = (iso) => new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  const jourCourt = (iso) => new Date(iso + "T12:00").toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
  const heuresQ = (q) => q.debut && q.fin ? `${q.debut}–${q.fin}` : "Heures à confirmer";
  async function chargerPoste(forcer) {
    if (!hp.debut) hp.debut = aujourdhuiISO();
    const de = [hp.debut, aujourdhuiISO()].sort()[0], a = [isoPlus(hp.debut, 13), isoPlus(aujourdhuiISO(), 90)].sort()[1];
    if (!forcer && hp.de && hp.de <= de && hp.a >= a) return rendrePoste();
    const { data, error } = await sb.rpc("horaire_poste_liste", { p_debut: de, p_fin: a });
    if (error) { toast(traduireErreur(error)); return; }
    hp.quarts = data || []; hp.de = de; hp.a = a;
    rendrePoste();
  }
  function majPastilleTs() {
    const n = hp.quarts.filter((q) => q.est_ts && q.statut === "ouvert" && q.jour >= aujourdhuiISO() && !q.moi_inscrit).length;
    $("#hp-pastille").hidden = !n; $("#hp-pastille").textContent = n;
  }
  function rendrePoste() {
    if (!hp.debut) hp.debut = aujourdhuiISO();
    const ts = hr.onglet === "ts";
    $("#hp-onglet-poste").hidden = ts; $("#hp-onglet-ts").hidden = !ts;
    if (ts && hp.tsVue === "poste") { $("#hp-prec").parentElement.hidden = true; return rendreTsPoste(); }
    $("#hp-prec").parentElement.hidden = ts;
    majPastilleTs();
    if (!ts) {
      const fin = isoPlus(hp.debut, 6);
      $("#hp-periode").textContent = `${jourCourt(hp.debut)} – ${jourCourt(fin)}`;
      const jours = Array.from({ length: 7 }, (_, i) => isoPlus(hp.debut, i));
      const parJour = (iso) => hp.quarts.filter((q) => q.jour === iso);
      const rien = jours.every((j) => !parJour(j).length);
      $("#hp-jours").innerHTML = rien ? `<p class="vide">Aucun horaire publié pour cette semaine. Touchez « Publier un horaire de travail » pour ajouter celui du poste.</p>`
        : jours.map((j) => `<section class="panneau hp-jour${j === aujourdhuiISO() ? " auj" : ""}${parJour(j).length ? "" : " vide"}"><h4>${esc(jourLong(j))}</h4>${parJour(j).length ? `<ul>${parJour(j).map((q) => `
          <li class="${q.est_ts ? "hp-ts-ligne" : ""}"><span class="hp-h">${esc(heuresQ(q))}</span><b class="code-${esc(q.code)}">${esc(q.code)}</b>
          <span class="hp-m">${q.est_ts ? (q.statut === "attribue" ? "TS attribué" : `TS offert · ${q.places} place${q.places > 1 ? "s" : ""}`) : esc(q.matricule || "—")}</span></li>`).join("")}</ul>` : `<small>Aucun quart</small>`}</section>`).join("");
      const pubs = [...new Map(hp.quarts.map((q) => [q.horaire, q])).values()];
      $("#hp-publications").innerHTML = pubs.length ? `<h3 class="intertitre">Horaires publiés</h3>` + pubs.map((q) => `<div class="hp-pub"><span><b>${esc(q.titre || "Horaire du poste")}</b><small>Publié le ${esc(new Date(q.publie_le).toLocaleDateString("fr-CA", { day: "numeric", month: "long" }))}${q.publie_par_moi ? " · par vous" : ""}</small></span>${q.publie_par_moi || estAdmin() ? `<button type="button" class="lien rouge" data-hp-retirer="${esc(q.horaire)}">Retirer</button>` : ""}</div>`).join("") : "";
    } else {
      const auj = aujourdhuiISO();
      const offerts = hp.quarts.filter((q) => q.est_ts && q.jour >= auj);
      $("#hp-ts").innerHTML = offerts.length ? offerts.map((q) => {
        const inscrits = (q.inscrits || []).filter((i) => i.statut !== "retire");
        const moi = q.moi_inscrit;
        const etatMoi = moi === "retenu" ? `<span class="hp-etat ok">Vous l'avez obtenu</span>` : moi === "non_retenu" ? `<span class="hp-etat">Non retenu</span>` : moi === "inscrit" ? `<span class="hp-etat inscrit">Inscrit</span>` : "";
        return `<article class="panneau hp-carte"><div class="hp-carte-tete"><b>${esc(jourLong(q.jour))}</b>${etatMoi}</div>
          <p>${esc(heuresQ(q))} · ${esc(q.code)} · ${q.places} place${q.places > 1 ? "s" : ""} · ${inscrits.length} inscrit${inscrits.length > 1 ? "s" : ""}</p>
          ${q.statut === "ouvert" ? (moi === "inscrit" ? `<button type="button" class="btn-secondaire" data-hp-inscrire="${esc(q.id)}" data-v="0">Me désinscrire</button>` : `<button type="button" class="btn-principal" data-hp-inscrire="${esc(q.id)}" data-v="1">M'inscrire${etat.profil && etat.profil.matricule ? ` (matricule ${esc(etat.profil.matricule)})` : ""}</button>`) : `<p class="aide">Attribué.</p>`}
        </article>`;
      }).join("") : `<p class="vide">Aucun temps supplémentaire offert pour l'instant.</p>`;
      const aApprouver = offerts.filter((q) => q.statut === "ouvert" && (q.inscrits || []).some((i) => i.statut === "inscrit"));
      $("#hp-approb").innerHTML = aApprouver.length ? aApprouver.map((q) => {
        const ins = q.inscrits.filter((i) => i.statut === "inscrit");
        return `<article class="panneau hp-carte" data-hp-q="${esc(q.id)}"><div class="hp-carte-tete"><b>${esc(jourLong(q.jour))}</b><span class="hp-etat">${q.places} place${q.places > 1 ? "s" : ""}</span></div>
          <p>${esc(heuresQ(q))} · ${esc(q.code)}</p>
          <ol class="hp-inscrits">${ins.map((i, k) => `<li><label><input type="checkbox" data-hp-u="${esc(i.id)}"${k < q.places ? " checked" : ""}> Matricule <b>${esc(i.matricule || "?")}</b>${i.moi ? " (vous)" : ""}${i.anciennete_connue ? "" : ` <small>ancienneté non inscrite</small>`}</label></li>`).join("")}</ol>
          <p class="aide">Ordre proposé : ancienneté (date d'entrée à la SQ dans Mon compte), puis ordre d'inscription.</p>
          <button type="button" class="btn-principal" data-hp-approuver="${esc(q.id)}">Approuver et aviser</button></article>`;
      }).join("") : `<p class="vide">Aucune inscription à approuver.</p>`;
      const mer = new Date().getDay() === 3;
      $("#hp-mercredi").hidden = !(mer && aApprouver.length);
      $("#hp-mercredi").textContent = `C'est mercredi : ${aApprouver.length} quart${aApprouver.length > 1 ? "s" : ""} de TS à approuver.`;
    }
  }
  $("#hp-prec").addEventListener("click", () => { hp.debut = isoPlus(hp.debut, -7); chargerPoste(); });
  $("#hp-suiv").addEventListener("click", () => { hp.debut = isoPlus(hp.debut, 7); chargerPoste(); });
  $("#hr-poste-vue").addEventListener("click", async (e) => {
    const ins = e.target.closest("[data-hp-inscrire]");
    if (ins) {
      ins.disabled = true;
      const { error } = await sb.rpc("ts_inscrire", { p_quart: ins.dataset.hpInscrire, p_inscrire: ins.dataset.v === "1" });
      if (error) { ins.disabled = false; return toast(traduireErreur(error)); }
      toast(ins.dataset.v === "1" ? "Inscrit. Vous serez avisé si vous obtenez ce TS." : "Désinscrit.");
      return chargerPoste(true);
    }
    const ap = e.target.closest("[data-hp-approuver]");
    if (ap) {
      const carte = ap.closest("[data-hp-q]");
      const ids = $$("[data-hp-u]:checked", carte).map((c) => c.dataset.hpU);
      if (!ids.length) return toast("Cochez au moins un agent.");
      if (!confirm(`Attribuer ce TS à ${ids.length} agent${ids.length > 1 ? "s" : ""} ? ${ids.length > 1 ? "Ils seront avisés" : "L'agent sera avisé"} et le quart s'ajoutera à son horaire.`)) return;
      ap.disabled = true;
      const { error } = await sb.rpc("ts_attribuer", { p_quart: ap.dataset.hpApprouver, p_retenus: ids });
      if (error) { ap.disabled = false; return toast(traduireErreur(error)); }
      toast("TS attribué. Les agents retenus sont avisés.");
      return chargerPoste(true).then(integrerTsRetenus);
    }
    const ret = e.target.closest("[data-hp-retirer]");
    if (ret) {
      if (!confirm("Retirer cet horaire du poste ? Les TS encore ouverts seront annulés.")) return;
      const { error } = await sb.rpc("horaire_poste_retirer", { p_horaire: ret.dataset.hpRetirer });
      if (error) return toast(traduireErreur(error));
      toast("Horaire retiré."); chargerPoste(true);
    }
  });
  // TS obtenus : ajoutés à l'horaire personnel selon la rotation (avant ou après le quart, ou journée de TS)
  async function integrerTsRetenus() {
    if (!(estSQ() || estAdmin()) || !hr.chargé) return;
    const { data, error } = await sb.rpc("mes_ts_retenus");
    if (error || !data || !data.length) return;
    let n = 0;
    for (const t of data) {
      const iso = t.jour;
      const ex = { ...(hr.exceptions[iso] || {}) };
      const q = quartDu(iso, hr);
      const h = heuresJour(q.code, iso, hr);
      const bloc = t.debut && t.fin ? { debut: t.debut, fin: t.fin } : null;
      if (h && bloc && ["J", "S", "N"].includes(q.code)) {
        // Collé à un quart régulier : TS avant ou après le quart
        if (bloc.fin <= h[0] && !(ex.tspAvant && ex.tspAvant.debut)) { ex.tspAvant = bloc; if (!hr.exceptions[iso]) ex.type = q.code; }
        else if (!(ex.tsp && ex.tsp.debut)) { ex.tsp = bloc; if (!hr.exceptions[iso]) ex.type = q.code; }
        else continue;
        ex.note = [ex.note, "TS du poste"].filter(Boolean).join(" · ");
      } else {
        Object.assign(ex, { type: "X", ...(bloc || {}), note: [ex.note, "TS du poste"].filter(Boolean).join(" · ") });
      }
      hr.exceptions[iso] = ex; n++;
      await sb.rpc("ts_integre", { p_quart: t.quart });
    }
    if (n) { await sauverHoraire(); rendreHoraire(); toast(`${n} TS obtenu${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} à votre horaire.`); }
  }
  // Publication : formulaire, lignes modifiables, lecture d'une photo
  const CODES_PUB = ["J", "S", "N", "X"];
  function ligneQuartPub(q = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="date" class="pq-jour" value="${esc(q.jour || "")}" required></td>
      <td><input type="time" class="pq-debut" value="${esc(q.debut || "")}"></td><td><input type="time" class="pq-fin" value="${esc(q.fin || "")}"></td>
      <td><input class="pq-code" maxlength="3" value="${esc(q.code || (q.ts ? "X" : "J"))}" list="pub-codes" autocapitalize="characters"></td>
      <td><input class="pq-mat" maxlength="12" inputmode="numeric" value="${esc(q.matricule || "")}" ${q.ts ? "disabled" : ""}></td>
      <td><input type="checkbox" class="pq-ts" ${q.ts ? "checked" : ""} aria-label="Temps supplémentaire offert"></td>
      <td><input type="number" class="pq-places" min="1" max="20" value="${q.places || 1}" ${q.ts ? "" : "disabled"}></td>
      <td><button type="button" class="btn-icone pq-suppr" aria-label="Retirer ce quart">✕</button></td>`;
    if (q.auto) tr.classList.add("ct-auto-ligne");
    return tr;
  }
  function majComptePub() { const n = $$("#pub-table tbody tr").length; $("#pub-compte").textContent = `${n} quart${n > 1 ? "s" : ""}`; }
  function ouvrirPublication() {
    const lun = isoPlus(lundiDe(aujourdhuiISO()), 7);
    $("#pub-debut").value = lun; $("#pub-fin").value = isoPlus(lun, 13); $("#pub-titre").value = "";
    $("#pub-table tbody").innerHTML = ""; $("#pub-table tbody").appendChild(ligneQuartPub({ jour: lun })); majComptePub();
    if (!$("#pub-codes")) { const dl = document.createElement("datalist"); dl.id = "pub-codes"; dl.innerHTML = CODES_PUB.map((c) => `<option value="${c}">`).join(""); document.body.appendChild(dl); }
    $("#pub-photo-etat").textContent = "La photo est lue sur cet appareil, puis effacée : elle n'est jamais envoyée ni gardée. Vérifiez et corrigez les quarts lus avant de publier.";
    // Heures par code : celles de ma rotation, si je l'ai configurée
    const hc = (hr.config && hr.config.heures) || {};
    for (const c of ["J", "S", "N"]) if (hc[c]) { $(`[data-ph-deb="${c}"]`).value = hc[c][0]; $(`[data-ph-fin="${c}"]`).value = hc[c][1]; }
    $("#pub-voile").hidden = false;
  }
  $("#hp-publier").addEventListener("click", ouvrirPublication);
  $("#pub-heures-ok").addEventListener("click", () => {
    let n = 0;
    for (const tr of $$("#pub-table tbody tr")) {
      const c = $(".pq-code", tr).value.trim().toUpperCase();
      const d = $(`[data-ph-deb="${CSS.escape(c)}"]`), f = $(`[data-ph-fin="${CSS.escape(c)}"]`);
      if (!d || !f || !d.value || !f.value || $(".pq-debut", tr).value || $(".pq-fin", tr).value) continue;
      $(".pq-debut", tr).value = d.value; $(".pq-fin", tr).value = f.value; n++;
    }
    toast(n ? `Heures ajoutées à ${n} quart${n > 1 ? "s" : ""}.` : "Aucun quart sans heures pour ces codes.");
  });
  $("#pub-fermer").addEventListener("click", () => ($("#pub-voile").hidden = true));
  $("#pub-ajouter").addEventListener("click", () => {
    const rows = $$("#pub-table tbody tr"), der = rows[rows.length - 1];
    $("#pub-table tbody").appendChild(ligneQuartPub({ jour: der ? $(".pq-jour", der).value : $("#pub-debut").value, debut: der ? $(".pq-debut", der).value : "", fin: der ? $(".pq-fin", der).value : "", code: der ? $(".pq-code", der).value : "J" }));
    majComptePub();
  });
  $("#pub-table").addEventListener("click", (e) => { const b = e.target.closest(".pq-suppr"); if (b) { b.closest("tr").remove(); majComptePub(); } });
  $("#pub-table").addEventListener("change", (e) => {
    if (!e.target.classList.contains("pq-ts")) return;
    const tr = e.target.closest("tr"), ts = e.target.checked;
    $(".pq-mat", tr).disabled = ts; if (ts) $(".pq-mat", tr).value = "";
    $(".pq-places", tr).disabled = !ts;
    if (ts && ["J", "S", "N", ""].includes($(".pq-code", tr).value)) $(".pq-code", tr).value = "X";
  });
  $("#pub-ok").addEventListener("click", async () => {
    const debut = $("#pub-debut").value, fin = $("#pub-fin").value;
    if (!debut || !fin || fin < debut) return toast("Choisissez la période de l'horaire.");
    const quarts = [];
    for (const tr of $$("#pub-table tbody tr")) {
      const q = { jour: $(".pq-jour", tr).value, debut: $(".pq-debut", tr).value, fin: $(".pq-fin", tr).value, code: $(".pq-code", tr).value.trim().toUpperCase(), matricule: $(".pq-mat", tr).value.trim(), ts: $(".pq-ts", tr).checked, places: +$(".pq-places", tr).value || 1 };
      if (!q.jour) return toast("Chaque quart doit avoir une date.");
      if (q.jour < debut || q.jour > fin) return toast(`Le quart du ${q.jour} est hors de la période.`);
      if (!/^[A-Z]{1,3}$/.test(q.code)) return toast(`Code invalide pour le quart du ${q.jour}.`);
      if (q.matricule && !/^[A-Za-z0-9-]{1,12}$/.test(q.matricule)) return toast(`Matricule invalide pour le quart du ${q.jour}.`);
      if (!q.ts && !q.matricule) return toast(`Le quart du ${q.jour} n'a ni matricule ni TS : ajoutez le matricule de l'agent ou cochez TS.`);
      quarts.push(q);
    }
    if (!quarts.length) return toast("Ajoutez au moins un quart.");
    $("#pub-ok").disabled = true;
    const { error } = await sb.rpc("horaire_poste_publier", { p_debut: debut, p_fin: fin, p_titre: $("#pub-titre").value, p_quarts: quarts });
    $("#pub-ok").disabled = false;
    if (error) return toast(traduireErreur(error));
    $("#pub-voile").hidden = true;
    toast("Horaire publié. Les membres du poste sont avisés.");
    hp.debut = debut; chargerPoste(true);
  });
  // Lecture d'une photo d'horaire : dates, heures, codes, matricules et TS, à vérifier avant de publier
  function analyserHoraire(lignes, debutIso) {
    const rangees = rangeesTexte(lignes);
    const deux = (x) => String(x).padStart(2, "0");
    const dateDe = dateDePeriode(debutIso);
    const JOURS = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 0 };
    const trouverDates = (t) => {
      const n = normIA(t), res = [];
      let m;
      const re1 = /\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/g; while ((m = re1.exec(n))) { const d = dateDe(+m[3], +m[2], +m[1]); if (d) res.push(d); }
      const re2 = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](20\d\d))?\b/g; while ((m = re2.exec(n))) { const d = dateDe(+m[1], +m[2], m[3] ? +m[3] : null); if (d) res.push(d); }
      const re3 = /\b(\d{1,2})(?:er)?\s+(janv|fevr?|mars|avr|mai|juin|juil|aout|sept?|oct|nov|dec)[a-z]*\b/g; while ((m = re3.exec(n))) { const mo = MOIS_FR[m[2]] || MOIS_FR[m[2].slice(0, 3)]; const d = mo && dateDe(+m[1], mo); if (d) res.push(d); }
      if (!res.length) { // « lun 27 » : jour de la semaine et quantième, dans la période
        const re4 = /\b(lun|mar|mer|jeu|ven|sam|dim)[a-z]*\.?\s+(\d{1,2})\b/g;
        while ((m = re4.exec(n))) { for (let k = 0; k < 62; k++) { const iso = isoPlus(debutIso, k - 7); if (+iso.slice(8) === +m[2] && new Date(iso + "T12:00").getDay() === JOURS[m[1]]) { res.push(iso); break; } } }
      }
      return res;
    };
    const quarts = [];
    // Horaire en liste : une ligne par quart (date, heures, code, matricule ou TS)
    let contexte = null;
    for (const r of rangees) {
      const dates = trouverDates(r);
      const plages = [];
      const reH = /\b([01]?\d|2[0-3])\s?[:hH]\s?([0-5]\d)?\s?(?:-|–|—|à|a|au)\s?([01]?\d|2[0-3])\s?[:hH]\s?([0-5]\d)?/g;
      let m; while ((m = reH.exec(r))) plages.push([`${deux(m[1])}:${m[2] || "00"}`, `${deux(m[3])}:${m[4] || "00"}`]);
      if (dates.length === 1 && !plages.length) { contexte = dates[0]; }
      const jour = dates[0] || contexte;
      if (!jour) continue;
      const sansDates = r.replace(/\b20\d\d[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}(?:[/.-]20\d\d)?\b/g, " ").replace(reH, " ");
      const code = ((sansDates.match(/\b(JR|NT|[JSNX])\b/) || [])[1] || "").replace("JR", "J").replace("NT", "N");
      const ts = /\b(t\.?\s?s\.?|temps\s+supp|offert|disponible|à combler|a combler|vacant)\b/i.test(r);
      const mats = (sansDates.match(/\b\d{4,6}\b/g) || []).filter((x) => !/^20\d\d$/.test(x));
      if (!plages.length && !code && !ts) continue;
      const [debut, fin] = plages[0] || ["", ""];
      if (ts && !mats.length) quarts.push({ jour, debut, fin, code: "X", ts: true, places: Math.max(1, (r.match(/\?/g) || []).length), auto: true });
      else if (mats.length) mats.forEach((mat) => quarts.push({ jour, debut, fin, code: code || (ts ? "X" : "J"), matricule: mat, ts: false, auto: true }));
      else if (plages.length || code) quarts.push({ jour, debut, fin, code: code || "J", matricule: "", ts: false, auto: true });
    }
    return quarts;
  }
  // Date « jj/mm » sans année : l'année la plus proche de la période publiée
  function dateDePeriode(debutIso) {
    const an0 = +debutIso.slice(0, 4), mois0 = +debutIso.slice(5, 7), deux = (x) => String(x).padStart(2, "0");
    return (j, m, a) => { a = a || (m < mois0 - 6 ? an0 + 1 : m > mois0 + 6 ? an0 - 1 : an0); return dateValide(a, m, j) ? `${a}-${deux(m)}-${deux(j)}` : null; };
  }
  // Grille : rangée d'en-tête avec les jours (jj/mm ou quantièmes consécutifs) et une rangée par matricule ou par TS
  function detecterGrille(mots, debutIso) {
    const dateDe = dateDePeriode(debutIso);
    const ms = mots.filter((m) => m.t && m.t.trim()).map((m) => ({ ...m, t: m.t.trim(), cx: m.x + m.w / 2, cy: m.y + m.h / 2 }));
    const rangs = [];
    for (const m of [...ms].sort((a, b) => a.cy - b.cy)) {
      const r = rangs.find((x) => Math.abs(x.y - m.cy) < Math.max(6, m.h * 0.6));
      if (r) r.m.push(m); else rangs.push({ y: m.cy, h: m.h, m: [m] });
    }
    rangs.forEach((r) => r.m.sort((a, b) => a.cx - b.cx));
    let entete = null, colonnes = null;
    for (const r of rangs) {
      const dates = r.m.map((m) => { const x = normIA(m.t).match(/^(\d{1,2})[/.-](\d{1,2})$/); return x ? { m, iso: dateDe(+x[1], +x[2]) } : null; }).filter((x) => x && x.iso);
      if (dates.length >= 4) { entete = r; colonnes = dates.map((d) => ({ x: d.m.cx, iso: d.iso })); break; }
      const nums = r.m.filter((m) => /^\d{1,2}$/.test(m.t)).map((m) => ({ m, n: +m.t }));
      let suite = [];
      for (const x of nums) { if (!suite.length || x.n === suite[suite.length - 1].n + 1 || (x.n === 1 && suite[suite.length - 1].n >= 28)) suite.push(x); else suite = [x]; if (suite.length >= 5) break; }
      if (suite.length < 5) continue;
      let iso = null; for (let k = -7; k < 40 && !iso; k++) { const c = isoPlus(debutIso, k); if (+c.slice(8) === suite[0].n) iso = c; }
      if (!iso) continue;
      entete = r; colonnes = nums.slice(nums.indexOf(suite[0])).slice(0, 62).map((x, k) => ({ x: x.m.cx, iso: isoPlus(iso, k) }));
      break;
    }
    if (!entete || colonnes.length < 4) return null;
    const pas = (colonnes[colonnes.length - 1].x - colonnes[0].x) / Math.max(1, colonnes.length - 1);
    const rangees = [];
    for (const r of rangs) {
      if (r.y <= entete.y + entete.h * 0.5) continue;
      const etiquette = normIA(r.m.filter((m) => m.cx < colonnes[0].x - pas * 0.5).map((m) => m.t).join(" "));
      const mat = (etiquette.match(/\b(\d{4,6})\b/) || [])[1] || "";
      const ts = /\b(t\.?\s?s\.?|temps\s+supp|offert|a combler|vacant)\b/.test(etiquette);
      if (mat || ts) rangees.push({ y: r.y, h: r.h, mat, ts });
    }
    if (!rangees.length) return null;
    const ecarts = rangees.slice(1).map((r, k) => r.y - rangees[k].y).sort((a, b) => a - b);
    const hauteur = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)] : rangees[0].h * 3;
    return { colonnes, rangees, pas, hauteur };
  }
  let tesseractCharge = null;
  function chargerTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return (tesseractCharge ||= new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = ok; s.onerror = () => { tesseractCharge = null; ko(new Error("Le module de lecture n'a pas pu être chargé.")); }; document.head.appendChild(s); }));
  }
  // Lecture d'une photo d'horaire, sur l'appareil : grille (case par case) ou liste (ligne par ligne)
  async function lireHoraire(canvas, debutIso, progres) {
    await chargerTesseract();
    let w = null, echec;
    const erreur = new Promise((_, ko) => { echec = ko; setTimeout(() => ko(new Error("délai dépassé")), 180000); });
    try {
      w = await Promise.race([window.Tesseract.createWorker("fra", 1, { errorHandler: (e) => echec(new Error(String((e && e.message) || e))) }), erreur]);
      await w.setParameters({ tessedit_pageseg_mode: "11" });
      const a = await Promise.race([w.recognize(canvas), erreur]);
      const mots = (a.data.words || []).map((m) => ({ t: m.text, x: m.bbox.x0, y: m.bbox.y0, w: m.bbox.x1 - m.bbox.x0, h: m.bbox.y1 - m.bbox.y0 }));
      const g = detecterGrille(mots, debutIso);
      if (g) {
        await w.setParameters({ tessedit_pageseg_mode: "10", tessedit_char_whitelist: "JSNXT0123456789" });
        const quarts = [], total = g.rangees.length * g.colonnes.length;
        let k = 0;
        for (const r of g.rangees) for (const c of g.colonnes) {
          k++; if (progres && k % 4 === 0) progres(`Lecture des cases : ${k} / ${total}`);
          const larg = g.pas * 0.5, haut = Math.min(g.hauteur * 0.6, r.h * 2.2);
          const rect = { left: Math.max(0, Math.round(c.x - larg / 2)), top: Math.max(0, Math.round(r.y - haut / 2)), width: Math.round(larg), height: Math.round(haut) };
          const { data } = await Promise.race([w.recognize(canvas, { rectangle: rect }), erreur]);
          const t = (data.text || "").replace(/[^A-Z0-9]/g, "");
          if (!t) continue;
          // Rangée de TS : « TS », « X » ou un nombre de places (2 à 9); un trait de bordure lu comme « 1 » ou « T » est ignoré
          if (r.ts) { if (/^(TS|X|[2-9])$/.test(t)) quarts.push({ jour: c.iso, debut: "", fin: "", code: "X", ts: true, places: /^[2-9]$/.test(t) ? +t : 1, auto: true }); continue; }
          const code = t === "TS" ? "X" : t.replace(/^JR$/, "J").replace(/^NT$/, "N");
          if (/^[JSNX]$/.test(code)) quarts.push({ jour: c.iso, debut: "", fin: "", code, matricule: r.mat, ts: false, auto: true });
        }
        return { quarts, mode: "grille" };
      }
      await w.setParameters({ tessedit_pageseg_mode: "3" });
      const b = await Promise.race([w.recognize(canvas), erreur]);
      const lignes = (b.data.lines || []).map((l) => ({ t: l.text, x: l.bbox.x0 / canvas.width, y: l.bbox.y0 / canvas.height, w: (l.bbox.x1 - l.bbox.x0) / canvas.width, h: (l.bbox.y1 - l.bbox.y0) / canvas.height }));
      return { quarts: analyserHoraire(lignes, debutIso), mode: "liste" };
    } finally { if (w) w.terminate().catch(() => {}); }
  }
  $("#pub-photo").addEventListener("click", () => $("#pub-photo-fichier").click());
  $("#pub-photo-fichier").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const etatP = $("#pub-photo-etat"), btn = $("#pub-photo");
    btn.disabled = true; etatP.textContent = "Lecture de l'horaire… (la première fois, le module de lecture se télécharge : quelques secondes)";
    let canvas = null, lignes = null;
    try {
      canvas = await preparerPhoto(f);
      const lu = await lireHoraire(canvas, $("#pub-debut").value || aujourdhuiISO(), (t) => (etatP.textContent = t));
      const qs = lu.quarts;
      if (!qs.length) { etatP.textContent = "Aucun quart reconnu. Reprenez la photo bien à plat et éclairée, ou entrez les quarts à la main."; return; }
      const jours = qs.map((q) => q.jour).sort();
      $("#pub-debut").value = jours[0] < $("#pub-debut").value ? jours[0] : $("#pub-debut").value;
      if (jours[jours.length - 1] > $("#pub-fin").value) $("#pub-fin").value = jours[jours.length - 1];
      const tb = $("#pub-table tbody");
      // La ligne vide de départ est remplacée
      $$("tr", tb).forEach((tr) => { if (!$(".pq-mat", tr).value && !$(".pq-debut", tr).value && !$(".pq-ts", tr).checked) tr.remove(); });
      qs.forEach((q) => tb.appendChild(ligneQuartPub(q)));
      majComptePub();
      etatP.textContent = `${qs.length} quart${qs.length > 1 ? "s" : ""} lu${qs.length > 1 ? "s" : ""} sur la photo (${lu.mode === "grille" ? "horaire en grille" : "horaire en liste"}, lignes surlignées). Vérifiez chaque ligne avant de publier${lu.mode === "grille" ? " et ajoutez les heures des quarts" : ""}. La photo a été effacée.`;
    } catch (err) {
      etatP.textContent = "Lecture impossible : " + String((err && err.message) || err).replace(/^Error:\s*/, "") + ". Entrez les quarts à la main.";
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      lignes = null; btn.disabled = false;
    }
  });

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
    const { data: invs } = await sb.rpc("admin_invitations");
    const invitePar = new Map((invs || []).map((x) => [x.id, x.invite_par_nom]));
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
              ${invitePar.get(p.id) ? `<span class="etiquette-invite">Invité par ${esc(invitePar.get(p.id))}</span>` : ""}
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

  // Clavier ouvert (téléphone) : on cache la barre d'onglets du bas pour qu'elle ne couvre pas la zone d'écriture
  const champTexte = (el) => el && (el.tagName === "TEXTAREA" || el.isContentEditable ||
    (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|date|time|datetime-local|month|week)$/i.test(el.type)));
  // iPhone : le clavier ne réduit pas l'écran de l'app (position fixe). On ajuste l'app à la zone visible
  // au-dessus du clavier (visualViewport), pour que la zone d'écriture reste toujours visible.
  const vv = window.visualViewport;
  const ajusterClavier = () => {
    const r = document.documentElement;
    if (!vv || !r.classList.contains("clavier")) { r.style.removeProperty("--vv-h"); r.style.removeProperty("--vv-top"); return; }
    r.style.setProperty("--vv-h", Math.round(vv.height) + "px");
    r.style.setProperty("--vv-top", Math.round(vv.offsetTop) + "px");
    const fil = document.getElementById("chat-fil");
    if (fil && document.activeElement && document.activeElement.closest && document.activeElement.closest("#vue-messages")) fil.scrollTop = fil.scrollHeight;
  };
  if (vv) { vv.addEventListener("resize", ajusterClavier); vv.addEventListener("scroll", ajusterClavier); }
  document.addEventListener("focusin", (e) => {
    if (!champTexte(e.target)) return;
    document.documentElement.classList.add("clavier");
    ajusterClavier(); setTimeout(ajusterClavier, 300); setTimeout(ajusterClavier, 650);
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (champTexte(document.activeElement)) return;
      document.documentElement.classList.remove("clavier"); ajusterClavier();
      window.scrollTo(0, 0);
    }, 120);
  });

  demarrer();
})();
