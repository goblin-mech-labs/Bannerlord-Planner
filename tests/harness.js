/** A very small assert harness; results go to the console and the page. */
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

export function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message || "equal"}: expected ${expected}, got ${actual}`);
  }
}

export function close(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message || "close"}: expected ~${expected}, got ${actual}`);
  }
}

export function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "deepEqual"}: expected ${b}, got ${a}`);
}

export async function run(root) {
  let passed = 0;
  const failures = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      log(root, "pass", name);
    } catch (error) {
      failures.push({ name, error });
      log(root, "fail", `${name} — ${error.message}`);
    }
  }
  const summary = `${passed}/${tests.length} passed`;
  log(root, failures.length ? "fail" : "pass", summary);
  if (failures.length) {
    console.error(`TESTS FAILED: ${failures.length} of ${tests.length}`);
    for (const f of failures) console.error(`  ${f.name}: ${f.error.message}`);
  } else {
    console.log(`ALL TESTS PASSED (${passed})`);
  }
  globalThis.__testResults = { passed, total: tests.length, failures: failures.map((f) => `${f.name}: ${f.error.message}`) };
  return failures.length === 0;
}

function log(root, kind, text) {
  if (!root) return;
  const line = document.createElement("div");
  line.className = kind;
  line.textContent = `${kind === "pass" ? "\u2713" : "\u2717"} ${text}`;
  root.appendChild(line);
}
