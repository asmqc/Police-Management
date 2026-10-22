// Calendrier abonné : horaire de travail d'un membre au format iCalendar, pour Calendrier (iPhone), Google Agenda ou Outlook.
// Accès par un lien secret (?j=<jeton>), révocable par le membre. Seulement la rotation et les journées modifiées,
// jamais les notes, le temps supplémentaire détaillé, le 2e calendrier ni les événements personnels.
import { createClient } from "jsr:@supabase/supabase-js@2";

const NOMS: Record<string, string> = {
  J: "Jour", S: "Soir", N: "Nuit", C: "Congé", V: "Vacances", M: "Maladie", F: "Formation", T: "Cour",
  X: "Temps supp.", O: "Obligation familiale", H: "Férié", L: "Maladie longue durée",
};
const HEURES_DEFAUT: Record<string, [string, string]> = { J: ["07:00", "19:00"], S: ["15:00", "23:00"], N: ["19:00", "07:00"] };
const MS_JOUR = 86400000;
const jourUTC = (iso: string) => { const [a, m, j] = iso.split("-").map(Number); return Date.UTC(a, m - 1, j) / MS_JOUR; };
const isoDe = (n: number) => new Date(n * MS_JOUR).toISOString().slice(0, 10);

type Config = { cycle?: string[]; debut?: string; heures?: Record<string, [string, string]>; hybride?: boolean };
type Exc = { type?: string; debut?: string; fin?: string };

function quart(iso: string, c: Config | null, ex: Record<string, Exc>) {
  const e = ex[iso];
  let prevu: string | null = null;
  if (c && c.cycle && c.cycle.length && c.debut) {
    const n = jourUTC(iso) - jourUTC(c.debut);
    prevu = c.cycle[((n % c.cycle.length) + c.cycle.length) % c.cycle.length];
  }
  return { code: e && e.type ? e.type : prevu, e };
}
function heures(code: string, iso: string, c: Config | null, e?: Exc): [string, string] | null {
  if (e && e.debut && e.fin) return [e.debut, e.fin];
  if (!["J", "S", "N"].includes(code)) return null;
  if (c && c.hybride) {
    const fds = [0, 6].includes(new Date(iso + "T12:00:00Z").getUTCDay());
    return ({ J: fds ? ["06:30", "18:30"] : ["06:30", "15:30"], N: fds ? ["18:30", "06:30"] : ["22:30", "07:30"], S: ["14:30", "23:30"] } as Record<string, [string, string]>)[code];
  }
  return (c && c.heures && c.heures[code]) || HEURES_DEFAUT[code];
}

const entetes = { "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const jeton = url.searchParams.get("j") ?? "";
  if (!/^[0-9a-f]{48}$/.test(jeton)) return new Response("Lien invalide", { status: 404, headers: entetes });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: j } = await sb.from("calendrier_jetons").select("user_id").eq("jeton", jeton).maybeSingle();
  if (!j) return new Response("Lien désactivé ou remplacé", { status: 404, headers: entetes });
  const { data: p } = await sb.from("profiles").select("statut").eq("id", j.user_id).maybeSingle();
  if (!p || p.statut !== "approuve") return new Response("Compte inactif", { status: 404, headers: entetes });
  const { data: h } = await sb.from("horaires").select("config, exceptions").eq("user_id", j.user_id).maybeSingle();
  const c: Config | null = h && h.config && h.config.cycle ? h.config : null;
  const ex: Record<string, Exc> = (h && h.exceptions) || {};

  const maintenant = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lignes = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Police Management//Horaire abonné//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Horaire · Police Management", "X-WR-TIMEZONE:America/Toronto", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  const d = new Date();
  const n0 = jourUTC(d.toISOString().slice(0, 10));
  for (let i = -30; i <= 365; i++) {
    const iso = isoDe(n0 + i);
    const q = quart(iso, c, ex);
    if (!q.code || q.code === "C") continue;
    const date = iso.replace(/-/g, "");
    const hh = heures(q.code, iso, c, q.e);
    lignes.push("BEGIN:VEVENT", `UID:${date}-${q.code}@policemanagement.ca`, `DTSTAMP:${maintenant}`);
    if (hh) {
      const fin = hh[1] <= hh[0] ? isoDe(n0 + i + 1).replace(/-/g, "") : date;
      lignes.push(`DTSTART;TZID=America/Toronto:${date}T${hh[0].replace(":", "")}00`, `DTEND;TZID=America/Toronto:${fin}T${hh[1].replace(":", "")}00`);
    } else {
      lignes.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${isoDe(n0 + i + 1).replace(/-/g, "")}`);
    }
    lignes.push(`SUMMARY:${NOMS[q.code] ?? q.code}`, "TRANSP:" + (["J", "S", "N", "X", "F", "T"].includes(q.code) ? "OPAQUE" : "TRANSPARENT"), "END:VEVENT");
  }
  lignes.push("END:VCALENDAR");
  return new Response(lignes.join("\r\n") + "\r\n", {
    headers: { ...entetes, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=1800", "Content-Disposition": 'inline; filename="horaire-police-management.ics"' },
  });
});
