export type SourceSection = {
  name: string;
  urls: string[];
};

export function parseSourceFile(text: string): SourceSection[] {
  const lines = text.split(/\r?\n/);
  const sections: SourceSection[] = [];
  let current: SourceSection | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      current = { name: sectionMatch[1].trim(), urls: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      // Ignore stray lines before the first section.
      continue;
    }

    current.urls.push(line);
  }

  return sections.filter((s) => s.name.length && s.urls.length);
}

export function toSafeFileStem(name: string): string {
  return name.replace(/[^\w.-]+/g, "_");
}

