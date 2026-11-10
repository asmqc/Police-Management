/* Police Management — Carte Apple Plans (MapKit JS) avec la même interface que la carte Leaflet utilisée par l'app.
   Seules les fonctions dont l'app se sert sont reproduites : carte, groupes, GeoJSON, marqueurs, cercles, lignes,
   bulles d'information, limites (bounds) et couche WMS du MTMD. Si MapKit JS ne se charge pas, l'app garde Leaflet. */
(function () {
  "use strict";
  window.PMCarteApple = {
    creer(mk) {
      const RAYON = 6371008.8;
      const ll = (x) => (Array.isArray(x) ? { lat: +x[0], lng: +x[1] } : { lat: +x.lat, lng: +(x.lng ?? x.lon) });
      const coord = (x) => { const p = ll(x); return new mk.Coordinate(p.lat, p.lng); };

      /* ---------- Limites (LatLngBounds) ---------- */
      class Bornes {
        constructor(pts) { this.s = Infinity; this.n = -Infinity; this.o = Infinity; this.e = -Infinity; (pts || []).forEach((p) => this.extend(p)); }
        extend(x) {
          if (x instanceof Bornes) { if (x.isValid()) { this.extend([x.s, x.o]); this.extend([x.n, x.e]); } return this; }
          const p = ll(x);
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return this;
          this.s = Math.min(this.s, p.lat); this.n = Math.max(this.n, p.lat); this.o = Math.min(this.o, p.lng); this.e = Math.max(this.e, p.lng);
          return this;
        }
        isValid() { return this.s <= this.n && this.o <= this.e; }
        pad(r) { const dl = (this.n - this.s) * r, dg = (this.e - this.o) * r; const b = new Bornes(); b.s = this.s - dl; b.n = this.n + dl; b.o = this.o - dg; b.e = this.e + dg; return b; }
        getSouth() { return this.s; } getNorth() { return this.n; } getWest() { return this.o; } getEast() { return this.e; }
        getCenter() { return { lat: (this.s + this.n) / 2, lng: (this.o + this.e) / 2 }; }
      }

      /* ---------- Bulle d'information (équivalent des popups Leaflet) ---------- */
      const contenuBulle = (src, couche) => {
        const c = typeof src === "function" ? src(couche) : src;
        const div = document.createElement("div");
        div.className = "pm-bulle";
        if (c instanceof Node) div.appendChild(c); else div.innerHTML = String(c ?? "");
        return div;
      };
      const delegueBulle = (couche) => ({
        calloutElementForAnnotation: () => contenuBulle(couche._bulle, couche),
        calloutAnchorOffsetForAnnotation: (a, taille) => new DOMPoint(0, 0),
        calloutShouldAppearForAnnotation: () => true,
      });

      /* ---------- Couches ---------- */
      class Couche {
        constructor() { this._carte = null; this._parent = null; }
        addTo(cible) { if (cible instanceof Groupe) cible.addLayer(this); else if (cible instanceof Carte) cible.addLayer(this); return this; }
        bindPopup(src) { this._bulle = src; this._activerBulle && this._activerBulle(); return this; }
        bindTooltip(texte) { this._infobulle = String(texte); this._activerInfobulle && this._activerInfobulle(); return this; }
        bringToBack() { return this; }
        bringToFront() { return this; }
        // Éléments MapKit de cette couche (feuilles seulement)
        _elements(acc) { if (this._ov) acc.ov.push(...this._ov); if (this._an) acc.an.push(...this._an); if (this._tuiles) acc.tu.push(this._tuiles); return acc; }
      }
      const tout = (couche) => couche._elements({ ov: [], an: [], tu: [] });
      const attacher = (carte, el) => {
        if (el.ov.length) carte.map.addOverlays(el.ov);
        if (el.an.length) carte.map.addAnnotations(el.an);
        el.tu.forEach((t) => carte.map.addTileOverlay(t));
      };
      const detacher = (carte, el) => {
        const m = carte.map;
        const ov = el.ov.filter((o) => m.overlays.includes(o)), an = el.an.filter((a) => m.annotations.includes(a));
        if (ov.length) m.removeOverlays(ov);
        if (an.length) m.removeAnnotations(an);
        el.tu.forEach((t) => { if (m.tileOverlays.includes(t)) m.removeTileOverlay(t); });
      };

      class Groupe extends Couche {
        constructor(couches) { super(); this._enfants = []; (couches || []).forEach((c) => this.addLayer(c)); }
        // Carte effective : celle du groupe ou d'un groupe parent déjà affiché
        _carteEff() { for (let g = this; g; g = g._parent) if (g._carte) return g._carte; return null; }
        addLayer(c) { this._enfants.push(c); c._parent = this; const k = this._carteEff(); if (k) attacher(k, tout(c)); return this; }
        removeLayer(c) { const i = this._enfants.indexOf(c); if (i < 0) return this; this._enfants.splice(i, 1); const k = this._carteEff(); if (k) detacher(k, tout(c)); c._parent = null; return this; }
        clearLayers() { const k = this._carteEff(); if (k) detacher(k, tout(this)); this._enfants.forEach((c) => (c._parent = null)); this._enfants = []; return this; }
        getLayers() { return this._enfants.slice(); }
        eachLayer(fn) { this._enfants.forEach(fn); return this; }
        getBounds() { const b = new Bornes(); this._enfants.forEach((c) => c.getBounds && b.extend(c.getBounds())); return b; }
        _elements(acc) { this._enfants.forEach((c) => c._elements(acc)); return acc; }
      }

      // Style Leaflet → style MapKit
      const style = (s, ligne) => {
        s = s || {};
        const o = {
          strokeColor: s.stroke === false ? "transparent" : (s.color || "#3388ff"),
          strokeOpacity: s.stroke === false ? 0 : (s.opacity ?? 1),
          lineWidth: s.weight ?? 3,
          lineJoin: "round", lineCap: "round",
        };
        if (s.dashArray) o.lineDash = String(s.dashArray).split(/[ ,]+/).map(Number).filter((n) => n > 0);
        if (!ligne) { o.fillColor = s.fill === false ? "transparent" : (s.fillColor || s.color || "#3388ff"); o.fillOpacity = s.fill === false ? 0 : (s.fillOpacity ?? 0.2); }
        return new mk.Style(o);
      };

      class Forme extends Couche {
        // anneaux : tableaux de [lat, lng]; polygone : vrai pour une surface
        constructor(parties, opts, polygone) {
          super();
          this._parties = parties; this._polygone = polygone;
          const st = style(opts, !polygone);
          const actif = opts && opts.interactive !== false;
          // Surfaces : un seul overlay par entité (toutes les parties comme anneaux); lignes : un overlay par ligne
          const groupes = polygone ? [parties.flat(1)] : parties;
          this._ov = groupes.map((p) => {
            const o = polygone ? new mk.PolygonOverlay(p.map((r) => r.map(coord)), { style: st }) : new mk.PolylineOverlay(p.map(coord), { style: st });
            o.enabled = false; o._pmActif = actif; o._pmCouche = this;
            return o;
          });
        }
        _activerBulle() { this._ov.forEach((o) => { if (o._pmActif) o.enabled = true; }); }
        getBounds() { const b = new Bornes(); this._parties.forEach((p) => (this._polygone ? p[0] : p).forEach((x) => b.extend(x))); return b; }
        setLatLngs(pts) { // lignes seulement (mesure de distance)
          this._parties = [pts.map((x) => { const p = ll(x); return [p.lat, p.lng]; })];
          if (this._ov[0]) this._ov[0].points = this._parties[0].map(coord);
          return this;
        }
      }

      class Icone { constructor(o) { this.options = o || {}; } }

      // Élément HTML d'un marqueur (divIcon ou point circulaire)
      const elementIcone = (opts) => {
        const div = document.createElement("div");
        if (opts.cercle) {
          const r = opts.cercle.radius ?? 6, w = opts.cercle.weight ?? 2;
          div.className = "pm-point";
          Object.assign(div.style, { width: 2 * r + "px", height: 2 * r + "px", borderRadius: "50%", boxSizing: "border-box", background: opts.cercle.fillColor || "#3388ff", border: `${w}px solid ${opts.cercle.color || "#fff"}`, opacity: String(opts.cercle.fillOpacity ?? 1) });
          return div;
        }
        const ic = opts.icon.options;
        div.className = "pm-icone " + (ic.className || "");
        if (ic.html) { if (ic.html instanceof Node) div.appendChild(ic.html); else div.innerHTML = ic.html; }
        if (ic.iconSize) { div.style.width = ic.iconSize[0] + "px"; div.style.height = ic.iconSize[1] + "px"; }
        else { div.style.width = "0"; div.style.height = "0"; div.style.overflow = "visible"; }
        return div;
      };
      // MapKit place le bas-centre de l'élément sur le point; on reproduit l'ancrage de Leaflet
      const ancrage = (opts) => {
        if (opts.cercle) { const r = opts.cercle.radius ?? 6; return new DOMPoint(0, r); }
        const ic = opts.icon.options, t = ic.iconSize;
        if (!t) return new DOMPoint(0, 0);
        const a = ic.iconAnchor || [t[0] / 2, t[1] / 2];
        return new DOMPoint(t[0] / 2 - a[0], t[1] - a[1]);
      };

      class Marqueur extends Couche {
        constructor(pos, opts, cercle) {
          super();
          opts = opts || {};
          this._pos = ll(pos);
          const c = coord(pos);
          const actif = opts.interactive !== false;
          if (!cercle && !opts.icon) {
            this._an = [new mk.MarkerAnnotation(c, { color: "#C62F3A", title: opts.title || "", calloutEnabled: false, enabled: actif })];
          } else {
            const o = cercle ? { cercle: opts } : opts;
            const titre = opts.title || "";
            this._an = [new mk.Annotation(c, () => { const el = elementIcone(o); if (titre || this._infobulle) el.title = this._infobulle || titre; return el; },
              { anchorOffset: ancrage(o), calloutEnabled: false, enabled: actif, accessibilityLabel: titre || undefined })];
          }
          this._an[0]._pmCouche = this;
        }
        _activerBulle() { const a = this._an[0]; a.enabled = true; a.calloutEnabled = true; a.callout = delegueBulle(this); }
        getLatLng() { return { ...this._pos }; }
        getBounds() { return new Bornes([this._pos]); }
      }

      /* Grandes couches de surfaces et de lignes non cliquables (desserte SQ, municipalités, autoroutes, limites, districts) :
         dessinées sur l'appareil en tuiles (canvas), comme le rendu canvas de Leaflet. Des milliers d'overlays MapKit seraient trop lents. */
      const projX = (lng) => ((lng + 180) / 360) * 256;
      const projY = (lat) => { const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256; };
      class CoucheDessinee extends Couche {
        constructor(feats, opts) {
          super();
          this._b = new Bornes();
          this._formes = [];
          for (const f of feats) {
            const g = f && f.geometry; if (!g) continue;
            const st = (typeof opts.style === "function" ? opts.style(f) : opts.style) || {};
            if (st.stroke === false && st.fill === false) continue;
            const surf = /Polygon/.test(g.type), multi = /^Multi/.test(g.type);
            if (!surf && !/LineString/.test(g.type)) continue;
            const parties = multi ? g.coordinates : [g.coordinates];
            const anneaux = surf ? parties.flat(1) : parties; // chaque anneau ou ligne : [[lng, lat], ...]
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            const proj = anneaux.map((r) => { const t = new Float64Array(r.length * 2); r.forEach(([lng, lat], i) => { const x = projX(lng), y = projY(lat); t[2 * i] = x; t[2 * i + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; this._b.extend([lat, lng]); }); return t; });
            this._formes.push({ surf, proj, x0, y0, x1, y1, st });
          }
          this._tuiles = new mk.TileOverlay((x, y, z, echelle) => this._tuile(x, y, z, echelle || 1), { opacity: 1 });
        }
        _tuile(x, y, z, echelle) {
          const k = 2 ** z, ox = x * 256, oy = y * 256, marge = 8 / k;
          const visibles = this._formes.filter((f) => f.x1 * k >= ox - marge * k && f.x0 * k <= ox + 256 + marge * k && f.y1 * k >= oy - marge * k && f.y0 * k <= oy + 256 + marge * k);
          if (!visibles.length) return null;
          const taille = Math.round(256 * echelle);
          const cv = document.createElement("canvas"); cv.width = cv.height = taille;
          const g = cv.getContext("2d");
          g.scale(echelle, echelle); g.lineJoin = "round"; g.lineCap = "round";
          for (const f of visibles) {
            const st = f.st;
            g.beginPath();
            for (const t of f.proj) { for (let i = 0; i < t.length; i += 2) { const px = t[i] * k - ox, py = t[i + 1] * k - oy; i ? g.lineTo(px, py) : g.moveTo(px, py); } if (f.surf) g.closePath(); }
            if (f.surf && st.fill !== false) { g.globalAlpha = st.fillOpacity ?? 0.2; g.fillStyle = st.fillColor || st.color || "#3388ff"; g.fill("evenodd"); }
            if (st.stroke !== false) {
              g.globalAlpha = st.opacity ?? 1; g.strokeStyle = st.color || "#3388ff"; g.lineWidth = st.weight ?? 3;
              g.setLineDash(st.dashArray ? String(st.dashArray).split(/[ ,]+/).map(Number).filter((n) => n > 0) : []);
              g.stroke();
            }
          }
          return cv.toDataURL("image/png");
        }
        getBounds() { return this._b; }
      }

      // GeoJSON : un groupe, une couche par entité
      class CoucheGeoJSON extends Groupe {
        constructor(fc, opts) {
          super();
          opts = opts || {};
          const feats = fc ? (fc.type === "FeatureCollection" ? fc.features : fc.type === "Feature" ? [fc] : []) : [];
          if (opts.renderer && opts.interactive === false && !opts.onEachFeature && !opts.pointToLayer) { this.addLayer(new CoucheDessinee(feats, opts)); return; }
          for (const f of feats) {
            const g = f && f.geometry;
            if (!g) continue;
            const st = typeof opts.style === "function" ? opts.style(f) : opts.style;
            const base = { ...(st || {}), interactive: opts.interactive };
            const anneaux = (rings) => rings.map((r) => r.map(([x, y]) => [y, x]));
            let c = null;
            if (g.type === "Point") {
              const p = { lat: g.coordinates[1], lng: g.coordinates[0] };
              c = opts.pointToLayer ? opts.pointToLayer(f, p) : new Marqueur(p, { interactive: opts.interactive });
            } else if (g.type === "MultiPoint") {
              c = new Groupe(g.coordinates.map(([x, y]) => (opts.pointToLayer ? opts.pointToLayer(f, { lat: y, lng: x }) : new Marqueur([y, x], {}))));
            } else if (g.type === "LineString") c = new Forme([g.coordinates.map(([x, y]) => [y, x])], base, false);
            else if (g.type === "MultiLineString") c = new Forme(g.coordinates.map((l) => l.map(([x, y]) => [y, x])), base, false);
            else if (g.type === "Polygon") { if (st && st.stroke === false && st.fill === false) continue; c = new Forme([anneaux(g.coordinates)], base, true); }
            else if (g.type === "MultiPolygon") { if (st && st.stroke === false && st.fill === false) continue; c = new Forme(g.coordinates.map(anneaux), base, true); }
            if (!c) continue;
            c.feature = f;
            if (opts.onEachFeature) opts.onEachFeature(f, c);
            this.addLayer(c);
          }
        }
      }

      // Couche WMS du MTMD (sorties d'autoroute) en tuiles Web Mercator
      class TuilesWMS extends Couche {
        constructor(url, o) {
          super();
          const M = 20037508.342789244;
          this._tuiles = new mk.TileOverlay((x, y, z, echelle) => {
            const t = (2 * M) / 2 ** z, px = Math.round(256 * (echelle || 1));
            const bbox = [-M + x * t, M - (y + 1) * t, -M + (x + 1) * t, M - y * t].join(",");
            return `${url}?service=WMS&request=GetMap&version=${o.version || "1.3.0"}&layers=${encodeURIComponent(o.layers)}&styles=&format=${encodeURIComponent(o.format || "image/png")}&transparent=${o.transparent ? "true" : "false"}&crs=EPSG:3857&width=${px}&height=${px}&bbox=${bbox}`;
          }, { minimumZ: o.minZoom ?? 0, opacity: o.opacity ?? 1 });
        }
      }
      // Les fonds Leaflet (OpenStreetMap, Esri) sont remplacés par les types de carte Apple : couche vide
      class Vide extends Couche { addTo() { return this; } }

      /* ---------- Carte ---------- */
      class Carte {
        constructor(id, opts) {
          const el = typeof id === "string" ? document.getElementById(id) : id;
          this.el = el;
          el.classList.add("carte-apple");
          const position = getComputedStyle(el).position;
          this.map = new mk.Map(el, {
            showsZoomControl: true, showsCompass: mk.FeatureVisibility ? mk.FeatureVisibility.Adaptive : undefined,
            showsMapTypeControl: false, showsScale: mk.FeatureVisibility ? mk.FeatureVisibility.Adaptive : undefined,
            isRotationEnabled: false, showsPointsOfInterest: true,
          });
          // Garder le positionnement prévu par la feuille de style (la carte remplit sa zone)
          if (position !== "static" && el.style.position && el.style.position !== position) el.style.position = position;
          this.definirTheme();
          this._ecoutes = new Map();
          // Une bulle pour les lignes et surfaces cliquables (511) : annotation temporaire au point touché
          this.map.addEventListener("select", (e) => {
            const o = e.overlay;
            if (!o || !o._pmCouche || !o._pmCouche._bulle) return;
            const couche = o._pmCouche;
            const centre = couche.getBounds().getCenter();
            if (this._bulleTemp) this.map.removeAnnotation(this._bulleTemp);
            const a = new mk.Annotation(new mk.Coordinate(centre.lat, centre.lng), () => { const d = document.createElement("div"); d.style.width = "1px"; d.style.height = "1px"; return d; },
              { calloutEnabled: true, callout: delegueBulle(couche) });
            this._bulleTemp = a;
            this.map.addAnnotation(a);
            a.selected = true;
            setTimeout(() => { try { o.selected = false; } catch { /* rien */ } }, 0);
          });
        }
        definirTheme() {
          const t = document.documentElement.getAttribute("data-theme");
          const sombre = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
          this.map.colorScheme = sombre ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light;
        }
        definirFond(f) { this.map.mapType = f === "satellite" ? mk.Map.MapTypes.Hybrid : mk.Map.MapTypes.Standard; }
        _taille() { return { w: this.el.clientWidth || 360, h: this.el.clientHeight || 480 }; }
        getZoom() {
          const r = this.map.region; const { w } = this._taille();
          return Math.max(0, Math.min(20, Math.log2((360 * w) / (256 * Math.max(r.span.longitudeDelta, 1e-9)))));
        }
        setView(pos, z) {
          const p = ll(pos), { w, h } = this._taille();
          const z2 = z ?? this.getZoom();
          const dLon = (360 * w) / (256 * 2 ** z2);
          const dLat = Math.min(170, dLon * (h / w) * Math.cos((p.lat * Math.PI) / 180));
          this.map.region = new mk.CoordinateRegion(new mk.Coordinate(p.lat, p.lng), new mk.CoordinateSpan(dLat, dLon));
          return this;
        }
        getCenter() { const c = this.map.center; return { lat: c.latitude, lng: c.longitude }; }
        getBounds() {
          const b = this.map.region.toBoundingRegion();
          const r = new Bornes(); r.s = b.southLatitude; r.n = b.northLatitude; r.o = b.westLongitude; r.e = b.eastLongitude; return r;
        }
        fitBounds(b, o) {
          if (!(b instanceof Bornes)) b = new Bornes(b);
          if (!b.isValid()) return this;
          if (b.n === b.s && b.e === b.o) return this.setView([b.s, b.o], (o && o.maxZoom) || 15);
          this.map.region = new mk.BoundingRegion(b.n, b.e, b.s, b.o).toCoordinateRegion();
          if (o && o.maxZoom != null && this.getZoom() > o.maxZoom) this.setView(b.getCenter(), o.maxZoom);
          return this;
        }
        addLayer(c) { if (c._carte === this) return this; if (c._carte) c._carte.removeLayer(c); c._carte = this; attacher(this, tout(c)); return this; }
        removeLayer(c) { if (!c || c._carte !== this) return this; detacher(this, tout(c)); c._carte = null; return this; }
        hasLayer(c) { return !!c && c._carte === this; }
        invalidateSize() { return this; } // MapKit suit la taille de son conteneur
        distance(a, b) {
          const p = ll(a), q = ll(b), r = Math.PI / 180;
          const s = Math.sin(((q.lat - p.lat) * r) / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin(((q.lng - p.lng) * r) / 2) ** 2;
          return 2 * RAYON * Math.asin(Math.min(1, Math.sqrt(s)));
        }
        on(evts, fn) {
          for (const ev of String(evts).split(/\s+/)) {
            if (ev === "moveend" || ev === "zoomend") {
              if (this._ecoutes.get(fn)) continue; // « moveend zoomend » : un seul appel par déplacement
              const h = () => fn({ target: this });
              this._ecoutes.set(fn, h);
              this.map.addEventListener("region-change-end", h);
            } else if (ev === "click") {
              this.map.addEventListener("single-tap", (e) => {
                const c = this.map.convertPointOnPageToCoordinate(e.pointOnPage);
                fn({ latlng: { lat: c.latitude, lng: c.longitude }, target: this });
              });
            }
          }
          return this;
        }
      }
      const L = {
        apple: true,
        map: (id, o) => new Carte(id, o),
        layerGroup: (c) => new Groupe(c),
        featureGroup: (c) => new Groupe(c),
        geoJSON: (fc, o) => new CoucheGeoJSON(fc, o),
        marker: (p, o) => new Marqueur(p, o, false),
        circleMarker: (p, o) => new Marqueur(p, { ...(o || {}) }, true),
        polyline: (pts, o) => new Forme([(pts || []).map((x) => { const p = ll(x); return [p.lat, p.lng]; })], o, false),
        polygon: (pts, o) => new Forme([[(pts || []).map((x) => { const p = ll(x); return [p.lat, p.lng]; })]], o, true),
        divIcon: (o) => new Icone(o),
        latLngBounds: (pts) => new Bornes(pts),
        latLng: (a, b) => (b == null ? ll(a) : { lat: +a, lng: +b }),
        canvas: () => ({}),
        control: { zoom: () => ({ addTo() { return this; } }) },
        tileLayer: Object.assign(() => new Vide(), { wms: (url, o) => new TuilesWMS(url, o || {}) }),
      };
      return L;
    },
  };
})();
