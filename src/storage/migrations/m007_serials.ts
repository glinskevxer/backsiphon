import type { Migration } from '../migrations';

/**
 * One serial number per model, among the assemblies that are in the ground.
 *
 * The first version of this index covered every row ever written, which said
 * that a body could never be fitted twice. That is wrong twice over: a repaired
 * assembly goes back into the same vault, and a moved one comes out of one
 * point and into another under a new id with the same number stamped on it.
 * The maker's serial belongs to the body, not to the fitting.
 */
export const m007Serials: Migration = {
  id: '007_serials',
  description: 'allow a serial number to be refitted once the old row is closed',
  statements: [
    `drop index if exists idx_assemblies_serial`,
    `create unique index idx_assemblies_serial_live
       on assemblies (model_id, serial_number)
       where removed_on is null`,
    `create index idx_assemblies_serial_history
       on assemblies (model_id, serial_number, installed_on)`,
  ],
};
