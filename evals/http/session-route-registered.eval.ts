// Deterministic (no model). Eve's session route (POST /eve/v1/session) is what `eve dev`'s
// client and the eval runner's t.send() call. It is served by the framework channel named
// "eve", which Eve silently drops when an authored channel file has the same basename --
// so a stray agent/channels/eve.ts that is not the session channel turns every t.send()
// eval into `404 Cannot find any route matching [POST] /eve/v1/session`.
//
// Both bodies here are rejected by the session channel's own body parsing before any
// session starts, so this runs without a model key. The assertion is "the route exists and
// answers as the session channel would" (400), never 404.
//
// Would have caught: agent/channels/eve.ts holding the /eve/v1/review channel, which
// shadowed the session routes for every t.send() eval in the repo.
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";

export const SESSION_PATH = "/eve/v1/session";

export default defineEval({
  description: "POST /eve/v1/session is served (a malformed create body is a 400, not a 404).",
  tags: ["expense-guard", "http", "deterministic"],
  async test(t) {
    const rejectedBodies: ReadonlyArray<{ name: string; body: string }> = [
      { name: "invalid JSON", body: "{not json" },
      { name: "missing message", body: "{}" },
    ];

    for (const { name, body } of rejectedBodies) {
      const response = await t.target.fetch(SESSION_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      t.log(`${name}: ${response.status} ${payload.error ?? ""}`.trim());
      t.check(
        { case: name, status: response.status, ok: payload.ok },
        equals({ case: name, status: 400, ok: false }),
      ).gate();
    }
  },
});
