// Désactivée : la feuille de poste est conservée dans Supabase Storage (compartiment privé « feuilles-poste »).
Deno.serve(() => new Response(JSON.stringify({ erreur: "Fonction retirée." }), { status: 410, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }));
