/**
 * Skill icons, extracted from the installed game by tools/extract_icons.py.
 *
 * These are the game's own 128x128 mosaic tiles, decoded out of the DXT5 UI
 * atlas in core_game.tpac and written to assets/icons/skills/<SkillId>.png.
 * Re-run the extractor after a game patch.
 */

const BASE = "assets/icons/skills";

/** A skill's icon as an <img> element. */
export function skillIconElement(skillId, size = 32) {
  const img = document.createElement("img");
  img.className = "skill-glyph";
  img.src = `${BASE}/${skillId}.png`;
  img.width = size;
  img.height = size;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  return img;
}

/** The same thing as markup, for the `html:` property of el(). */
export function skillIcon(skillId, size = 32) {
  return `<img class="skill-glyph" src="${BASE}/${skillId}.png" width="${size}"
    height="${size}" alt="" loading="lazy" decoding="async">`;
}
