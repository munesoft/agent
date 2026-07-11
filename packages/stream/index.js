"use strict";

async function* streamAgent(agent, input, context = {}) {
  if (!agent?.events?.on || typeof agent.run !== "function") throw new StreamError("streamAgent requires an Agent");
  const queue = [];
  let wake = null;
  let finished = false;
  const push = value => { queue.push(value); if (wake) { wake(); wake = null; } };
  const detach = agent.events.on("*", event => push({ type: "event", event: event.event, data: event }));
  Promise.resolve(agent.run(input, context)).then(
    response => push({ type: "result", response }),
    error => push({ type: "error", error })
  ).finally(() => { finished = true; if (wake) { wake(); wake = null; } });

  try {
    while (!finished || queue.length) {
      if (!queue.length) await new Promise(resolve => { wake = resolve; });
      while (queue.length) yield queue.shift();
    }
  } finally { detach(); }
}

async function collectStream(iterable) { const items = []; for await (const item of iterable) items.push(item); return items; }
class StreamError extends Error { constructor(message) { super(message); this.name = "StreamError"; } }
module.exports = { streamAgent, collectStream, StreamError };
