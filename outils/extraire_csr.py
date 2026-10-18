"""Extrait les articles du Code de la sécurité routière (RLRQ, c. C-24.2) depuis LégisQuébec.

Usage : python extraire_csr.py page.html sortie.json
"""
import json, re, sys
from bs4 import BeautifulSoup

entree, sortie = sys.argv[1], sys.argv[2]
soup = BeautifulSoup(open(entree, encoding="utf-8", errors="replace").read(), "lxml")
racine = soup.select_one("div.LegislativeDocument") or soup

for el in racine.select(".HistoricalNote, .HistoryLink, .tooltipInfo img, .Hidden, .Note"):
    el.decompose()


def propre(t):
    t = t.replace("\xa0", " ")
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\( ", "(", t)
    t = re.sub(r" \)", ")", t)
    t = re.sub(r" ([,.;:])", r"\1", t)
    return re.sub(r"\n{2,}", "\n", t).strip()


def titre_entete(h):
    lab = h.select_one("[class^=Label-group]")
    tit = h.select_one("[class^=TitleText-group]")
    lt = propre(lab.get_text(" ")) if lab else ""
    tt = propre(tit.get_text(" ")) if tit else ""
    if tt and tt in lt:
        lt = lt.replace(tt, "").strip()
    niveau = int(re.search(r"group(\d)", (lab or tit)["class"][0]).group(1)) if (lab or tit) else 9
    if tt.isupper():
        tt = tt[:1] + tt[1:].lower()
        for nom in ("québec", "société", "canada", "commission des transports", "ontario"):
            tt = re.sub(r"\b" + nom + r"\b", lambda m: m.group(0)[:1].upper() + m.group(0)[1:], tt)
    return niveau, lt + (" — " if lt and tt else "") + tt


articles = []
courant = {3: None, 4: None, 5: None, 6: None}
ordre = 0
for el in racine.find_all(["div"], recursive=True):
    cls = el.get("class") or []
    if "Heading" in cls:
        niveau, texte = titre_entete(el)
        courant[niveau] = texte
        for n in range(niveau + 1, 8):
            courant[n] = None
        continue
    if "section" in cls and (el.get("id") or "").startswith("se:"):
        numero = el["id"][3:].replace("_", ".")
        if "-" in numero:
            continue
        lignes = []
        for bloc in el.find_all("div", recursive=False):
            for lien in bloc.select("a.linkOtherLang"):
                lien.decompose()
            for sous in bloc.select("div.Paragraph, div.Definition, div.Subparagraph, div.Subsubparagraph"):
                sous.insert_before("\n")
            t = propre(bloc.get_text(" "))
            t = re.sub(r"^\s*" + re.escape(numero) + r"\s*\.\s*", "", t)
            if t:
                lignes.append(t)
        texte = "\n".join(lignes).strip()
        if not texte:
            continue
        ordre += 1
        articles.append({
            "numero": numero,
            "ordre": ordre,
            "titre": courant.get(3),
            "chapitre": courant.get(4),
            "section": " · ".join(x for x in (courant.get(5), courant.get(6)) if x) or None,
            "texte": texte,
        })

json.dump(articles, open(sortie, "w"), ensure_ascii=False, indent=0)
print(len(articles), "articles")
