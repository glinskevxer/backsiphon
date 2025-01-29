/**
 * How each approved model is doing in the ground.
 *
 * The approval list says a model was acceptable when the laboratory looked at
 * one. This says what the district's own experience of it has been, which is
 * the number the office takes to the state when it asks for a model to come
 * off the list: how many are fitted, how old they are, and how often the ones
 * fitted here fail their first test of the year.
 */

import { daysBetween, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import { approvalStatus, buildApprovalList } from '../domain/approvals';
import type { AssemblyClass } from '../domain/assembly';
import { listAssemblies, listModels } from '../storage/repositories/assemblies';
import { reportsForAssembly } from '../storage/repositories/reports';
import type { Register } from './register';

export interface ModelRecord {
  readonly modelId: string;
  readonly maker: string;
  readonly assemblyClass: AssemblyClass;
  readonly listing: 'listed' | 'delisted' | 'unknown';
  readonly fitted: number;
  readonly removed: number;
  /** Mean age in years of the ones still in the ground. */
  readonly meanAgeYears: number;
  readonly oldest?: CivilDate;
  readonly testsJudged: number;
  readonly firstTimeFailures: number;
  /** Of the tests the office accepted, how many the tester had to repair. */
  readonly repairRate?: number;
}

export function fleetRecord(register: Register, asOf: CivilDate): Result<ModelRecord[], string> {
  const list = buildApprovalList(listModels(register.db));
  if (!list.ok) {
    return err(list.error);
  }

  const records: ModelRecord[] = [];
  const assemblies = listAssemblies(register.db);

  for (const model of listModels(register.db)) {
    const ofModel = assemblies.filter((assembly) => assembly.modelId === model.modelId);
    const live = ofModel.filter(
      (assembly) => assembly.removedOn === undefined || assembly.removedOn > asOf,
    );
    const ages = live.map((assembly) => daysBetween(assembly.installedOn, asOf) / 365.25);

    let judged = 0;
    let firstTimeFailures = 0;
    let repairs = 0;
    for (const assembly of ofModel) {
      for (const stored of reportsForAssembly(register.db, assembly.assemblyId)) {
        if (!stored.admissible || stored.report.testedOn > asOf) {
          continue;
        }
        judged += 1;
        if (stored.asFoundOutcome === 'fail' || stored.asFoundOutcome === 'marginal') {
          firstTimeFailures += 1;
        }
        if (stored.report.repairMade) {
          repairs += 1;
        }
      }
    }

    records.push({
      modelId: model.modelId,
      maker: model.maker,
      assemblyClass: model.assemblyClass,
      listing: approvalStatus(list.value, model.modelId, asOf),
      fitted: live.length,
      removed: ofModel.length - live.length,
      meanAgeYears: ages.length === 0 ? 0 : round(mean(ages)),
      ...(live.length === 0
        ? {}
        : { oldest: live.map((assembly) => assembly.installedOn).sort()[0] }),
      testsJudged: judged,
      firstTimeFailures,
      ...(judged === 0 ? {} : { repairRate: round(repairs / judged) }),
    });
  }

  return ok(records.sort((left, right) => right.fitted - left.fitted));
}

/**
 * The rate the office argues from. It is only worth quoting once there are
 * enough tests behind it, so it is undefined rather than misleading below the
 * floor.
 */
export const MEANINGFUL_TEST_COUNT = 10;

export function firstTimeFailureRate(record: ModelRecord): number | undefined {
  if (record.testsJudged < MEANINGFUL_TEST_COUNT) {
    return undefined;
  }
  return round(record.firstTimeFailures / record.testsJudged);
}

function mean(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
