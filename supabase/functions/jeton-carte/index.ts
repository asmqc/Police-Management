// Police Management — Jeton Apple Plans (MapKit JS) pour la carte.
// La clé privée MapKit reste dans les secrets Supabase (MAPKIT_CLE_PRIVEE, MAPKIT_ID_CLE, MAPKIT_ID_EQUIPE) et ne quitte jamais le serveur.
// Le jeton remis au navigateur est signé ES256, valide 30 minutes et limité à l'adresse du site (champ origin).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ORIGINES = new Set(["https://policemanagement.ca", "https://www.policemanagement.ca"]);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

function estConnecte(req: Request): boolean {
  try {
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const charge = JSON.parse(atob(jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return charge.role === "authenticated" && !!charge.sub;
  } catch { return false; }
}
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const texte64 = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
let cle: CryptoKey | null = null;
async function cleSignature(): Promise<CryptoKey> {
  if (cle) return cle;
  const pem = (Deno.env.get("MAPKIT_CLE_PRIVEE") ?? "").replace(/\\n/g, "\n");
  const corps = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  if (!corps) throw new Error("cle absente");
  const der = Uint8Array.from(atob(corps), (c) => c.charCodeAt(0));
  cle = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return cle;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!estConnecte(req)) return json({ erreur: "Connectez-vous." }, 401);
  const kid = Deno.env.get("MAPKIT_ID_CLE"), iss = Deno.env.get("MAPKIT_ID_EQUIPE");
  if (!kid || !iss || !Deno.env.get("MAPKIT_CLE_PRIVEE")) return json({ erreur: "Carte Apple pas encore configurée.", configure: false }, 503);
  const origine = req.headers.get("Origin") ?? "";
  if (!ORIGINES.has(origine)) return json({ erreur: "Adresse non autorisée." }, 403);
  try {
    const iat = Math.floor(Date.now() / 1000);
    const entete = texte64({ alg: "ES256", kid, typ: "JWT" });
    const charge = texte64({ iss, iat, exp: iat + 1800, origin: origine });
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await cleSignature(), new TextEncoder().encode(`${entete}.${charge}`));
    return json({ jeton: `${entete}.${charge}.${b64url(sig)}`, expire: iat + 1800 });
  } catch (e) {
    console.error("jeton-carte", (e as Error).message);
    return json({ erreur: "Jeton indisponible." }, 500);
  }
});
