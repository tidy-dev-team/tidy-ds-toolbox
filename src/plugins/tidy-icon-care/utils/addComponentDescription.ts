import { keyboardsMap } from "./descriptionData";

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
    const scrambled = element.name
      .split("")
      .map((char) => keyboardsMap[char] ?? char)
      .join("");

    let guidelines = `📝This element **${element.name}** is used for...\n🎨 #${hexColor}`;
    let misprint = `---------------------------------------------------- misprint: ${scrambled}`;

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
    const misprintIndex = descriptionLines.findIndex((line) =>
      line.startsWith("-"),
    );
    if (misprintIndex >= 0) {
      descriptionLines.splice(misprintIndex, 1, misprint);
    } else {
      descriptionLines.push(misprint);
    }
  }

  element.description = descriptionLines.join("\n");
}
