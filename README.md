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
- **Share, save, import, export** — **Share Build URL** puts the whole build in
  the address bar and copies it; named builds are kept in `localStorage`; and
  **Export** writes a readable JSON file (`nord-sandbox-level-30.json`) that
  **Import** reads back.

## Publishing it free

The planner is a plain static site — no build step, no dependencies, and every
path in it is relative — so it runs unchanged on any static host. Nothing needs
porting to move between them.

### Cloudflare Pages (recommended)

Free, and the only one of these without a bandwidth cap.

1. Push the repository to GitHub (or GitLab).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo. **Framework preset: None. Build command: leave empty.
   Build output directory: `/`.**
4. Save and deploy. You get `https://<project>.pages.dev`.

### GitHub Pages

Free for **public** repositories on the Free plan. Publishing Pages from a
*private* repository is what requires a paid plan — if you hit a paywall, that
is why, and making the repository public removes it.

Push, then **Settings → Pages → Deploy from a branch**, choose `main` and
`/ (root)`. The site appears at `https://<you>.github.io/<repo>/`. A `.nojekyll`
file is included so Pages serves the files untouched rather than running them
through Jekyll.

### Netlify

`netlify.toml` is included (publish `.`, no build command). Connect the repo at
**Add new site → Import an existing project** and accept the detected settings.
Free tier caps bandwidth at 100 GB/month.

### Vercel

`vercel.json` is included (no framework, no build, output `.`). Import the repo
and deploy. Free tier caps bandwidth at 100 GB/month, and its free plan is for
non-commercial use.

### Anywhere else

Any host that serves a folder works — Codeberg Pages, GitLab Pages, Surge,
Render, an S3 bucket, or a LAN machine running `python -m http.server`. The only
requirements are that `.json` and `.png` are served with normal MIME types and
that the files keep their capitalisation (`OneHanded.png`, not `onehanded.png`),
which every host above does.

### Updating a published site

Every host above deploys from the repository, so publishing an update is a
push:

```bash
git add -A
git commit -m "..."
git push
```

Cloudflare Pages, Netlify and Vercel rebuild within seconds of the push.
GitHub Pages usually takes a minute; **Actions** tab shows the deployment.

Nothing else is needed for changes to the app itself — there is no build step
to run and nothing to upload by hand.

**After a Bannerlord patch**, regenerate the data first, then push:

```bash
pwsh tools/decompile.ps1
python tools/extract.py
python tools/extract_chargen.py
python tools/extract_icons.py
python tools/validate.py          # must pass before committing
git add -A && git commit -m "Update data for <version>" && git push
```

`data/*.json` and `assets/icons/` are committed, so those regenerated files are
what actually reach the site.

**If you don't see the change**, it is almost always the browser cache rather
than a failed deploy — hard-refresh (Ctrl+F5). Check the host's deploy log to
confirm; opening the site in a private window is the quickest way to tell the
two apart.

### What ships

`data/*.json` and `assets/icons/` are both committed, so a clone deploys with
data and artwork and no extra steps. That content is TaleWorlds' — the skill
icons and the game's perk and narrative text. To publish without the artwork,
add `assets/icons/` to `.gitignore`: the planner probes for the icon set at
startup and falls back to empty engraved frames, so the site still looks
deliberate rather than broken.

## Sharing a build

Three ways, in increasing permanence:

| | Where it lives | Good for |
| --- | --- | --- |
| **Share Build URL** | the URL fragment | pasting into chat; nothing leaves the browser |
| **Save / Load** | `localStorage` | your own builds on your own machine |
| **Export / Import** | a `.json` file | posting, versioning, sending to someone else |

**Share Build URL** encodes the whole build into the address bar and copies it.
Opening that link loads the build straight onto the skill tree.

An exported file carries both halves: `build` is the exact state the planner
reloads, and `summary` is a readable snapshot — culture and background by name,
the perks you picked, each skill's cap — so the file is worth reading on its own
in a gist or a forum post.

```json
{
  "format": "bannerlord-planner-build",
  "version": 1,
  "game": { "version": "v1.4.8", "expansions": ["Warsails"] },
  "name": "Nord sandbox level 30",
  "summary": {
    "culture": "Nord",
    "background": { "Family": "Hersir", "Adolescence": "herded the sheep." },
    "skills": { "Roguery": { "cap": 158, "focus": 3, "perks": ["Sweet Talker"] } }
  },
  "build": { "…": "the state the planner reloads" }
}
```

Import is forgiving: a file written against a different game version still
loads, and anything it can no longer resolve — a renamed perk, a skill that
moved — is dropped with a warning rather than failing the whole file.

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

The 21 icons are committed (about 500 KB), so a clone runs with artwork and no
extra steps. `tools/_decompiled/` stays gitignored — it is decompiled source,
not something to redistribute. Panels, frames and type are CSS.

Perk icons are not extracted: they live in a separate atlas
(`ui_characterdeveloper`) encoded as **BC7** rather than DXT5, which this
decoder does not handle. 435 of the 436 perk ids do match a `SPPerks\<PerkId>`
sprite, so adding a BC7 path would light up the whole tier track.

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
src/model/            pure logic, no DOM - rules, build state, chargen, effects,
                      share, storage, buildfile (JSON import/export)
src/ui/               tab shell, the creation wizard and the skill tree
src/style/            theme.css and the skill icon helpers
assets/icons/         generated: the game's skill icons (gitignored)
tests/                browser-run model tests
tools/                decompile + extract + validate pipeline
```

The `model/` layer never touches the DOM, which is what makes it testable and
what keeps the rules in one place.
