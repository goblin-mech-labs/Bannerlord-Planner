/**
 * Skill icons, extracted from the installed game by tools/extract_icons.py.
 *
 * These are the game's own 128x128 mosaic tiles, decoded out of the DXT5 UI
 * atlas in core_game.tpac and written to assets/icons/skills/<SkillId>.png.
 * Re-run the extractor after a game patch.
 */

const BASE = "assets/icons/skills";

/**
 * Probe once for the icon set.
 *
 * The icons are extracted from a local game install and are not committed, so a
 * deployed copy may not have them. One request up front settles it for the whole
 * session: on failure the root gets `no-icons` and CSS swaps every glyph for an
 * empty engraved frame, instead of leaving broken images to resolve one by one.
 */
export async function detectIcons(root = document.documentElement) {
  try {
    const response = await fetch(`${BASE}/OneHanded.png`, { method: "HEAD" });
    if (response.ok) return true;
  } catch {
    // fall through - treated as absent
  }
  root.classList.add("no-icons");
  return false;
}

// Secondary safety net: an individual icon that fails still hides itself.
let listening = false;
function watchForMissingIcons() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("error", (event) => {
    const node = event.target;
    if (node instanceof HTMLImageElement && node.classList.contains("skill-glyph")) {
      node.classList.add("missing");
      node.closest(".icon, .crest")?.classList.add("iconless");
    }
  }, true);
}

/** A skill's icon as an <img> element. */
export function skillIconElement(skillId, size = 32) {
  watchForMissingIcons();
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
  watchForMissingIcons();
  return `<img class="skill-glyph" src="${BASE}/${skillId}.png" width="${size}"
    height="${size}" alt="" loading="lazy" decoding="async">`;
}
