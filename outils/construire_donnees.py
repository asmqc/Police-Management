"""Télécharge les données ouvertes du Québec et prépare les fichiers légers de la carte.

Sources (licence CC-BY 4.0, Données Québec) :
- Repères kilométriques : Ministère des Transports et de la Mobilité durable
- Desserte Sûreté du Québec : Sûreté du Québec
- Découpages administratifs (municipalités) : ministère des Ressources naturelles et des Forêts
"""
import io, json, os, subprocess, sys, zipfile, glob, time
import urllib.request

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

DATA = "data"
TMP = "tmp"
DIAG = "exploration"
for d in (DATA, TMP, DIAG):
    os.makedirs(d, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) police-extreme-donnees/1.0"}
DSQ = "https://www.donneesquebec.ca/recherche/dataset/777a8cfc-9d97-4959-b89a-37c07f11dd5c/resource/"
SOURCES = {
    "reperes": "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:repere_km&outfile=RepereKilometrique&srsname=EPSG:4326&outputformat=geojson",
    "postes_mrc": DSQ + "c8458724-455f-4678-8b40-f9eee05c4c08/download/dsq_poste_s.geojson",
    "postes_aux": DSQ + "56c0f8c8-bece-45fb-aa47-daf5d7d69ac8/download/dsq_posta_s.geojson",
    "autoroutier": DSQ + "6b60ef66-886b-4e1f-9afc-2e48caf51959/download/dsq_poste_l.geojson",
    "bureaux": DSQ + "48cb17de-3013-4147-846e-b602702a6c67/download/dsq_poste_p.geojson",
    "districts": DSQ + "1d3ef8aa-53d8-4f49-a578-4eafe357ed07/download/dsq_district_s.geojson",
    "sda": "https://diffusion.mern.gouv.qc.ca/diffusion/RGQ/Vectoriel/Theme/Local/SDA_20k/GPKG/SDA.gpkg.zip",
}
diag = {}


def telecharger(cle):
    url = SOURCES[cle]
    ext = ".zip" if url.endswith(".zip") else ".geojson"
    chemin = f"{TMP}/{cle}{ext}"
    if os.path.exists(chemin):
        return chemin
    for essai in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=600) as r, open(chemin, "wb") as f:
                f.write(r.read())
            print("téléchargé", cle, os.path.getsize(chemin))
            return chemin
        except Exception as e:
            print("échec", cle, e)
            time.sleep(10 * (essai + 1))
    raise SystemExit(f"Impossible de télécharger {cle}")


def ecrire(gdf, nom, tolerance, garder):
    gdf = gdf.to_crs(4326)[garder + ["geometry"]].copy()
    if tolerance:
        gdf["geometry"] = gdf.geometry.simplify(tolerance, preserve_topology=True)
    gdf = gdf[~gdf.geometry.is_empty]
    chemin = f"{DATA}/{nom}.geojson"
    gdf.to_file(chemin, driver="GeoJSON", COORDINATE_PRECISION=5)
    diag[nom] = {"nb": len(gdf), "octets": os.path.getsize(chemin)}
    print(nom, diag[nom])
    return gdf


# 1. Repères kilométriques -> tableau compact
rep = json.load(open(telecharger("reperes")))
lignes = []
for f in rep["features"]:
    p = f["properties"]
    try:
        no = int(str(p.get("norte") or "0"))
    except ValueError:
        continue
    km = p.get("affichnb")
    if km is None or not f.get("geometry"):
        continue
    lon, lat = f["geometry"]["coordinates"][:2]
    lignes.append([no, float(km), (p.get("direction") or "")[:1], round(lon, 5), round(lat, 5),
                   p.get("nommun") or "", p.get("nomrte") or ""])
noms_routes = {}
for l in lignes:
    noms_routes.setdefault(l[0], set()).add(l[6])
