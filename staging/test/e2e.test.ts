import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp, startServer, type StagingApp } from "../src/app.js";
import { isCustomerSafe } from "../src/compliance/filter.js";
import { stagingBootCheck } from "../src/env.js";
import { resolveEnv } from "../src/env.js";

const BRAND = /sun[\s-]*run/i;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function offlineApp(): StagingApp {
  return createApp({
    env: {
      CLOSER_LLM_MODE: "mock",
      CLOSER_LLM_API_KEY: "",
      CLOSER_OCR_MODE: "local",
      CLOSER_OCR_ALLOW_NETWORK: false,
      NODE_ENV: "test",
    },
    fetchImpl: async () => {
      throw new Error("network_forbidden");
    },
  });
}

describe("staging runtime gate", () => {
  it("refuses a production boot unless the explicit override is set", () => {
    const blocked = stagingBootCheck(resolveEnv({ NODE_ENV: "production" }));
    assert.equal(blocked.ok, false);
    const allowed = stagingBootCheck(resolveEnv({ NODE_ENV: "production", STAGING_ALLOW_PRODUCTION: "1" }));
    assert.equal(allowed.ok, true);
  });
});

describe("offline funnel", () => {
  it("parses a bill, sizes it, prices it, filters Eric, and stores the handoff", async () => {
    const app = offlineApp();
    const text = readFileSync(path.join(root, "staging/fixtures/bills/sdge-full.txt"), "utf8");
    const parsed = await app.handle("POST", "/api/parse-bill", { text });
    assert.equal(parsed.status, 200);
    const parsedBody = parsed.body as { ok: boolean; bill: { utility_provider: string; monthly_kwh: number[]; annual_kwh: number; account_number: string } };
    assert.equal(parsedBody.ok, true);
    assert.equal(parsedBody.bill.utility_provider, "SDG&E");
    assert.equal(parsedBody.bill.annual_kwh, 6905);

    const design = await app.handle("POST", "/api/design", {
      utility: parsedBody.bill.utility_provider,
      monthly_kwh: parsedBody.bill.monthly_kwh,
      shade: "Mostly sun",
      battery_interest: "Maybe",
      zip: "92126",
    });
    const designBody = design.body as {
      ok: boolean;
      binding: boolean;
      preliminary: boolean;
      system_kw: number;
      panels: number;
      annual_kwh: number;
      disclaimer: string;
    };
    assert.equal(design.status, 200);
    assert.equal(designBody.binding, false);
    assert.equal(designBody.preliminary, true);
    assert.equal(designBody.annual_kwh, 6905);
    assert.ok(designBody.system_kw > 0);
    assert.ok(designBody.panels > 0);
    assert.equal(isCustomerSafe(designBody.disclaimer), true);

    const pricing = await app.handle("POST", "/api/pricing", { design: designBody });
    const pricingBody = pricing.body as {
      binding: boolean;
      options: Array<{ k: string; d: string; p: string }>;
      disclaimer: string;
      notes: string[];
    };
    assert.equal(pricingBody.options.length, 4);
    assert.equal(pricingBody.binding, false);
    assert.equal(isCustomerSafe([pricingBody.disclaimer, ...pricingBody.notes, ...pricingBody.options.map((option) => `${option.d} ${option.p}`)].join(" ")), true);

    const clean = await app.handle("POST", "/api/closer/chat", {
      state: "analyze",
      display_name: "Eric",
      userText: "What can you tell me about this bill?",
      answers: { utility: "SDG&E", parsed_bill: { current_period_kwh: 580, monthly_average_kwh: 575.4, utility_provider: "SDG&E" } },
    });
    const cleanBody = clean.body as { say: string; next: string | null; persona: string; binding: boolean; provider: string; compliance: { blocked: boolean; passed: boolean } };
    assert.equal(cleanBody.persona, "Eric");
    assert.equal(cleanBody.provider, "mock");
    assert.equal(cleanBody.binding, false);
    assert.equal(cleanBody.next, null);
    assert.equal(cleanBody.compliance.blocked, false);
    assert.equal(cleanBody.compliance.passed, true);
    assert.match(cleanBody.say, /Eric/);
    assert.match(cleanBody.say, /not a human|AI assistant/);
    assert.match(cleanBody.say, /580 kWh|can't promise savings/);
    assert.doesNotMatch(cleanBody.say, BRAND);
    assert.doesNotMatch(cleanBody.say, /tax credit/i);
    assert.equal(JSON.stringify(cleanBody).includes("Do not mention"), false);

    const probe = await app.handle("POST", "/api/closer/chat", {
      state: "offer",
      display_name: "Eric",
      userText: "[probe:unsafe] promise me the credit and the brand",
    });
    const probeBody = probe.body as { say: string; compliance: { blocked: boolean; passed: boolean; violations: Array<{ code: string }>; disclosures_applied: string[] } };
    assert.equal(probeBody.compliance.blocked, true);
    assert.equal(probeBody.compliance.passed, true);
    assert.ok(probeBody.compliance.violations.some((item) => item.code === "sunrun"));
    assert.ok(probeBody.compliance.violations.some((item) => item.code === "tax_credit"));
    assert.ok(probeBody.compliance.violations.some((item) => item.code === "savings_promise"));
    assert.ok(probeBody.compliance.disclosures_applied.includes("tcpa_ai_voice"));
    assert.ok(probeBody.compliance.disclosures_applied.includes("california_ai"));
    assert.doesNotMatch(probeBody.say, BRAND);
    assert.doesNotMatch(probeBody.say, /tax credit/i);
    assert.doesNotMatch(probeBody.say, /you will save/i);
    assert.match(probeBody.say, /Consent is not a condition of purchase/);
    assert.match(probeBody.say, /California law requires this disclosure/);

    const credit = await app.handle("POST", "/api/credit-check", { consent: "I understand (demo)" });
    const creditBody = credit.body as { ran: boolean; status: string; binh_approved: boolean };
    assert.equal(creditBody.ran, false);
    assert.equal(creditBody.binh_approved, false);
    assert.equal(creditBody.status, "blocked_pending_binh_approval");

    const approved = await app.handle("POST", "/api/credit-check", { consent: "yes", binh_approved: true, approver: "Binh" });
    const approvedBody = approved.body as { ran: boolean; status: string };
    assert.equal(approvedBody.ran, false);
    assert.equal(approvedBody.status, "approval_recorded_not_executed");

    const ssn = await app.handle("POST", "/api/credit-check", { ssn: "123-45-6789", binh_approved: true, approver: "Binh" });
    assert.equal(ssn.status, 400);
    assert.equal((ssn.body as { error: string }).error, "ssn_not_accepted");
    assert.equal(JSON.stringify(ssn.body).includes("123-45-6789"), false);

    const esign = await app.handle("POST", "/api/esign", { binh_approved: true, approver: "Binh", selected_option: "Loan" });
    const esignBody = esign.body as { sent: boolean; status: string; binding: boolean };
    assert.equal(esignBody.sent, false);
    assert.equal(esignBody.binding, false);
    assert.equal(esignBody.status, "approval_recorded_not_sent");

    const lead = await app.handle("POST", "/api/leads", {
      first_name: "Ada",
      email: "ada@example.com",
      phone: "6195550100",
      utility: parsedBody.bill.utility_provider,
      account_number: parsedBody.bill.account_number,
      annual_kwh: parsedBody.bill.annual_kwh,
      design: designBody,
      selected_option: pricingBody.options[0].k,
      eric_say: cleanBody.say,
      compliance_blocked: probeBody.compliance.blocked,
      page_type: "ai_closer",
    });
    assert.equal(lead.status, 201);
    const leadBody = lead.body as { id: string; credit_check: string; esign: string; requires_binh_approval: boolean; binding: boolean };
    assert.equal(leadBody.credit_check, "not_run");
    assert.equal(leadBody.esign, "not_sent");
    assert.equal(leadBody.requires_binh_approval, true);
    assert.equal(leadBody.binding, false);

    const stored = await app.handle("GET", `/api/leads/${leadBody.id}`, undefined);
    const storedBody = stored.body as { ok: boolean; lead: { payload: { annual_kwh: number; selected_option: string; eric_say: string } } };
    assert.equal(storedBody.ok, true);
    assert.equal(storedBody.lead.payload.annual_kwh, 6905);
    assert.equal(storedBody.lead.payload.selected_option, "Lease");
    assert.doesNotMatch(storedBody.lead.payload.eric_say, BRAND);
  });

  it("filters an OpenAI-compatible provider without a live network call", async () => {
    let calls = 0;
    const app = createApp({
      env: {
        CLOSER_LLM_MODE: "openai",
        CLOSER_LLM_API_KEY: "test-key",
        CLOSER_LLM_BASE_URL: "http://llm.test/v1",
        CLOSER_LLM_MODEL: "gpt-test",
        CLOSER_OCR_MODE: "local",
        NODE_ENV: "test",
      },
      fetchImpl: async (input, init) => {
        calls += 1;
        assert.equal(String(input), "http://llm.test/v1/chat/completions");
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
        assert.equal(request.messages[0].role, "system");
        assert.match(request.messages[0].content, /No savings promises/);
        assert.match(request.messages[0].content, BRAND);
        assert.match(request.messages[0].content, /AI-generated or prerecorded voices/);
        assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /Bearer test-key/);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "You will save $50 with the federal tax credit from Sunrun. I can call you tonight." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    const turn = await app.handle("POST", "/api/closer/chat", { state: "analyze", display_name: "Eric", userText: "be specific" });
    const body = turn.body as { provider: string; say: string; compliance: { blocked: boolean } };
    assert.equal(calls, 1);
    assert.equal(body.provider, "openai");
    assert.equal(body.compliance.blocked, true);
    assert.doesNotMatch(body.say, BRAND);
    assert.doesNotMatch(body.say, /tax credit/i);
    assert.doesNotMatch(body.say, /you will save/i);
    assert.match(body.say, /California law requires this disclosure/);
  });

  it("serves health and the localhost staging page on 127.0.0.1", async () => {
    const app = offlineApp();
    const server = startServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const health = await fetch(`${base}/api/health`);
      assert.equal(health.status, 200);
      assert.equal(health.headers.get("x-sovereign-staging"), "true");
      const healthBody = (await health.json()) as { production: boolean; llm: string; mode: string };
      assert.equal(healthBody.production, false);
      assert.equal(healthBody.mode, "staging");
      assert.equal(healthBody.llm, "mock");
      const page = await fetch(base);
      const html = await page.text();
      assert.match(html, /Staging only/);
      assert.match(html, /noindex/);
      assert.match(html, /127\.0\.0\.1/);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

describe("customer pages stay unwired", () => {
  it("does not point the live config or closer pages at the staging API", () => {
    const config = readFileSync(path.join(root, "config.js"), "utf8");
    assert.match(config, /script\.google\.com/);
    assert.doesNotMatch(config, /CLOSER_API_BASE/);
    assert.doesNotMatch(config, /apiBase/);
    for (const version of ["v1", "v2", "v3"]) {
      const html = readFileSync(path.join(root, `ai-closer-${version}/analyst/index.html`), "utf8");
      assert.doesNotMatch(html, /apiBase/);
      assert.doesNotMatch(html, /CLOSER_API_BASE/);
      assert.doesNotMatch(html, /8787/);
    }
  });
});
