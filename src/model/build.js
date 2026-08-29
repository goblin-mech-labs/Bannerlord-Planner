/**
 * A planned character: level, attributes, focus, skill values and perk picks,
 * with the game's own budgeting rules enforced on top.
 */
import { ATTRIBUTES } from "./catalog.js";
import { Rules } from "./rules.js";

const BASE_ATTRIBUTE = 1;   // HeroDeveloper floors every attribute at 1

export class Build {
  constructor(catalog, state = {}) {
    this.catalog = catalog;
    this.rules = new Rules(catalog.rules);
    this.level = state.level ?? 1;
    this.culture = state.culture ?? null;
    this.choices = { ...(state.choices ?? {}) };        // menuId -> optionId
    this.attributes = { ...baseAttributes(), ...(state.attributes ?? {}) };
    this.focus = { ...(state.focus ?? {}) };            // skillId -> points
    this.skills = { ...(state.skills ?? {}) };          // skillId -> value
    this.perks = new Set(state.perks ?? []);            // chosen perk ids
  }

  // ------------------------------------------------------------ budgets

  get attributePointsAvailable() { return this.rules.attributePointsForLevel(this.level); }
  get focusPointsAvailable() { return this.rules.focusPointsForLevel(this.level); }

  get attributePointsSpent() {
    return ATTRIBUTES.reduce((sum, a) => sum + (this.attributes[a.id] ?? BASE_ATTRIBUTE), 0);
  }

  get focusPointsSpent() {
    return Object.values(this.focus).reduce((sum, n) => sum + n, 0);
  }

  get attributePointsLeft() { return this.attributePointsAvailable - this.attributePointsSpent; }
  get focusPointsLeft() { return this.focusPointsAvailable - this.focusPointsSpent; }

  get overspent() { return this.attributePointsLeft < 0 || this.focusPointsLeft < 0; }

  // ------------------------------------------------------------ per-skill

  attribute(id) { return this.attributes[id] ?? BASE_ATTRIBUTE; }
  focusIn(skillId) { return this.focus[skillId] ?? 0; }
  skillValue(skillId) { return this.skills[skillId] ?? 0; }

  learningLimit(skillId) {
    return this.rules.learningLimit(
      this.catalog.skill(skillId), this.attributes, this.focusIn(skillId));
  }

  learningRate(skillId) {
    return this.rules.learningRate(
      this.catalog.skill(skillId), this.attributes, this.focusIn(skillId),
      this.skillValue(skillId));
  }

  /** Skill XP progress within the current level, as the game's bar shows it. */
  skillProgress(skillId) {
    const value = this.skillValue(skillId);
    return { into: 0, needed: this.rules.xpToNextSkillLevel(value) };
  }

  // ------------------------------------------------------------ mutation

  setLevel(level) {
    this.level = clamp(level, 1, this.rules.maxLevel);
    return this;
  }

  setAttribute(id, value) {
    this.attributes[id] = clamp(value, BASE_ATTRIBUTE, this.rules.maxAttribute);
    return this;
  }

  setFocus(skillId, value) {
    const focus = clamp(value, 0, this.rules.maxFocusPerSkill);
    if (focus === 0) delete this.focus[skillId];
    else this.focus[skillId] = focus;
    return this;
  }

  setSkill(skillId, value) {
    const skill = clamp(value, 0, 1023);
    if (skill === 0) delete this.skills[skillId];
    else this.skills[skillId] = skill;
    this.dropUnreachablePerks(skillId);
    return this;
  }

  // ------------------------------------------------------------ perks

  /** A perk needs its skill at the tier threshold; alternatives are exclusive. */
  perkState(perkId) {
    const perk = this.catalog.perk(perkId);
    if (!perk) return { selected: false, available: false, reason: "unknown perk" };
    const selected = this.perks.has(perkId);
    const value = this.skillValue(perk.skill);
    if (value < perk.requiredSkill) {
      return {
        selected,
        available: false,
        reason: `Requires ${this.catalog.skill(perk.skill).name} ${perk.requiredSkill}`,
      };
    }
    if (perk.alternative && this.perks.has(perk.alternative)) {
      return {
        selected,
        available: false,
        reason: `Conflicts with ${this.catalog.perk(perk.alternative).name}`,
      };
    }
    return { selected, available: true, reason: null };
  }

  /** True when the skill level this perk needs is beyond the learning limit. */
  beyondLearningLimit(perkId) {
    const perk = this.catalog.perk(perkId);
    return perk ? perk.requiredSkill > this.learningLimit(perk.skill) : false;
  }

  selectPerk(perkId) {
    const perk = this.catalog.perk(perkId);
    if (!perk || this.skillValue(perk.skill) < perk.requiredSkill) return this;
    if (perk.alternative) this.perks.delete(perk.alternative);
    this.perks.add(perkId);
    return this;
  }

  togglePerk(perkId) {
    if (this.perks.has(perkId)) this.perks.delete(perkId);
    else this.selectPerk(perkId);
    return this;
  }

  dropUnreachablePerks(skillId) {
    for (const id of [...this.perks]) {
      const perk = this.catalog.perk(id);
      if (perk && perk.skill === skillId && this.skillValue(skillId) < perk.requiredSkill) {
        this.perks.delete(id);
      }
    }
  }

  selectedPerks() {
    return [...this.perks].map((id) => this.catalog.perk(id)).filter(Boolean);
  }

  // ------------------------------------------------------------ serialisation

  toState() {
    return {
      level: this.level,
      culture: this.culture,
      choices: { ...this.choices },
      attributes: { ...this.attributes },
      focus: { ...this.focus },
      skills: { ...this.skills },
      perks: [...this.perks],
    };
  }

  clone() { return new Build(this.catalog, this.toState()); }
}

export function baseAttributes() {
  return Object.fromEntries(ATTRIBUTES.map((a) => [a.id, BASE_ATTRIBUTE]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

export { BASE_ATTRIBUTE };
