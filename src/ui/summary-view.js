/** The aggregated effects of every chosen perk, grouped by party role. */
import { summarise } from "../model/effects.js";
import { clear, el } from "./components.js";

export class SummaryView {
  constructor(store) {
    this.store = store;
    this.root = el("div", {});
  }

  render() {
    const { build, catalog } = this.store;
    clear(this.root);

    const groups = summarise(build);
    const chosen = build.selectedPerks();

    this.root.append(el("section", { class: "panel", style: "margin-bottom:14px" },
      el("h3", { class: "panel-title" }, "Build summary"),
      el("div", { class: "tally" },
        this.row("Level", build.level),
        this.row("Culture",
          catalog.cultures.find((c) => c.id === build.culture)?.name ?? "—"),
        this.row("Perks chosen", `${chosen.length} of ${catalog.perks.length}`),
        this.row("Attribute points",
          `${build.attributePointsSpent} / ${build.attributePointsAvailable}`
          + (build.grantedAttributePoints
            ? `  (+${build.grantedAttributePoints} free from background)` : ""),
          build.attributePointsLeft < 0),
        this.row("Focus points",
          `${build.focusPointsSpent} / ${build.focusPointsAvailable}`
          + (build.grantedFocusPoints
            ? `  (+${build.grantedFocusPoints} free from background)` : ""),
          build.focusPointsLeft < 0),
        this.row("Skills raised",
          Object.keys(build.skills).length || "—"))));

    if (!groups.length) {
      this.root.append(el("section", { class: "panel" },
        el("p", { class: "empty-note" },
          "No perks chosen yet. Raise a skill on the Skill Tree tab, then pick perks along its track.")));
      return this.root;
    }

    this.root.append(el("div", { class: "summary-grid" },
      groups.map((group) => el("section", { class: "panel summary-group" },
        el("h3", { class: "panel-title" }, `${group.label} — ${group.entries.length}`),
        el("ul", {},
          group.entries.map((entry) => el("li", {},
            entry.text, " ",
            el("span", { class: "src" },
              `(${catalog.skill(entry.skill)?.name ?? entry.skill}: ${entry.perk})`))))))));

    return this.root;
  }

  row(label, value, warn = false) {
    return el("div", { class: "tally-row" },
      el("span", {}, label),
      el("span", { style: warn ? "color:var(--warn)" : "" }, String(value)));
  }
}
