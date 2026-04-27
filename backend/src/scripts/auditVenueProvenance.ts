import path from "path";
import { config as loadDotenv } from "dotenv";
import { loadProviderProvenanceAudit } from "../services/v1/providerProvenanceAudit";

loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });

async function main() {
  const audit = await loadProviderProvenanceAudit();
  const asJson = process.argv.includes("--json");

  if (asJson) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  console.log("Nightloop venue provider provenance audit");
  console.log(`Generated: ${audit.generated_at}`);
  console.table(audit.summary);

  if (audit.examples.length === 0) {
    console.log("No provider-derived approved venues requiring review found.");
    return;
  }

  console.log("\nReview examples:");
  for (const item of audit.examples) {
    console.log(`- ${item.name} (${item.id})`);
    console.log(`  overall=${item.overall} risk=${item.risk} source=${item.source ?? "unknown"}`);
    console.log(`  fields=${JSON.stringify(item.fields)}`);
    console.log(`  evidence=${item.evidence.join(", ") || "none"}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
