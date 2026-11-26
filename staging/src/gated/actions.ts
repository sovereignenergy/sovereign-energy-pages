export interface GateInput {
  consent?: unknown;
  binh_approved?: unknown;
  approver?: unknown;
  [key: string]: unknown;
}

export interface GateResult {
  ok: boolean;
  mock: true;
  ran: false;
  sent: false;
  status: string;
  binh_approved: boolean;
  binding: false;
  reason: string;
}

function blob(input: GateInput): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

export function sensitiveIdentifier(input: GateInput): string | null {
  const text = blob(input);
  if (/\b(ssn|social security)\b/i.test(text) || /\b\d{3}-\d{2}-\d{4}\b/.test(text)) return "ssn_not_accepted";
  return null;
}

function approved(input: GateInput): boolean {
  return input.binh_approved === true && String(input.approver || "").trim().toLowerCase() === "binh";
}

export function stageCreditCheck(input: GateInput): GateResult | { error: string } {
  const sensitive = sensitiveIdentifier(input);
  if (sensitive) return { error: sensitive };
  if (!approved(input)) {
    return {
      ok: true,
      mock: true,
      ran: false,
      sent: false,
      status: "blocked_pending_binh_approval",
      binh_approved: false,
      binding: false,
      reason: "Credit checks stay off until Binh approves the handoff. This staging endpoint never pulls credit.",
    };
  }
  return {
    ok: true,
    mock: true,
    ran: false,
    sent: false,
    status: "approval_recorded_not_executed",
    binh_approved: true,
    binding: false,
    reason: "Binh's approval flag was recorded. No credit inquiry was performed.",
  };
}

export function stageEsign(input: GateInput): GateResult | { error: string } {
  const sensitive = sensitiveIdentifier(input);
  if (sensitive) return { error: sensitive };
  if (!approved(input)) {
    return {
      ok: true,
      mock: true,
      ran: false,
      sent: false,
      status: "blocked_pending_binh_approval",
      binh_approved: false,
      binding: false,
      reason: "E-sign stays off until Binh approves the handoff. This staging endpoint never sends documents.",
    };
  }
  return {
    ok: true,
    mock: true,
    ran: false,
    sent: false,
    status: "approval_recorded_not_sent",
    binh_approved: true,
    binding: false,
    reason: "Binh's approval flag was recorded. No envelope was created and nothing was sent.",
  };
}
