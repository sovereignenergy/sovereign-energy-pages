import { applyComplianceFilter, type ComplianceResult } from "../compliance/filter.js";
import { POLICY_VERSION } from "../compliance/notices.js";
import { systemPrompt, type ChatMessage, type LlmProvider } from "./provider.js";

export interface CloserInput {
  state?: unknown;
  answers?: unknown;
  history?: unknown;
  userText?: unknown;
  routing?: unknown;
  display_name?: unknown;
  allow_routing?: unknown;
}

export interface CloserOutput {
  ok: true;
  say: string;
  next: string | null;
  persona: "Eric";
  display_name: string;
  provider: string;
  binding: false;
  preliminary: true;
  policy_version: string;
  compliance: ComplianceResult & { policy_version: string };
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function safeName(value: unknown): string {
  const name = clip(value, 40).trim();
  if (!/^[A-Za-z][A-Za-z .'-]{0,39}$/.test(name)) return "Eric";
  if (/sun[\s-]*run/i.test(name)) return "Eric";
  return name;
}

function historyLines(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  for (const item of value.slice(-12)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role === "assistant" ? "assistant" : "user";
    const content = clip((item as { text?: unknown; content?: unknown }).text ?? (item as { content?: unknown }).content, 500);
    if (content.trim()) messages.push({ role, content });
  }
  return messages;
}

function answerFacts(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const answers = value as Record<string, unknown>;
  const parsed = answers.parsed_bill && typeof answers.parsed_bill === "object" ? (answers.parsed_bill as Record<string, unknown>) : {};
  const keys = ["utility", "monthly_bill", "kwh", "rate_plan", "zip", "motivation", "battery_interest", "shade"];
  const lines = keys.filter((key) => answers[key] != null && answers[key] !== "").map((key) => `${key}: ${clip(answers[key], 80)}`);
  if (parsed.current_period_kwh != null) lines.push(`current_period_kwh: ${clip(parsed.current_period_kwh, 20)}`);
  if (parsed.monthly_average_kwh != null) lines.push(`monthly_average_kwh: ${clip(parsed.monthly_average_kwh, 20)}`);
  if (parsed.utility_provider != null) lines.push(`utility_provider: ${clip(parsed.utility_provider, 20)}`);
  return lines.join("\n");
}

export async function closerTurn(input: CloserInput, provider: LlmProvider): Promise<CloserOutput> {
  const state = clip(input.state, 40);
  const displayName = safeName(input.display_name);
  const userText = clip(input.userText, 4000);
  const facts = answerFacts(input.answers);
  const userContent = [
    `state: ${state || "unknown"}`,
    `display_name: ${displayName}`,
    facts ? `known_facts:\n${facts}` : "",
    userText ? `prospect: ${userText}` : "prospect: (no free-text message; continue the scripted step)",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [...historyLines(input.history), { role: "user", content: userContent }];
  let raw = "";
  try {
    raw = await provider.complete({ system: systemPrompt(), messages });
  } catch {
    raw = "I hit a problem preparing that reply. Binh can take it from here. I can't promise savings or a lower bill, and I don't give tax advice. Nothing here is a quote or a contract.";
  }
  const compliance = applyComplianceFilter(raw);
  // The scripted page owns step order. allow_routing is accepted and does not change next.
  void input.allow_routing;
  void input.routing;
  return {
    ok: true,
    say: compliance.say,
    next: null,
    persona: "Eric",
    display_name: displayName,
    provider: provider.name,
    binding: false,
    preliminary: true,
    policy_version: POLICY_VERSION,
    compliance: { ...compliance, policy_version: POLICY_VERSION },
  };
}
