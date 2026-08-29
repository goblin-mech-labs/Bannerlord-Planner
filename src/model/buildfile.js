/**
 * Import and export a build as a JSON file.
 *
 * The file carries two things: `build`, the exact state the planner reloads,
 * and `summary`, a readable snapshot (names, not indices) so the file is worth
 * something on its own — in a gist, a forum post, or a diff.
 *
 * Import is deliberately forgiving: a file written against different game data
 * still loads, with anything it can no longer resolve reported as a warning
 * rather than failing the whole thing.
 */
import { Build } from "./build.js";
import { ATTRIBUTES } from "./catalog.js";

export const FORMAT = "bannerlord-planner-build";
export const FILE_VERSION = 1;

/** A plain object ready to be JSON.stringify'd. */
export function toFile(build, name = null) {
  const { catalog } = build;
  const perks = build.selectedPerks();

  return {
    format: FORMAT,
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    game: {
      version: catalog.rules.gameVersion ?? null,
      expansions: catalog.rules.expansions ?? [],
    },
    name: name || defaultName(build),
    summary: {
      mode: build.mode,
      level: build.level,
      culture: catalog.cultures.find((c) => c.id === build.culture)?.name ?? null,
      background: backgroundSummary(build),
      attributes: Object.fromEntries(ATTRIBUTES.map((a) => [
        a.id,
        build.attributeBonus(a.id)
          ? `${build.attribute(a.id)} (${build.allocatedAttribute(a.id)} + ${build.attributeBonus(a.id)} from perks)`
          : build.attribute(a.id),
      ])),
      pointsSpent: {
        attributes: `${build.attributePointsSpent} / ${build.attributePointsAvailable}`,
        focus: `${build.focusPointsSpent} / ${build.focusPointsAvailable}`,
      },
      skills: Object.fromEntries(
        catalog.skills
          .map((s) => [s.name, {
            cap: build.skillValue(s.id),
            focus: build.focusIn(s.id),
            perks: perks.filter((p) => p.skill === s.id).map((p) => p.name),
          }])
          .filter(([, s]) => s.focus || s.perks.length)),
      perkCount: perks.length,
    },
    build: build.toState(),
  };
}

/**
 * Parse a file back into a Build.
 * Returns { build, warnings } or { error } — never throws.
 */
export function fromFile(catalog, text) {
  let payload;
  try {
    payload = typeof text === "string" ? JSON.parse(text) : text;
  } catch (error) {
    return { error: `That is not valid JSON (${error.message}).` };
  }
  if (!payload || typeof payload !== "object") {
    return { error: "That file does not contain a build." };
  }
  if (payload.format !== FORMAT) {
    return { error: "That is not a Bannerlord Planner build file." };
  }
  if (!Number.isInteger(payload.version) || payload.version > FILE_VERSION) {
    return { error: `That file was written by a newer planner (format ${payload.version}).` };
  }
  const state = payload.build;
  if (!state || typeof state !== "object") {
    return { error: "The file is missing its build data." };
  }

  const warnings = [];
  const gameVersion = catalog.rules.gameVersion;
  if (payload.game?.version && gameVersion && payload.game.version !== gameVersion) {
    warnings.push(
      `Built against Bannerlord ${payload.game.version}; this planner has data for ${gameVersion}.`);
  }

  // Drop anything this data set no longer knows about rather than failing.
  const knownPerks = (state.perks ?? []).filter((id) => catalog.perk(id));
  const lostPerks = (state.perks ?? []).length - knownPerks.length;
  if (lostPerks) warnings.push(`${lostPerks} perk(s) are not in this data set and were dropped.`);

  const focus = pickKnownSkills(catalog, state.focus, warnings, "focus");
  const grantedFocus = pickKnownSkills(catalog, state.granted?.focus, warnings, "granted focus");

  const attributes = {};
  for (const attribute of ATTRIBUTES) {
    const value = state.attributes?.[attribute.id];
    if (Number.isFinite(value)) attributes[attribute.id] = value;
  }

  const build = new Build(catalog, {
    level: clampLevel(state.level, catalog),
    mode: state.mode === "sandbox" ? "sandbox" : "campaign",
    culture: catalog.cultures.some((c) => c.id === state.culture) ? state.culture : null,
    choices: typeof state.choices === "object" && state.choices ? state.choices : {},
    attributes,
    focus,
    perks: knownPerks,
    granted: {
      attributes: state.granted?.attributes ?? {},
      focus: grantedFocus,
      unspentAttributes: Number(state.granted?.unspentAttributes) || 0,
      unspentFocus: Number(state.granted?.unspentFocus) || 0,
    },
  });

  // The file may have been written when a perk was still in reach.
  const before = build.perks.size;
  build.dropUnreachablePerks();
  if (build.perks.size < before) {
    warnings.push(`${before - build.perks.size} perk(s) are out of reach for this build and were dropped.`);
  }

  return { build, warnings, name: typeof payload.name === "string" ? payload.name : null };
}

/** A filename-safe default, e.g. "nord-campaign-level-24". */
export function suggestFilename(build) {
  const slug = defaultName(build).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "bannerlord-build"}.json`;
}

function defaultName(build) {
  const culture = build.catalog.cultures.find((c) => c.id === build.culture)?.name;
  return [culture, build.mode === "sandbox" ? "sandbox" : "campaign",
    `level ${build.level}`].filter(Boolean).join(" ");
}

function backgroundSummary(build) {
  const out = {};
  for (const menu of build.catalog.menusFor(build.mode)) {
    const chosen = build.choices[menu.id];
    if (!chosen) continue;
    const option = (build.catalog.optionsByMenu.get(menu.id) ?? [])
      .find((o) => o.id === chosen);
    if (option) out[menu.title] = option.title;
  }
  return out;
}

function pickKnownSkills(catalog, source, warnings, label) {
  const out = {};
  let dropped = 0;
  for (const [id, value] of Object.entries(source ?? {})) {
    if (catalog.skill(id) && Number.isFinite(value)) out[id] = value;
    else dropped++;
  }
  if (dropped) warnings.push(`${dropped} unknown skill(s) in ${label} were ignored.`);
  return out;
}

function clampLevel(level, catalog) {
  const max = catalog.rules.maxLevel ?? 62;
  const value = Number(level);
  return Number.isFinite(value) ? Math.max(1, Math.min(max, Math.round(value))) : 1;
}
