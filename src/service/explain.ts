/**
 * Saying out loud how the register reached its answer.
 *
 * Every rule that decides anything already carries its reasons. This gathers
 * them in the order they were applied, which is the order somebody has to hear
 * them in to be argued out of a complaint. It reads state and writes nothing.
 */

import type { ComplianceStatus, PointCompliance } from './compliance';

export interface Explanation {
  readonly heading: string;
  readonly lines: ReadonlyArray<string>;
}

export function explainStatus(status: ComplianceStatus): Explanation[] {
  return [
    surveyExplanation(status),
    pointExplanation(status.containment),
    pointExplanation(status.isolation),
    standingExplanation(status),
  ];
}

function surveyExplanation(status: ComplianceStatus): Explanation {
  const survey = status.protection.survey;
  const lines = [
    `${survey.surveyId} was walked on ${survey.surveyedOn} by ${survey.surveyor}`,
    survey.accessGranted
      ? `the premise is registered as ${survey.premiseUseCode}`
      : `the surveyor was kept out, so the meter is treated as a health hazard`,
    survey.findingCodes.length === 0
      ? 'the surveyor wrote down no findings'
      : `findings: ${survey.findingCodes.join(', ')}`,
    `that reads ${survey.containmentDegree} at the meter and ${survey.isolationDegree} inside`,
    `the basis for the degree at the meter is ${survey.basis}`,
  ];
  if (survey.backpressure) {
    lines.push('something here can push back under pressure, which rules out a vacuum breaker');
  }
  if (survey.airGapRequired) {
    lines.push('one of the findings is not accepted behind any assembly at all');
  }
  lines.push(`the next survey is due ${survey.nextSurveyDue}`);
  return { heading: 'the survey', lines };
}

function pointExplanation(point: PointCompliance): Explanation {
  const lines: string[] = [...point.point.required.reasons];

  if (point.point.varianceId !== undefined) {
    lines.push(
      `variance ${point.point.varianceId} reads ${point.point.varianceStatus ?? 'unknown'}` +
        (point.point.varianceStatus === 'in_effect'
          ? `, so a ${point.point.effectiveClass ?? 'nothing'} is accepted here instead`
          : ', so it changes nothing today'),
    );
  }

  lines.push(...point.point.deficiency.reasons);

  if (point.due !== undefined) {
    lines.push(`the test is due ${point.due.due}, ${point.due.note}`);
  } else if (point.assembly === undefined) {
    lines.push('nothing is fitted here, so nothing is on a test cycle');
  } else {
    lines.push(`a ${point.assembly.assemblyClass} is not field tested, it is looked at`);
  }

  if (point.delinquency !== undefined) {
    lines.push(...point.delinquency.reasons);
    if (point.delinquency.stage !== 'none') {
      lines.push(`the ladder has reached the ${point.delinquency.stage} notice`);
    }
    if (point.delinquency.nextStage !== undefined) {
      lines.push(
        `the ${point.delinquency.nextStage} notice falls due ${point.delinquency.nextStageOn ?? 'later'}`,
      );
    }
  }

  return { heading: `${point.scope} protection`, lines };
}

function standingExplanation(status: ComplianceStatus): Explanation {
  return {
    heading: 'where that leaves it',
    lines: [
      ...status.reasons,
      `standing: ${status.standing}`,
      `urgency: ${status.urgency}`,
      status.shutoffEligible
        ? 'the service may be shut off'
        : 'the service may not be shut off today',
    ],
  };
}

/** The whole explanation as plain lines, for a letter or a note on a file. */
export function explanationLines(explanations: ReadonlyArray<Explanation>): string[] {
  const lines: string[] = [];
  for (const explanation of explanations) {
    lines.push(explanation.heading, '-'.repeat(explanation.heading.length));
    for (const line of explanation.lines) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }
  return lines;
}
