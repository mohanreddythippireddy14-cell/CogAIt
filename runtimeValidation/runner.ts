import { runPhase3Validation } from "./phase3Validation.js";
import { runPhase4Validation } from "./phase4Validation.js";
import { runPhase5Validation } from "./phase5Validation.js";
import { runPhase6Validation } from "./phase6Validation.js";
import { runPhase7Validation } from "./phase7Validation.js";
import { runPhase8Validation } from "./phase8Validation.js";
import { runTenantIsolationValidation } from "./tenantIsolationValidation.js";
import { runAuthValidation } from "./authValidation.js";
import { runRollbackValidation } from "./rollbackValidation.js";

async function main() {
  try {
    await runPhase3Validation();
    await runPhase4Validation();
    await runPhase5Validation();
    await runPhase6Validation();
    await runPhase7Validation();
    await runPhase8Validation();
    await runTenantIsolationValidation();
    await runAuthValidation();
    await runRollbackValidation();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
