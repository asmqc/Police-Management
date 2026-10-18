// Police Extrême — actions sensibles sur les comptes.
// La clé secrète reste ici, côté serveur ; le navigateur envoie seulement le jeton de session de la personne connectée.
//
// Actions :
//   supprimer_mon_compte                 (toute personne connectée, pour son propre compte)
//   mot_de_passe_temporaire {id, mot_de_passe}   (admin)
//   bloquer {id} / debloquer {id}        (admin)
//   supprimer {id}                       (admin)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => reponse({ erreur: message }, statut);

function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch { /* clé héritée ci-dessous */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non permise", 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Qui appelle ?
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jeton) return erreur("Connexion requise", 401);
  const { data: qui, error: errQui } = await admin.auth.getUser(jeton);
  if (errQui || !qui?.user) return erreur("Session expirée. Reconnectez-vous.", 401);
  const moi = qui.user;

  let corps: { action?: string; id?: string; mot_de_passe?: string };
  try { corps = await req.json(); } catch { return erreur("Requête invalide"); }
  const { action, id, mot_de_passe } = corps;

  async function supprimerCompte(cible: string) {
    // 1. Fichiers de l'avatar
    const { data: fichiers } = await admin.storage.from("avatars").list(cible, { limit: 100 });
    if (fichiers?.length) await admin.storage.from("avatars").remove(fichiers.map((f) => `${cible}/${f.name}`));
    // 2. Compte d'authentification (le profil est supprimé en cascade)
    const { error } = await admin.auth.admin.deleteUser(cible);
    if (error) throw error;
    // 3. Par sécurité, si un profil restait
    await admin.from("profiles").delete().eq("id", cible);
  }

  try {
    if (action === "supprimer_mon_compte") {
      await supprimerCompte(moi.id);
      return reponse({ ok: true });
    }

    // Les actions suivantes sont réservées à l'administrateur
    const { data: profil } = await admin.from("profiles").select("role, statut").eq("id", moi.id).maybeSingle();
    if (!profil || profil.role !== "admin" || profil.statut !== "approuve") return erreur("Réservé à l'administrateur", 403);
    if (!id || !UUID.test(id)) return erreur("Compte introuvable");
    if (id === moi.id) return erreur("Cette action ne s'applique pas à votre propre compte. Utilisez « Mon compte ».");

    const { data: cible } = await admin.from("profiles").select("id, role").eq("id", id).maybeSingle();
    if (!cible) return erreur("Compte introuvable", 404);

    switch (action) {
      case "mot_de_passe_temporaire": {
        if (!mot_de_passe || mot_de_passe.length < 10) return erreur("Le mot de passe temporaire doit contenir au moins 10 caractères.");
        const { error } = await admin.auth.admin.updateUserById(id, { password: mot_de_passe });
        if (error) throw error;
        await admin.from("profiles").update({ doit_changer_mdp: true }).eq("id", id);
        return reponse({ ok: true });
      }
      case "bloquer": {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }); // ~100 ans
        if (error) throw error;
        await admin.from("profiles").update({ statut: "bloque", decide_le: new Date().toISOString(), decide_par: moi.id }).eq("id", id);
        return reponse({ ok: true });
      }
      case "debloquer": {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
        if (error) throw error;
        await admin.from("profiles").update({ statut: "approuve", decide_le: new Date().toISOString(), decide_par: moi.id }).eq("id", id);
        return reponse({ ok: true });
      }
      case "supprimer": {
        await supprimerCompte(id);
        return reponse({ ok: true });
      }
      default:
        return erreur("Action inconnue");
    }
  } catch (e) {
    console.error(action, e);
    return erreur((e as Error).message || "Erreur du serveur", 500);
  }
});
