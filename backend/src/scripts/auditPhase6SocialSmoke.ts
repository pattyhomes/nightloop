import path from "path";
import { config as loadDotenv } from "dotenv";
import { getDBClient } from "../lib/db";
import {
  collectPhase6SocialSmokeSnapshot,
  validatePhase6SocialSmokeSnapshot
} from "../services/v1/socialSmokeAudit";

type Args = {
  market: string;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  return {
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    json: argv.includes("--json")
  };
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

  const args = parseArgs(process.argv.slice(2));
  const client = getDBClient();
  const snapshot = await collectPhase6SocialSmokeSnapshot(client, args.market);
  const audit = validatePhase6SocialSmokeSnapshot(snapshot);

  if (args.json || !audit.ok) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(`Phase 6 social smoke audit passed for ${snapshot.market.slug}.`);
    console.log(`Users: ${snapshot.users.filter((user) => user.id).length}/${snapshot.users.length}`);
    console.log(`Accepted smoke friendships: ${snapshot.social.accepted_friendships.join(", ")}`);
    console.log(`Decision candidates: ${snapshot.decision.approved_candidate_count}`);
  }

  if (!audit.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[phase6:social-smoke:audit] ERROR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDBClient().close?.();
  });
