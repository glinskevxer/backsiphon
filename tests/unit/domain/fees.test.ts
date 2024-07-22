import { describe, expect, it } from 'vitest';

import {
  annualFeeCents,
  bandFor,
  buildInvoice,
  FEE_BANDS,
  formatCents,
  penaltyLines,
  REINSPECTION_CENTS,
} from '../../../src/domain/fees';

describe('the size bands', () => {
  it('rise with size and cover everything', () => {
    let previous = 0;
    for (const band of FEE_BANDS) {
      expect(band.annualCents).toBeGreaterThan(previous);
      previous = band.annualCents;
    }
    expect(FEE_BANDS[FEE_BANDS.length - 1]?.maxSizeInches).toBe(Number.POSITIVE_INFINITY);
  });

  it('takes the band the size falls in, inclusive at the top', () => {
    expect(bandFor(0.75).code).toBe('B1');
    expect(bandFor(1).code).toBe('B1');
    expect(bandFor(1.5).code).toBe('B2');
    expect(bandFor(2).code).toBe('B2');
    expect(bandFor(10).code).toBe('B5');
  });
});

describe('the annual fee', () => {
  it('follows the class as well as the size', () => {
    expect(annualFeeCents('DC', 2)).toBe(7800);
    expect(annualFeeCents('RP', 2)).toBe(9750);
    expect(annualFeeCents('RPDA', 2)).toBe(11700);
  });

  it('charges least for a connection that was broken open', () => {
    expect(annualFeeCents('AG', 2)).toBeLessThan(annualFeeCents('DC', 2));
    expect(annualFeeCents('AVB', 1)).toBeLessThan(annualFeeCents('PVB', 1));
  });

  it('rises with the pipe', () => {
    expect(annualFeeCents('RP', 6)).toBeGreaterThan(annualFeeCents('RP', 2));
  });
});

describe('penalties', () => {
  it('are nothing at the first notice', () => {
    expect(penaltyLines({ stage: 'first', degree: 'nonhealth', reinspections: 0 })).toEqual([]);
    expect(penaltyLines({ stage: 'none', degree: 'nonhealth', reinspections: 0 })).toEqual([]);
  });

  it('build up as the ladder is climbed', () => {
    const second = penaltyLines({ stage: 'second', degree: 'nonhealth', reinspections: 0 });
    expect(second.map((line) => line.code)).toEqual(['LATE1']);
    const final = penaltyLines({ stage: 'final', degree: 'nonhealth', reinspections: 0 });
    expect(final.map((line) => line.code)).toEqual(['LATE1', 'LATE2']);
    const shutoff = penaltyLines({ stage: 'shutoff', degree: 'nonhealth', reinspections: 0 });
    expect(shutoff.map((line) => line.code)).toEqual(['LATE1', 'LATE2', 'SHUTOFF']);
  });

  it('charge for each visit somebody had to make', () => {
    const lines = penaltyLines({ stage: 'first', degree: 'nonhealth', reinspections: 2 });
    expect(lines[0]?.cents).toBe(REINSPECTION_CENTS * 2);
    expect(lines[0]?.description).toContain('2 reinspection visits');
  });

  it('add a quarter on a health hazard', () => {
    const lines = penaltyLines({ stage: 'second', degree: 'health', reinspections: 0 });
    expect(lines.map((line) => line.code)).toEqual(['LATE1', 'HEALTH']);
    expect(lines[1]?.cents).toBe(1125);
  });

  it('add nothing on a health hazard with no penalties to surcharge', () => {
    expect(penaltyLines({ stage: 'first', degree: 'health', reinspections: 0 })).toEqual([]);
  });
});

describe('an invoice', () => {
  it('bills the class the office asked for', () => {
    const invoice = buildInvoice({
      requiredClass: 'RP',
      sizeInches: 2,
      penalties: { stage: 'none', degree: 'health', reinspections: 0 },
    });
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.totalCents).toBe(9750);
    expect(invoice.lines[0]?.description).toContain('RP over one up to two inches');
  });

  it('bills the varied class rather than the underlying one', () => {
    const varied = buildInvoice({
      requiredClass: 'DC',
      sizeInches: 2,
      penalties: { stage: 'none', degree: 'health', reinspections: 0 },
    });
    expect(varied.totalCents).toBe(7800);
  });

  it('bills nothing annual where nothing is required', () => {
    const invoice = buildInvoice({
      sizeInches: 2,
      penalties: { stage: 'none', degree: 'none', reinspections: 0 },
    });
    expect(invoice.lines).toEqual([]);
    expect(invoice.totalCents).toBe(0);
  });

  it('adds the penalties to the annual fee', () => {
    const invoice = buildInvoice({
      requiredClass: 'RP',
      sizeInches: 2,
      penalties: { stage: 'shutoff', degree: 'health', reinspections: 1 },
    });
    expect(invoice.lines.map((line) => line.code)).toEqual([
      'ANNUAL-B2',
      'LATE1',
      'LATE2',
      'SHUTOFF',
      'REINSP',
      'HEALTH',
    ]);
    expect(invoice.totalCents).toBe(9750 + 4500 + 9000 + 18500 + 9500 + 10375);
  });
});

describe('reading an amount', () => {
  it('writes cents as an amount', () => {
    expect(formatCents(9750)).toBe('97.50');
    expect(formatCents(4)).toBe('0.04');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(100000)).toBe('1000.00');
    expect(formatCents(-250)).toBe('-2.50');
  });
});
