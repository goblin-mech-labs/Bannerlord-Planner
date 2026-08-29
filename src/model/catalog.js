/** Indexed, read-only view over the extracted game data. */

export const ATTRIBUTES = [
  { id: "Vigor", short: "VIG" },
  { id: "Control", short: "CTR" },
  { id: "Endurance", short: "END" },
  { id: "Cunning", short: "CNG" },
  { id: "Social", short: "SOC" },
  { id: "Intelligence", short: "INT" },
];

export class Catalog {
  constructor({ skills, perks, rules, chargen }) {
    this.skills = skills;
    this.perks = perks;
    this.rules = rules;
    this.chargen = chargen;

    this.skillById = new Map(skills.map((s) => [s.id, s]));
    this.perkById = new Map(perks.map((p) => [p.id, p]));

    /** skillId -> tiers, each tier an array of 1-2 alternative perks. */
    this.tiersBySkill = new Map();
    for (const skill of skills) {
      const own = perks.filter((p) => p.skill === skill.id);
      const maxTier = own.reduce((m, p) => Math.max(m, p.tier), 0);
      const tiers = [];
      for (let t = 1; t <= maxTier; t++) {
        tiers.push(own.filter((p) => p.tier === t));
      }
      this.tiersBySkill.set(skill.id, tiers);
    }

    // The game groups the eighteen classic skills three-per-attribute; the
    // three Warsails skills each answer to two attributes and sit apart.
    this.skillsByAttribute = new Map(ATTRIBUTES.map((a) => [a.id, []]));
    this.navalSkills = [];
    for (const skill of skills) {
      if (skill.attributes.length === 1) {
        this.skillsByAttribute.get(skill.attributes[0]).push(skill);
      } else {
        this.navalSkills.push(skill);
      }
    }

    this.cultures = chargen.cultures;
    this.menus = chargen.menus;
    this.optionsByMenu = new Map(chargen.menus.map((m) => [m.id, []]));
    for (const option of chargen.options) {
      this.optionsByMenu.get(option.menu)?.push(option);
    }
  }

  skill(id) { return this.skillById.get(id); }
  perk(id) { return this.perkById.get(id); }
  tiers(skillId) { return this.tiersBySkill.get(skillId) ?? []; }

  /** Options for a menu that are available to the chosen culture. */
  optionsFor(menuId, cultureId) {
    return (this.optionsByMenu.get(menuId) ?? [])
      .filter((o) => o.culture === null || o.culture === cultureId);
  }

  static async load(base = "") {
    const names = ["skills", "perks", "rules", "chargen"];
    const parts = await Promise.all(
      names.map((n) => fetch(`${base}data/${n}.json`).then((r) => {
        if (!r.ok) throw new Error(`failed to load data/${n}.json (${r.status})`);
        return r.json();
      }))
    );
    return new Catalog(Object.fromEntries(names.map((n, i) => [n, parts[i]])));
  }
}
