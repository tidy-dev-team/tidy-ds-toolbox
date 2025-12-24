/**
 * Erase all notes and highlights on canvas
 */

export function eraseNotesOnCanvas(): {
  success: boolean;
  message: string;
  count: number;
} {
  const pages = figma.root.children;
  let removedCount = 0;

  pages.forEach((page) => {
    const notes = page.findChildren((node) => node.name.endsWith("-note"));
    notes.forEach((note) => {
      note.remove();
      removedCount++;
    });

    const highlights = page.findChildren((node) =>
      node.name.endsWith("-highlight"),
    );
    highlights.forEach((highlight) => {
      highlight.remove();
      removedCount++;
    });
  });

  return {
    success: true,
    message: `Erased ${removedCount} notes and highlights from canvas`,
    count: removedCount,
  };
}
