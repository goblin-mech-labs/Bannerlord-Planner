/**
 * The skill sheet: attribute plaques and the skill grid on the left, the
 * selected skill's tier track on the right - the layout the game uses.
 */
import { ATTRIBUTES } from "../model/catalog.js";
import { roleLabel } from "../model/effects.js";
import { skillIcon } from "../style/icons.js";
import { append, clear, el, hideTooltip, number, pips, withTooltip } from "./components.js";

export class TreeView {
  constructor(store) {
    this.store = store;
    this.selectedSkill = "OneHanded";
    this.root = el("div", { class: "sheet" });
    this.left = el("section", { class: "panel attribute-groups" });
    this.right = el("section", { class: "panel detail" });
    this.root.append(this.left, this.right);
  }

  render() {
    const { build, catalog } = this.store;
    if (!catalog.skill(this.selectedSkill)) this.selectedSkill = catalog.skills[0].id;
    this.renderSkills(build, catalog);
    this.renderDetail(build, catalog);
    return this.root;
  }

  // --------------------------------------------------------------- left rail

  renderSkills(build, catalog) {
    clear(this.left);

    for (const attribute of ATTRIBUTES) {
      const skills = catalog.skillsByAttribute.get(attribute.id) ?? [];
      this.left.append(el("div", { class: "attribute-row" },
        this.attributePlaque(build, attribute),
        skills.map((skill) => this.skillCell(build, catalog, skill))));
    }

    if (catalog.navalSkills.length) {
      this.left.append(el("div", { class: "attribute-row" },
        el("div", { class: "attribute-plaque", title: "Warsails skills draw on two attributes each" },
          el("span", { class: "abbr" }, "SEA"),
          el("span", { class: "value" }, "⚓")),
        catalog.navalSkills.map((skill) => this.skillCell(build, catalog, skill))));
    }
  }

  attributePlaque(build, attribute) {
    const allocated = build.allocatedAttribute(attribute.id);
    const bonus = build.attributeBonus(attribute.id);
    const value = allocated + bonus;
    const floor = build.attributeFloor(attribute.id);
    const canRaise = allocated < build.rules.maxAttribute;
    const canLower = allocated > floor;
    return el("div", {
      class: "attribute-plaque",
      title: value === floor && floor > 2
        ? `${attribute.id} ${floor} is fixed by your background`
        : null,
    },
      el("span", { class: "abbr" }, attribute.short),
      el("span", { class: "value" },
        value,
        bonus ? el("em", { class: "bonus", title: "granted by a chosen perk" }, `+${bonus}`) : null),
      el("div", { class: "steppers" },
        el("button", {
          type: "button", disabled: !canLower,
          "aria-label": `Lower ${attribute.id}`,
          title: canLower ? null : "Points from character creation cannot be reclaimed",
          onclick: () => this.store.update((b) => b.setAttribute(attribute.id, allocated - 1)),
        }, "−"),
        el("button", {
          type: "button", disabled: !canRaise,
          "aria-label": `Raise ${attribute.id}`,
          onclick: () => this.store.update((b) => b.setAttribute(attribute.id, allocated + 1)),
        }, "+")));
  }

  skillCell(build, catalog, skill) {
    const picked = build.selectedPerks().filter((p) => p.skill === skill.id).length;
    const total = catalog.tiers(skill.id).length;
    const cell = el("button", {
      type: "button",
      class: "skill-cell",
      "aria-current": String(this.selectedSkill === skill.id),
      onclick: () => { this.selectedSkill = skill.id; this.store.notify(); },
    },
      el("span", { class: "icon", html: skillIcon(skill.id) }),
      el("span", { class: "name" }, skill.name),
      el("span", { class: "foot" },
        el("span", { class: "value" }, build.skillValue(skill.id)),
        pips(build.focusIn(skill.id), build.rules.maxFocusPerSkill)));

    return withTooltip(cell, () => [
      el("h4", {}, skill.name),
      el("div", { class: "role" }, skill.attributes.join(" + ")),
      el("div", {}, skill.description),
      el("div", { class: "req-note" },
        `${picked} of ${total} perks chosen · learning limit ${
          Math.round(build.learningLimit(skill.id))}`),
    ]);
  }

  // --------------------------------------------------------------- detail

