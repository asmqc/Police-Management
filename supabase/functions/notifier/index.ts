// Police Management — envoi des notifications (Web Push).
// Appelée seulement par la base de données (déclencheurs), avec un secret partagé gardé dans Supabase Vault.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch { /* clé héritée ci-dessous */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), { auth: { persistSession: false } });
let cles: { vapid_public: string; vapid_private: string; notifier_secret: string } | null = null;

async function chargerCles() {
  if (cles) return cles;
  const { data, error } = await admin.rpc("cles_notifications");
  if (error || !data) throw new Error("Clés introuvables");
  cles = data;
  webpush.setVapidDetails("mailto:anthony.smith@surete.qc.ca", data.vapid_public, data.vapid_private);
  return cles;
}

// Chiffre de la pastille : messages non lus, plus les demandes en attente pour l'administrateur
async function pastille(userId: string): Promise<number> {
  const { count: msgs } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("destinataire", userId).is("lu_le", null);
  const { data: p } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  let total = msgs ?? 0;
  if (p?.role === "admin") {
    const { count: dem } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    total += dem ?? 0;
  }
  return total;
}

async function envoyer(userIds: string[], charge: Record<string, unknown>) {
  if (!userIds.length) return 0;
  const { data: abos } = await admin.from("push_abonnements").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  const chiffres: Record<string, number> = {};
  for (const id of new Set((abos ?? []).map((a) => a.user_id))) chiffres[id] = await pastille(id);
  let n = 0;
  await Promise.all((abos ?? []).map(async (a) => {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify({ ...charge, pastille: chiffres[a.user_id] ?? 0 }), { TTL: 86400, urgency: "high" });
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_abonnements").delete().eq("id", a.id); // appareil désinscrit
      else console.error("push", code, (e as Error).message);
    }
  }));
  return n;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non permise", { status: 405 });
  try {
    const c = await chargerCles();
    if (req.headers.get("x-cle-notifier") !== c.notifier_secret) return new Response("Refusé", { status: 401 });
    const e = await req.json();

    if (e.type === "message") {
      const { data: exp } = await admin.from("profiles").select("nom_complet, email, role").eq("id", e.expediteur).maybeSingle();
      const nom = exp?.nom_complet || exp?.email || "Police Management";
      const n = await envoyer([e.destinataire], {
        titre: exp?.role === "admin" ? `${nom} (administrateur)` : nom,
        corps: e.contenu,
        url: "#messages",
        tag: `message-${e.expediteur}`,
      });
      return Response.json({ envoye: n });
    }

    if (e.type === "demande") {
      const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("statut", "approuve");
      const n = await envoyer((admins ?? []).map((x) => x.id), {
        titre: "Nouvelle demande d'accès",
        corps: [e.grade, e.nom].filter(Boolean).join(" ") + (e.corps ? ` · ${e.corps}` : ""),
        url: "#admin",
        tag: "demande",
      });
      return Response.json({ envoye: n });
    }

    if (e.type === "rappel") {
      // Rappel d'un événement du calendrier (envoyé par la tâche planifiée de la base de données)
      const d = new Date(e.debut);
      const fuseau = { timeZone: "America/Toronto" } as const;
      const jour = d.toLocaleDateString("fr-CA", { ...fuseau, weekday: "long", day: "numeric", month: "long" });
      const quand = e.journee ? `${jour} · toute la journée` : `${jour} · ${d.toLocaleTimeString("fr-CA", { ...fuseau, hour: "2-digit", minute: "2-digit" })}`;
      const n = await envoyer([e.destinataire], {
        titre: e.titre,
        corps: quand + (e.lieu ? ` · ${e.lieu}` : ""),
        url: "#horaire",
        tag: `rappel-${e.id}-${e.debut}`,
      });
      return Response.json({ envoye: n });
    }

    if (e.type === "approbation") {
      const n = await envoyer([e.id], { titre: "Accès approuvé", corps: "Votre accès à Police Management est ouvert.", url: "#accueil", tag: "approbation" });
      return Response.json({ envoye: n });
    }

    return Response.json({ envoye: 0 });
  } catch (err) {
    console.error(err);
    return new Response("Erreur", { status: 500 });
  }
});
