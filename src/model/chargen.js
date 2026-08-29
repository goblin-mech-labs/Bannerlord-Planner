/**
 * Character creation: turns a culture plus one option per narrative stage into
 * the starting attributes, focus and skill levels a build begins from.
 *
 * Grants are additive (NarrativeMenuOptionArgs exposes FocusToAdd /
 * SkillLevelToAdd / AttributeLevelToAdd), and every option in a stage grants
 * the same shape: +1 to one attribute, and +1 focus / +10 levels to two skills.
 */
import { BASE_ATTRIBUTE, baseAttributes } from "./build.js";

/** Stages the player actually answers, in order. */
export function stages(catalog) {
  return catalog.menus;
}

/**
 * The occupation set by the chosen family option. The Adolescence stage gates
 * its options on whether this was an urban or a rural upbringing.
 */
export function parentOccupation(catalog, culture, choices) {
  const menu = catalog.menus[0];
  if (!menu) return null;
  const chosen = choices[menu.id];
  if (!chosen) return null;
  const option = (catalog.optionsByMenu.get(menu.id) ?? []).find((o) => o.id === chosen);
  return option?.parentOccupation ?? null;
}

/** optionsFor, with the parent occupation resolved from the answers so far. */
export function availableOptions(catalog, menuId, culture, choices) {
  return catalog.optionsFor(menuId, culture, parentOccupation(catalog, culture, choices));
}

/** The stage the wizard should show next, or null when it is complete. */
export function nextStage(catalog, culture, choices) {
  if (!culture) return null;
  return catalog.menus.find((m) => !choices[m.id]) ?? null;
}

export function isComplete(catalog, culture, choices) {
  return Boolean(culture) && catalog.menus.every((m) => choices[m.id]);
}

/**
 * Fold the chosen options into a starting state.
 *
 * `granted` records only what character creation handed over, which the game
 * applies with checkUnspentPoints: false - those points are free and must not
 * be charged against the level budget.
 *
 * Returns { attributes, focus, skills, options, granted }.
 */
export function apply(catalog, culture, choices) {
  const attributes = baseAttributes();
  const focus = {};
  const skills = {};
  const chosen = [];
  const granted = { attributes: {}, focus: {} };

  for (const menu of catalog.menus) {
    const optionId = choices[menu.id];
    if (!optionId) continue;
    const option = availableOptions(catalog, menu.id, culture, choices)
      .find((o) => o.id === optionId);
    if (!option) continue;
    chosen.push(option);

    for (const grant of option.grants.attributes) {
      attributes[grant.attribute] = (attributes[grant.attribute] ?? BASE_ATTRIBUTE) + grant.value;
      granted.attributes[grant.attribute] =
        (granted.attributes[grant.attribute] ?? 0) + grant.value;
    }
    for (const grant of option.grants.skills) {
      focus[grant.skill] = (focus[grant.skill] ?? 0) + grant.focus;
      skills[grant.skill] = (skills[grant.skill] ?? 0) + grant.level;
      granted.focus[grant.skill] = (granted.focus[grant.skill] ?? 0) + grant.focus;
    }
  }
  return { attributes, focus, skills, options: chosen, granted };
}

/** A short "+1 Vigor, +1 focus & +10 Riding, Polearm" style summary. */
export function describeGrants(catalog, option) {
  const parts = [];
  for (const g of option.grants.attributes) parts.push(`+${g.value} ${g.attribute}`);
  const skills = option.grants.skills;
  if (skills.length) {
    const names = skills.map((g) => catalog.skill(g.skill)?.name ?? g.skill).join(", ");
    parts.push(`+${skills[0].level} ${names}`);
    parts.push(`+${skills[0].focus} focus in each`);
  }
  return parts;
}

/** Apply a completed character creation onto a build, in place. */
export function seedBuild(build, culture, choices) {
  const start = apply(build.catalog, culture, choices);
  build.culture = culture;
  build.choices = { ...choices };
  build.attributes = start.attributes;
  build.focus = { ...start.focus };
  build.skills = { ...start.skills };
  build.granted = {
    attributes: { ...start.granted.attributes },
    focus: { ...start.granted.focus },
  };
  build.perks = new Set();
  return build;
}
