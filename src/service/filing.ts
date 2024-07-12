/**
 * Filing a test report.
 *
 * The order here is the point of the module. The office rules on whether it
 * can take the paperwork before it reads a single number, because a report it
 * cannot take is not a failing test: the assembly is untested, the due date
 * does not move, and the letters keep coming. Then it judges the readings.
 * Then, and only for a report that was both accepted and passing, it clears
 * the notices.
 */

import type { CivilDate } from '../util/dates';
import { REPORT_ID } from '../util/ids';
import { err, ok, type Result } from '../util/result';
import {
  ruleOnAdmissibility,
  type AdmissibilityRuling,
  type InadmissibilityCode,
} from '../domain/admissibility';
import { evaluate, type Evaluation } from '../domain/evaluation';
import { parseReport, type Readings, type TestReport } from '../domain/report';
import { withTransaction } from '../storage/db';
import { findAssembly } from '../storage/repositories/assemblies';
import { appendEvent } from '../storage/repositories/events';
import { clearNotices } from '../storage/repositories/notices';
import { insertReport, type StoredReport } from '../storage/repositories/reports';
import { findGauge, findTester } from '../storage/repositories/testers';
import { mintId, type Register } from './register';

export interface FilingInput {
  readonly assemblyId: string;
  readonly testerId: string;
  readonly gaugeId: string;
  readonly testedOn: CivilDate;
  readonly filedOn: CivilDate;
  readonly asFound: Readings;
  readonly repairMade: boolean;
  readonly asLeft?: Readings;
  readonly repairNote?: string;
  readonly remarks?: string;
}

export interface FilingOutcome {
  readonly stored: StoredReport;
  readonly ruling: AdmissibilityRuling;
  readonly evaluation: Evaluation;
  readonly noticesCleared: number;
  /** True where the tester found a different class from the one on file. */
  readonly classMismatch: boolean;
}

export function fileReport(register: Register, input: FilingInput): Result<FilingOutcome, string> {
  const assembly = findAssembly(register.db, input.assemblyId);
  if (assembly === undefined) {
    return err(`there is no assembly with the id ${input.assemblyId}`);
  }
  if (assembly.removedOn !== undefined && assembly.removedOn <= input.testedOn) {
    return err(
      `the assembly ${input.assemblyId} came out on ${assembly.removedOn}, ` +
        `it cannot have been tested on ${input.testedOn}`,
    );
  }
  if (input.testedOn < assembly.installedOn) {
    return err(
      `the assembly ${input.assemblyId} went in on ${assembly.installedOn}, ` +
        `it cannot have been tested on ${input.testedOn}`,
    );
  }

  const report: TestReport = {
    reportId: mintId(register, REPORT_ID, 'test_reports', 'report_id'),
    assemblyId: input.assemblyId,
    testerId: input.testerId,
    gaugeId: input.gaugeId,
    assemblyClassTested: assembly.assemblyClass,
    testedOn: input.testedOn,
    filedOn: input.filedOn,
    asFound: input.asFound,
    repairMade: input.repairMade,
    ...(input.asLeft === undefined ? {} : { asLeft: input.asLeft }),
    ...(input.repairNote === undefined ? {} : { repairNote: input.repairNote }),
    ...(input.remarks === undefined ? {} : { remarks: input.remarks }),
  };

  const parsed = parseReport(report);
  if (!parsed.ok) {
    return err(parsed.error.join('; '));
  }

  // The store will not hold a report naming a tester or a gauge it has never
  // heard of, and it should not: the office registers both before it takes
  // work from them. So this is refused at the counter rather than filed and
  // then ruled inadmissible.
  const tester = findTester(register.db, input.testerId);
  if (tester === undefined) {
    return err(`no certificate on file for the tester ${input.testerId}, register them first`);
  }
  const gauge = findGauge(register.db, input.gaugeId);
  if (gauge === undefined) {
    return err(`no gauge on file with the id ${input.gaugeId}, register it first`);
  }
  const ruling = ruleOnAdmissibility({
    report,
    tester,
    gauge,
    filingWindowDays: register.policy.filingWindowDays,
  });

  const evaluation = evaluate(report, {
    gaugeAccuracyPsid: gauge.accuracyPsid,
    sizeInches: assembly.sizeInches,
  });

  const stored: StoredReport = {
    report,
    admissible: ruling.admissible,
    inadmissibleCodes: ruling.reasons.map((reason) => reason.code) as InadmissibilityCode[],
    outcome: evaluation.outcome,
    asFoundOutcome: evaluation.asFoundOutcome,
    recordedAt: register.now(),
  };

  return withTransaction(register.db, () => {
    const written = insertReport(register.db, stored);
    if (!written.ok) {
      return written;
    }
    let noticesCleared = 0;
    if (ruling.admissible && evaluation.outcome === 'pass') {
      const cleared = clearNotices(register.db, assembly.connectionId, input.filedOn);
      noticesCleared = cleared.ok ? cleared.value : 0;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: ruling.admissible ? 'report_filed' : 'report_refused',
      subjectKind: 'report',
      subjectId: report.reportId,
      detail: describeFiling(report, ruling, evaluation),
    });
    return ok({
      stored,
      ruling,
      evaluation,
      noticesCleared,
      classMismatch: false,
    });
  });
}

function describeFiling(
  report: TestReport,
  ruling: AdmissibilityRuling,
  evaluation: Evaluation,
): string {
  const head = `${report.assemblyId} tested ${report.testedOn} by ${report.testerId}`;
  if (!ruling.admissible) {
    return `${head}, refused: ${ruling.reasons.map((reason) => reason.code).join(', ')}`;
  }
  return `${head}, ${evaluation.outcome} on the ${evaluation.phase} readings`;
}
