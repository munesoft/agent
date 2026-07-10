"use strict";

/**
 * @munesoft/agent — integration loader
 *
 * The integration layer keeps the framework core zero-dependency: each munesoft-stack
 * package is loaded *lazily*, only when you actually call the adapter that needs it.
 * Requiring this module (or the integrations barrel) never pulls in an optional package.
 */

class IntegrationError extends Error {
  constructor(message, pkg) { super(message); this.name = "IntegrationError"; this.pkg = pkg; }
}

function friendly(pkg, adapter, err) {
  return new IntegrationError(
    `${adapter}() requires the optional peer dependency "${pkg}".\n` +
    `Install it:  npm install ${pkg}\n` +
    (err?.message ? `(original error: ${err.message})` : ""),
    pkg);
}

/** Lazily require a CommonJS-safe optional package. */
function requireDep(pkg, adapter) {
  try { return require(pkg); }
  catch (err) { throw friendly(pkg, adapter, err); }
}

/** Lazily import an (ESM-only) optional package. */
async function importDep(pkg, adapter) {
  try { return await import(pkg); }
  catch (err) { throw friendly(pkg, adapter, err); }
}

/** Unwrap a module's primary export regardless of default/named interop. */
function primary(mod, ...names) {
  for (const n of names) if (mod && typeof mod[n] !== "undefined") return mod[n];
  if (mod && typeof mod.default !== "undefined") return mod.default;
  return mod;
}

/**
 * Is an optional package installed? (used by tests/examples to skip gracefully)
 * Note: some stack packages ship a broken/ESM-only `main`, so `require.resolve(pkg)`
 * can throw even when the package is present — fall back to a filesystem probe for
 * `node_modules/<pkg>/package.json` walking up from this module.
 */
function isAvailable(pkg) {
  try { require.resolve(pkg); return true; } catch { /* fall through */ }
  const fs = require("fs"), path = require("path");
  let dir = __dirname;
  while (true) {
    if (fs.existsSync(path.join(dir, "node_modules", pkg, "package.json"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

module.exports = { IntegrationError, requireDep, importDep, primary, isAvailable };
