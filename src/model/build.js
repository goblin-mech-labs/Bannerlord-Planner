/**
 * A planned character: level, attributes, focus, skill values and perk picks,
 * with the game's own budgeting rules enforced on top.
 */
import { ATTRIBUTES } from "./catalog.js";
import { Rules } from "./rules.js";

// CharacterCreationContent.SetMainHeroInitialStats gives every attribute 2,
// free of the point pool (checkUnspentPoints: false).
const BASE_ATTRIBUTE = 2;

export class Build {
  constructor(catalog, state = {}) {
    this.catalog = catalog;
    this.rules = new Rules(catalog.rules);
    this.level = state.level ?? 1;
    this.culture = state.culture ?? null;
    this.choices = { ...(state.choices ?? {}) };        // menuId -> optionId
    this.attributes = { ...baseAttributes(), ...(state.attributes ?? {}) };
    this.focus = { ...(state.focus ?? {}) };            // skillId -> points
    this.perks = new Set(state.perks ?? []);            // chosen perk ids

    // Character creation applies its grants with checkUnspentPoints: false
    // (CharacterCreationContent.ApplySkillAndAttributeEffects), so those points
    // are free - they never come out of the level budget. Track them separately
    // so the budgets below only count what the player allocates by hand.
    this.granted = {
      attributes: { ...(state.granted?.attributes ?? {}) },
      focus: { ...(state.granted?.focus ?? {}) },
      // Loose points from the Starting Age stage, which land in the pools.
      unspentAttributes: state.granted?.unspentAttributes ?? 0,
      unspentFocus: state.granted?.unspentFocus ?? 0,
    };
    this.mode = state.mode ?? "campaign";
  }

  /** The floor an attribute cannot be taken below: base plus what creation gave. */
  attributeFloor(id) {
    return BASE_ATTRIBUTE + (this.granted.attributes[id] ?? 0);
  }

  /** Focus placed by character creation cannot be reclaimed either. */
  focusFloor(skillId) {
    return this.granted.focus[skillId] ?? 0;
  }

  get grantedAttributePoints() {
    return sum(Object.values(this.granted.attributes));
  }

  get grantedFocusPoints() {
    return sum(Object.values(this.granted.focus));
  }

  // ------------------------------------------------------------ budgets

  get attributePointsAvailable() {
    return this.rules.attributePointsForLevel(this.level) + this.granted.unspentAttributes;
  }

  get focusPointsAvailable() {
    return this.rules.focusPointsForLevel(this.level) + this.granted.unspentFocus;
  }

  /**
   * Points drawn from the level budget: everything except what character
   * creation handed over for free. The base 1 in every attribute does count,
   * matching HeroDeveloper.SetInitialFocusAndAttributePoints.
   */
  get attributePointsSpent() {
    // Perk bonuses are free; only allocated points are charged.
    const total = ATTRIBUTES.reduce((n, a) => n + this.allocatedAttribute(a.id), 0);
    return total - this.grantedAttributePoints;
  }

  get focusPointsSpent() {
    return sum(Object.values(this.focus)) - this.grantedFocusPoints;
  }

  get attributePointsLeft() { return this.attributePointsAvailable - this.attributePointsSpent; }
  get focusPointsLeft() { return this.focusPointsAvailable - this.focusPointsSpent; }

  get overspent() { return this.attributePointsLeft < 0 || this.focusPointsLeft < 0; }

  // ------------------------------------------------------------ per-skill

  /** Points allocated by hand and by character creation, before perk bonuses. */
  allocatedAttribute(id) { return this.attributes[id] ?? BASE_ATTRIBUTE; }

  /**
   * Attributes granted outright by chosen perks - Athletics Strong/Steady/
   * Durable and the three Smithing ones. They feed straight back into skill
   * caps, so taking Durable raises what Athletics itself can reach.
   */
  attributeBonus(id) {
    let bonus = 0;
    for (const perk of this.selectedPerks()) {
      if (perk.attributeBonus?.attribute === id) bonus += perk.attributeBonus.value;
    }
    return bonus;
  }