sortie = {
    "source": "Repères kilométriques, MTMD (Données Québec, CC-BY 4.0)",
    "version": rep["features"][0]["properties"].get("version") if rep["features"] else None,
    "champs": ["route", "km", "direction", "lon", "lat", "municipalite"],
    "routes": {str(k): sorted(v)[0] for k, v in noms_routes.items()},
    "reperes": [l[:6] for l in sorted(lignes, key=lambda x: (x[0], x[1]))],
}
json.dump(sortie, open(f"{DATA}/reperes.json", "w"), ensure_ascii=False, separators=(",", ":"))
diag["reperes"] = {"nb": len(lignes), "octets": os.path.getsize(f"{DATA}/reperes.json")}

# 2. Desserte SQ
champs = ["NOM_UNIT", "CAT_UNIT", "NOM_CS", "NOM_REG", "NOM_DIST"]
postes = pd.concat([gpd.read_file(telecharger("postes_mrc")), gpd.read_file(telecharger("postes_aux"))])
postes = gpd.GeoDataFrame(postes, geometry="geometry", crs=postes.crs)
ecrire(postes, "sq_postes", 0.003, champs)
ecrire(gpd.read_file(telecharger("districts")), "sq_districts", 0.01, ["NOM_DIST"])
ecrire(gpd.read_file(telecharger("autoroutier")), "sq_autoroutier", 0.0015, champs)
bur = gpd.read_file(telecharger("bureaux"))
ecrire(bur, "sq_bureaux", 0, ["NOM_ENT", "CAT_UNIT", "ADRESSE", "MUNICIPALITE", "CODE_POST", "NOM_REG"])

# 3. Municipalités non desservies par la SQ -> corps de police municipaux ou autochtones
z = telecharger("sda")
zipfile.ZipFile(z).extractall(f"{TMP}/sda")
gpkgs = glob.glob(f"{TMP}/sda/**/*.gpkg", recursive=True)
diag["sda_fichiers"] = gpkgs
import fiona
couches = fiona.listlayers(gpkgs[0])
diag["sda_couches"] = couches
nom_couche = next(c for c in couches if "munic" in c.lower() and c.lower().endswith("_s"))
mun = gpd.read_file(gpkgs[0], layer=nom_couche).to_crs(4326)
diag["sda_champs"] = list(mun.columns)
diag["sda_exemple"] = mun.drop(columns="geometry").head(3).astype(str).to_dict("records")

zone_sq = unary_union(postes.to_crs(4326).geometry.buffer(0))
pts = mun.geometry.representative_point()
mun["sq"] = pts.within(zone_sq)
hors = mun[~mun["sq"]].copy()
col_code = next((c for c in mun.columns if c.upper() in ("MUS_CO_GEO", "CO_GEO", "CODE_GEO")), None)
col_nom = next((c for c in mun.columns if c.upper() in ("MUS_NM_MUN", "NM_MUN", "NOM_MUN")), None)
col_mrc = next((c for c in mun.columns if c.upper() in ("MUS_NM_MRC", "NM_MRC")), None)
col_des = next((c for c in mun.columns if c.upper() in ("MUS_CO_DES", "CO_DES")), None)
hors = hors.rename(columns={col_code: "code", col_nom: "nom"})
if col_mrc:
    hors = hors.rename(columns={col_mrc: "mrc"})
else:
    hors["mrc"] = ""
if col_des:
    hors = hors.rename(columns={col_des: "designation"})
else:
    hors["designation"] = ""
hors = hors.dissolve(by=["code", "nom", "mrc", "designation"], as_index=False)
ecrire(hors, "municipalites_hors_sq", 0.0008, ["code", "nom", "mrc", "designation"])
diag["municipalites_hors_sq_liste"] = sorted(
    (f"{r['nom']} ({r['designation']}, {r['mrc']}) [{r['code']}]" for _, r in hors.iterrows()))

json.dump(diag, open(f"{DIAG}/diagnostic.json", "w"), ensure_ascii=False, indent=1, default=str)
print("Terminé")
