/* Police Extrême — application principale */
(() => {
  "use strict";

  const C = window.PE_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`\-–—]/g, " ").replace(/\s+/g, " ").trim();
  const LEGIS = "https://www.legisquebec.gouv.qc.ca/fr/document/lc/C-24.2";

  const etat = { session: null, profil: null, vue: "csr", csr: null, corps: [], donnees: {}, carte: null };

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
    ["#ecran-chargement", "#ecran-auth", "#ecran-attente", "#ecran-mdp-temp", "#ecran-app"].forEach((id) => ($(id).hidden = id !== ecran));
  }
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
    if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre courriel : ouvrez le lien reçu par courriel, puis reconnectez-vous.";
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
  });

  $("#btn-oubli").addEventListener("click", async () => {
    const courriel = $("#cx-courriel").value.trim().toLowerCase();
    if (!courriel) return messageAuth("Écrivez votre courriel dans le champ ci-dessus, puis appuyez de nouveau sur « Mot de passe oublié ».", "erreur");
    const { error } = await sb.auth.resetPasswordForEmail(courriel, { redirectTo: urlRetour() });
    if (error) return messageAuth(traduireErreur(error), "erreur");
    messageAuth("Si ce courriel a un compte, un lien pour choisir un nouveau mot de passe vient d'y être envoyé.", "ok");
  });

  $("#form-demande").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const champs = { nom: $("#dm-nom"), matricule: $("#dm-matricule"), corps: $("#dm-corps"), courriel: $("#dm-courriel"), mdp: $("#dm-mdp") };
    if ($("#dm-corps").value && !$("#dm-poste").value) { $("#dm-poste").focus(); return messageAuth("Choisissez votre unité ou votre poste dans la liste.", "erreur"); }
    if ($("#dm-poste").value === AUTRE && !$("#dm-unite").value.trim()) { $("#dm-unite").focus(); return messageAuth("Précisez votre unité ou votre poste.", "erreur"); }
    for (const [k, el] of Object.entries(champs)) {
      if (!el.value.trim()) { el.focus(); return messageAuth("Remplissez tous les champs obligatoires.", "erreur"); }
      if (k === "courriel" && !el.checkValidity()) { el.focus(); return messageAuth("Le courriel n'est pas valide.", "erreur"); }
    }
    if (champs.mdp.value.length < 10) { champs.mdp.focus(); return messageAuth("Le mot de passe doit contenir au moins 10 caractères.", "erreur"); }
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
          corps_police: champs.corps.value,
          unite: uniteChoisie(),
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
      } else if (corps === "Contrôle routier Québec" || corps === "Autre") {
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
    if (!etat.session) { montrer("#ecran-auth"); return; }
    try {
      etat.profil = await chargerProfil();
    } catch (e) {
      montrer("#ecran-auth");
      messageAuth(traduireErreur(e), "erreur");
      return;
    }
    const p = etat.profil;
    if (!p || p.statut !== "approuve") {
      const st = p ? p.statut : "en_attente";
      $("#attente-titre").textContent = { refuse: "Demande refusée", bloque: "Compte bloqué" }[st] || "Demande en attente";
      $("#attente-texte").textContent = {
        refuse: "Votre demande d'accès n'a pas été acceptée. Communiquez avec l'administrateur si vous croyez qu'il s'agit d'une erreur.",
        bloque: "L'accès à ce compte a été bloqué par l'administrateur.",
      }[st] || "Votre demande a été reçue. Vous aurez accès dès que l'administrateur l'aura approuvée.";
      $("#attente-details").innerHTML = p
        ? `<dt>Nom</dt><dd>${esc(p.nom_complet || "—")}</dd><dt>Courriel</dt><dd>${esc(p.email)}</dd><dt>Matricule</dt><dd>${esc(p.matricule || "—")}</dd><dt>Corps</dt><dd>${esc(p.corps_police || "—")}</dd>`
        : "";
      montrer("#ecran-attente");
      if (manuel) toast(p && p.statut === "refuse" ? "Demande refusée" : "Toujours en attente");
      return;
    }
    if (p.doit_changer_mdp) { montrer("#ecran-mdp-temp"); $("#mt-mdp").focus(); return; }
    majBarreCompte();
    $("#nav-admin").hidden = p.role !== "admin";
    montrer("#ecran-app");
    const depart = (location.hash || "").replace("#", "");
    afficherVue(["csr", "carte", "corps", "compte", "aide", "admin"].includes(depart) && (depart !== "admin" || p.role === "admin") ? depart : "csr");
    chargerCorps();
    if (p.role === "admin") compterAttente();
  }

  sb.auth.onAuthStateChange((evenement, session) => {
    if (evenement === "PASSWORD_RECOVERY") { etat.session = session; formNouveauMdp(); return; }
    if (evenement === "SIGNED_IN" && (!etat.session || etat.session.user.id !== session.user.id)) { etat.session = session; demarrer(); }
    if (evenement === "SIGNED_OUT") { etat.session = null; montrer("#ecran-auth"); }
  });

  /* ---------------- Navigation ---------------- */
  function afficherVue(nom) {
    etat.vue = nom;
    $$(".nav button").forEach((b) => (b.dataset.vue === nom ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$(".vue").forEach((v) => (v.hidden = v.id !== "vue-" + nom));
    history.replaceState(null, "", "#" + nom);
    if (nom === "csr") initCsr();
    if (nom === "carte") initCarte();
    if (nom === "corps") initCorps();
    if (nom === "admin") initAdmin();
    if (nom === "compte") initCompte();
  }
  $("#btn-compte").addEventListener("click", () => afficherVue("compte"));
  $$(".nav button").forEach((b) => b.addEventListener("click", () => afficherVue(b.dataset.vue)));

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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

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
      p_nom: $("#mc-nom").value, p_matricule: $("#mc-matricule").value, p_corps: $("#mc-corps").value,
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

  /* ---------------- Code de la sécurité routière ---------------- */
  const RACCOURCIS = [
    ["Cellulaire", "443.1"], ["Vitesse", "vitesse excède"], ["Ceinture", "ceinture de sécurité"], ["Alcool", "alcool"],
    ["Feu rouge", "feu rouge"], ["Arrêt obligatoire", "panneau arrêt"], ["Pneus d'hiver", "pneus conçus spécifiquement pour la conduite hivernale"],
    ["Corridor de sécurité", "véhicule d'urgence immobilisé"], ["Permis", "permis de conduire"], ["Immatriculation", "immatriculation"],
    ["Délit de fuite", "accident"], ["Grand excès", "grand excès de vitesse"],
  ];

  async function initCsr() {
    if (etat.csr) return;
    etat.csr = [];
    $("#csr-raccourcis").innerHTML = RACCOURCIS.map(([l, q]) => `<button data-q="${esc(q)}">${esc(l)}</button>`).join("");
    $$("#csr-raccourcis button").forEach((b) => b.addEventListener("click", () => { $("#csr-q").value = b.dataset.q; chercherCsr(); }));
    $("#csr-etat").textContent = "Chargement du Code…";
    try {
      const tous = await charger("csr.json");
      etat.csr = tous.map((a) => ({ ...a, _n: norm(a.numero + " " + (a.section || "") + " " + a.texte) }));
    } catch (e) {
      $("#csr-etat").textContent = traduireErreur(e);
      return;
    }
    if (!etat.csr.length) {
      $("#csr-etat").innerHTML = `Le texte du Code n'est pas encore chargé dans Police Extrême. Consultez-le sur <a href="${LEGIS}" target="_blank" rel="noopener">LégisQuébec</a>.`;
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
        <span class="no-art">${esc(a.numero)}</span>
        <span class="extrait-bloc"><small>${esc(a.section || a.chapitre || a.titre || "")}</small><span class="extrait">${surligner(extrait(a, termes), termes)}</span></span>
      </button></li>`).join("");
    $$("#csr-liste button").forEach((b) => b.addEventListener("click", () => ouvrirArticle(etat.csr.find((a) => a.numero === b.dataset.no), termes)));
  }

  function ouvrirArticle(a, termes = []) {
    if (!a) return;
    const el = $("#csr-article");
    const ancre = "#se:" + a.numero.replace(/\./g, "_");
    el.innerHTML = `
      <p class="fil">${esc([a.titre, a.chapitre, a.section].filter(Boolean).join(" › "))}</p>
      <h3>${esc(a.numero)}</h3>
      <div class="texte">${surligner(a.texte, termes)}</div>
      <div class="outils-art">
        <button class="btn-secondaire" data-copier>Copier le texte</button>
        <a class="btn-secondaire" href="${LEGIS}${ancre}" target="_blank" rel="noopener">Texte officiel (LégisQuébec)</a>
        <button class="btn-secondaire" data-prec>‹ Précédent</button>
        <button class="btn-secondaire" data-suiv>Suivant ›</button>
      </div>`;
    el.hidden = false;
    $(".csr-corps").classList.add("avec-article");
    $$("#csr-liste button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.no === a.numero)));
    const i = etat.csr.indexOf(a);
    $("[data-copier]", el).addEventListener("click", () => copier(`CSR, art. ${a.numero}\n${a.texte}`));
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
      <button class="lien" data-copier-pos>Copier la position</button>`;
    f.hidden = false;
    $(".fermer", f).addEventListener("click", () => (f.hidden = true));
    $("[data-copier-pos]", f).addEventListener("click", () => copier(`${res.lat.toFixed(5)}, ${res.lon.toFixed(5)}`));
    $$("[data-copier-code]", f).forEach((b) => b.addEventListener("click", () => copier(b.dataset.copierCode)));
  }
  const dirNom = (d) => ({ N: "Nord", S: "Sud", E: "Est", O: "Ouest" }[d] || d);

  /* ---------------- Carte ---------------- */
  function initCarte() {
    if (etat.carte) { setTimeout(() => etat.carte.invalidateSize(), 50); return; }
    const carte = (etat.carte = L.map("carte", { zoomControl: true, preferCanvas: true }).setView([46.9, -71.8], 6));
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(carte);
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
        onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.NOM_ENT)}</b><br>${esc(f.properties.ADRESSE)}, ${esc(f.properties.MUNICIPALITE)} ${esc(f.properties.CODE_POST)}`),
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
    bascule("#c-sq", "sq", true); bascule("#c-mun", "mun"); bascule("#c-aut", "aut"); bascule("#c-km", "km"); bascule("#c-sorties", "sorties"); bascule("#c-bur", "bur"); bascule("#c-limites", "limites"); bascule("#c-cam", "cam");
    etat.surligne = L.layerGroup().addTo(carte);
    remplirChoixUnite();
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
    carte.on("click", (e) => etat.placer(e.latlng.lat, e.latlng.lng, "Point sélectionné"));
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
  $("#choix-unite").addEventListener("change", (e) => afficherUnite(e.target.value));

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
    etat.placer(best[4], best[3], titre, 15);
  });

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
  }

  let comptesAdmin = [];
  const dateFr = (d) => d ? new Date(d).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const NOM_STATUT = { en_attente: "En attente", approuve: "Approuvé", refuse: "Refusé", bloque: "Bloqué" };

  async function initAdmin() {
    if (!etat.profil || etat.profil.role !== "admin") return;
    const el = $("#admin-liste");
    const { data, error } = await sb.rpc("admin_liste_comptes");
    if (error) { el.innerHTML = `<p class="vide">${esc(traduireErreur(error))}</p>`; return; }
    comptesAdmin = data || [];
    const compte = (st) => comptesAdmin.filter((p) => p.statut === st).length;
    $("#nb-attente").textContent = compte("en_attente");
    $("#nb-approuve").textContent = compte("approuve");
    $("#nb-refuse").textContent = compte("refuse");
    $("#nb-bloque").textContent = compte("bloque");
    const b = $("#badge-attente"); b.textContent = compte("en_attente") || ""; b.hidden = !compte("en_attente");
    const liste = comptesAdmin.filter((p) => p.statut === filtreAdmin);
    const urls = await urlsAvatars(liste.map((p) => p.avatar_path));
    el.innerHTML = liste.length ? liste.map((p, i) => `
      <div class="demande">
        <div class="personne">
          ${htmlAvatar(p, urls[i])}
          <div>
            <h4>${esc(p.nom_complet || "(sans nom)")} ${p.role === "admin" ? '<span class="type SQ">admin</span>' : ""}</h4>
            <div class="meta">
              <span>${esc(p.email)}</span>
              <span>Matricule <b>${esc(p.matricule || "—")}</b></span>
              <span>${esc(p.corps_police || "—")}${p.unite ? " · " + esc(p.unite) : ""}</span>
              <span>Demande : ${esc(dateFr(p.cree_le))}</span>
            </div>
          </div>
        </div>
        <div class="boutons">
          ${p.statut === "en_attente" ? `<button class="btn-ok" data-id="${p.id}" data-statut="approuve">Approuver</button>
            <button class="btn-danger" data-id="${p.id}" data-statut="refuse">Refuser</button>` : ""}
          <button class="btn-secondaire" data-fiche="${p.id}">Voir le compte</button>
        </div>
      </div>`).join("")
      : `<p class="vide">${filtreAdmin === "en_attente" ? "Aucune demande en attente." : "Aucun compte dans cette catégorie."}</p>`;
    $$("button[data-statut]", el).forEach((btn) => btn.addEventListener("click", () => decider(btn, btn.dataset.id, btn.dataset.statut)));
    $$("button[data-fiche]", el).forEach((btn) => btn.addEventListener("click", () => ouvrirFiche(btn.dataset.fiche)));
    rendreAdminCorps();
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
        ${ligne("Matricule", esc(p.matricule || "—"))}
        ${ligne("Corps de police", esc(p.corps_police || "—"))}
        ${ligne("Unité / poste", esc(p.unite || "—"))}
        ${ligne("Demande", esc(dateFr(p.cree_le)))}
        ${ligne("Courriel confirmé", p.courriel_confirme_le ? esc(dateFr(p.courriel_confirme_le)) : "Non")}
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

  const LIEN_EDITION_CORPS = "https://github.com/asmqc/Police-Extreme/edit/main/data/corps_police.json";
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
