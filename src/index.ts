/**
 * The public surface of the register.
 *
 * Everything a caller outside this package should touch is re-exported here.
 * The command line is a caller like any other, so it imports from this file
 * rather than reaching into the domain modules.
 */

export {
  acceptableSubstitutes,
  allowedInScope,
  assemblyClassByCode,
  ASSEMBLY_CLASSES,
  isTestable,
  missingCapabilities,
  satisfies,
  specOf,
  type AssemblyCapabilities,
  type AssemblyClass,
  type AssemblyClassSpec,
} from './domain/assembly';

export {
  compareToRequirement,
  isActive,
  type Deficiency,
  type DeficiencyKind,
  type InstalledAssembly,
  type ProtectionScope,
  type Urgency,
} from './domain/deficiency';

export {
  degreeRank,
  findingByCode,
  findingsForScope,
  findingsOfDegree,
  hasBackpressure,
  HAZARD_FINDINGS,
  worseDegree,
  worstDegree,
  type BackflowMode,
  type HazardDegree,
  type HazardFinding,
  type HazardScope,
} from './domain/hazard';

export {
  PREMISE_USES,
  premiseUseByCode,
  surveyRefusedUses,
  usesWithCategoricalDegree,
  type PremiseUse,
} from './domain/premise';

export {
  baseClassForDegree,
  containmentRequirement,
  detectorVariant,
  isolationRequirement,
  requiredClassOf,
  type FixtureFacts,
  type RequiredProtection,
  type ServiceFacts,
} from './domain/requirement';

export {
  assess,
  nextSurveyDue,
  type AssessmentBasis,
  type HazardAssessment,
  type SurveyRecord,
} from './domain/survey';

export type { CivilDate } from './util/dates';
export type { Result } from './util/result';
