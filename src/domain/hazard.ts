/**
 * The hazard taxonomy.
 *
 * A surveyor walks a premise and writes down findings. Each finding carries a
 * degree, the scope it bears on, and whether the plumbing behind it can push
 * water back into the main under pressure. Nothing here decides what assembly
 * is required. That comes later, and it reads this.
 */

import { err, ok, type Result } from '../util/result';

/** How bad the water on the customer side would be in the main. */
export type HazardDegree = 'none' | 'nonhealth' | 'health';

/**
 * Where the protection has to sit. Containment is at the service connection
 * and protects the main. Isolation is inside the premise and protects the rest
 * of the building.
 */
export type HazardScope = 'containment' | 'isolation';

/** How the water could travel the wrong way. */
export type BackflowMode = 'backsiphonage' | 'backpressure';

const DEGREE_RANK: Record<HazardDegree, number> = {
  none: 0,
  nonhealth: 1,
  health: 2,
};

export function degreeRank(degree: HazardDegree): number {
  return DEGREE_RANK[degree];
}

export function worseDegree(left: HazardDegree, right: HazardDegree): HazardDegree {
  return DEGREE_RANK[left] >= DEGREE_RANK[right] ? left : right;
}

export function worstDegree(degrees: ReadonlyArray<HazardDegree>): HazardDegree {
  return degrees.reduce<HazardDegree>((worst, degree) => worseDegree(worst, degree), 'none');
}

export interface HazardFinding {
  /** Stable code, quoted on the survey form and in every notice. */
  readonly code: string;
  readonly label: string;
  readonly degree: HazardDegree;
  /** The scopes this finding bears on. Most bear on both. */
  readonly scopes: ReadonlyArray<HazardScope>;
  /** The ways backflow could happen if this finding is present. */
  readonly modes: ReadonlyArray<BackflowMode>;
  /**
   * True where nothing mechanical is accepted and the connection has to be
   * broken by an air gap. Sewage and reclaimed water are the usual two.
   */
  readonly airGapOnly: boolean;
  readonly note: string;
}

