/**
 * Putting an assembly in, taking one out, and swapping one for another.
 *
 * The approval list is read at the date of the work rather than today, which
 * is what makes a grandfathered assembly legal where fitting the same model
 * again would not be. A swap is two operations that have to happen together:
 * an office that records the new assembly and loses the removal has two
 * assemblies at one point and no way to say which one the test belongs to.
 */

import type { CivilDate } from '../util/dates';
import { ASSEMBLY_ID } from '../util/ids';
import { err, ok, type Result } from '../util/result';
import { buildApprovalList, installationAllowed, relocationAllowed, remedyFor } from '../domain/approvals';
import { allowedInScope, type AssemblyClass } from '../domain/assembly';
import type { InstalledAssembly, ProtectionScope } from '../domain/deficiency';
import { withTransaction } from '../storage/db';
import { findConnection, isInService } from '../storage/repositories/connections';
import {
  assemblyAtPoint,
  findAssembly,
  insertAssembly,
  listModels,
  removeAssembly,
} from '../storage/repositories/assemblies';
import { appendEvent } from '../storage/repositories/events';
import { mintId, type Register } from './register';

export interface InstallInput {
  readonly connectionId: string;
  readonly scope: ProtectionScope;
  readonly assemblyClass: AssemblyClass;
  readonly modelId: string;
  readonly serialNumber: string;
  readonly sizeInches: number;
  readonly installedOn: CivilDate;
  readonly location: string;
}

export function installAssembly(
  register: Register,
  input: InstallInput,
): Result<InstalledAssembly, string> {
  const connection = findConnection(register.db, input.connectionId);
  if (connection === undefined) {
    return err(`there is no connection with the id ${input.connectionId}`);
  }
  if (!isInService(connection, input.installedOn)) {
    return err(`the connection ${input.connectionId} was not in service on ${input.installedOn}`);
  }
  if (!allowedInScope(input.assemblyClass, input.scope)) {
    return err(`a ${input.assemblyClass} is not accepted at a ${input.scope} point`);
  }
  if (input.location.trim() === '') {
    return err('an assembly has to say where it is, the tester has to find it');
  }

  const list = buildApprovalList(listModels(register.db));
  if (!list.ok) {
    return err(list.error);
  }
  const allowed = installationAllowed(list.value, {
    modelId: input.modelId,
    assemblyClass: input.assemblyClass,
    sizeInches: input.sizeInches,
    installedOn: input.installedOn,
  });
  if (!allowed.ok) {
    return err(allowed.error);
  }

  const standing = assemblyAtPoint(register.db, input.connectionId, input.scope, input.installedOn);
  if (standing !== undefined) {
    return err(
      `the ${standing.assemblyClass} ${standing.assemblyId} is already at the ${input.scope} ` +
        `point of ${input.connectionId}, take it out first`,
    );
  }

  const assembly: InstalledAssembly = {
    assemblyId: mintId(register, ASSEMBLY_ID, 'assemblies', 'assembly_id'),
    connectionId: input.connectionId,
    scope: input.scope,
    assemblyClass: input.assemblyClass,
    modelId: input.modelId,
    serialNumber: input.serialNumber.trim(),
    sizeInches: input.sizeInches,
    installedOn: input.installedOn,
    location: input.location.trim(),
  };

  return withTransaction(register.db, () => {
    const written = insertAssembly(register.db, assembly);
    if (!written.ok) {
      return written;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'assembly_installed',
      subjectKind: 'assembly',
      subjectId: assembly.assemblyId,
      detail:
        `${assembly.assemblyClass} ${allowed.value.maker} ${allowed.value.model} ` +
        `serial ${assembly.serialNumber} at ${assembly.location}`,
    });
    return ok(assembly);
  });
}

export function takeAssemblyOut(
  register: Register,
  assemblyId: string,
  on: CivilDate,
  reason: string,
): Result<InstalledAssembly, string> {
  if (reason.trim() === '') {
    return err('taking an assembly out has to say why');
  }
  return withTransaction(register.db, () => {
    const removed = removeAssembly(register.db, assemblyId, on);
    if (!removed.ok) {
      return removed;
    }
    appendEvent(register.db, {
      happenedAt: register.now(),
      actor: register.actor,
      kind: 'assembly_removed',
      subjectKind: 'assembly',
      subjectId: assemblyId,
      detail: `${on}: ${reason}`,
    });
    return removed;
  });
}

export interface SwapOutcome {
  readonly removed: InstalledAssembly;
  readonly installed: InstalledAssembly;
}

/**
 * Replace one assembly with another on the same day. Either both happen or
 * neither does.
 */
