"""Minimal helpers for reading decompiled C# emitted by ilspycmd."""
import re

PARTY_ROLE = [
    "None", "Ruler", "ClanLeader", "Governor", "ArmyCommander", "PartyLeader",
    "PartyOwner", "Surgeon", "Engineer", "Scout", "Quartermaster", "PartyMember",
    "Personal", "Captain", "FirstMate", "Navigator", "NumberOfPartyRoles",
]
EFFECT_INCREMENT = {-1: "Invalid", 0: "Add", 1: "AddFactor"}


def split_args(arg_string):
    """Split a C# argument list on top-level commas, respecting strings/nesting."""
    args, depth, buf, in_str, esc = [], 0, [], False, False
    for ch in arg_string:
        if in_str:
            buf.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            buf.append(ch)
        elif ch in "([{":
            depth += 1
            buf.append(ch)
        elif ch in ")]}":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        args.append("".join(buf).strip())
    return args


_TEXT = re.compile(r'^"(?:\{=(?P<id>[^}]*)\})?(?P<text>.*)"$', re.S)


def parse_text_literal(literal):
    """'"{=abc}Wrapped Handles"' -> ('abc', 'Wrapped Handles')."""
    literal = literal.strip()
    m = _TEXT.match(literal)
    if not m:
        return None, None
    return m.group("id") or None, m.group("text")


def parse_enum(token, table):
    """Accept both 'PartyRole.Personal' and '(PartyRole)12'."""
    token = token.strip()
    m = re.match(r"^\(\s*\w+\s*\)\s*(-?\d+)$", token)
    if m:
        value = int(m.group(1))
        if isinstance(table, dict):
            return table.get(value, str(value))
        return table[value] if 0 <= value < len(table) else str(value)
    if "." in token:
        return token.rsplit(".", 1)[1]
    return token


def parse_float(token):
    return float(token.strip().rstrip("fF"))
