/**
 * Marker format, scrambling and detection come from `shared/misprint` (issue
 * #98) — the single source of truth shared with the Misprint utility and the
 * QA `description` check, so all three stay in lockstep with the format.
 */
import {
  createMisprintText,
  parseMisprintMarker,
} from "../../../shared/misprint";

const STATUSES = [
  "🟣 To do",
  "🟠 In progress",
  "🔵 Waiting for review",
  "🔴 Stuck",
  "🟢 Completed",
  "⚪️ TBD",
];

export function addComponentDescription(
  elements: Array<ComponentNode | ComponentSetNode>,
  options: {
    includeStatus?: boolean;
    status?: string;
    includeMisprint?: boolean;
    includeGuidelines?: boolean;
    mode?: "add" | "replace";
    hexColor: string;
  },
) {
  const {
    includeStatus = true,
    status = "🟣 To do",
    includeMisprint = true,
    includeGuidelines = true,
    mode = "add",
    hexColor,
  } = options;

  elements.forEach((element) => {
    let guidelines = `📝This element **${element.name}** is used for...\n🎨 #${hexColor}`;
    let misprint = createMisprintText(element.name);

    if (!includeMisprint) {
      misprint = "";
    }

    if (!includeGuidelines) {
      guidelines = "";
    }

    applyDescription(element, {
      includeStatus,
      status,
      includeGuidelines,
      includeMisprint,
      mode,
      guidelines,
      misprint,
    });
  });
}

function applyDescription(
  element: ComponentNode | ComponentSetNode,
  options: {
    includeStatus: boolean;
    status: string;
    includeGuidelines: boolean;
    includeMisprint: boolean;
    mode: "add" | "replace";
    guidelines: string;
    misprint: string;
  },
) {
  const {
    includeStatus,
    status,
    includeGuidelines,
    includeMisprint,
    mode,
    guidelines,
    misprint,
  } = options;

  if (mode === "replace") {
    element.description = includeMisprint ? misprint : "";
    return;
  }

  const descriptionLines = element.description?.split("\n") ?? [];

  if (includeStatus && status) {
    const existingStatus = descriptionLines.find((line) =>
      STATUSES.includes(line),
    );
    if (existingStatus) {
      const idx = descriptionLines.indexOf(existingStatus);
      descriptionLines[idx] = status;
    } else {
      descriptionLines.unshift(status);
    }
  }

  if (includeGuidelines && guidelines) {
    const hasGuidelines = descriptionLines.some((line) =>
      line.startsWith("📝"),
    );
    if (!hasGuidelines) {
      descriptionLines.push(guidelines);
    }
  }

  if (includeMisprint && misprint) {
    // Match on the marker itself (tolerant of prefix/casing) rather than any
    // leading dash, so a plain `- bullet` line isn't mistaken for a misprint
    // and overwritten.
    const misprintIndex = descriptionLines.findIndex(
      (line) => parseMisprintMarker(line, element.name).present,
    );
    if (misprintIndex >= 0) {
      descriptionLines.splice(misprintIndex, 1, misprint);
    } else {
      descriptionLines.push(misprint);
    }
  }

  element.description = descriptionLines.join("\n");
}
