import path from "path";
import { config as loadDotenv } from "dotenv";
import {
  closeDevSocialCrewResources,
  PHASE6_SOCIAL_SMOKE_CREW_USERS,
  seedDevSocialCrew
} from "../services/v1/devSocialCrewService";

type Args = {
  market: string;
  reset: boolean;
};

function parseArgs(argv: string[]): Args {
  return {
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    reset: argv.includes("--reset")
  };
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

  const args = parseArgs(process.argv.slice(2));
  const summary = await seedDevSocialCrew({
    market: args.market,
    reset: args.reset,
    users: PHASE6_SOCIAL_SMOKE_CREW_USERS
  });

  console.log("Phase 6 social smoke seed ready.");
  console.log("Phase 6 social smoke audit passed.");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Note: these are database dev profiles, not Supabase Auth sign-in credentials.");
}

main()
  .catch((error) => {
    console.error("[phase6:social-smoke] ERROR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDevSocialCrewResources();
  });
