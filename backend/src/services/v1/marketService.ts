import { dbQuery } from "../../lib/db";
import { notFoundError } from "../../lib/apiError";

export type MarketRow = {
  id: string;
  slug: string;
  display_name: string;
  short_label: string;
  timezone: string;
  country_code: string;
  center_latitude: number;
  center_longitude: number;
  bounds: Record<string, unknown>;
  default_zoom: number | null;
  launch_status: string;
  mapbox_style_uri: string | null;
  provider_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NeighborhoodRow = {
  id: string;
  market_id: string;
  slug: string;
  display_name: string;
  label_latitude: number | null;
  label_longitude: number | null;
  polygon: Record<string, unknown>;
};

function formatMarket(row: MarketRow) {
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    short_label: row.short_label,
    timezone: row.timezone,
    country_code: row.country_code,
    launch_status: row.launch_status,
    center: {
      latitude: Number(row.center_latitude),
      longitude: Number(row.center_longitude)
    },
    default_zoom: row.default_zoom == null ? null : Number(row.default_zoom),
    bounds: row.bounds,
    mapbox_style_uri: row.mapbox_style_uri
  };
}

export async function listMarkets() {
  const result = await dbQuery<MarketRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        short_label,
        timezone,
        country_code,
        center_latitude,
        center_longitude,
        bounds,
        default_zoom,
        launch_status,
        mapbox_style_uri,
        provider_config,
        created_at,
        updated_at
      FROM markets
      ORDER BY
        CASE launch_status WHEN 'active' THEN 0 WHEN 'preview' THEN 1 ELSE 2 END,
        display_name ASC
    `
  );

  return { items: result.rows.map(formatMarket) };
}

export async function findMarketByIdOrSlug(marketIdOrSlug: string): Promise<MarketRow> {
  const result = await dbQuery<MarketRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        short_label,
        timezone,
        country_code,
        center_latitude,
        center_longitude,
        bounds,
        default_zoom,
        launch_status,
        mapbox_style_uri,
        provider_config,
        created_at,
        updated_at
      FROM markets
      WHERE id::text = $1 OR slug = $1
      LIMIT 1
    `,
    [marketIdOrSlug]
  );

  const row = result.rows[0];
  if (!row) {
    throw notFoundError("Market was not found.");
  }

  return row;
}

export async function getMarketConfig(marketIdOrSlug: string) {
  const market = await findMarketByIdOrSlug(marketIdOrSlug);
  const neighborhoods = await dbQuery<NeighborhoodRow>(
    `
      SELECT
        id,
        market_id,
        slug,
        display_name,
        label_latitude,
        label_longitude,
        polygon
      FROM market_neighborhoods
      WHERE market_id = $1::uuid
      ORDER BY display_name ASC
    `,
    [market.id]
  );

  return {
    market: formatMarket(market),
    neighborhoods: neighborhoods.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      display_name: row.display_name,
      label_coordinate:
        row.label_latitude == null || row.label_longitude == null
          ? null
          : {
              latitude: Number(row.label_latitude),
              longitude: Number(row.label_longitude)
            },
      polygon: row.polygon
    })),
    provider_config: market.provider_config
  };
}
