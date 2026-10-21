// Feuille de poste : le fichier est conservé dans un dépôt GitHub PRIVÉ (pièce jointe d'une « release » par poste),
// jamais dans Supabase. Cette fonction vérifie l'accès (même poste ou administrateur) puis relaie le fichier.
//   GET  ?cle=…        → le fichier (cle facultative : administrateur seulement)
//   POST ?action=publier  (corps = le fichier, en-tête Content-Type) → remplace la feuille du poste
//   POST ?action=retirer&cle=…  → retire la feuille (cle : administrateur seulement)
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEPOT = Deno.env.get("GITHUB_FEUILLES_DEPOT") ?? "asmqc/police-management-feuilles";
const JETON = Deno.env.get("GITHUB_FEUILLES_TOKEN") ?? "";
const MAX = 10 * 1024 * 1024;
const TYPES: Record<string, { ext: string; type: "image" | "pdf" }> = {
  "image/jpeg": { ext: "jpg", type: "image" },
  "image/png": { ext: "png", type: "image" },
  "image/webp": { ext: "webp", type: "image" },
  "application/pdf": { ext: "pdf", type: "pdf" },
};
const ENTETES = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...ENTETES, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => json({ erreur: message }, statut);

const gh = (chemin: string, init: RequestInit = {}) =>
  fetch(chemin.startsWith("http") ? chemin : `https://api.github.com/repos/${DEPOT}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${JETON}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "police-management", Accept: "application/vnd.github+json", ...(init.headers ?? {}) },
  });

// chemin enregistré : "<cle>/gh-<id de la pièce jointe>.<ext>"
const idPiece = (chemin: string | null) => {
  const m = chemin?.match(/\/gh-(\d+)\./);
  return m ? m[1] : null;
};

async function releaseDuPoste(cle: string): Promise<number> {
  const tag = `poste-${cle}`;
  const r = await gh(`/releases/tags/${tag}`);
  if (r.ok) return (await r.json()).id;
  // Les brouillons ne sont pas trouvés par tag : on cherche dans la liste
  const liste = await gh(`/releases?per_page=100`);
  if (liste.ok) {
    const trouve = (await liste.json()).find((x: { name: string }) => x.name === tag);
    if (trouve) return trouve.id;
  }
  const c = await gh(`/releases`, { method: "POST", body: JSON.stringify({ tag_name: tag, name: tag, body: "Feuille de poste (Police Management). Ne pas modifier à la main.", draft: true }) });
  if (!c.ok) throw new Error(`GitHub (création) : ${c.status} ${await c.text()}`);
  return (await c.json()).id;
}
async function effacerPiece(chemin: string | null) {
  const id = idPiece(chemin);
  if (id) await gh(`/releases/assets/${id}`, { method: "DELETE" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ENTETES });
  if (!JETON) return erreur("La feuille de poste n'est pas encore configurée (stockage GitHub).", 503);
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return erreur("Connexion requise.", 401);
  const url = new URL(req.url);
  const cleDemandee = url.searchParams.get("cle");

  try {
    if (req.method === "GET") {
      let chemin: string | null = null, type = "image";
      if (cleDemandee) {
        const { data, error } = await sb.rpc("admin_feuilles_poste");
        if (error) throw error;
        const f = (data ?? []).find((x: { cle: string }) => x.cle === cleDemandee);
        if (!f) return erreur("Feuille introuvable ou accès refusé.", 404);
        chemin = f.chemin; type = f.type;
      } else {
        const { data, error } = await sb.rpc("feuille_poste");
        if (error) throw error;
        if (!data?.[0]) return erreur("Votre poste n'a pas de feuille.", 404);
        chemin = data[0].chemin; type = data[0].type;
      }
      const id = idPiece(chemin);
      if (!id) return erreur("Feuille introuvable.", 404);
      const r = await gh(`/releases/assets/${id}`, { headers: { Accept: "application/octet-stream" } });
      if (!r.ok || !r.body) return erreur("La feuille n'a pas pu être lue sur GitHub.", 502);
      const contentType = type === "pdf" ? "application/pdf" : (r.headers.get("Content-Type") ?? "image/jpeg");
      return new Response(r.body, { headers: { ...ENTETES, "Content-Type": contentType, "Cache-Control": "private, no-store" } });
    }

    const action = url.searchParams.get("action");
    if (req.method === "POST" && action === "publier") {
      const contentType = (req.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
      const t = TYPES[contentType];
      if (!t) return erreur("Choisissez une photo (JPEG, PNG) ou un PDF.");
      const octets = new Uint8Array(await req.arrayBuffer());
      if (!octets.length) return erreur("Fichier vide.");
      if (octets.length > MAX) return erreur("Le fichier dépasse 10 Mo.");
      const { data: cle, error: eCle } = await sb.rpc("feuille_poste_cle");
      if (eCle) throw eCle;
      if (!cle) return erreur("Indiquez votre unité ou votre poste dans Mon compte pour partager une feuille de poste.");
      const release = await releaseDuPoste(cle);
      const nom = `feuille-${Date.now()}.${t.ext}`;
      const envoi = await gh(`https://uploads.github.com/repos/${DEPOT}/releases/${release}/assets?name=${nom}`, { method: "POST", headers: { "Content-Type": contentType }, body: octets });
      if (!envoi.ok) throw new Error(`GitHub (envoi) : ${envoi.status} ${await envoi.text()}`);
      const piece = await envoi.json();
      const chemin = `${cle}/gh-${piece.id}.${t.ext}`;
      const { data: ancien, error: ePub } = await sb.rpc("feuille_poste_publier", { p_chemin: chemin, p_type: t.type });
      if (ePub) { await effacerPiece(chemin); throw ePub; }
      await effacerPiece(ancien); // l'ancienne version est effacée définitivement de GitHub
      return json({ ok: true });
    }
    if (req.method === "POST" && action === "retirer") {
      const { data: ancien, error } = await sb.rpc("feuille_poste_retirer", cleDemandee ? { p_cle: cleDemandee } : {});
      if (error) throw error;
      await effacerPiece(ancien);
      return json({ ok: true });
    }
    return erreur("Action inconnue.", 404);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erreur";
    return erreur(/GitHub/.test(message) ? "Le stockage GitHub n'a pas répondu. Réessayez dans un instant." : message, 500);
  }
});