  renderDetail(build, catalog) {
    clear(this.right);
    const skill = catalog.skill(this.selectedSkill);
    const value = build.skillValue(skill.id);
    const focus = build.focusIn(skill.id);
    const limit = Math.round(build.learningLimit(skill.id));
    // The rate at the cap is zero by definition, so show the rate while the
    // skill is still learning freely - the number that actually differentiates
    // one build from another.
    const rate = build.learningRate(skill.id, 0);

    append(this.right,
      el("div", { class: "detail-head" },
        el("div", { class: "crest", html: skillIcon(skill.id) }),
        el("div", {},
          el("div", { class: "detail-title" },
            el("h2", {}, skill.name),
            el("span", { class: "attrs" }, skill.attributes.join(" · "))),
          el("p", { class: "detail-desc" }, skill.description))),

      el("div", { class: "detail-stats" },
        el("div", { class: "stat big" },
          el("label", {}, "Skill level"), el("b", {}, value)),
        el("div", { class: "stat" },
          el("label", {}, "Focus"),
          el("div", { class: "focus-control" },
            el("button", {
              type: "button",
              disabled: focus <= build.focusFloor(skill.id),
              title: focus > build.focusFloor(skill.id)
                ? null : "Focus placed during character creation cannot be reclaimed",
              "aria-label": "Remove a focus point",
              onclick: () => this.store.update((b) => b.setFocus(skill.id, focus - 1)),
            }, "−"),
            pips(focus, build.rules.maxFocusPerSkill),
            el("button", {
              type: "button", disabled: focus >= build.rules.maxFocusPerSkill,
              "aria-label": "Add a focus point",
              onclick: () => this.store.update((b) => b.setFocus(skill.id, focus + 1)),
            }, "+"))),
        el("div", { class: "stat" },
          el("label", {}, skill.attributes.join(" + ")),
          el("b", {}, skill.attributes.map((a) => build.attribute(a)).join(" / "))),
        el("div", { class: "stat" },
          el("label", {}, "Learns freely to"), el("b", {}, limit)),
        el("div", { class: "stat" },
          el("label", {}, "Learning rate"), el("b", {}, `×${rate.toFixed(2)}`)),
        el("div", { class: "stat" },
          el("label", {}, "XP to cap"),
          el("b", {}, number(build.rules.xpForSkillLevel(value))))),

      el("p", { class: "prompt" }, this.ceilingNote(build, skill, value, focus)),

      this.track(build, catalog, skill));
  }

  /** Explain what the current ceiling is made of, and what would raise it. */
  ceilingNote(build, skill, value, focus) {
    const rules = build.rules;
    const limit = Math.round(build.learningLimit(skill.id));
    const parts = [
      `${value} is the highest ${skill.name} this build can reach — past ${limit} `
      + `experience slows sharply, and at ${value} it stops entirely.`,
    ];

    const spare = rules.maxFocusPerSkill - focus;
    if (spare > 0) {
      const gain = rules.maxSkillLevel(
        skill, build.effectiveAttributes, rules.maxFocusPerSkill) - value;
      parts.push(`${spare} more focus point${spare > 1 ? "s" : ""} would add ${gain}.`);
    }

    const raised = { ...build.effectiveAttributes };
    let lifted = false;
    for (const a of skill.attributes) {
      if (raised[a] < rules.maxAttribute) { raised[a] += 1; lifted = true; }
    }
    if (lifted) {
      const gain = rules.maxSkillLevel(skill, raised, focus) - value;
      if (gain > 0) {
        parts.push(`+1 ${skill.attributes.join(" and +1 ")} would add ${gain}.`);
      }
    }
    return parts.join(" ");
  }

  track(build, catalog, skill) {
    const tiers = catalog.tiers(skill.id);
    const value = build.skillValue(skill.id);
    const rows = Math.max(...tiers.map((t) => t.length), 1);

    return el("div", { class: "track-wrap" },
      el("div", { class: "track" },
        tiers.map((perks, index) => {
          const required = perks[0]?.requiredSkill ?? 0;
          return el("div", { class: `tier${value >= required ? " reached" : ""}` },
            el("div", { class: "req" }, required),
            Array.from({ length: rows }, (_, row) =>
              perks[row]
                ? this.perkShield(build, catalog, perks[row])
                : el("div", { class: "perk empty" })));
        })));
  }

  perkShield(build, catalog, perk) {
    const state = build.perkState(perk.id);
    const classes = ["perk"];
    if (state.selected) classes.push("selected");
    if (!state.available && !state.selected) classes.push("locked");
    if (perk.attributeBonus) classes.push("grants-attribute");

    const node = el("button", {
      type: "button",
      class: classes.join(" "),
      "aria-pressed": String(state.selected),
      onclick: () => {
        if (!state.available && !state.selected) return;
        hideTooltip();
        this.store.update((b) => b.togglePerk(perk.id));
      },
    },
      el("span", { class: "label" }, perk.name));

    return withTooltip(node, () => [
      el("h4", {}, perk.name),
      el("div", { class: "role" },
        `${catalog.skill(perk.skill).name} ${perk.requiredSkill}`),
      el("ul", {}, perk.effects.map((effect) =>
        el("li", {},
          el("span", { class: "role" }, `${roleLabel(effect.role)} — `),
          effect.text))),
      perk.attributeBonus
        ? el("div", { class: "req-note" },
            `Raises ${perk.attributeBonus.attribute} by ${perk.attributeBonus.value}, `
            + "which lifts every skill it governs")
        : null,
      state.reason ? el("div", { class: "note" }, state.reason) : null,
      state.replaces
        ? el("div", { class: "req-note" }, `Choosing this replaces ${state.replaces}`)
        : perk.alternative && !state.reason
          ? el("div", { class: "req-note" },
              `Alternative: ${catalog.perk(perk.alternative)?.name ?? perk.alternative}`)
          : null,
    ]);
  }
}
