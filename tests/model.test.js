import { assert, close, equal, test } from "./harness.js";
import { Catalog } from "../src/model/catalog.js";
import { Build } from "../src/model/build.js";
import { Rules } from "../src/model/rules.js";
import * as chargen from "../src/model/chargen.js";
import * as effects from "../src/model/effects.js";
import * as share from "../src/model/share.js";

const catalog = await Catalog.load("../");
const rules = new Rules(catalog.rules);

// ---------------------------------------------------------------- catalog

test("catalog loads the full Warsails skill set", () => {
  equal(catalog.skills.length, 21, "skill count");
  for (const id of ["Mariner", "Boatswain", "Shipmaster"]) {
    assert(catalog.skill(id), `${id} present`);
    equal(catalog.skill(id).attributes.length, 2, `${id} has two attributes`);
  }
});

test("every perk tier holds one or two mutually exclusive perks", () => {
  for (const skill of catalog.skills) {
    const tiers = catalog.tiers(skill.id);
    assert(tiers.length > 0, `${skill.id} has tiers`);
    tiers.forEach((perks, i) => {
      assert(perks.length === 1 || perks.length === 2, `${skill.id} tier ${i + 1}`);
      for (const perk of perks) equal(perk.tier, i + 1, "tier index matches");
    });
  }
});

// ---------------------------------------------------------------- rules

test("point budgets match HeroDeveloper.SetupDefaultPoints", () => {
  equal(rules.focusPointsForLevel(1), 5, "focus at level 1");
  equal(rules.focusPointsForLevel(36), 40, "focus at level 36");
  equal(rules.attributePointsForLevel(1), 15, "attributes at level 1");
  equal(rules.attributePointsForLevel(36), 23, "attributes at level 36");
  equal(rules.attributePointsForLevel(5), 16, "one extra point every four levels");
});

test("learning limit and rate reproduce the in-game reference", () => {
  // Reference screenshot: Roguery 261, Cunning 7, 5 focus -> limit 210, x3.38.
  const roguery = catalog.skill("Roguery");
  const attributes = { Cunning: 7 };
  equal(rules.learningLimit(roguery, attributes, 5), 210, "learning limit");
  close(rules.learningRate(roguery, attributes, 5, 261), 3.375, 1e-9, "learning rate");
});

test("naval skills average their two attributes", () => {
  const mariner = catalog.skill("Mariner"); // Endurance + Cunning
  equal(rules.averageAttribute(mariner, { Endurance: 3, Cunning: 7 }), 5, "mean attribute");
  equal(rules.learningLimit(mariner, { Endurance: 3, Cunning: 7 }, 0), 40, "limit from mean");
});

test("xp tables match the game's own numbers", () => {
  equal(rules.xpToNextSkillLevel(261), 36831, "Roguery 261 -> 262 span");
  equal(rules.xpForLevel(37), 21049008, "character xp required for level 37");
  equal(rules.xpForLevel(36), 17510852, "character xp required for level 36");
});

// ---------------------------------------------------------------- build

test("build tracks attribute and focus budgets", () => {
  const build = new Build(catalog).setLevel(1);
  equal(build.attributePointsAvailable, 15, "available");
  equal(build.attributePointsSpent, 6, "six attributes floored at one");
  equal(build.attributePointsLeft, 9, "left");
  build.setAttribute("Vigor", 5);
  equal(build.attributePointsSpent, 10, "after raising Vigor");
  equal(build.focusPointsLeft, 5, "focus untouched");
  build.setFocus("Roguery", 3);
  equal(build.focusPointsLeft, 2, "focus spent");
  assert(!build.overspent, "still within budget");
  build.setFocus("Bow", 5);
  assert(build.overspent, "overspending is detected");
});

test("attributes and focus are clamped to the game's maxima", () => {
  const build = new Build(catalog);
  build.setAttribute("Vigor", 99);
  equal(build.attribute("Vigor"), 10, "max attribute");
  build.setFocus("Bow", 99);
  equal(build.focusIn("Bow"), 5, "max focus per skill");
  build.setAttribute("Vigor", -5);
  equal(build.attribute("Vigor"), 1, "attributes floor at one");
});

test("skill level is the ceiling the build can actually reach", () => {
  // CalculateLearningLimit: max(0, (avgAttr - 1) * 10) + focus * 30
  const build = new Build(catalog);
  equal(build.skillValue("Roguery"), 0, "one attribute, no focus");
  build.setAttribute("Cunning", 7);
  equal(build.skillValue("Roguery"), 60, "(7 - 1) * 10");
  build.setFocus("Roguery", 5);
  equal(build.skillValue("Roguery"), 210, "plus 5 focus * 30");
  equal(build.skillValue("Roguery"), Math.floor(build.learningLimit("Roguery")),
    "the level is the limit");
});

test("naval skill ceilings use the mean of both attributes", () => {
  const build = new Build(catalog);            // Mariner: Endurance + Cunning
  build.setAttribute("Endurance", 3).setAttribute("Cunning", 7).setFocus("Mariner", 2);
  equal(build.skillValue("Mariner"), 100, "((3+7)/2 - 1) * 10 + 2 * 30");
});

