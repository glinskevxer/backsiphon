/**
 * The approval list and the assemblies fitted against it.
 *
 * These two live in one module because almost every question about an assembly
 * needs the model behind it: whether it may be repaired, whether it may be
 * moved, and what class it is supposed to be.
 */

import type { CivilDate } from '../../util/dates';
import { err, ok, type Result } from '../../util/result';
import type { AssemblyClass } from '../../domain/assembly';
import type { AssemblyModel } from '../../domain/approvals';
import type { InstalledAssembly, ProtectionScope } from '../../domain/deficiency';
import { execute, selectAll, selectOne, type Database } from '../db';
import { describeConstraintError, fromNumberList, toNullable, toNumberList } from '../rows';

interface ModelRow {
  model_id: string;
  maker: string;
  model: string;
  assembly_class: AssemblyClass;
  sizes: string;
  listed_on: string;
  delisted_on: string | null;
  note: string;
}

interface AssemblyRow {
  assembly_id: string;
  connection_id: string;
  scope: ProtectionScope;
  assembly_class: AssemblyClass;
  model_id: string;
  serial_number: string;
  size_inches: number;
  installed_on: string;
  removed_on: string | null;
  location: string;
  note: string | null;
}

const MODEL_COLUMNS = 'model_id, maker, model, assembly_class, sizes, listed_on, delisted_on, note';
const ASSEMBLY_COLUMNS = `assembly_id, connection_id, scope, assembly_class, model_id, serial_number,
  size_inches, installed_on, removed_on, location, note`;

function toModel(row: ModelRow): AssemblyModel {
  return {
    modelId: row.model_id,
    maker: row.maker,
    model: row.model,
    assemblyClass: row.assembly_class,
    sizes: fromNumberList(row.sizes),
    listedOn: row.listed_on,
    ...(row.delisted_on === null ? {} : { delistedOn: row.delisted_on }),
    note: row.note,
  };
}

function toAssembly(row: AssemblyRow): InstalledAssembly {
  return {
    assemblyId: row.assembly_id,
    connectionId: row.connection_id,
    scope: row.scope,
    assemblyClass: row.assembly_class,
    modelId: row.model_id,
    serialNumber: row.serial_number,
    sizeInches: row.size_inches,
    installedOn: row.installed_on,
    ...(row.removed_on === null ? {} : { removedOn: row.removed_on }),
    location: row.location,
  };
}

export function insertModel(db: Database, model: AssemblyModel): Result<AssemblyModel, string> {
  try {
    execute(db, `insert into approved_models (${MODEL_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?)`, [
      model.modelId,
      model.maker,
      model.model,
      model.assemblyClass,
      toNumberList(model.sizes),
      model.listedOn,
      toNullable(model.delistedOn),
      model.note,
    ]);
    return ok(model);
  } catch (error) {
    return err(describeConstraintError(error, `the model ${model.modelId}`));
  }
}

export function findModel(db: Database, modelId: string): AssemblyModel | undefined {
  const row = selectOne<ModelRow>(
    db,
    `select ${MODEL_COLUMNS} from approved_models where model_id = ?`,
    [modelId],
  );
  return row === undefined ? undefined : toModel(row);
}

export function listModels(db: Database, assemblyClass?: AssemblyClass): AssemblyModel[] {
  const clause = assemblyClass === undefined ? '' : 'where assembly_class = ?';
  const params = assemblyClass === undefined ? [] : [assemblyClass];
  return selectAll<ModelRow>(
    db,
    `select ${MODEL_COLUMNS} from approved_models ${clause} order by model_id`,
    params,
  ).map(toModel);
}

/** Take a model off the list from a date. The assemblies stay where they are. */
export function delistModel(
  db: Database,
  modelId: string,
  on: CivilDate,
): Result<AssemblyModel, string> {
  const model = findModel(db, modelId);
  if (model === undefined) {
    return err(`there is no model with the id ${modelId}`);
  }
  if (model.delistedOn !== undefined) {
    return err(`the model ${modelId} came off the list on ${model.delistedOn} already`);
  }
  if (on <= model.listedOn) {
    return err(`the model ${modelId} cannot come off on ${on}, it went on ${model.listedOn}`);
  }
  execute(db, 'update approved_models set delisted_on = ? where model_id = ?', [on, modelId]);
  return ok({ ...model, delistedOn: on });
}

export function insertAssembly(
  db: Database,
  assembly: InstalledAssembly,
): Result<InstalledAssembly, string> {
  try {
    execute(
      db,
      `insert into assemblies (${ASSEMBLY_COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assembly.assemblyId,
        assembly.connectionId,
        assembly.scope,
        assembly.assemblyClass,
        assembly.modelId,
        assembly.serialNumber,
        assembly.sizeInches,
        assembly.installedOn,
        toNullable(assembly.removedOn),
        assembly.location,
        null,
      ],
    );
    return ok(assembly);
  } catch (error) {
    return err(describeConstraintError(error, `the assembly ${assembly.assemblyId}`));
  }
}

export function findAssembly(db: Database, assemblyId: string): InstalledAssembly | undefined {
  const row = selectOne<AssemblyRow>(
    db,
    `select ${ASSEMBLY_COLUMNS} from assemblies where assembly_id = ?`,
    [assemblyId],
  );
  return row === undefined ? undefined : toAssembly(row);
}

export interface AssemblyFilter {
  readonly connectionId?: string;
  readonly scope?: ProtectionScope;
  /** Only assemblies in the ground on this day. */
  readonly activeOn?: CivilDate;
}

export function listAssemblies(db: Database, filter: AssemblyFilter = {}): InstalledAssembly[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.connectionId !== undefined) {
    clauses.push('connection_id = ?');
    params.push(filter.connectionId);
  }
  if (filter.scope !== undefined) {
    clauses.push('scope = ?');
    params.push(filter.scope);
  }
  if (filter.activeOn !== undefined) {
    clauses.push('installed_on <= ? and (removed_on is null or removed_on > ?)');
    params.push(filter.activeOn, filter.activeOn);
  }
  const where = clauses.length === 0 ? '' : `where ${clauses.join(' and ')}`;
  return selectAll<AssemblyRow>(
    db,
    `select ${ASSEMBLY_COLUMNS} from assemblies ${where}
     order by connection_id, scope, installed_on desc`,
    params,
  ).map(toAssembly);
}

/**
 * The assembly the register measures a requirement against: the one in the
 * ground at that point on that day. Two at once is a data fault rather than a
 * question, so the newest wins and the caller can list the rest.
 */
export function assemblyAtPoint(
  db: Database,
  connectionId: string,
  scope: ProtectionScope,
  asOf: CivilDate,
): InstalledAssembly | undefined {
  return listAssemblies(db, { connectionId, scope, activeOn: asOf })[0];
}

export function removeAssembly(
  db: Database,
  assemblyId: string,
  on: CivilDate,
): Result<InstalledAssembly, string> {
  const assembly = findAssembly(db, assemblyId);
  if (assembly === undefined) {
    return err(`there is no assembly with the id ${assemblyId}`);
  }
  if (assembly.removedOn !== undefined) {
    return err(`the assembly ${assemblyId} came out on ${assembly.removedOn} already`);
  }
  if (on <= assembly.installedOn) {
    return err(
      `the assembly ${assemblyId} cannot come out on ${on}, it went in on ${assembly.installedOn}`,
    );
  }
  execute(db, 'update assemblies set removed_on = ? where assembly_id = ?', [on, assemblyId]);
  return ok({ ...assembly, removedOn: on });
}
