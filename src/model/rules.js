/**
 * Progression maths, ported from TaleWorlds.CampaignSystem
 * DefaultCharacterDevelopmentModel and HeroDeveloper (v1.4.8).
 *
 * Every constant comes from data/rules.json, which tools/extract.py reads out
 * of the decompiled model - nothing here is hand-tuned.
 */

const MAX_SKILL_LEVEL = 1024;

export class Rules {
  constructor(data) {
    this.data = data;
    this._skillXp = null;
    this._levelXp = null;
  }

  get maxAttribute() { return this.data.maxAttribute; }
  get maxFocusPerSkill() { return this.data.maxFocusPerSkill; }
  get maxLevel() { return this.data.maxLevel; }

  /** HeroDeveloper.SetupDefaultPoints: (level-1) * perLevel + atStart. */
  focusPointsForLevel(level) {
    const { focusPointsAtStart, focusPointsPerLevel } = this.data;
    return (level - 1) * focusPointsPerLevel + focusPointsAtStart;
  }

  /** HeroDeveloper.SetupDefaultPoints: (level-1) / perPoint + atStart (integer division). */
  attributePointsForLevel(level) {
    const { attributePointsAtStart, levelsPerAttributePoint } = this.data;
    return Math.floor((level - 1) / levelsPerAttributePoint) + attributePointsAtStart;
  }

  /** Mean of the skill's governing attributes - naval skills have two. */
  averageAttribute(skill, attributes) {
    const values = skill.attributes.map((a) => attributes[a] ?? 0);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * CalculateLearningLimit: max(0, (avgAttr - 1) * 10) + focus * 30.
   * A soft cap - skills can exceed it, they just gain XP very slowly.
   */
  learningLimit(skill, attributes, focus) {
    const { attributeOffset, attributeFactor, focusFactor } = this.data.learningLimit;
    const avg = this.averageAttribute(skill, attributes);
    return Math.max(0, (avg - attributeOffset) * attributeFactor) + focus * focusFactor;
  }

  /**
   * The hard ceiling: the level at which the learning rate reaches zero and the
   * skill can gain no further experience.
   *
   * Not a separate game constant - it falls out of the two formulas above.
   * Learning rate is base * (1 + attrF*avg + focusF*focus + overBase +
   * overPerPoint*(skill - limit)), so it hits zero at
   *
   *     limit + (1 + attrF*avg + focusF*focus + overBase) / -overPerPoint
   *
   * With the shipped constants that reduces to 14*attr - 10 + 40*focus, which
   * is the community attribute/focus cap table exactly, all sixty cells.
   */
  maxSkillLevel(skill, attributes, focus) {
    const lr = this.data.learningRate;
    const avg = this.averageAttribute(skill, attributes);
    const limit = Math.round(this.learningLimit(skill, attributes, focus));
    const headroom =
      (1 + lr.attributeFactor * avg + lr.focusFactor * focus + lr.overLimitBase)
      / -lr.overLimitPerPoint;
    // The result is a whole number for whole attributes and focus, but the
    // constants are binary fractions (0.4 / 0.1), so round rather than floor.
    return Math.max(0, Math.round(limit + headroom));
  }

  /**
   * CalculateLearningRate. ExplainedNumber applies factors additively against
   * the base, i.e. base * (1 + sum(factors)), floored at zero.
   */
  learningRate(skill, attributes, focus, skillValue) {
    const lr = this.data.learningRate;
    const avg = this.averageAttribute(skill, attributes);
    const limit = Math.round(this.learningLimit(skill, attributes, focus));
    let factor = lr.attributeFactor * avg + lr.focusFactor * focus;
    if (skillValue > limit) {
      factor += lr.overLimitBase + lr.overLimitPerPoint * (skillValue - limit);
    }
    return Math.max(0, lr.base * (1 + factor));
  }

  /** Cumulative XP needed to reach each skill level (InitializeXpRequiredForSkillLevel). */
  get skillXpTable() {
    if (!this._skillXp) {
      const { start, stepBase } = this.data.skillXp;
      const table = new Array(MAX_SKILL_LEVEL);
      let step = start;
      table[0] = step;
      for (let i = 1; i < MAX_SKILL_LEVEL; i++) {
        step += stepBase + i;
        table[i] = table[i - 1] + step;
      }
      this._skillXp = table;
    }
    return this._skillXp;
  }

  /** GetXpRequiredForSkillLevel. */
  xpForSkillLevel(level) {
    if (level <= 0) return 0;
    return this.skillXpTable[Math.min(level, MAX_SKILL_LEVEL) - 1];
  }

  /** XP to go from `level` to `level + 1`. */
  xpToNextSkillLevel(level) {
    return this.xpForSkillLevel(level + 1) - this.xpForSkillLevel(level);
  }

  /** Total character XP required per level (InitializeSkillsRequiredForLevel). */
  get levelXpTable() {
    if (!this._levelXp) {
      const { start, growthNumerator, growthDenominator } = this.data.levelXp;
      const table = new Array(this.maxLevel + 2).fill(0);
      let step = start;
      let total = 1;
      table[1] = 1;
      for (let i = 2; i < table.length; i++) {
        total += step;
        table[i] = total;
        step += start + Math.floor((step * growthNumerator) / growthDenominator);
      }
      this._levelXp = table;
    }
    return this._levelXp;
  }

  xpForLevel(level) {
    const table = this.levelXpTable;
    return level < table.length ? table[level] : Infinity;
  }
}
