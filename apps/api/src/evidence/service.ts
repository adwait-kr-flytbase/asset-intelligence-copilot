import { deriveProduction, isFalsePositiveCorrection, readTemperatureRule } from './rules.js';
import type { EvidenceReader, Source } from './types.js';

/** Authoritative status comes from exact decimals and the primary manual clause. */
export function createEvidenceService(reader: EvidenceReader, asOf: string) {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('A valid as-of instant is required.');
  return {
    asOf,
    record: (
      kind: 'inspection' | 'maintenance' | 'regulatory' | 'note',
      id: string,
      signal?: AbortSignal,
    ) => reader.record?.(kind, id, signal) ?? Promise.resolve(null),
    async overview(assetId: string, signal?: AbortSignal) {
      const context = await reader.context(assetId, asOf, signal);
      if (!context) return { status: 'not-found' as const, assetId, asOf, sources: [] as Source[] };
      const documents = await reader.procedures(assetId, signal);
      const primary = documents.find((doc) => doc.isPrimary);
      const rule = primary && readTemperatureRule(primary.markdown);
      const observation = context.observation;
      const targetedCorrections = context.notes.filter(
        (note) =>
          note.type === 'correction' &&
          note.inspectionId === observation?.id &&
          !isFalsePositiveCorrection(note.text),
      );
      const warnings = [
        'Administrative status, measured production and human explanations are separate claims.',
        'Notes are attributed claims; future maintenance completion times may be plans.',
      ];
      if (context.maintenanceTruncated)
        warnings.push(
          'Only the ten latest maintenance jobs are included; this is not an exhaustive history.',
        );
      if (!observation) warnings.push('No inspection found at or before the as-of instant.');
      if (!rule)
        warnings.push(
          'Applicable production rule is missing or unsupported; production is unknown.',
        );
      if (targetedCorrections.length)
        warnings.push(
          'Latest inspection has a formal correction requiring interpretation; status is withheld, originals retained.',
        );
      const production =
        observation && rule && !targetedCorrections.length
          ? {
              ...deriveProduction(observation.ambientC, observation.wellheadC, rule.thresholdC),
              thresholdC: rule.thresholdC,
              inputSourceIds: [observation.source.id, ...(primary ? [primary.source.id] : [])],
              explanation: `Compare the temperature DIFFERENCE, not absolute temperature: ${observation.wellheadC} - ${observation.ambientC} °C, against ${rule.thresholdC} °C.`,
            }
          : null;
      const sources = [
        context.asset.source,
        ...(observation ? [observation.source] : []),
        ...context.notes.map((note) => note.source),
        ...context.maintenance.map((job) => job.source),
      ];
      let ruleSource: Source | null = null;
      if (primary && rule) {
        ruleSource = {
          ...primary.source,
          locator: { startLine: rule.startLine, endLine: rule.endLine },
        };
        sources.push(ruleSource);
      }
      return {
        status: 'found' as const,
        asOf,
        ...context,
        production,
        ruleSource,
        sources,
        warnings,
      };
    },
    procedures: (assetId: string, signal?: AbortSignal) => reader.procedures(assetId, signal),
    read: (id: string, signal?: AbortSignal) => reader.readDocument(id, signal),
    search: reader.search.bind(reader),
  };
}

export type EvidenceService = ReturnType<typeof createEvidenceService>;