export function swapAssembly(
  register: Register,
  assemblyId: string,
  replacement: Omit<InstallInput, 'connectionId' | 'scope'>,
  reason: string,
): Result<SwapOutcome, string> {
  const existing = findAssembly(register.db, assemblyId);
  if (existing === undefined) {
    return err(`there is no assembly with the id ${assemblyId}`);
  }
  try {
    return withTransaction(register.db, () => {
      const removed = takeAssemblyOut(register, assemblyId, replacement.installedOn, reason);
      if (!removed.ok) {
        throw new SwapFailed(removed.error);
      }
      const installed = installAssembly(register, {
        ...replacement,
        connectionId: existing.connectionId,
        scope: existing.scope,
      });
      if (!installed.ok) {
        throw new SwapFailed(installed.error);
      }
      return ok({ removed: removed.value, installed: installed.value });
    });
  } catch (error) {
    // The rollback has already happened. Turning the throw back into an error
    // keeps the whole service layer answering the same way.
    return err(error instanceof SwapFailed ? error.message : String(error));
  }
}

/** Carries a refusal out through the transaction so the rollback can happen. */
class SwapFailed extends Error {}

export interface RelocationInput {
  readonly connectionId: string;
  readonly scope: ProtectionScope;
  readonly location: string;
  readonly on: CivilDate;
  readonly reason: string;
}

export interface Relocation {
  readonly from: InstalledAssembly;
  readonly to: InstalledAssembly;
}

/**
 * Move an assembly. It comes out of one point and goes into another on the
 * same day, under a new id, because the assembly at a point is what a test
 * report is filed against and a moved one is not the same fitting any more.
 *
 * The approval list is read as at the day of the move, which is what stops a
 * grandfathered assembly being carried round the district: it is legal where
 * it stands and it cannot be installed anywhere else.
 */
export function relocateAssembly(
  register: Register,
  assemblyId: string,
  input: RelocationInput,
): Result<Relocation, string> {
  const existing = findAssembly(register.db, assemblyId);
  if (existing === undefined) {
    return err(`there is no assembly with the id ${assemblyId}`);
  }
  if (existing.removedOn !== undefined) {
    return err(`the assembly ${assemblyId} came out on ${existing.removedOn}`);
  }
  if (input.reason.trim() === '') {
    return err('moving an assembly has to say why');
  }
  if (existing.connectionId === input.connectionId && existing.scope === input.scope) {
    return err('that is where it already is, use a note rather than a move');
  }

  const list = buildApprovalList(listModels(register.db));
  if (!list.ok) {
    return err(list.error);
  }
  const allowed = relocationAllowed(list.value, {
    modelId: existing.modelId,
    assemblyClass: existing.assemblyClass,
    sizeInches: existing.sizeInches,
    installedOn: input.on,
  });
  if (!allowed.ok) {
    return err(allowed.error);
  }

  try {
    return withTransaction(register.db, () => {
      const removed = takeAssemblyOut(register, assemblyId, input.on, `moved: ${input.reason}`);
      if (!removed.ok) {
        throw new SwapFailed(removed.error);
      }
      const fitted = installAssembly(register, {
        connectionId: input.connectionId,
        scope: input.scope,
        assemblyClass: existing.assemblyClass,
        modelId: existing.modelId,
        serialNumber: existing.serialNumber,
        sizeInches: existing.sizeInches,
        installedOn: input.on,
        location: input.location,
      });
      if (!fitted.ok) {
        throw new SwapFailed(fitted.error);
      }
      appendEvent(register.db, {
        happenedAt: register.now(),
        actor: register.actor,
        kind: 'assembly_moved',
        subjectKind: 'assembly',
        subjectId: fitted.value.assemblyId,
        detail:
          `${assemblyId} moved from ${existing.connectionId} ${existing.scope} ` +
          `to ${input.connectionId} ${input.scope}: ${input.reason}`,
      });
      return ok({ from: removed.value, to: fitted.value });
    });
  } catch (error) {
    return err(error instanceof SwapFailed ? error.message : String(error));
  }
}

/**
 * Whether a failing assembly may be put back after a repair, or has to be
 * replaced because its model has come off the list. The date matters: a model
 * delisted last year does not condemn a repair carried out before that.
 */
export function remedyForAssembly(
  register: Register,
  assemblyId: string,
  asOf: CivilDate,
): Result<'repair' | 'replace', string> {
  const assembly = findAssembly(register.db, assemblyId);
  if (assembly === undefined) {
    return err(`there is no assembly with the id ${assemblyId}`);
  }
  const list = buildApprovalList(listModels(register.db));
  if (!list.ok) {
    return err(list.error);
  }
  return ok(remedyFor(list.value, assembly.modelId, asOf));
}
