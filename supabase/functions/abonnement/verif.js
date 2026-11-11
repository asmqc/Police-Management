// Police Management — vérification des achats (sans bibliothèque externe, WebCrypto seulement).
// Apple : JWS signé (StoreKit 2 / App Store Server Notifications V2) avec la chaîne x5c jusqu'à l'Apple Root CA - G3.
// Google : jeton OAuth du compte de service (RS256) pour l'API Google Play Developer.

const te = new TextEncoder();
export const b64urlEnOctets = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const octetsEnB64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64EnOctets = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const egaux = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ---------- Lecture DER minimale ---------- */
function lire(b, o) {
  const tag = b[o];
  let len = b[o + 1], p = o + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p + i]; p += n; }
  return { tag, debut: o, contenu: p, fin: p + len };
}
const enfants = (b, n) => { const r = []; for (let o = n.contenu; o < n.fin;) { const e = lire(b, o); r.push(e); o = e.fin; } return r; };
function oidOctets(oid) {
  const p = oid.split(".").map(Number), r = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) { const t = []; let x = v; do { t.unshift(x & 0x7f); x = Math.floor(x / 128); } while (x > 0); for (let i = 0; i < t.length - 1; i++) t[i] |= 0x80; r.push(...t); }
  return Uint8Array.from([0x06, r.length, ...r]);
}
const contient = (b, aiguille) => { outer: for (let i = 0; i <= b.length - aiguille.length; i++) { for (let j = 0; j < aiguille.length; j++) if (b[i + j] !== aiguille[j]) continue outer; return true; } return false; };
const OID = { p256: oidOctets("1.2.840.10045.3.1.7"), p384: oidOctets("1.3.132.0.34"), sha256: oidOctets("1.2.840.10045.4.3.2"), sha384: oidOctets("1.2.840.10045.4.3.3"),
  feuilleApple: oidOctets("1.2.840.113635.100.6.11.1"), intermediaireApple: oidOctets("1.2.840.113635.100.6.2.1") };

function decouperCertificat(der) {
  const c = lire(der, 0), [tbs, alg, sig] = enfants(der, c);
  const champs = enfants(der, tbs);
  const i0 = champs[0].tag === 0xa0 ? 1 : 0; // version facultative
  const validite = champs[i0 + 3], spki = champs[i0 + 5];
  const [nb, na] = enfants(der, validite).map((e) => dateDER(der.slice(e.contenu, e.fin), e.tag));
  const spkiOct = der.slice(spki.debut, spki.fin);
  const sigBits = der.slice(sig.contenu + 1, sig.fin); // saute l'octet « bits inutilisés »
  return { tbs: der.slice(tbs.debut, tbs.fin), algSig: der.slice(alg.debut, alg.fin), sigDER: sigBits, spki: spkiOct, avant: nb, apres: na, tout: der };
}
function dateDER(o, tag) {
  const s = String.fromCharCode(...o);
  const an = tag === 0x17 ? (+s.slice(0, 2) < 50 ? 2000 : 1900) + +s.slice(0, 2) : +s.slice(0, 4), r = tag === 0x17 ? s.slice(2) : s.slice(4);
  return Date.UTC(an, +r.slice(0, 2) - 1, +r.slice(2, 4), +r.slice(4, 6), +r.slice(6, 8), +r.slice(8, 10));
}
const courbe = (spki) => (contient(spki, OID.p384) ? { namedCurve: "P-384", taille: 48 } : { namedCurve: "P-256", taille: 32 });
// Signature ECDSA DER (SEQUENCE { r, s }) → format brut r || s
function derEnBrut(sig, taille) {
  const s = lire(sig, 0), [r, t] = enfants(sig, s);
  const fix = (n) => { let v = sig.slice(n.contenu, n.fin); while (v.length > taille && v[0] === 0) v = v.slice(1); const z = new Uint8Array(taille); z.set(v, taille - v.length); return z; };
  const out = new Uint8Array(taille * 2); out.set(fix(r), 0); out.set(fix(t), taille); return out;
}
async function cle(spki) { const c = courbe(spki); return crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: c.namedCurve }, false, ["verify"]); }
async function signePar(enfant, parent) {
  const hash = contient(enfant.algSig, OID.sha384) ? "SHA-384" : "SHA-256";
  const c = courbe(parent.spki);
  return crypto.subtle.verify({ name: "ECDSA", hash }, await cle(parent.spki), derEnBrut(enfant.sigDER, c.taille), enfant.tbs);
}

/**
 * Vérifie un JWS signé par Apple et retourne sa charge utile.
 * racine : octets de l'Apple Root CA - G3 (téléchargée depuis apple.com).
 */
export async function verifierJWSApple(jws, racine, maintenant = Date.now()) {
  const [h, p, s] = String(jws || "").split(".");
  if (!h || !p || !s) throw new Error("jws invalide");
  const entete = JSON.parse(new TextDecoder().decode(b64urlEnOctets(h)));
  if (entete.alg !== "ES256" || !Array.isArray(entete.x5c) || entete.x5c.length < 3) throw new Error("en-tête invalide");
  const [feuille, inter, rac] = entete.x5c.slice(0, 3).map((c) => decouperCertificat(b64EnOctets(c)));
  if (!egaux(rac.tout, racine)) throw new Error("racine inconnue");
  if (!contient(feuille.tbs, OID.feuilleApple) || !contient(inter.tbs, OID.intermediaireApple)) throw new Error("certificat non Apple");
  for (const c of [feuille, inter, rac]) if (maintenant < c.avant || maintenant > c.apres) throw new Error("certificat expiré");
  if (!(await signePar(inter, rac)) || !(await signePar(feuille, inter))) throw new Error("chaîne invalide");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await cle(feuille.spki), b64urlEnOctets(s), te.encode(`${h}.${p}`));
  if (!ok) throw new Error("signature invalide");
  return JSON.parse(new TextDecoder().decode(b64urlEnOctets(p)));
}

/** Jeton d'accès Google (compte de service, portée androidpublisher). */
export async function jetonGoogle(compte) {
  const iat = Math.floor(Date.now() / 1000);
  const enc = (o) => octetsEnB64url(te.encode(JSON.stringify(o)));
  const entree = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: compte.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: compte.token_uri || "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 })}`;
  const pem = compte.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const k = await crypto.subtle.importKey("pkcs8", b64EnOctets(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, te.encode(entree));
  const r = await fetch(compte.token_uri || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${entree}.${octetsEnB64url(sig)}` }) });
  const d = await r.json();
  if (!d.access_token) throw new Error("jeton google refusé");
  return d.access_token;
}
