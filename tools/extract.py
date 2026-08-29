"""Extract skills, perks and progression rules from decompiled Bannerlord sources.

Reads tools/_decompiled/*.cs (produced by tools/decompile.ps1) and writes
data/skills.json, data/perks.json and data/rules.json.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csharp import (EFFECT_INCREMENT, PARTY_ROLE, parse_enum, parse_float,
                    parse_text_literal, split_args)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "_decompiled")
OUT = os.path.join(ROOT, "data")

# Verified in DefaultCharacterDevelopmentModel.cs (v1.4.8).
TIER_SKILL_REQUIREMENTS = [25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300]


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as fh:
        return fh.read()


def find_calls(text, method):
    """Yield (receiver, args) for `receiver.method(...)`, balancing parentheses."""
    for m in re.finditer(r"(\w+)\." + re.escape(method) + r"\(", text):
        i = m.end()
        depth, start = 1, i
        while i < len(text) and depth:
            ch = text[i]
            if ch == '"':                      # skip string literals wholesale
                i += 1
                while i < len(text) and text[i] != '"':
                    i += 2 if text[i] == "\\" else 1
            elif ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            i += 1
        yield m.group(1), text[start:i - 1]


# --------------------------------------------------------------------------- skills

def extract_skills():
    skills, order = [], 0
    for filename, attr_re in (("DefaultSkills.cs", r"DefaultCharacterAttributes\.(\w+)"),
                              ("NavalSkills.cs", r"DefaultCharacterAttributes\.(\w+)")):
        text = read(filename)
        ids = dict(re.findall(r"(_skill\w+)\s*=\s*Create\(\"(\w+)\"\)", text))
        for receiver, args in find_calls(text, "Initialize"):
            if not receiver.startswith("_skill"):
                continue
            parts = split_args(args)
            if len(parts) < 3:
                continue
            name_id, name = parse_text_literal(
                split_args(parts[0][parts[0].index("(") + 1:-1])[0])
            desc_id, desc = parse_text_literal(
                split_args(parts[1][parts[1].index("(") + 1:-1])[0])
            attributes = re.findall(attr_re, parts[2])
            key = ids.get(receiver, receiver[len("_skill"):])
            order += 1
            skills.append({
                "id": key,
                "field": receiver,
                "name": name,
                "nameId": name_id,
                "description": desc,
                "descriptionId": desc_id,
                "attributes": attributes,
                "naval": filename.startswith("Naval"),
                "order": order,
            })
    return skills


# --------------------------------------------------------------------------- perks

def format_value(value, increment):
    """Render {VALUE} the way the game does: AddFactor is a percentage."""
    if increment == "AddFactor":
        value *= 100
    return str(int(value)) if value == int(value) else ("%g" % round(value, 4))


ATTRIBUTE_EFFECT = re.compile(
    r"^\{VALUE\} (Vigor|Control|Endurance|Cunning|Social|Intelligence) attribute\.?$")


def attribute_bonus(effects):
    """Perks such as Athletics 'Strong' raise an attribute outright.

    They read `{VALUE} Vigor attribute.` as a flat Personal effect, so the
    planner can fold them back into the attribute that drives skill caps.
    """
    for e in effects:
        m = ATTRIBUTE_EFFECT.match(e["description"])
        if m and e["role"] == "Personal" and e["increment"] == "Add":
            return {"attribute": m.group(1), "value": int(e["value"])}
    return None


def effect(desc_literal, role_token, value_token, increment_token):
    desc_id, desc = parse_text_literal(desc_literal)
    if desc is None:
        return None
    increment = parse_enum(increment_token, EFFECT_INCREMENT)
    value = parse_float(value_token)
    text = desc
    if "{VALUE}" in desc:
        text = desc.replace("{VALUE}", format_value(value, increment))
    return {
        "description": desc,
        "descriptionId": desc_id,
        "text": text,
        "role": parse_enum(role_token, PARTY_ROLE),
        "value": value,
        "increment": increment,
    }


def extract_perks(skills):
    by_field = {s["field"]: s["id"] for s in skills}
    perks, field_to_id = [], {}

    for filename in ("DefaultPerks.cs", "NavalPerks.cs"):
        text = read(filename)
        field_to_id.update(dict(re.findall(r"(_\w+)\s*=\s*Create\(\"(\w+)\"\)", text)))

    for filename in ("DefaultPerks.cs", "NavalPerks.cs"):
        text = read(filename)
        for receiver, args in find_calls(text, "Initialize"):
            parts = split_args(args)
            # Most perks carry two effects (12+ args); Smithing perks carry one (8).
            if len(parts) < 8 or not re.match(r"^(DefaultSkills|NavalSkills)\.", parts[1]):
                continue
            name_id, name = parse_text_literal(parts[0])
            skill_field = "_skill" + parts[1].rsplit(".", 1)[1]
            tier_match = re.search(r"GetTierCost\((\d+)\)", parts[2])
            tier = int(tier_match.group(1))
            alt = re.sub(r"^\(\s*PerkObject\s*\)\s*", "", parts[3].strip())
            effects = [e for e in (effect(*parts[4:8]),
                                   effect(*parts[8:12]) if len(parts) >= 12 else None) if e]
            perks.append({
                "id": field_to_id.get(receiver, receiver.lstrip("_")),
                "field": receiver,
                "name": name,
                "nameId": name_id,
                "skill": by_field.get(skill_field, parts[1].rsplit(".", 1)[1]),
                "tier": tier,
                "requiredSkill": TIER_SKILL_REQUIREMENTS[tier - 1],
                "alternativeField": None if alt == "null" else alt,
                "effects": effects,
                "attributeBonus": attribute_bonus(effects),
            })

    for perk in perks:                                   # resolve pairing by id
        alt = perk.pop("alternativeField")
        perk["alternative"] = field_to_id.get(alt, alt.lstrip("_")) if alt else None
    return perks


# --------------------------------------------------------------------------- rules

GAME_DIR = os.environ.get(
    "BANNERLORD_DIR",
    r"C:\Program Files (x86)\Steam\steamapps\common\Mount & Blade II Bannerlord")


def game_version():
    """Native's module version, so exported builds record what they match."""
    import xml.etree.ElementTree as ET
    path = os.path.join(GAME_DIR, "Modules", "Native", "SubModule.xml")
    try:
        node = ET.parse(path).getroot().find("Version")
        return (node.get("value") or "").strip() or None
    except Exception:
        return None


