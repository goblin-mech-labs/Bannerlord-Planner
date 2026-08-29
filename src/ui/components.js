/** Small DOM helpers and shared widgets. No framework, no build step. */

/**
 * el("div", { class: "x", onclick: fn }, child, "text")
 * Properties starting with "on" become listeners; everything else is an
 * attribute, except `html` which sets innerHTML (used for our inline SVG).
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Five focus pips, as the game draws under each skill. */
export function pips(filled, total = 5) {
  return el("div", { class: "pips", "aria-hidden": "true" },
    Array.from({ length: total }, (_, i) => el("i", { class: i < filled ? "on" : "" })));
}

// ------------------------------------------------------------------ tooltip

let tooltipNode = null;

export function showTooltip(anchor, content) {
  hideTooltip();
  tooltipNode = el("div", { class: "tooltip", role: "tooltip" }, content);
  document.body.appendChild(tooltipNode);

  const box = anchor.getBoundingClientRect();
  const tip = tooltipNode.getBoundingClientRect();
  const margin = 10;
  let left = box.left + box.width / 2 - tip.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));
  let top = box.top - tip.height - 8;
  if (top < margin) top = box.bottom + 8;
  tooltipNode.style.left = `${left}px`;
  tooltipNode.style.top = `${top}px`;
}

export function hideTooltip() {
  tooltipNode?.remove();
  tooltipNode = null;
}

/** Attach hover/focus tooltip behaviour to a node. */
export function withTooltip(node, build) {
  const show = () => showTooltip(node, build());
  node.addEventListener("mouseenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("mouseleave", hideTooltip);
  node.addEventListener("blur", hideTooltip);
  return node;
}

// ------------------------------------------------------------------ toast

let toastTimer = null;

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = el("div", { class: "toast", role: "status" }, message);
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 2600);
}

/** 1234.5 -> "1,235" */
export function number(value) {
  return Math.round(value).toLocaleString("en-US");
}
