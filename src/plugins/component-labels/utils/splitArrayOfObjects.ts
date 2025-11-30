/// <reference types="@figma/plugin-typings" />

/**
 * Groups text nodes by their characters (content)
 * @param arr Array of text nodes to group
 * @returns Array of grouped text nodes
 */
export function splitArrayOfObjects(arr: TextNode[]): TextNode[][] {
  if (!arr.length) return [];

  const result = arr.reduce(
    (acc: Record<string, TextNode[]>, obj: TextNode) => {
      const key = obj.characters;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(obj);
      return acc;
    },
    {},
  );

  return Object.values(result);
}
