// Aroxwell — small page effects shared by every page.
(function () {
  var root = document.documentElement;
  root.classList.remove("no-js");

  // Footer year
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Header becomes a glass bar after scrolling a little
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 24); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll reveal
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = (el.dataset.delay || 0) + "ms";
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // Gold dust at different depths around the sculpture
  var dust = document.querySelector(".dust");
  if (dust && !reduceMotion) {
    for (var i = 0; i < 22; i++) {
      var d = document.createElement("span");
      var r = function (a, b) { return a + Math.random() * (b - a); };
      d.style.setProperty("--x", r(0, 100).toFixed(1) + "%");
      d.style.setProperty("--y", r(5, 85).toFixed(1) + "%");
      d.style.setProperty("--z", r(-180, 220).toFixed(0) + "px");
      d.style.setProperty("--s", r(2, 5).toFixed(1) + "px");
      d.style.setProperty("--d", r(7, 14).toFixed(1) + "s");
      d.style.setProperty("--delay", (-r(0, 14)).toFixed(1) + "s");
      dust.appendChild(d);
    }
  }

  // Pause the hero's animations (dust, comets, glow) while it's scrolled out of view: saves battery/heat
  var heroEl = document.querySelector(".hero");
  if (heroEl && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroEl.classList.toggle("offscreen", !entries[0].isIntersecting);
    }).observe(heroEl);
  }

  // No mouse control: the hero brain moves on its own (CSS "turn" loop / brain3d.js).
})();
