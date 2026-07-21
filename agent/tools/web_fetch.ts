// Disable the Eve framework default tool — Expense Guard exposes only its own two tools
// (search_policy, validate_expense).
import { disableTool } from "eve/tools";
export default disableTool();