test("perks unlock at their skill threshold", () => {
  const build = new Build(catalog);
  const perk = catalog.tiers("Roguery")[0][0]; // tier 1, needs 25
  equal(perk.requiredSkill, 25, "tier 1 threshold");
  assert(!build.perkState(perk.id).available, "locked below threshold");
  build.setAttribute("Cunning", 4);            // ceiling 30, clears the tier
  assert(build.perkState(perk.id).available, "unlocked once the ceiling reaches it");
  build.togglePerk(perk.id);
  assert(build.perkState(perk.id).selected, "selected");
});

test("choosing a perk clears its alternative", () => {
  const build = new Build(catalog).setAttribute("Cunning", 6);
  const [a, b] = catalog.tiers("Roguery")[1];
  assert(a && b, "tier 2 has two alternatives");
  build.selectPerk(a.id);
  build.selectPerk(b.id);
  assert(build.perks.has(b.id), "second choice wins");
  assert(!build.perks.has(a.id), "first choice cleared");
});

test("an already-taken alternative can be switched to, not just blocked", () => {
  const build = new Build(catalog).setAttribute("Cunning", 6);
  const [a, b] = catalog.tiers("Roguery")[1];
  build.selectPerk(a.id);

  const state = build.perkState(b.id);
  assert(state.available, "the alternative stays selectable");
  equal(state.replaces, a.name, "and says what it would replace");

  build.togglePerk(b.id);
  assert(build.perks.has(b.id) && !build.perks.has(a.id), "the choice switched");
});

test("spending focus away drops perks it no longer supports", () => {
  const build = new Build(catalog).setAttribute("Cunning", 8).setFocus("Roguery", 2);
  equal(build.skillValue("Roguery"), 130, "ceiling covers tier 5");
  const perk = catalog.tiers("Roguery")[3][0]; // needs 100
  build.selectPerk(perk.id);
  assert(build.perks.has(perk.id), "selected");
  build.setFocus("Roguery", 0);
  equal(build.skillValue("Roguery"), 70, "ceiling drops");
  assert(!build.perks.has(perk.id), "and the perk is dropped");
});

// ---------------------------------------------------------------- chargen

function fullPath(culture) {
  const choices = {};
  for (const menu of catalog.menus) {
    const option = chargen.availableOptions(catalog, menu.id, culture, choices)[0];
    if (option) choices[menu.id] = option.id;
  }
  return choices;
}

test("character creation grants stack across stages", () => {
  const choices = fullPath("empire");
  const start = chargen.apply(catalog, "empire", choices);
  equal(start.options.length, catalog.menus.length, "one option per stage");

  const attributeGrants = start.options
    .flatMap((o) => o.grants.attributes)
    .reduce((n, g) => n + g.value, 0);
  const spent = Object.values(start.attributes).reduce((a, b) => a + b, 0);
  equal(spent, 6 + attributeGrants, "base one each, plus grants");

  for (const option of start.options) {
    for (const grant of option.grants.skills) {
      assert(start.focus[grant.skill] >= grant.focus, `${grant.skill} focused`);
    }
  }
});

test("culture gates which family options appear", () => {
  const empire = catalog.optionsFor("narrative_parent_menu", "empire");
  const nord = catalog.optionsFor("narrative_parent_menu", "nord");
  assert(empire.length > 0 && nord.length > 0, "both cultures have options");
  assert(!empire.some((o) => o.cultures.length && !o.cultures.includes("empire")),
    "no foreign options for empire");
  assert(!nord.some((o) => o.cultures.length && !o.cultures.includes("nord")),
    "no foreign options for nord");
});

test("every culture gets real choices at every stage", () => {
  // Regression: options whose condition is `sturgia || battania` decompile to
  // two returns. Recording only the first left Khuzait with two Youth options.
  for (const culture of catalog.cultures) {
    for (const menu of catalog.menus) {
      const options = catalog.optionsFor(menu.id, culture.id);
      assert(options.length >= 3,
        `${culture.id} / ${menu.id} offered only ${options.length}`);
    }
  }
});

test("options serving several cultures are offered to each of them", () => {
  const shared = catalog.chargen.options.filter((o) => o.cultures.length > 1);
  assert(shared.length > 0, "the data contains multi-culture options");
  for (const option of shared) {
    for (const culture of option.cultures) {
      assert(catalog.optionsFor(option.menu, culture).some((o) => o.id === option.id),
        `${option.id} missing for ${culture}`);
    }
  }
});

test("adolescence is gated on an urban or rural upbringing", () => {
  const stage = "narrative_education_menu";
  const rural = catalog.optionsFor(stage, "empire", "farmer");
  const urban = catalog.optionsFor(stage, "empire", "merchant_urban");
  assert(rural.length >= 3 && urban.length >= 3, "both upbringings have options");
  const ruralIds = new Set(rural.map((o) => o.id));
  assert(urban.some((o) => !ruralIds.has(o.id)), "the two sets actually differ");
  assert(rural.every((o) => o.requiresUrban !== true), "no urban-only options for a farmer");
  assert(urban.every((o) => o.requiresUrban !== false), "no rural-only options for a merchant");
});

