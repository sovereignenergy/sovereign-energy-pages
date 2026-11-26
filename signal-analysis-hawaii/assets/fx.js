/* Sovereign starfield: lightweight canvas, pauses offscreen, off for reduced motion */
(function () {
  var cv = document.querySelector("canvas.stars"); if (!cv) return;
  var ctx = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), W, H, S = [];
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function size() {
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    var n = Math.min(220, Math.floor(W * H / 6000)); S = [];
    for (var i = 0; i < n; i++) S.push({ x: Math.random()*W, y: Math.random()*H, z: Math.random()*.8+.2, t: Math.random()*6.28 });
    draw(0);
  }
  function draw(dt) {
    ctx.clearRect(0,0,W,H);
    for (var i = 0; i < S.length; i++) {
      var s = S[i]; s.t += dt * .002; s.y -= dt * .006 * s.z; if (s.y < -2) { s.y = H + 2; s.x = Math.random()*W; }
      var a = .35 + .45 * Math.abs(Math.sin(s.t)) * s.z;
      ctx.fillStyle = i % 9 === 0 ? "rgba(255,190,110," + a + ")" : "rgba(160,235,255," + a + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.z * 1.3, 0, 6.28); ctx.fill();
    }
  }
  var last = 0, vis = true;
  function loop(t) { if (vis) draw(Math.min(50, t - last)); last = t; requestAnimationFrame(loop); }
  addEventListener("resize", size); size();
  if (!still) { new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }).observe(cv); requestAnimationFrame(loop); }
})();
