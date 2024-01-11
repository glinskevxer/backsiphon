/**
 * The approved assembly list.
 *
 * A model is on the list from the day the approving laboratory listed it until
 * the day it was taken off. Taking a model off does not condemn the ones
 * already in the ground: they are grandfathered, and they stay grandfathered
 * until something happens to them. What ends it is a failure or a move, not
 * the passage of time.
 */

import { isCivilDate, type CivilDate } from '../util/dates';
import { err, ok, type Result } from '../util/result';
import type { AssemblyClass } from './assembly';

export interface AssemblyModel {
  readonly modelId: string;
  readonly maker: string;
  readonly model: string;
  readonly assemblyClass: AssemblyClass;
  /** Nominal sizes in inches the listing covers. */
  readonly sizes: ReadonlyArray<number>;
  readonly listedOn: CivilDate;
  readonly delistedOn?: CivilDate;
  readonly note: string;
}

export type ApprovalStatus = 'listed' | 'delisted' | 'unknown';

export interface ApprovalList {
  readonly models: ReadonlyMap<string, AssemblyModel>;
}

export function buildApprovalList(models: ReadonlyArray<AssemblyModel>): Result<ApprovalList, string> {
  const byId = new Map<string, AssemblyModel>();
  for (const model of models) {
    if (byId.has(model.modelId)) {
      return err(`the model ${model.modelId} appears twice on the approval list`);
    }
    if (!isCivilDate(model.listedOn)) {
      return err(`the model ${model.modelId} has no listing date`);
    }
    if (model.delistedOn !== undefined && model.delistedOn <= model.listedOn) {
      return err(`the model ${model.modelId} was delisted on or before it was listed`);
    }
    if (model.sizes.length === 0) {
      return err(`the model ${model.modelId} is listed for no sizes at all`);
    }
    byId.set(model.modelId, model);
  }
  return ok({ models: byId });
}

export function modelById(list: ApprovalList, modelId: string): AssemblyModel | undefined {
  return list.models.get(modelId);
}

export function approvalStatus(
  list: ApprovalList,
  modelId: string,
  asOf: CivilDate,
): ApprovalStatus {
  const model = list.models.get(modelId);
  if (model === undefined || model.listedOn > asOf) {
    return 'unknown';
  }
  return model.delistedOn !== undefined && model.delistedOn <= asOf ? 'delisted' : 'listed';
}

export interface InstallationCheck {
  readonly modelId: string;
  readonly assemblyClass: AssemblyClass;
  readonly sizeInches: number;
  readonly installedOn: CivilDate;
}

/**
 * Whether this model may go in on this day, at this size, as this class. A
 * model that has been taken off the list may not be installed even though the
 * ones already fitted are left alone.
 */
export function installationAllowed(
  list: ApprovalList,
  check: InstallationCheck,
): Result<AssemblyModel, string> {
  const model = list.models.get(check.modelId);
  if (model === undefined) {
    return err(`the model ${check.modelId} is not on the approval list`);
  }
  if (model.listedOn > check.installedOn) {
    return err(
      `the model ${check.modelId} was not listed until ${model.listedOn}, ` +
        `after the install date ${check.installedOn}`,
    );
  }
  if (model.delistedOn !== undefined && model.delistedOn <= check.installedOn) {
    return err(`the model ${check.modelId} came off the list on ${model.delistedOn}`);
  }
  if (model.assemblyClass !== check.assemblyClass) {
    return err(
      `the model ${check.modelId} is listed as a ${model.assemblyClass}, ` +
        `not as a ${check.assemblyClass}`,
    );
  }
  if (!model.sizes.includes(check.sizeInches)) {
    return err(
      `the model ${check.modelId} is not listed at ${check.sizeInches} inches, ` +
        `only at ${model.sizes.join(', ')}`,
    );
  }
  return ok(model);
}

/** What the program office will accept once an assembly has gone wrong. */
export type Remedy = 'repair' | 'replace';

/**
 * A listed model may be repaired and put back. A model that has come off the
 * list has to be replaced, because putting it back would be an installation of
 * an unlisted model in everything but name.
 */
export function remedyFor(list: ApprovalList, modelId: string, asOf: CivilDate): Remedy {
  return approvalStatus(list, modelId, asOf) === 'listed' ? 'repair' : 'replace';
}

/**
 * Moving an assembly is a new installation, so a grandfathered model cannot be
 * relocated. This is the other end of the same rule as `remedyFor`.
 */
export function relocationAllowed(
  list: ApprovalList,
  check: InstallationCheck,
): Result<AssemblyModel, string> {
  const allowed = installationAllowed(list, check);
  if (allowed.ok) {
    return allowed;
  }
  return err(`${allowed.error}, so it cannot be moved and reused`);
}

export function modelsOfClass(list: ApprovalList, assemblyClass: AssemblyClass): AssemblyModel[] {
  return [...list.models.values()]
    .filter((model) => model.assemblyClass === assemblyClass)
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
}
