// Configuration publique de Police Management.
// La clé « publishable » est faite pour être visible dans le navigateur : la sécurité
// est assurée par les règles d'accès (RLS) de la base de données Supabase.
window.PE_CONFIG = {
  supabaseUrl: "https://skafnhlxlptmykboqzfq.supabase.co",
  supabaseKey: "sb_publishable_zVkaou2CPfTRG66k01ZMJA_pAHn1fUy",
  courrielAdmin: "anthony.smith@surete.qc.ca",
  // Clé publique des notifications (Web Push). La clé privée reste dans Supabase Vault.
  vapidPublic: "BCBsawQxqz1rf4WvAv5v1_wYmKLOLi18UQfTZ8zGr9M_hLDSZUZZsek-xRAzsuToNfcMLwYoyy0pilsy8gDpTX8",
};
