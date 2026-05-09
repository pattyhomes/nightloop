import { describe, expect, it } from "vitest";
import { addressesLikelyMatch, scoreProviderName } from "../src/services/v1/providerDedupe";

describe("provider dedupe helpers", () => {
  it("matches short street addresses against provider-formatted full addresses", () => {
    expect(addressesLikelyMatch("540 VALENCIA ST", "540 Valencia St, San Francisco, CA 94110")).toBe(true);
    expect(addressesLikelyMatch("4 Valencia St", "540 Valencia St, San Francisco, CA 94110")).toBe(false);
  });

  it("keeps exact and compact venue names high-confidence", () => {
    expect(scoreProviderName("15 Romolo", "15 Romolo Pl")).toBeGreaterThanOrEqual(0.64);
    expect(scoreProviderName("MARTUNI'S", "Martuni's")).toBeGreaterThanOrEqual(0.9);
  });
});
