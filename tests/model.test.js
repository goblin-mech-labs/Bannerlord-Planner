import { assert, close, deepEqual, equal, test } from "./harness.js";
import { Catalog } from "../src/model/catalog.js";
import { Build } from "../src/model/build.js";
import { Rules } from "../src/model/rules.js";
import * as chargen from "../src/model/chargen.js";
import * as effects from "../src/model/effects.js";
import * as share from "../src/model/share.js";
import * as buildfile from "../src/model/buildfile.js";

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
  // Warsails' NavalCharacterDevelopmentModel overrides FocusPointsAtStart
  // to BaseModel.FocusPointsAtStart + 6.
  equal(catalog.rules.focusPointsAtStartBase, 5, "base game starts with 5");
  equal(catalog.rules.focusPointsAtStartExpansion, 6, "Warsails adds 6");
  equal(rules.focusPointsForLevel(1), 11, "focus at level 1");
  equal(rules.focusPointsForLevel(36), 46, "focus at level 36");
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

test("a new character starts with every attribute at 2", () => {
  // SetMainHeroInitialStats: AddAttribute(attribute, 2, checkUnspentPoints: false)
  const build = new Build(catalog);
  for (const a of ["Vigor", "Control", "Endurance", "Cunning", "Social", "Intelligence"]) {
    equal(build.attribute(a), 2, `${a} starts at 2`);
  }
  equal(build.attributePointsSpent, 12, "the twelve base points come out of the pool");
  equal(build.attributePointsAvailable, 15, "15 at level 1");
  equal(build.attributePointsLeft, 3, "leaving three to place");
});

test("build tracks attribute and focus budgets", () => {
  const build = new Build(catalog).setLevel(1);
  equal(build.attributePointsAvailable, 15, "available");
  equal(build.attributePointsSpent, 12, "six attributes at 2");
  equal(build.attributePointsLeft, 3, "left");
  build.setAttribute("Vigor", 5);
  equal(build.attributePointsSpent, 15, "after raising Vigor");
  equal(build.focusPointsLeft, 11, "focus untouched");
  build.setFocus("Roguery", 3);
  equal(build.focusPointsLeft, 8, "focus spent");
  assert(!build.overspent, "still within budget");
  for (const skill of ["Bow", "Charm", "Trade", "Steward"]) build.setFocus(skill, 5);
  assert(build.overspent, "overspending is detected");
});

test("attributes and focus are clamped to the game's maxima", () => {
  const build = new Build(catalog);
  build.setAttribute("Vigor", 99);
  equal(build.attribute("Vigor"), 10, "max attribute");
  build.setFocus("Bow", 99);
  equal(build.focusIn("Bow"), 5, "max focus per skill");
  build.setAttribute("Vigor", -5);
  equal(build.attribute("Vigor"), 2, "attributes floor at the base 2");
});

test("points invested by character creation cannot be reclaimed", () => {
  const build = chargen.seedBuild(new Build(catalog), "nord", fullPath("nord"));

  const raised = Object.keys(build.granted.attributes)[0];
  assert(raised, "creation raised an attribute");
  const floor = build.attributeFloor(raised);
  equal(floor, 2 + build.granted.attributes[raised], "floor is base plus the grant");
  build.setAttribute(raised, 2);
  equal(build.attribute(raised), floor, "cannot be pushed below it");

  const focused = Object.keys(build.granted.focus)[0];
  assert(focused, "creation placed focus");
  const focusFloor = build.focusFloor(focused);
  build.setFocus(focused, 0);
  equal(build.focusIn(focused), focusFloor, "placed focus stays");

  build.setAttribute(raised, floor + 1);
  build.setAttribute(raised, floor);
  equal(build.attribute(raised), floor, "hand-placed points can still come back");
});

test("the starting age stage adds to the point pools", () => {
  // GetAgeSelection*OptionArgs: SetUnspentFocusToAdd / SetUnspentAttributeToAdd
  const ages = catalog.optionsFor("narrative_age_selection_menu", "empire");
  equal(ages.length, 4, "four ages");
  const elder = ages.find((o) => o.title === "50");
  equal(elder.grants.unspentAttributes, 4, "age 50 grants 4 attribute points");
  equal(elder.grants.unspentFocus, 8, "and 8 focus points");

  const choices = fullPath("empire", "sandbox");
  choices.narrative_age_selection_menu = elder.id;
  const build = chargen.seedBuild(new Build(catalog), "empire", choices, "sandbox");
  equal(build.attributePointsAvailable, 15 + 4, "pool includes the age grant");
  equal(build.focusPointsAvailable, 11 + 8, "focus pool too");
});

