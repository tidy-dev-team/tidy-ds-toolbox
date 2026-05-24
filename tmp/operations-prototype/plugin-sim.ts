// PROTOTYPE scaffold — WebSocket server that pretends to be the Figma plugin.
// Wraps the prototype's dispatch() so the real plugin code doesn't need to
// exist yet. Logs every exchange to stdout so you can watch the bridge.
//
// Run: npm run prototype:plugin-sim
// Listens on 127.0.0.1:9876 (localhost only, no auth — prototype only).

import { WebSocketServer } from "ws";
import { bindSession, dispatch, newSession } from "./operations.ts";
import type { BridgeRequest } from "./types.ts";

const PORT = 9876;

const session = newSession();
bindSession(session);

const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });

process.stdout.write(
  `[plugin-sim] listening on ws://127.0.0.1:${PORT}  ` +
    `(session=${session.sessionId} file=${session.fileKey})\n`,
);
process.stdout.write(`[plugin-sim] ctrl-c to quit\n\n`);

wss.on("connection", (ws, req) => {
  const from = req.socket.remoteAddress ?? "?";
  process.stdout.write(`[plugin-sim] ← bridge connected from ${from}\n`);

  ws.on("message", async (raw) => {
    let envelope: BridgeRequest;
    try {
      envelope = JSON.parse(raw.toString());
    } catch (err) {
      process.stdout.write(`[plugin-sim] dropping malformed message: ${raw}\n`);
      return;
    }
    process.stdout.write(
      `  → ${envelope.id} ${envelope.operation} ${JSON.stringify(envelope.params)}\n`,
    );
    const response = await dispatch(envelope);
    process.stdout.write(
      response.ok
        ? `  ← ${response.id} ok ${JSON.stringify(response.result)}\n`
        : `  ← ${response.id} ${response.error.code} ${response.error.message}\n`,
    );
    ws.send(JSON.stringify(response));
  });

  ws.on("close", () => {
    process.stdout.write(`[plugin-sim] ← bridge closed\n`);
  });
});

wss.on("error", (err) => {
  process.stderr.write(`[plugin-sim] server error: ${err.message}\n`);
  process.exit(1);
});
