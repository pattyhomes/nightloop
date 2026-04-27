import { describe, expect, it } from "vitest";
import {
  normalizeSfNeighborhoodName,
  pointInPolygon,
  resolveSfNeighborhoodFromFeatures
} from "../src/services/v1/sfNeighborhoods";

describe("Phase 5.8 SF neighborhood normalization", () => {
  it("normalizes DataSF names to Nightloop display labels", () => {
    expect(normalizeSfNeighborhoodName("South of Market")).toBe("SoMa");
    expect(normalizeSfNeighborhoodName("SOMA")).toBe("SoMa");
    expect(normalizeSfNeighborhoodName("Mission")).toBe("Mission");
  });

  it("resolves a venue coordinate from polygon features", () => {
    const features = [
      {
        display_name: "South of Market",
        polygon: {
          type: "Polygon",
          coordinates: [[
            [-122.42, 37.77],
            [-122.39, 37.77],
            [-122.39, 37.79],
            [-122.42, 37.79],
            [-122.42, 37.77]
          ]]
        }
      }
    ];

    expect(pointInPolygon({ latitude: 37.78, longitude: -122.41 }, features[0].polygon)).toBe(true);
    expect(resolveSfNeighborhoodFromFeatures({ latitude: 37.78, longitude: -122.41 }, features)).toBe("SoMa");
    expect(resolveSfNeighborhoodFromFeatures({ latitude: 37.81, longitude: -122.45 }, features)).toBeNull();
  });
});
