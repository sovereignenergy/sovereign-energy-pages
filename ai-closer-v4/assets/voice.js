/* Pluggable speak() providers. Phase 1: Web Speech. Phase 2: ElevenLabs via a backend proxy. */
(function () {
  "use strict";
  var cfg = window.HELIOS_CONFIG || {};
  var qv = new URLSearchParams(location.search).get("voice");
  if (qv === "webspeech" || qv === "elevenlabs") cfg.voiceProvider = qv;

  var H = window.HELIOS = window.HELIOS || { state: "idle", level: 0, pulses: [] };
  var current = null;
  var boundaryBoost = 0;
  var audioCtx = null;
  var chosenName = "";
  var statusEl = null;
  var toggleBtn = null;
  var speaking = false;

  function providerName() {
    return cfg.voiceProvider === "elevenlabs" ? "elevenlabs" : "webspeech";
  }
  function ensureCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }
  function markSpeaking(on) {
    speaking = on;
    document.body.classList.toggle("is-speaking", on);
  }

  function scoreVoice(v) {
    var n = (v.name || "").toLowerCase();
    var lang = (v.lang || "").toLowerCase().replace("_", "-");
    var s = 0;
    if (lang === "en-us") s += 100;
    else if (lang.indexOf("en") === 0) s += 40;
    else s -= 80;
    if (n.indexOf("natural") >= 0) s += 80;
    if (n.indexOf("neural") >= 0) s += 70;
    if (n.indexOf("google") >= 0) s += 60;
    if (n.indexOf("premium") >= 0 || n.indexOf("enhanced") >= 0) s += 25;
    if (n.indexOf("espeak") >= 0 || n.indexOf("compact") >= 0) s -= 40;
    return s;
  }
  function loadVoices() {
    return new Promise(function (resolve) {
      var synth = window.speechSynthesis;
      if (!synth) return resolve([]);
      var voices = synth.getVoices();
      if (voices.length) return resolve(voices);
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(synth.getVoices());
      }
      synth.onvoiceschanged = finish;
      setTimeout(finish, 700);
    });
  }
  async function pickVoice() {
    var voices = await loadVoices();
    var best = null, score = -1e9;
    voices.forEach(function (v) {
      var s = scoreVoice(v);
      if (s > score) { score = s; best = v; }
    });
    chosenName = best ? best.name : "";
    document.documentElement.dataset.voice = chosenName || "none";
    return best;
  }
  function splitSentences(text) {
    var parts = String(text).replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    var out = [];
    parts.forEach(function (p) {
      var s = p.trim();
      if (!s) return;
      if (s.length <= 220) { out.push(s); return; }
      for (var i = 0; i < s.length; i += 200) out.push(s.slice(i, i + 200));
    });
    return out.length ? out : [String(text)];
  }
  function pulseLevel() {
    boundaryBoost *= 0.84;
    var approx = 0.22 + 0.38 * Math.abs(Math.sin(Date.now() / 95));
    H.level = Math.max(H.level * 0.55, Math.min(1, approx * 0.5 + boundaryBoost));
  }
  function speakOne(text, voice, hooks) {
    return new Promise(function (resolve) {
      var synth = window.speechSynthesis;
      if (!synth) return resolve();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = "en-US";
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        resolve();
      }
      var cap = setTimeout(finish, Math.min(20000, 1000 + text.length * 55));
      var started = false;
      u.onstart = function () { started = true; hooks.onstart && hooks.onstart(); };
      u.onend = function () { clearTimeout(cap); finish(); };
      u.onerror = function () { clearTimeout(cap); finish(); };
      u.onboundary = function (ev) {
        boundaryBoost = 1;
        H.pulses.push(performance.now());
        if (H.pulses.length > 12) H.pulses.shift();
        hooks.onboundary && hooks.onboundary(ev);
      };
      setTimeout(function () {
        if (!started) {
          try { synth.cancel(); } catch (e) {}
          finish();
        }
      }, 1200);
      synth.speak(u);
    });
  }

  function speakWeb(text, hooks) {
    hooks = hooks || {};
    var cancelled = false;
    var keep = null;
    var levelTimer = null;
    var done = (async function () {
      if (!window.speechSynthesis || cancelled) return;
      markSpeaking(true);
      var voice = await pickVoice();
      updateMeta();
      boundaryBoost = 0.4;
      levelTimer = setInterval(pulseLevel, 50);
      keep = setInterval(function () {
        if (window.speechSynthesis && window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 4000);
      var parts = splitSentences(text);
      try {
        for (var i = 0; i < parts.length; i++) {
          if (cancelled || Voice.muted) break;
          await speakOne(parts[i], voice, hooks);
        }
      } finally {
        clearInterval(levelTimer);
        clearInterval(keep);
        H.level = 0;
        markSpeaking(false);
        hooks.onend && hooks.onend();
      }
    })();
    return {
      done: done,
      cancel: function () {
        cancelled = true;
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
      }
    };
  }

  async function playBuffer(ctx, bytes, hooks, ctrl) {
    var copy = bytes.slice(0);
    var audioBuf = await ctx.decodeAudioData(copy);
    if (ctrl.signal.aborted) return;
    var src = ctx.createBufferSource();
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    var gain = ctx.createGain();
    src.buffer = audioBuf;
    src.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    var data = new Uint8Array(analyser.fftSize);
    var alive = true;
    function levelLoop() {
      if (!alive) return;
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) {
        var v = (data[i] - 128) / 128;
        sum += v * v;
      }
      var rms = Math.sqrt(sum / data.length);
      H.level = Math.min(1, rms * 3.2);
      if (rms > 0.08) {
        H.pulses.push(performance.now());
        if (H.pulses.length > 12) H.pulses.shift();
      }
      hooks.onlevel && hooks.onlevel(H.level);
      requestAnimationFrame(levelLoop);
    }
    return new Promise(function (resolve) {
      src.onended = function () { alive = false; H.level = 0; resolve(); };
      ctrl.signal.addEventListener("abort", function () {
        alive = false;
        try { src.stop(); } catch (e) {}
        H.level = 0;
        resolve();
      });
      hooks.onstart && hooks.onstart();
      markSpeaking(true);
      levelLoop();
      src.start();
    });
  }

  function speakEleven(text, hooks) {
    hooks = hooks || {};
    var ctrl = new AbortController();
    var done = (async function () {
      if (!cfg.elevenLabsProxy) throw new Error("missing_proxy");
      var ctx = ensureCtx();
      if (!ctx) throw new Error("no_audio_context");
      markSpeaking(true);
      var soft = setInterval(function () {
        H.level = 0.2 + 0.25 * Math.abs(Math.sin(Date.now() / 80));
      }, 50);
      try {
        var res = await fetch(cfg.elevenLabsProxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: String(text).slice(0, 4000), voiceId: cfg.elevenVoiceId || undefined }),
          signal: ctrl.signal
        });
        if (!res.ok) throw new Error("proxy_http_" + res.status);
        var reader = res.body && res.body.getReader ? res.body.getReader() : null;
        var chunks = [];
        if (reader) {
          while (true) {
            var step = await reader.read();
            if (step.done) break;
            if (step.value) chunks.push(step.value);
          }
        } else {
          chunks.push(new Uint8Array(await res.arrayBuffer()));
        }
        var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
        var bytes = new Uint8Array(total);
        var offset = 0;
        chunks.forEach(function (c) { bytes.set(c, offset); offset += c.length; });
        clearInterval(soft);
        await playBuffer(ctx, bytes.buffer, hooks, ctrl);
      } finally {
        clearInterval(soft);
        H.level = 0;
        markSpeaking(false);
        hooks.onend && hooks.onend();
      }
    })();
    return { done: done, cancel: function () { ctrl.abort(); } };
  }

  var Voice = window.HeliosVoice = {
    muted: true,
    speaking: false,
    stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    tts: "speechSynthesis" in window || !!(window.AudioContext || window.webkitAudioContext),
    chosenVoice: "",
    bind: function (btn, meta) {
      toggleBtn = btn;
      statusEl = meta;
      paintToggle();
      if (!btn) return;
      btn.addEventListener("click", function () {
        Voice.setMuted(!Voice.muted);
      });
    },
    setMuted: function (muted) {
      Voice.muted = !!muted;
      try { localStorage.setItem("se_v4_mute", Voice.muted ? "1" : "0"); } catch (e) {}
      paintToggle();
      if (Voice.muted) {
        Voice.cancel();
        setStatus(metaText());
        return;
      }
      ensureCtx();
      if (window.speechSynthesis) {
        try {
          var prime = new SpeechSynthesisUtterance("Voice on.");
          prime.lang = "en-US";
          prime.volume = 0.9;
          prime.rate = 1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(prime);
        } catch (e) {}
      }
      setStatus(metaText());
    },
    speak: function (text, hooks) {
      if (Voice.muted || !text || !String(text).trim()) return Promise.resolve();
      Voice.cancel();
      var name = providerName();
      var attempt = name === "elevenlabs" ? speakEleven : speakWeb;
      var handle = attempt(text, hooks || {});
      current = handle;
      return handle.done.catch(function (err) {
        console.warn("[helios voice]", err);
        if (name !== "elevenlabs") return;
        setStatus("Voice proxy unavailable. Using the browser voice.");
        var fb = speakWeb(text, hooks || {});
        current = fb;
        return fb.done;
      });
    },
    cancel: function () {
      if (current && current.cancel) current.cancel();
      current = null;
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
      H.level = 0;
      markSpeaking(false);
    },
    listen: function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return Promise.resolve("");
      Voice.cancel();
      return new Promise(function (resolve) {
        var rec = new SR();
        rec.lang = "en-US";
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        var finalText = "";
        Voice._rec = rec;
        rec.onresult = function (ev) {
          var t = "";
          for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
          finalText = t.trim();
          H.level = 0.35 + Math.random() * 0.4;
          var box = document.querySelector("#dock textarea, #dock input[type=text], #dock input[type=number]");
          if (box && document.activeElement !== box) box.value = finalText;
          else if (box) box.value = finalText;
        };
        rec.onerror = function () { H.level = 0; resolve(""); };
        rec.onend = function () { H.level = 0; Voice._rec = null; resolve(finalText); };
        try { rec.start(); }
        catch (e) { resolve(""); }
      });
    },
    stopListen: function () {
      if (Voice._rec) {
        try { Voice._rec.stop(); } catch (e) {}
        Voice._rec = null;
      }
    },
    providerLabel: function () {
      return providerName() === "elevenlabs" ? "ElevenLabs proxy" : "Browser voice";
    }
  };

  function metaText() {
    var voice = chosenName ? " · " + chosenName : "";
    return "Voice provider: " + Voice.providerLabel() + (Voice.muted ? " · muted" : voice);
  }
  function updateMeta() { setStatus(metaText()); Voice.chosenVoice = chosenName; }
  function paintToggle() {
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-pressed", Voice.muted ? "false" : "true");
    var label = toggleBtn.querySelector(".vt-label");
    if (label) label.textContent = Voice.muted ? "Voice off" : "Voice on";
    toggleBtn.setAttribute("aria-label", Voice.muted ? "Turn voice on" : "Turn voice off");
  }

  Object.defineProperty(Voice, "speaking", { get: function () { return speaking; } });
  setStatus(metaText());
})();
