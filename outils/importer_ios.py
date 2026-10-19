"""Importe dans data/ les données publiques de l'app iOS (dépôt police.management.app-non-officiel, branche Apple).
Usage : python3 outils/importer_ios.py <dossier contenant les fichiers SQData>"""
import json, sys, os, re
src = sys.argv[1]
dst = os.path.join(os.path.dirname(__file__), "..", "data")
LOIS = {
    "vhr": "loi_vhr", "transport": "loi_transport", "assurance": "loi_assurance",
    "marine": "fed_marine", "petits-batiments": "fed_petits_batiments",
    "restrictions": "fed_restrictions", "competence": "fed_competence",
}
for cle, f in LOIS.items():
    d = json.load(open(os.path.join(src, f + ".json"), encoding="utf-8"))
    arts = [{"numero": a["num"], "ordre": i + 1, "titre": a.get("theme") or None, "chapitre": None, "section": None,
             "texte": re.sub(r"[ \t]+", " ", a["texte"]).strip()} for i, a in enumerate(d["articles"])]
    json.dump({"source": d["source"], "maj": d["maj"], "articles": arts}, open(os.path.join(dst, "lois", cle + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(cle, len(arts))
# Postes de police (OpenStreetMap) situés au Québec, hors Sûreté du Québec (déjà couverte par sq_postes)
g = json.load(open(os.path.join(src, "postes_police_canada.geojson"), encoding="utf-8"))
# Garde seulement les postes situés dans une municipalité du Québec (data/municipalites.geojson)
from shapely.geometry import shape, Point
from shapely.strtree import STRtree
_m = json.load(open(os.path.join(dst, "municipalites.geojson"), encoding="utf-8"))
_geoms = [shape(f["geometry"]) for f in _m["features"]]
_arbre = STRtree(_geoms)
def au_qc(f):
    p = Point(f["geometry"]["coordinates"][:2])
    return any(_geoms[i].distance(p) < 0.02 for i in _arbre.query(p.buffer(0.02)))
feats = []
for f in g["features"]:
    if f["geometry"]["type"] != "Point" or not au_qc(f): continue
    p = f["properties"]
    nom = p.get("nom") or ""
    if re.search(r"s[ûu]ret[ée] du qu[ée]bec|ontario provincial|transport de valeurs|investigation", nom + " " + (p.get("exploitant") or ""), re.I): continue
    feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c, 5) for c in f["geometry"]["coordinates"][:2]]},
                  "properties": {k: v for k, v in p.items() if v and k != "id"}})
json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(dst, "postes_autres.geojson"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("postes autres QC", len(feats))
dj = json.load(open(os.path.join(src, "districts_judiciaires.json"), encoding="utf-8"))
json.dump(dj, open(os.path.join(dst, "districts_judiciaires.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("districts", len(dj))
