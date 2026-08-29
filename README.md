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

- **Character Creation** — culture, then one choice per narrative stage
  (Family → Early Childhood → Adolescence → Youth → Young Adulthood →
  Starting Age), using the game's own text, with a running tally of what each
  path grants. Apply it to seed the skill tree.
- **Skill Tree** — all 21 skills including the three Warsails skills, laid out
  as the game does: attribute plaques, the skill grid, and a horizontal tier
  track of paired perk shields. Shows learning limit, learning rate and XP to
  the next level per skill.
- **Summary** — every chosen perk's effects aggregated and grouped by party
  role (Personal / Party Leader / Governor / Captain / …).
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
| `CharacterCreationCampaignBehavior` (+ the naval one) | the narrative stage tree and its grants |
| `spcultures.xml` + `NavalDLC_SandBoxCore_SPCultures.xslt` | playable cultures |

Two details worth knowing, because both are easy to get wrong:

- The three naval skills each answer to **two** attributes (Mariner =
  Endurance + Cunning, Boatswain = Control + Social, Shipmaster = Vigor +
  Intelligence), and the learning formulas use the mean of them.
- Character creation applies its grants with `checkUnspentPoints: false`, so
  those attribute and focus points are **free** — they never come out of the
  level budget. The planner tracks them separately and labels them.

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

`tools/_decompiled/` is gitignored: it is derived TaleWorlds source, and the
UI is a CSS/SVG reskin rather than extracted game art (the real sprites live in
packed `.tpac` archives).

## Verifying

Model tests run in the browser — open <http://localhost:8123/tests/> after
starting the server. They check the progression maths against numbers read
straight off a real character sheet:

| Check | Value |
| --- | --- |
| Learning rate at Roguery 261, Cunning 7, 5 focus | ×3.375 → displayed ×3.38 |
| Learning limit for the same | 210 |
| XP from Roguery 261 → 262 | 36,831 |
| Total character XP required for level 37 | 21,049,008 |

## Layout

```
index.html            app shell
data/                 generated: skills, perks, rules, chargen
src/model/            pure logic, no DOM - rules, build state, chargen, effects, share, storage
src/ui/               tab shell and the three views
src/style/            theme.css and the hand-drawn SVG skill glyphs
tests/                browser-run model tests
tools/                decompile + extract + validate pipeline
```

The `model/` layer never touches the DOM, which is what makes it testable and
what keeps the rules in one place.