test("shipmaster_urban counts as rural, as the game's switch has it", () => {
  assert(!catalog.isUrban("shipmaster_urban"),
    "Warsails' shipmaster_urban is absent from IsUrbanOccupation");
  assert(catalog.isUrban("merchant_urban"), "merchant_urban is urban");
  assert(!catalog.isUrban("farmer"), "farmer is rural");
});

test("seeding a build from character creation replaces its state", () => {
  const build = chargen.seedBuild(new Build(catalog), "nord", fullPath("nord"));
  equal(build.culture, "nord", "culture recorded");
  assert(build.grantedFocusPoints > 0, "focus seeded");
  assert(build.perks.size === 0, "no perks yet");
});

test("character creation points are free and skip the level budget", () => {
  // CharacterCreationContent.ApplySkillAndAttributeEffects calls AddFocus and
  // AddAttribute with checkUnspentPoints: false, so a fresh character can hold
  // more focus than level 1's five points without being over budget.
  const build = chargen.seedBuild(new Build(catalog), "nord", fullPath("nord"));
  assert(build.grantedFocusPoints > build.focusPointsAvailable,
    "the path grants more focus than level 1 supplies");
  equal(build.focusPointsSpent, 0, "none of it charged to the budget");
  assert(!build.overspent, "so the build is not over budget");

  const totalAttributes = Object.values(build.attributes).reduce((a, b) => a + b, 0);
  equal(build.attributePointsSpent, totalAttributes - build.grantedAttributePoints,
    "only the base attributes are charged");

  // Points the player adds afterwards do come out of the budget.
  const before = build.focusPointsSpent;
  build.setFocus("Roguery", 3);
  equal(build.focusPointsSpent, before + 3, "hand-placed focus is charged");
});

test("granted points survive a share round trip", () => {
  const build = chargen.seedBuild(new Build(catalog), "nord", fullPath("nord"));
  const restored = share.decode(catalog, share.encode(build));
  equal(restored.grantedFocusPoints, build.grantedFocusPoints, "granted focus");
  equal(restored.grantedAttributePoints, build.grantedAttributePoints, "granted attributes");
  equal(restored.focusPointsSpent, build.focusPointsSpent, "budget matches");
});

test("the wizard reports the next unanswered stage", () => {
  assert(chargen.nextStage(catalog, null, {}) === null, "no culture, no stage");
  const first = chargen.nextStage(catalog, "empire", {});
  equal(first.id, catalog.menus[0].id, "starts at the first menu");
  assert(!chargen.isComplete(catalog, "empire", {}), "not complete yet");
  assert(chargen.isComplete(catalog, "empire", fullPath("empire")), "complete when all answered");
});

// ---------------------------------------------------------------- effects

test("effect summary groups by party role", () => {
  const build = new Build(catalog).setAttribute("Cunning", 6);
  const perk = catalog.tiers("Roguery")[0].find((p) => p.effects.length > 1);
  build.selectPerk(perk.id);
  const groups = effects.summarise(build);
  assert(groups.length > 0, "produces groups");
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  equal(total, perk.effects.filter((e) => e.text).length, "every effect listed once");
  for (const group of groups) assert(group.label, "each group is labelled");
});

test("effect text has no unresolved placeholders", () => {
  for (const perk of catalog.perks) {
    for (const effect of perk.effects) {
      assert(!effect.text.includes("{VALUE}"), `${perk.id} kept a {VALUE}`);
      assert(!effect.text.includes("{="), `${perk.id} kept a string id`);
    }
  }
});

// ---------------------------------------------------------------- share

test("a build survives an encode/decode round trip", () => {
  const build = new Build(catalog).setLevel(24).setAttribute("Cunning", 7);
  build.culture = "nord";
  build.choices = { narrative_parent_menu: "some_option" };
  build.setFocus("Roguery", 4);
  build.selectPerk(catalog.tiers("Roguery")[0][0].id);

  const restored = share.decode(catalog, share.encode(build));
  assert(restored, "decoded");
  equal(restored.level, 24, "level");
  equal(restored.culture, "nord", "culture");
  equal(restored.attribute("Cunning"), 7, "attribute");
  equal(restored.focusIn("Roguery"), 4, "focus");
  equal(restored.skillValue("Roguery"), build.skillValue("Roguery"), "derived skill level");
  equal(restored.perks.size, build.perks.size, "perk count");
  equal(restored.choices.narrative_parent_menu, "some_option", "choices");
});

test("malformed share links decode to null instead of throwing", () => {
  equal(share.decode(catalog, "not-base64!!"), null, "garbage rejected");
  equal(share.decode(catalog, btoa(JSON.stringify({ v: 99 }))), null, "wrong version rejected");
  equal(share.decode(catalog, btoa(JSON.stringify({ v: 1 }))), null, "v1 links rejected");
});
