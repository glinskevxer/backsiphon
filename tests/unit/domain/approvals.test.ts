import { describe, expect, it } from 'vitest';

import {
  approvalStatus,
  buildApprovalList,
  installationAllowed,
  modelById,
  modelsOfClass,
  relocationAllowed,
  remedyFor,
  type ApprovalList,
  type AssemblyModel,
} from '../../../src/domain/approvals';

const MODELS: AssemblyModel[] = [
  {
    modelId: 'WK-375',
    maker: 'watkin',
    model: '375 series',
    assemblyClass: 'RP',
    sizes: [0.75, 1, 1.5, 2],
    listedOn: '2016-04-01',
    note: 'the workhorse on commercial services',
  },
  {
    modelId: 'WK-350',
    maker: 'watkin',
    model: '350 series',
    assemblyClass: 'DC',
    sizes: [0.75, 1, 2, 3, 4],
    listedOn: '2014-01-15',
    delistedOn: '2022-09-30',
    note: 'came off the list when the laboratory changed the check test',
  },
  {
    modelId: 'CB-40S',
    maker: 'cobern',
    model: '40 spill resistant',
    assemblyClass: 'SVB',
    sizes: [0.75, 1],
    listedOn: '2019-11-12',
    note: 'indoor lab risers',
  },
  {
    modelId: 'HN-900DA',
    maker: 'hanmore',
    model: '900 detector',
    assemblyClass: 'DCDA',
    sizes: [4, 6, 8, 10],
    listedOn: '2018-02-20',
    note: 'fire loops',
  },
];

function list(): ApprovalList {
  const built = buildApprovalList(MODELS);
  if (!built.ok) {
    throw new Error(built.error);
  }
  return built.value;
}

describe('building the list', () => {
  it('indexes by model id', () => {
    expect(modelById(list(), 'WK-375')?.maker).toBe('watkin');
    expect(modelById(list(), 'NOPE')).toBeUndefined();
  });

  it('refuses a duplicate model', () => {
    const built = buildApprovalList([...MODELS, MODELS[0] as AssemblyModel]);
    expect(built.ok).toBe(false);
  });

  it('refuses a delisting that lands before the listing', () => {
    const built = buildApprovalList([
      { ...(MODELS[0] as AssemblyModel), delistedOn: '2015-01-01' },
    ]);
    expect(built.ok).toBe(false);
  });

  it('refuses a model listed at no sizes and one with a bad date', () => {
    expect(buildApprovalList([{ ...(MODELS[0] as AssemblyModel), sizes: [] }]).ok).toBe(false);
    expect(
      buildApprovalList([{ ...(MODELS[0] as AssemblyModel), listedOn: 'april 2016' }]).ok,
    ).toBe(false);
  });
});

describe('status on a day', () => {
  it('reads unknown before the listing date', () => {
    expect(approvalStatus(list(), 'WK-375', '2016-03-31')).toBe('unknown');
    expect(approvalStatus(list(), 'WK-375', '2016-04-01')).toBe('listed');
  });

  it('reads delisted from the day it came off', () => {
    expect(approvalStatus(list(), 'WK-350', '2022-09-29')).toBe('listed');
    expect(approvalStatus(list(), 'WK-350', '2022-09-30')).toBe('delisted');
  });

  it('reads unknown for a model nobody has heard of', () => {
    expect(approvalStatus(list(), 'ZZ-1', '2024-01-01')).toBe('unknown');
  });
});

describe('installing', () => {
  const install = {
    modelId: 'WK-375',
    assemblyClass: 'RP' as const,
    sizeInches: 2,
    installedOn: '2024-05-06',
  };

  it('takes a listed model at a listed size', () => {
    expect(installationAllowed(list(), install).ok).toBe(true);
  });

  it('refuses a model that is not on the list', () => {
    const result = installationAllowed(list(), { ...install, modelId: 'ZZ-1' });
    expect(result.ok).toBe(false);
  });

  it('refuses a model that had not been listed yet', () => {
    const result = installationAllowed(list(), { ...install, installedOn: '2016-01-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not listed until');
    }
  });

  it('refuses a model that has come off the list', () => {
    const result = installationAllowed(list(), {
      modelId: 'WK-350',
      assemblyClass: 'DC',
      sizeInches: 2,
      installedOn: '2023-01-04',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('came off the list');
    }
  });

  it('refuses a model fitted as the wrong class', () => {
    const result = installationAllowed(list(), { ...install, assemblyClass: 'DC' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('listed as a RP');
    }
  });

  it('refuses a size the listing does not cover', () => {
    const result = installationAllowed(list(), { ...install, sizeInches: 6 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not listed at 6 inches');
    }
  });
});

describe('what happens after a failure', () => {
  it('lets a listed model be repaired', () => {
    expect(remedyFor(list(), 'WK-375', '2024-06-01')).toBe('repair');
  });

  it('makes a delisted model a replacement', () => {
    expect(remedyFor(list(), 'WK-350', '2024-06-01')).toBe('replace');
  });

  it('treats a model nobody can find the same way', () => {
    expect(remedyFor(list(), 'ZZ-1', '2024-06-01')).toBe('replace');
  });

  it('will not let a grandfathered assembly be moved and reused', () => {
    const result = relocationAllowed(list(), {
      modelId: 'WK-350',
      assemblyClass: 'DC',
      sizeInches: 2,
      installedOn: '2024-06-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('cannot be moved');
    }
  });

  it('lets a listed assembly be moved', () => {
    const result = relocationAllowed(list(), {
      modelId: 'CB-40S',
      assemblyClass: 'SVB',
      sizeInches: 1,
      installedOn: '2024-06-01',
    });
    expect(result.ok).toBe(true);
  });
});

describe('slicing the list', () => {
  it('finds every model of a class in a stable order', () => {
    expect(modelsOfClass(list(), 'RP').map((model) => model.modelId)).toEqual(['WK-375']);
    expect(modelsOfClass(list(), 'DCDA').map((model) => model.modelId)).toEqual(['HN-900DA']);
    expect(modelsOfClass(list(), 'AVB')).toEqual([]);
  });
});