test("the hard cap matches the attribute/focus table, all sixty cells", () => {
  // The published cap table is 14*attribute - 10 + 40*focus. That is not a
  // separate constant: it is where the learning rate reaches zero, given
  // limit = (attr - 1)*10 + focus*30 and the rate's over-limit penalty.
  const roguery = catalog.skill("Roguery");           // single attribute: Cunning
  for (let attribute = 1; attribute <= 10; attribute++) {
    for (let focus = 0; focus <= 5; focus++) {
      const expected = 14 * attribute - 10 + 40 * focus;
      equal(rules.maxSkillLevel(roguery, { Cunning: attribute }, focus), expected,
        `attribute ${attribute}, focus ${focus}`);
    }
  }
});

test("the soft limit and the hard cap are different numbers", () => {
  const roguery = catalog.skill("Roguery");
  const attributes = { Cunning: 7 };
  equal(rules.learningLimit(roguery, attributes, 5), 210, "learns freely to 210");
  equal(rules.maxSkillLevel(roguery, attributes, 5), 288, "but can be pushed to 288");
  // and the rate really does reach zero there
  close(rules.learningRate(roguery, attributes, 5, 288), 0, 1e-9, "rate is zero at the cap");
  assert(rules.learningRate(roguery, attributes, 5, 287) > 0, "and positive just below");
});

test("skill level is the ceiling the build can actually reach", () => {
  const build = new Build(catalog);
  equal(build.skillValue("Roguery"), 18, "base Cunning 2, no focus: 14*2 - 10");
  build.setAttribute("Cunning", 7);
  equal(build.skillValue("Roguery"), 88, "14*7 - 10");
  build.setFocus("Roguery", 5);
  equal(build.skillValue("Roguery"), 288, "plus 5 focus * 40");
});

test("naval skill ceilings use the mean of both attributes", () => {
  const build = new Build(catalog);            // Mariner: Endurance + Cunning
  build.setAttribute("Endurance", 3).setAttribute("Cunning", 7).setFocus("Mariner", 2);
  equal(build.skillValue("Mariner"), 14 * 5 - 10 + 80, "mean of 3 and 7 is 5");
});

test("perks that grant an attribute raise the caps they govern", () => {
  // Athletics 'Durable' gives +1 Endurance, which Athletics itself is governed by.
  const durable = catalog.perks.find((p) => p.name === "Durable");
  assert(durable, "Durable is in the data");
  deepEqual(durable.attributeBonus, { attribute: "Endurance", value: 1 }, "its bonus");

  const build = new Build(catalog).setAttribute("Endurance", 10).setFocus("Athletics", 5);
  const before = build.skillValue("Athletics");
  assert(build.perkState(durable.id).available, "reachable at Endurance 10 with full focus");

  build.selectPerk(durable.id);
  equal(build.attributeBonus("Endurance"), 1, "bonus is counted");
  equal(build.attribute("Endurance"), 11, "effective attribute rises above the allocation cap");
  equal(build.allocatedAttribute("Endurance"), 10, "but the allocation is untouched");
  equal(build.skillValue("Athletics"), before + 14, "and the cap rises by one attribute step");

  // it lifts every other skill that attribute governs, too
  assert(build.skillValue("Riding") > 0, "Riding is an Endurance skill");
  equal(build.attributePointsSpent, new Build(catalog).setAttribute("Endurance", 10)
    .attributePointsSpent, "the bonus costs no points");
});

test("perks unlock at their skill threshold", () => {
  const build = new Build(catalog);
  const perk = catalog.tiers("Roguery")[0][0]; // tier 1, needs 25
  equal(perk.requiredSkill, 25, "tier 1 threshold");
  equal(build.skillValue("Roguery"), 18, "base ceiling falls short");
  assert(!build.perkState(perk.id).available, "so it is locked");
  build.setAttribute("Cunning", 3);            // ceiling 32, clears the tier
  assert(build.perkState(perk.id).available, "unlocked once the ceiling reaches it");
  build.togglePerk(perk.id);
  assert(build.perkState(perk.id).selected, "selected");
});

test("choosing a perk clears its alternative", () => {
  const build = new Build(catalog).setAttribute("Cunning", 6).setFocus("Roguery", 1);
  const [a, b] = catalog.tiers("Roguery")[1];
  assert(a && b, "tier 2 has two alternatives");
  build.selectPerk(a.id);
  build.selectPerk(b.id);
  assert(build.perks.has(b.id), "second choice wins");
  assert(!build.perks.has(a.id), "first choice cleared");
});

