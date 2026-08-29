/**
 * The character creation wizard: culture, then one choice per narrative stage,
 * with a running tally of what those choices grant.
 */
import * as chargen from "../model/chargen.js";
import { ATTRIBUTES } from "../model/catalog.js";
import { clear, el, toast } from "./components.js";

const CULTURE_STAGE = "__culture__";

export class ChargenView {
  constructor(store, onApply) {
    this.store = store;
    this.onApply = onApply;
    this.stage = CULTURE_STAGE;
    this.culture = null;
    this.choices = {};
    this.root = el("div", { class: "wizard" });
    this.nav = el("section", { class: "panel stage-list" });
    this.body = el("section", { class: "panel" });
    this.root.append(this.nav, el("div", {}, this.body));
  }

  /** Adopt whatever the current build already recorded. */
  syncFromBuild() {
    const { build } = this.store;
    if (build.culture) {
      this.culture = build.culture;
      this.choices = { ...build.choices };
    }
  }

  render() {
    const { catalog } = this.store;
    this.renderNav(catalog);
    this.renderBody(catalog);
    return this.root;
  }

  // --------------------------------------------------------------- nav

  renderNav(catalog) {
    clear(this.nav);
    const steps = [
      { id: CULTURE_STAGE, title: "Culture", answered: this.culture },
      ...catalog.menus.map((m) => ({ id: m.id, title: m.title, answered: this.choices[m.id] })),
    ];

    steps.forEach((step, index) => {
      const reachable = index === 0 || Boolean(this.culture);
      const answer = this.answerLabel(catalog, step);
      this.nav.append(el("button", {
        type: "button",
        class: `stage-step${step.answered ? " done" : ""}`,
        "aria-current": String(this.stage === step.id),
        disabled: !reachable,
        onclick: () => { this.stage = step.id; this.store.notify(); },
      },
        el("span", { class: "num" }, step.answered ? "✓" : index + 1),
        el("span", {},
          step.title,
          answer ? el("span", { class: "who" }, answer) : null)));
    });
  }

  answerLabel(catalog, step) {
    if (step.id === CULTURE_STAGE) {
      return catalog.cultures.find((c) => c.id === this.culture)?.name ?? null;
    }
    const option = catalog.optionsFor(step.id, this.culture)
      .find((o) => o.id === this.choices[step.id]);
    return option?.title ?? null;
  }

  // --------------------------------------------------------------- body

  renderBody(catalog) {
    clear(this.body);
    if (this.stage === CULTURE_STAGE) this.renderCultures(catalog);
    else this.renderStage(catalog, catalog.menus.find((m) => m.id === this.stage));
    this.body.append(this.foot(catalog));
  }

  renderCultures(catalog) {
    this.body.append(
      el("h3", { class: "panel-title" }, "Choose your culture"),
      el("p", { class: "prompt" },
        "Your culture decides which upbringings are open to you, and colours the whole path."),
      el("div", { class: "culture-grid" },
        catalog.cultures.map((culture) => el("button", {
          type: "button",
          class: "culture-card",
          "aria-pressed": String(this.culture === culture.id),
          onclick: () => {
            if (this.culture !== culture.id) this.choices = {};   // options are culture-gated
            this.culture = culture.id;
            this.stage = catalog.menus[0].id;
            this.store.notify();
          },
        },
          culture.name,
          culture.expansion ? el("span", { class: "tag" }, "Warsails") : null))));
  }

  renderStage(catalog, menu) {
    if (!menu) return;
    const options = catalog.optionsFor(menu.id, this.culture);
    this.body.append(
      el("h3", { class: "panel-title" }, menu.title),
      menu.description ? el("p", { class: "prompt" }, menu.description) : null,
      el("div", { class: "option-list" },
        options.map((option) => el("button", {
          type: "button",
          class: "option",
          "aria-pressed": String(this.choices[menu.id] === option.id),
          onclick: () => {
            this.choices = { ...this.choices, [menu.id]: option.id };
            const next = catalog.menus[catalog.menus.indexOf(menu) + 1];
            this.stage = next ? next.id : menu.id;
            this.store.notify();
          },
        },
          el("div", {},
            el("h4", {}, option.title),
            el("p", {}, option.description)),
          el("div", { class: "grants" },
            chargen.describeGrants(catalog, option)
              .map((text) => el("span", { class: "grant" }, text)),
            option.expansion ? el("span", { class: "grant warsails" }, "Warsails") : null)))));
  }

  foot(catalog) {
    const complete = chargen.isComplete(catalog, this.culture, this.choices);
    const start = this.culture ? chargen.apply(catalog, this.culture, this.choices) : null;

    return el("div", {},
      start ? this.tally(catalog, start) : null,
      el("div", { class: "wizard-foot" },
        el("span", { class: "note" }, complete
          ? "Character creation complete."
          : "Answer every stage to carry these choices into the skill tree."),
        el("div", { style: "display:flex;gap:8px" },
          el("button", {
            type: "button", class: "ghost-button",
            onclick: () => { this.culture = null; this.choices = {}; this.stage = CULTURE_STAGE; this.store.notify(); },
          }, "Start over"),
          el("button", {
            type: "button", class: "ghost-button", disabled: !this.culture,
            onclick: () => {
              this.onApply(this.culture, this.choices);
              toast(complete
                ? "Starting stats applied to the skill tree"
                : "Applied so far — unanswered stages grant nothing");
            },
          }, "Apply to skill tree"))));
  }

  tally(catalog, start) {
    const attributes = ATTRIBUTES
      .map((a) => ({ id: a.id, value: start.attributes[a.id] ?? 1 }))
      .filter((a) => a.value > 1);
    const skills = Object.entries(start.skills)
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => `${catalog.skill(id)?.name ?? id} ${value}`);
    const focus = Object.values(start.focus).reduce((a, b) => a + b, 0);

    return el("div", {},
      el("h3", { class: "panel-title" }, "Starting character"),
      el("div", { class: "tally" },
        el("div", { class: "tally-row" },
          el("span", {}, "Attributes"),
          el("span", {}, attributes.length
            ? attributes.map((a) => `${a.id} ${a.value}`).join("  ·  ")
            : "—")),
        el("div", { class: "tally-row" },
          el("span", {}, "Focus points placed"), el("span", {}, focus || "—")),
        el("div", { class: "tally-row" },
          el("span", {}, "Skills"), el("span", {}, skills.length ? skills.join("  ·  ") : "—"))));
  }
}
