<p align="center">
  <img src="assets/icone-192.png" alt="Logo Police Management" width="120">
</p>

<h1 align="center">Police Management</h1>

<p align="center">
  Outil de référence réservé aux policiers du Québec.<br>
  Code de la sécurité routière, bornes kilométriques, territoires des corps de police et horaire rotatif, dans une seule app.
</p>

<p align="center">
  <b><a href="https://asmqc.github.io/Police-Management/">asmqc.github.io/Police-Management</a></b>
</p>

---

## Site officiel

Les visiteurs non connectés voient le **site officiel** de Police Management (présentation, fonctionnalités, sécurité, corps de police, installation, contact), avec **Se connecter** et **Demander l'accès** en haut. La connexion ouvre l'app à la même adresse; une app installée sur l'écran d'accueil s'ouvre directement sur la connexion. La politique de l'app iPhone est publiée à [`confidentialite.html`](confidentialite.html), celle du site à [`politique.html`](politique.html).

## Fonctionnalités

### Accueil
- Salutation avec la photo de profil, le corps de police et l'unité.
- Quart du jour et du lendemain, tirés de l'horaire rotatif.
- Raccourcis vers chaque outil : article du CSR, table des vitesses, borne kilométrique, « Où suis-je ? », territoires, horaire, compte, app (installation).
- Pour l'administrateur : nombre de demandes d'accès en attente.

