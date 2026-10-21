import os
SORTIE = "/home/claude/police-extreme/supabase/courriels"
SITE = "https://policemanagement.ca/"

def gabarit(titre, apercu, intro_html, bouton, lien_var, note_html, pied_html):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>{titre}</title>
</head>
<body style="margin:0;padding:0;background:#E9EEF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0E1B2C;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{apercu}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9EEF5;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <!-- En-tête : nuit, gyrophare rouge et bleu, logo -->
        <tr><td style="background:#0B1220;border-radius:22px 22px 0 0;padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td colspan="2" align="center" style="padding:30px 28px 26px;">
              <img src="{SITE}assets/logo.png" width="64" height="64" alt="Police Management" style="display:block;border:0;border-radius:16px;margin:0 auto 14px;">
              <div style="font-size:20px;line-height:1.2;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#FFFFFF;">Police <span style="color:#FFC53D;">Management</span></div>
              <div style="margin-top:6px;font-size:13px;line-height:1.4;color:#9FB0C6;">L'horaire, la route et les lois, réunis pour les policiers du Québec</div>
            </td></tr>
            <tr>
              <td width="50%" style="height:5px;line-height:5px;font-size:0;background:#E0263B;">&nbsp;</td>
              <td width="50%" style="height:5px;line-height:5px;font-size:0;background:#2563EB;">&nbsp;</td>
            </tr>
          </table>
        </td></tr>

        <!-- Contenu -->
        <tr><td style="background:#FFFFFF;padding:34px 32px 10px;">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:800;color:#0E1B2C;">{titre}</h1>
          {intro_html}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 26px;">
            <tr><td align="center" bgcolor="#FFC53D" style="border-radius:999px;background:#FFC53D;">
              <a href="{lien_var}" target="_blank" style="display:inline-block;padding:16px 34px;font-size:17px;line-height:1.2;font-weight:800;color:#1A1204;text-decoration:none;border-radius:999px;">{bouton}</a>
            </td></tr>
          </table>
          {note_html}
          <p style="margin:22px 0 6px;font-size:13px;line-height:1.5;color:#5A6B82;">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :</p>
          <p style="margin:0 0 26px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="{lien_var}" style="color:#0A4FB8;">{lien_var}</a></p>
        </td></tr>

        <!-- Pied -->
        <tr><td style="background:#F4F7FB;border-top:1px solid #E1E7EF;border-radius:0 0 22px 22px;padding:22px 32px 26px;font-size:12.5px;line-height:1.6;color:#6B7A90;">
          {pied_html}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
            <td style="vertical-align:middle;"><img src="{SITE}assets/logo.png" width="22" height="22" alt="" style="display:block;border:0;border-radius:6px;"></td>
            <td style="vertical-align:middle;padding-left:8px;font-size:12.5px;"><b style="color:#0E1B2C;">Police Management</b> · <a href="{SITE}" style="color:#0A4FB8;text-decoration:none;">policemanagement.ca</a></td>
          </tr></table>
          <p style="margin:12px 0 0;font-size:11.5px;line-height:1.55;color:#8A97A9;">Outil indépendant, non affilié à la Sûreté du Québec ni à aucun autre corps de police. Ne répondez pas à ce courriel : écrivez à <a href="mailto:police.management@hotmail.com" style="color:#0A4FB8;">police.management@hotmail.com</a>. <a href="{SITE}politique.html" style="color:#0A4FB8;">Politique de confidentialité</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
'''

P = lambda t: f'<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#22334A;">{t}</p>'
def encadre(titre, texte):
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F6FD;border:1px solid #D9E5F6;border-radius:14px;">
            <tr><td style="padding:14px 16px;font-size:14.5px;line-height:1.55;color:#22334A;"><b style="color:#0E1B2C;">{titre}</b><br>{texte}</td></tr>
          </table>'''

courriels = {
  "confirmation-inscription.html": ("Confirmez votre courriel · Police Management", gabarit(
    "Confirmez votre courriel",
    "Une dernière étape pour votre demande d'accès à Police Management.",
    P("Bonjour,") + P("Merci pour votre demande d'accès à <b>Police Management</b>. Confirmez que cette adresse vous appartient en touchant le bouton ci-dessous."),
    "Confirmer mon courriel", "{{ .ConfirmationURL }}",
    encadre("Et ensuite ?", "L'accès est réservé au personnel policier et aux agents de la paix. Une fois votre courriel confirmé, l'administrateur examine votre demande. Vous pourrez vous connecter dès qu'elle sera approuvée."),
    "Ce courriel a été envoyé à {{ .Email }} à la suite d'une demande d'accès à Police Management. Si ce n'est pas vous, ignorez ce message : aucun compte ne sera activé. Le lien est valide 24 heures.")),
  "lien-magique.html": ("Votre lien de confirmation · Police Management", gabarit(
    "Votre lien de confirmation",
    "Touchez le bouton pour confirmer votre courriel et vous connecter.",
    P("Bonjour,") + P("Vous avez demandé un lien pour confirmer votre courriel et vous connecter à <b>Police Management</b>. Touchez le bouton ci-dessous à partir de l'appareil où vous utilisez l'app."),
    "Confirmer et me connecter", "{{ .ConfirmationURL }}",
    encadre("Pourquoi confirmer ?", "La confirmation de votre courriel débloque la carte, les lois et les territoires des corps de police."),
    "Ce courriel a été envoyé à {{ .Email }}. Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans ce lien. Le lien est valide 1 heure et ne fonctionne qu'une fois.")),
  "reinitialisation-mot-de-passe.html": ("Réinitialisez votre mot de passe · Police Management", gabarit(
    "Réinitialisez votre mot de passe",
    "Choisissez un nouveau mot de passe pour votre compte Police Management.",
    P("Bonjour,") + P("Nous avons reçu une demande de réinitialisation du mot de passe de votre compte <b>Police Management</b>. Touchez le bouton pour en choisir un nouveau."),
    "Choisir un nouveau mot de passe", "{{ .ConfirmationURL }}",
    encadre("Conseil de sécurité", "Choisissez un mot de passe unique d'au moins 10 caractères, que vous n'utilisez nulle part ailleurs."),
    "Ce courriel a été envoyé à {{ .Email }}. Si vous n'avez pas demandé de réinitialisation, ignorez ce message : votre mot de passe actuel reste valide. Le lien est valide 1 heure et ne fonctionne qu'une fois.")),
  "changement-courriel.html": ("Confirmez votre nouvelle adresse · Police Management", gabarit(
    "Confirmez votre nouvelle adresse",
    "Confirmez le changement d'adresse courriel de votre compte Police Management.",
    P("Bonjour,") + P("Une demande a été faite pour remplacer l'adresse courriel de votre compte <b>Police Management</b> par <b>{{ .NewEmail }}</b>. Touchez le bouton pour confirmer ce changement."),
    "Confirmer la nouvelle adresse", "{{ .ConfirmationURL }}",
    "",
    "Ce courriel a été envoyé à {{ .Email }}. Si vous n'avez pas demandé ce changement, ne touchez pas le bouton et écrivez-nous à police.management@hotmail.com.")),
}
os.makedirs(SORTIE, exist_ok=True)
sujets = []
for nom, (sujet, html) in courriels.items():
    open(os.path.join(SORTIE, nom), "w").write(html)
    sujets.append(f"{nom} : {sujet}")
open(os.path.join(SORTIE, "SUJETS.txt"), "w").write("\n".join(sujets) + "\n")
print("\n".join(sujets))
