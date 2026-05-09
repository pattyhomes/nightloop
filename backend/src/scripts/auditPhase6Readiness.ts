import path from "path";
import { config as loadDotenv } from "dotenv";
import { getDBClient } from "../lib/db";
import type { AccountState } from "../services/v1/accountService";
import { listRecommendations } from "../services/v1/recommendationService";
import { listVenues } from "../services/v1/venueService";
import { validatePhase6ReadinessPayloads } from "../services/v1/phase6ReadinessAudit";

type Args = {
  market: string;
  limit: number;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  return {
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "60"),
    json: argv.includes("--json")
  };
}

function syntheticEligibleAccount(): AccountState {
  const now = new Date().toISOString();
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      auth_user_id: "phase6-readiness-audit",
      eligibility_status: "eligible",
      age_attested_at: now,
      signal_scout_points: 0,
      deleted_at: null,
      created_at: now,
      updated_at: now
    },
    profile: {
      user_id: "00000000-0000-0000-0000-000000000001",
      display_name: "Phase 6 Readiness Audit",
      username: "phase6_audit",
      selected_market_id: null,
      avatar_kind: "default",
      bio: null,
      created_at: now,
      updated_at: now
    },
    settings: null,
    preferences: {
      vibe: [],
      music: [],
      crowd: [],
      neighborhoods: []
    }
  };
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

  const args = parseArgs(process.argv.slice(2));
  const account = syntheticEligibleAccount();
  const venues = await listVenues({ marketId: args.market, limit: args.limit });
  const recommendations = await listRecommendations({
    account,
    marketId: args.market,
    limit: Math.min(args.limit, 60)
  });

  const audit = validatePhase6ReadinessPayloads([
    { surface: "venues-map", payload: venues },
    { surface: "home-recommendations", payload: recommendations }
  ]);

  const summary = {
    generated_at: new Date().toISOString(),
    market: args.market,
    limit: args.limit,
    venues_checked: venues.items.length,
    recommendations_checked: recommendations.items.length,
    ...audit
  };

  if (args.json || !audit.ok) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Phase 6 readiness sanity check passed for ${args.market}.`);
    console.log(`Checked ${venues.items.length} venues and ${recommendations.items.length} recommendations.`);
    console.log(`Checked ${audit.checked_liveness_objects} liveness objects and ${audit.checked_open_now_flags} open-now flags.`);
  }

  if (!audit.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[phase6:readiness] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
