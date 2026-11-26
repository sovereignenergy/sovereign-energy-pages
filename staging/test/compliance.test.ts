import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyComplianceFilter, isCustomerSafe } from "../src/compliance/filter.js";
import { CALIFORNIA_AI_DISCLOSURE, SAFE_FALLBACK, TCPA_AI_VOICE_NOTICE } from "../src/compliance/notices.js";
import { ERIC_SYSTEM_PROMPT } from "../src/compliance/prompt.js";

const BRAND = /sun[\s-]*run/i;

describe("system prompt", () => {
  it("states the Eric rules that the output filter also enforces", () => {
    assert.match(ERIC_SYSTEM_PROMPT, /You are Eric/);
    assert.match(ERIC_SYSTEM_PROMPT, /No savings promises/i);
    assert.match(ERIC_SYSTEM_PROMPT, /federal tax credit/i);
    assert.match(ERIC_SYSTEM_PROMPT, /\bITC\b/);
    assert.match(ERIC_SYSTEM_PROMPT, BRAND);
    assert.match(ERIC_SYSTEM_PROMPT, /Nothing you say is binding/);
    assert.match(ERIC_SYSTEM_PROMPT, /Binh/);
    assert.match(ERIC_SYSTEM_PROMPT, /TCPA AI-voice consent notice/);
    assert.match(ERIC_SYSTEM_PROMPT, /California AI disclosure/);
    assert.ok(ERIC_SYSTEM_PROMPT.includes(TCPA_AI_VOICE_NOTICE));
    assert.ok(ERIC_SYSTEM_PROMPT.includes(CALIFORNIA_AI_DISCLOSURE));
  });
});

describe("output filter", () => {
  it("keeps a compliant reply", () => {
    const result = applyComplianceFilter(
      "I'm Eric, an AI assistant working with Binh Phan, not a human. I can't promise savings or a lower bill, and I don't give tax advice. This is not a binding offer.",
    );
    assert.equal(result.blocked, false);
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);
    assert.match(result.say, /can't promise savings/);
    assert.equal(isCustomerSafe(result.say), true);
  });

  it("blocks a savings promise", () => {
    const result = applyComplianceFilter("You will save $180 a month and cut your bill in half.");
    assert.equal(result.blocked, true);
    assert.equal(result.passed, true);
    assert.ok(result.violations.some((item) => item.code === "savings_promise" && item.blocked));
    assert.doesNotMatch(result.say, /you will save/i);
    assert.doesNotMatch(result.say, /cut your bill/i);
    assert.equal(result.say, SAFE_FALLBACK);
  });

  it("blocks tax-credit claims", () => {
    const result = applyComplianceFilter("You qualify for the 30% federal tax credit, also called the ITC.");
    assert.ok(result.violations.some((item) => item.code === "tax_credit"));
    assert.doesNotMatch(result.say, /tax credit/i);
    assert.doesNotMatch(result.say, /\bITC\b/);
    assert.doesNotMatch(result.say, /30%/);
    assert.equal(isCustomerSafe(result.say), true);
  });

  it("blocks the prohibited installer brand", () => {
    const result = applyComplianceFilter("Sunrun will install this next week, and Sun-run guarantees the work.");
    assert.ok(result.violations.some((item) => item.code === "sunrun"));
    assert.doesNotMatch(result.say, BRAND);
  });

  it("blocks a sentence that mixes a promise with a disclaimer", () => {
    const result = applyComplianceFilter("You will save $100 and no savings are guaranteed.");
    assert.equal(result.blocked, true);
    assert.doesNotMatch(result.say, /you will save/i);
  });

  it("strips every prohibited claim and keeps the safe sentence", () => {
    const result = applyComplianceFilter(
      "You will save $180 a month. Sunrun guarantees the 30% federal tax credit. Your credit is approved and the contract was sent. I can call you tonight to walk through it.",
    );
    const codes = result.violations.map((item) => item.code);
    assert.ok(codes.includes("savings_promise"));
    assert.ok(codes.includes("tax_credit"));
    assert.ok(codes.includes("sunrun"));
    assert.ok(codes.includes("binding_credit_or_esign"));
    assert.equal(result.blocked, true);
    assert.equal(result.passed, true);
    assert.match(result.say, /call you tonight/);
    assert.match(result.say, /Consent is not a condition of purchase/);
    assert.match(result.say, /California law requires this disclosure/);
    assert.match(result.say, /AI-generated or prerecorded voices/);
    assert.ok(result.disclosures_applied.includes("tcpa_ai_voice"));
    assert.ok(result.disclosures_applied.includes("california_ai"));
    assert.doesNotMatch(result.say, BRAND);
    assert.doesNotMatch(result.say, /tax credit/i);
    assert.doesNotMatch(result.say, /you will save/i);
    assert.doesNotMatch(result.say, /credit is approved/i);
    assert.doesNotMatch(result.say, /contract was sent/i);
  });

  it("adds TCPA and California disclosures when a call is mentioned", () => {
    const result = applyComplianceFilter("Binh can call you tomorrow to review the preliminary design.");
    assert.equal(result.blocked, false);
    assert.equal(result.passed, true);
    assert.match(result.say, /call you tomorrow/);
    assert.match(result.say, /AI-generated or prerecorded voices/);
    assert.match(result.say, /not a human/);
    assert.match(result.say, /California law requires this disclosure/);
  });

  it("does not add call disclosures to a reply that never mentions a call", () => {
    const result = applyComplianceFilter("Binh reviews the design with you. Nothing here is a quote or a contract.");
    assert.equal(result.disclosures_applied.length, 0);
    assert.doesNotMatch(result.say, /prerecorded voices/);
  });

  it("treats the standard notices themselves as customer-safe", () => {
    assert.equal(isCustomerSafe(SAFE_FALLBACK), true);
    assert.equal(isCustomerSafe(`${SAFE_FALLBACK} ${TCPA_AI_VOICE_NOTICE} ${CALIFORNIA_AI_DISCLOSURE}`), true);
    assert.doesNotMatch(TCPA_AI_VOICE_NOTICE, BRAND);
    assert.doesNotMatch(CALIFORNIA_AI_DISCLOSURE, /tax credit/i);
  });
});