  /** The effective attribute: what every cap and learning formula reads. */
  attribute(id) { return this.allocatedAttribute(id) + this.attributeBonus(id); }

  /** Effective attributes as a plain object, for the rules functions. */
  get effectiveAttributes() {
    return Object.fromEntries(ATTRIBUTES.map((a) => [a.id, this.attribute(a.id)]));
  }

  focusIn(skillId) { return this.focus[skillId] ?? 0; }

  /**
   * The highest level this build can reach: the point where the learning rate
   * reaches zero. Skill levels are derived from attributes and focus rather
   * than set by hand.
   */
  skillValue(skillId) {
    return this.rules.maxSkillLevel(
      this.catalog.skill(skillId), this.effectiveAttributes, this.focusIn(skillId));
  }

  /** The soft limit, past which experience slows sharply. */
  learningLimit(skillId) {
    return this.rules.learningLimit(
      this.catalog.skill(skillId), this.effectiveAttributes, this.focusIn(skillId));
  }

  learningRate(skillId, atValue = this.skillValue(skillId)) {
    return this.rules.learningRate(
      this.catalog.skill(skillId), this.effectiveAttributes, this.focusIn(skillId), atValue);
  }

  // ------------------------------------------------------------ mutation

  setLevel(level) {
    this.level = clamp(level, 1, this.rules.maxLevel);
    return this;
  }

  setAttribute(id, value) {
    this.attributes[id] = clamp(value, this.attributeFloor(id), this.rules.maxAttribute);
    this.dropUnreachablePerks();
    return this;
  }

  setFocus(skillId, value) {
    const focus = clamp(value, this.focusFloor(skillId), this.rules.maxFocusPerSkill);
    if (focus === 0) delete this.focus[skillId];
    else this.focus[skillId] = focus;
    this.dropUnreachablePerks();
    return this;
  }

  // ------------------------------------------------------------ perks

  /**
   * A perk is available once its skill reaches the tier threshold. Picking one
   * of a pair replaces the other, so a chosen alternative is not a blocker -
   * clicking it simply switches the choice, which is what a planner needs.
   */
  perkState(perkId) {
    const perk = this.catalog.perk(perkId);
    if (!perk) {
      return { selected: false, available: false, reason: "unknown perk", replaces: null };
    }
    const selected = this.perks.has(perkId);
    const value = this.skillValue(perk.skill);
    if (value < perk.requiredSkill) {
      return {
        selected,
        available: false,
        reason: `Requires ${this.catalog.skill(perk.skill).name} ${perk.requiredSkill}`,
        replaces: null,
      };
    }
    const replaces = perk.alternative && this.perks.has(perk.alternative)
      ? this.catalog.perk(perk.alternative)
      : null;
    return {
      selected,
      available: true,
      reason: null,
      replaces: replaces ? replaces.name : null,
    };
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

  /**
   * Lowering an attribute or focus can put a chosen perk out of reach - and
   * dropping a perk that granted an attribute can cascade into others, so this
   * repeats until nothing more falls out.
   */
  dropUnreachablePerks() {
    for (let pass = 0; pass < 8; pass++) {
      let dropped = false;
      for (const id of [...this.perks]) {
        const perk = this.catalog.perk(id);
        if (perk && this.skillValue(perk.skill) < perk.requiredSkill) {
          this.perks.delete(id);
          dropped = true;
        }
      }
      if (!dropped) return;
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
      perks: [...this.perks],
      mode: this.mode,
      granted: {
        attributes: { ...this.granted.attributes },
        focus: { ...this.granted.focus },
        unspentAttributes: this.granted.unspentAttributes,
        unspentFocus: this.granted.unspentFocus,
      },
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

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

export { BASE_ATTRIBUTE };
