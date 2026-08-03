/**
 * The card that sits beside one Subject: every note about that Subject, newest
 * sprint first, grouped so a tag + author + day heads one bullet list.
 */

import type { ReleaseNote, Sprint, Subject } from "../types";
import { CARD_PALETTE, SUBJECT_CARD_WIDTH } from "../utils/constants";
import { formatCardDate } from "../utils/dates";
import { groupByTagAuthorDay, sprintsForSubject } from "../utils/notes";
import {
  createCardShell,
  createRow,
  createTagBadge,
  createText,
  createTimeline,
  type CardFonts,
} from "./primitives";

function buildEntry(
  figma: PluginAPI,
  fonts: CardFonts,
  group: ReleaseNote[],
): FrameNode[] {
  const head = group[0];

  const whoWhen = createRow(figma, {
    name: "who + when",
    direction: "HORIZONTAL",
    itemSpacing: 4,
    counterAlign: "CENTER",
  });
  whoWhen.appendChild(createTagBadge(figma, fonts, head.tag));

  const line = (characters: string, weight: "regular" | "bold") =>
    createText(figma, fonts, {
      characters,
      weight,
      size: 14,
      lineHeight: 24,
      color: CARD_PALETTE.textBold,
    });

  whoWhen.appendChild(line("By", "regular"));
  whoWhen.appendChild(line(head.authorName, "bold"));
  whoWhen.appendChild(line("on", "regular"));
  whoWhen.appendChild(line(formatCardDate(head.createdAt), "regular"));

  const description = createRow(figma, {
    name: "Description",
    direction: "VERTICAL",
    itemSpacing: 4,
    stretch: true,
  });

  for (const note of group) {
    const bullet = createRow(figma, {
      name: "bullet-item",
      direction: "HORIZONTAL",
      itemSpacing: 8,
    });
    bullet.appendChild(
      createText(figma, fonts, {
        characters: "•",
        weight: "medium",
        size: 14,
        lineHeight: 20,
        color: CARD_PALETTE.textBold,
      }),
    );
    bullet.appendChild(
      createText(figma, fonts, {
        characters: note.description,
        weight: "medium",
        size: 14,
        lineHeight: 20,
        color: CARD_PALETTE.textBold,
      }),
    );
    description.appendChild(bullet);
  }

  return [whoWhen, description];
}

/**
 * Build the card. Returns null when the Subject has no notes at all, so the
 * caller never places an empty card.
 */
export function buildSubjectCard(
  figma: PluginAPI,
  fonts: CardFonts,
  subject: Subject,
  sprints: Sprint[],
): FrameNode | null {
  const perSprint = sprintsForSubject(sprints, subject.id);
  if (perSprint.length === 0) return null;

  const card = createCardShell(
    figma,
    `Changelog - ${subject.name}`,
    SUBJECT_CARD_WIDTH,
  );

  const body = createRow(figma, {
    name: "Changelog",
    direction: "VERTICAL",
    stretch: true,
  });

  const title = createRow(figma, {
    name: "Title",
    direction: "HORIZONTAL",
    padding: { top: 8, bottom: 8, left: 24, right: 24 },
    stretch: true,
    fixedPrimary: true,
  });
  title.appendChild(
    createText(figma, fonts, {
      characters: "Changelog",
      weight: "medium",
      size: 24,
      lineHeight: 32,
      color: CARD_PALETTE.textBold,
    }),
  );
  body.appendChild(title);

  perSprint.forEach((entry, sprintIndex) => {
    const log = createRow(figma, {
      name: "Log",
      direction: "HORIZONTAL",
      padding: { left: 16, right: 24 },
      stretch: true,
      fixedPrimary: true,
    });

    const main = createRow(figma, {
      name: "main",
      direction: "VERTICAL",
      itemSpacing: 8,
      padding: { top: 4, bottom: 8 },
      grow: true,
    });

    const version = createRow(figma, {
      name: "Sprint version",
      direction: "HORIZONTAL",
    });
    version.appendChild(
      createText(figma, fonts, {
        characters: entry.sprint.name,
        weight: "bold",
        size: 16,
        lineHeight: 24,
        color: CARD_PALETTE.textMuted,
      }),
    );
    main.appendChild(version);

    for (const group of groupByTagAuthorDay(entry.notes)) {
      for (const part of buildEntry(figma, fonts, group)) {
        main.appendChild(part);
      }
    }

    log.appendChild(
      createTimeline(figma, sprintIndex === perSprint.length - 1),
    );
    log.appendChild(main);
    body.appendChild(log);
  });

  card.appendChild(body);
  return card;
}
