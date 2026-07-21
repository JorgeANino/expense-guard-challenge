// Per-request context for a review: the expense submission plus a few trace-identity
// fields. In production a channel maps the POST body onto the session; in dev / eval it
// loads a representative submission from a fixture (override with POC_REQUEST_FILE).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineState } from "eve/context";

export type tExpenseLineItem = {
  label: string;
  amount: number;
};

export type tExpenseSubmission = {
  company_id: string;
  category: string;
  claimed_amount: number;
  currency?: string;
  receipt: string;
  line_items?: tExpenseLineItem[];
  workspace_id?: string;
  chat_id?: string;
  label?: string;
};

// The per-session projection carried by channel state -> metadata(state). `contextProvided`
// tells "bare request, use fixture" apart from "a body was sent but did not survive the
// projection".
export type tRequestView = {
  request: tExpenseSubmission | null;
  contextProvided: boolean;
};

const FIXTURE_PATH = process.env.POC_REQUEST_FILE ?? join(process.cwd(), "fixtures", "request.json");

export function loadExpenseFixture(): tExpenseSubmission {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as tExpenseSubmission;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// WRITE side — the channel builds the state to seed from the parsed body. A bare body
// (missing/empty/non-object) -> fixture path (contextProvided:false). A non-empty object
// body IS the submission (contextProvided:true).
export function buildRequestView(body: unknown): tRequestView {
  if (isPlainObject(body) && Object.keys(body).length > 0) {
    return { request: body as tExpenseSubmission, contextProvided: true };
  }
  return { request: null, contextProvided: false };
}

// READ side — loud fallback: a body was provided but did not reach the resolver via the
// metadata projection -> throw (fail the turn). Silently rendering the fixture would
// review another company's submission. Bare / eval requests -> fixture.
export function resolveExpenseSubmission(
  view: { request?: unknown; contextProvided?: unknown } | undefined,
): tExpenseSubmission {
  if (view?.contextProvided === true) {
    if (isPlainObject(view.request)) return view.request as tExpenseSubmission;
    throw new Error(
      "Per-request expense context was provided but did not reach the resolver via channel " +
        "metadata/state. Refusing to fall back to the fixture — that would review another " +
        "company's submission.",
    );
  }
  return loadExpenseFixture();
}

// The authoritative submission for this turn, seeded by the instructions resolver so
// tools can read the real fields instead of relying on model-provided arguments.
export const submissionState = defineState<tExpenseSubmission | null>(
  "expense-guard.submission",
  () => null,
);
