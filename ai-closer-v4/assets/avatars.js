/* Avatar skins for the closer. Halo, Aether, and Commander share one brain.
   Brand copy stays in brand.js. This file only draws. */
(function () {
  "use strict";
  var IDS = ["halo", "aether", "commander"];
  var META = {
    halo: { name: "Halo", blurb: "Scanline hologram · AI projection" },
    aether: { name: "Aether", blurb: "Plasma orb · AI projection" },
    commander: { name: "Commander", blurb: "Holographic advisor · AI projection" }
  };
  var current = "halo";

  function colors() {
    var c = (window.CLOSER_BRAND && window.CLOSER_BRAND.colors) || {};
    return {
      bg: c.bg || "#04060C",
      navy: c.navy || "#0A1428",
      cyan: c.cyan || "#3FE0FF",
      cyanDark: c.cyanDark || "#11A9CF",
      amber: c.amber || "#FFB347",
      text: c.text || "#E6F1FF",
      muted: c.muted || "#9FB3CC"
    };
  }
  function rgba(hex, a) {
    var h = String(hex || "#000000").replace("#", "");
    var n = parseInt(h, 16);
    if (!isFinite(n)) n = 0;
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function runtime() {
    var H = window.HELIOS || { state: "idle", level: 0, pulses: [] };
    return {
      state: H.state || "idle",
      level: Math.max(0, Math.min(1, H.level || 0)),
      pulses: H.pulses || []
    };
  }
  function valid(id) {
    return IDS.indexOf(String(id || "").toLowerCase()) >= 0;
  }
  function resolve() {
    var fromUrl = "";
    try { fromUrl = new URLSearchParams(location.search).get("avatar") || ""; } catch (e) {}
    if (valid(fromUrl)) return fromUrl.toLowerCase();
    var cfg = window.HELIOS_CONFIG && window.HELIOS_CONFIG.avatar;
    if (valid(cfg)) return String(cfg).toLowerCase();
    var brandDefault = window.CLOSER_BRAND && window.CLOSER_BRAND.defaultAvatar;
    if (valid(brandDefault)) return String(brandDefault).toLowerCase();
    return "halo";
  }
  function writeUrl(id) {
    try {
      var url = new URL(location.href);
      url.searchParams.set("avatar", id);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) {}
  }
  function paintChrome(id) {
    var meta = META[id];
    var bot = (window.CLOSER_BRAND && window.CLOSER_BRAND.botName) || "Helios";
    document.body.dataset.avatar = id;
    document.querySelectorAll("[data-avatar-pick]").forEach(function (btn) {
      var on = btn.getAttribute("data-avatar-pick") === id;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-avatar-name]").forEach(function (el) {
      el.textContent = meta.name.toUpperCase();
    });
    document.querySelectorAll("[data-avatar-blurb]").forEach(function (el) {
      el.textContent = meta.blurb;
    });
    document.querySelectorAll("[data-avatar-ai]").forEach(function (el) {
      el.textContent = meta.name + " is an AI projection, not a person.";
    });
    document.querySelectorAll("canvas[data-avatar]").forEach(function (cv) {
      cv.setAttribute("aria-label", meta.name + ", holographic AI avatar. An AI projection, not a person.");
    });
    document.querySelectorAll("[data-console-title]").forEach(function (el) {
      el.textContent = bot.toUpperCase() + " · " + meta.name.toUpperCase() + " · AI";
    });
  }
  function use(id, opts) {
    id = valid(id) ? String(id).toLowerCase() : "halo";
    current = id;
    paintChrome(id);
    if (!opts || !opts.silent) writeUrl(id);
    return id;
  }

  function drawPulses(ctx, cx, cy, w, C) {
    var H = window.HELIOS;
    if (!H || !H.pulses) return;
    var now = performance.now();
    H.pulses.forEach(function (stamp) {
      var age = (now - stamp) / 900;
      if (age < 0 || age > 1) return;
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + age * w * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    H.pulses = H.pulses.filter(function (stamp) { return now - stamp < 900; });
  }

  function haloWidth(y, h) {
    var headY = h * 0.34;
    var headR = h * 0.13;
    if (y < headY - headR) return 0;
    if (y < headY + headR * 0.95) {
      var dy = (y - headY) / headR;
      if (Math.abs(dy) > 1) return 0;
      return Math.sqrt(Math.max(0, 1 - dy * dy)) * headR * 0.86;
    }
    if (y < h * 0.52) return headR * 0.34;
    var u = (y - h * 0.52) / (h * 0.28);
    if (u > 1) return 0;
    return headR * (0.42 + 1.7 * Math.sqrt(u));
  }

  function drawHalo(ctx, w, h, t, state, level) {
    var C = colors();
    var cx = w / 2;
    var k = t * 0.001;
    var color = state === "thinking" ? C.amber : state === "listening" ? C.text : C.cyan;
    var glow = ctx.createRadialGradient(cx, h * 0.42, 0, cx, h * 0.42, w * 0.48);
    glow.addColorStop(0, rgba(state === "thinking" ? C.amber : C.cyan, state === "listening" ? 0.2 : 0.26 + level * 0.2));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, h * 0.46);
    ctx.rotate(k * 0.25);
    ctx.strokeStyle = rgba(C.amber, 0.75);
    ctx.lineWidth = 2;
    for (var i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.34, i * 0.62, i * 0.62 + 0.28 + level * 0.08);
      ctx.stroke();
    }
    ctx.restore();

    var baseY = h * 0.86;
    var plate = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, w * 0.32);
    plate.addColorStop(0, rgba(C.cyan, 0.55));
    plate.addColorStop(1, "transparent");
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.28, h * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();

    var cone = ctx.createLinearGradient(0, baseY, 0, h * 0.12);
    cone.addColorStop(0, rgba(C.cyan, 0.22));
    cone.addColorStop(1, "transparent");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, baseY);
    ctx.lineTo(cx - w * 0.1, h * 0.12);
    ctx.lineTo(cx + w * 0.1, h * 0.12);
    ctx.lineTo(cx + w * 0.26, baseY);
    ctx.fill();

    for (var y = h * 0.16; y < h * 0.8; y += 3) {
      var hw = haloWidth(y, h);
      if (!hw) continue;
      var alpha = 0.22 + 0.22 * Math.abs(Math.sin(y * 0.09 - k * 3)) + level * 0.45;
      if (state === "listening") alpha += 0.08;
      ctx.globalAlpha = Math.min(0.95, alpha);
      ctx.fillStyle = color;
      var j = Math.sin(y * 0.12 + k * 2) * (state === "speaking" ? 1.6 : 0.6);
      if (state === "speaking" && level > 0.45 && ((y / 3) | 0) % 17 === ((t / 40) | 0) % 17) j += 8;
      ctx.fillRect(cx - hw + j, y, hw * 2, 1.35);
    }
    ctx.globalAlpha = 1;

    var eyeY = h * 0.33;
    [-1, 1].forEach(function (d) {
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.ellipse(cx + d * h * 0.045, eyeY, 5.2, 1.8 + level * 2.4 + (state === "thinking" ? 0.4 : 1.4), 0, 0, Math.PI * 2);
      ctx.fill();
    });

    var mouthY = h * 0.4;
    var bars = state === "listening" ? 5 : 9;
    for (var b = 0; b < bars; b++) {
      var idx = b - (bars - 1) / 2;
      var bh = 2 + level * (10 + 16 * Math.abs(Math.sin(k * 14 + b * 1.3)));
      if (state === "idle") bh = 2 + Math.sin(k * 2 + b) * 1.2;
      if (state === "thinking") bh = 3 + Math.abs(Math.sin(k * 6 + b)) * 4;
      ctx.fillStyle = C.amber;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(cx + idx * 5 - 1.2, mouthY - bh / 2, 2.4, bh);
    }
    ctx.globalAlpha = 1;

    var rings = state === "speaking" ? 4 : state === "listening" ? 3 : 1;
    for (var r = 0; r < rings; r++) {
      var ph = (k * (state === "listening" ? -0.55 : 0.7) + r / rings) % 1;
      if (ph < 0) ph += 1;
      ctx.globalAlpha = (1 - ph) * (0.15 + level * 0.75);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var radius = state === "listening" ? h * 0.22 - ph * h * 0.12 : h * 0.04 + ph * h * (0.12 + level * 0.2);
      ctx.arc(cx, mouthY, Math.max(4, radius), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (state === "thinking") {
      for (var n = 0; n < 14; n++) {
        var a = k * 1.4 + n * 0.45;
        var rr = w * (0.16 + (n % 4) * 0.03);
        ctx.fillStyle = n % 2 ? C.amber : C.cyan;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, h * 0.4 + Math.sin(a) * rr * 0.55, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawPulses(ctx, cx, h * 0.4, w, C);
    var core = ctx.createRadialGradient(cx, h * 0.58, 0, cx, h * 0.58, w * 0.08 * (1 + level));
    core.addColorStop(0, rgba(C.text, 0.9));
    core.addColorStop(0.4, rgba(C.amber, 0.45));
    core.addColorStop(1, "transparent");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, h * 0.58, w * 0.1 * (1 + level * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAether(ctx, w, h, t, state, level) {
    var C = colors();
    var cx = w / 2;
    var cy = h * 0.48;
    var k = t * 0.001;
    var breathe = 1 + Math.sin(k * 1.5) * (state === "idle" ? 0.045 : 0.02);
    var speak = state === "speaking" ? 0.18 + level * 0.55 : level * 0.12;
    var base = Math.min(w, h) * 0.2 * breathe * (1 + speak);
    if (state === "thinking") base *= 0.94;

    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.8);
    glow.addColorStop(0, rgba(state === "thinking" ? C.amber : C.cyan, 0.28 + speak));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    if (state === "listening") {
      for (var ring = 0; ring < 3; ring++) {
        var inward = (k * 0.45 + ring / 3) % 1;
        ctx.globalAlpha = (1 - inward) * 0.55;
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, base * (2.15 - inward * 1.15), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var L = 0; L < 3; L++) {
      ctx.beginPath();
      var wobble = state === "speaking" ? 0.05 + level * 0.1 : state === "thinking" ? 0.05 : 0.035;
      for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
        var n = Math.sin(a * 3 + k * 1.6 + L) * 0.06 + Math.sin(a * 5 - k * 2.2) * wobble;
        var r = base * (1 - L * 0.12) * (1 + n);
        var px = cx + Math.cos(a) * r;
        var py = cy + Math.sin(a) * r;
        if (a) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      var shell = ctx.createRadialGradient(cx, cy - base * 0.3, base * 0.1, cx, cy, base * 1.25);
      shell.addColorStop(0, C.text);
      shell.addColorStop(0.35, C.cyan);
      shell.addColorStop(1, rgba(C.cyanDark, 0));
      ctx.fillStyle = shell;
      ctx.globalAlpha = 0.58 - L * 0.12 + speak * 0.15;
      ctx.fill();
    }

    var count = 72;
    var spin = state === "thinking" ? 2.4 : state === "speaking" ? 1.15 : 0.72;
    for (var i = 0; i < count; i++) {
      var an = i * 2.39 + k * spin * (1 + (i % 5) * 0.04);
      var orbit = base * (1.35 + 0.5 * Math.sin(i + k * 0.7));
      if (state === "listening") orbit = base * (1.15 + ((i * 17 + Math.floor(k * 40)) % 50) / 80);
      if (state === "speaking") orbit += level * 18 * Math.sin(k * 8 + i);
      var amberBit = state === "thinking" ? i % 2 === 0 : i % 3 === 0;
      ctx.fillStyle = amberBit ? C.amber : C.cyan;
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin(k * 3 + i) * 0.5 + 0.25;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(an) * orbit, cy + Math.sin(an) * orbit * 0.82, 1.3 + (i % 4) * 0.45 + speak * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    var coreR = base * (0.34 + speak * 0.7);
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, rgba(C.text, 0.95));
    core.addColorStop(0.45, rgba(state === "thinking" ? C.amber : C.cyan, 0.55));
    core.addColorStop(1, "transparent");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    drawPulses(ctx, cx, cy, w, C);
  }

  function commanderHalf(y, h, part) {
    if (part === "hair") {
      var top = h * 0.1;
      var bot = h * 0.42;
      if (y < top || y > bot) return 0;
      var u = (y - top) / (bot - top);
      return h * 0.175 * Math.sin(Math.pow(u, 0.62) * Math.PI) * (u > 0.62 ? 1.08 : 1);
    }
    if (part === "head") {
      var ht = h * 0.17;
      var chin = h * 0.52;
      if (y < ht || y > chin) return 0;
      var v = (y - ht) / (chin - ht);
      var cheek = Math.sin(Math.pow(v, 0.8) * Math.PI);
      var taper = v > 0.74 ? 1 - (v - 0.74) * 1.85 : 1;
      return h * 0.132 * cheek * Math.max(0.28, taper);
    }
    var neckTop = h * 0.5;
    var neckBot = h * 0.58;
    var hem = h * 0.84;
    if (y < neckTop || y > hem) return 0;
    if (y < neckBot) return h * 0.042;
    var s = (y - neckBot) / (hem - neckBot);
    return h * (0.055 + 0.4 * Math.pow(s, 0.62));
  }

  function eyeOpen(t) {
    if (!t) return 1;
    var cycle = 3300 + 500 * (0.5 + 0.5 * Math.sin(t * 0.00013));
    var phase = t % cycle;
    var at = cycle * 0.7;
    var dist = Math.abs(phase - at);
    if (dist >= 90) return 1;
    return Math.pow(dist / 90, 1.4);
  }

  function drawCommander(ctx, w, h, t, state, level) {
    var C = colors();
    var cx = w / 2;
    var k = t * 0.001;
    var breathe = Math.sin(k * 1.5) * (state === "idle" ? 2.4 : 1.1);
    var open = eyeOpen(t);
    if (state === "listening") open = Math.min(1, open + 0.04);

    var glow = ctx.createRadialGradient(cx, h * 0.4, 0, cx, h * 0.4, w * 0.46);
    glow.addColorStop(0, rgba(state === "thinking" ? C.amber : C.cyan, 0.16 + (state === "speaking" ? 0.12 + level * 0.22 : 0)));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, h * 0.4);
    ctx.rotate(k * (state === "thinking" ? 0.45 : 0.12));
    ctx.strokeStyle = rgba(state === "thinking" ? C.amber : C.cyan, 0.35);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.34, 0.2, 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.34, 2.4, 3.5);
    ctx.stroke();
    ctx.restore();

    var baseY = h * 0.88;
    var plate = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, w * 0.3);
    plate.addColorStop(0, rgba(C.cyan, 0.4));
    plate.addColorStop(1, "transparent");
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.26, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    function scan(part, tint, alphaBase) {
      var y0 = part === "hair" ? h * 0.1 : part === "head" ? h * 0.17 : h * 0.5;
      var y1 = part === "hair" ? h * 0.42 : part === "head" ? h * 0.52 : h * 0.84;
      for (var y = y0; y < y1; y += 3) {
        var hw = commanderHalf(y, h, part);
        if (part === "hair") {
          var face = commanderHalf(y, h, "head");
          if (hw <= face + 1) continue;
        }
        if (!hw) continue;
        var flicker = 0.55 + 0.45 * Math.abs(Math.sin(y * 0.08 - k * 2.4));
        ctx.globalAlpha = Math.min(0.92, alphaBase * flicker + (state === "speaking" ? level * 0.25 : 0));
        ctx.fillStyle = tint;
        var j = Math.sin(y * 0.11 + k * 1.6) * (state === "speaking" ? 1.1 : 0.45);
        if (part === "hair") {
          ctx.fillRect(cx - hw + j, y + breathe * 0.15, hw - Math.max(commanderHalf(y, h, "head"), 0), 1.4);
          ctx.fillRect(cx + Math.max(commanderHalf(y, h, "head"), 0) + j, y + breathe * 0.15, hw - Math.max(commanderHalf(y, h, "head"), 0), 1.4);
        } else {
          ctx.fillRect(cx - hw + j, y + breathe * 0.15, hw * 2, 1.35);
        }
      }
    }
    scan("body", C.cyan, 0.42);
    scan("head", C.cyan, 0.5);
    scan("hair", C.cyanDark, 0.72);
    ctx.globalAlpha = 1;

    var collarY = h * 0.6;
    ctx.strokeStyle = rgba(C.amber, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.07, collarY);
    ctx.lineTo(cx, collarY + h * 0.045);
    ctx.lineTo(cx + h * 0.07, collarY);
    ctx.stroke();
    ctx.strokeStyle = rgba(C.cyan, 0.7);
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.2, h * 0.7);
    ctx.lineTo(cx - h * 0.05, h * 0.6);
    ctx.moveTo(cx + h * 0.2, h * 0.7);
    ctx.lineTo(cx + h * 0.05, h * 0.6);
    ctx.stroke();

    var eyeY = h * 0.338 + breathe * 0.08;
    var eyeDX = h * 0.058;
    var eyeW = h * 0.036;
    var eyeH = h * 0.016 * (0.12 + 0.88 * open) * (state === "listening" ? 1.12 : 1);
    var lookX = Math.sin(k * 0.33) * h * 0.0015;
    var lookY = Math.cos(k * 0.27) * h * 0.001;
    if (state === "thinking") lookX = Math.sin(k * 0.7) * h * 0.004;
    [-1, 1].forEach(function (d) {
      var ex = cx + d * eyeDX;
      ctx.strokeStyle = rgba(C.cyan, 0.95);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeW, Math.max(1.2, eyeH), 0, 0, Math.PI * 2);
      ctx.stroke();
      if (open > 0.18) {
        ctx.fillStyle = rgba(C.amber, 0.92);
        ctx.beginPath();
        ctx.arc(ex + lookX, eyeY + lookY, Math.max(1.4, eyeH * 0.62), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.bg;
        ctx.beginPath();
        ctx.arc(ex + lookX, eyeY + lookY, Math.max(0.8, eyeH * 0.26), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.fillRect(ex + lookX - eyeH * 0.18, eyeY + lookY - eyeH * 0.28, Math.max(1.4, eyeH * 0.22), Math.max(1.4, eyeH * 0.22));
      }
      ctx.strokeStyle = rgba(C.cyan, 0.88);
      ctx.lineWidth = 2;
      ctx.beginPath();
      var browY = eyeY - Math.max(eyeH, h * 0.012) - h * 0.016;
      ctx.moveTo(ex - eyeW, browY + h * 0.006);
      ctx.quadraticCurveTo(ex, browY - h * 0.01, ex + eyeW * 1.05, browY + h * 0.002);
      ctx.stroke();
    });

    ctx.strokeStyle = rgba(C.cyan, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.36);
    ctx.lineTo(cx - h * 0.008, h * 0.4);
    ctx.moveTo(cx, h * 0.36);
    ctx.lineTo(cx + h * 0.01, h * 0.4);
    ctx.stroke();

    [-1, 1].forEach(function (d) {
      var blush = ctx.createRadialGradient(cx + d * h * 0.09, h * 0.4, 0, cx + d * h * 0.09, h * 0.4, h * 0.03);
      blush.addColorStop(0, rgba(C.amber, 0.28));
      blush.addColorStop(1, "transparent");
      ctx.fillStyle = blush;
      ctx.beginPath();
      ctx.ellipse(cx + d * h * 0.09, h * 0.4, h * 0.028, h * 0.016, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    var mouthY = h * 0.448 + breathe * 0.05;
    var mouthW = h * 0.05;
    var gap = h * 0.004;
    if (state === "speaking") gap = h * (0.01 + level * 0.05 * (0.55 + 0.45 * Math.abs(Math.sin(k * 16))));
    else if (state === "listening") gap = h * 0.01;
    ctx.fillStyle = rgba(C.amber, 0.95);
    ctx.beginPath();
    ctx.moveTo(cx - mouthW, mouthY);
    ctx.quadraticCurveTo(cx, mouthY - h * 0.012, cx + mouthW, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + h * 0.004, cx - mouthW, mouthY);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - mouthW * 0.92, mouthY + gap);
    ctx.quadraticCurveTo(cx, mouthY + gap + h * 0.022, cx + mouthW * 0.92, mouthY + gap);
    ctx.quadraticCurveTo(cx, mouthY + gap * 0.35, cx - mouthW * 0.92, mouthY + gap);
    ctx.fill();
    if (gap > h * 0.008) {
      ctx.fillStyle = rgba(C.bg, 0.85);
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + gap * 0.55, mouthW * 0.48, Math.max(1, gap * 0.42), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = rgba(C.amber, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx + h * 0.125, h * 0.37, h * 0.012, 0.4, 2.4);
    ctx.stroke();
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(cx + h * 0.125, h * 0.355, 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(C.cyan, 0.45);
    ctx.strokeRect(cx - h * 0.15, h * 0.2, h * 0.018, h * 0.018);

    var rings = state === "speaking" ? 4 : state === "listening" ? 3 : 0;
    for (var r = 0; r < rings; r++) {
      var ph = (k * (state === "listening" ? -0.5 : 0.8) + r / rings) % 1;
      if (ph < 0) ph += 1;
      ctx.globalAlpha = (1 - ph) * (0.2 + level * 0.7);
      ctx.strokeStyle = state === "listening" ? C.cyan : C.amber;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      var radius = state === "listening" ? h * 0.2 - ph * h * 0.1 : h * 0.03 + ph * h * (0.08 + level * 0.16);
      ctx.arc(cx, mouthY, Math.max(6, radius), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (state === "thinking") {
      for (var n = 0; n < 10; n++) {
        var ang = k * 1.6 + n * 0.62;
        var rad = h * 0.2;
        ctx.fillStyle = n % 2 ? C.amber : C.cyan;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * rad, h * 0.36 + Math.sin(ang) * rad * 0.72, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawPulses(ctx, cx, mouthY, w, C);
  }

  var DRAW = { halo: drawHalo, aether: drawAether, commander: drawCommander };

  window.CloserAvatars = {
    ids: IDS.slice(),
    current: function () { return current; },
    label: function () { return META[current].name; },
    use: use,
    draw: function (ctx, w, h, timeMs) {
      if (!ctx || !w || !h) return;
      var run = runtime();
      ctx.clearRect(0, 0, w, h);
      (DRAW[current] || drawHalo)(ctx, w, h, timeMs || 0, run.state, run.level);
    },
    bindSwitcher: function () {
      document.querySelectorAll("[data-avatar-pick]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          use(btn.getAttribute("data-avatar-pick"));
        });
      });
      var raw = "";
      try { raw = (new URLSearchParams(location.search).get("avatar") || "").toLowerCase(); } catch (e) {}
      var id = resolve();
      use(id, { silent: !raw || raw === id });
    }
  };
})();
