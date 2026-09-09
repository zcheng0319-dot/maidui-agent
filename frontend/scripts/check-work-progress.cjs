const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('exports', source)(exports);
  return exports;
}
const { deriveWorkProgress } = load('src/workProgress.ts');
const { getEventsForAgentTurn, getEventsForActiveAgentTurn } = load('src/agentSteps.ts');
const event = (type, seconds, payload = {}) => ({ type, payload, occurred_at: new Date(1700000000000 + seconds * 1000).toISOString() });
const start = event('request.started', 0);
const a = event('agent.dispatch', 2, { agent: 'search_agent', demands: '查轻量背包', started_at: 'a' });
const b = event('agent.dispatch', 2, { agent: 'search_agent', demands: '查耐用背包', started_at: 'b' });
const doneB = event('tool.result', 10, { tool: 'task_dispatch', started_at: 'b', elapsed_ms: 8000 });
let progress = deriveWorkProgress([start, a, b], true);
assert.equal(progress.summary, '正在并行处理 2 个子任务');
progress = deriveWorkProgress([start, a, b, doneB], true);
assert.equal(progress.items[1].state, 'running');
assert.equal(progress.items[2].state, 'done');
assert.equal(progress.items[2].duration, 8000);
const error = event('tool.result', 11, { tool: 'category_insight_tool', error: 'unavailable' });
const final = event('final.result', 17);
progress = deriveWorkProgress([start, a, b, doneB, error, final], false);
assert.equal(progress.items.find(item => item.label === '查阅品类选购知识').state, 'error');
assert.equal(progress.items[1].state, 'stopped');
assert.equal(progress.items.at(-1).time - progress.items[0].time, 17000);
const failed = [start, a, event('error', 3)];
assert.equal(deriveWorkProgress(failed, false).items[1].state, 'stopped');
assert.deepEqual(getEventsForActiveAgentTurn(failed), []);
const nextStart = event('request.started', 20);
assert.deepEqual(getEventsForAgentTurn([...failed, nextStart, final], 4), [nextStart, final]);
assert.deepEqual(getEventsForActiveAgentTurn([...failed, nextStart]), [nextStart]);
const invoke = event('tool.invoke', 1, { tool: 'product_search_tool', args: { normalized_query: '背包', price_max_major: 500 } });
const hit = event('tool.result', 2, { tool: 'product_search_tool', hit_count: 0 });
progress = deriveWorkProgress([start, invoke, hit], true);
assert.match(progress.items[1].detail, /背包.*500.*找到 0 条结果/);
assert.equal(progress.items[1].duration, 1000);
const concurrent = deriveWorkProgress([start, invoke, invoke, hit], true);
assert.equal(concurrent.items.filter(item => item.state === 'running').length, 2);
assert.equal(concurrent.items.at(-1).duration, undefined);
console.log('Work progress checks passed: parallel matching, timing, failures, turn boundaries, empty results, ambiguous results.');
