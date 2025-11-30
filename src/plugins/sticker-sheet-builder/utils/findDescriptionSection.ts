import { ComponentDescription } from "./parseDescription";

export function findDescriptionSection(
  emoji: string,
  description: ComponentDescription,
  fallback: string
) {
  const sections = description.sections;
  for (const section of sections) {
    const sectionKey = Object.keys(section)[0];
    if (sectionKey.startsWith(emoji)) {
      return section[sectionKey];
    }
  }
  return fallback;
}
