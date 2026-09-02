// Loads a named submission fixture for an eval. Unlike loadExpenseFixture() in
// agent/lib/request-context.ts, which returns whatever POC_REQUEST_FILE points at for the
// whole process, this picks the fixture per eval so one `eve eval` run can cover every case.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ExpenseSubmissionSchema, type tExpenseSubmission } from "../../agent/lib/request-context.js";

export const FIXTURES_DIR = join(process.cwd(), "fixtures");

export function loadFixture(name: string): tExpenseSubmission {
  return ExpenseSubmissionSchema.parse(JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")));
}
