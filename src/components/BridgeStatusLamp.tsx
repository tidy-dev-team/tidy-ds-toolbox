// Whether Claude is attached, as a lamp at the foot of the sidebar.
//
// This is the only place in the panel that reports it since the Tidy Doc tab
// was removed. That tab existed mostly to say this, and its one action - the
// "Document selection" fallback button - went with it, because documentation is
// always initiated from Claude.
//
// Rendered as a `div`, not a `button`: it sits in a rail of nav items and takes
// the same class so it lines up with them, but it does nothing when clicked. A
// `button` that does nothing is the worse of the two failures.
//
// It carries `aria-label` because `.sidebar.small .nav-item::after` draws
// `attr(aria-label)` as the hover tooltip once the rail collapses - the label
// beside it is hidden by `.sidebar.small .label` at that width, so the tooltip
// is the only wording left and it gets the full sentence rather than the short
// label.

import { useEffect, useState } from "react";
import {
  getBridgeStatus,
  subscribeBridgeStatus,
} from "@shared/operations/ui-bridge-startup";
import type { BridgeStatus } from "@shared/operations/ui-bridge";
import { describeBridgeStatus } from "@shared/bridge-status-presentation";

export function BridgeStatusLamp() {
  // Seeded from the current value rather than from a default, because the
  // bridge is started in `main.tsx` before React mounts: a component that
  // assumed "closed" until the first change would show a red lamp on every
  // open of an already-connected plugin.
  const [status, setStatus] = useState<BridgeStatus>(getBridgeStatus);

  useEffect(() => subscribeBridgeStatus(setStatus), []);

  const { tone, label, detail } = describeBridgeStatus(status);

  return (
    <div
      className={`nav-item bridge-lamp tone-${tone}`}
      aria-label={detail}
      title={detail}
    >
      <span className="icon">
        <span className="bridge-lamp-dot" aria-hidden="true" />
      </span>
      <span className="label">{label}</span>
      {/* The label is hidden at the collapsed width and the tooltip is
          hover-only, so assistive tech gets the sentence from here instead. */}
      <span className="sr-only" role="status">
        {detail}
      </span>
    </div>
  );
}
