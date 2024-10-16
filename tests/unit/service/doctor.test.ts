import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { examine } from '../../../src/service/doctor';
import { delistModel, insertAssembly } from '../../../src/storage/repositories/assemblies';
import { insertNotice } from '../../../src/storage/repositories/notices';
import { recalibrate, suspendTester } from '../../../src/storage/repositories/testers';
import { fileTest, fit, open, openOffice, walk, type Office } from '../../support/office';
import { takeAssemblyOut } from '../../../src/service/assemblies';

let office: Office;

function checks(asOf = '2024-11-01'): string[] {
  return examine(office.register, asOf).findings.map((finding) => finding.check);
}

beforeEach(() => {
  office = openOffice();
});

afterEach(() => {
  office.close();
});

describe('a register in order', () => {
  it('reports nothing at all', () => {
    const connectionId = open(office, { accountNumber: 'A-1' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-02-05' });
    expect(examine(office.register, '2024-06-01').findings).toEqual([]);
  });
});

describe('what it finds', () => {
  it('finds a connection nobody has walked', () => {
    open(office, { accountNumber: 'A-2' });
    expect(checks()).toContain('never surveyed');
  });

  it('finds two assemblies in the ground at one point', () => {
    const connectionId = open(office, { accountNumber: 'A-3' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    fit(office, { connectionId, installedOn: '2024-02-01' });
    // the service layer refuses this, so it is written straight to the store,
    // which is how it happens in real life: an import from the old system
    insertAssembly(office.register.db, {
      assemblyId: 'BA-99999',
      connectionId,
      scope: 'containment',
      assemblyClass: 'RP',
      modelId: 'WK-375',
      serialNumber: 'ghost',
      sizeInches: 2,
      installedOn: '2024-03-01',
      location: 'the other vault',
    });
    const examination = examine(office.register, '2024-11-01');
    expect(examination.faults).toBe(1);
    expect(examination.findings[0]?.check).toBe('two assemblies at one point');
  });

  it('notes an assembly whose model has come off the list', () => {
    const connectionId = open(office, { accountNumber: 'A-4' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    fit(office, { connectionId, installedOn: '2024-02-01' });
    delistModel(office.register.db, 'WK-375', '2024-06-01');
    expect(checks()).toContain('grandfathered model');
    expect(checks('2024-05-01')).not.toContain('grandfathered model');
  });

  it('warns about a suspended tester', () => {
    suspendTester(office.register.db, 'T-118', '2024-06-01', 'falsified reports');
    expect(checks()).toContain('certificate not current');
  });

  it('warns about a gauge that has run past its calibration', () => {
    recalibrate(office.register.db, 'G-77', '2024-01-05', 0.2);
    expect(checks('2045-01-01')).toContain('gauge out of calibration');
  });

  it('finds a report against an assembly that had already come out', () => {
    const connectionId = open(office, { accountNumber: 'A-5' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    const assemblyId = fit(office, { connectionId, installedOn: '2024-02-01' });
    fileTest(office, { assemblyId, testedOn: '2024-03-01' });
    takeAssemblyOut(office.register, assemblyId, '2024-02-15', 'cracked');
    const examination = examine(office.register, '2024-11-01');
    expect(examination.findings.map((finding) => finding.check)).toContain(
      'report against an assembly that had come out',
    );
  });

  it('warns about a letter nobody has answered in six months', () => {
    const connectionId = open(office, { accountNumber: 'A-6' });
    walk(office, connectionId, '2024-01-10', ['AUX_WELL']);
    insertNotice(office.register.db, {
      noticeId: 'N-000001',
      connectionId,
      stage: 'final',
      dueDate: '2023-01-01',
      issuedOn: '2023-02-01',
      ladder: 'health hazard',
      daysPastDue: 31,
      body: 'past due',
    });
    expect(checks()).toContain('notice open for a long time');
  });

  it('counts the faults and the warnings apart', () => {
    open(office, { accountNumber: 'A-7' });
    suspendTester(office.register.db, 'T-118', '2024-06-01', 'x');
    const examination = examine(office.register, '2024-11-01');
    expect(examination.faults).toBe(0);
    expect(examination.warnings).toBe(2);
  });
});
