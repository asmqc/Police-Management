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

## Fonctionnalités

### Accueil
- Salutation avec la photo de profil, le corps de police et l'unité.
- Quart du jour et du lendemain, tirés de l'horaire rotatif.
- Raccourcis vers chaque outil : article du CSR, table des vitesses, borne kilométrique, « Où suis-je ? », territoires, horaire, compte, installation.
- Pour l'administrateur : nombre de demandes d'accès en attente.

### Code de la sécurité routière (CSR)
- Les 1 225 articles du RLRQ, c. C-24.2.
- **Table des vitesses** : calculateur (amende, frais, contribution, réclamation totale, points d'inaptitude, grand excès, zones de travaux et scolaires) et table complète par tranche de 5 km/h.
- Recherche par numéro (ex. `443.1`) ou par mots-clés (ex. `cellulaire`), avec raccourcis pour les recherches fréquentes.
- Lien direct vers le texte officiel de chaque article sur LégisQuébec.

### Carte et bornes kilométriques
- **Route + km** : « 20 » et « 150 » affichent la borne, le corps de police responsable, le poste et la patrouille autoroutière.
- **Ma position** : la même information, à partir du GPS du téléphone.
- **Code municipal** : le code géographique de la municipalité (ex. 58227), prêt à copier.
- **Menu des postes et corps de police** : adresse, centre de services, région, district et liste des municipalités desservies avec leurs codes. Le territoire est surligné sur la carte.
- **Couches** : postes SQ, corps municipaux, patrouille autoroutière, bornes km, sorties d'autoroute, bureaux SQ, limites et codes municipaux, caméras de circulation (Québec 511).

### Territoires
- Recherche d'une municipalité pour savoir qui la couvre : Sûreté du Québec (et quel poste), corps municipal ou corps autochtone.
- Liste des 105 postes de la SQ par région, et des corps municipaux et autochtones.

### Horaire rotatif
- Modèles prêts (4-4, 4-4 jour/nuit, 2-2-3, 7-7, 3-3, 5-2, jour-soir-nuit) ou rotation personnalisée.
- Calendrier mensuel en couleurs, quart du jour et 7 prochains jours.
- Exceptions : vacances, maladie, formation, cour, temps supplémentaire, échanges, avec notes.
- Export vers le calendrier du téléphone ou d'Outlook (fichier `.ics`).
- **Partage** avec un collègue de la plateforme, en lecture seule. Le partage peut être retiré en tout temps.

### Mon compte
- Photo de profil, nom, matricule, corps de police et unité.
- Changement de mot de passe.
- Suppression définitive de son propre compte.

### Administration
- Approbation ou refus des demandes d'accès.
- Fiche complète de chaque compte : photo, coordonnées, dernière connexion.
- Mot de passe temporaire (changement obligatoire à la connexion suivante).
- Blocage et déblocage d'un compte.
- Suppression définitive d'un compte (données et photo effacées de Supabase).

### Installation comme une application
La tuile **Installer l'app** de l'accueil explique comment installer Police Management sur iPhone, Android, Windows et Mac. L'app s'ouvre ensuite en plein écran à partir de son icône, sans passer par un magasin d'applications.

---

## Accès

La connexion est obligatoire. Chaque nouvelle personne remplit une demande d'accès (nom, matricule, corps de police, unité) et reste **en attente** jusqu'à l'approbation de l'administrateur (anthony.smith@surete.qc.ca).

---

## Fonctionnement

| Élément | Où |
|---|---|
| Site | GitHub Pages (branche `main`, dossier racine) |
| Contenu public : CSR, carte, postes SQ, corps de police, caméras | Dossier `data/` de ce dépôt |
| Comptes, demandes d'accès, photos de profil, horaires et partages | Supabase (projet de l'app, région Canada) |
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
