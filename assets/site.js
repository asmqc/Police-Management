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

  /* ---------- Menu mobile ---------- */
  var sheet = document.getElementById('sheet');
  var openBtn = document.getElementById('menuOpen');
  var closeBtn = document.getElementById('menuClose');
  function setMenu(open) {
    if (!sheet) return;
    sheet.classList.toggle('open', open);
    sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) sheet.removeAttribute('inert'); else sheet.setAttribute('inert', '');
    openBtn && openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('no-scroll', open);
    if (open && closeBtn) closeBtn.focus();
    else if (!open && openBtn && sheet.contains(document.activeElement)) openBtn.focus();
  }
  if (sheet) {
    sheet.setAttribute('inert', '');
    openBtn && openBtn.addEventListener('click', function () { setMenu(true); });
    closeBtn && closeBtn.addEventListener('click', function () { setMenu(false); });
    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sheet.classList.contains('open')) setMenu(false);
    });
    window.matchMedia('(min-width:901px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

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
