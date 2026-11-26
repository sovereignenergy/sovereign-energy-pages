/* Helios closer. Scripted fallback for Brief v2. askLLM may override copy, never a binding step. */
(function () {
  "use strict";
  var chat, dock, live;
  function brand() { return window.CLOSER_BRAND || {}; }
  function botName() { return brand().botName || "Helios"; }
  function advisorName() { return brand().advisorName || "Binh Phan"; }
  function advisorShort() { return brand().advisorShort || "Binh"; }
  function faceName() { return window.CloserAvatars ? CloserAvatars.label() : "Halo"; }
  function brandify(html) {
    return String(html == null ? "" : html)
      .replace(/Binh Phan/g, "\u0001")
      .replace(/\bBinh\b/g, advisorShort())
      .replace(/\u0001/g, advisorName())
      .replace(/\bHelios\b/g, botName());
  }
  function whoLabel(who) {
    return who === "binh" ? advisorName().toUpperCase() + " · ADVISOR" : botName().toUpperCase() + " · AI";
  }
  var history = [];
  var A = { setter_claims: [], objections: [], packetVersion: 1 };
  var said = 0;
  var started = false;
  var RM = document.documentElement.classList.contains("rm");

  var BANS = [
    { id: "free", re: /\bfree\b/i },
    { id: "guaranteed-savings", re: /guaranteed savings/i },
    { id: "oop", re: /out[- ]of[- ]pocket/i },
    { id: "state-funded", re: /funded by the state/i },
    { id: "future-rates", re: /no future rate/i },
    { id: "save-range", re: /save\s*15|15\s*[-–]\s*40/i },
    { id: "dealer-brand", re: /\bsunrun\b/i },
    { id: "utility-swap", re: /utility swap/i },
    { id: "off-grid", re: /off the grid/i },
    { id: "no-blackouts", re: /no blackouts/i },
    { id: "scarcity", re: /holds your spot|800 applicants/i },
    { id: "zero-down", re: /\$0|\b0 down\b|no upfront/i },
    { id: "no-cost", re: /\bno cost\b/i },
    { id: "fully-fund", re: /fully fund/i },
    { id: "no-commit", re: /not committing|no commitment/i },
    { id: "bad-math", re: /10\.4\s*%/i },
    { id: "drill", re: /don'?t drill|do not drill/i },
    { id: "no-bill", re: /no (pg&e|sce|sdg&e|utility) bill/i },
    { id: "selected", re: /\bselected\b/i },
    { id: "gov-program", re: /government program|state program/i },
    { id: "tax-urgency", re: /last year the incentives|30%\s*(?:→|to)\s*18/i },
    { id: "rate-protect", re: /protect your rates|protect you at/i }
  ];

  function scanText(s) {
    var hits = [];
    BANS.forEach(function (b) { if (b.re.test(s || "")) hits.push(b.id); });
    return hits;
  }
  function guard(html) {
    var plain = toPlain(html);
    var hits = scanText(plain);
    if (!hits.length) return { html: html, hits: [] };
    A.compliance_blocks = (A.compliance_blocks || []).concat(hits);
    return {
      html: brandify("<b>Let me say that more carefully.</b> I can walk through options in plain language. Any number I give is an estimate, and Binh reviews anything final before it is sent."),
      hits: hits
    };
  }
  function guardText(s) {
    var hits = scanText(s || "");
    if (!hits.length) return s || "";
    A.compliance_blocks = (A.compliance_blocks || []).concat(hits);
    return "A note was held back because the wording needs a revision.";
  }
  window.HeliosGuard = { scan: scanText };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function toPlain(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function setState(s) { if (window.HeliosFX) HeliosFX.setState(s); }
  function scroll() {
    if (!chat) return;
    var last = chat.lastElementChild;
    if (last) last.scrollIntoView({ block: "end", behavior: RM ? "auto" : "smooth" });
  }
  function persist() {
    var copy = {};
    Object.keys(A).forEach(function (k) {
      if (k === "billFile" || typeof A[k] === "function") return;
      copy[k] = A[k];
    });
    try {
      sessionStorage.setItem("se_v4_session", JSON.stringify({ A: copy, history: history.slice(-80) }));
    } catch (e) {}
  }

  async function say(html, who) {
    if (++said > 140) return;
    who = who || "bot";
    html = brandify(html);
    var safe = who === "bot" ? guard(html).html : guardText(html);
    if (who !== "bot") safe = esc(safe).replace(/\n/g, "<br>");
    var plain = toPlain(safe);
    var speech = who === "binh" ? "Message from " + advisorShort() + ". " + plain : plain;
    setState("thinking");
    var el = document.createElement("div");
    el.className = "msg " + (who === "binh" ? "binh" : "bot");
    var label = esc(whoLabel(who));
    el.innerHTML = '<span class="who">' + label + '</span><span class="typing"><i></i><i></i><i></i></span>';
    chat.appendChild(el);
    scroll();
    await sleep(RM ? 20 : 240);
    setState("speaking");
    var voice = window.HeliosVoice;
    var speakP = voice ? voice.speak(speech) : Promise.resolve();
    await stream(el, '<span class="who">' + label + "</span>" + safe, voice && voice.muted);
    if (live) live.textContent = (who === "binh" ? advisorShort() + " said: " : botName() + " said: ") + plain;
    history.push({ role: who === "binh" ? "advisor" : "assistant", text: plain });
    persist();
    try { await speakP; } catch (e) {}
    setState("idle");
    if (window.HELIOS) HELIOS.level = 0;
  }
  async function stream(el, html, pulse) {
    var parts = html.split(/(<[^>]+>|\s+)/);
    var acc = "";
    var step = RM ? parts.length : 1;
    for (var i = 0; i < parts.length; i += step) {
      for (var j = i; j < Math.min(parts.length, i + step); j++) acc += parts[j];
      el.innerHTML = acc;
      if (pulse && window.HELIOS && parts[i] && parts[i].trim() && parts[i][0] !== "<") {
        HELIOS.level = 0.3 + Math.random() * 0.45;
      }
      scroll();
      if (!RM && parts[i] && parts[i][0] !== "<") await sleep(14);
    }
    if (window.HELIOS && pulse) HELIOS.level = 0;
  }
  function me(text) {
    var el = document.createElement("div");
    el.className = "msg me";
    el.textContent = brandify(text);
    chat.appendChild(el);
    history.push({ role: "user", text: text });
    persist();
    scroll();
  }

  function matchChip(text, chips) {
    var t = String(text || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var alias = {
      "pg&e": ["pge", "pg and e", "pacific gas"],
      "sce": ["southern california edison", "edison"],
      "sdg&e": ["sdge", "san diego gas"]
    };
    var best = null, score = 0;
    (chips || []).forEach(function (c) {
      var n = c.toLowerCase();
      var forms = [n.replace(/&/g, " and ")].concat(alias[n] || []);
      forms.forEach(function (f) {
        var ff = f.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        if (!ff) return;
        if (t === ff) { best = c; score = 100; return; }
        if (t.indexOf(ff) >= 0 || ff.indexOf(t) >= 0) {
          var s = Math.min(t.length, ff.length);
          if (s > score) { score = s; best = c; }
        }
      });
    });
    return score >= 3 ? best : null;
  }

  function prompt(spec) {
    spec = spec || {};
    setState("listening");
    return new Promise(function (resolve) {
      var done = false;
      dock.innerHTML = "";
      var wrap = document.createElement("div");
      wrap.className = "composer";
      var choices = document.createElement("div");
      choices.className = "choices";
      (spec.chips || []).forEach(function (label) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        b.textContent = brandify(label);
        b.onclick = function () { finish({ kind: "chip", value: label }); };
        choices.appendChild(b);
      });
      if (spec.chips) wrap.appendChild(choices);
      var box = null;
      if (spec.form) {
        var form = document.createElement("form");
        form.className = "inputs";
        form.noValidate = true;
        form.innerHTML = spec.form + '<p class="err"></p><button class="btn full" type="submit">Send</button>';
        form.onsubmit = function (e) {
          e.preventDefault();
          var read = spec.read(form);
          if (typeof read === "string") { form.querySelector(".err").textContent = read; return; }
          me(read.echo);
          finish({ kind: "form", value: read.val, echo: read.echo });
        };
        wrap.appendChild(form);
        box = form.querySelector("input,textarea,select");
      } else if (spec.free !== false && spec.free) {
        box = document.createElement("textarea");
        box.placeholder = brandify(spec.placeholder || "Type your answer");
        var send = document.createElement("button");
        send.type = "button";
        send.className = "btn";
        send.textContent = "Send";
        send.onclick = function () {
          var v = box.value.trim();
          if (!v && spec.required !== false) { return; }
          if (v) me(v);
          finish({ kind: "text", value: v });
        };
        box.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send.click(); }
        });
        wrap.appendChild(box);
        wrap.appendChild(send);
      }
      if (window.HeliosVoice && HeliosVoice.stt) {
        var mic = document.createElement("button");
        mic.type = "button";
        mic.className = "mic";
        mic.textContent = "Mic";
        mic.setAttribute("aria-label", "Speak your answer");
        mic.onclick = async function () {
          mic.classList.add("on");
          mic.textContent = "Listening…";
          setState("listening");
          var heard = "";
          try { heard = await HeliosVoice.listen(); } catch (e) { heard = ""; }
          mic.classList.remove("on");
          mic.textContent = "Mic";
          if (!heard) {
            var n = document.createElement("p");
            n.className = "fine heard";
            n.textContent = "The mic didn't return words. You can type instead.";
            wrap.appendChild(n);
            return;
          }
          if (spec.form && box) { box.value = heard; return; }
          var chip = matchChip(heard, spec.chips || []);
          if (chip) { finish({ kind: "chip", value: chip, heard: heard }); return; }
          if (spec.free) { me(heard); finish({ kind: "text", value: heard }); return; }
          var note = document.createElement("p");
          note.className = "fine heard";
          note.textContent = "I heard “" + heard + "”. Tap the closest option.";
          wrap.appendChild(note);
        };
        wrap.appendChild(mic);
      } else if (spec.free || spec.form) {
        var hint = document.createElement("p");
        hint.className = "fine";
        hint.textContent = "Voice input isn't available in this browser. Typing works.";
        wrap.appendChild(hint);
      }
      dock.appendChild(wrap);
      scroll();
      if (box && matchMedia("(min-width:861px)").matches) box.focus();

      var timer = null;
      if (spec.waitPacket && window.HeliosQueue) {
        timer = setInterval(function () {
          var p = HeliosQueue.get(spec.waitPacket);
          if (p && p.decision && !p.decision.consumed) finish({ kind: "packet" });
          var seen = A.threadSeen || 0;
          if (p && p.thread && p.thread.length > seen && spec.waitThread) finish({ kind: "thread" });
        }, 700);
      }
      var escTimer = setInterval(function () {
        if (A.forceEscalate) finish({ kind: "escalate" });
      }, 400);

      function finish(val) {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearInterval(escTimer);
        if (window.HeliosVoice) HeliosVoice.stopListen();
        if (val.kind === "chip") me(val.value);
        dock.innerHTML = "";
        setState("thinking");
        resolve(val);
      }
    });
  }

  async function maybeCorrect(text) {
    var t = String(text || "");
    var low = t.toLowerCase();
    var claim = "";
    if (/\bfree\b|no cost|state covers|state pays|state fund|funded/.test(low)) claim = "no-charge or state-funding claim";
    else if (/selected|800 applicant|limited funding|holds your spot/.test(low)) claim = "selection or scarcity claim";
    else if (/notice from|utility sent|pg&e sent|pge sent|edison sent/.test(low)) claim = "utility-notice claim";
    else if (/no more .{0,12}bill|zero bill|\$0 bill|eliminate .{0,12}bill/.test(low)) claim = "no-utility-bill claim";
    else if (/\bprogram\b/.test(low) && /state|utility|government|pge|pg&e|sce/.test(low)) claim = "program claim";
    if (!claim) return false;
    A.setter_claims.push({ claim: claim, quote: t.slice(0, 240), at: new Date().toISOString() });
    if (claim.indexOf("no-charge") === 0) {
      await say("Quick clarification so nothing is confusing later. This is a private solar company, not your utility and not a state effort. With a lease or power purchase agreement you pay for the solar power, and you still have a utility bill for anything the system doesn't cover. I'll show you figures from your own bill, and every one of them is an estimate.");
    } else if (claim.indexOf("selection") === 0) {
      await say("You are not on a scarce enrollment list. Solar either fits the home or it doesn't. If it doesn't, I'll say so.");
    } else if (claim.indexOf("utility-notice") === 0) {
      await say("I don't carry a notice from your utility, and I'm not with the utility. I'm an AI assistant working with Binh Phan.");
    } else if (claim.indexOf("no-utility") === 0) {
      await say("You'll still have a utility bill. Solar can lower the power you buy. It does not erase fixed charges or power the system doesn't cover.");
    } else {
      await say("Quick clarification. This isn't a utility or state effort. It's a private solar offer that Binh reviews before anything final is sent.");
    }
    return true;
  }

  async function ask(text, chips, extra) {
    await say(text);
    var spec = Object.assign({ chips: chips, free: true, placeholder: "Or type your answer" }, extra || {});
    var r = await prompt(spec);
    if (r.kind === "escalate" || A.forceEscalate) {
      A.forceEscalate = false;
      A.escalateReason = A.escalateReason || "asked for Binh";
      return { escalate: true };
    }
    if (r.kind === "packet" || r.kind === "thread") return r;
    var val = r.value || "";
    if (/confus|don't understand|dont understand|lost me/i.test(val)) A.confused = (A.confused || 0) + 1;
    if (A.confused >= 2) {
      A.escalateReason = "confused after two clarifications";
      return { escalate: true };
    }
    if ((r.kind === "text" || r.kind === "chip") && await maybeCorrect(val)) {
      A._corrections = (A._corrections || 0) + 1;
      if (A._corrections <= 2) return ask(text, chips, extra);
    }
    return r;
  }
  function bounced(r) { return r && r.escalate; }

  function reviewWindowNote() {
    var hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date()), 10);
    if (hour >= 8 && hour < 21) return "Binh usually reviews within 30 minutes between 8 AM and 9 PM Pacific.";
    return "It's outside Binh's review hours, 8 AM to 9 PM Pacific. I'll hold everything until then. You don't need to decide anything before you've read approved paperwork.";
  }

  var UT = {
    "PG&E": { plan: "Many PG&E homes are on a time-of-use plan such as E-TOU-C, E-TOU-D, or E-ELEC", peak: "often 4 PM to 9 PM, or 5 PM to 8 PM on E-TOU-D" },
    "SCE": { plan: "Many SCE homes are on a time-of-use plan such as TOU-D-4-9PM, TOU-D-5-8PM, or TOU-D-PRIME", peak: "4 PM to 9 PM, or 5 PM to 8 PM on TOU-D-5-8PM" },
    "SDG&E": { plan: "SDG&E residential plans are often time-of-use, for example TOU-DR1 or EV-TOU-5", peak: "4 PM to 9 PM" }
  };

  function parseMonths(s) {
    if (!s || !String(s).trim()) return null;
    var nums = String(s).match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 6) return { values: null, note: "Not available. The monthly series could not be read, and missing months were not treated as zero." };
    var values = nums.map(Number);
    var note = values.length < 12
      ? values.length + " months provided. Missing months are Not available and were not counted as zero."
      : "12-month series as entered.";
    if (values.some(function (n) { return n < 0; })) note += " Negative months kept.";
    return { values: values, note: note };
  }

  function money(n) { return "$" + Number(n).toFixed(2); }

  async function readFile(file) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok({ name: file.name, type: file.type, size: file.size, base64: String(r.result).split(",")[1] }); };
      r.onerror = no;
      r.readAsDataURL(file);
    });
  }

  function quality() {
    var b = A.bill || {};
    var avg = null;
    var avgNote = "Not available";
    if (b.yearDollars > 0) { avg = b.yearDollars / 12; avgNote = "from the 12-month electric total you entered"; }
    else if (b.amount > 0) { avg = b.amount; avgNote = "one period only. Do not qualify on a single month."; }
    var above = avg == null ? "unknown" : (avgNote.indexOf("single") >= 0 ? "unknown" : (avg > 180 ? "yes" : "no"));
    return {
      both_decision_makers: A.decision_makers === "Me and my spouse or partner" || A.decision_makers === "Others on title" ? "yes" : (A.decision_makers ? "no" : "unknown"),
      prescreen: "chat only",
      good_roof: A.roof === "Under 10 years" && A.shade === "Mostly sun" ? "yes" : (A.roof ? "unknown" : "unknown"),
      bill_acquired: (A.billFile || b.amount) ? "yes" : "no",
      avg_bill_above_180: above,
      avg_bill_note: avgNote + (avg != null ? " · about $" + avg.toFixed(0) + "/mo" : "")
    };
  }
  function hypo17() {
    var annual = annualKwh();
    var base = annual.value;
    var raised = base != null ? Math.round(base * 1.17) : null;
    return {
      label: "Hypothetical illustration only. Not an announced utility increase. Do not read this figure to the homeowner.",
      annual_kwh: base == null ? "Not available" : base,
      if_17_percent_higher_kwh: raised == null ? "Not available" : raised
    };
  }
  function annualKwh() {
    var b = A.bill || {};
    if (b.months && b.months.values) {
      var sum = b.months.values.reduce(function (a, n) { return a + n; }, 0);
      return { value: Math.round(sum), note: b.months.note };
    }
    if (b.yearKwh) return { value: b.yearKwh, note: "from the 12-month kWh you entered" };
    if (b.kwh > 0) return { value: Math.round(b.kwh * 12), note: "rough illustration: this period's kWh times 12, not a full history" };
    return { value: null, note: "Not available" };
  }
  function compliance() {
    var assistant = history.filter(function (h) { return h.role === "assistant"; }).map(function (h) { return h.text; }).join("\n");
    var hits = scanText(assistant);
    return {
      ai_disclosure: /AI assistant/i.test(assistant) ? "yes" : "no",
      recording_consent: A.recording_consent || "not captured",
      tcpa: A.tcpa ? "yes · " + (A.consent_timestamp || "") : "not captured",
      risky_phrases: hits.length ? hits.join(", ") : "none",
      escalator_explained: A.escalator_explained ? "yes" : "no",
      tax_language: A.tax_explained ? "compliant path used" : "not discussed",
      decision_makers: A.decision_makers || "not captured",
      age_65: A.age_65 || "not asked",
      disclosures_to_present: "CA Solar Energy System Disclosure Document, CPUC Solar Consumer Protection Guide, right to cancel"
    };
  }
  function buildPacket() {
    var b = A.bill || {};
    var annual = annualKwh();
    return {
      version: A.packetVersion || 1,
      kind: A.packetKind || "binding",
      header: {
        customer: ((A.first_name || "") + " " + (A.last_name || "")).trim() || "Not available",
        address: A.address || "Not available",
        utility: A.utility || "Not available",
        lead_source: "ai-closer-v4 landing",
        setter: "None · homeowner started on the page",
        chosen_option: A.option || "Not sure",
        binding_steps: A.packetKind === "escalation" ? [] : ["proposal", "credit", "esign", "submit"],
        escalate_reason: A.escalateReason || ""
      },
      summary: {
        title: "FUNNEL – " + ((A.last_name || A.first_name || "HOMEOWNER").toUpperCase()) + " – BINH",
        quality: quality(),
        utility_analysis: A.utility_analysis || "Not available",
        usage_table: b.months && b.months.values ? b.months : "Not available",
        hypothetical_17: hypo17(),
        closer_notes: [
          A.escalateReason ? "Escalation: " + A.escalateReason : "",
          A.edit_note ? "Revision: " + A.edit_note : "",
          A.downplay_savings ? "Homeowner downplayed savings. Do not push a savings story." : "",
          "Confirm the service address matches the bill.",
          "Dollar prices were not invented. The proposal tool did not return an approved price."
        ].filter(Boolean).join(" ")
      },
      bill: {
        rate_plan: b.plan || "Not visible",
        cca: b.generation ? "Generation dollars entered. Community power provider not named." : "Not visible",
        annual_kwh: annual.value == null ? "Not available" : annual.value + " · " + annual.note,
        average_dollars_per_kwh: A.rate_per_kwh || "Not available",
        estimated_annual_cost: b.yearDollars ? b.yearDollars : (b.amount ? "Not available from a single period" : "Not available"),
        care_fera: A.discount || "Not asked",
        nem_status: A.existing_solar || "Not asked",
        bill_file: A.billFile ? A.billFile.name : (b.amount ? "numbers entered, file not uploaded" : "Not available"),
        not_visible: A.not_visible || []
      },
      design_as_presented: A.design || "Not available",
      final_proposed: A.design || "Not available",
      differences: A.edit_note || "None. The preliminary illustration is what the homeowner saw.",
      compliance: compliance(),
      discovery: {
        motivation: A.motivation || "Not available",
        consequence: A.consequence || "Not available",
        home: A.home || "Not available",
        decision_makers: A.decision_makers || "Not available",
        stay: A.stay || "Not available",
        roof: A.roof || "Not available",
        shade: A.shade || "Not available",
        future_load: A.load || "Not available",
        medical: A.medical || "Not available",
        battery: A.battery || "Not available",
        age_65: A.age_65 || "Not asked"
      },
      objections: A.objections,
      setter_claims: A.setter_claims,
      transcript: history.slice(-80)
    };
  }

  async function postLead(status) {
    if (!window.SE || A.honeypot) return;
    var payload = {
      brand: (window.LP_CONFIG && LP_CONFIG.BRAND) || "Sovereign",
      page_type: "ai_closer",
      page_slug: "ai-closer-v4",
      ai_assistant: botName(),
      funnel_version: "ai-closer-v4",
      demo_preview: true,
      status: status,
      approval_id: A.packetId || "",
      first_name: A.first_name || "",
      last_name: A.last_name || "",
      email: A.email || "",
      phone: A.phone || "",
      zip: A.zip || "",
      address: A.address || A.zip || "",
      utility: A.utility || "",
      monthly_bill: A.monthly_bill || "",
      chosen_option: A.option || "",
      consent_tcpa: !!A.tcpa,
      consent_text: A.tcpa && window.SE.CONSENT ? SE.CONSENT : "",
      consent_timestamp: A.consent_timestamp || "",
      advisor_action: A.decision ? A.decision.action : "",
      conversation_owner: botName(),
      transcript: history.map(function (h) {
        var who = h.role === "user" ? "Homeowner: " : h.role === "advisor" ? advisorShort() + ": " : botName() + ": ";
        return who + h.text;
      }).join("\n").slice(0, 18000)
    };
    if (window.SE.utm) Object.assign(payload, SE.utm());
    if (A.billFile && A.billFile.size < 1.2 * 1048576) {
      try { payload.bill_file = await readFile(A.billFile); } catch (e) {}
    } else if (A.billFile) payload.bill_file_name = A.billFile.name;
    try { await SE.post(payload); } catch (e) { console.error(e); }
  }

  async function askLLM() { return null; }
  async function designApi(input) {
    var annual = input.annual_kwh;
    if (!(annual > 0)) return { mock: true, preliminary: true, system_kw: null, panels: null, annual_kwh: null, offset_pct: null, note: "Not available" };
    var kw = Math.max(2, Math.round(annual / 1500 * 10) / 10);
    var panels = Math.ceil(kw / 0.4);
    var produced = Math.round(kw * 1500);
    var offset = Math.round(produced / annual * 100);
    return { mock: true, preliminary: true, system_kw: kw, panels: panels, annual_kwh: produced, offset_pct: offset, note: "Rough illustration from entered kWh. Not a shade study or site survey." };
  }
  async function pricingApi() {
    return {
      mock: true,
      preliminary: true,
      subject_to_approval: true,
      price: null,
      escalator_percent: null,
      options: [
        { k: "PPA", d: "The company owns the system. You pay per kWh it produces. Any yearly increase is written in the contract." },
        { k: "Lease", d: "The company owns the system. You pay to use it. A yearly increase applies only if the contract includes one." },
        { k: "Loan", d: "You own the system and repay a lender over time." },
        { k: "Cash", d: "You own the system and pay the purchase price." }
      ]
    };
  }
  function approved(step) {
    return A.decision && A.decision.action === "approve" && A.decision.steps && A.decision.steps[step];
  }
  async function creditCheckApi(input) {
    if (!approved("credit") || !input || input.approval_id !== A.packetId) return { mock: true, status: "blocked_pending_approval" };
    return { mock: true, status: "demo_not_sent", sandbox: true };
  }
  async function esignApi(input) {
    if (!approved("esign") || !input || !input.disclosures_acknowledged) return { mock: true, status: "blocked_pending_approval" };
    return { mock: true, status: "demo_not_sent", sandbox: true };
  }
  async function submitApi(input) {
    if (!approved("submit") || !input || input.approval_id !== A.packetId) return { mock: true, status: "blocked_pending_approval" };
    return { mock: true, status: "demo_not_submitted", sandbox: true };
  }
  window.HeliosIntegrations = { askLLM: askLLM, designApi: designApi, pricingApi: pricingApi, creditCheckApi: creditCheckApi, esignApi: esignApi, submitApi: submitApi, approvalApi: window.approvalApi };

  var OB = {
    think: "Totally fair. It's a long agreement. Just so I understand, is it the price, the equipment, or the length of the agreement? We can look at that one piece from your bill and the terms, or pick this up another day. Either is fine.",
    quotes: "Smart, you should compare. Look at the total cost over the term, the starting price, the yearly increase, who owns and maintains the system, and the warranties as written. I can put your numbers in writing after Binh approves a proposal, so the comparison is on paper. If another offer is better on those points, take it.",
    sell: "Good question. An agreement can sometimes transfer to a buyer through the company's transfer process. I won't guess the buyer's terms. The buyer would still have a utility bill for anything the system doesn't cover. If you're moving soon, this may not be a fit, and that's OK.",
    cost: "Totally fair. Is it the amount paid up front, or the monthly amount? You're spending about the electric total you entered now. I can show how lease, power purchase, loan, and cash differ. If it doesn't work for the home, you shouldn't do it.",
    wait: "That's reasonable. What would you be waiting to see? I can show how your bill reads today. I can't promise what rates or incentives will do. If waiting is right for you, I'll say so.",
    credit: "I'll explain the credit step plainly. If you move forward, you fill in the secure credit application yourself after Binh approves it. I never ask for a Social Security number in this chat, and I don't promise an approval.",
    roof: "Good thing to raise. The site survey checks the roof. Installs use flashed roof attachments, and any roof-penetration warranty is whatever the approved agreement says. I won't guess the term.",
    spouse: "Absolutely. This should be a joint decision. We can go through it when you're both here, and I can keep a short summary of the bill and the illustration for you to share.",
    nem: "Under California's Net Billing Tariff for newer customers, exports are usually worth less than the power you buy in the evening. Designs now focus on your own use, often with a battery for the peak hours. I still won't promise a leftover bill amount.",
    tax: "Federal solar tax rules changed in 2025. With a lease or power purchase agreement you don't claim a federal credit yourself. I can't promise any credit or any deadline. A tax professional can confirm your situation.",
    scam: "Smart to ask. I'm an AI assistant working with Binh Phan, a solar consultant. This is a private company, not your utility and not a state effort. I won't ask for a Social Security number, bank, or card number in this chat. Nothing is binding until you've reviewed an agreement and signed it, and only after Binh approves the paperwork.",
    solar: "Yes. This is rooftop solar, and often a battery, through a lease, power purchase agreement, loan, or purchase. A battery can keep some circuits on during an outage, depending on its size. Solar can reduce how much you buy from the utility. It does not stop utility rate changes.",
    nobill: "No worries. You can download it from your utility account or app. I need the 12-month usage, or at least one period's kWh. I can wait, or we can pick this up later."
  };

  async function handleObjection(id) {
    A.objections.push(id);
    A.attempts = A.attempts || {};
    A.attempts[id] = (A.attempts[id] || 0) + 1;
    if (id === "no") return "ended";
    await say(OB[id] || OB.think);
    if (A.attempts[id] >= 2) {
      await say("I won't ask again. We can pick this up another day, or I can ask Binh to join this same chat.");
      var last = await prompt({ chips: ["Pick this up later", "Ask Binh to join", "I'm ready to prepare the package"] });
      if (!last || last.value === "Pick this up later") return "ended";
      if (last.value === "Ask Binh to join") { A.escalateReason = "asked for Binh"; return "escalate"; }
      return "details";
    }
    var follow = await prompt({ chips: ["Let's look at that part", "I'm ready to prepare the package", "That's a no", "Ask Binh to join"] });
    if (!follow || follow.value === "That's a no") return "ended";
    if (follow.value === "Ask Binh to join") { A.escalateReason = "asked for Binh"; return "escalate"; }
    if (follow.value === "I'm ready to prepare the package") return "details";
    if (id === "think") {
      var which = await prompt({ chips: ["The price", "The equipment", "The length of the agreement"] });
      if (which && which.value) await say("Thanks. I'll keep the focus on " + which.value.toLowerCase() + " and on your own numbers. Binh still approves anything final.");
    }
    return "commit_ready";
  }

  var flow = {
    disclosure: async function () {
      await say("Hi, I'm <b>Helios</b>, an AI assistant working with Binh Phan, a solar consultant in California. I'm not a person. The face on screen, " + faceName() + ", is an AI projection, not a person. I can review your electric bill, walk you through a preliminary design and pricing options, and help you sign up if it's right for you. Binh, the registered salesperson, personally reviews and approves anything final before it's sent to you. If you turn voice on, I can speak these replies, and this chat is transcribed. Is that OK?");
      var r = await prompt({ chips: ["Yes, that's OK", "Text only", "I need another language", "I'd like Binh to join"] });
      if (r && /language/i.test(r.value)) { A.escalateReason = "language"; return "escalate"; }
      if (!r || r.kind === "escalate" || /Binh/.test(r.value || "")) { A.escalateReason = "asked for Binh"; return "escalate"; }
      if (r.value === "Text only") {
        A.recording_consent = "text chat only";
        if (window.HeliosVoice) HeliosVoice.setMuted(true);
        await say("We'll stay in text. The transcript is still part of Binh's review file. You can turn voice on later if you want.");
      } else A.recording_consent = "accepted for voice and transcript";
      return "warmup";
    },
    warmup: async function () {
      var r = await ask("What caught your eye, and what would you want to get out of this?", ["My bill is high", "Backup during outages", "More predictable pricing", "I was told the state covers it", "I got a notice from my utility", "Just looking"]);
      if (bounced(r)) return "escalate";
      A.motivation = r.value;
      if (/backup|outage/i.test(A.motivation)) A.hot = "backup";
      else if (/predict/i.test(A.motivation)) A.hot = "predictability";
      else A.hot = "cost";
      return "preframe";
    },
    preframe: async function () {
      var r = await ask("With a lease or power purchase agreement, the price you pay for the solar power is set in the contract, with a fixed yearly increase you can read up front, instead of following your utility's rate changes for that part of your power. You still pay the utility for power the system doesn't cover. If more predictable pricing for the solar portion would help, is that worth a look?", ["Yes, worth a look", "I care more about backup", "Not really"]);
      if (bounced(r)) return "escalate";
      A.preframe = r.value;
      if (/Not really/i.test(r.value)) {
        var hot = await ask("What matters more: lowering what you pay, having backup for some circuits during an outage, or something else?", ["Lower what I pay", "Backup for some circuits", "Something else"]);
        if (bounced(hot)) return "escalate";
        A.hot = hot.value;
      }
      return "expectations";
    },
    expectations: async function () {
      var r = await ask("Here's how this goes. We'll look at your bill, I'll walk you through a preliminary design and your pricing options, and you can ask me anything. If you want to move forward, the next steps are a credit application and the agreement. Before anything is sent as final, Binh Phan reviews and approves it. Nothing is binding until you sign, and you'll get your right-to-cancel notice. Sound fair?", ["Sound fair", "I have a question", "I'd like Binh to join"]);
      if (bounced(r) || (r.value && /Binh/.test(r.value))) { A.escalateReason = A.escalateReason || "asked for Binh"; return "escalate"; }
      if (r.value === "I have a question") {
        await say("Ask me here. Common ones: I am an AI, prices you see before Binh approves are estimates, and you will still have a utility bill.");
        var q = await prompt({ free: true, required: true, placeholder: "Your question" });
        if (q.value) {
          var mapped = /solar\?/i.test(q.value) ? "solar" : /scam|utility send|pg&e send/i.test(q.value) ? "scam" : /tax/i.test(q.value) ? "tax" : "";
          if (mapped) await say(OB[mapped]);
          else await say("I'll answer from the bill and the written terms once we have them. If I'm not sure, I'll say so and flag it for Binh instead of guessing.");
        }
      }
      A.expectations_ok = true;
      return "context";
    },
    context: async function () {
      var u = await ask("Which utility sends the electric bill? I only prepare packages for PG&E, SCE, and SDG&E.", ["PG&E", "SCE", "SDG&E", "Another utility"]);
      if (bounced(u)) return "escalate";
      if (!u.value || /another/i.test(u.value)) {
        A.utility = "Other";
        A.escalateReason = "outside PG&E, SCE, and SDG&E";
        await say("I only prepare this for California homes on PG&E, SCE, or SDG&E. I'll stay in this chat and loop Binh in. I won't invent a design for another utility.");
        return "escalate";
      }
      A.utility = matchChip(u.value, ["PG&E", "SCE", "SDG&E"]) || u.value;
      if (A.utility === "PG&E") {
        await say("The CPUC's Public Advocates Office tracks utility rates. In its first-quarter 2025 report, PG&E's average residential rate was up about 104% from January 2015 to April 2025. Later reports differ, and rates can fall as well as rise. I can't promise what happens next. That's why some homeowners look at a contract price for part of their power.");
      } else {
        await say("I don't have a Public Advocates Office figure for " + esc(A.utility) + " loaded here that I'm willing to quote from memory. I won't guess a percentage. Your own bill is the history we'll use. Past changes still wouldn't tell us next year's rate.");
      }
      return "consequence";
    },
    consequence: async function () {
      await say("Looking at how your bill has moved, how would it affect your budget if your electricity costs kept rising the way they have over the last few years?");
      var r = await prompt({ free: true, required: true, placeholder: "Type what it would mean for your budget" });
      if (r.kind === "escalate" || A.forceEscalate) { A.escalateReason = A.escalateReason || "asked for Binh"; return "escalate"; }
      A.consequence = r.value || "";
      if (await maybeCorrect(A.consequence)) { /* logged */ }
      if (/doesn.?t matter|not worried|no effect|won't affect|wont affect/i.test(A.consequence)) {
        A.downplay_savings = true;
        await say("Got it. I won't push a savings story. We'll stay with the bill facts, and backup only if you want it.");
      } else await say("Thank you. I'll keep that in mind as we read the bill. I won't turn it into a forecast.");
      return "bill";
    },
    bill: async function () {
      await say("You can upload a PDF or photo, or type the figures. A 12-month usage chart helps. I won't invent anything that isn't in what you give me. If I can't see it, I'll mark it Not visible.");
      await say("Before you upload: the bill is used to prepare this proposal and Binh's review. This preview keeps a copy in the browser and can post the lead to Binh's sheet. You can ask us to delete it. Never type a Social Security number, date of birth, bank, or card number here. <a href=\"../privacy/\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>.");
      var how = await prompt({ chips: ["Upload a bill", "Enter numbers", "I don't have my bill"] });
      if (!how || /don't have|dont have/i.test(how.value)) {
        await say(OB.nobill);
        var later = await prompt({ chips: ["I'll enter numbers", "Pick this up later"] });
        if (!later || /later/i.test(later.value)) return "ended";
      }
      if (how && how.value === "Upload a bill") {
        var up = await prompt({
          form: '<label class="l">PDF, JPG, or PNG, max 8 MB</label><input type="file" name="bill" accept="application/pdf,image/*">',
          read: function (f) {
            var file = f.bill.files[0];
            if (!file) return "Choose a file.";
            if (file.size > 8 * 1048576) return "That file is over 8 MB.";
            return { val: file, echo: "Uploaded " + file.name };
          }
        });
        if (up && up.value) { A.billFile = up.value; A.not_visible = ["Document text is Not visible. Helios cannot read the file yet."]; }
        await say("The file is attached for Binh. I can't read the document myself, so the line items are Not visible until you type them. Negative months, if you have them, should stay negative.");
      }
      var form = await prompt({
        form: '<div class="row2"><div class="field"><label class="l">This period\'s electric total ($)</label><input name="amt" type="number" inputmode="decimal" min="0" step="0.01" placeholder="240"></div><div class="field"><label class="l">ZIP</label><input name="zip" inputmode="numeric" maxlength="5" placeholder="92126"></div></div><div class="field"><label class="l">kWh this period (negatives OK)</label><input name="kwh" type="number" inputmode="decimal" step="1" placeholder="900"></div><details><summary class="fine">More from the bill, if you have it</summary><div class="row2"><div class="field"><label class="l">Delivery ($)</label><input name="del" type="number" min="0" step="0.01"></div><div class="field"><label class="l">Generation ($)</label><input name="gen" type="number" min="0" step="0.01"></div></div><div class="field"><label class="l">Rate plan</label><input name="plan" type="text" placeholder="E-TOU-C"></div><div class="row2"><div class="field"><label class="l">12-month electric total ($)</label><input name="yr" type="number" min="0" step="0.01"></div><div class="field"><label class="l">12-month kWh</label><input name="yrk" type="number" step="1"></div></div><div class="field"><label class="l">Monthly kWh, oldest to newest</label><textarea name="months" placeholder="-120, 400, 380"></textarea></div></details>',
        read: function (f) {
          var amt = parseFloat(f.amt.value);
          if (!(amt > 0)) return "Enter the electric total for this period.";
          if (!/^\d{5}$/.test(f.zip.value)) return "Enter a 5-digit ZIP.";
          var kwhRaw = f.kwh.value.trim();
          var kwh = kwhRaw === "" ? null : parseFloat(kwhRaw);
          if (kwhRaw !== "" && !isFinite(kwh)) return "kWh needs to be a number. Negatives are OK.";
          return {
            val: {
              amount: amt,
              zip: f.zip.value,
              kwh: kwh,
              delivery: parseFloat(f.del.value) || 0,
              generation: parseFloat(f.gen.value) || 0,
              plan: f.plan.value.trim(),
              yearDollars: parseFloat(f.yr.value) || 0,
              yearKwh: parseFloat(f.yrk.value) || 0,
              months: parseMonths(f.months.value)
            },
            echo: "$" + amt + " · " + A.utility + " · " + f.zip.value + (kwh != null ? " · " + kwh + " kWh" : "")
          };
        }
      });
      if (!form || form.kind === "escalate") { A.escalateReason = A.escalateReason || "asked for Binh"; return "escalate"; }
      A.bill = form.value;
      A.zip = form.value.zip;
      A.monthly_bill = "$" + form.value.amount;
      return "analyze";
    },
    analyze: async function () {
      setState("thinking");
      var b = A.bill, u = UT[A.utility] || { plan: "Not available", peak: "Not available" };
      var html = "<b>Your bill, from what you entered</b><ul>";
      html += "<li><b>Total:</b> " + money(b.amount) + " electric this period.</li>";
      if (b.kwh != null && b.kwh < 0) html += "<li>This period shows <b>negative usage (" + b.kwh + " kWh)</b>. That means more went to the grid than you used. I'm keeping it negative.</li>";
      else if (b.kwh > 0) {
        var rate = b.amount / b.kwh;
        A.rate_per_kwh = "$" + rate.toFixed(3) + "/kWh estimate from the electric total and kWh you entered. Not a tariff rate.";
        html += "<li><b>Usage:</b> " + b.kwh + " kWh. About <b>$" + rate.toFixed(3) + " per kWh</b> all-in. That's an estimate from your numbers, not a tariff.</li>";
      } else {
        A.rate_per_kwh = "Not available";
        html += "<li><b>Per-kWh rate:</b> Not available. I won't divide the total by a kWh figure I don't have.</li>";
      }
      if (b.delivery > 0 && b.generation > 0) {
        var share = Math.round(b.delivery / (b.delivery + b.generation) * 100);
        html += "<li>Delivery charges were " + money(b.delivery) + " of the " + money(b.delivery + b.generation) + " you split out, about <b>" + share + "%</b>. That's the cost of getting power to the house, separate from the power itself. Solar does not remove delivery charges on power you still buy.</li>";
      } else html += "<li><b>Delivery vs generation:</b> Not visible. I won't guess the split.</li>";
      html += "<li><b>Rate plan:</b> " + (b.plan ? esc(b.plan) + ". " : "Not visible. ") + esc(u.plan) + ".</li>";
      html += "<li><b>Peak hours:</b> " + esc(u.peak) + ".</li>";
      if (b.months && b.months.values) {
        html += "<li><b>Monthly kWh:</b> " + b.months.values.join(", ") + ". " + esc(b.months.note) + "</li>";
      } else html += "<li><b>12-month monthly table:</b> Not available.</li>";
      if (b.yearDollars) html += "<li><b>12-month electric total:</b> about " + money(b.yearDollars) + ", from what you entered. Estimate until the full history is checked.</li>";
      html += "</ul><span class='fine'>Estimate from your entries. Not a quote. Binh checks the bill before anything is final.</span>";
      A.utility_analysis = toPlain(html).slice(0, 1500);
      await say(html);
      var ok = await ask("Does that match the bill?", ["Yes, that matches", "Not sure"]);
      if (bounced(ok)) return "escalate";
      A.bill_confirmed = /Yes/.test(ok.value) ? "yes" : "unverified";
      var disc = await ask("Is the account on CARE, FERA, or medical baseline?", ["No", "CARE", "FERA", "Medical baseline", "Not sure"]);
      if (bounced(disc)) return "escalate";
      A.discount = disc.value;
      var solar = await ask("Do you already have solar on this home?", ["No solar yet", "Yes, I have solar"]);
      if (bounced(solar)) return "escalate";
      A.existing_solar = solar.value;
      if (/Yes/.test(solar.value)) {
        var nem = await ask("Do you know the export plan? If not, I'll mark it Not sure.", ["Older net metering", "Net billing", "Not sure"]);
        A.existing_solar = solar.value + " · " + (nem && nem.value ? nem.value : "Not sure");
        A.escalateReason = "existing solar";
        await say("Existing solar needs Binh in this conversation before a design is treated as final. I'm looping him in with your bill notes, and I'm staying right here.");
        return "escalate";
      }
      return "discover";
    },
    discover: async function () {
      var home = await ask("Do you own the home, and what type is it?", ["Own, single-family", "Own, townhouse or condo", "I rent", "Commercial"]);
      if (bounced(home)) return "escalate";
      A.home = home.value;
      if (/rent/i.test(home.value)) {
        A.escalateReason = "not the owner";
        await say("Solar needs the owner's go-ahead, so I shouldn't build a package in your name. I'll loop Binh in and stay in this chat in case you have the owner's permission to continue.");
        return "escalate";
      }
      if (/Commercial/i.test(home.value)) {
        A.escalateReason = "commercial";
        await say("Commercial properties need Binh in the conversation. I'll loop him in and stay here.");
        return "escalate";
      }
      var dm = await ask("Who else is part of this decision, such as a spouse or someone on title?", ["Just me", "Me and my spouse or partner", "Others on title"]);
      if (bounced(dm)) return "escalate";
      A.decision_makers = dm.value;
      var stay = await ask("How long are you planning to stay?", ["10+ years", "5 to 10 years", "Under 5 years", "Not sure"]);
      if (bounced(stay)) return "escalate";
      A.stay = stay.value;
      if (/Under 5/.test(stay.value)) {
        await say("If a move is soon, this probably isn't a fit, and that's OK. We can stop, or keep going for information only.");
        var cont = await prompt({ chips: ["Keep going for information", "Stop here"] });
        if (!cont || /Stop/.test(cont.value || "")) return "ended";
      }
      var roof = await ask("About how old is the roof, and are there leaks?", ["Under 10 years", "10 to 20 years", "20+ years or leaks", "Not sure"]);
      if (bounced(roof)) return "escalate";
      A.roof = roof.value;
      if (/20\+|leak/i.test(roof.value)) await say("The site survey checks the roof before any design is final. I won't guess whether it qualifies.");
      var shade = await ask("How much shade hits the roof?", ["Mostly sun", "Some shade", "Heavy shade", "Not sure"]);
      if (bounced(shade)) return "escalate";
      A.shade = shade.value;
      var load = await ask("Anything coming that adds electricity use?", ["EV", "Pool or spa", "Heat pump or new AC", "None planned"]);
      if (bounced(load)) return "escalate";
      A.load = load.value;
      var med = await ask("Does anyone in the home rely on medical equipment that needs power?", ["No", "Yes"]);
      if (bounced(med)) return "escalate";
      A.medical = med.value;
      if (med.value === "Yes") await say("I'll flag that for the design. A battery backs up a limited load, depending on its size. I won't promise the lights stay on.");
      var bat = await ask("Are you interested in a home battery?", ["Yes", "Maybe", "No"]);
      if (bounced(bat)) return "escalate";
      A.battery = bat.value;
      return "design";
    },
    design: async function () {
      var annual = annualKwh();
      var d = await designApi({ annual_kwh: annual.value, zip: A.zip, shade: A.shade });
      A.design = d;
      setState("thinking");
      var gid = "pv" + Math.floor(Math.random() * 1e6);
      var n = Math.min(d.panels || 12, 24);
      var cells = "";
      for (var i = 0; i < n; i++) {
        var col = brand().colors || {};
        cells += '<rect x="' + (16 + (i % 8) * 28) + '" y="' + (36 + Math.floor(i / 8) * 40) + '" width="24" height="34" rx="2" fill="url(#' + gid + ')" stroke="' + (col.cyan || "#3FE0FF") + '" stroke-width=".6"/>';
      }
      var hgt = 70 + Math.ceil(n / 8) * 40;
      var palette = brand().colors || {};
      var svg = '<svg viewBox="0 0 250 ' + hgt + '" style="width:100%;max-width:320px;display:block;margin:8px 0" role="img" aria-label="Schematic panel illustration, not a roof design"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (palette.navy || "#0A1428") + '"/><stop offset="1" stop-color="' + (palette.bg || "#04060C") + '"/></linearGradient></defs>' + cells + '<text x="12" y="18" fill="' + (palette.muted || "#9FB3CC") + '" font-size="10">SCHEMATIC · NOT A SITE DESIGN</text></svg>';
      var copy = "<b>Preliminary design illustration</b>" + svg;
      if (d.system_kw) {
        copy += "About <b>" + d.system_kw + " kW</b>, roughly " + d.panels + " panels, producing an estimated <b>" + d.annual_kwh + " kWh a year</b>. Compared with the usage figure (" + annual.note + "), that's about <b>" + d.offset_pct + "% offset</b>.";
      } else copy += "I don't have annual kWh, so I won't invent a system size. Offset is Not available.";
      copy += " This is preliminary and can change after a site survey. You'll still have a utility bill for fixed charges and any power the system doesn't cover. I don't have that leftover amount, so I won't invent it.";
      if (A.battery !== "No") copy += " A battery can store midday solar for the evening peak. What it runs in an outage depends on its size.";
      copy += " Panel and battery prices are Not available from the proposal tool in this preview. I won't guess them.";
      copy += "<br><span class='fine'>" + esc(d.note || "Estimate.") + " Not a quote.</span>";
      await say(copy);
      var q = await prompt({ chips: ["That makes sense", "I have a question", "I'm confused"] });
      if (q && /confus/i.test(q.value)) {
        A.confused = (A.confused || 0) + 1;
        await say("The illustration is a rough size from the kWh you typed. It is not the final design, and it is not a promise about the utility bill that remains.");
        if (A.confused >= 2) { A.escalateReason = "confused after two clarifications"; return "escalate"; }
      } else if (q && /question/i.test(q.value)) {
        await say("Ask away. If it isn't in your numbers or the illustration, I'll mark it for Binh instead of guessing.");
        await prompt({ free: true, placeholder: "Your question" });
        await say("Noted. I'll carry that into Binh's packet.");
      }
      return "financing";
    },
    financing: async function () {
      var price = await pricingApi(A.design);
      A.pricing = price;
      var html = "<b>Ways to pay</b> <span class='fine'>(neutral order, not a ranking)</span><ul>";
      price.options.forEach(function (o) { html += "<li><b>" + esc(o.k) + ":</b> " + esc(o.d) + "</li>"; });
      html += "</ul>";
      if (A.rate_per_kwh && A.rate_per_kwh !== "Not available") html += "<p>Your current average from the numbers you entered is about <b>" + esc(A.rate_per_kwh) + "</b></p>";
      html += "<p>I don't have a sanctioned price in this preview, so I won't invent a per-kWh offer or a yearly percentage. Any yearly increase would be the one written in the contract, and it does raise the price over time. The utility's future rates aren't known. This is not an offer. It waits for Binh.</p>";
      html += "<p>With a lease or power purchase agreement, you don't claim a federal credit yourself. I can't promise any credit or any deadline. A tax professional can speak to your own taxes. With a loan or cash purchase, ownership and upkeep sit with you after the written warranties.</p>";
      html += "<span class='fine'>Preliminary. Subject to site survey, credit, and Binh's approval. Not a quote.</span>";
      A.escalator_explained = true;
      A.tax_explained = true;
      await say(html);
      var r = await ask("Which matters more: the company owning and maintaining the system, or you owning it? Which option should I put on the packet?", ["Lease", "PPA", "Loan", "Cash", "Not sure yet"]);
      if (bounced(r)) return "escalate";
      A.option = r.value;
      return "warranties";
    },
    warranties: async function () {
      await say("I only describe warranty terms that are written in the agreement Binh approves. I won't guess a year count or a dollar amount. When an agreement is approved, I'll walk you through transfer, end-of-term options, performance terms, battery coverage, and roof penetrations exactly as that agreement writes them. If a buyer doesn't take over a transferable agreement, that outcome is also whatever the agreement says. I don't have the agreement in this preview, so those items are Not available yet.");
      var r = await prompt({ chips: ["OK", "What if we sell?", "I have a question"] });
      if (r && /sell/i.test(r.value)) await say(OB.sell);
      else if (r && /question/i.test(r.value)) {
        await say("If you tell me the question, I'll answer only what I can support, or I'll log it for Binh.");
        var q = await prompt({ free: true, placeholder: "Your question" });
        if (q && q.value) { A.objections.push("warranty question: " + q.value.slice(0, 180)); await say("Logged for Binh. I won't fill the gap with a guess."); }
      }
      return "commit";
    },
    commit: async function () {
      var sense = await ask("Does this make sense so far?", ["Yes", "I have a concern", "I'm confused"]);
      if (bounced(sense)) return "escalate";
      if (sense && /confus/i.test(sense.value)) {
        await say("Short version: the design is an estimate, you would still have a utility bill, the price isn't an offer until Binh approves it, and a lease or power purchase price can rise each year by the contract amount.");
      }
      if (sense && /concern/i.test(sense.value)) return "objection";
      var opt = A.option && A.option !== "Not sure yet" ? A.option : "the option you prefer";
      var askMove = await ask("Based on everything we've looked at, would you like to move forward with the " + opt + " option?", ["Yes, prepare my package", "I want to think about it", "I want other quotes", "What if we sell?", "It's the cost", "I need my spouse", "I'm not interested"]);
      if (bounced(askMove)) return "escalate";
      var v = askMove.value || "";
      if (/Yes/.test(v)) return "details";
      return routeObjection(v);
    },
    objection: async function () {
      var r = await prompt({ chips: ["I want to think about it", "I want other quotes", "What if we sell?", "It's the cost", "I want to wait", "Credit worries", "The roof", "I need my spouse", "Is this a scam?", "I'm not interested"] });
      if (!r) return "ended";
      return routeObjection(r.value);
    },
    details: async function () {
      var consent = window.SE && SE.CONSENT ? SE.CONSENT : "I agree Sovereign Energy may contact me about this proposal, including by automated calls or texts. Consent is not a condition of purchase. Reply STOP to opt out.";
      var r = await prompt({
        form: '<div class="row2"><div class="field"><label class="l">First name</label><input name="fn" required></div><div class="field"><label class="l">Last name</label><input name="ln" required></div></div><div class="field"><label class="l">Home address</label><input name="ad" autocomplete="street-address"></div><div class="row2"><div class="field"><label class="l">Email</label><input name="em" type="email"></div><div class="field"><label class="l">Mobile</label><input name="ph" type="tel"></div></div><div class="field"><label class="l">Anyone 65 or older signing?</label><select name="age"><option>No</option><option>Yes</option><option>Prefer not to say</option></select></div><div class="hp" aria-hidden="true"><input name="company_website" tabindex="-1" autocomplete="off"></div><label class="consent"><input type="checkbox" name="own"> I own this home and the name on title can sign.</label><label class="consent"><input type="checkbox" name="tcpa"> ' + esc(consent) + '</label>',
        read: function (f) {
          if (f.company_website && f.company_website.value) { A.honeypot = true; }
          if (!f.fn.value.trim() || !f.ln.value.trim()) return "Enter your full name.";
          if (f.ad.value.trim().length < 6) return "Enter the home address.";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.em.value)) return "Enter a valid email.";
          if (f.ph.value.replace(/\D/g, "").length < 10) return "Enter a 10-digit mobile number.";
          if (!f.own.checked) return "Confirm ownership, or ask Binh to join if you aren't on title.";
          if (!f.tcpa.checked) return "Check the contact box to queue the package. It is not required in order to buy.";
          return {
            val: { fn: f.fn.value.trim(), ln: f.ln.value.trim(), ad: f.ad.value.trim(), em: f.em.value.trim(), ph: f.ph.value.trim(), age: f.age.value },
            echo: f.fn.value.trim() + " " + f.ln.value.trim() + " · " + f.ad.value.trim()
          };
        }
      });
      if (!r || r.kind === "escalate") { A.escalateReason = A.escalateReason || "asked for Binh"; return "escalate"; }
      A.first_name = r.value.fn;
      A.last_name = r.value.ln;
      A.address = r.value.ad;
      A.email = r.value.em;
      A.phone = r.value.ph;
      A.age_65 = r.value.age;
      A.tcpa = true;
      A.consent_timestamp = new Date().toISOString();
      A.packetKind = "binding";
      return "queue_packet";
    },
    escalate: async function () {
      await say("That's one for Binh personally. I'm looping him in now with everything we've covered, so you won't have to repeat yourself. He can join this same chat. I'm not leaving, and nothing binding goes out.");
      A.packetKind = "escalation";
      return "queue_packet";
    },
    queue_packet: async function () {
      var packet = buildPacket();
      var res = window.approvalApi ? await approvalApi({ packet: packet }) : { id: "" };
      A.packetId = res.id;
      A.decision = null;
      await postLead(A.packetKind === "escalation" ? "escalation_pending" : "pending_binh_review");
      if (A.packetKind === "escalation") {
        await say("Your notes are in Binh's queue. Your licensed advisor Binh can join this chat. I'll stay with you. " + reviewWindowNote());
        return "takeover";
      }
      await say("Your package is ready. Your licensed advisor Binh is giving it a final review. I'm putting the proposal, the credit application, and the agreement in front of him before anything is sent. " + reviewWindowNote() + " I'll message you here as soon as he acts. Any questions while you wait?");
      return "await_approval";
    },
    await_approval: async function () {
      while (true) {
        var jumped = takeDecision();
        if (jumped) return jumped;
        var r = await prompt({
          chips: ["What is Binh reviewing?", "What happens after he approves?", "I have a question"],
          free: true,
          placeholder: "Ask anything while you wait",
          waitPacket: A.packetId
        });
        if (!r || r.kind === "packet") continue;
        if (r.kind === "escalate" || A.forceEscalate) { A.escalateReason = "asked for Binh"; A.packetKind = "escalation"; return "takeover"; }
        var q = r.value || "";
        if (/what is binh/i.test(q)) await say("He's checking the bill notes, the preliminary illustration, the option you picked, and the wording. An offer, a credit application, and an agreement wait on his OK. I'm still your point of contact.");
        else if (/after/i.test(q)) await say("If he approves, I'll walk the disclosures and the right to cancel here before any signature step. This preview does not submit a real credit application or send a real agreement. If he edits or holds the package, I'll tell you and stay with you.");
        else if (q) {
          if (/tax/i.test(q)) await say(OB.tax);
          else if (/scam|who are you/i.test(q)) await say(OB.scam);
          else await say("I'm here. I can recap the bill, the illustration, or the four ways to pay. I can't release paperwork while his review is open.");
        }
      }
    },
    takeover: async function () {
      await say("Binh Phan, the registered salesperson, can speak in this same conversation. I'm still here.");
      while (true) {
        var jumped = takeDecision();
        if (jumped && jumped !== "takeover") return jumped;
        var p = window.HeliosQueue && HeliosQueue.get(A.packetId);
        var thread = (p && p.thread) || [];
        var seen = A.threadSeen || 0;
        if (thread.length > seen) {
          for (var i = seen; i < thread.length; i++) {
            if (thread[i].from === "advisor") await say(thread[i].text, "binh");
            A.threadSeen = i + 1;
            persist();
          }
          continue;
        }
        var r = await prompt({
          free: true,
          placeholder: "Reply to Binh or ask Helios",
          chips: ["Please recap where we are"],
          waitPacket: A.packetId,
          waitThread: true
        });
        if (!r || r.kind === "packet" || r.kind === "thread") continue;
        if (r.value && /recap/i.test(r.value)) await say("We're in the same chat. Binh has the packet. Nothing binding goes out until he approves it.");
        else if (r.value) {
          HeliosQueue.addThread(A.packetId, { from: "homeowner", text: r.value });
          await say("Binh can see that here. I'm still in the chat if you want a definition or a recap.");
        }
      }
    },
    apply_edit: async function () {
      var note = guardText((A.decision && A.decision.note) || "He asked for a revision.");
      await say("Binh reviewed the package and asked for an update before anything goes out. " + esc(note) + " This is still not an offer. Does that revision work for you?");
      var r = await prompt({ chips: ["Yes, send the update back to Binh", "I want to change something else", "Stop here"] });
      if (!r || r.value === "Stop here") return "ended";
      if (/something else/i.test(r.value)) {
        var more = await prompt({ free: true, required: true, placeholder: "What should change?" });
        A.edit_note = note + " Homeowner added: " + ((more && more.value) || "");
      } else A.edit_note = note;
      A.packetVersion = (A.packetVersion || 1) + 1;
      A.decision = null;
      A.packetKind = "binding";
      return "queue_packet";
    },
    held: async function () {
      var note = guardText((A.decision && A.decision.note) || "He needs another look before anything goes out.");
      await say("Binh is holding the package. Nothing was sent. He noted: " + esc(note) + " We can adjust it together, or stop here.");
      var r = await prompt({ chips: ["Let's adjust it", "Stop here"] });
      if (!r || r.value === "Stop here") return "ended";
      var more = await prompt({ free: true, required: true, placeholder: "What should we change?" });
      A.edit_note = "Homeowner response to the hold: " + ((more && more.value) || "");
      A.packetVersion = (A.packetVersion || 1) + 1;
      A.decision = null;
      A.packetKind = "binding";
      return "queue_packet";
    },
    release_offer: async function () {
      var steps = (A.decision && A.decision.steps) || {};
      var list = ["proposal", "credit", "esign", "submit"].filter(function (k) { return steps[k]; });
      await say("Binh approved " + (list.length ? list.join(", ") : "the review") + ". Logged at " + esc(A.decision.at || "") + ". I'll keep going in this chat. This sandbox does not email an offer or submit anything real.");
      if (steps.proposal) {
        var d = A.design || {};
        await say("<b>Approved to present, still an estimate</b><ul><li>Option: " + esc(A.option || "Not sure") + "</li><li>System: " + (d.system_kw ? esc(String(d.system_kw)) + " kW illustration" : "Not available") + "</li><li>Offset: " + (d.offset_pct != null ? esc(String(d.offset_pct)) + "% estimate" : "Not available") + "</li><li>Price: Not available in this preview. I won't invent one.</li></ul><span class='fine'>Subject to site survey and the written agreement. Not a savings promise.</span>");
      } else await say("He didn't release the proposal, so I won't present it as an offer.");
      if (steps.esign || steps.credit || steps.submit) return "disclosures";
      return "next_steps";
    },
    disclosures: async function () {
      var steps = A.decision.steps || {};
      if (!steps.esign && !steps.credit && !steps.submit) return "next_steps";
      var senior = A.age_65 === "Yes";
      await say("Before any signature step: you would receive the California Solar Energy System Disclosure Document and the CPUC Solar Consumer Protection Guide. This sandbox does not attach the real files. You can cancel, generally within 3 business days" + (senior ? ", and the window is longer when a signer is 65 or older" : "") + ". I won't rush you. A Social Security number is entered only on the secure credit form, never here.");
      var tries = 0;
      while (tries < 3) {
        var r = await prompt({ chips: ["I understand the disclosures and my right to cancel", "I have a question", "Stop before any contract"] });
        if (!r || /Stop/.test(r.value)) { await say("Stopped. Nothing was sent."); return "next_steps"; }
        if (/question/i.test(r.value)) {
          tries++;
          await say("The right to cancel is yours to use. The agreement and the two guides are what you'd read before signing. I can also ask Binh to join if you want him to walk a page with you.");
          if (tries >= 2) { A.escalateReason = "disclosure question"; }
          continue;
        }
        A.disclosures_ack = true;
        break;
      }
      if (!A.disclosures_ack) { A.escalateReason = "disclosures not acknowledged"; return "escalate"; }
      if (steps.credit) return "release_credit";
      if (steps.esign) return "release_esign";
      if (steps.submit) return "release_submit";
      return "next_steps";
    },
    release_credit: async function () {
      if (A.credit_done) return nextBinding("credit");
      await say("Next is the credit application. You would enter your own details on the secure form after this approval. I never take a Social Security number here, and I don't promise an approval.");
      var result = await creditCheckApi({ consent: true, sandbox: true, approval_id: A.packetId });
      A.credit_result = result;
      A.credit_done = true;
      persist();
      await say("Sandbox result: the credit application was <b>not</b> submitted. Status: " + esc(result.status) + ".");
      await postLead("credit_" + result.status);
      return nextBinding("credit");
    },
    release_esign: async function () {
      if (A.esign_done) return nextBinding("esign");
      if (!A.disclosures_ack) return "disclosures";
      var result = await esignApi({ approval_id: A.packetId, disclosures_acknowledged: true, packet: A.packetId });
      A.esign_result = result;
      A.esign_done = true;
      persist();
      await say("Sandbox result: no agreement was sent for signature. Status: " + esc(result.status) + ". In the live process, the envelope would include the agreement and the California disclosures, and you'd still have your right to cancel.");
      await postLead("esign_" + result.status);
      return nextBinding("esign");
    },
    release_submit: async function () {
      if (A.submit_done) return "next_steps";
      var result = await submitApi({ approval_id: A.packetId });
      A.submit_result = result;
      A.submit_done = true;
      persist();
      await say("Sandbox result: nothing was submitted in the provider's tools. Status: " + esc(result.status) + ". I don't use Binh's login. He, or a sanctioned connection, would do that step.");
      await postLead("submit_" + result.status);
      return "next_steps";
    },
    next_steps: async function () {
      var who = A.decision_makers && /spouse|Others/.test(A.decision_makers) ? "you and the other decision maker" : "you";
      await say("If you and " + (who === "you" ? "anyone else on title" : "the other decision maker") + " want to read the package together, what timing works? There's no penalty for taking the time to read.");
      var when = await prompt({ chips: ["Later today", "Tomorrow", "This weekend", "I'll read it and reply when I'm ready"] });
      A.followup = when && when.value;
      if (A.tcpa) {
        var text = await prompt({ chips: ["Yes, text me at 8 AM", "No texts"] });
        A.confirm_text = text && text.value;
        if (text && /No texts/.test(text.value)) await say("Understood. I won't line up that text. STOP still works if a message ever arrives.");
        else await say("If a confirmation text is sent at 8 AM, a reply by 9 helps. This preview doesn't actually send one.");
      }
      await say("<b>What happens after a real signature</b><ol><li>Site survey, to confirm roof, electrical gear, and shade.</li><li>Final design and permits.</li><li>Installation.</li><li>The utility's permission to operate.</li></ol><span class='fine'>Timelines vary by city and utility. Binh stays the salesperson of record. This preview did not submit a credit application, an agreement, or a provider file.</span>");
      await say("If someone you know wants the same kind of walkthrough, you're welcome to mention it. Only if you want to.");
      dock.innerHTML = '<p class="fine">' + esc(botName()) + ' is an AI assistant. Nothing binding was sent. <a href="review/">Advisor review</a></p>';
      window.dispatchEvent(new CustomEvent("closer:done"));
      return null;
    },
    ended: async function () {
      await say("Totally fair. Thanks for your time. If you ever want a plain-language read of your bill, I'm here. Nothing was submitted.");
      dock.innerHTML = '<p class="fine">Conversation paused. Nothing was submitted.</p>';
      return null;
    }
  };

  function nextBinding(after) {
    var steps = (A.decision && A.decision.steps) || {};
    var order = ["credit", "esign", "submit"];
    var idx = order.indexOf(after);
    for (var i = idx + 1; i < order.length; i++) {
      if (steps[order[i]]) return order[i] === "credit" ? "release_credit" : order[i] === "esign" ? "release_esign" : "release_submit";
    }
    return "next_steps";
  }
  function takeDecision() {
    if (!window.HeliosQueue || !A.packetId) return null;
    var p = HeliosQueue.get(A.packetId);
    if (!p || !p.decision || p.decision.consumed) return null;
    HeliosQueue.markConsumed(A.packetId);
    A.decision = p.decision;
    persist();
    if (p.decision.action === "approve") return "release_offer";
    if (p.decision.action === "edit") return "apply_edit";
    if (p.decision.action === "decline") return "held";
    if (p.decision.action === "takeover") return "takeover";
    return null;
  }
  async function routeObjection(v) {
    var id = "think";
    if (/quote/i.test(v)) id = "quotes";
    else if (/sell/i.test(v)) id = "sell";
    else if (/cost|expensive/i.test(v)) id = "cost";
    else if (/wait/i.test(v)) id = "wait";
    else if (/credit/i.test(v)) id = "credit";
    else if (/roof/i.test(v)) id = "roof";
    else if (/spouse|partner/i.test(v)) id = "spouse";
    else if (/scam/i.test(v)) id = "scam";
    else if (/not interested/i.test(v)) id = "no";
    var next = await handleObjection(id);
    if (next === "commit_ready") {
      await say("Whenever you're ready, I can prepare the package for Binh's review. Nothing is sent until he approves it.");
      var again = await prompt({ chips: ["Yes, prepare my package", "Pick this up later"] });
      if (again && /Yes/.test(again.value || "")) return "details";
      return "ended";
    }
    return next;
  }

  async function run(state) {
    var blockedNext = { release_offer: 1, release_credit: 1, release_esign: 1, release_submit: 1, disclosures: 1, queue_packet: 1 };
    while (state && flow[state]) {
      if (A.forceEscalate && state !== "escalate" && state !== "queue_packet" && state !== "takeover" && state !== "await_approval") {
        A.forceEscalate = false;
        A.escalateReason = A.escalateReason || "asked for Binh";
        state = "escalate";
      }
      A._state = state;
      persist();
      try {
        var llm = await askLLM({ state: state, answers: A, history: history, routing: true });
        if (llm && llm.say) await say(esc(String(llm.say)));
        if (llm && llm.next && flow[llm.next] && !blockedNext[llm.next]) state = llm.next;
        state = await flow[state]();
      }
      catch (err) {
        console.error(err);
        await say("I hit a glitch. Your place in the chat is saved in this browser. Refresh and we'll pick up this step. Nothing was submitted.");
        return;
      }
    }
    A._state = "done";
    persist();
  }

  function paintHistory(items) {
    items.forEach(function (h) {
      var el = document.createElement("div");
      el.className = "msg " + (h.role === "user" ? "me" : h.role === "advisor" ? "binh" : "bot");
      el.textContent = h.text;
      chat.appendChild(el);
    });
  }

  function start(force) {
    if (started && !force) return;
    started = true;
    var begin = document.getElementById("begin");
    var begin2 = document.getElementById("beginDock");
    if (begin) begin.textContent = "Conversation open";
    if (begin2) begin2.hidden = true;
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("se_v4_session") || "null"); } catch (e) {}
    if (saved && saved.A && saved.A._state && saved.A._state !== "disclosure" && saved.A._state !== "done" && !force) {
      A = saved.A;
      A.setter_claims = A.setter_claims || [];
      A.objections = A.objections || [];
      history = saved.history || [];
      chat.innerHTML = "";
      paintHistory(history);
      run(saved.A._state);
      return;
    }
    if (force) {
      try { sessionStorage.removeItem("se_v4_session"); } catch (e) {}
      history = [];
      A = { setter_claims: [], objections: [], packetVersion: 1 };
      chat.innerHTML = "";
    }
    run("disclosure");
  }

  window.HeliosCloser = {
    bind: function () {
      chat = document.getElementById("chat");
      dock = document.getElementById("dock");
      live = document.getElementById("live");
      var launch = function () {
        var bay = document.getElementById("bay");
        if (bay) bay.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
        start(false);
      };
      var begin = document.getElementById("begin");
      var begin2 = document.getElementById("beginDock");
      if (begin) begin.addEventListener("click", launch);
      if (begin2) begin2.addEventListener("click", launch);
      var join = document.getElementById("askBinh");
      if (join) join.addEventListener("click", function () {
        A.escalateReason = "asked for Binh";
        A.forceEscalate = true;
        if (!started) launch();
      });
      var reset = document.getElementById("startOver");
      if (reset) reset.addEventListener("click", function () { start(true); });
      try {
        var saved = JSON.parse(sessionStorage.getItem("se_v4_session") || "null");
        if (saved && saved.A && saved.A._state && saved.A._state !== "done" && begin) begin.textContent = "Resume conversation";
      } catch (e) {}
    }
  };
})();
