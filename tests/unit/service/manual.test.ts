import { describe, expect, it } from 'vitest';

import {
  assemblySection,
  feeSection,
  hazardSection,
  ladderSection,
  manualSections,
  premiseSection,
  procedureSection,
} from '../../../src/service/manual';
import { HAZARD_FINDINGS } from '../../../src/domain/hazard';
import { PREMISE_USES } from '../../../src/domain/premise';

describe('the handbook', () => {
  it('prints every finding the program knows', () => {
    const section = hazardSection();
    expect(section.rows).toHaveLength(HAZARD_FINDINGS.length);
    expect(section.rows[0]?.[0]).toBe('AUX_WELL');
  });

  it('prints every premise use', () => {
    expect(premiseSection().rows).toHaveLength(PREMISE_USES.length);
  });

  it('says which classes stand in for which', () => {
    const rows = assemblySection().rows;
    const doubleCheck = rows.find((row) => row[0] === 'DC');
    expect(doubleCheck?.[6]).toContain('RP');
    const airGap = rows.find((row) => row[0] === 'AG');
    expect(airGap?.[6]).toBe('AG');
  });

  it('prints the readings each procedure asks for and the threshold', () => {
    const rows = procedureSection().rows;
    const relief = rows.find((row) => row[0] === 'RP' && row[1] === 'reliefOpening');
    expect(relief?.[3]).toBe('at least 2');
    const buffer = rows.find((row) => row[0] === 'RP' && row[1]?.includes('over'));
    expect(buffer?.[3]).toBe('at least 3');
  });

  it('says a class with no procedure has none', () => {
    const rows = procedureSection().rows;
    expect(rows.find((row) => row[0] === 'AVB')?.[1]).toBe('no field procedure');
  });

  it('prints both ladders', () => {
    const rows = ladderSection().rows;
    expect(rows.filter((row) => row[0] === 'health hazard')).toHaveLength(4);
    expect(rows.find((row) => row[0] === 'standard' && row[1] === 'shutoff')?.[2]).toBe(
      '60 days past due',
    );
  });

  it('prints the fee bands as money rather than cents', () => {
    const rows = feeSection().rows;
    expect(rows[0]?.[2]).toBe('42.00');
    expect(rows[0]?.[3]).toBe('52.50');
  });

  it('has six sections and every one of them has rows', () => {
    const sections = manualSections();
    expect(sections).toHaveLength(6);
    for (const section of sections) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row).toHaveLength(section.headers.length);
      }
    }
  });
});
