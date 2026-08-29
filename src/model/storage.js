/**
 * Named builds in localStorage. Every access is guarded - the storage
 * accessor itself throws in private windows and thumbnail captures.
 */
const KEY = "bannerlord-planner.builds";

function read() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function write(all) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function list() {
  return Object.entries(read())
    .map(([name, entry]) => ({ name, savedAt: entry.savedAt ?? 0 }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function save(name, build) {
  const all = read();
  all[name] = { savedAt: Date.now(), state: build.toState() };
  return write(all);
}

export function load(name) {
  return read()[name]?.state ?? null;
}

export function remove(name) {
  const all = read();
  delete all[name];
  return write(all);
}
