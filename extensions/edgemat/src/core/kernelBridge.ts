// A BridgeClient over a REDbridge someone else runs, such as REDnode's shared one (`kernel.bridge()`,
// whose `call(method, params)` takes REDbridge's methods by name). The rest of the core then works
// unchanged inside a REDnode package (Wardrobe Designer). bridgeClient.ts stays REDcode's copy: every
// method there goes through its connection's sendRequest, so this gives it one that forwards.

import { BridgeClient } from "./bridgeClient";

export type BridgeCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export function bridgeOver(call: BridgeCall): BridgeClient {
  const client = new BridgeClient({ exe: "" });
  const connection = { sendRequest: (method: string, params: Record<string, unknown>) => call(method, params), dispose: () => undefined };
  (client as unknown as { connection: typeof connection }).connection = connection;
  return client;
}