def expansions():
    names = []
    for module, label in (("NavalDLC", "Warsails"),):
        if os.path.isdir(os.path.join(GAME_DIR, "Modules", module)):
            names.append(label)
    return names


def extract_rules():
    text = read("DefaultCharacterDevelopmentModel.cs")
    # NavalCharacterDevelopmentModel delegates every formula to the base model
    # but overrides FocusPointsAtStart => BaseModel.FocusPointsAtStart + 6.
    naval_focus = 0
    try:
        naval = read("NavalCharacterDevelopmentModel.cs")
        m = re.search(r"AdditionalFocusPointsAtStart\s*=\s*(\d+)", naval)
        if m and "FocusPointsAtStart + " in naval:
            naval_focus = int(m.group(1))
    except OSError:
        pass

    def const(name, pattern=r"=>\s*(\d+);"):
        m = re.search(r"\b" + name + r"\s*" + pattern, text)
        return int(m.group(1)) if m else None

    return {
        "gameVersion": game_version(),
        "expansions": expansions(),
        "maxFocusPerSkill": const("MaxFocusPerSkill"),
        "maxAttribute": const("MaxAttribute"),
        "attributePointsAtStart": const("AttributePointsAtStart"),
        "levelsPerAttributePoint": const("LevelsPerAttributePoint"),
        "focusPointsPerLevel": const("FocusPointsPerLevel"),
        "focusPointsAtStart": const("FocusPointsAtStart") + naval_focus,
        "focusPointsAtStartBase": const("FocusPointsAtStart"),
        "focusPointsAtStartExpansion": naval_focus,
        "minSkillRequiredForEpicPerkBonus": const("MinSkillRequiredForEpicPerkBonus"),
        "maxSkillRequiredForEpicPerkBonus": const("MaxSkillRequiredForEpicPerkBonus"),
        "tierSkillRequirements": TIER_SKILL_REQUIREMENTS,
        "maxLevel": 62,
        # CalculateLearningLimit: max(0,(avgAttr-1)*10) + focus*30
        "learningLimit": {"attributeOffset": 1, "attributeFactor": 10, "focusFactor": 30},
        # CalculateLearningRate: 1.25 * (1 + 0.4*avgAttr + focus + overLimitPenalty)
        "learningRate": {"base": 1.25, "attributeFactor": 0.4, "focusFactor": 1.0,
                         "overLimitBase": -1.0, "overLimitPerPoint": -0.1},
        # InitializeXpRequiredForSkillLevel / InitializeSkillsRequiredForLevel
        "skillXp": {"start": 30, "stepBase": 10},
        "levelXp": {"start": 1000, "growthNumerator": 1, "growthDenominator": 5},
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    skills = extract_skills()
    perks = extract_perks(skills)
    rules = extract_rules()
    for name, payload in (("skills", skills), ("perks", perks), ("rules", rules)):
        with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1, ensure_ascii=False)
    print("skills: %d   perks: %d" % (len(skills), len(perks)))
    print("rules :", {k: v for k, v in rules.items() if isinstance(v, int)})


if __name__ == "__main__":
    main()
