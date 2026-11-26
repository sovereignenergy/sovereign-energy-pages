import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(path.join(root, "ai-closer-assets/closer.js"), "utf8");

interface StagingApi {
  askLLM(context: { state?: string; routing?: boolean; answers?: Record<string, unknown>; history?: unknown[] }): Promise<{ say?: string; next?: string } | null>;
  designApi(input: { kwh?: number }): Promise<{ mock?: boolean; system_kw?: number; preliminary?: boolean }>;
  pricingApi(design: unknown): Promise<{ mock?: boolean; options: Array<{ k: string }>; preliminary?: boolean }>;
  creditCheckApi(consent: string): Promise<{ status: string; ran?: boolean }>;
  esignApi(packet: unknown): Promise<{ status: string; sent?: boolean }>;
}

function load(options: { closer?: Record<string, unknown>; fetchImpl?: typeof fetch }): { api: StagingApi; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = options.fetchImpl || (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(input), body });
    const url = String(input);
    if (url.endsWith("/api/closer/chat")) {
      return new Response(JSON.stringify({ say: "I'm Eric, an AI assistant, not a human. I can't promise savings or a lower bill.", next: "credit" }), { status: 200 });
    }
    if (url.endsWith("/api/design")) {
      return new Response(JSON.stringify({ ok: true, preliminary: true, binding: false, system_kw: 4.2, panels: 11, annual_kwh: 6905, estimated_offset_pct: 90, disclaimer: "Preliminary, non-binding estimate." }), { status: 200 });
    }
    if (url.endsWith("/api/pricing")) {
      return new Response(JSON.stringify({ ok: true, preliminary: true, disclaimer: "Not a quote.", options: [{ k: "Cash", d: "You own it.", p: "Preliminary — not a quote." }] }), { status: 200 });
    }
    if (url.endsWith("/api/credit-check")) {
      return new Response(JSON.stringify({ status: "blocked_pending_binh_approval", ran: false }), { status: 200 });
    }
    if (url.endsWith("/api/esign")) {
      return new Response(JSON.stringify({ status: "blocked_pending_binh_approval", sent: false }), { status: 200 });
    }
    return new Response("no", { status: 404 });
  });
  const sandbox: Record<string, unknown> = {
    console,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.document = { getElementById: () => null, addEventListener: () => undefined };
  sandbox.addEventListener = () => undefined;
  sandbox.SE = { get: () => ({}), post: async () => true };
  sandbox.AV = {};
  sandbox.CLOSER = options.closer || {};
  sandbox.LP_CONFIG = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { api: sandbox.SE_CLOSER_STAGING as StagingApi, calls };
}

describe("closer.js staging gate", () => {
  it("keeps the original demo functions when no base URL is configured", async () => {
    const { api, calls } = load({});
    assert.equal(await api.askLLM({ state: "analyze", routing: false }), null);
    assert.equal(await api.askLLM({ state: "greet", routing: true }), null);
    const design = await api.designApi({ kwh: 500 });
    assert.equal(design.mock, true);
    assert.equal(design.system_kw, 4);
    const pricing = await api.pricingApi(design);
    assert.equal(pricing.mock, true);
    assert.equal(pricing.options.length, 4);
    const credit = await api.creditCheckApi("I understand (demo)");
    assert.equal(credit.status, "demo_not_run");
    assert.equal(credit.ran, undefined);
    const signed = await api.esignApi({});
    assert.equal(signed.status, "demo_not_sent");
    assert.equal(signed.sent, undefined);
    assert.equal(calls.length, 0);
  });

  it("talks to the staging API only when a base URL is set, and ignores model routing by default", async () => {
    const { api, calls } = load({ closer: { apiBase: "http://127.0.0.1:8787/", name: "Eric" } });
    assert.equal(await api.askLLM({ state: "greet", routing: true }), null);
    assert.equal(calls.length, 0);

    const turn = await api.askLLM({
      state: "analyze",
      routing: false,
      answers: { utility: "SDG&E", bill_file_obj: { name: "bill.pdf" }, nested: { base64: "secret" } },
      history: [{ role: "user", text: "hello" }],
    });
    assert.equal(turn?.say?.includes("Eric"), true);
    assert.equal(turn?.next, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8787/api/closer/chat");
    const sent = calls[0].body as { display_name: string; answers: Record<string, unknown> };
    assert.equal(sent.display_name, "Eric");
    assert.equal(sent.answers.utility, "SDG&E");
    assert.equal("bill_file_obj" in sent.answers, false);
    assert.equal("nested" in sent.answers, false);

    const design = await api.designApi({ kwh: 500 });
    assert.equal(design.preliminary, true);
    assert.equal(design.mock, undefined);
    assert.equal(design.system_kw, 4.2);

    const pricing = await api.pricingApi(design);
    assert.equal(pricing.preliminary, true);
    assert.equal(pricing.options[0].k, "Cash");

    const credit = await api.creditCheckApi("Skip");
    assert.equal(credit.status, "blocked_pending_binh_approval");
    assert.equal(credit.ran, false);
    const creditBody = calls.find((call) => call.url.endsWith("/api/credit-check"))?.body as { binh_approved: boolean; approver: string };
    assert.equal(creditBody.binh_approved, false);
    assert.equal(creditBody.approver, "");

    const signed = await api.esignApi({ answers: { selected_option: "Cash" } });
    assert.equal(signed.sent, false);
    assert.equal(calls.filter((call) => call.url.startsWith("http://127.0.0.1:8787")).length, 5);
  });

  it("falls back to the local demo if the staging API is down", async () => {
    const { api } = load({
      closer: { apiBase: "http://127.0.0.1:8787" },
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    const design = await api.designApi({ kwh: 0 });
    assert.equal(design.mock, true);
    assert.equal(design.system_kw, null);
    assert.equal(await api.askLLM({ state: "analyze" }), null);
  });

  it("does not hard-code a staging host into the shared closer script", () => {
    assert.match(source, /if\(!stagingBase\(\)\)return null/);
    assert.doesNotMatch(source, /8787/);
    assert.doesNotMatch(source, /api\.openai\.com/);
    assert.doesNotMatch(source, /sun[\s-]*run/i);
  });
});
