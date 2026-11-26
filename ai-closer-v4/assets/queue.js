/* Pending-approval queue. Local stand-in for Binh's review endpoint until a secured one exists. */
(function () {
  "use strict";
  var KEY = "se_v4_queue";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { console.warn("[helios] queue save failed", e); }
  }
  function uid() {
    return "pkg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  var Q = window.HeliosQueue = {
    list: function () { return load(); },
    get: function (id) {
      var list = load();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    enqueue: function (packet) {
      var list = load();
      packet.id = packet.id || uid();
      packet.status = "pending";
      packet.created_at = packet.created_at || new Date().toISOString();
      packet.decision = null;
      packet.thread = packet.thread || [];
      packet.log = packet.log || [];
      list.unshift(packet);
      save(list.slice(0, 40));
      return packet.id;
    },
    update: function (id, fn) {
      var list = load();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          fn(list[i]);
          save(list);
          return list[i];
        }
      }
      return null;
    },
    decide: function (id, decision) {
      decision.at = decision.at || new Date().toISOString();
      decision.by = decision.by || "Binh Phan";
      decision.consumed = false;
      return Q.update(id, function (p) {
        p.decision = decision;
        p.status = decision.action;
        p.log.push({
          approver: decision.by,
          time: decision.at,
          decision: decision.action,
          note: decision.note || "",
          steps: decision.steps || null
        });
        if (decision.action === "takeover" && decision.note) {
          p.thread.push({ from: "advisor", text: decision.note, at: decision.at });
        }
      });
    },
    addThread: function (id, msg) {
      msg.at = msg.at || new Date().toISOString();
      return Q.update(id, function (p) { p.thread.push(msg); });
    },
    markConsumed: function (id) {
      return Q.update(id, function (p) { if (p.decision) p.decision.consumed = true; });
    }
  };

  /**
   * Approval endpoint stub.
   * Replace the body with a POST to a secured advisor service. Do not call provider tools from the browser.
   * request.packet  -> queue a packet, returns {mock, status:"pending", id}
   * request.id + request.decision -> approve | edit | decline | takeover
   * request.id alone -> read the packet
   */
  async function approvalApi(request) {
    if (!request) return { mock: true, status: "idle" };
    if (request.packet) {
      var id = Q.enqueue(request.packet);
      return { mock: true, status: "pending", id: id };
    }
    if (request.id && request.decision) {
      var p = Q.decide(request.id, request.decision);
      return { mock: true, status: p ? p.status : "missing", id: request.id };
    }
    if (request.id) return { mock: true, status: "ok", packet: Q.get(request.id) };
    return { mock: true, status: "bad_request" };
  }
  window.approvalApi = approvalApi;
})();
