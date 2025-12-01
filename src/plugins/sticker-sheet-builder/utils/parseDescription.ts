interface DescriptionSection {
  [key: string]: string;
}
export interface ComponentDescription {
  misprint: string;
  tags: string[];
  sections: DescriptionSection[];
}

export function parseComponentDescription(
  description: string,
): ComponentDescription {
  if (description.length === 0) {
    return {
      misprint: "",
      tags: [],
      sections: [],
    };
  }

  const arr = description.split("\n\n\n").filter((e) => e !== "");
  const result: ComponentDescription = {
    misprint: "",
    tags: [],
    sections: [],
  };

  for (const element of arr) {
    if (element.toLowerCase().startsWith("misprint")) {
      result.misprint = element;
    } else if (element.startsWith("#")) {
      const elementTags = element.split(/\s+/);
      elementTags.forEach((tag) => result.tags.push(tag));
    } else {
      const sectionData = splitDescription(element);
      result.sections.push(sectionData);
    }
  }

  return result;
}
function splitDescription(description: string): DescriptionSection {
  const [title, ...contentParts] = description.split("\n");
  const result: DescriptionSection = {};
  result[title || ""] = contentParts.join("\n") || "";
  return result;
}
