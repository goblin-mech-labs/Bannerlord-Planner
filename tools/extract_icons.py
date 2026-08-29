"""Extract the real skill and perk icons from the installed game's UI atlases.

The game keeps its UI art in packed .tpac archives, but every sprite's exact
rectangle is described in plain XML (`*SpriteData.xml`), and the atlases are
DXT5. So we can look up the rectangles we want, locate the atlas payload inside
the archive, and decode only the 4x4 blocks those rectangles cover.

  - skill icons: `SPGeneral\\Skills\\gui_skills_icon_<skill>` at 128x128
  - perk icons:  `SPPerks\\<PerkId>` at 47x47, base game and Warsails

Writes PNGs to assets/icons/skills/ and assets/icons/perks/.
Stdlib only - no PIL, no numpy.

    python tools/extract_icons.py [--game-dir "..."]
"""
import argparse
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zlib

DEFAULT_GAME_DIR = os.environ.get(
    "BANNERLORD_DIR",
    r"C:\Program Files (x86)\Steam\steamapps\common\Mount & Blade II Bannerlord")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "icons")
MODULES = ("Native", "SandBox", "NavalDLC")

SKILL_PREFIX = "SPGeneral\\Skills\\gui_skills_icon_"
PERK_PREFIX = "SPPerks\\"

# sprite suffix -> the skill id used throughout the planner
SKILL_BY_SPRITE = {
    "onehanded": "OneHanded", "twohanded": "TwoHanded", "polearm": "Polearm",
    "bow": "Bow", "crossbow": "Crossbow", "throwing": "Throwing",
    "riding": "Riding", "athletics": "Athletics", "crafting": "Crafting",
    "scouting": "Scouting", "tactics": "Tactics", "roguery": "Roguery",
    "charm": "Charm", "leadership": "Leadership", "trade": "Trade",
    "steward": "Steward", "medicine": "Medicine", "engineering": "Engineering",
    "mariner": "Mariner", "boatswain": "Boatswain", "shipmaster": "Shipmaster",
}


# --------------------------------------------------------------- sprite atlas

def read_sprite_data(game_dir):
    """[(outName, kind, category, sheetId, x, y, w, h)] plus {(cat, sheet): (w, h)}."""
    wanted, sheets = [], {}
    for module in MODULES:
        path = os.path.join(game_dir, "Modules", module, "GUI", module + "SpriteData.xml")
        if not os.path.exists(path):
            continue
        root = ET.parse(path).getroot()

        for category in root.iter("SpriteCategory"):
            name = category.findtext("Name")
            for size in category.iter("SpriteSheetSize"):
                sheets[(name, int(size.get("ID")))] = (int(size.get("Width")),
                                                       int(size.get("Height")))

        for part in root.iter("SpritePart"):
            name = part.findtext("Name") or ""
            kind = out = None
            if name.startswith(SKILL_PREFIX) and not name.endswith(("_small", "_tiny")):
                suffix = name[len(SKILL_PREFIX):]
                if suffix in SKILL_BY_SPRITE:
                    kind, out = "skills", SKILL_BY_SPRITE[suffix]
            elif name.startswith(PERK_PREFIX):
                kind, out = "perks", name[len(PERK_PREFIX):]
            if not kind:
                continue
            wanted.append((
                out, kind, part.findtext("CategoryName"), int(part.findtext("SheetID")),
                int(part.findtext("SheetX")), int(part.findtext("SheetY")),
                int(part.findtext("Width")), int(part.findtext("Height")),
            ))
    return wanted, sheets


# --------------------------------------------------------------- tpac lookup

def asset_packages(game_dir):
    for module in MODULES:
        directory = os.path.join(game_dir, "Modules", module, "AssetPackages")
        if os.path.isdir(directory):
            for name in sorted(os.listdir(directory)):
                if name.endswith(".tpac"):
                    yield os.path.join(directory, name)


def find_texture(packages, texture_name, expected_size):
    """Locate a texture's payload: returns (path, offset, pixelFormat).

    A tpac entry stores the source png path, then a length-prefixed pixel
    format tag, then - past a couple of loose key/value strings - a
    (offset, size, rawSize) triple of 64-bit values. The triple is not aligned
    relative to the tag, so the scan steps a byte at a time and is anchored on
    the payload size, which we know from the atlas dimensions.
    """
    needle = ("AssetSources/GauntletUI/%s.png" % texture_name).encode()
    for path in packages:
        with open(path, "rb") as fh:
            head = fh.read(64 * 1024 * 1024)          # the index lives up front
        index = head.find(needle)
        if index < 0:
            continue
        window = head[index:index + 400]
        fmt = re.search(rb"\x04\x00\x00\x00(DXT[0-9]|BC[0-9]U?)", window)
        if not fmt:
            continue

        tail = window[fmt.end():]
        package_size = os.path.getsize(path)
        for i in range(len(tail) - 24):
            offset, size, raw = struct.unpack_from("<QQQ", tail, i)
            if (size == expected_size and raw == expected_size
                    and 0 < offset and offset + size <= package_size):
                return path, offset, fmt.group(1).decode()
    return None