test("an already-taken alternative can be switched to, not just blocked", () => {
  const build = new Build(catalog).setAttribute("Cunning", 6).setFocus("Roguery", 1);
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
  equal(build.skillValue("Roguery"), 182, "ceiling covers tier 4");
  const perk = catalog.tiers("Roguery")[3][0]; // needs 100
  build.selectPerk(perk.id);
  assert(build.perks.has(perk.id), "selected");
  build.setFocus("Roguery", 0);
  equal(build.skillValue("Roguery"), 102, "ceiling drops but still covers it");
  assert(build.perks.has(perk.id), "so the perk survives");
  build.setAttribute("Cunning", 4);
  equal(build.skillValue("Roguery"), 46, "now it does not");
  assert(!build.perks.has(perk.id), "and the perk is dropped");
});

// ---------------------------------------------------------------- chargen

function fullPath(culture, mode = "campaign") {
  const choices = {};
  for (const menu of catalog.menusFor(mode)) {
    const option = chargen.availableOptions(catalog, menu.id, culture, choices)[0];
    if (option) choices[menu.id] = option.id;
  }
  return choices;
}

test("character creation grants stack across stages", () => {
  const choices = fullPath("empire");
  const start = chargen.apply(catalog, "empire", choices);
  equal(start.options.length, catalog.menusFor("campaign").length, "one option per stage");

  const attributeGrants = start.options
    .flatMap((o) => o.grants.attributes)
    .reduce((n, g) => n + g.value, 0);
  const spent = Object.values(start.attributes).reduce((a, b) => a + b, 0);
  equal(spent, 12 + attributeGrants, "base two each, plus grants");

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
  const build = chargen.seedBuild(new Build(catalog), "nord",
    fullPath("nord", "sandbox"), "sandbox");
  const restored = share.decode(catalog, share.encode(build));
  equal(restored.grantedFocusPoints, build.grantedFocusPoints, "granted focus");
  equal(restored.grantedAttributePoints, build.grantedAttributePoints, "granted attributes");
  equal(restored.focusPointsSpent, build.focusPointsSpent, "budget matches");
  equal(restored.mode, "sandbox", "mode round trips");
  equal(restored.focusPointsAvailable, build.focusPointsAvailable, "age grant round trips");
});

test("campaign and sandbox ask different final questions", () => {
  // StoryMode deletes the Starting Age menu and adds Story Background.
  const sandbox = catalog.menusFor("sandbox").map((m) => m.id);
  const campaign = catalog.menusFor("campaign").map((m) => m.id);
  assert(sandbox.includes("narrative_age_selection_menu"), "sandbox asks the age");
  assert(!campaign.includes("narrative_age_selection_menu"), "the campaign does not");
  assert(campaign.includes("narrative_escape_menu"), "the campaign asks the story background");
  assert(!sandbox.includes("narrative_escape_menu"), "sandbox does not");
  equal(sandbox.slice(0, 5).join(), campaign.slice(0, 5).join(), "the first five stages match");
});

test("the campaign path grants no spare points, the sandbox one does", () => {
  const campaign = chargen.seedBuild(new Build(catalog), "empire",
    fullPath("empire", "campaign"), "campaign");
  equal(campaign.granted.unspentAttributes, 0, "no loose attribute points");
  equal(campaign.attributePointsAvailable, 15, "so the pool is just the level budget");
  equal(campaign.focusPointsAvailable, 11, "focus is the level budget too");

  const sandbox = chargen.seedBuild(new Build(catalog), "empire",
    fullPath("empire", "sandbox"), "sandbox");
  assert(sandbox.granted.unspentFocus > 0, "the age stage grants focus points");
});

test("re-seeding keeps perks and hand-placed points", () => {
  const build = chargen.seedBuild(new Build(catalog), "empire", fullPath("empire"));
  const attribute = Object.keys(build.granted.attributes)[0];
  build.setAttribute(attribute, build.allocatedAttribute(attribute) + 2);
  const raised = build.allocatedAttribute(attribute);

  const perk = catalog.perks.find((p) => build.perkState(p.id).available);
  build.selectPerk(perk.id);

  // the wizard writes through again after another choice
  chargen.seedBuild(build, "empire", fullPath("empire"));
  equal(build.allocatedAttribute(attribute), raised, "hand-placed points carried over");
  assert(build.perks.has(perk.id), "and the perk survived");
});

test("clearing the background resets to a blank character", () => {
  const build = chargen.seedBuild(new Build(catalog), "nord", fullPath("nord"));
  chargen.clearBackground(build);
  equal(build.culture, null, "culture cleared");
  equal(build.grantedFocusPoints, 0, "no granted focus");
  equal(build.attribute("Vigor"), 2, "attributes back to base");
  equal(build.perks.size, 0, "perks cleared");
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
  equal(share.decode(catalog, btoa(JSON.stringify({ v: 2 }))), null, "v2 links rejected");
});

