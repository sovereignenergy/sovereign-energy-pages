import { NON_BINDING_DISCLAIMER } from "../compliance/notices.js";
import { normalizeUtility, type UtilityProvider } from "../bill/heuristics.js";

export const YIELD_KWH_PER_KW: Record<Exclude<UtilityProvider, "unknown">, number> = {
  "SDG&E": 1550,
  SCE: 1500,
  "PG&E": 1450,
  HECO: 1650,
};
export const DEFAULT_YIELD = 1500;
export const OFFSET_TARGET = 0.9;
export const PANEL_WATTS = 400;
export const MAX_SYSTEM_KW = 20;

export interface DesignInput {
  kwh?: number | null;
  monthly_kwh?: number[] | null;
  annual_kwh?: number | null;
  utility?: string | null;
  zip?: string | null;
  shade?: string | null;
  battery_interest?: string | null;
}

export interface BatteryOption {
  included: boolean;
  indicative_kwh: number | null;
  note: string;
}

export interface DesignResult {
  ok: true;
  mock: false;
  preliminary: true;
  binding: false;
  disclaimer: string;
  utility: UtilityProvider;
  zip: string | null;
  annual_kwh: number | null;
  monthly_average_kwh: number | null;
  system_kw: number | null;
  panels: number | null;
  panel_count: number | null;
  panel_wattage: number;
  estimated_offset_pct: number | null;
  estimated_annual_production_kwh: number | null;
  battery_option: BatteryOption;
  assumptions: string[];
  warnings: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function shadeFactor(shade?: string | null): { factor: number; known: boolean } {
  const value = (shade || "").toLowerCase();
  if (value.includes("heavy")) return { factor: 0.65, known: true };
  if (value.includes("some")) return { factor: 0.85, known: true };
  if (value.includes("mostly") || value.includes("full")) return { factor: 1, known: true };
  return { factor: 0.9, known: false };
}

function positiveList(values?: number[] | null): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter((n) => typeof n === "number" && n > 0 && n <= 8000);
}

function batteryFor(interest: string | null | undefined, annual: number | null): BatteryOption {
  const text = interest || "";
  if (/^no$/i.test(text.trim())) {
    return {
      included: false,
      indicative_kwh: null,
      note: "No battery in this preliminary pass. Binh can still add one in the final design. Not a quote.",
    };
  }
  if (/yes|maybe/i.test(text)) {
    return {
      included: true,
      indicative_kwh: annual !== null && annual >= 8000 ? 13.5 : 10,
      note: "Optional battery size for discussion only. Not a design and not a promise of backup hours.",
    };
  }
  return {
    included: false,
    indicative_kwh: null,
    note: "Battery was not requested. Binh can add one if you want it reviewed.",
  };
}

export function sizeSystem(input: DesignInput): DesignResult {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const utility = normalizeUtility(input.utility);
  const yieldPerKw = utility === "unknown" ? DEFAULT_YIELD : YIELD_KWH_PER_KW[utility];
  if (utility === "unknown") warnings.push("utility_default_yield");
  const shade = shadeFactor(input.shade);
  if (!shade.known) warnings.push("shade_assumed");

  const months = positiveList(input.monthly_kwh);
  let annual: number | null = null;
  if (months.length === 12) {
    annual = round1(months.reduce((total, n) => total + n, 0));
    assumptions.push("Annual kWh is the sum of the 12 monthly values.");
  } else if (typeof input.annual_kwh === "number" && input.annual_kwh > 0) {
    annual = input.annual_kwh;
    assumptions.push("Annual kWh was supplied directly.");
    if (months.length > 0) warnings.push("partial_usage_history");
  } else if (typeof input.kwh === "number" && input.kwh > 0) {
    annual = round1(input.kwh * 12);
    assumptions.push("Annual kWh is the single period multiplied by 12. That is a rough staging input, not a full year of bills.");
    warnings.push("annualized_from_single_period");
  } else if (months.length > 0) {
    warnings.push("partial_usage_history");
    warnings.push("insufficient_usage");
  } else {
    warnings.push("insufficient_usage");
  }

  const usable = yieldPerKw * shade.factor;
  assumptions.push(
    `Staging yield assumption is ${yieldPerKw} kWh per kW-year before shade, with a shade factor of ${shade.factor}.`,
  );
  assumptions.push(`Sizing target is ${Math.round(OFFSET_TARGET * 100)}% of annual kWh. Offset is not savings.`);

  let systemKw: number | null = null;
  let panels: number | null = null;
  let offset: number | null = null;
  let production: number | null = null;
  if (annual && annual > 0) {
    let raw = (annual * OFFSET_TARGET) / usable;
    if (raw > MAX_SYSTEM_KW) {
      raw = MAX_SYSTEM_KW;
      warnings.push("system_capped");
    }
    systemKw = round1(raw);
    panels = Math.ceil((systemKw * 1000) / PANEL_WATTS);
    production = round1(systemKw * usable);
    offset = round1((production / annual) * 100);
  }

  return {
    ok: true,
    mock: false,
    preliminary: true,
    binding: false,
    disclaimer: NON_BINDING_DISCLAIMER,
    utility,
    zip: input.zip || null,
    annual_kwh: annual,
    monthly_average_kwh: annual ? round1(annual / 12) : null,
    system_kw: systemKw,
    panels,
    panel_count: panels,
    panel_wattage: PANEL_WATTS,
    estimated_offset_pct: offset,
    estimated_annual_production_kwh: production,
    battery_option: batteryFor(input.battery_interest, annual),
    assumptions,
    warnings,
  };
}
