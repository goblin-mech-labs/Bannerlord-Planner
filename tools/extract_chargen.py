"""Extract the character creation tree from decompiled Bannerlord sources.

Reads the base CharacterCreationCampaignBehavior plus the Warsails
NavalCharacterCreationCampaignBehavior and writes data/chargen.json.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csharp import parse_text_literal, split_args

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "_decompiled")
OUT = os.path.join(ROOT, "data")

FILES = ["CharacterCreationCampaignBehavior.cs", "NavalCharacterCreationCampaignBehavior.cs"]
METHOD = re.compile(r"^\t(?:public|private|internal|protected) (?:\w+ )*?[\w<>\[\], ]+ (\w+)\(", re.M)


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as fh:
        return fh.read()


def methods(text):
    """Split a decompiled class into {methodName: body} by brace matching."""
    out = {}
    for m in METHOD.finditer(text):
        i = text.find("{", m.end())
        if i < 0:
            continue
        depth, j = 0, i
        while j < len(text):
            ch = text[j]
            if ch == '"':
                j += 1
                while j < len(text) and text[j] != '"':
                    j += 2 if text[j] == "\\" else 1
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out[m.group(1)] = text[i:j]
    return out


def constants(text):
    """_focusToAdd / _skillLevelToAdd / _attributeLevelToAdd, per file."""
    out = {}
    for name, value in re.findall(r"(_\w+)\s*=\s*(-?\d+);", text):
        out.setdefault(name, int(value))
    return out


def number(token, consts):
    token = token.strip()
    if re.match(r"^-?\d+$", token):
        return int(token)
    return consts.get(token, 0)


def parse_grants(body, consts):
    """Read a GetXxxNarrativeOptionArgs body into concrete grants."""
    if body is None:
        return None
    skills = re.findall(r"(?:Default|Naval)Skills\.(\w+)", body)
    focus = level = 0
    m = re.search(r"SetFocusToSkills\(([^)]*)\)", body)
    if m:
        focus = number(m.group(1), consts)
    m = re.search(r"SetLevelToSkills\(([^)]*)\)", body)
    if m:
        level = number(m.group(1), consts)
    attributes = []
    for attr, value in re.findall(
            r"SetLevelToAttribute\(\s*DefaultCharacterAttributes\.(\w+)\s*,\s*([^)]*)\)", body):
        attributes.append({"attribute": attr, "value": number(value, consts)})
    return {
        "skills": [{"skill": s, "focus": focus, "level": level} for s in dict.fromkeys(skills)],
        "attributes": attributes,
    }


def parse_cultures(body):
    """All cultures a condition accepts.

    ilspycmd renders `a || b` as an if/return pair, so a single option can name
    several cultures. Taking only the first was what hid options from Khuzait.
    An empty list means the option is not culture-gated.
    """
    if body is None:
        return []
    return list(dict.fromkeys(re.findall(r'StringId == "(\w+)"', body)))


def parse_urban_requirement(body):
    """True/False when an option is gated on an urban/rural upbringing."""
    if body is None or "IsUrbanOccupation" not in body:
        return None
    return not re.search(r"!\s*CharacterOccupationTypes\.IsUrbanOccupation", body)


def parse_parent_occupation(body):
    """The occupation a family option sets, used by the urban/rural gate."""
    if body is None:
        return None
    m = re.search(r'SetParentOccupation\("(\w+)"\)', body)
    return m.group(1) if m else None


def urban_occupations(text):
    """The exact set the game's IsUrbanOccupation switch returns true for.

    Deliberately not a "_urban" suffix rule: Warsails' `shipmaster_urban` is
    absent from the switch, so the game itself treats it as rural.
    """
    start = text.find("IsUrbanOccupation(string occupation)")
    if start < 0:
        return set()
    block = text[start:start + 900]
    found = set(re.findall(r'case "(\w+)":', block))
    found.update(re.findall(r'return occupation == "(\w+)";', block))
    return found


def text_object(token):
    """`new TextObject("{=id}Text", ...)` -> (id, text)."""
    i = token.find("(")
    if i < 0:
        return None, None
    return parse_text_literal(split_args(token[i + 1:token.rfind(")")])[0])


GAME_DIR = os.environ.get(
    "BANNERLORD_DIR",
    r"C:\Program Files (x86)\Steam\steamapps\common\Mount & Blade II Bannerlord")


def extract_cultures():
    """Playable cultures: spcultures.xml with NavalDLC's XSLT patch applied.

    Warsails ships `nord` as is_main_culture="false" in the base file and flips
    it to "true" via NavalDLC_SandBoxCore_SPCultures.xslt, so the base file alone
    would miss a playable culture.
    """
    import xml.etree.ElementTree as ET

    base = os.path.join(GAME_DIR, "Modules", "SandBoxCore", "ModuleData", "spcultures.xml")
    xslt = os.path.join(GAME_DIR, "Modules", "NavalDLC", "ModuleData", "XSLT",
                        "NavalDLC_SandBoxCore_SPCultures.xslt")

    promoted = set()
    if os.path.exists(xslt):
        text = open(xslt, encoding="utf-8").read()
        for block in re.split(r"<xsl:template", text)[1:]:
            m = re.search(r"Culture\[@id='(\w+)'\]", block)
            if m and re.search(
                    r'<xsl:attribute name="is_main_culture">\s*true\s*</xsl:attribute>', block):
                promoted.add(m.group(1))

    cultures = []
    for node in ET.parse(base).getroot().iter("Culture"):
        cid = node.get("id")
        if node.get("is_main_culture") != "true" and cid not in promoted:
            continue
        _, name = parse_text_literal('"%s"' % (node.get("name") or ""))
        cultures.append({
            "id": cid,
            "name": name or cid.title(),
            "expansion": cid in promoted,
        })
    return cultures


def main():
    menus, options, order = {}, [], 0
    # NavalDLC reads FocusToAdd/SkillLevelToAdd/AttributeLevelToAdd off the shared
    # CharacterCreationContent instead of declaring literals, so carry the base
    # game's values forward. Every culture registers the same (1, 10) pair.
    shared = {}

    for filename in FILES:
        text = read(filename)
        shared.update(constants(text))
        consts = shared
        bodies = methods(text)

        # method -> the menu its options land in
        menu_of = {}
        for name, body in bodies.items():
            m = re.search(r'new NarrativeMenu\("([^"]+)", "([^"]*)", "([^"]*)"(.*)', body)
            if m:
                menu_of[name] = m.group(1)
                rest = split_args(m.group(4).split("\n")[0].rstrip(";)").lstrip(", "))
                title = text_object(rest[0]) if rest else (None, None)
                desc = text_object(rest[1]) if len(rest) > 1 else (None, None)
                menus[m.group(1)] = {
                    "id": m.group(1), "previous": m.group(2), "next": m.group(3),
                    "title": title[1], "description": desc[1], "order": len(menus),
                }
                # options added by helper methods called from here
                for callee in re.findall(r"\b(Add\w*(?:Options|MenuOptions))\(", body):
                    menu_of[callee] = m.group(1)
            m = re.search(r'GetNarrativeMenuWithId\("([^"]+)"\)', body)
            if m:
                menu_of[name] = m.group(1)

        for name, body in bodies.items():
            menu = menu_of.get(name)
            if not menu:
                continue
            for call in re.finditer(r"new NarrativeMenuOption\(", body):
                j, depth = call.end(), 1
                while j < len(body) and depth:
                    ch = body[j]
                    if ch == '"':
                        j += 1
                        while j < len(body) and body[j] != '"':
                            j += 2 if body[j] == "\\" else 1
                    elif ch in "([":
                        depth += 1
                    elif ch in ")]":
                        depth -= 1
                    j += 1
                args = split_args(body[call.end():j - 1])
                if len(args) < 6:
                    continue
                option_id = args[0].strip().strip('"')
                title_id, title = text_object(args[1])
                desc_id, desc = text_object(args[2])

                def delegate(token):
                    m = re.search(r"\(([\w]+)\)\s*$", token.strip()) or \
                        re.match(r"^([\w]+)$", token.strip())
                    return m.group(1) if m else None

                order += 1
                options.append({
                    "id": option_id,
                    "menu": menu,
                    "title": title,
                    "titleId": title_id,
                    "description": desc,
                    "descriptionId": desc_id,
                    "cultures": parse_cultures(bodies.get(delegate(args[4]) or "")),
                    "requiresUrban": parse_urban_requirement(
                        bodies.get(delegate(args[4]) or "")),
                    "parentOccupation": parse_parent_occupation(
                        bodies.get(delegate(args[5]) or "")),
                    "grants": parse_grants(bodies.get(delegate(args[3]) or ""), consts),
                    "expansion": filename.startswith("Naval"),
                    "order": order,
                })

    urban = set()
    for filename in ("CharacterOccupationTypes.cs", FILES[0]):
        try:
            urban |= urban_occupations(read(filename))
        except OSError:
            pass

    payload = {
        "cultures": extract_cultures(),
        "urbanOccupations": sorted(urban),
        "menus": sorted(menus.values(), key=lambda m: m["order"]),
        "options": options,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "chargen.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
    print("cultures: %d  menus: %d  options: %d"
          % (len(payload["cultures"]), len(payload["menus"]), len(options)))


if __name__ == "__main__":
    main()
