# PROTOTYPE - where does Bridge status live?

Throwaway. Not production code, no tests, no error handling. Delete this whole directory once the question is answered.

## The question

If the Documentation Page button is removed, because documentation is always initiated from Claude, then the Tidy Doc tab has almost nothing left to show.
Where should "is Claude connected" live instead?

## Run it

```
npm run prototype:bridge
```

Two axes, because a status treatment cannot be judged in one state:

- **Variant**: `?variant=A|B|C`, or the left and right arrow keys.
- **Bridge status**: `?status=open|connecting|closed`, or the up and down arrow keys.

## The variants

They disagree about information hierarchy, not about colour.

| | Name | Idea | Cost |
|---|---|---|---|
| **A** | Sidebar lamp | Status is a citizen of the nav rail, where the Tidy Doc tab used to be | Visible only while the rail is; reads as a nav item, so invites a click that does nothing |
| **B** | Header pill | Status is panel chrome: always visible, independent of the rail and of the open module | Spends permanent header room on something boring 95% of the time |
| **C** | Quiet until broken | Nothing at all while healthy. A strip appears only for `connecting` and `closed` | No way to confirm a healthy connection, which is what someone debugging "is Claude even attached?" wants. Silence also reads as broken |

## Two things to know before judging

**`BridgeStatus` has three states, not two:** `connecting | open | closed` (`src/shared/operations/ui-bridge.ts:35`).
Reconnect backoff runs 250 ms to 10 s, so `connecting` is genuinely on screen.
A green/red lightbulb cannot say it, which is why every variant here carries an amber.

**"Bridge mode" is already taken.** `state.bridgeMode` is the collapsed 240x56 window, and its `.bridge-bar` already renders a status dot plus "Tidy DS Toolbox · MCP bridge" (`src/App.tsx:177-194`).
So a tab named "Bridge mode" would collide with a live concept, and there is already one status surface in the product.
Any answer here should say how it relates to that bar, rather than becoming a second unrelated indicator.

## Not covered

The bound `fileKey` and the build log, which the Tidy Doc tab also shows today.
Variant B gestures at the file key in its tooltip; A and C drop both.
If either still matters, that is an argument against removing the tab outright.
