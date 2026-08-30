/** Readable names for the party roles a perk effect can apply to. */

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
