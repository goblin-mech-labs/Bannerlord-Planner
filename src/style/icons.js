/**
 * Hand-authored line-art glyphs, one per skill, drawn in the game's palette.
 * No game assets are used - the in-game sprites live in packed .tpac archives
 * and are TaleWorlds' artwork.
 *
 * Every glyph is a 24x24 stroke drawing so it stays crisp at any size and
 * inherits colour from its container.
 */

const PATHS = {
  // Vigor
  OneHanded: '<path d="M17 3 20 6 10 16 8 14 17 3Z"/><path d="M8 14 5.5 16.5 7.5 18.5 10 16"/><path d="M4 20 7.5 16.5M6 21l3-3"/>',
  TwoHanded: '<path d="M12 2 14 4v11h-4V4l2-2Z"/><path d="M7 15h10"/><path d="M12 15v6"/><path d="M9.5 21h5"/>',
  Polearm: '<path d="M12 2 14 7l-2 3-2-3 2-5Z"/><path d="M12 10v12"/><path d="M9 12h6"/>',
  // Control
  Bow: '<path d="M6 3c7 3 7 15 0 18"/><path d="M6 3 20 21"/><path d="M6 3v18"/>',
  Crossbow: '<path d="M4 8h16"/><path d="M4 8c2 3 4 4 8 4s6-1 8-4"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  Throwing: '<path d="M4 20 18 6"/><path d="M18 6l3-3-1 4-4 1 2-2Z"/><path d="M4 20l1.5-4.5"/>',
  // Endurance
  Riding: '<path d="M4 18c1-6 4-9 8-9 2 0 3-1 4-3l3 3-2 2c1 4-1 7-4 7"/><path d="M8 18v3M15 18v3"/>',
  Athletics: '<circle cx="14" cy="4.5" r="2"/><path d="M13 8 9 12l3 3-1 6"/><path d="M13 8l4 2 2 4"/><path d="M9 12 4 13"/>',
  Crafting: '<path d="M3 20 11 12"/><path d="M9 10l4-4"/><path d="M13 6 17 2l5 5-4 4-5-5Z"/><path d="M2 21h8"/>',
  // Cunning
  Scouting: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 10 10l-1.5 5.5L14 14l1.5-5.5Z"/>',
  Tactics: '<path d="M6 3v18"/><path d="M6 4h13l-3 4 3 4H6"/>',
  Roguery: '<path d="M12 2 15 9l-3 3-3-3 3-7Z"/><path d="M12 12v6"/><path d="M9 18h6l-3 4-3-4Z"/>',
  // Social
  Charm: '<path d="M12 21C7 17 3 14 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 14 17 17 12 21Z"/>',
  Leadership: '<path d="M3 8l4 4 5-8 5 8 4-4-2 12H5L3 8Z"/><path d="M5 20h14"/>',
  Trade: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2 14h6L5 7Z"/><path d="M19 7l-3 7h6l-3-7Z"/><path d="M8 21h8"/>',
  // Intelligence
  Steward: '<circle cx="8" cy="8" r="4"/><path d="M11 11 21 21"/><path d="M18 18l2-2M15 15l2-2"/>',
  Medicine: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
  Engineering: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  // Warsails
  Mariner: '<circle cx="12" cy="4" r="2"/><path d="M12 6v15"/><path d="M7 9h10"/><path d="M4 14c0 5 4 7 8 7s8-2 8-7"/>',
  Boatswain: '<path d="M4 9c3-3 6 3 9 0s5-3 7 0"/><path d="M4 15c3-3 6 3 9 0s5-3 7 0"/><path d="M8 3c2 2 2 4 0 6"/><path d="M16 21c-2-2-2-4 0-6"/>',
  Shipmaster: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5"/>',
};

const FALLBACK = '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>';

/** A skill glyph as an SVG string. */
export function skillIcon(skillId) {
  return svg(PATHS[skillId] ?? FALLBACK);
}

/**
 * A small mark for a perk shield. Perks have no art of their own, so the
 * shield carries its skill's glyph - which is what makes a tier track read
 * as belonging to one skill.
 */
export function perkIcon(skillId) {
  return skillIcon(skillId);
}

function svg(body) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

export { PATHS as SKILL_GLYPHS };
