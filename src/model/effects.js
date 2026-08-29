/**
 * Aggregates the effects of every chosen perk into the grouped summary the
 * game shows on its character sheet (Party Leader / Personal / Governor / ...).
 */

/** Roles in the order the game tends to list them. */
const ROLE_ORDER = [
  "Personal", "PartyLeader", "Captain", "Governor", "ClanLeader", "Ruler",
  "ArmyCommander", "Quartermaster", "Surgeon", "Engineer", "Scout",
  "FirstMate", "Navigator", "PartyOwner", "PartyMember",
];

const ROLE_LABELS = {
  Personal: "Personal",
  PartyLeader: "Party Leader",
  Captain: "Captain",
  Governor: "Governor",
  ClanLeader: "Clan Leader",
  Ruler: "Ruler",
  ArmyCommander: "Army Commander",
  Quartermaster: "Quartermaster",
  FirstMate: "First Mate",
  Navigator: "Navigator",
  PartyOwner: "Party Owner",
  PartyMember: "Party Member",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Group the selected perks' effects by party role.
 * Returns [{ role, label, entries: [{ text, perk, skill }] }] with empty
 * roles omitted, ordered as the game lists them.
 */
export function summarise(build) {
  const groups = new Map();

  for (const perk of build.selectedPerks()) {
    for (const effect of perk.effects) {
      if (effect.increment === "Invalid" && !effect.text) continue;
      if (!effect.text) continue;
      if (!groups.has(effect.role)) groups.set(effect.role, []);
      groups.get(effect.role).push({
        text: effect.text,
        perk: perk.name,
        perkId: perk.id,
        skill: perk.skill,
      });
    }
  }

  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a);
    const ib = ROLE_ORDER.indexOf(b);
    return (ia < 0 ? ROLE_ORDER.length : ia) - (ib < 0 ? ROLE_ORDER.length : ib);
  });

  return ordered.map((role) => ({
    role,
    label: roleLabel(role),
    entries: groups.get(role).sort((a, b) => a.skill.localeCompare(b.skill)),
  }));
}

/** Count of chosen perks per skill, for the tree headers. */
export function perkCounts(build) {
  const counts = new Map();
  for (const perk of build.selectedPerks()) {
    counts.set(perk.skill, (counts.get(perk.skill) ?? 0) + 1);
  }
  return counts;
}
