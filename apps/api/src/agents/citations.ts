import type { Source } from '../evidence/types.js';

export function normalizeEvidenceCitations(
  text: string,
  sources: ReadonlyMap<string, Source>,
  aliases: ReadonlyMap<string, string>,
) {
  return text.replace(/\[([^\]\n]+)\]/g, (original, group: string) => {
    const ids = group.split(/[,;]\s*/).map((id) => aliases.get(id.trim()) ?? id.trim());
    if (ids.every((id) => sources.has(id))) return ids.map((id) => `[${id}]`).join(' ');
    // Normalize explicit retrieved IDs with human annotations/range punctuation.
    // Unknown IDs, paths, dates and placeholder references remain rejected below.
    let annotation = group;
    const retrieved = new Set<string>();
    for (const id of [...sources.keys(), ...aliases.keys()].sort((a, b) => b.length - a.length)) {
      if (!annotation.includes(id)) continue;
      annotation = annotation.replaceAll(id, '');
      retrieved.add(aliases.get(id) ?? id);
    }
    annotation = annotation
      .replace(/[,;–—()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const proseAnnotation =
      /^[A-Za-z]+(?: [A-Za-z]+)+$/.test(annotation) && !/^[A-Z ]+$/.test(annotation);
    return retrieved.size && (!annotation || proseAnnotation)
      ? [...retrieved].map((id) => `[${id}]`).join(' ')
      : original;
  });
}
