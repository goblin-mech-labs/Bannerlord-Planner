# Bannerlord Character Planner

An interactive planner for *Mount & Blade II: Bannerlord* — the complete skill
tree as of **v1.4.8 with the Warsails expansion**, the character creation flow
that seeds your starting stats, and the game's real attribute/focus budgeting.

Zero build step: plain ES modules, CSS and JSON.

```bash
python -m http.server 8123
```

Then open <http://localhost:8123/>.

## What it does

- **Character Creation** — game mode and culture, then one choice per narrative
  stage, using the game's own text, with a running tally of what each path
  grants. Every choice updates the skill tree live. **Campaign** and **Sandbox** diverge
  at the last stage: StoryMode deletes the Starting Age question and asks its
  Story Background one instead, so only sandbox characters get the spare
  attribute and focus points the age choice hands out.
- **Skill Tree** — all 21 skills including the three Warsails skills, laid out
  as the game does: attribute plaques, the skill grid (with the game's own
  icons), and a horizontal tier track of paired perk shields. Each skill sits
  at the **highest level the build can actually reach**, so perks light up
  exactly when your attributes and focus put them in range.
- **Summary** — every chosen perk's effects aggregated and grouped by party
  role (Personal / Party Leader / Governor / Captain / …).
- **Two ceilings, both shown** — a skill *learns freely* up to
  `(attribute − 1) × 10 + focus × 30`, then slows sharply, and stops entirely
  at `14 × attribute − 10 + focus × 40`. The second is the planner's skill
  level. It is not a separate game constant: it is where the learning rate
  formula reaches zero, and it reproduces the published attribute/focus cap
  table in all sixty cells.
- **Perks that grant attributes feed back in** — Athletics Strong / Steady /
  Durable and the three Smithing ones raise an attribute outright, which lifts
  the cap of every skill that attribute governs. Taking Durable adds 14 to
  Athletics *and* Riding.
- **Share and save** — the whole build encodes into the URL fragment; named
  builds are kept in `localStorage`.

## Where the data comes from

Nothing here is transcribed from a wiki. `data/*.json` is generated from a local
Bannerlord install, so it matches the installed version exactly:

| Source | Provides |
| --- | --- |
| `TaleWorlds.CampaignSystem.dll` → `DefaultPerks` | 374 base perks: skill, tier, alternative pairing, effects |
| `NavalDLC.dll` → `NavalPerks` / `NavalSkills` | the 3 Warsails skills and their 62 perks |
| `TaleWorlds.Core.dll` → `DefaultSkills` | skill names, descriptions, governing attributes |
| `DefaultCharacterDevelopmentModel` | every progression constant and formula |
| `CharacterCreationCampaignBehavior` (+ naval and StoryMode) | the narrative stage tree and its grants, per game mode |
| `spcultures.xml` + `NavalDLC_SandBoxCore_SPCultures.xslt` | playable cultures |
| `core_game.tpac` + `NativeSpriteData.xml` | the 21 skill icons (DXT5 atlas) |

Two details worth knowing, because both are easy to get wrong:

- The three naval skills each answer to **two** attributes (Mariner =
  Endurance + Cunning, Boatswain = Control + Social, Shipmaster = Vigor +
  Intelligence), and the learning formulas use the mean of them.
- Character creation applies its grants with `checkUnspentPoints: false`, so
  those attribute and focus points are **free** — they never come out of the
  level budget. The planner tracks them separately and labels them.
- Warsails raises the starting focus pool: `NavalCharacterDevelopmentModel`
  delegates every formula to the base model but overrides `FocusPointsAtStart`
  to `BaseModel.FocusPointsAtStart + 6`, so level 1 has 11 focus, not 5.
- Every attribute starts at **2**, not 1 (`SetMainHeroInitialStats` calls
  `AddAttribute(attribute, 2, checkUnspentPoints: false)`), and those 12 points
  *are* charged to the 15-point starting pool — so a fresh character has 3 left
  to place.
- The Starting Age stage grants **unspent** points rather than placements
  (`SetUnspentFocusToAdd` / `SetUnspentAttributeToAdd`): 20 → +2 focus/+1
  attribute, rising to 50 → +8/+4. Those add to the pools, and the campaign
  never sees them because StoryMode removes that stage.
- Options can serve several cultures (`sturgia || battania` decompiles to two
  returns), and the Adolescence stage is gated on an urban/rural upbringing via
  `IsUrbanOccupation`. That switch omits Warsails' `shipmaster_urban`, so the
  game itself treats it as rural — the extractor copies the switch rather than
  guessing from the `_urban` suffix.

### Regenerating after a game patch

```bash
dotnet tool install -g ilspycmd
pwsh tools/decompile.ps1          # -GameDir "..." or $env:BANNERLORD_DIR to override
python tools/extract.py
python tools/extract_chargen.py
python tools/validate.py
```

`tools/validate.py` is the gate: parsing decompiled C# with regexes is the
brittle part of this pipeline, so it asserts everything the app relies on —
no unresolved string ids, contiguous tier ladders, one or two perks per tier,
all 21 skills attributed, every narrative option carrying grants — and it
re-checks the learning-rate formula against a known in-game value.

### Icons

```bash
python tools/extract_icons.py
```

The skill icons are the game's own art. `NativeSpriteData.xml` gives every
sprite's exact rectangle, and the atlas holding them (`ui_group1` sheet 2, a
4096x4096 DXT5 texture in `core_game.tpac`) is located inside the archive and
decoded block by block — only the ~1000 blocks each 128x128 icon covers, so it
runs in a second on stdlib alone.

`tools/_decompiled/` and `assets/icons/` are both gitignored: they are derived
TaleWorlds content. Run the two extractors after cloning. Panels, frames and
type are CSS.

## Verifying

Model tests run in the browser — open <http://localhost:8123/tests/> after
starting the server. They check the progression maths against numbers read
straight off a real character sheet:

| Check | Value |
| --- | --- |
| Learning rate at Roguery 261, Cunning 7, 5 focus | ×3.375 → displayed ×3.38 |
| Learning limit for the same | 210 |
| Hard cap for the same | 288 |
| XP from Roguery 261 → 262 | 36,831 |
| Total character XP required for level 37 | 21,049,008 |

The cap test walks the entire published attribute/focus table — 10 attribute
values × 6 focus values — and requires all sixty to match.

## Layout

```
index.html            app shell
data/                 generated: skills, perks, rules, chargen
src/model/            pure logic, no DOM - rules, build state, chargen, effects, share, storage
src/ui/               tab shell and the three views
src/style/            theme.css and the skill icon helpers
assets/icons/         generated: the game's skill icons (gitignored)
tests/                browser-run model tests
tools/                decompile + extract + validate pipeline
```

The `model/` layer never touches the DOM, which is what makes it testable and
what keeps the rules in one place.
