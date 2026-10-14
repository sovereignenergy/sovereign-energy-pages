/* Lead form handler: validation, honeypot, UTM capture, JSON POST to LP_CONFIG.ENDPOINT */
(function () {
  "use strict";
  var C = window.LP_CONFIG || {};
  var PHONE = /^(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var ZIP = /^\d{5}(-\d{4})?$/;

  function utm() {
    var p = new URLSearchParams(location.search), o = {};
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(function (k) { if (p.get(k)) o[k] = p.get(k); });
    return o;
  }
  function fmtPhone(v) {
    var d = v.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length > 6) return "(" + d.slice(0,3) + ") " + d.slice(3,6) + "-" + d.slice(6);
    if (d.length > 3) return "(" + d.slice(0,3) + ") " + d.slice(3);
    return d;
  }
  function setErr(field, msg) {
    var wrap = field.closest(".field") || field.closest(".consent") || field.parentNode;
    var el = wrap.querySelector(".err");
    if (el) el.textContent = msg || "";
    field.setAttribute("aria-invalid", msg ? "true" : "false");
    wrap.classList.toggle("has-err", !!msg);
  }
  function check(field) {
    var v = (field.value || "").trim(), t = field.dataset.type || field.type, msg = "";
    if (field.type === "checkbox") { if (field.required && !field.checked) msg = field.dataset.msg || "Please check this box to continue."; }
    else if (field.type === "radio") { var g = field.form.querySelectorAll('input[name="' + field.name + '"]'); var any = [].some.call(g, function (r) { return r.checked; }); if (field.required && !any) msg = "Please choose one."; }
    else if (field.required && !v) msg = (field.dataset.msg || "This field is required.");
    else if (v && t === "email" && !EMAIL.test(v)) msg = "Enter a valid email, like name@example.com.";
    else if (v && t === "tel" && !PHONE.test(v)) msg = "Enter a valid 10-digit US mobile number.";
    else if (v && t === "zip" && !ZIP.test(v)) msg = "Enter a 5-digit ZIP code.";
    else if (v && t === "addr" && v.length < 5) msg = "Enter your street address or 5-digit ZIP.";
    else if (t === "file" && field.files && field.files[0] && field.files[0].size > (C.MAX_UPLOAD_MB || 8) * 1048576) msg = "File is too large (max " + (C.MAX_UPLOAD_MB || 8) + " MB).";
    setErr(field, msg);
    return !msg;
  }
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res({ name: f.name, type: f.type, size: f.size, base64: String(r.result).split(",")[1] }); };
      r.onerror = rej; r.readAsDataURL(f);
    });
  }

  document.querySelectorAll("form[data-lead]").forEach(function (form) {
    var started = Date.now();
    form.setAttribute("novalidate", "");
    form.querySelectorAll('input[type="tel"]').forEach(function (i) { i.addEventListener("input", function () { i.value = fmtPhone(i.value); }); });
    form.querySelectorAll("input,select,textarea").forEach(function (i) {
      i.addEventListener("blur", function () { if (i.type !== "radio" && (i.value || i.getAttribute("aria-invalid") === "true")) check(i); });
      i.addEventListener("change", function () { if (i.getAttribute("aria-invalid") === "true" || i.type === "checkbox" || i.type === "file") check(i); });
    });
    var fileIn = form.querySelector('input[type="file"]');
    if (fileIn) fileIn.addEventListener("change", function () {
      var lbl = form.querySelector("[data-file-name]");
      if (lbl) lbl.textContent = fileIn.files[0] ? fileIn.files[0].name : lbl.dataset.empty;
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fields = form.querySelectorAll("input:not([type=hidden]):not([name=company_website]),select,textarea");
      var ok = true, first = null;
      fields.forEach(function (f) { if (!check(f)) { ok = false; first = first || f; } });
      var status = form.querySelector("[data-status]");
      if (!ok) { if (status) status.textContent = "Please fix the highlighted fields."; first.focus(); return; }
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true; btn.classList.add("loading");
      if (status) status.textContent = "Sending…";

      var thanks = function () {
        var box = form.parentNode.querySelector("[data-thanks]");
        form.hidden = true;
        if (box) { box.hidden = false; box.setAttribute("tabindex", "-1"); box.focus(); }
        window.dispatchEvent(new CustomEvent("lead:submitted", { detail: { page: C.PAGE } }));
      };
      // Honeypot or impossibly fast submit: pretend success, send nothing.
      var hp = form.querySelector('[name="company_website"]');
      if ((hp && hp.value) || Date.now() - started < 1500) { thanks(); return; }

      var data = {};
      new FormData(form).forEach(function (v, k) { if (!(v instanceof File) && k !== "company_website") data[k] = data[k] ? data[k] + ", " + v : v; });
      var consentEl = form.querySelector('[name="consent_tcpa"]');
      var mktEl = form.querySelector('[name="consent_marketing_email"]');
      var payload = Object.assign({}, data, {
        brand: C.BRAND, page_slug: form.dataset.page || document.body.dataset.page, page_type: form.dataset.kind,
        page_url: location.href.split("?")[0], referrer: document.referrer || "",
        consent_tcpa: !!(consentEl && consentEl.checked),
        consent_text: consentEl ? consentEl.closest(".consent").querySelector(".consent-text").textContent.replace(/\s+/g, " ").trim() : "",
        consent_timestamp: new Date().toISOString(),
        consent_marketing_email: !!(mktEl && mktEl.checked),
        user_agent: navigator.userAgent, utm: utm(), submitted_at: new Date().toISOString()
      });
      try {
        if (fileIn && fileIn.files[0]) payload.bill_file = await readFile(fileIn.files[0]);
        if (!C.ENDPOINT) {
          console.warn("[lead form] LP_CONFIG.ENDPOINT is empty: demo mode, submission kept in localStorage only.", payload);
          try { var q = JSON.parse(localStorage.getItem("lp_demo_leads") || "[]"); delete payload.bill_file; q.push(payload); localStorage.setItem("lp_demo_leads", JSON.stringify(q)); } catch (x) {}
          thanks(); return;
        }
        var res = await fetch(C.ENDPOINT, {
          method: "POST", mode: C.NO_CORS === false ? "cors" : "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });
        if (res.type !== "opaque" && !res.ok) throw new Error("HTTP " + res.status);
        thanks();
      } catch (err) {
        console.error(err);
        btn.disabled = false; btn.classList.remove("loading");
        if (status) status.textContent = "Something went wrong sending your request. Please try again in a moment.";
      }
    });
  });

  // Respect reduced motion for scroll reveals
  var io = "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".reveal").forEach(function (el) {
    if (!io) { el.classList.add("in"); return; }
    new IntersectionObserver(function (es, o) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); o.unobserve(x.target); } }); }, { threshold: .12 }).observe(el);
  });
})();
