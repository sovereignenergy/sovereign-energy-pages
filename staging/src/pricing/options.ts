import { NON_BINDING_DISCLAIMER } from "../compliance/notices.js";
import type { DesignResult } from "../design/sizeSystem.js";

export interface PriceOption {
  key: string;
  k: string;
  label: string;
  summary: string;
  d: string;
  indicative: string;
  p: string;
  not_a_quote: true;
}

export interface PricingResult {
  ok: true;
  mock: false;
  preliminary: true;
  binding: false;
  disclaimer: string;
  system_kw: number | null;
  options: PriceOption[];
  notes: string[];
}

const WAYS: Array<{ key: string; summary: string }> = [
  { key: "Lease", summary: "A company owns the system. You pay a monthly amount to use it. Terms are set in the final proposal." },
  { key: "PPA", summary: "A company owns the system. You pay for the power it produces, per kWh. The rate is set in the final proposal." },
  { key: "Loan", summary: "You own the system and repay a lender over time. The payment is set by the lender in the final proposal." },
  { key: "Cash", summary: "You own the system and pay upfront. The amount is set in the final proposal." },
];

export function priceDesign(design: Partial<DesignResult> | null | undefined): PricingResult {
  const systemKw = typeof design?.system_kw === "number" ? design.system_kw : null;
  const sizeNote = systemKw
    ? `For the preliminary ${systemKw} kW sizing only.`
    : "No system size was available, so these are the payment types only.";
  const options: PriceOption[] = WAYS.map((way) => {
    const indicative = `Preliminary — not a quote. ${sizeNote}`;
    return {
      key: way.key,
      k: way.key,
      label: way.key,
      summary: way.summary,
      d: way.summary,
      indicative,
      p: indicative,
      not_a_quote: true,
    };
  });
  return {
    ok: true,
    mock: false,
    preliminary: true,
    binding: false,
    disclaimer: NON_BINDING_DISCLAIMER,
    system_kw: systemKw,
    options,
    notes: [
      "No savings are guaranteed.",
      "This is not tax advice.",
      "Nothing here is a contract.",
      "Listed in no particular order.",
      "Binh prepares the real proposal after the design is verified.",
    ],
  };
}
