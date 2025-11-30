export function toSentenceCase(value: string): string {
  if (!value) return value;
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
