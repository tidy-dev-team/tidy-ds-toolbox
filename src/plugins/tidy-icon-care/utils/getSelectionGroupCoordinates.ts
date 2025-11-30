export function getSelectionGroupCoordinates(nodes: readonly SceneNode[]) {
  if (!nodes.length) {
    throw new Error("Select at least one icon to build the grid");
  }

  let minX = Infinity;
  let minY = Infinity;

  nodes.forEach((node) => {
    if ("x" in node && "y" in node) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      return;
    }

    const bounds = (node as any).absoluteBoundingBox as Rect | undefined;
    if (bounds) {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error("Unable to determine selection coordinates");
  }

  return { x: minX, y: minY };
}
