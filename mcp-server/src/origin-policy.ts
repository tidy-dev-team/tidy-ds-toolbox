// Who is allowed to open the Bridge socket.
//
// ADR-0005 leaves the Bridge unauthenticated, and that decision stands: any
// local process can speak this protocol, and on a single-user dev machine that
// is accepted. What the ADR also said, and what is not true, is that "browser
// tabs cannot reach raw websockets on 127.0.0.1 without same-origin /
// DNS-rebinding tricks". A WebSocket handshake is exempt from the same-origin
// policy: any page the developer happens to have open can call
// `new WebSocket("ws://localhost:9876")` and the handshake succeeds. Nothing
// clever is needed and nothing is rebound.
//
// That matters more than "another process can call Operations", which is the
// risk the ADR weighed. A tab that connects first takes the single client slot,
// so the real plugin is closed with MULTI_CONNECT and the agent only ever sees
// BRIDGE_DISCONNECTED. Worse, a tab may answer: a `BridgeResponse` it forges
// becomes the result of an Operation, and Operation results are handed to the
// agent as tool output. That is arbitrary text written into an agent's context
// by a web page, which is a different class of problem from a local process the
// user already trusts.
//
// The fix that fits the ADR is a check rather than a credential, because the
// browser is the one caller that cannot lie here. `Origin` is a forbidden
// header: page JavaScript cannot set or remove it, and the browser stamps it on
// every WebSocket handshake it makes. So refusing the origins only a browser
// sends closes the tab route without asking the plugin to hold a secret it has
// no way to store, and without narrowing the local-process access the ADR
// deliberately accepts.

/**
 * Origins the plugin itself can present.
 *
 * The plugin UI is an iframe Figma serves; depending on host (desktop app or
 * browser) it presents a figma.com origin, the opaque `null` of a sandboxed
 * document, or a `file://` origin in the Electron app. All three are the
 * plugin, and all three are allowed.
 */
const FIGMA_ORIGIN_SUFFIX = ".figma.com";

function isFigmaOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return (
    url.hostname === "figma.com" || url.hostname.endsWith(FIGMA_ORIGIN_SUFFIX)
  );
}

/**
 * Whether a handshake carrying this `Origin` may open the Bridge.
 *
 * `undefined` means the header was absent, which is allowed: a non-browser
 * client (the smoketest's `ws` client, a script, any local process) sends none,
 * and those are exactly the callers ADR-0005 accepts. A browser never omits it,
 * so allowing the absent case does not reopen the tab route.
 *
 * The literal string `"null"` is allowed for the same reason it appears at all:
 * a sandboxed document has an opaque origin, which serializes to `null`, and
 * the plugin UI iframe is one. This is the one place the policy is looser than
 * it looks, because a page can reach `null` by sandboxing an iframe of its own.
 * It is still worth having: it costs an attacker a deliberate step, and the
 * alternative is refusing the plugin, which is the only client that matters.
 */
export function isAllowedBridgeOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === "") return true;
  if (origin === "null") return true;
  if (origin.startsWith("file://")) return true;
  return isFigmaOrigin(origin);
}

/** What the log says about a refusal. Kept here so the reason is stated once. */
export function describeRefusedOrigin(origin: string): string {
  return (
    `refusing a connection from origin ${origin} - the Bridge accepts the ` +
    `Figma plugin, not a web page. A page that can reach this socket can read ` +
    `Operation parameters and forge Operation results.`
  );
}
