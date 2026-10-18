"""Exploration : liste les ressources des jeux de données et télécharge les sources brutes."""
import json, os, urllib.request, urllib.parse

API = "https://www.donneesquebec.ca/recherche/api/3/action/"
OUT = "brut"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "police-extreme-donnees/1.0"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


rapport = {}
for pid in ["repere-kilometrique", "desserte-surete-du-quebec", "decoupages-administratifs"]:
    try:
        pkg = json.loads(get(API + "package_show?id=" + pid))["result"]
    except Exception as e:
        rapport[pid] = f"ERREUR {e}"
        continue
    rapport[pid] = [
        {"nom": r.get("name"), "format": r.get("format"), "url": r.get("url")}
        for r in pkg["resources"]
    ]

for q in ["corps de police", "service de police municipal", "desserte policière"]:
    try:
        res = json.loads(get(API + "package_search?rows=15&q=" + urllib.parse.quote(q)))["result"]["results"]
        rapport["recherche:" + q] = [(p["name"], p["title"]) for p in res]
    except Exception as e:
        rapport["recherche:" + q] = f"ERREUR {e}"

with open(f"{OUT}/rapport.json", "w") as f:
    json.dump(rapport, f, ensure_ascii=False, indent=1)

# Échantillons
for pid in ["repere-kilometrique", "desserte-surete-du-quebec", "decoupages-administratifs"]:
    if not isinstance(rapport.get(pid), list):
        continue
    for r in rapport[pid]:
        fmt = (r["format"] or "").lower()
        url = r["url"] or ""
        if fmt in ("geojson", "csv") or url.lower().endswith((".geojson", ".csv", ".json")):
            nom = f"{pid}__{(r['nom'] or 'x').replace('/', '_').replace(' ', '_')}.{fmt or 'dat'}"
            try:
                data = get(url)
                with open(f"{OUT}/{nom}", "wb") as f:
                    f.write(data)
                print("OK", nom, len(data))
            except Exception as e:
                print("ÉCHEC", nom, e)

# Code de la sécurité routière (LégisQuébec)
for u in [
    "https://www.legisquebec.gouv.qc.ca/fr/document/lc/C-24.2",
    "https://www.legisquebec.gouv.qc.ca/fr/pdf/lc/C-24.2.pdf",
]:
    try:
        data = get(u)
        nom = "csr." + ("pdf" if u.endswith(".pdf") else "html")
        with open(f"{OUT}/{nom}", "wb") as f:
            f.write(data)
        print("OK", nom, len(data))
    except Exception as e:
        print("ÉCHEC", u, e)
