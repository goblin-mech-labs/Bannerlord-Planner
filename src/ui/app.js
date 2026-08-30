/** Tab shell, shared store, and the top bar's level + budget readouts. */
import { Build } from "../model/build.js";
import { Catalog } from "../model/catalog.js";
import * as chargenModel from "../model/chargen.js";
import * as buildfile from "../model/buildfile.js";
import * as share from "../model/share.js";
import * as storage from "../model/storage.js";
import { ChargenView } from "./chargen-view.js";
import { TreeView } from "./tree-view.js";
import { detectIcons } from "../style/icons.js";
import { append, clear, el, hideTooltip, toast } from "./components.js";

const TABS = [
  { id: "chargen", label: "Character Creation" },
  { id: "tree", label: "Skill Tree" },
];

class Store {
  constructor(catalog, build) {
    this.catalog = catalog;
    this.build = build;
    this.listeners = [];
  }

  subscribe(fn) { this.listeners.push(fn); }
  notify() { for (const fn of this.listeners) fn(); }

  update(mutate) {
    mutate(this.build);
    this.notify();
  }
}

export async function start(root) {
  let catalog;
  try {
    catalog = await Catalog.load("");
  } catch (error) {
    root.append(el("p", { class: "empty-note" },
      `Could not load game data — ${error.message}. Serve this folder over HTTP \
(python -m http.server) rather than opening the file directly.`));
    return;
  }

  // Settle whether the extracted icons are present before the first render.
  await detectIcons();

  const fromLink = share.fromLocation(catalog);
  const store = new Store(catalog, fromLink ?? new Build(catalog));

  // The wizard writes through to the build on every choice, so the skill tree
  // reflects character creation live rather than on an explicit apply.
  const chargenView = new ChargenView(store, (culture, choices, mode) => {
    store.update((build) => {
      if (culture) chargenModel.seedBuild(build, culture, choices, mode);
      else chargenModel.clearBackground(build, mode);
    });
  });
  chargenView.syncFromBuild();

  const treeView = new TreeView(store);

  const app = {
    tab: fromLink ? "tree" : "chargen",
    views: { chargen: chargenView, tree: treeView },
  };

  const topbar = el("header", { class: "topbar" });
  const main = el("main", {});
  root.append(el("div", { class: "app" }, topbar, main));

  function renderTopbar() {
    const { build } = store;
    const attrOver = build.attributePointsLeft < 0;
    const focusOver = build.focusPointsLeft < 0;

    append(clear(topbar),
      el("span", { class: "brand" }, "Bannerlord Planner"),
      el("nav", { class: "tabs", role: "tablist" },
        TABS.map((tab) => el("button", {
          type: "button", class: "tab", role: "tab",
          "aria-selected": String(app.tab === tab.id),
          onclick: () => { app.tab = tab.id; render(); },
        }, tab.label))),

      el("div", { class: "level-field" },
        el("label", { for: "level" }, "Level"),
        el("input", {
          id: "level", type: "number", min: "1", max: String(build.rules.maxLevel),
          value: String(build.level),
          onchange: (e) => store.update((b) => b.setLevel(e.target.value)),
        })),

      el("div", { class: "budget" },
        el("div", { class: `pill${attrOver ? " over" : ""}`,
          title: "Attribute points: 15 at level 1, plus one every four levels. "
               + "Points granted by character creation are free and not counted here." },
          el("span", {}, "Attributes"),
          el("b", {}, `${build.attributePointsSpent}/${build.attributePointsAvailable}`),
          build.grantedAttributePoints
            ? el("span", {}, `+${build.grantedAttributePoints} free`) : null),
        el("div", { class: `pill${focusOver ? " over" : ""}`,
          title: "Focus points: 5 at level 1, plus one per level. "
               + "Points granted by character creation are free and not counted here." },
          el("span", {}, "Focus"),
          el("b", {}, `${build.focusPointsSpent}/${build.focusPointsAvailable}`),
          build.grantedFocusPoints
            ? el("span", {}, `+${build.grantedFocusPoints} free`) : null)),

      el("span", { class: "spacer" }),

      el("button", {
        type: "button", class: "ghost-button", onclick: shareBuildUrl,
        title: "Copy a link with this build encoded in it",
      }, "Share Build URL"),
      el("button", {
        type: "button", class: "ghost-button", onclick: exportFile,
        title: "Download this build as a JSON file",
      }, "Export"),
      el("button", {
        type: "button", class: "ghost-button", onclick: importFile,
        title: "Load a build from a JSON file",
      }, "Import"),
      el("button", { type: "button", class: "ghost-button", onclick: saveBuild }, "Save"),
      el("button", { type: "button", class: "ghost-button", onclick: loadBuild }, "Load"),
      el("button", { type: "button", class: "ghost-button", onclick: reset }, "Reset"));
  }

  function render() {
    hideTooltip();
    renderTopbar();
    clear(main).append(app.views[app.tab].render());
  }

  async function shareBuildUrl() {
    const url = share.toShareUrl(store.build, location.href);
    history.replaceState(null, "", `#b=${share.encode(store.build)}`);
    try {
      await navigator.clipboard.writeText(url);
      toast("Build URL copied to the clipboard");
    } catch {
      // Clipboard access needs a secure context; the address bar has it either way.
      toast("Build URL is in the address bar");
    }
  }

  function exportFile() {
    const payload = buildfile.toFile(store.build);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: buildfile.suggestFilename(store.build) });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${buildfile.suggestFilename(store.build)}`);
  }

  function importFile() {
    const input = el("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let text;
      try {
        text = await file.text();
      } catch (error) {
        return toast(`Could not read that file — ${error.message}`);
      }
      const result = buildfile.fromFile(catalog, text);
      if (result.error) return toast(result.error);

      store.build = result.build;
      chargenView.syncFromBuild();
      app.tab = "tree";
      history.replaceState(null, "", location.pathname);
      render();
      toast(result.warnings.length
        ? `Imported with ${result.warnings.length} warning(s): ${result.warnings[0]}`
        : `Imported ${result.name || file.name}`);
      for (const warning of result.warnings) console.warn("Import:", warning);
    });
    input.click();
  }

  function saveBuild() {
    const name = prompt("Save this build as:", store.build.culture ?? "My build");
    if (!name) return;
    toast(storage.save(name, store.build) ? `Saved “${name}”` : "Could not save — storage unavailable");
  }

  function loadBuild() {
    const saved = storage.list();
    if (!saved.length) return toast("No saved builds yet");
    const name = prompt(`Load which build?\n\n${saved.map((s) => `• ${s.name}`).join("\n")}`,
      saved[0].name);
    if (!name) return;
    const state = storage.load(name);
    if (!state) return toast(`No build named “${name}”`);
    store.build = new Build(catalog, state);
    chargenView.syncFromBuild();
    render();
    toast(`Loaded “${name}”`);
  }

  function reset() {
    if (!confirm("Clear this build and start fresh?")) return;
    store.build = new Build(catalog);
    chargenView.culture = null;
    chargenView.choices = {};
    chargenView.stage = "__culture__";
    history.replaceState(null, "", location.pathname);
    app.tab = "chargen";
    render();
  }

  store.subscribe(render);
  window.addEventListener("resize", hideTooltip);
  render();

  // Handy for the browser-driven UI checks.
  globalThis.__planner = { store, app };
}
