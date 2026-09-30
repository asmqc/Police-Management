/* Police Management — script partagé */
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  /* ---------- Thème clair / sombre ---------- */
  var themeMeta = document.querySelector('meta[name="theme-color"]:not([media])');
  function syncThemeColor() {
    if (themeMeta) themeMeta.setAttribute('content', root.classList.contains('dark') ? '#07080F' : '#FBFBFE');
  }
  syncThemeColor();
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dark = root.classList.toggle('dark');
      try { localStorage.setItem('pm-theme', dark ? 'dark' : 'light'); } catch (e) {}
      syncThemeColor();
    });
  });

  /* ---------- Menu ordinateur : indicateur qui glisse ---------- */
  var menu = document.querySelector('.menu');
  if (menu) {
    var ind = menu.querySelector('.menu-ind');
    var links = Array.prototype.slice.call(menu.querySelectorAll('a'));
    var active = menu.querySelector('a[aria-current="page"]') || links[0];
    function moveTo(a, instant) {
      if (!a || !ind || !a.offsetWidth) return;
      if (instant) ind.style.transition = 'none';
      ind.style.setProperty('--x', (a.offsetLeft - 5) + 'px');
      ind.style.setProperty('--w', a.offsetWidth + 'px');
      ind.style.left = '5px';
      links.forEach(function (l) { l.classList.toggle('lit', l === a); });
      if (instant) { ind.offsetWidth; ind.style.transition = ''; }
    }
    moveTo(active, true);
    menu.classList.add('ready');
    links.forEach(function (a) {
      a.addEventListener('mouseenter', function () { moveTo(a); });
      a.addEventListener('focus', function () { moveTo(a); });
    });
    menu.addEventListener('mouseleave', function () { moveTo(active); });
    menu.addEventListener('focusout', function (e) { if (!menu.contains(e.relatedTarget)) moveTo(active); });
    window.addEventListener('resize', function () { moveTo(active, true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveTo(active, true); });
  }

  /* ---------- Onglets téléphone : petite vibration visuelle au toucher ---------- */
  var tabbar = document.querySelector('.tabbar');
  if (tabbar) {
    var home = tabbar.querySelector('a[aria-current="page"]');
    var homeI = tabbar.querySelector('.tab-ind') ? tabbar.querySelector('.tab-ind').style.getPropertyValue('--i') : '';
    /* Retour arrière (cache du navigateur) : remettre l'onglet de cette page */
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      tabbar.querySelectorAll('a').forEach(function (l) { l.removeAttribute('aria-current'); });
      if (home) home.setAttribute('aria-current', 'page');
      var ti = tabbar.querySelector('.tab-ind'); if (ti) ti.style.setProperty('--i', homeI);
    });
  }
  document.querySelectorAll('.tabbar a').forEach(function (a, i) {
    a.addEventListener('click', function () {
      var bar = a.parentNode;
      var ind = bar.querySelector('.tab-ind');
      if (ind) ind.style.setProperty('--i', i);
      bar.querySelectorAll('a').forEach(function (l) { l.removeAttribute('aria-current'); });
      a.setAttribute('aria-current', 'page');
    });
  });

  /* ---------- Année ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Apparition au défilement ---------- */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Carrousel de captures (glisser au doigt) ---------- */
  document.querySelectorAll('[data-carousel]').forEach(function (car) {
    var track = car.querySelector('.slides');
    var slides = Array.prototype.slice.call(track.children);
    var tabs = Array.prototype.slice.call(car.querySelectorAll('[data-go]'));
    var prev = car.querySelector('[data-prev]');
    var next = car.querySelector('[data-next]');
    var tabBar = car.querySelector('.tabs');
    var current = 0;

    function setActive(i) {
      current = i;
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && tabBar) {
          var l = t.offsetLeft - (tabBar.clientWidth - t.offsetWidth) / 2;
          tabBar.scrollTo({ left: l, behavior: 'smooth' });
        }
      });
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
    }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: 'smooth' });
      setActive(i);
    }
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { go(k); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); tabs[current].focus(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); tabs[current].focus(); }
      });
    });
    prev && prev.addEventListener('click', function () { go(current - 1); });
    next && next.addEventListener('click', function () { go(current + 1); });

    var t;
    track.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var w = track.clientWidth;
        var i = Math.round(track.scrollLeft / w);
        if (i !== current) setActive(Math.max(0, Math.min(slides.length - 1, i)));
      }, 60);
    }, { passive: true });
    setActive(0);
  });
})();