export const HAZARD_FINDINGS: readonly HazardFinding[] = [
  {
    code: 'AUX_WELL',
    label: 'auxiliary supply from a private well',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage', 'backpressure'],
    airGapOnly: false,
    note: 'an unapproved source on the premise, whether or not it is cross connected today',
  },
  {
    code: 'AUX_SURFACE',
    label: 'auxiliary supply from a pond, creek or cistern',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage', 'backpressure'],
    airGapOnly: false,
    note: 'treated the same as a well, the source being unapproved is the point',
  },
  {
    code: 'RECLAIMED',
    label: 'reclaimed or recycled water on the premise',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage', 'backpressure'],
    airGapOnly: true,
    note: 'purple pipe on site, no mechanical assembly is accepted at the meter',
  },
  {
    code: 'SEWAGE_PUMP',
    label: 'sewage or wastewater pumping equipment',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: true,
    note: 'lift stations and sludge lines, break the connection',
  },
  {
    code: 'CHEM_BOILER',
    label: 'boiler or chilled water loop with a chemical additive',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'the additive is what makes it a health hazard, not the heat',
  },
  {
    code: 'BOILER_PLAIN',
    label: 'boiler with no additive above 180 degrees',
    degree: 'nonhealth',
    scopes: ['isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'hot water alone is a pollutant, not a contaminant',
  },
  {
    code: 'PLATING',
    label: 'metal plating or anodising line',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backsiphonage', 'backpressure'],
    airGapOnly: false,
    note: 'cyanide and acid baths, and the rinse tanks next to them',
  },
  {
    code: 'MORTUARY',
    label: 'mortuary or autopsy table',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'aspirators pull hard on the fixture branch',
  },
  {
    code: 'IRRIG_CHEM',
    label: 'irrigation system with a chemical injector',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backsiphonage', 'backpressure'],
    airGapOnly: false,
    note: 'fertigation makes an ordinary lawn system a health hazard',
  },
  {
    code: 'IRRIG_PLAIN',
    label: 'irrigation system with no injector',
    degree: 'nonhealth',
    scopes: ['isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'buried heads sit in whatever the ground is holding',
  },
  {
    code: 'FIRE_ANTIFREEZE',
    label: 'fire system charged with antifreeze or foam',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'additive in a standing loop, and the loop is under pressure',
  },
  {
    code: 'FIRE_PLAIN',
    label: 'fire system with no additive and no auxiliary intake',
    degree: 'nonhealth',
    scopes: ['containment'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'standing water in black steel is a pollutant',
  },
  {
    code: 'CARBONATOR',
    label: 'beverage carbonator on a copper line',
    degree: 'health',
    scopes: ['isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'carbonic acid strips copper into the branch',
  },
  {
    code: 'PHOTO_LAB',
    label: 'photographic or film processing bath',
    degree: 'health',
    scopes: ['isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'fixer and bleach tanks with submerged fill lines',
  },
  {
    code: 'DOCK_HYDRANT',
    label: 'hose bibb or hydrant at a loading dock',
    degree: 'nonhealth',
    scopes: ['isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'a hose end is a cross connection to whatever the hose is in',
  },
  {
    code: 'PIER_TIDAL',
    label: 'supply run onto a pier or a moored vessel',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'the vessel side is out of the purveyor reach entirely',
  },
  {
    code: 'SOLAR_UNTREATED',
    label: 'solar heat exchanger with an untreated transfer fluid',
    degree: 'nonhealth',
    scopes: ['isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'single wall exchangers only, a double wall one is not a finding',
  },
  {
    code: 'BOOSTER_PUMP',
    label: 'booster pump taking suction off the service',
    degree: 'nonhealth',
    scopes: ['containment'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'no contaminant of its own, it is the pressure that matters',
  },
  {
    code: 'ELEVATED_TANK',
    label: 'gravity tank above the highest fixture',
    degree: 'nonhealth',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'head alone will push a check open',
  },
  {
    code: 'LAB_BENCH',
    label: 'laboratory bench with submerged fill or vacuum aspirators',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'reagent lines and cup sinks under a vacuum manifold',
  },
  {
    code: 'CANNERY',
    label: 'food processing with caustic clean in place',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'the clean cycle is the hazard, not the product',
  },
  {
    code: 'CAR_WASH',
    label: 'vehicle wash with detergent reclaim',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'reclaim tanks and a high pressure pump on the same slab',
  },
  {
    code: 'CHILLER_PLAIN',
    label: 'closed chilled water loop with no additive',
    degree: 'nonhealth',
    scopes: ['isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'water that has stood in the loop long enough to go stale',
  },
  {
    code: 'HYDRO_JET',
    label: 'sewer jetting or hydro excavation truck fill point',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage'],
    airGapOnly: true,
    note: 'the truck side has been in a manhole, break the connection',
  },
  {
    code: 'COOLING_TOWER',
    label: 'cooling tower with biocide dosing',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'the dosing pot is the hazard, and the make up line runs straight off the main',
  },
  {
    code: 'DIALYSIS',
    label: 'dialysis machine or a portable treatment cart',
    degree: 'health',
    scopes: ['isolation'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'the cart is connected and disconnected by somebody who is not a plumber',
  },
  {
    code: 'DYE_WORKS',
    label: 'textile dye vats',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'hot liquor under pump pressure a few feet from the service',
  },
  {
    code: 'BREWERY_CIP',
    label: 'brewery or dairy clean in place set',
    degree: 'health',
    scopes: ['containment', 'isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'caustic at temperature, and the same line fills the vessels',
  },
  {
    code: 'ICE_RINK',
    label: 'ice rink brine plant',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'glycol under pressure behind a single wall exchanger',
  },
  {
    code: 'LAUNDRY',
    label: 'commercial laundry with a chemical dosing rail',
    degree: 'health',
    scopes: ['isolation'],
    modes: ['backpressure'],
    airGapOnly: false,
    note: 'the dosing rail is plumbed into the fill line, not into a tank',
  },
  {
    code: 'FIRE_PUMP_HEADER',
    label: 'fire pump test header discharging to a pond',
    degree: 'nonhealth',
    scopes: ['containment'],
    modes: ['backsiphonage'],
    airGapOnly: false,
    note: 'the header is open to whatever it is discharging into during a test',
  },
  {
    code: 'MOBILE_TANK',
    label: 'fill point for a mobile tank or a bowser',
    degree: 'health',
    scopes: ['containment'],
    modes: ['backsiphonage'],
    airGapOnly: true,
    note: 'nobody knows what was in the tank last week',
  },
];

const BY_CODE = new Map(HAZARD_FINDINGS.map((finding) => [finding.code, finding]));

export function findingByCode(code: string): Result<HazardFinding, string> {
  const finding = BY_CODE.get(code);
  return finding === undefined ? err(`no hazard finding with the code ${code}`) : ok(finding);
}

export function findingsForScope(scope: HazardScope): HazardFinding[] {
  return HAZARD_FINDINGS.filter((finding) => finding.scopes.includes(scope));
}

export function findingsOfDegree(degree: HazardDegree): HazardFinding[] {
  return HAZARD_FINDINGS.filter((finding) => finding.degree === degree);
}

/** Findings that are a health hazard and cannot push back under pressure. */
export function backsiphonageOnlyHealthFindings(): HazardFinding[] {
  return HAZARD_FINDINGS.filter(
    (finding) => finding.degree === 'health' && !finding.modes.includes('backpressure'),
  );
}

/** True when any of the given findings can push water back under pressure. */
export function hasBackpressure(findings: ReadonlyArray<HazardFinding>): boolean {
  return findings.some((finding) => finding.modes.includes('backpressure'));
}
