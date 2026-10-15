/* Binh's approval console. Decisions go through approvalApi and the Solar Leads sheet. */
(function () {
  "use strict";
  var root = document.getElementById("queue");
  var drafts = {};
  var checks = {};
  var lastRaw = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function snapshot() {
    drafts = {};
    checks = {};
    document.querySelectorAll("[data-draft]").forEach(function (el) { drafts[el.getAttribute("data-draft")] = el.value; });
    document.querySelectorAll(".packet").forEach(function (card) {
      var id = card.getAttribute("data-id");
      checks[id] = {};
      card.querySelectorAll("[data-step]").forEach(function (box) { checks[id][box.getAttribute("data-step")] = box.checked; });
    });
  }
  function qualityLine(q) {
    if (!q) return "Not available";
    return ["both decision makers: " + q.both_decision_makers, "pre-screen: " + q.prescreen, "roof: " + q.good_roof, "bill: " + q.bill_acquired, "avg bill above $180: " + q.avg_bill_above_180 + " (" + (q.avg_bill_note || "") + ")"].join(" · ");
  }
  function botName() { return (window.CLOSER_BRAND && CLOSER_BRAND.botName) || "Helios"; }
  function advisorName() { return (window.CLOSER_BRAND && CLOSER_BRAND.advisorName) || "Binh Phan"; }
  function advisorShort() { return (window.CLOSER_BRAND && CLOSER_BRAND.advisorShort) || "Binh"; }
  function transcript(list) {
    return (list || []).map(function (h) {
      var who = h.role === "user" ? "Homeowner" : h.role === "advisor" ? advisorShort() : botName();
      return who + ": " + h.text;
    }).join("\n");
  }
  function card(p) {
    var risky = p.compliance && p.compliance.risky_phrases && p.compliance.risky_phrases !== "none";
    var steps = (p.header && p.header.binding_steps) || [];
    var savedChecks = checks[p.id];
    var checked = function (id) {
      if (savedChecks && Object.prototype.hasOwnProperty.call(savedChecks, id)) return savedChecks[id] ? "checked" : "";
      return steps.indexOf(id) >= 0 ? "checked" : "";
    };
    var hypo = p.summary && p.summary.hypothetical_17;
    return '<article class="panel packet" data-id="' + esc(p.id) + '">' +
      '<header><div><h2 style="font-size:18px;margin:0">' + esc(p.summary && p.summary.title) + '</h2>' +
      '<p class="fine">' + esc(p.header && p.header.customer) + ' · ' + esc(p.header && p.header.utility) + ' · ' + esc(p.header && p.header.chosen_option) + '</p></div>' +
      '<span class="status">' + esc(p.status || "pending") + '</span></header>' +
      (p.header && p.header.escalate_reason ? '<p class="internal">Escalation: ' + esc(p.header.escalate_reason) + '. Join the same chat. ' + esc(botName()) + ' stays with the homeowner.</p>' : '') +
      '<p><b>Address.</b> ' + esc(p.header && p.header.address) + '</p>' +
      '<p><b>Appointment notes.</b> ' + esc(qualityLine(p.summary && p.summary.quality)) + '</p>' +
      '<p><b>Bill.</b> ' + esc(JSON.stringify(p.bill || {})) + '</p>' +
      '<p><b>Design shown.</b> ' + esc(typeof p.design_as_presented === "string" ? p.design_as_presented : JSON.stringify(p.design_as_presented)) + '</p>' +
      '<p><b>Differences.</b> ' + esc(p.differences) + '</p>' +
      '<p><b>Compliance.</b> ' + esc(JSON.stringify(p.compliance || {})) + '</p>' +
      '<p><b>Discovery.</b> ' + esc(JSON.stringify(p.discovery || {})) + '</p>' +
      '<p><b>Objections.</b> ' + esc((p.objections || []).join("; ") || "none") + '</p>' +
      '<p><b>Claims corrected.</b> ' + esc(JSON.stringify(p.setter_claims || [])) + '</p>' +
      '<p><b>Closer notes.</b> ' + esc(p.summary && p.summary.closer_notes) + '</p>' +
      (hypo ? '<div class="internal"><b>Internal only. Do not read this to the homeowner.</b><br>' + esc(hypo.label) + '<br>Annual kWh: ' + esc(hypo.annual_kwh) + ' · If 17% higher: ' + esc(hypo.if_17_percent_higher_kwh) + '</div>' : '') +
      '<details><summary>Transcript</summary><pre class="fine" style="white-space:pre-wrap">' + esc(transcript(p.transcript)) + '</pre></details>' +
      '<div class="thread fine" id="thread-' + esc(p.id) + '"></div>' +
      (risky ? '<p class="internal">Compliance scan found: ' + esc(p.compliance.risky_phrases) + '. Review it before approving.</p>' : '') +
      '<fieldset><legend class="fine">Binding steps to release</legend>' +
      '<label class="checkline"><input type="checkbox" data-step="proposal" ' + checked("proposal") + '> Proposal as an offer</label>' +
      '<label class="checkline"><input type="checkbox" data-step="credit" ' + checked("credit") + '> Credit application</label>' +
      '<label class="checkline"><input type="checkbox" data-step="esign" ' + checked("esign") + '> Contract / e-sign</label>' +
      '<label class="checkline"><input type="checkbox" data-step="submit" ' + checked("submit") + '> Provider submission</label></fieldset>' +
      (risky ? '<label class="checkline"><input type="checkbox" data-ack> I reviewed the compliance scan</label>' : '') +
      '<label class="l">Note for ' + esc(botName()) + ' to read back</label><textarea data-draft="' + esc(p.id) + '">' + esc(drafts[p.id] || "") + '</textarea>' +
      '<div class="actions">' +
      '<button class="btn" type="button" data-act="approve">Approve</button>' +
      '<button class="btn ghost" type="button" data-act="edit">Edit</button>' +
      '<button class="btn ghost" type="button" data-act="decline">Decline / hold</button>' +
      '<button class="btn ghost" type="button" data-act="takeover">Take over</button>' +
      '</div><p class="err" data-err></p><p class="fine" data-log></p></article>';
  }
  function threadHtml(p) {
    return (p.thread || []).map(function (m) {
      return '<p><b>' + esc(m.from) + ':</b> ' + esc(m.text) + '</p>';
    }).join("") || "<p>No messages in the thread yet.</p>";
  }
  function render() {
    var raw = "";
    try { raw = localStorage.getItem("se_v4_queue") || "[]"; } catch (e) { raw = "[]"; }
    if (raw === lastRaw && root.childElementCount) return;
    snapshot();
    lastRaw = raw;
    var focus = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-draft");
    var list = HeliosQueue.list();
    if (!list.length) {
      root.innerHTML = '<article class="panel"><h2>No packages waiting.</h2><p class="fine">When a homeowner reaches the seal, the packet shows up here.</p></article>';
      return;
    }
    root.innerHTML = list.map(card).join("");
    list.forEach(function (p) {
      var box = document.getElementById("thread-" + p.id);
      if (box) box.innerHTML = threadHtml(p);
    });
    if (focus) {
      var back = root.querySelector('[data-draft="' + focus + '"]');
      if (back) back.focus();
    }
  }
  async function postDecision(p, decision) {
    if (!window.SE) return;
    try {
      await SE.post({
        page_type: "ai_closer",
        page_slug: "ai-closer-v4",
        ai_assistant: botName(),
        demo_preview: true,
        status: decision.action === "approve" ? "approved" : decision.action,
        approval_id: p.id,
        advisor_action: decision.action,
        advisor_note: decision.note || "",
        binding_steps_approved: decision.steps ? Object.keys(decision.steps).filter(function (k) { return decision.steps[k]; }).join(",") : "",
        first_name: (p.header && p.header.customer) || "",
        address: (p.header && p.header.address) || "",
        utility: (p.header && p.header.utility) || "",
        conversation_owner: botName(),
        transcript: transcript(p.transcript).slice(0, 12000)
      });
    } catch (e) { console.error(e); }
  }
  root.addEventListener("click", async function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var cardEl = btn.closest(".packet");
    var id = cardEl.getAttribute("data-id");
    var note = (cardEl.querySelector("textarea") || {}).value || "";
    var err = cardEl.querySelector("[data-err]");
    var action = btn.getAttribute("data-act");
    if ((action === "edit" || action === "decline") && note.trim().length < 3) {
      err.textContent = "Add a note so " + botName() + " can explain it in the same chat.";
      return;
    }
    if (action === "approve" && cardEl.querySelector("[data-ack]") && !cardEl.querySelector("[data-ack]").checked) {
      err.textContent = "Review the compliance scan before approving.";
      return;
    }
    var steps = {};
    cardEl.querySelectorAll("[data-step]").forEach(function (box) { steps[box.getAttribute("data-step")] = box.checked; });
    if (action === "approve" && !Object.keys(steps).some(function (k) { return steps[k]; })) {
      err.textContent = "Choose at least one binding step, or use Edit, Decline, or Take over.";
      return;
    }
    err.textContent = "";
    btn.disabled = true;
    var decision = { action: action, note: note.trim(), by: advisorName(), steps: action === "approve" ? steps : null };
    var result = await approvalApi({ id: id, decision: decision });
    var fresh = HeliosQueue.get(id);
    await postDecision(fresh || { id: id, header: {}, transcript: [] }, decision);
    render();
    var log = root.querySelector('[data-id="' + id + '"] [data-log]');
    if (log) log.textContent = "Saved locally as " + (result.status || action) + ". The homeowner chat updates from this queue. Sheet post attempted.";
  });
  render();
  setInterval(function () {
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") {
      HeliosQueue.list().forEach(function (p) {
        var box = document.getElementById("thread-" + p.id);
        if (box) box.innerHTML = threadHtml(p);
      });
      return;
    }
    render();
  }, 1500);
  window.addEventListener("storage", render);
})();
