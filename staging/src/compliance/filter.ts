import {
  CALIFORNIA_AI_DISCLOSURE,
  SAFE_FALLBACK,
  TCPA_AI_VOICE_NOTICE,
} from "./notices.js";

export interface ComplianceViolation {
  code:
    | "savings_promise"
    | "tax_credit"
    | "sunrun"
    | "binding_credit_or_esign"
    | "missing_tcpa"
    | "missing_ca_ai";
  blocked: boolean;
}

export interface ComplianceResult {
  say: string;
  passed: boolean;
  blocked: boolean;
  violations: ComplianceViolation[];
  disclosures_applied: Array<"tcpa_ai_voice" | "california_ai">;
}

const SUNRUN = /sun[\s-]*run/i;
const TAX_CREDIT =
  /\binvestment tax credit\b|\bfederal tax credit\b|\btax credit\b|\bITC\b|30\s*%\s*(?:federal|tax|itc|incentive)/i;
const BINDING = [
  /\b(?:i(?:'ve| have)|we(?:'ve| have))\s+(?:already\s+)?(?:run|pulled|completed)\s+(?:your\s+)?credit\b/i,
  /\b(?:i|we)(?:'ll| will)\s+(?:run|pull|submit|start)\s+(?:your\s+)?credit\b/i,
  /\bcredit (?:is|was) approved\b/i,
  /\byou(?:'re| are) approved\b/i,
  /\b(?:contract|agreement) (?:was|is|has been) sent\b/i,
  /\b(?:e-?sign(?:ature)?|contract) is on its way\b/i,
  /\be-?sign(?:ature)? (?:is )?complete\b/i,
  /\b(?:i|we)(?:'ll| will| have|'ve)\s+sent\b[^.?!]{0,80}\b(contract|agreement|e-?sign|documents)\b/i,
];
const SAVINGS = [
  /\bguarantee[ds]?\s+savings\b/i,
  /\byou(?:'ll| will)\s+save\b/i,
  /\bsave (?:you )?(?:up to )?\$\s?\d/i,
  /\bsave (?:you )?(?:up to )?\d{1,3}\s*%/i,
  /\bcut your (?:electric |energy |power )?bill\b/i,
  /\b(?:reduce|lower) your (?:electric |energy |power )?bill\b/i,
  /\bbill (?:will|'ll) (?:drop|go down|decrease|be lower)\b/i,
  /\bsavings of \$?\d/i,
  /\b\d{1,3}\s*%\s+off\b/i,
  /\bguaranteed to (?:save|reduce|lower|cut)\b/i,
  /\bzero[-\s]?bill\b/i,
  /\beliminate your (?:electric |energy |power )?bill\b/i,
  /\bguarantee[ds]?\b[^.]{0,40}\b(savings|bill reduction|lower bill)\b/i,
];
const VOICE_REFERENCE =
  /\b(phone call|call you|give you a call|calling you|voice call|ai voice|automated call|prerecorded voice|on the phone|by phone|via phone)\b/i;

const TCPA_PRESENT = /AI-generated or prerecorded voices/i;
const CA_PRESENT = /California law requires this disclosure/i;

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Remove prohibited claims, then append TCPA and California AI notices
 * when the original text referenced a call or voice.
 */
export function applyComplianceFilter(raw: string): ComplianceResult {
  const original = String(raw || "");
  const violations: ComplianceViolation[] = [];
  const seen = new Set<ComplianceViolation["code"]>();
  const push = (code: ComplianceViolation["code"], blocked: boolean) => {
    if (seen.has(code)) return;
    seen.add(code);
    violations.push({ code, blocked });
  };

  const kept: string[] = [];
  for (const sentence of splitSentences(original)) {
    let drop = false;
    if (SUNRUN.test(sentence)) {
      push("sunrun", true);
      drop = true;
    }
    if (TAX_CREDIT.test(sentence)) {
      push("tax_credit", true);
      drop = true;
    }
    if (matchesAny(sentence, BINDING)) {
      push("binding_credit_or_esign", true);
      drop = true;
    }
    // A disclaimer sharing a sentence with a promise does not keep the promise.
    if (matchesAny(sentence, SAVINGS)) {
      push("savings_promise", true);
      drop = true;
    }
    if (!drop) kept.push(sentence);
  }

  const blocked = violations.some((item) => item.blocked);
  let say = kept.join(" ").trim();
  if (blocked && say.replace(/[^a-z0-9]/gi, "").length < 24) {
    say = SAFE_FALLBACK;
  }

  const disclosures: ComplianceResult["disclosures_applied"] = [];
  const voice = VOICE_REFERENCE.test(original) || VOICE_REFERENCE.test(say);
  if (voice && !TCPA_PRESENT.test(say)) {
    push("missing_tcpa", false);
    say = `${say}${say ? " " : ""}${TCPA_AI_VOICE_NOTICE}`;
    disclosures.push("tcpa_ai_voice");
  }
  if (voice && !CA_PRESENT.test(say)) {
    push("missing_ca_ai", false);
    say = `${say}${say ? " " : ""}${CALIFORNIA_AI_DISCLOSURE}`;
    disclosures.push("california_ai");
  }

  if (SUNRUN.test(say) || TAX_CREDIT.test(say) || matchesAny(say, BINDING) || savingsLeak(say)) {
    say = voice ? `${SAFE_FALLBACK} ${TCPA_AI_VOICE_NOTICE} ${CALIFORNIA_AI_DISCLOSURE}` : SAFE_FALLBACK;
  }

  const sayOut = say.trim();
  return {
    say: sayOut,
    passed: isCustomerSafe(sayOut),
    blocked,
    violations,
    disclosures_applied: disclosures,
  };
}

function savingsLeak(text: string): boolean {
  return splitSentences(text).some((sentence) => matchesAny(sentence, SAVINGS));
}

/** Final invariant for anything a customer could read. */
export function isCustomerSafe(text: string): boolean {
  if (SUNRUN.test(text) || TAX_CREDIT.test(text) || matchesAny(text, BINDING)) return false;
  return !savingsLeak(text);
}
