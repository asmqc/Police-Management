"""Extrait la table de points d'inaptitude (annexe du Règlement sur les points d'inaptitude, RLRQ, c. C-24.2, r. 37) depuis LégisQuébec.

Usage : python extraire_points.py page.html sortie.json

La table est un bloc à largeur fixe : numéro, description sommaire, articles visés du CSR,
article d'imputabilité (sanction) et nombre de points. Les lignes de vitesse (n° 6 à 6.3)
ont des paliers d'excès de vitesse.
"""
import json, re, sys
from bs4 import BeautifulSoup

entree, sortie = sys.argv[1], sys.argv[2]
soup = BeautifulSoup(open(entree, encoding="utf-8", errors="replace").read(), "lxml")
bloc = soup.select_one("div.ScheduleContent div.verbatim")
if bloc is None:
    sys.exit("Table introuvable")
for b in bloc.find_all("br"):
    b.replace_with("\n")
for h in bloc.find_all("hr"):
    h.replace_with("\n----\n")
texte = bloc.get_text().replace("\xa0", " ")

# Colonnes (positions fixes de la table officielle)
C_DESC, C_VISES, C_IMPUT, C_POINTS = 6, 36, 51, 66


def col(ligne, a, b=None):
    return ligne[a:b].strip() if len(ligne) > a else ""


def numeros(t):
    return re.findall(r"\d+(?:\.\d+)*", re.sub(r"par\.\s*\d+", "", t))


lignes_vitesse = []
entrees = []
courante = None
for morceau in texte.split("----"):
    lignes = [l.rstrip() for l in morceau.split("\n") if l.strip()]
    if not lignes:
        continue
    tete = lignes[0]
    m = re.match(r"^(\d+(?:\.\d+)?)\.?\s", tete)
    if m:
        desc, vises, imput, pts = [], [], [], []
        for l in lignes:
            # Les points sont le dernier nombre de la ligne, au-delà de la 60e colonne (alignement parfois décalé d'un caractère)
            mp = re.search(r"\s{2,}(\d{1,2})\s*$", l)
            if mp and mp.start(1) >= 60:
                pts.append(mp.group(1)); l = l[:mp.start(1)]
            desc.append(col(l, C_DESC, C_VISES))
            vises.append(col(l, C_VISES, C_IMPUT))
            imput.append(col(l, C_IMPUT))
        description = re.sub(r"\s+", " ", " ".join(d for d in desc if d)).strip()
        description = re.sub(r"\s*Excès de la vitesse permise de:?$", "", description)
        p = re.search(r"\d+", " ".join(pts))
        courante = {
            "no": m.group(1),
            "description": description,
            "articles": numeros(" ".join(vises)),
            "imputabilite": re.sub(r"\s+", " ", " ".join(i for i in imput if i)).strip(" ,"),
            "points": int(p.group(0)) if p else None,
        }
        entrees.append(courante)
        continue
    # Palier de vitesse rattaché à la dernière entrée
    corps = " ".join(l.strip() for l in lignes)
    corps = re.sub(r"^Excès de la vitesse permise de:\s*", "", corps)
    mp = re.match(r"^(.*?km/h)\s+(\d+)(.*)$", corps)
    if courante is not None and mp:
        palier = {"exces": mp.group(1).strip(), "points": int(mp.group(2))}
        reste = re.sub(r"\s+", " ", mp.group(3)).strip()
        if reste:
            palier["plus"] = reste
        courante.setdefault("paliers", []).append(palier)

entrees = [e for e in entrees if e["articles"] and (e["points"] is not None or e.get("paliers"))]
json.dump({"source": "Règlement sur les points d'inaptitude, RLRQ, c. C-24.2, r. 37, annexe", "entrees": entrees},
          open(sortie, "w"), ensure_ascii=False, separators=(",", ":"))
print(len(entrees), "entrées")
