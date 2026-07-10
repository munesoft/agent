"use strict";

/**
 * @munesoft/objx integration — safe nested access + settings merging.
 * Use for deep config/settings merges and null-safe reads of agent output / ctx.
 */
const { requireDep } = require("./_load");

function _objx(adapter) {
  const m = requireDep("@munesoft/objx", adapter);
  // objx is a namespace of named fns (merge/get/set/defaults/has/del)
  return (m && m.merge) ? m : (m.default || m);
}

/** Deep-merge settings objects (later sources win). Non-mutating. */
function mergeSettings(target, ...sources) {
  return _objx("mergeSettings").merge({ ...(target || {}) }, ...sources);
}

/** Null-safe deep read: safeGet(obj, "a.b[0].c", fallback). */
function safeGet(obj, path, fallback) {
  return _objx("safeGet").get(obj, path, fallback);
}

/** Apply deep defaults — only fills keys that are undefined in target. */
function applyDefaults(target, defaults) {
  return _objx("applyDefaults").defaults({ ...(target || {}) }, defaults);
}

/** true if a deep path exists. */
function hasPath(obj, path) { return _objx("hasPath").has(obj, path); }

module.exports = { mergeSettings, safeGet, applyDefaults, hasPath };
