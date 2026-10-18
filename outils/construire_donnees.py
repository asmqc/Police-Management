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


def telecharger(cle, essais=4, delai=600):
    url = SOURCES[cle]
    ext = ".zip" if url.endswith(".zip") else ".geojson"
    chemin = f"{TMP}/{cle}{ext}"
    if os.path.exists(chemin):
        return chemin
    for essai in range(essais):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=delai) as r, open(chemin, "wb") as f:
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
SOURCES["sda_rest"] = "https://servicescarto.mern.gouv.qc.ca/pes/rest/services/Territoire/SDA_WMS/MapServer"
SOURCES["statcan"] = "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcsd000b21a_f.zip"


def municipalites_sda():
    z = telecharger("sda", essais=1, delai=90)
    zipfile.ZipFile(z).extractall(f"{TMP}/sda")
    gpkgs = glob.glob(f"{TMP}/sda/**/*.gpkg", recursive=True)
    import fiona
    couches = fiona.listlayers(gpkgs[0])
    nom_couche = next(c for c in couches if "munic" in c.lower() and c.lower().endswith("_s"))
    return gpd.read_file(gpkgs[0], layer=nom_couche).to_crs(4326)


def municipalites_rest():
    base = SOURCES["sda_rest"]
    req = urllib.request.Request(base + "?f=json", headers=UA)
    meta = json.loads(urllib.request.urlopen(req, timeout=60).read())
    diag["rest_couches"] = [(l["id"], l["name"]) for l in meta["layers"]]
    simples = [l for l in meta["layers"] if not l.get("subLayerIds")]
    def ok(n):
        n = n.lower()
        return "municip" in n and "gional" not in n and "mrc" not in n and "arrondissement" not in n
    couche = next(l for l in simples if ok(l["name"]))
    diag["rest_couche"] = couche
    morceaux, offset = [], 0
    while True:
        q = (f"{base}/{couche['id']}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326"
             f"&maxAllowableOffset=0.0003&f=geojson&resultOffset={offset}&resultRecordCount=500")
        g = json.loads(urllib.request.urlopen(urllib.request.Request(q, headers=UA), timeout=180).read())
        fs = g.get("features", [])
        if not fs:
            break
        morceaux.extend(fs)
        offset += len(fs)
    return gpd.GeoDataFrame.from_features(morceaux, crs=4326)


def municipalites_statcan():
    z = telecharger("statcan", essais=2, delai=600)
    g = gpd.read_file("zip://" + z)
    diag["statcan_colonnes"] = list(g.columns)
    col_pr = "PRIDU" if "PRIDU" in g else "PRUID"
    g = g[g[col_pr].astype(str) == "24"].to_crs(4326)
    g["MUS_CO_GEO"] = g["SDRIDU"].astype(str).str[2:] if "SDRIDU" in g else g["CSDUID"].astype(str).str[2:]
    g["MUS_NM_MUN"] = g["SDRNOM"] if "SDRNOM" in g else g["CSDNAME"]
    g["MUS_CO_DES"] = g["SDRGENRE"] if "SDRGENRE" in g else g.get("CSDTYPE", "")
    return g


mun = None
for nom_source, fonction in (("SDA", municipalites_sda), ("REST MRNF", municipalites_rest), ("Statistique Canada", municipalites_statcan)):
    try:
        mun = fonction()
        if len(mun) < 900:
            raise ValueError(f"seulement {len(mun)} entités : ce n'est pas la couche des municipalités")
        diag["source_municipalites"] = nom_source
        print("municipalités :", nom_source, len(mun))
        break
    except BaseException as e:
        print("source municipalités indisponible :", nom_source, repr(e)[:200])
json.dump(diag, open(f"{DIAG}/diagnostic.json", "w"), ensure_ascii=False, indent=1, default=str)
if mun is None:
    raise SystemExit("Aucune source de municipalités disponible")
from shapely.validation import make_valid
mun = mun[mun.geometry.notna()].copy()
mun["geometry"] = mun.geometry.apply(make_valid)
diag["mun_champs"] = list(mun.columns)
diag["mun_exemple"] = mun.drop(columns="geometry").head(3).astype(str).to_dict("records")
json.dump(diag, open(f"{DIAG}/diagnostic.json", "w"), ensure_ascii=False, indent=1, default=str)
diag["sda_champs"] = list(mun.columns)
diag["sda_exemple"] = mun.drop(columns="geometry").head(3).astype(str).to_dict("records")

zone_sq = unary_union(postes.to_crs(4326).geometry.buffer(0))
pts = mun.geometry.representative_point()
mun["sq"] = pts.within(zone_sq)
hors = mun[~mun["sq"]].copy()
def colonne(*motifs):
    for m in motifs:
        for c in mun.columns:
            if m in c.upper():
                return c
    return None
col_code = colonne("MUS_CO_GEO", "CO_GEO", "CODE_GEO")
col_nom = colonne("MUS_NM_MUN", "NM_MUN", "NOM_MUN")
col_mrc = colonne("MUS_NM_MRC", "NM_MRC")
col_des = colonne("MUS_CO_DES", "CO_DES")
diag["colonnes"] = [col_code, col_nom, col_mrc, col_des]
# Index léger de toutes les municipalités (recherche « qui couvre ce territoire »)
index = []
for (_, r), pt in zip(mun.iterrows(), pts):
    index.append([r[col_nom], str(r[col_code]), r[col_mrc] if col_mrc else "", round(pt.x, 5), round(pt.y, 5), bool(r["sq"])])
vus = set()
index_u = []
for e in sorted(index, key=lambda e: e[0]):
    if (e[0], e[1]) in vus:
        continue
    vus.add((e[0], e[1]))
    index_u.append(e)
json.dump({"source": "Découpages administratifs, MRNF (Données Québec, CC-BY 4.0)",
           "champs": ["nom", "code", "mrc", "lon", "lat", "sq"], "municipalites": index_u},
          open(f"{DATA}/municipalites.json", "w"), ensure_ascii=False, separators=(",", ":"))
diag["municipalites"] = {"nb": len(index_u), "octets": os.path.getsize(f"{DATA}/municipalites.json")}

hors = hors.rename(columns={col_code: "code", col_nom: "nom"})
if col_mrc:
    hors = hors.rename(columns={col_mrc: "mrc"})
else:
    hors["mrc"] = ""
if col_des:
    hors = hors.rename(columns={col_des: "designation"})
else:
    hors["designation"] = ""
for c in ("code", "nom", "mrc", "designation"):
    hors[c] = hors[c].fillna("").astype(str)
try:
    hors = hors.dissolve(by=["code", "nom", "mrc", "designation"], as_index=False)
except Exception as e:
    print("fusion ignorée :", e)
ecrire(hors, "municipalites_hors_sq", 0.0008, ["code", "nom", "mrc", "designation"])
diag["municipalites_hors_sq_liste"] = sorted(
    (f"{r['nom']} ({r['designation']}, {r['mrc']}) [{r['code']}]" for _, r in hors.iterrows()))

json.dump(diag, open(f"{DIAG}/diagnostic.json", "w"), ensure_ascii=False, indent=1, default=str)
print("Terminé")
