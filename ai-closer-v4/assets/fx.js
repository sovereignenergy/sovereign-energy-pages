/* Cinematic background, hologram avatar, and boot sequence. */
(function () {
  "use strict";
  var RM = document.documentElement.classList.contains("rm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;
  var H = window.HELIOS = window.HELIOS || { state: "idle", level: 0, pulses: [] };
  var avatars = [];
  var bg = null;
  var scrollY = 0;
  var mx = 0;
  var my = 0;
  var running = false;
  var stars = null;
  var spot = null;

  function dprCap() {
    return Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.7);
  }
  function fit(cv) {
    var d = dprCap();
    var r = cv.getBoundingClientRect();
    var w = Math.max(2, r.width);
    var h = Math.max(2, r.height);
    cv.width = Math.round(w * d);
    cv.height = Math.round(h * d);
    var x = cv.getContext("2d", { alpha: true });
    x.setTransform(d, 0, 0, d, 0, 0);
    return { cv: cv, ctx: x, w: w, h: h, on: true };
  }
  function makeStars() {
    var mobile = window.innerWidth < 760;
    function layer(n, speed, depth, size) {
      var a = [];
      for (var i = 0; i < n; i++) {
        a.push({
          x: Math.random(),
          y: Math.random(),
          v: speed * (0.4 + Math.random()),
          s: size * (0.35 + Math.random()),
          tw: Math.random() * 6.28,
          c: i % 11 === 0 ? "#FFB347" : i % 7 === 0 ? "#3FE0FF" : "#E6F1FF"
        });
      }
      return { pts: a, depth: depth };
    }
    return [
      layer(mobile ? 70 : 150, 0.004, 0.15, 1.1),
      layer(mobile ? 40 : 80, 0.01, 0.4, 1.5),
      layer(mobile ? 18 : 36, 0.02, 0.8, 2.1)
    ];
  }
  function drawBg(t) {
    if (!bg) return;
    var x = bg.ctx, w = bg.w, h = bg.h;
    x.clearRect(0, 0, w, h);
    var k = RM ? 0 : t * 0.001;
    var blobs = [
      { x: w * (0.72 + Math.sin(k * 0.15) * 0.04), y: h * (0.18 + scrollY * 0.00004), r: w * 0.42, c: "rgba(63,224,255,.32)", a: 0.5 },
      { x: w * (0.18 + Math.cos(k * 0.12) * 0.05), y: h * 0.78, r: w * 0.36, c: "rgba(17,169,207,.28)", a: 0.45 },
      { x: w * 0.55, y: h * (0.55 + Math.sin(k * 0.2) * 0.03), r: w * 0.22, c: "rgba(255,179,71,.24)", a: 0.4 }
    ];
    blobs.forEach(function (b) {
      var g = x.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, "transparent");
      x.globalAlpha = b.a;
      x.fillStyle = g;
      x.beginPath();
      x.arc(b.x, b.y, b.r, 0, 6.3);
      x.fill();
    });
    x.globalAlpha = 1;
    if (!stars) stars = makeStars();
    stars.forEach(function (layer) {
      layer.pts.forEach(function (p) {
        if (!RM) p.y += p.v * 0.0016;
        if (p.y > 1.05) p.y = -0.02;
        var px = (p.x + mx * 0.03 * layer.depth) * w;
        var py = ((p.y + scrollY * 0.00008 * layer.depth) % 1) * h;
        var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((RM ? p.tw : t * 0.002) + p.tw));
        x.fillStyle = p.c;
        x.globalAlpha = tw;
        x.beginPath();
        x.arc(px, py, p.s, 0, 6.3);
        x.fill();
      });
    });
    x.globalAlpha = 1;
    if (!RM && Math.floor(t / 9000) !== Math.floor((t - 16) / 9000)) bg.meteor = { x: Math.random() * w * 0.6, y: Math.random() * h * 0.3, life: 0 };
    if (bg.meteor) {
      var m = bg.meteor;
      m.life += 0.02;
      m.x += 8;
      m.y += 3.2;
      x.strokeStyle = "rgba(255,244,220," + Math.max(0, 1 - m.life) + ")";
      x.lineWidth = 1.4;
      x.beginPath();
      x.moveTo(m.x, m.y);
      x.lineTo(m.x - 36, m.y - 14);
      x.stroke();
      if (m.life > 1) bg.meteor = null;
    }
  }

  function drawAvatar(av, t) {
    if (window.CloserAvatars) CloserAvatars.draw(av.ctx, av.w, av.h, t || 0);
  }

  function frame(t) {
    drawBg(t || 0);
    avatars.forEach(function (av) { if (av.on) drawAvatar(av, t || 0); });
    if (!RM) requestAnimationFrame(frame);
  }

  function mount(cv) {
    if (!cv) return null;
    var av = fit(cv);
    avatars.push(av);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { av.on = e.isIntersecting; if (RM && av.on) drawAvatar(av, 0); });
      }, { threshold: 0.05 });
      io.observe(cv);
    }
    return av;
  }

  var labels = { idle: "Standing by", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

  window.HeliosFX = {
    start: function () {
      var cv = document.getElementById("starfield");
      if (cv) bg = fit(cv);
      document.querySelectorAll("canvas[data-avatar]").forEach(mount);
      spot = document.getElementById("spot");
      if (!running) {
        running = true;
        if (RM) frame(0);
        else requestAnimationFrame(frame);
      }
      addEventListener("resize", function () {
        stars = null;
        if (bg) bg = Object.assign(bg, fit(bg.cv));
        avatars.forEach(function (av, i) { avatars[i] = Object.assign(av, fit(av.cv)); });
        if (RM) frame(0);
      });
      addEventListener("scroll", function () { scrollY = window.scrollY || 0; }, { passive: true });
      if (fine && !RM) {
        addEventListener("pointermove", function (e) {
          mx = e.clientX / innerWidth - 0.5;
          my = e.clientY / innerHeight - 0.5;
          if (spot) {
            spot.style.transform = "translate(" + (e.clientX - spot.offsetWidth / 2) + "px," + (e.clientY - spot.offsetHeight / 2) + "px)";
          }
        }, { passive: true });
      }
      var readout = document.getElementById("hudReadout");
      function tickClock() {
        if (!readout) return;
        var now = new Date();
        var pt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
        var bot = (window.CLOSER_BRAND && CLOSER_BRAND.botName) || "Helios";
        var face = window.CloserAvatars ? CloserAvatars.label() : "Halo";
        readout.textContent = bot.toUpperCase() + " · " + face.toUpperCase() + " · AI · " + pt + " PT";
      }
      tickClock();
      if (!RM) setInterval(tickClock, 10000);
      document.querySelectorAll(".reveal").forEach(function (el) {
        if (RM || !("IntersectionObserver" in window)) { el.classList.add("in"); return; }
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
        }, { threshold: 0.18 });
        io.observe(el);
      });
    },
    setState: function (state) {
      H.state = state;
      document.body.dataset.av = state;
      document.querySelectorAll("[data-av-state]").forEach(function (el) { el.textContent = labels[state] || state; });
      if (RM) avatars.forEach(function (av) { if (av.on) drawAvatar(av, 0); });
    },
    boot: function (done) {
      var boot = document.getElementById("boot");
      if (!boot) { done && done(); return; }
      if (RM) {
        boot.hidden = true;
        document.body.classList.add("ready");
        document.body.classList.remove("booting");
        done && done();
        return;
      }
      var log = document.getElementById("bootLog");
      var bar = document.getElementById("bootBar");
      var brand = window.CLOSER_BRAND || {};
      var lines = [
        "Plasma core nominal",
        "Parallax starfield lock",
        "California utilities loaded · PG&E · SCE · SDG&E",
        "Advisor seal · " + (brand.advisorName || "Binh Phan"),
        "Avatar · " + (window.CloserAvatars ? CloserAvatars.label() : "Halo") + " · AI",
        "AI disclosure armed",
        "Voice bus muted until you allow it",
        (brand.botName || "Helios") + " channel open"
      ];
      var i = 0;
      var skipped = false;
      function finish() {
        if (skipped) return;
        skipped = true;
        document.body.classList.add("ready");
        document.body.classList.remove("booting");
        setTimeout(function () { boot.hidden = true; done && done(); }, 700);
      }
      var skip = document.getElementById("bootSkip");
      if (skip) skip.addEventListener("click", finish);
      (function step() {
        if (skipped) return;
        if (i < lines.length) {
          var li = document.createElement("li");
          li.textContent = lines[i];
          log.appendChild(li);
          i++;
          if (bar) bar.style.width = (i / lines.length * 100) + "%";
          setTimeout(step, 520);
        } else setTimeout(finish, 700);
      })();
    }
  };
})();
