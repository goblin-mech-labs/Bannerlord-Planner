/**
 * Compact, URL-safe encoding of a build.
 *
 * Perks and skills are stored as catalog indices because they dominate the
 * payload; everything else keeps its readable id. The version marker lets a
 * future data change reject stale links instead of decoding them wrongly.
 */
import { Build } from "./build.js";
import { ATTRIBUTES } from "./catalog.js";

const VERSION = 3;   // v3: game mode, base attribute 2, unspent grants

export function encode(build) {
  const { catalog } = build;
  const skillIndex = new Map(catalog.skills.map((s, i) => [s.id, i]));
  const perkIndex = new Map(catalog.perks.map((p, i) => [p.id, i]));

  const payload = {
    v: VERSION,
    l: build.level,
    c: build.culture ?? null,
    h: build.choices,
    a: ATTRIBUTES.map((a) => build.attribute(a.id)),
    f: Object.entries(build.focus).map(([id, n]) => [skillIndex.get(id) ?? -1, n]),
    p: [...build.perks].map((id) => perkIndex.get(id) ?? -1).filter((i) => i >= 0),
    // free points from character creation, so budgets restore correctly
    m: build.mode,
    gua: build.granted.unspentAttributes,
    guf: build.granted.unspentFocus,
    ga: build.granted.attributes,
    gf: Object.entries(build.granted.focus).map(([id, n]) => [skillIndex.get(id) ?? -1, n]),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decode(catalog, text) {
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(text));
  } catch {
    return null;
  }
  if (!payload || payload.v !== VERSION) return null;

  const state = {
    level: payload.l ?? 1,
    culture: payload.c ?? null,
    choices: payload.h ?? {},
    attributes: {},
    focus: {},
    perks: [],
    mode: payload.m ?? "campaign",
    granted: {
      attributes: payload.ga ?? {},
      focus: {},
      unspentAttributes: payload.gua ?? 0,
      unspentFocus: payload.guf ?? 0,
    },
  };
  for (const [index, value] of payload.gf ?? []) {
    const skill = catalog.skills[index];
    if (skill) state.granted.focus[skill.id] = value;
  }
  ATTRIBUTES.forEach((a, i) => {
    if (Array.isArray(payload.a) && payload.a[i] != null) state.attributes[a.id] = payload.a[i];
  });
  for (const [index, value] of payload.f ?? []) {
    const skill = catalog.skills[index];
    if (skill) state.focus[skill.id] = value;
  }
  for (const index of payload.p ?? []) {
    const perk = catalog.perks[index];
    if (perk) state.perks.push(perk.id);
  }
  return new Build(catalog, state);
}

/** Read a build from `#b=...`, if present. */
export function fromLocation(catalog, hash = globalThis.location?.hash ?? "") {
  const match = /[#&]b=([^&]+)/.exec(hash);
  return match ? decode(catalog, match[1]) : null;
}

export function toShareUrl(build, base = globalThis.location?.href ?? "") {
  const url = new URL(base, "https://example.invalid");
  url.hash = `b=${encode(build)}`;
  return url.toString();
}

// Base64url over UTF-8, without depending on Node or a bundler.
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
