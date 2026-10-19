/* Editable usage estimate. Default 500 kWh/month. No utility rate is prefilled. */
(function () {
  "use strict";
  var kwhInput = document.getElementById("kwh-input");
  var rateInput = document.getElementById("rate-input");
  if (!kwhInput || !rateInput) return;
  var kwhRead = document.getElementById("kwh-readout");
  var dollarRead = document.getElementById("dollar-readout");
  var note = document.getElementById("est-note");
  var echo = document.getElementById("form-kwh-echo");
  var hiddenKwh = document.getElementById("monthly_kwh");
  var hiddenRate = document.getElementById("rate_cents_estimate");
  var line = document.getElementById("usage-line");
  var fill = document.getElementById("usage-fill");
  var dot = document.getElementById("usage-dot");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var firstDraw = true;

  function clampKwh(n) {
    if (!isFinite(n)) return null;
    return Math.min(9999, Math.max(1, Math.round(n)));
  }
  function money(n) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function trace(kwh) {
    var t = Math.max(0.08, Math.min(1, kwh / 1500));
    var y = 158 - t * 130;
    var mid = 158 - t * 70;
    var d = "M10 158 C120 152 220 " + mid.toFixed(1) + " 300 " + (y + 18).toFixed(1) + " S370 " + (y + 6).toFixed(1) + " 390 " + y.toFixed(1);
    return { d: d, y: y };
  }
  function draw(kwh) {
    if (!line) return;
    var tr = trace(kwh);
    line.setAttribute("d", tr.d);
    if (fill) fill.setAttribute("d", tr.d + " V180 H10 Z");
    if (dot) dot.setAttribute("cy", tr.y.toFixed(1));
    if (firstDraw) { firstDraw = false; return; }
    if (reduce) return;
    line.style.animation = "none";
    void line.offsetWidth;
    line.style.animation = "";
  }
  function render() {
    var kwh = clampKwh(parseFloat(kwhInput.value));
    var shown = kwh == null ? 500 : kwh;
    if (kwhRead) kwhRead.textContent = kwh == null ? "—" : String(kwh);
    if (hiddenKwh) hiddenKwh.value = String(shown);
    var rateRaw = rateInput.value.trim();
    var rate = parseFloat(rateRaw);
    var rateOk = rateRaw !== "" && isFinite(rate) && rate >= 0 && rate <= 500;
    if (hiddenRate) hiddenRate.value = rateOk ? String(rate) : "";
    if (kwh != null && rateOk) {
      if (dollarRead) dollarRead.textContent = money(kwh * rate / 100);
      if (note) note.textContent = "Energy-charge estimate only, from the numbers you entered. It leaves out fixed charges and taxes. Not a quote.";
    } else {
      if (dollarRead) dollarRead.textContent = "—";
      if (note) note.textContent = "Enter the ¢/kWh printed on your bill to see an energy-charge estimate. Not a quote.";
    }
    if (echo) echo.innerHTML = "This request includes " + shown + " kWh / month · estimate. <a href=\"#estimate\">Edit the estimate</a>";
    draw(shown);
  }
  kwhInput.addEventListener("input", render);
  rateInput.addEventListener("input", render);
  kwhInput.addEventListener("blur", function () {
    var n = clampKwh(parseFloat(kwhInput.value));
    kwhInput.value = n == null ? "500" : String(n);
    render();
  });
  render();
})();
