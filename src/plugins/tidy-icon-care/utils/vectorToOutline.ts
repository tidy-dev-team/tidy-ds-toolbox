type OutlineableNode =
  | VectorNode
  | BooleanOperationNode
  | EllipseNode
  | PolygonNode
  | RectangleNode
  | StarNode
  | TextNode;

type ParentNode = GroupNode | FrameNode | BooleanOperationNode;

const PROPERTY_VECTOR_PATHS = "vectorPaths";
const PROPERTY_FILL_GEOMETRY = "fillGeometry";

export function vectorToOutline(vector: OutlineableNode): void {
  if (!isOutlineable(vector)) return;

  const parent = vector.parent as ParentNode | null;
  if (!parent) return;

  const outlined = createOutlinedStroke(vector);

  if (outlined && isValidOutlinedStroke(outlined)) {
    parent.appendChild(outlined);
    vector.remove();
  }
}

function isOutlineable(node: OutlineableNode): boolean {
  return (
    node.strokes.length > 0 &&
    node.strokeWeight !== 0 &&
    PROPERTY_VECTOR_PATHS in node
  );
}

function createOutlinedStroke(vector: OutlineableNode): OutlineableNode | null {
  if (vector.strokes.length === 0 || vector.strokeWeight === 0) {
    return null;
  }

  try {
    return vector.outlineStroke() as OutlineableNode;
  } catch (error) {
    console.error("Failed to outline stroke", error);
    return null;
  }
}

function isValidOutlinedStroke(node: OutlineableNode): boolean {
  return (
    PROPERTY_VECTOR_PATHS in node &&
    PROPERTY_FILL_GEOMETRY in node &&
    //@ts-ignore
    node.vectorPaths?.length > 0 &&
    //@ts-ignore
    node.fillGeometry?.length > 0
  );
}