# --------------------------------------------------------------- DXT5 decode

def _alpha_palette(a0, a1):
    if a0 > a1:
        return [a0, a1] + [((7 - i) * a0 + i * a1) // 7 for i in range(1, 7)]
    return [a0, a1] + [((5 - i) * a0 + i * a1) // 5 for i in range(1, 5)] + [0, 255]


def _rgb565(value):
    r = (value >> 11) & 0x1F
    g = (value >> 5) & 0x3F
    b = value & 0x1F
    return (r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)


def decode_block(block):
    """One DXT5 block -> 16 RGBA tuples in row-major 4x4 order."""
    alphas = _alpha_palette(block[0], block[1])
    alpha_bits = int.from_bytes(block[2:8], "little")

    c0, c1 = struct.unpack_from("<HH", block, 8)
    r0, g0, b0 = _rgb565(c0)
    r1, g1, b1 = _rgb565(c1)
    colors = [
        (r0, g0, b0), (r1, g1, b1),
        ((2 * r0 + r1) // 3, (2 * g0 + g1) // 3, (2 * b0 + b1) // 3),
        ((r0 + 2 * r1) // 3, (g0 + 2 * g1) // 3, (b0 + 2 * b1) // 3),
    ]
    color_bits = struct.unpack_from("<I", block, 12)[0]

    out = []
    for i in range(16):
        alpha = alphas[(alpha_bits >> (3 * i)) & 0x7]
        r, g, b = colors[(color_bits >> (2 * i)) & 0x3]
        out.append((r, g, b, alpha))
    return out


def crop(fh, base_offset, sheet_width, x, y, w, h):
    """Decode the 4x4 blocks covering a rectangle and slice it out."""
    blocks_per_row = sheet_width // 4
    first_bx, last_bx = x // 4, (x + w - 1) // 4
    first_by, last_by = y // 4, (y + h - 1) // 4
    span = last_bx - first_bx + 1

    pixels = [bytearray(w * 4) for _ in range(h)]
    for by in range(first_by, last_by + 1):
        fh.seek(base_offset + (by * blocks_per_row + first_bx) * 16)
        raw = fh.read(span * 16)
        for bx in range(span):
            texels = decode_block(raw[bx * 16:bx * 16 + 16])
            base_px = (first_bx + bx) * 4 - x
            base_py = by * 4 - y
            for i, (r, g, b, a) in enumerate(texels):
                px = base_px + (i % 4)
                py = base_py + (i // 4)
                if 0 <= px < w and 0 <= py < h:
                    off = px * 4
                    pixels[py][off:off + 4] = bytes((r, g, b, a))
    return pixels


# --------------------------------------------------------------- PNG output

def write_png(path, rows, width, height):
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(tag, payload):
        body = tag + payload
        return (struct.pack(">I", len(payload)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)


# --------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-dir", default=DEFAULT_GAME_DIR)
    args = parser.parse_args()

    wanted, sheets = read_sprite_data(args.game_dir)
    if not wanted:
        print("no matching sprites found in the SpriteData files", file=sys.stderr)
        return 1

    by_sheet = {}
    for out, kind, category, sheet, x, y, w, h in wanted:
        by_sheet.setdefault((category, sheet), []).append((out, kind, x, y, w, h))

    packages = list(asset_packages(args.game_dir))
    for kind in ("skills", "perks"):
        os.makedirs(os.path.join(OUT_DIR, kind), exist_ok=True)

    written = {"skills": 0, "perks": 0}
    for (category, sheet), sprites in sorted(by_sheet.items()):
        size = sheets.get((category, sheet))
        if not size:
            print("unknown sheet size for %s_%d" % (category, sheet), file=sys.stderr)
            continue
        tw, th = size
        expected = (tw // 4) * (th // 4) * 16          # DXT5: one byte per pixel
        found = find_texture(packages, "%s_%d" % (category, sheet), expected)
        if not found:
            print("could not locate texture %s_%d" % (category, sheet), file=sys.stderr)
            continue
        path, offset, pixel_format = found
        if pixel_format != "DXT5":
            print("%s_%d is %s, unsupported" % (category, sheet, pixel_format), file=sys.stderr)
            continue
        print("%s_%d: %s %dx%d in %s (%d sprites)"
              % (category, sheet, pixel_format, tw, th, os.path.basename(path), len(sprites)))

        with open(path, "rb") as fh:
            for out, kind, x, y, w, h in sorted(sprites):
                rows = crop(fh, offset, tw, x, y, w, h)
                write_png(os.path.join(OUT_DIR, kind, out + ".png"), rows, w, h)
                written[kind] += 1

    print("\nwrote %d skill icons and %d perk icons to %s"
          % (written["skills"], written["perks"], os.path.relpath(OUT_DIR, ROOT)))
    return 0 if sum(written.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
