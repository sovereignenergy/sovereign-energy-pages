/* Identity for this install. Copy the engine, then replace this file for another brand. */
(function () {
  "use strict";
  window.CLOSER_BRAND = {
    company: "Sovereign Energy",
    botName: "Helios",
    advisorName: "Binh Phan",
    advisorShort: "Binh",
    license: "CSLB #139345",
    address: "7310 Miramar Rd, San Diego, CA 92126",
    region: "California",
    defaultAvatar: "halo",
    colors: {
      bg: "#04060C",
      navy: "#0A1428",
      cyan: "#3FE0FF",
      cyanDark: "#11A9CF",
      amber: "#FFB347",
      text: "#E6F1FF",
      muted: "#9FB3CC"
    }
  };

  function rgba(hex, a) {
    var h = String(hex || "").replace("#", "");
    if (h.length !== 6) return "transparent";
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  var c = window.CLOSER_BRAND.colors;
  var root = document.documentElement;
  root.style.setProperty("--bg", c.bg);
  root.style.setProperty("--navy", c.navy);
  root.style.setProperty("--ink", c.text);
  root.style.setProperty("--muted", c.muted);
  root.style.setProperty("--cyan", c.cyan);
  root.style.setProperty("--cyan-dark", c.cyanDark);
  root.style.setProperty("--amber", c.amber);
  root.style.setProperty("--line", rgba(c.cyan, 0.22));
  root.style.setProperty("--panel", rgba(c.navy, 0.86));

  document.querySelectorAll("[data-brand-license]").forEach(function (el) {
    el.textContent = window.CLOSER_BRAND.license;
  });
})();
