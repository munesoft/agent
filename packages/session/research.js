"use strict";

/**
 * @munesoft/agent — Prior-session recall tool + history-research subagent
 *
 * Two things the reviewer asked about:
 *   1. makeRecallTool(store)      — a tool ANY agent can `.addTool()` so it can
 *                                   search prior sessions during normal work.
 *   2. createHistoryResearchAgent — a subagent that, given a task, produces a short
 *                                   cited report of related prior sessions (decisions,
 *                                   files, gotchas) *before* another agent edits code.
 */

/**
 * A tool that lets an agent search prior sessions mid-task.
 * @param {SessionStore|object} source  a SessionStore, or any object with .search()
 *                                       (e.g. CtxAdapter) — same shape as SessionStore.search
 */
function makeRecallTool(source, opts = {}) {
  return {
    name:        opts.name || "search_prior_sessions",
    description: opts.description ||
      "Search prior agent sessions for related decisions, intent, commands, failed attempts, and files touched, before doing new work. Returns cited snippets with session IDs.",
    schema: { query: "string", file: "string?", limit: "number?" },
    handler: async ({ query, file, limit }) => {
      const results = await source.search(query || "", { file: file || undefined, limit: limit || 5 });
      return {
        found: results.length,
        results: results.map(r => ({
          id:      r.id,
          score:   r.score,
          snippet: r.snippet,
          files:   r.session?.filesTouched || [],
          outcome: r.session?.outcome || "",
        })),
      };
    },
    options: { tags: ["memory", "research"] },
  };
}

/**
 * Build a history-research subagent. It does NOT edit code; it retrieves related
 * prior sessions and returns a compact report the orchestrator can hand to editors.
 *
 * @param {object} cfg
 * @param {SessionStore|object} cfg.store   search source (SessionStore or CtxAdapter)
 * @param {object} [cfg.llm]                optional LLM adapter to prose-summarize; if
 *                                          omitted, a deterministic templated report is used
 * @param {number}[cfg.limit=5]
 * @returns {{ research: (task, files?) => Promise<Report> }}
 */
function createHistoryResearchAgent(cfg = {}) {
  const store = cfg.store;
  const limit = cfg.limit || 5;
  if (!store?.search) throw new Error("createHistoryResearchAgent: cfg.store must expose .search()");

  async function research(task, files = []) {
    // Query by task text, and also union in file-scoped hits for each target file.
    const byTask  = await store.search(task, { limit });
    const byFile  = (await Promise.all(files.map(f => store.search(task, { file: f, limit: 3 })))).flat();

    const seen = new Map();
    for (const r of [...byTask, ...byFile]) if (!seen.has(r.id)) seen.set(r.id, r);
    const hits = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);

    const filesSeen = new Set();
    const decisions = [];
    const gotchas   = [];
    for (const h of hits) {
      (h.session?.filesTouched || []).forEach(f => filesSeen.add(f));
      (h.session?.decisions || []).forEach(d => {
        if (/error|fail|revert|rollback|reject|don'?t|avoid|broke/i.test(d)) gotchas.push(d);
        else decisions.push(d);
      });
    }

    const report = {
      task,
      relatedSessions: hits.map(h => ({ id: h.id, score: h.score, snippet: h.snippet, outcome: h.session?.outcome })),
      filesPreviouslyTouched: [...filesSeen],
      priorDecisions: dedupe(decisions).slice(0, 10),
      knownGotchas:   dedupe(gotchas).slice(0, 10),
    };

    report.brief = cfg.llm
      ? await llmBrief(cfg.llm, report)
      : templateBrief(report);

    return report;
  }

  return { research };
}

function templateBrief(r) {
  if (!r.relatedSessions.length) return `No related prior sessions found for: "${r.task}". Proceed fresh.`;
  const lines = [`Found ${r.relatedSessions.length} related prior session(s):`];
  for (const s of r.relatedSessions) lines.push(`  • [${s.id}] (${s.outcome || "?"}) ${s.snippet}`);
  if (r.filesPreviouslyTouched.length) lines.push(`Files previously touched: ${r.filesPreviouslyTouched.join(", ")}`);
  if (r.knownGotchas.length)  lines.push(`⚠ Known gotchas: ${r.knownGotchas.join("; ")}`);
  if (r.priorDecisions.length) lines.push(`Prior decisions: ${r.priorDecisions.join("; ")}`);
  return lines.join("\n");
}

async function llmBrief(llm, r) {
  const system = "You summarize prior coding-agent sessions for another agent about to start work. Be terse. Surface decisions, rejected approaches, and file-level gotchas. Cite session IDs in brackets.";
  const user   = `Task: ${r.task}\n\nRelated sessions:\n` +
    r.relatedSessions.map(s => `[${s.id}] (${s.outcome}) ${s.snippet}`).join("\n") +
    `\n\nFiles previously touched: ${r.filesPreviouslyTouched.join(", ") || "none"}` +
    `\nGotchas: ${r.knownGotchas.join("; ") || "none"}`;
  try { return (await llm.complete({ system, user })).trim(); }
  catch { return templateBrief(r); }
}

function dedupe(a) { return [...new Set(a)]; }

module.exports = { makeRecallTool, createHistoryResearchAgent };
