/* Police Management — décor de saison en arrière-plan (17 novembre 2026)
   Temps des Fêtes (15 novembre au 6 janvier) : beaucoup de flocons · Hiver : flocons · Printemps : pétales
   Été : lucioles · Automne : feuilles d'érable.
   Derrière tout le contenu, jamais cliquable. Désactivé en mode nuit rouge, si l'appareil demande moins
   d'animations ou quand l'onglet est caché. Aucun réglage pour les membres : seul DECOR_ACTIF ci-dessous le retire. */
(() => {
  "use strict";
  const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

  function saisonDu(d) {
    const force = lire("pm-saison-force"); // essais seulement : hiver, noel, printemps, ete, automne
    if (force) return force;
    const m = d.getMonth() + 1, j = d.getDate(), v = m * 100 + j;
    if (v >= 1115 || v <= 106) return "noel";
    if (v <= 319) return "hiver";
    if (v <= 620) return "printemps";
    if (v <= 921) return "ete";
    return "automne";
  }

  const toile = document.createElement("canvas");
  toile.id = "decor-saison";
  toile.setAttribute("aria-hidden", "true");
  const ctx = toile.getContext("2d");
  let L = 0, H = 0, dpr = 1, parts = [], saison = "", clair = false, anim = 0, dernier = 0, actif = false;

  const moinsMouvement = matchMedia("(prefers-reduced-motion: reduce)");
  // Décidé dans le code seulement (aucun réglage pour les membres). Mettre false pour retirer le décor pour tout le monde.
  const DECOR_ACTIF = true;
  const voulu = () => DECOR_ACTIF && !moinsMouvement.matches && document.documentElement.dataset.style !== "nuit";

  function fondClair() {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!c) return false;
    const [r, g, b] = c.map(Number);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }

  const hasard = (a, b) => a + Math.random() * (b - a);
  function nouvelle(depart) {
    const p = { x: hasard(0, L), y: depart ? hasard(-H, 0) : hasard(0, H), t: hasard(0, Math.PI * 2) };
    if (saison === "noel" || saison === "hiver") {
      p.r = hasard(1.5, 4.2); p.vy = hasard(18, 45) * (p.r / 3); p.vx = hasard(-8, 8); p.a = hasard(.35, .85); p.cristal = p.r > 3.3;
    } else if (saison === "automne") {
      p.r = hasard(8, 14); p.vy = hasard(22, 40); p.vx = hasard(-10, 10); p.rot = hasard(0, 6.3); p.vr = hasard(-1.2, 1.2);
      p.c = ["#D9481C", "#E8792A", "#C0392B", "#F2A33A", "#A93A1F"][Math.floor(Math.random() * 5)]; p.a = hasard(.45, .75);
    } else if (saison === "printemps") {
      p.r = hasard(3, 6); p.vy = hasard(14, 28); p.vx = hasard(4, 14); p.rot = hasard(0, 6.3); p.vr = hasard(-1, 1);
      p.c = ["#F7B7C8", "#FBD3DE", "#F49AB3", "#FFFFFF"][Math.floor(Math.random() * 4)]; p.a = hasard(.45, .8);
    } else { // été : lucioles qui flottent et clignotent
      p.y = hasard(H * .25, H); p.r = hasard(1.5, 2.8); p.vx = hasard(-8, 8); p.vy = hasard(-6, 6); p.f = hasard(.6, 1.6); p.a = 0;
    }
    return p;
  }
  function nombre() {
    const base = Math.min(1, (L * H) / (1280 * 800));
    const n = { noel: 110, hiver: 70, automne: 22, printemps: 26, ete: 28 }[saison] || 0;
    return Math.max(8, Math.round(n * (0.45 + 0.55 * base)));
  }
  function dimensionner() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = innerWidth; H = innerHeight;
    toile.width = Math.round(L * dpr); toile.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function peupler() { parts = Array.from({ length: nombre() }, () => nouvelle(false)); }

  function flocon(p, coul) {
    ctx.globalAlpha = p.a;
    if (!p.cristal) { ctx.fillStyle = coul; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill(); return; }
    ctx.strokeStyle = coul; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const an = p.t + i * Math.PI / 3, dx = Math.cos(an), dy = Math.sin(an), R = p.r * 1.9;
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * R, p.y + dy * R);
      const bx = p.x + dx * R * .55, by = p.y + dy * R * .55;
      ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an + .7) * R * .35, by + Math.sin(an + .7) * R * .35);
      ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an - .7) * R * .35, by + Math.sin(an - .7) * R * .35);
    }
    ctx.stroke();
  }
  function feuille(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .55 + .45 * Math.abs(Math.cos(p.t * 1.3)));
    ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.beginPath();
    const r = p.r; // feuille d'érable simplifiée : 5 lobes
    for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = p.a * .8; ctx.strokeStyle = p.c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, r * .3); ctx.lineTo(0, r * 1.15); ctx.stroke();
    ctx.restore();
  }
  function petale(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .5 + .5 * Math.abs(Math.sin(p.t)));
    ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .6, 0, 0, 6.2832); ctx.fill(); ctx.restore();
  }
  function luciole(p) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
    g.addColorStop(0, clair ? "rgba(214,160,20,1)" : "rgba(255,236,140,1)"); g.addColorStop(1, "rgba(255,220,90,0)");
    ctx.globalAlpha = p.a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.2832); ctx.fill();
  }

  function image(ms) {
    anim = requestAnimationFrame(image);
    if (ms - dernier < 33) return; // environ 30 images/s : léger pour la pile
    const dt = Math.min(.1, (ms - (dernier || ms)) / 1000); dernier = ms;
    ctx.clearRect(0, 0, L, H);
    const coulNeige = clair ? "rgba(120,150,190,1)" : "rgba(255,255,255,1)";
    for (const p of parts) {
      p.t += dt;
      if (saison === "ete") {
        p.vx += hasard(-12, 12) * dt; p.vy += hasard(-12, 12) * dt; p.vx = Math.max(-14, Math.min(14, p.vx)); p.vy = Math.max(-10, Math.min(10, p.vy));
        p.x += p.vx * dt; p.y += p.vy * dt; p.a = Math.max(0, Math.sin(p.t * p.f)) * .8;
        if (p.x < -20) p.x = L + 20; if (p.x > L + 20) p.x = -20; if (p.y < H * .15) p.vy = Math.abs(p.vy); if (p.y > H + 10) p.y = H * .3;
        luciole(p); continue;
      }
      p.x += (p.vx + Math.sin(p.t * .9) * 12) * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
      if (p.y > H + 20 || p.x < -30 || p.x > L + 30) Object.assign(p, nouvelle(true), { y: -15 });
      if (saison === "automne") feuille(p); else if (saison === "printemps") petale(p); else flocon(p, coulNeige);
    }
    ctx.globalAlpha = 1;
  }

  function demarrer() {
    if (anim) return;
    dernier = 0; anim = requestAnimationFrame(image);
  }
  function arreter() { if (anim) cancelAnimationFrame(anim); anim = 0; }

  function maj() {
    const doit = voulu();
    if (!doit) { arreter(); toile.remove(); actif = false; return; }
    if (!toile.isConnected) document.body.prepend(toile);
    const s = saisonDu(new Date());
    clair = fondClair();
    if (!actif || s !== saison) { saison = s; dimensionner(); peupler(); }
    actif = true;
    if (document.hidden) arreter(); else demarrer();
  }

  function init() {
    maj();
    let minut;
    addEventListener("resize", () => { clearTimeout(minut); minut = setTimeout(() => { if (actif) { dimensionner(); peupler(); } }, 200); });
    document.addEventListener("visibilitychange", maj);
    moinsMouvement.addEventListener && moinsMouvement.addEventListener("change", maj);
    // Changement de style ou de thème (mode nuit rouge, clair/sombre)
    new MutationObserver(() => setTimeout(maj, 50)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-style", "data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => setTimeout(maj, 50));
  }
  window.pmSaison = {
    nom: () => saisonDu(new Date()),
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
