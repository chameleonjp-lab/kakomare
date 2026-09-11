export type ExpansionDesignStatus = 'implemented' | 'design-only';

export type SupportApplicability = 'direct' | 'conditional' | 'placement' | 'not-applicable';

export type ExpansionWeaponArchetype =
  | 'precision'
  | 'line'
  | 'area'
  | 'defense'
  | 'chain'
  | 'orbit'
  | 'reflect'
  | 'control'
  | 'intercept'
  | 'trap'
  | 'charge'
  | 'homing'
  | 'zone'
  | 'multi-shot'
  | 'turret'
  | 'state';

export interface ExpansionSynergyDesign {
  id: string;
  purpose: string;
  source: string;
  trigger: string;
  effect: string;
  alternative: string;
  weakness: string;
  testId: string;
}

export interface ExpansionWeaponDesign {
  id: string;
  name: string;
  shortName: string;
  status: ExpansionDesignStatus;
  productionGroup: 'existing-8' | 'first-12' | 'new-38';
  archetype: ExpansionWeaponArchetype;
  role: string;
  closestWeapon: string;
  differences: [string, string];
  attack: string;
  growth: string;
  weakness: string;
  limits: string;
  supportProfile: Record<string, SupportApplicability>;
  nonApplicableReasons: Record<string, string>;
  synergies: [ExpansionSynergyDesign, ExpansionSynergyDesign];
}

export interface ExpansionSupportDesign {
  id: string;
  name: string;
  status: ExpansionDesignStatus;
  role: string;
  condition: string;
  effect: string;
  cost: string;
  limit: string;
  record: string;
}

export interface CompetitiveRulesDesign {
  version: string;
  initial: {
    coreHp: number;
    baseDamage: number;
    initialWeapon: string;
    installedWeaponSlots: number;
    installedSupportSlots: number;
    capacity: number;
    rerolls: number;
    exclusions: number;
  };
  candidateWeights: Record<string, number>;
  score: {
    kill: number;
    threatTier: number;
    boss: number;
    challenge: number;
    timeAndHpAreResultFields: boolean;
  };
  seedStreams: string[];
  qualification: string[];
}