### Lois (CSR et autres lois)
- **Québec** : Code de la sécurité routière (1 225 articles, RLRQ, c. C-24.2), Loi sur les véhicules hors route, Loi concernant le transport rémunéré de personnes par automobile, Loi sur l'assurance automobile.
- **Fédéral, sécurité nautique** : Règlement sur les petits bâtiments, compétence des conducteurs d'embarcations de plaisance, restrictions visant l'utilisation des bâtiments, Loi de 2001 sur la marine marchande du Canada.
- **Table des vitesses** : calculateur (amende, frais, contribution, réclamation totale, points d'inaptitude, grand excès, zones de travaux et scolaires) et table complète par tranche de 5 km/h.
- Recherche par numéro (ex. `443.1`) ou par mots-clés (ex. `cellulaire`), avec raccourcis pour les recherches fréquentes.
- Lien direct vers le texte officiel de chaque article sur LégisQuébec.

### Carte et bornes kilométriques
- **Route + km** : « 20 » et « 150 » affichent la borne, le corps de police responsable, le poste et la patrouille autoroutière.
- **Ma position** : la même information, à partir du GPS du téléphone.
- **Code municipal** : le code géographique de la municipalité (ex. 58227), prêt à copier.
- **Menu des postes et corps de police** : adresse, centre de services, région, district et liste des municipalités desservies avec leurs codes. Le territoire est surligné sur la carte.
- **Couches** : postes SQ, corps municipaux, patrouille autoroutière, bornes km, sorties d'autoroute, bureaux SQ, limites et codes municipaux, caméras de circulation (Québec 511), autres postes de police (SPVM, GRC, régies, Nunavik… — OpenStreetMap).
- **District judiciaire** dans la fiche de chaque lieu.
- **Mes repères** : repères personnels privés (bouton « Repère »), avec itinéraire et suppression.
- **Carte personnalisée selon le corps de police** : couches utiles en premier et activées par défaut (SQ : postes, patrouille autoroutière, bureaux; municipal ou autochtone : limites et codes municipaux, caméras, autres postes), autres couches regroupées, territoire du policier surligné en violet et carte centrée dessus, choix des couches mémorisés. L'administrateur voit la carte du corps choisi en haut.

### Territoires
- Recherche d'une municipalité pour savoir qui la couvre : Sûreté du Québec (et quel poste), corps municipal ou corps autochtone.
- Liste des 105 postes de la SQ par région, et des corps municipaux et autochtones.

### Horaire et calendrier (façon Calendrier d'Apple)
- **Vues Jour, Semaine, Mois et Liste**, bouton « Aujourd'hui », glissement du doigt pour changer de période, ligne rouge de l'heure actuelle.
- **Rotation intégrée** : le quart de chaque journée (chiffres en couleur, bandes horaires dans les vues Jour et Semaine, y compris la fin d'un quart de nuit).
- **Événements personnels** : titre, lieu, toute la journée, début et fin, répétition (chaque jour, semaine, 2 semaines, mois, année, avec date de fin), notes.
- **Calendriers** en couleur (Personnel, Travail, Famille, Cour, Formation, Autre), affichés ou masqués, comme la rotation.
- **Rappels** en notification (à l'heure, 5 min à 1 semaine avant ; la veille à 9 h pour une journée entière), envoyés chaque minute par une tâche planifiée Supabase (`pg_cron`).
- **Recherche** dans les événements (titre, lieu, notes), vue Liste des 4 prochains mois.
- Modèles de rotation prêts (4-4, 4-4 jour/nuit, 2-2-3, 7-7, 3-3, 5-2, jour-soir-nuit) ou personnalisés ; exceptions (vacances, maladie, formation, cour, temps supplémentaire, échanges) avec notes.
- Export vers le calendrier du téléphone ou d'Outlook (fichier `.ics`, quarts et événements des 6 prochains mois).
- **Échanges de quarts** : offrir un quart des 14 prochains jours à son poste; la première prise gagne, les deux horaires se mettent à jour et les deux policiers sont avisés.
- **Deuxième calendrier (conjoint·e)** : rotation et exceptions du conjoint, privées (Réglages › Horaire).
- **Temps supplémentaire** : heures et détails de la feuille de TS (code gain, activité, nature, projet, PSA, no de dossier, UO imputée, repas…).
- **Statistiques d'heures** (mois et année) et **rapport de temps supplémentaire** à imprimer ou enregistrer en PDF.
- **Rappel avant mes quarts** (15 min à 2 h), envoyé par une tâche planifiée Supabase.
- **Modèles d'horaire** publiés par l'administrateur, **horaire hybride autoroutier** (9 h en semaine, 12 h la fin de semaine), catégories Obligation familiale, Férié et Maladie longue durée.
- **Mon poste** : les rotations sont partagées automatiquement entre les membres d'un même poste (même corps de police et même unité). Activé par défaut ; chaque policier peut le désactiver dans **Réglages › Confidentialité**.
- **Partage** avec un collègue d'un autre poste, retirable en tout temps.
- Les collègues voient seulement la rotation : les événements, vacances, maladies, cours, formations et notes restent privés (vérifié par la base de données).

### Communauté
- **Forum** réservé à chaque corps de police : sujets, réponses (avis à l'auteur), suppression de ses publications, signalement à l'administrateur.
- **Idées** : propositions de nouveautés avec votes et statut (Proposée, Planifiée, Réalisée, Non retenue).
- **Sondages** créés par l'administrateur (2 à 6 options, résultats en pourcentage).
- **Annonces** de l'administrateur en haut de l'accueil, avec image facultative et notification à tous.

### Messages (BÊTA)
- Conversations style texto entre l'administrateur et chaque policier, avec bulles, date, heure et indicateur « Lu ».
- Messages en direct (Supabase Realtime) et badge des messages non lus.
- L'administrateur peut écrire à n'importe quel policier approuvé ; un policier peut seulement écrire à l'administrateur.

### Notifications
- Alerte sur le téléphone ou l'ordinateur à chaque nouveau message, même app fermée (Web Push).
- L'administrateur est aussi averti de chaque nouvelle demande d'accès.
- iPhone et iPad : iOS 16.4 ou plus récent, app ajoutée à l'écran d'accueil. Android, Windows et Mac : Chrome, Edge, Firefox ou Safari.
- Activation par chaque utilisateur dans Mon compte ou Messages. Envoi par la fonction Supabase `notifier`, déclenchée par la base de données ; la clé privée est gardée dans Supabase Vault.

### Mon compte
- Photo de profil, nom, matricule, corps de police et unité.
- Changement de mot de passe.
- Suppression définitive de son propre compte.

### Administration
- **Onglet Admin** dans la barre du bas (visible par l'administrateur seulement), en quatre sections : Demandes, Messagerie, Communauté, Outils.
- **Sélecteur de corps de police** dans l'en-tête : l'administrateur se promène entre les corps (ou « Tous les corps ») ; demandes, messagerie, forum, idées, sondages, annonces et modèles suivent ce choix.
- **Demandes d'accès classées par corps de police**, avec le nombre par corps.
- **Messagerie de tous les corps sur une même page**, regroupée par corps, avec les messages non lus.
- Chaque corps de police est séparé (forum, idées, sondages, annonces et modèles ciblés) ; le partage d'horaire volontaire reste possible entre corps. L'horaire hybride (12 h la fin de semaine) est réservé à la Sûreté du Québec.
- Approbation ou refus des demandes d'accès.
- Fiche complète de chaque compte : photo, coordonnées, dernière connexion.
- Mot de passe temporaire (changement obligatoire à la connexion suivante).
- Blocage et déblocage d'un compte.
- Suppression définitive d'un compte (données et photo effacées de Supabase).

### Design
- Interface moderne façon application : surfaces douces, champs remplis, contrôles en pastilles, en-tête et barre d'onglets en verre dépoli.
- Carte « quart du jour » avec barre gyrophare rouge et bleue.
- Transitions entre les pages, fenêtres qui glissent depuis le bas, retour tactile sur chaque bouton (désactivés si « Réduire les animations » est activé sur l'appareil).
- Thème clair, sombre ou automatique (Réglages).

### Styles d'interface
Moderne (clair, sombre ou automatique), Terminal MDT, Terminal officiel, Marine, Épuré clair et Poste de police (Réglages › Apparence).

### Confidentialité (Loi 25)
- [Politique de confidentialité](politique.html) du site web; consentement explicite à l'inscription, avec date et version conservées, et nouvelle acceptation si la politique change.
- Données hébergées au Canada (Supabase, région Montréal), protégées par la sécurité au niveau des lignes de la base de données.
- Réglages › Aide et soutien : nouveautés de l'app, message à l'administrateur, Discord, courriel du soutien.

### Installation comme une application
La tuile **App** de l'accueil explique comment installer Police Management sur iPhone, Android, Windows et Mac. L'app s'ouvre ensuite en plein écran à partir de son icône, sans passer par un magasin d'applications.

---

## Accès

La connexion est obligatoire. Chaque nouvelle personne remplit une demande d'accès (nom, matricule, corps de police, unité) et reste **en attente** jusqu'à l'approbation de l'administrateur (anthony.smith@surete.qc.ca).

**Confirmation du courriel.** Un policier approuvé peut entrer dans l'app même si son courriel n'est pas confirmé, mais la **carte**, le **CSR** et les **territoires** restent verrouillés jusqu'à la confirmation. L'écran verrouillé permet de recevoir un nouveau lien en tout temps : un lien expiré ne bloque donc jamais personne. La confirmation est vérifiée par la base de données (méthode de connexion inscrite par Supabase dans le jeton de session). L'onglet **Courriel non confirmé** de l'administration liste les retardataires et permet de leur renvoyer le lien.

Les gabarits des courriels (aux couleurs de Police Management) sont dans [`supabase/courriels/`](supabase/courriels/) : à coller dans Supabase › Authentication › Emails (« Confirm signup » et « Magic Link »).

---

## Fonctionnement

| Élément | Où |
|---|---|
| Site | GitHub Pages (branche `main`, dossier racine) |
| Contenu public : CSR, carte, postes SQ, corps de police, caméras | Dossier `data/` de ce dépôt |
| Comptes, demandes d'accès, photos de profil, horaires, événements, partages et messages | Supabase (projet de l'app, région Canada) |
| Actions sensibles (mot de passe temporaire, blocage, suppression) | Fonction sécurisée Supabase `admin-comptes` (code dans `supabase/functions/`) |

Les règles d'accès de la base (RLS) protègent les renseignements personnels : chaque policier ne voit que son propre compte et son propre horaire, sauf les horaires qu'un collègue a choisi de lui partager. Seul l'administrateur voit la liste des comptes.

### Contenu du dossier `data/`

| Fichier | Contenu |
|---|---|
| `csr.json` | Code de la sécurité routière |
| `reperes.json` | Bornes kilométriques |
| `sq_postes.geojson`, `sq_bureaux.geojson`, `sq_autoroutier.geojson`, `sq_districts.geojson` | Postes, bureaux et territoires de la SQ |
| `corps_police.json` | Corps de police municipaux et autochtones, et municipalités desservies |
| `municipalites.geojson`, `municipalites.json`, `municipalites_hors_sq.geojson` | Limites et codes géographiques des municipalités |
| `cameras.geojson` | Caméras de circulation du MTMD |
| `lois/*.json` | Autres lois et règlements (VHR, transport rémunéré, assurance automobile, sécurité nautique) |
| `postes_autres.geojson` | Autres postes de police au Québec (OpenStreetMap, ODbL) |
| `districts_judiciaires.json` | District judiciaire de chaque municipalité |

Les trois derniers proviennent de l'app iOS (`outils/importer_ios.py`).

### Mise à jour automatique

L'action GitHub **« Mettre à jour les données (carte et CSR) »** roule **chaque lundi**. Elle télécharge les données officielles les plus récentes et met à jour le dossier `data/`. On peut aussi la lancer à la main dans l'onglet *Actions*.

### Modifier la liste des corps de police

1. Ouvrir [`data/corps_police.json`](data/corps_police.json) et cliquer sur le crayon (modifier).
2. Écrire le nom officiel de chaque municipalité, tel qu'il apparaît dans le Répertoire des municipalités du Québec.
3. Cliquer sur *Commit changes*. L'app suit environ une minute plus tard.

Le bouton **« Modifier la liste sur GitHub »** de l'onglet Admin ouvre directement ce fichier.

---

## Sources

| Données | Source | Licence |
|---|---|---|
| Code de la sécurité routière | LégisQuébec, Éditeur officiel du Québec | Texte de loi public |
| Repères kilométriques, caméras de circulation | Ministère des Transports et de la Mobilité durable | CC-BY 4.0 (Données Québec) |
| Desserte de la Sûreté du Québec | Sûreté du Québec | CC-BY 4.0 (Données Québec) |
| Découpages administratifs (municipalités) | Ministère des Ressources naturelles et des Forêts | CC-BY 4.0 (Données Québec) |
| Fond de carte | © les contributeurs d'OpenStreetMap | ODbL |

---

## Avis

Police Management est un outil indépendant de référence. Il n'est pas un produit officiel de la Sûreté du Québec ni d'un autre corps de police. En cas de doute, le texte officiel de LégisQuébec fait foi.
