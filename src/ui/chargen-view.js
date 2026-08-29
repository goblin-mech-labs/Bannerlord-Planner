/**
 * The character creation wizard: culture, then one choice per narrative stage,
 * with a running tally of what those choices grant.
 */
import * as chargen from "../model/chargen.js";
import { ATTRIBUTES } from "../model/catalog.js";
import { BASE_ATTRIBUTE } from "../model/build.js";
import { append, clear, el } from "./components.js";

const CULTURE_STAGE = "__culture__";

export class ChargenView {
  constructor(store, onChange) {
    this.store = store;
    this.onChange = onChange;
    this.stage = CULTURE_STAGE;
    this.mode = "campaign";
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
    this.mode = build.mode ?? "campaign";
    if (build.culture) {
      this.culture = build.culture;
      this.choices = { ...build.choices };
    }
  }

  /** Write the current answers straight onto the build, then re-render. */
  commit() {
    this.onChange(this.culture, this.choices, this.mode);
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
      ...catalog.menusFor(this.mode)
        .map((m) => ({ id: m.id, title: m.title, answered: this.choices[m.id] })),
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
    const option = chargen.availableOptions(catalog, step.id, this.culture, this.choices)
      .find((o) => o.id === this.choices[step.id]);
    return option?.title ?? null;
  }

  // --------------------------------------------------------------- body

  renderBody(catalog) {
    clear(this.body);
    if (this.stage === CULTURE_STAGE) this.renderCultures(catalog);
    else this.renderStage(catalog, catalog.menusFor(this.mode).find((m) => m.id === this.stage));
    this.body.append(this.foot(catalog));
  }

  renderCultures(catalog) {
    append(this.body,
      el("h3", { class: "panel-title" }, "Game mode"),
      el("p", { class: "prompt" },
        "The campaign closes on a Story Background question; sandbox asks your "
        + "starting age instead, which is where its spare attribute and focus points come from."),
      el("div", { class: "culture-grid" },
        catalog.modes.map((mode) => el("button", {
          type: "button",
          class: "culture-card",
          "aria-pressed": String(this.mode === mode.id),
          onclick: () => {
            if (this.mode === mode.id) return;
            this.mode = mode.id;
            for (const menu of catalog.menus) {
              if (!menu.modes.includes(mode.id)) delete this.choices[menu.id];
            }
            this.commit();
          },
        }, mode.name))),
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
            this.stage = catalog.menusFor(this.mode)[0].id;
            this.commit();
          },
        },
          culture.name,
          culture.expansion ? el("span", { class: "tag" }, "Warsails") : null))));
  }

  renderStage(catalog, menu) {
    if (!menu) return;
    const options = chargen.availableOptions(catalog, menu.id, this.culture, this.choices);
    append(this.body,
      el("h3", { class: "panel-title" }, menu.title),
      menu.description ? el("p", { class: "prompt" }, menu.description) : null,
      el("div", { class: "option-list" },
        options.map((option) => el("button", {
          type: "button",
          class: "option",
          "aria-pressed": String(this.choices[menu.id] === option.id),
          onclick: () => {
            this.choices = { ...this.choices, [menu.id]: option.id };
            const stages = catalog.menusFor(this.mode);
            const next = stages[stages.indexOf(menu) + 1];
            this.stage = next ? next.id : menu.id;
            this.commit();
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
    const complete = chargen.isComplete(catalog, this.culture, this.choices, this.mode);
    const start = this.culture
      ? chargen.apply(catalog, this.culture, this.choices, this.mode) : null;

    return el("div", {},
      start ? this.tally(catalog, start) : null,
      el("div", { class: "wizard-foot" },
        el("span", { class: "note" }, complete
          ? "Character creation complete — the skill tree is following along."
          : "Every choice updates the skill tree as you make it."),
        el("button", {
          type: "button", class: "ghost-button",
          onclick: () => {
            this.culture = null;
            this.choices = {};
            this.stage = CULTURE_STAGE;
            this.commit();
          },
        }, "Start over")));
  }

  tally(catalog, start) {
    const attributes = ATTRIBUTES
      .map((a) => ({ id: a.id, value: start.attributes[a.id] ?? BASE_ATTRIBUTE }))
      .filter((a) => a.value > BASE_ATTRIBUTE);
    // Skill levels are derived from attributes and focus, so what carries over
    // from character creation is the attribute and focus placement.
    const focus = Object.entries(start.focus)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, n]) => `${catalog.skill(id)?.name ?? id} ${"•".repeat(n)}`);
    const total = Object.values(start.focus).reduce((a, b) => a + b, 0);

    return el("div", {},
      el("h3", { class: "panel-title" }, "Starting character"),
      el("div", { class: "tally" },
        el("div", { class: "tally-row" },
          el("span", {}, "Attributes"),
          el("span", {}, attributes.length
            ? attributes.map((a) => `${a.id} ${a.value}`).join("  ·  ")
            : "—")),
        el("div", { class: "tally-row" },
          el("span", {}, `Focus placed (${total})`),
          el("span", {}, focus.length ? focus.join("  ·  ") : "—")),
        start.granted.unspentAttributes || start.granted.unspentFocus
          ? el("div", { class: "tally-row" },
              el("span", {}, "Spare points to spend"),
              el("span", {}, [
                start.granted.unspentAttributes
                  ? `${start.granted.unspentAttributes} attribute` : null,
                start.granted.unspentFocus ? `${start.granted.unspentFocus} focus` : null,
              ].filter(Boolean).join("  ·  ")))
          : null));
  }
}
