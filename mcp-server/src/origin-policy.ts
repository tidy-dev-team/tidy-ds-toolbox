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

/** The host the plugin UI is served from, and its subdomains. */
const FIGMA_HOSTNAME = "figma.com";

/**
 * Whether a parsed origin is https on figma.com or a subdomain of it.
 *
 * Decided on `hostname` from a parsed URL, never on the raw string: a suffix
 * test would accept `https://figma.com.evil.test`, and a substring test would
 * accept a URL that merely mentions the host, like
 * `https://evil.test/?x=https://figma.com`.
 */
function isFigmaOrigin(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return (
    url.hostname === FIGMA_HOSTNAME ||
    url.hostname.endsWith(`.${FIGMA_HOSTNAME}`)
  );
}

/**
 * Whether a handshake carrying this `Origin` may open the Bridge.
 *
 * The four cases below are the ones the plugin itself can present. The plugin
 * UI is an iframe Figma serves, so depending on host it arrives with a
 * figma.com origin, with the opaque `null` of a sandboxed document, with a
 * `file://` origin under the Electron app, or with no header at all. Everything
 * else is a browser saying truthfully that it is a web page, and is refused.
 *
 * An absent header is allowed because a non-browser client (the smoketest's
 * `ws` client, a script, any local process) sends none, and those are exactly
 * the callers ADR-0005 accepts. A browser never omits it, so allowing the
 * absent case does not reopen the tab route.
 *
 * `"null"` is where this policy is looser than it looks, and the ADR amendment
 * says so rather than claiming a closure: a sandboxed document has an opaque
 * origin, which serializes to `null`, and a page can reach `null` by sandboxing
 * an iframe of its own and dialling from there. Allowing it is the choice
 * between a check a determined page can step around and no check at all, since
 * refusing `null` refuses the only client that matters.
 */
export function isAllowedBridgeOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === "") return true;
  if (origin === "null") return true;

  // Parsed once, and every remaining case decided from the parse. The earlier
  // version tested `file://` with `startsWith` on the raw string, which is the
  // shape the comment above argues against - `file://x.evil.test` passed it -
  // and two halves of one policy deciding by different means is how they come
  // to disagree.
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // A `file:` origin carries no host - that is what makes it the origin of a
  // local document rather than of somewhere. `file://x.evil.test` has one, and
  // is refused for the same reason the figma test reads `hostname`.
  if (url.protocol === "file:") return url.hostname === "";
  return isFigmaOrigin(url);
}

/**
 * What the log says about a refusal. Kept here so the reason is stated once.
 *
 * Takes the same `string | undefined` the policy takes, so a caller holding one
 * unnarrowed value can pass it to both. An absent header is always allowed, so
 * the fallback wording describes a case that cannot arrive rather than a case
 * worth handling - which is cheaper than the two functions disagreeing about
 * what an origin is.
 */
export function describeRefusedOrigin(origin: string | undefined): string {
  return (
    `refusing a connection from origin ${origin ?? "(absent)"} - the Bridge accepts the ` +
    `Figma plugin, not a web page. A page that can reach this socket can read ` +
    `Operation parameters and forge Operation results.`
  );
}
