import { describe, expect, it } from 'vitest';
import {
  applicationResultSchema,
  panelSchema,
  readParametersSchema,
  readRecipeSchema,
  savedViewDefinitionSchema,
} from './application.js';
import { applicationFixtureResult } from './application-fixtures.js';
import { fixtureVisual } from './fixtures.js';
import { visualSchema } from './index.js';

const fixture = () => structuredClone(applicationFixtureResult);
const required = <T>(value: T | null | undefined): T => {
  if (value === undefined || value === null) throw new Error('Synthetic fixture is incomplete');
  return value;
};

describe('application wire boundary', () => {
  it('preserves the legacy visual and synthetic exact decimals, unknown status and null geometry', () => {
    expect(visualSchema.parse(fixtureVisual)).toEqual(fixtureVisual);
    const result = applicationResultSchema.parse(fixture());
    expect(result.panels[0]?.geo?.features[0]?.geometry?.coordinates).toEqual([-102.1, 31.8]);
    expect(result.panels[0]?.geo?.features[1]?.geometry).toBeNull();
    expect(result.panels[1]?.status?.producing).toBeNull();
    expect(result.panels[1]?.rows[0]?.volumeBbl).toBe('0.125000');
  });

  it('checks evidence closure at panel, row, geo, series and matrix levels', () => {
    const mutations = [
      (value: ReturnType<typeof fixture>) => {
        required(value.panels[0]).evidenceIds = ['missing'];
      },
      (value: ReturnType<typeof fixture>) => {
        required(required(value.panels[1]).rows[0]).evidenceIds = ['missing'];
      },
      (value: ReturnType<typeof fixture>) => {
        required(required(required(value.panels[0]).geo).features[0]).properties.evidenceIds = [
          'missing',
        ];
      },
      (value: ReturnType<typeof fixture>) => {
        required(value.panels[0]).series = [
          {
            id: 's',
            label: 'Series',
            unit: 'C',
            points: [
              { id: 'p', at: '2026-10-17T12:00:00Z', value: '1.00', evidenceIds: ['missing'] },
            ],
          },
        ];
      },
      (value: ReturnType<typeof fixture>) => {
        required(value.panels[0]).matrix = {
          rows: [{ id: 'r', label: 'Row' }],
          columns: [{ id: 'c', label: 'Column' }],
          cells: [{ rowId: 'r', columnId: 'c', value: '1', evidenceIds: ['missing'] }],
        };
      },
    ];
    for (const mutate of mutations) {
      const value = fixture();
      mutate(value);
      expect(applicationResultSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects malformed coordinates, inexact decimal values and extra execution fields', () => {
    const value = fixture();
    required(required(required(required(value.panels[0]).geo).features[0]).geometry).coordinates = [
      31.8, -102.1,
    ];
    expect(applicationResultSchema.safeParse(value).success).toBe(false);
    expect(
      panelSchema.safeParse({ ...fixture().panels[1], rows: [{ volumeBbl: 0.125 }] }).success,
    ).toBe(false);
    expect(panelSchema.safeParse({ ...fixture().panels[1], code: 'run()' }).success).toBe(false);
    expect(
      panelSchema.safeParse({ ...fixture().panels[1], rows: [{ volumeBbl: '1e-3' }] }).success,
    ).toBe(false);
  });

  it('enforces bounded ordered windows and approved recipes', () => {
    const parameters = {
      scope: { kind: 'fleet' },
      window: { from: '2026-10-01', through: '2026-10-17' },
    };
    expect(readParametersSchema.parse(parameters).limit).toBe(100);
    expect(readParametersSchema.safeParse({ ...parameters, limit: 501 }).success).toBe(false);
    expect(
      readParametersSchema.safeParse({
        ...parameters,
        window: { from: '2026-10-17', through: '2026-10-01' },
      }).success,
    ).toBe(false);
    expect(
      readRecipeSchema.safeParse({ operation: 'spills', presentation: 'geo', parameters }).success,
    ).toBe(true);
    expect(
      readRecipeSchema.safeParse({ operation: 'downtime', presentation: 'geo', parameters })
        .success,
    ).toBe(false);
    expect(
      readRecipeSchema.safeParse({
        operation: 'spills',
        presentation: 'table',
        groupBy: 'area-month',
        parameters,
      }).success,
    ).toBe(false);
    expect(
      readRecipeSchema.safeParse({
        operation: 'repair-costs',
        presentation: 'table',
        parameters: { scope: { kind: 'fleet' } },
      }).success,
    ).toBe(false);
    expect(
      panelSchema.safeParse({
        ...fixture().panels[0],
        series: [
          {
            id: 's',
            label: 'Series',
            unit: 'C',
            points: [{ id: 'p', at: '2026-10-01', value: '1', evidenceIds: [] }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts only real calendar dates in read windows', () => {
    const parseWindow = (from: string, through = from) =>
      readParametersSchema.safeParse({
        scope: { kind: 'fleet' },
        window: { from, through },
      });
    expect(parseWindow('2024-02-29').success).toBe(true);
    for (const invalid of [
      '2026-02-29',
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-2-01',
      '2026-10-01T00:00:00Z',
      '2026-10-01T23:30:00-08:00',
    ]) {
      expect(parseWindow(invalid).success).toBe(false);
      expect(parseWindow('2026-01-01', invalid).success).toBe(false);
    }
  });

  it('preserves saved panel IDs while rejecting duplicate IDs and arbitrary queries', () => {
    const panel = {
      id: 'stable-panel',
      title: 'Status',
      recipe: {
        operation: 'current-status',
        presentation: 'status',
        parameters: { scope: { kind: 'fleet' } },
      },
    };
    expect(savedViewDefinitionSchema.parse({ name: 'View', panels: [panel] }).panels[0]?.id).toBe(
      'stable-panel',
    );
    expect(
      savedViewDefinitionSchema.safeParse({ name: 'View', panels: [panel, panel] }).success,
    ).toBe(false);
    expect(
      savedViewDefinitionSchema.safeParse({ name: 'View', panels: [panel], sql: 'select *' })
        .success,
    ).toBe(false);
  });
});
