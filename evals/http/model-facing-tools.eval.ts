// Deterministic (no model). The running server's own inspection route (GET /eve/v1/info)
// lists the tools the model will be offered. Eve 0.11.7 ships ten framework-default tools
// (bash, read_file, write_file, glob, grep, web_search, web_fetch, todo, ask_question,
// load_skill) that are on unless a same-named agent/tools/<name>.ts exports disableTool();
// an expense reviewer must be offered exactly its two submission-scoped tools and nothing
// that reads files, runs commands, or reaches the network.
//
// Would have caught: nine stubs for ten framework tools, which left load_skill in the
// model's tool list while the docs said the model sees two tools.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

const INFO_PATH = "/eve/v1/info";

const MODEL_FACING_TOOLS = ["search_policy", "validate_expense"] as const;

type tAgentInfo = {
  tools?: { available?: ReadonlyArray<{ name?: string }> };
};

export default defineEval({
  description: "GET /eve/v1/info lists search_policy and validate_expense as the only available tools.",
  tags: ["expense-guard", "http", "deterministic"],
  async test(t) {
    const response = await t.target.fetch(INFO_PATH);
    t.check(response.status, equals(200)).gate();

    const info = (await response.json()) as tAgentInfo;
    const available = (info.tools?.available ?? []).map((tool) => tool.name).sort();
    t.log(`available tools: ${available.join(", ")}`);
    t.check(available, equals([...MODEL_FACING_TOOLS])).gate();
  },
});
