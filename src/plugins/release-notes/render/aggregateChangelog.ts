/**
 * The whole-file changelog on the `Release notes` page: every sprint, every
 * Subject, grouped by tag within a sprint.
 *
 * Foundation notes and component notes intermix in one list per tag, matching
 * the single "Component/ Foundation" column in the CSV.
 */

import type { Sprint } from "../types";
import { AGGREGATE_CARD_WIDTH, CARD_PALETTE } from "../utils/constants";
import {
  groupByTag,
  sortNotesNewestFirst,
  sortSprintsNewestFirst,
} from "../utils/notes";
import {
  createBodyText,
  createCardShell,
  createLogRow,
  createRow,
  createSectionTitle,
  createTagBadge,
  createText,
  linkToNode,
  type CardFonts,
} from "./primitives";

export function buildAggregateChangelog(
  figma: PluginAPI,
  fonts: CardFonts,
  sprints: Sprint[],
): FrameNode {
  const populated = sortSprintsNewestFirst(sprints).filter(
    (sprint) => sprint.notes.length > 0,
  );

  const card = createCardShell(figma, "Changelog", AGGREGATE_CARD_WIDTH);

  const body = createRow(figma, {
    name: "Changelog",
    direction: "VERTICAL",
    itemSpacing: 40,
    stretch: true,
  });

  const header = createRow(figma, {
    name: "Text",
    direction: "HORIZONTAL",
    padding: { top: 8, bottom: 8, left: 24, right: 24 },
    stretch: true,
    fixedPrimary: true,
  });

  const titleColumn = createRow(figma, {
    name: "Title Container",
    direction: "VERTICAL",
    grow: true,
  });
  titleColumn.appendChild(
    createText(figma, fonts, {
      characters: "Changelog",
      weight: "regular",
      size: 40,
      lineHeight: 56,
      color: CARD_PALETTE.textBold,
    }),
  );
  titleColumn.appendChild(
    createText(figma, fonts, {
      characters:
        "All notable changes in this library will be documented in this file.",
      weight: "regular",
      size: 16,
      lineHeight: 24,
      color: CARD_PALETTE.textMuted,
    }),
  );

  header.appendChild(titleColumn);
  body.appendChild(header);

  for (const sprint of populated) {
    const block = createRow(figma, {
      name: "Sprint",
      direction: "VERTICAL",
      stretch: true,
    });

    block.appendChild(createSectionTitle(figma, fonts, sprint.name));

    for (const group of groupByTag(sprint.notes)) {
      const { log, main } = createLogRow(figma, { paddingLeft: 24 });

      const badgeRow = createRow(figma, {
        name: "Sprint version",
        direction: "HORIZONTAL",
        itemSpacing: 4,
      });
      badgeRow.appendChild(createTagBadge(figma, fonts, group.tag));
      main.appendChild(badgeRow);

      const notes = createRow(figma, {
        name: "Notes",
        direction: "VERTICAL",
        stretch: true,
      });

      for (const note of sortNotesNewestFirst(group.notes)) {
        const line = createRow(figma, {
          name: "who + when",
          direction: "HORIZONTAL",
          itemSpacing: 4,
        });

        line.appendChild(createBodyText(figma, fonts, "•", "bold"));

        const subjectName = createBodyText(
          figma,
          fonts,
          `${note.subject.name}:`,
          "bold",
        );
        linkToNode(subjectName, note.subject.name.length, note.subject.id);
        line.appendChild(subjectName);

        line.appendChild(
          createBodyText(figma, fonts, note.description, "regular"),
        );

        notes.appendChild(line);
      }

      main.appendChild(notes);
      block.appendChild(log);
    }

    body.appendChild(block);
  }

  card.appendChild(body);
  return card;
}
