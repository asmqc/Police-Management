"""Télécharge des lois fédérales (Justice Canada, XML officiel en français) et les convertit
au format de Police Management : data/lois/<nom>.json = {source, maj, articles: [...]}.

Exécuté par GitHub Actions (.github/workflows/lois-federales.yml).
Usage local : python outils/lois_federales.py [dossier_sortie]
"""
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date

LOIS = {
    "criminel": ("C-46", "Code criminel (L.R.C. 1985, ch. C-46)"),
    "cannabis": ("C-24.5", "Loi sur le cannabis (L.C. 2018, ch. 16)"),
    "drogues": ("C-38.8", "Loi réglementant certaines drogues et autres substances (L.C. 1996, ch. 19)"),
}
URL = "https://laws-lois.justice.gc.ca/fra/XML/{}.xml"
IGNORER = {"HistoricalNote", "MarginalNote", "Label", "Footnote", "Note", "ImageGroup", "Repealed"}
BLOCS = {"Subsection", "Paragraph", "Subparagraph", "Clause", "Subclause", "Definition", "ContinuedSectionSubsection",
         "ContinuedParagraph", "ContinuedSubparagraph", "ContinuedClause", "ContinuedDefinition", "FormulaGroup", "Provision", "List", "Item"}


def tag(e):
    return e.tag.split("}")[-1]


def texte_inline(e):
    """Texte d'un élément Text (ou équivalent), sans les termes anglais entre parenthèses superflus."""
    morceaux = []

    def parcourir(x):
        if tag(x) == "DefinedTermEn":  # terme anglais : on le saute
            if x.tail:
                morceaux.append(x.tail)
            return
        if x.text:
            morceaux.append(x.text)
        for y in x:
            parcourir(y)
        if x is not e and x.tail:
            morceaux.append(x.tail)

    parcourir(e)
    s = re.sub(r"\(\s*\)", "", "".join(morceaux))
    return re.sub(r"\s+", " ", s).strip()


def aplatir(e, lignes):
    """Parcourt une section et produit des lignes « (1) texte », « a) texte »…"""
    label = None
    for enfant in e:
        n = tag(enfant)
        if n == "Label":
            label = texte_inline(enfant)
        elif n == "Text":
            t = texte_inline(enfant)
            if t:
                lignes.append(f"{label} {t}" if label and tag(e) != "Section" else t)
                label = None
        elif n == "Repealed":
            lignes.append(texte_inline(enfant) or "[Abrogé]")
        elif n in BLOCS:
            aplatir(enfant, lignes)
        elif n in IGNORER:
            continue
        elif n in ("TableGroup", "table"):
            lignes.append("[Tableau : voir le texte officiel]")
        else:
            # Autres conteneurs : on descend
            if len(enfant):
                aplatir(enfant, lignes)


def convertir(code, source):
    with urllib.request.urlopen(urllib.request.Request(URL.format(code), headers={"User-Agent": "Mozilla/5.0 PoliceManagement"}), timeout=180) as r:
        xml = r.read()
    racine = ET.fromstring(xml)
    maj = racine.get("{http://justice.gc.ca/lims}current-date") or racine.get("lims:current-date") or date.today().isoformat()
    corps = next((x for x in racine.iter() if tag(x) == "Body"), racine)
    titres = {1: None, 2: None, 3: None}
    articles = []
    ordre = 0
    for e in corps.iter():
        n = tag(e)
        if n == "Heading":
            niveau = int(e.get("level", "1") or 1)
            tt = next((x for x in e if tag(x) == "TitleText"), None)
            lab = next((x for x in e if tag(x) == "Label"), None)
            titre = " ".join(filter(None, [texte_inline(lab) if lab is not None else "", texte_inline(tt) if tt is not None else ""])).strip()
            if niveau in titres:
                titres[niveau] = titre or None
                for k in range(niveau + 1, 4):
                    titres[k] = None
        elif n == "Section":
            lab = next((x for x in e if tag(x) == "Label"), None)
            if lab is None:
                continue
            numero = texte_inline(lab)
            note = next((x for x in e if tag(x) == "MarginalNote"), None)
            lignes = []
            aplatir(e, lignes)
            texte = "\n".join(lignes).strip()
            if not texte:
                continue
            ordre += 1
            articles.append({
                "numero": numero,
                "ordre": ordre,
                "titre": titres[1],
                "chapitre": titres[2],
                "section": texte_inline(note) if note is not None else titres[3],
                "texte": texte,
            })
    return {"source": f"{source} — Justice Canada", "maj": maj[:10], "articles": articles}


def main():
    sortie = sys.argv[1] if len(sys.argv) > 1 else "data/lois"
    erreurs = 0
    for nom, (code, source) in LOIS.items():
        try:
            d = convertir(code, source)
            if len(d["articles"]) < 50:
                raise ValueError(f"seulement {len(d['articles'])} articles")
            with open(f"{sortie}/{nom}.json", "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
            print(f"{nom}: {len(d['articles'])} articles, texte du {d['maj']}")
        except Exception as ex:  # on garde la version précédente
            erreurs += 1
            print(f"{nom}: ÉCHEC ({ex}) — version précédente conservée")
    sys.exit(1 if erreurs == len(LOIS) else 0)


if __name__ == "__main__":
    main()
