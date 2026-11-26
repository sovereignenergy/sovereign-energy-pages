import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCustomerSafe } from "../src/compliance/filter.js";
import { NON_BINDING_DISCLAIMER } from "../src/compliance/notices.js";
import { DEFAULT_YIELD, MAX_SYSTEM_KW, OFFSET_TARGET, PANEL_WATTS, YIELD_KWH_PER_KW, sizeSystem } from "../src/design/sizeSystem.js";
import { priceDesign } from "../src/pricing/options.js";

function expectedKw(annual: number, yieldPerKw: number, shade = 1): number {
  return Math.round(((annual * OFFSET_TARGET) / (yieldPerKw * shade)) * 10) / 10;
}

describe("preliminary sizing", () => {
  it("sizes SDG&E from twelve months of kWh", () => {
    const annual = 12000;
    const result = sizeSystem({
      utility: "SDG&E",
      monthly_kwh: Array.from({ length: 12 }, () => 1000),
      shade: "Mostly sun",
      battery_interest: "Yes",
      zip: "92126",
    });
    assert.equal(result.binding, false);
    assert.equal(result.preliminary, true);
    assert.equal(result.annual_kwh, annual);
    assert.equal(result.system_kw, expectedKw(annual, YIELD_KWH_PER_KW["SDG&E"]));
    assert.equal(result.panels, Math.ceil(((result.system_kw || 0) * 1000) / PANEL_WATTS));
    assert.equal(result.panel_count, result.panels);
    assert.equal(result.battery_option.indicative_kwh, 13.5);
    assert.equal(result.battery_option.included, true);
    assert.match(result.disclaimer, /non-binding/i);
    assert.equal(isCustomerSafe(result.disclaimer), true);
    assert.equal(isCustomerSafe(result.assumptions.join(" ")), true);
    assert.equal(isCustomerSafe(result.battery_option.note), true);
  });

  it("uses a higher yield for HECO than for PG&E, so the same usage is a smaller system", () => {
    const months = Array.from({ length: 12 }, () => 1000);
    const heco = sizeSystem({ utility: "Hawaiian Electric", monthly_kwh: months, shade: "Mostly sun" });
    const pge = sizeSystem({ utility: "PG&E", monthly_kwh: months, shade: "Mostly sun" });
    assert.equal(heco.utility, "HECO");
    assert.equal(pge.utility, "PG&E");
    assert.ok((heco.system_kw || 0) < (pge.system_kw || 0));
    assert.equal(heco.system_kw, expectedKw(12000, YIELD_KWH_PER_KW.HECO));
    assert.equal(pge.system_kw, expectedKw(12000, YIELD_KWH_PER_KW["PG&E"]));
  });

  it("increases the system when shade is heavy", () => {
    const input = { utility: "SCE", annual_kwh: 11000 };
    const open = sizeSystem({ ...input, shade: "Mostly sun" });
    const heavy = sizeSystem({ ...input, shade: "Heavy shade" });
    assert.equal(open.system_kw, expectedKw(11000, YIELD_KWH_PER_KW.SCE, 1));
    assert.equal(heavy.system_kw, expectedKw(11000, YIELD_KWH_PER_KW.SCE, 0.65));
    assert.ok((heavy.system_kw || 0) > (open.system_kw || 0));
  });

  it("annualizes one entered period and labels that assumption", () => {
    const result = sizeSystem({ utility: "SDG&E", kwh: 500, shade: "Some shade" });
    assert.equal(result.annual_kwh, 6000);
    assert.ok(result.warnings.includes("annualized_from_single_period"));
    assert.equal(result.system_kw, expectedKw(6000, YIELD_KWH_PER_KW["SDG&E"], 0.85));
  });

  it("returns no system size when usage is missing", () => {
    const result = sizeSystem({ utility: "PG&E", shade: "Not sure" });
    assert.equal(result.system_kw, null);
    assert.equal(result.panels, null);
    assert.equal(result.annual_kwh, null);
    assert.ok(result.warnings.includes("insufficient_usage"));
    assert.ok(result.warnings.includes("shade_assumed"));
  });

  it("caps a residential staging system at 20 kW", () => {
    const result = sizeSystem({ utility: "SCE", annual_kwh: 100000, shade: "Mostly sun", battery_interest: "No" });
    assert.equal(result.system_kw, MAX_SYSTEM_KW);
    assert.ok(result.warnings.includes("system_capped"));
    assert.equal(result.battery_option.included, false);
    assert.equal(result.battery_option.indicative_kwh, null);
    const production = MAX_SYSTEM_KW * YIELD_KWH_PER_KW.SCE;
    assert.equal(result.estimated_offset_pct, Math.round((production / 100000) * 1000) / 10);
  });

  it("uses the default yield when the utility is unknown", () => {
    const result = sizeSystem({ utility: "Other", annual_kwh: 6000, shade: "Mostly sun" });
    assert.equal(result.utility, "unknown");
    assert.equal(result.system_kw, expectedKw(6000, DEFAULT_YIELD));
    assert.ok(result.warnings.includes("utility_default_yield"));
  });

  it("offers a smaller battery discussion size for a smaller year", () => {
    const result = sizeSystem({ utility: "HECO", annual_kwh: 5000, battery_interest: "Maybe" });
    assert.equal(result.battery_option.indicative_kwh, 10);
  });
});

describe("indicative pricing", () => {
  it("lists four non-binding payment types and no dollar promise", () => {
    const design = sizeSystem({ utility: "SDG&E", annual_kwh: 9000, shade: "Mostly sun" });
    const priced = priceDesign(design);
    assert.equal(priced.binding, false);
    assert.equal(priced.preliminary, true);
    assert.deepEqual(priced.options.map((option) => option.k), ["Lease", "PPA", "Loan", "Cash"]);
    const text = [priced.disclaimer, ...priced.notes, ...priced.options.flatMap((option) => [option.d, option.p])].join(" ");
    assert.equal(isCustomerSafe(text), true);
    assert.match(text, /not a quote/i);
    assert.doesNotMatch(text, /\$\d/);
    assert.equal(priced.disclaimer, NON_BINDING_DISCLAIMER);
    assert.equal(priced.options[0].not_a_quote, true);
  });
});
