// Eve's built-in session channel (POST /eve/v1/session, POST /eve/v1/session/:id,
// GET /eve/v1/session/:id/stream). This is the route `eve dev`'s client and the eval
// runner's t.send() use; a session created here carries no channel state, so the
// instructions resolver reviews the fixture (POC_REQUEST_FILE) -- dev/eval only.
//
// The file must be named eve.ts: Eve keys its framework-default "eve" channel on that
// basename, and an authored file of the same name replaces the default. Declaring it here
// (rather than relying on the default, which also accepts vercelOidc()) pins the auth
// policy to loopback callers only: a free-form session endpoint that reviews a fixture is
// not a production surface. The production surface is POST /eve/v1/review in review.ts.
import { eveChannel } from "eve/channels/eve";
import { localDev } from "eve/channels/auth";

export default eveChannel({ auth: [localDev()] });