// ---------------------------------------------------------------- build files

function sampleBuild() {
  const build = chargen.seedBuild(new Build(catalog), "nord",
    fullPath("nord", "sandbox"), "sandbox");
  build.setLevel(24).setAttribute("Cunning", 6).setFocus("Roguery", 3);
  const perk = catalog.tiers("Roguery").flat().find((p) => build.perkState(p.id).available);
  build.selectPerk(perk.id);
  return build;
}

test("a build survives an export/import round trip", () => {
  const build = sampleBuild();
  const file = buildfile.toFile(build);
  const result = buildfile.fromFile(catalog, JSON.stringify(file));

  assert(!result.error, `imported cleanly (${result.error ?? ""})`);
  deepEqual(result.warnings, [], "with no warnings");

  const restored = result.build;
  equal(restored.level, build.level, "level");
  equal(restored.mode, build.mode, "mode");
  equal(restored.culture, build.culture, "culture");
  equal(restored.focusIn("Roguery"), build.focusIn("Roguery"), "focus");
  equal(restored.attribute("Cunning"), build.attribute("Cunning"), "attribute");
  equal(restored.perks.size, build.perks.size, "perk count");
  equal(restored.skillValue("Roguery"), build.skillValue("Roguery"), "derived cap");
  equal(restored.focusPointsAvailable, build.focusPointsAvailable, "age grant carried");
  deepEqual(restored.toState(), build.toState(), "the whole state matches");
});

test("the exported file is readable on its own", () => {
  const file = buildfile.toFile(sampleBuild(), "My Nord");
  equal(file.format, "bannerlord-planner-build", "tagged with a format");
  equal(file.name, "My Nord", "keeps the given name");
  equal(file.game.version, catalog.rules.gameVersion, "records the game version");
  assert(file.game.expansions.includes("Warsails"), "and the expansion");
  equal(file.summary.culture, "Nord", "culture by name, not id");
  assert(Object.keys(file.summary.background).length > 0, "background choices by title");
  assert(Object.keys(file.summary.skills).length > 0, "skills the build actually touches");
  const roguery = file.summary.skills.Roguery;
  equal(roguery.focus, 3, "focus recorded");
  assert(roguery.perks.every((n) => typeof n === "string"), "perks listed by name");
});

test("a filename is suggested from the build", () => {
  const name = buildfile.suggestFilename(sampleBuild());
  assert(name.endsWith(".json"), "is a .json file");
  assert(/^[a-z0-9-]+\.json$/.test(name), `is filename safe: ${name}`);
  assert(name.includes("nord"), "mentions the culture");
});

test("bad files are reported, not thrown", () => {
  for (const [input, why] of [
    ["not json at all", "malformed json"],
    ['{"hello":true}', "some other json"],
    ['{"format":"bannerlord-planner-build","version":999,"build":{}}', "a newer format"],
    ['{"format":"bannerlord-planner-build","version":1}', "no build data"],
  ]) {
    const result = buildfile.fromFile(catalog, input);
    assert(result.error, `${why} is rejected`);
    assert(!result.build, `${why} yields no build`);
  }
});

test("unknown perks and skills are dropped with a warning", () => {
  const file = buildfile.toFile(sampleBuild());
  file.build.perks = [...file.build.perks, "NotARealPerk"];
  file.build.focus = { ...file.build.focus, NotARealSkill: 3 };
  file.game.version = "v0.0.1";

  const result = buildfile.fromFile(catalog, JSON.stringify(file));
  assert(!result.error, "still imports");
  assert(result.build.perks.size > 0, "keeps the perks it recognises");
  assert(!result.build.perks.has("NotARealPerk"), "drops the unknown perk");
  assert(!("NotARealSkill" in result.build.focus), "drops the unknown skill");
  assert(result.warnings.some((w) => w.includes("perk")), "warns about the perk");
  assert(result.warnings.some((w) => w.includes("skill")), "warns about the skill");
  assert(result.warnings.some((w) => w.includes("v0.0.1")), "warns about the game version");
});

test("perks that no longer fit the build are dropped on import", () => {
  const build = sampleBuild();
  const file = buildfile.toFile(build);
  // strip the focus that was holding the ceiling up
  file.build.focus = {};
  file.build.granted.focus = {};
  file.build.attributes = { ...file.build.attributes, Cunning: 2 };

  const result = buildfile.fromFile(catalog, JSON.stringify(file));
  assert(!result.error, "imports");
  equal(result.build.perks.size, 0, "the out-of-reach perk is gone");
  assert(result.warnings.some((w) => w.includes("out of reach")), "and says so");
});
