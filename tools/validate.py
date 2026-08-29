"""Assert the extracted JSON is complete and self-consistent.

Regex-parsing decompiled C# is the brittle part of this pipeline, so every
structural assumption the web app relies on is checked here. Exits non-zero
with a report if anything is off.
"""
import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

ATTRIBUTES = ["Vigor", "Control", "Endurance", "Cunning", "Social", "Intelligence"]
EXPECTED_SKILLS = [
    "OneHanded", "TwoHanded", "Polearm", "Bow", "Crossbow", "Throwing",
    "Riding", "Athletics", "Crafting", "Scouting", "Tactics", "Roguery",
    "Charm", "Leadership", "Trade", "Steward", "Medicine", "Engineering",
    "Mariner", "Boatswain", "Shipmaster",
]
NAVAL_SKILLS = {"Mariner", "Boatswain", "Shipmaster"}

failures = []


def check(condition, message):
    if not condition:
        failures.append(message)


def load(name):
    with open(os.path.join(DATA, name + ".json"), encoding="utf-8") as fh:
        return json.load(fh)


def main():
    skills, perks, rules, chargen = load("skills"), load("perks"), load("rules"), load("chargen")
    skill_ids = [s["id"] for s in skills]

    # ---- skills
    check(skill_ids == EXPECTED_SKILLS,
          "skill list mismatch: %s" % (set(EXPECTED_SKILLS) ^ set(skill_ids) or "order differs"))
    for s in skills:
        check(bool(s["name"]), "skill %s has no name" % s["id"])
        check(bool(s["description"]), "skill %s has no description" % s["id"])
        check(bool(s["attributes"]), "skill %s has no attribute" % s["id"])
        for a in s["attributes"]:
            check(a in ATTRIBUTES, "skill %s has unknown attribute %r" % (s["id"], a))
        expected = 2 if s["id"] in NAVAL_SKILLS else 1
        check(len(s["attributes"]) == expected,
              "skill %s: expected %d attribute(s), got %d"
              % (s["id"], expected, len(s["attributes"])))

    # ---- perks
    ids = {p["id"] for p in perks}
    check(len(ids) == len(perks), "duplicate perk ids")
    by_skill = collections.defaultdict(list)
    for p in perks:
        by_skill[p["skill"]].append(p)
        check(p["skill"] in skill_ids, "perk %s references unknown skill %s" % (p["id"], p["skill"]))
        check(bool(p["name"]) and "{=" not in p["name"], "perk %s has bad name %r" % (p["id"], p["name"]))
        check(bool(p["effects"]), "perk %s has no effects" % p["id"])
        for e in p["effects"]:
            check("{=" not in e["text"], "perk %s effect has unresolved string id" % p["id"])
            check("{VALUE}" not in e["text"], "perk %s effect kept a {VALUE} placeholder" % p["id"])
        check(p["requiredSkill"] == rules["tierSkillRequirements"][p["tier"] - 1],
              "perk %s tier/requiredSkill mismatch" % p["id"])
        alt = p["alternative"]
        check(alt is None or alt in ids, "perk %s has dangling alternative %r" % (p["id"], alt))

    pairing = {p["id"]: p["alternative"] for p in perks}
    for pid, alt in pairing.items():
        check(alt is None or pairing.get(alt) == pid, "perk %s pairing is not symmetric" % pid)

    for skill, group in by_skill.items():
        tiers = sorted({p["tier"] for p in group})
        check(tiers[0] == 1, "skill %s does not start at tier 1" % skill)
        check(tiers == list(range(1, tiers[-1] + 1)),
              "skill %s has gaps in its tier ladder: %s" % (skill, tiers))
        for tier in tiers:
            n = len([p for p in group if p["tier"] == tier])
            check(n in (1, 2), "skill %s tier %d has %d perks (expected 1 or 2)" % (skill, tier, n))
    for skill in EXPECTED_SKILLS:
        check(skill in by_skill, "skill %s has no perks" % skill)

    # ---- rules
    for key in ("maxFocusPerSkill", "maxAttribute", "attributePointsAtStart",
                "levelsPerAttributePoint", "focusPointsPerLevel", "focusPointsAtStart"):
        check(isinstance(rules.get(key), int), "rules.%s missing" % key)
    check(rules["tierSkillRequirements"][:3] == [25, 50, 75], "unexpected tier requirements")

    # Learning rate must reproduce the in-game value from the reference
    # screenshot: Roguery 261, Cunning 7, 5 focus -> x3.38.
    avg, focus, value = 7.0, 5, 261
    limit = max(0.0, (avg - rules["learningLimit"]["attributeOffset"])
                * rules["learningLimit"]["attributeFactor"]) \
        + focus * rules["learningLimit"]["focusFactor"]
    lr = rules["learningRate"]
    factor = lr["attributeFactor"] * avg + lr["focusFactor"] * focus
    if value > limit:
        factor += lr["overLimitBase"] + lr["overLimitPerPoint"] * (value - limit)
    rate = max(0.0, lr["base"] * (1 + factor))
    check(limit == 210, "learning limit regression: got %s, expected 210" % limit)
    check(abs(rate - 3.375) < 1e-6, "learning rate regression: got %s, expected 3.375" % rate)

    # ---- character creation
    menu_ids = {m["id"] for m in chargen["menus"]}
    check(len(chargen["cultures"]) == 7, "expected 7 playable cultures, got %d" % len(chargen["cultures"]))
    check(any(c["id"] == "nord" for c in chargen["cultures"]), "Warsails 'nord' culture missing")
    for m in chargen["menus"]:
        check(bool(m["title"]), "menu %s has no title" % m["id"])
        check(m["next"] == "" or m["next"] in menu_ids, "menu %s points at unknown next" % m["id"])
        n = len([o for o in chargen["options"] if o["menu"] == m["id"]])
        check(n >= 2, "menu %s has only %d option(s)" % (m["id"], n))
    culture_ids = {c["id"] for c in chargen["cultures"]}
    for o in chargen["options"]:
        check(o["menu"] in menu_ids, "option %s in unknown menu" % o["id"])
        check(bool(o["title"]), "option %s has no title" % o["id"])
        for c in o["cultures"]:
            check(c in culture_ids, "option %s references unknown culture %r" % (o["id"], c))
        for g in o["grants"]["skills"]:
            check(g["skill"] in skill_ids, "option %s grants unknown skill %s" % (o["id"], g["skill"]))
        for g in o["grants"]["attributes"]:
            check(g["attribute"] in ATTRIBUTES,
                  "option %s grants unknown attribute %s" % (o["id"], g["attribute"]))
    # Every narrative option grants something. The age-selection stage is the
    # one exception - it only sets the starting age.
    for o in chargen["options"]:
        if o["menu"] == "narrative_age_selection_menu":
            continue
        check(bool(o["grants"]["skills"]),
              "option %s grants no skills (constant resolution failed?)" % o["id"])
        check(bool(o["grants"]["attributes"]),
              "option %s grants no attribute (constant resolution failed?)" % o["id"])
        for g in o["grants"]["skills"]:
            check(g["focus"] > 0 and g["level"] > 0,
                  "option %s has a zero-valued skill grant" % o["id"])

    # Every culture must reach every stage with a real choice. This is what
    # caught Khuzait being left with two Youth options: multi-culture
    # conditions (`sturgia || battania`) were only recording their first match.
    urban = set(chargen.get("urbanOccupations", []))
    for cid in culture_ids:
        for m in chargen["menus"]:
            for occupation in (None, "farmer", "merchant_urban"):
                available = [
                    o for o in chargen["options"]
                    if o["menu"] == m["id"]
                    and (not o["cultures"] or cid in o["cultures"])
                    and (o["requiresUrban"] is None or occupation is None
                         or (occupation in urban) == o["requiresUrban"])
                ]
                check(len(available) >= 3,
                      "culture %s, stage %s, %s upbringing: only %d option(s)"
                      % (cid, m["id"], occupation or "any", len(available)))

    check(urban, "urban occupation set is empty")
    check("shipmaster_urban" not in urban,
          "shipmaster_urban is absent from the game's IsUrbanOccupation switch, "
          "so it must stay classified as rural")

    print("skills %d | perks %d | cultures %d | menus %d | options %d"
          % (len(skills), len(perks), len(chargen["cultures"]),
             len(chargen["menus"]), len(chargen["options"])))
    if failures:
        print("\nFAILED (%d):" % len(failures))
        for f in failures:
            print("  -", f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
