/**
 * Judging the readings.
 *
 * The threshold is not the whole story. A gauge is certified to a band, and a
 * reading that sits inside that band of the threshold has not been shown to
 * fail. Those are marginal: the assembly comes off the passing list and goes
 * onto the repair list, but the tester is not accused of finding a failure the
 * gauge could not have seen.
 */

import type { AssemblyClass } from './assembly';
import { minimumFor, procedureFor, type BufferRule, type ProcedureStep } from './procedure';
import { effectiveReadings, missingReadings, strayReadings, type Readings, type TestReport } from './report';

export type Outcome = 'pass' | 'marginal' | 'fail' | 'incomplete';

export type ReadingVerdict = 'pass' | 'marginal' | 'fail' | 'missing' | 'wrong_type';

export interface ReadingJudgement {
  readonly key: string;
  readonly verdict: ReadingVerdict;
  readonly value?: number | boolean;
  readonly minimum?: number;
  readonly note: string;
}

export interface Evaluation {
  readonly outcome: Outcome;
  /** Which set of readings the outcome was taken from. */
  readonly phase: 'as_found' | 'as_left';
  /** What the assembly was like before anybody touched it. */
  readonly asFoundOutcome: Outcome;
  readonly judgements: ReadingJudgement[];
  readonly notes: string[];
}

const OUTCOME_RANK: Record<Outcome, number> = {
  pass: 0,
  marginal: 1,
  fail: 2,
  incomplete: 3,
};

export function worseOutcome(left: Outcome, right: Outcome): Outcome {
  return OUTCOME_RANK[left] >= OUTCOME_RANK[right] ? left : right;
}

export interface EvaluationContext {
  /** The band the gauge is certified to, in psid. */
  readonly gaugeAccuracyPsid: number;
  /** Nominal size, which is what an air gap is measured against. */
  readonly sizeInches: number;
}

export function evaluate(report: TestReport, context: EvaluationContext): Evaluation {
  const asFound = judgeReadings(report.assemblyClassTested, report.asFound, context);
  const effective = report.asLeft === undefined ? asFound : judgeReadings(report.assemblyClassTested, effectiveReadings(report), context);

  const notes = [...effective.notes];
  if (report.asLeft !== undefined) {
    notes.unshift(
      `judged on the as left readings, the assembly was ${asFound.outcome} when the tester arrived`,
    );
  }

  return {
    outcome: effective.outcome,
    phase: report.asLeft === undefined ? 'as_found' : 'as_left',
    asFoundOutcome: asFound.outcome,
    judgements: effective.judgements,
    notes,
  };
}

interface PhaseJudgement {
  readonly outcome: Outcome;
  readonly judgements: ReadingJudgement[];
  readonly notes: string[];
}

function judgeReadings(
  assemblyClass: AssemblyClass,
  readings: Readings,
  context: EvaluationContext,
): PhaseJudgement {
  const procedure = procedureFor(assemblyClass);
  if (!procedure.ok) {
    return {
      outcome: 'incomplete',
      judgements: [],
      notes: [procedure.error],
    };
  }

  const judgements: ReadingJudgement[] = [];
  const notes: string[] = [];

  for (const key of missingReadings(assemblyClass, readings)) {
    judgements.push({
      key,
      verdict: 'missing',
      note: `the ${assemblyClass} procedure wants ${key} and the form has no reading for it`,
    });
  }

  const stray = strayReadings(assemblyClass, readings);
  if (stray.length > 0) {
    notes.push(`readings that do not belong on a ${assemblyClass} form: ${stray.join(', ')}`);
  }

  for (const step of procedure.value.steps) {
    const value = readings[step.key];
    if (value === undefined) {
      continue;
    }
    judgements.push(judgeStep(step, value, context));
  }

  if (procedure.value.bufferRule !== undefined) {
    const buffer = judgeBuffer(procedure.value.bufferRule, readings, context);
    if (buffer !== undefined) {
      judgements.push(buffer);
    }
  }

  const outcome = judgements.reduce<Outcome>(
    (worst, judgement) => worseOutcome(worst, outcomeOf(judgement.verdict)),
    'pass',
  );

  return { outcome, judgements, notes };
}

function judgeStep(
  step: ProcedureStep,
  value: number | boolean,
  context: EvaluationContext,
): ReadingJudgement {
  if (step.kind === 'tightness') {
    if (typeof value !== 'boolean') {
      return {
        key: step.key,
        verdict: 'wrong_type',
        value,
        note: `${step.key} is a yes or no on the form and a number was filed`,
      };
    }
    return {
      key: step.key,
      verdict: value ? 'pass' : 'fail',
      value,
      note: value ? `${step.label} held` : `${step.label} did not hold`,
    };
  }

  if (typeof value !== 'number') {
    return {
      key: step.key,
      verdict: 'wrong_type',
      value,
      note: `${step.key} is a reading and a yes or no was filed`,
    };
  }

  const minimum = minimumFor(step, context.sizeInches);
  if (minimum === undefined) {
    return { key: step.key, verdict: 'pass', value, note: `${step.label} recorded` };
  }

  const band = step.kind === 'separation' ? 0 : context.gaugeAccuracyPsid;
  if (value >= minimum) {
    return {
      key: step.key,
      verdict: 'pass',
      value,
      minimum,
      note: `${step.label} read ${value} against a minimum of ${minimum}`,
    };
  }
  if (value >= minimum - band) {
    return {
      key: step.key,
      verdict: 'marginal',
      value,
      minimum,
      note:
        `${step.label} read ${value} against a minimum of ${minimum}, ` +
        `inside the ${band} the gauge is certified to`,
    };
  }
  return {
    key: step.key,
    verdict: 'fail',
    value,
    minimum,
    note: `${step.label} read ${value} against a minimum of ${minimum}`,
  };
}

/**
 * The relief valve rule. Both readings can clear their own minimum and the
 * assembly still fails, because what matters is the gap between them.
 */
function judgeBuffer(
  rule: BufferRule,
  readings: Readings,
  context: EvaluationContext,
): ReadingJudgement | undefined {
  const higher = readings[rule.higher];
  const lower = readings[rule.lower];
  if (typeof higher !== 'number' || typeof lower !== 'number') {
    return undefined;
  }
  const gap = higher - lower;
  const key = `${rule.higher}:${rule.lower}`;
  if (gap >= rule.marginPsid) {
    return {
      key,
      verdict: 'pass',
      value: gap,
      minimum: rule.marginPsid,
      note: `${rule.note}, and it held ${gap} above it`,
    };
  }
  if (gap >= rule.marginPsid - context.gaugeAccuracyPsid) {
    return {
      key,
      verdict: 'marginal',
      value: gap,
      minimum: rule.marginPsid,
      note: `${rule.note}, and the gap of ${gap} is inside the gauge band of it`,
    };
  }
  return {
    key,
    verdict: 'fail',
    value: gap,
    minimum: rule.marginPsid,
    note: `${rule.note}, and the gap was only ${gap}`,
  };
}

function outcomeOf(verdict: ReadingVerdict): Outcome {
  if (verdict === 'missing' || verdict === 'wrong_type') {
    return 'incomplete';
  }
  return verdict;
}
