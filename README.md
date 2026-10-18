# Police Extrême

Outil de référence réservé aux policiers du Québec, accessible après approbation de l'administrateur.

- **Code de la sécurité routière** (RLRQ, c. C-24.2) : 1 225 articles, recherche par numéro ou mot-clé, lien vers le texte officiel de LégisQuébec.
- **Carte et bornes kilométriques** : « Route 20, km 150 » → position, poste de police responsable, patrouille autoroutière.
- **Territoires** : quel corps de police couvre une municipalité (Sûreté du Québec, corps municipaux, corps autochtones).
- **Administration** : approbation des demandes d'accès et mise à jour des corps de police.

## Fonctionnement

| Élément | Où |
|---|---|
| Site | GitHub Pages (branche `main`, dossier racine) |
| Comptes et demandes d'accès | Supabase, projet `police-extreme` (Canada) |
| Données de la carte, texte du CSR et liste des corps de police (`data/`) | Générés par l'action « Mettre à jour les données (carte et CSR) », le 3 de chaque mois |

Chaque nouvelle personne inscrite est « en attente » et ne voit rien tant que l'administrateur
(anthony.smith@surete.qc.ca) ne l'a pas approuvée. Les règles d'accès de la base (RLS) empêchent
toute lecture des comptes sans autorisation. La liste des corps de police se modifie dans data/corps_police.json. Le texte du CSR, déjà public
sur LégisQuébec, est servi avec les fichiers du site.

## Sources (licence CC-BY 4.0, Données Québec)

- Repères kilométriques : ministère des Transports et de la Mobilité durable
- Desserte Sûreté du Québec : Sûreté du Québec
- Découpages administratifs : ministère des Ressources naturelles et des Forêts
- Code de la sécurité routière : LégisQuébec (Éditeur officiel du Québec)

Outil indépendant. En cas de doute, le texte officiel de LégisQuébec fait foi.
