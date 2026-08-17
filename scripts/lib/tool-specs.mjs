// D1 (reports/DEBT.md): THE tool-interface manifest — every MCP tool's INTERFACE declared once.
// Each tool used to state its interface once per surface (the script's parseArgs spec,
// mcp-server's TOOLS table, the docs) and 5 of mcp-server's 7 recorded fix commits were exactly
// that triplication drifting (CLI↔MCP parity). One spec per tool now: mcp-server.mjs composes
// its TOOLS table from these objects (schema, validation, budget injection, script binding,
// description budget-numbers); query.mjs derives its mode flags from the `kind` entries; budget-
// carrying CLIs read their default via budgetOf(); and the release gate counts/audits tool names
// here (release-utils.mjs: no name may be re-declared in mcp-server.mjs, no prose surface may
// name a tool that isn't in this union). Entries stay in served (tools/list) order.
//
// Shape — interface DATA only (behavior stays with its transport):
//   name          the MCP tool name (the gate's unit of identity)
//   kind          query.mjs mode flag (--<kind>) — the six shared-shape query tools
//   bin           the serving script under scripts/ (omitted: kind tools default to query.mjs;
//                 codeweb_map is served by the in-server handleMap)
//   need          required MCP args (validated; for kind tools, 'symbol' also means the CLI
//                 mode flag takes a value)
//   opt           optional args (the MCP schema's property list)
//   budget        { arg, flag, value } injected when the caller passes neither `arg` nor
//                 full:true — flag/value speak the CLI's dialect
//   graphless     tool takes no graph argument (diff, map)
//   dirFromGraph  CLI addresses the WORKSPACE (--dir beside the graph), not the graph file
//   map           served by handleMap in-process (no child bin)
// Zero imports by design: pure data every consumer (and the gate's text scan) can afford.

export const TOOL_SPECS = [
  { name: 'codeweb_callers', kind: 'callers', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_dependents', kind: 'dependents', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_callees', kind: 'callees', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_impact', kind: 'impact', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_cycles', kind: 'cycles', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 15 } },
  { name: 'codeweb_orphans', kind: 'orphans', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 25 } },
  { name: 'codeweb_tests', kind: 'tests', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_diff', bin: 'diff.mjs', need: [], opt: ['before', 'after'], graphless: true },
  { name: 'codeweb_explain', bin: 'explain.mjs', need: ['symbol'], opt: ['graph'] },
  { name: 'codeweb_brief', bin: 'brief.mjs', need: [], opt: ['graph'] },
  { name: 'codeweb_find', bin: 'find.mjs', need: ['query'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 } },
  { name: 'codeweb_context', bin: 'context-pack.mjs', need: ['symbol'], opt: ['graph', 'limit', 'window', 'full', 'bodies'], budget: { arg: 'limit', flag: '--limit', value: 12 } },
  { name: 'codeweb_refresh', bin: 'refresh.mjs', need: [], opt: ['graph', 'snapshot'] },
  { name: 'codeweb_find_similar', bin: 'find-similar.mjs', need: [], opt: ['graph', 'signature', 'body', 'structural'] },
  { name: 'codeweb_placement', bin: 'placement.mjs', need: ['calls'], opt: ['graph'] },
  { name: 'codeweb_review', bin: 'review.mjs', need: ['changed'], opt: ['graph', 'before', 'gate'] },
  { name: 'codeweb_fitness', bin: 'fitness.mjs', need: [], opt: ['graph', 'rules'] },
  { name: 'codeweb_risk', bin: 'risk.mjs', need: [], opt: ['graph', 'changed', 'limit', 'offset', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 15 } },
  { name: 'codeweb_break_cycles', bin: 'break-cycles.mjs', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 10 } },
  { name: 'codeweb_deadcode', bin: 'deadcode.mjs', need: [], opt: ['graph', 'limit', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_codemod', bin: 'codemod.mjs', need: ['merge'], opt: ['graph', 'into'] },
  { name: 'codeweb_hotspots', bin: 'hotspots.mjs', need: [], opt: ['graph', 'limit', 'offset', 'full', 'all'], budget: { arg: 'limit', flag: '--limit', value: 15 } },
  { name: 'codeweb_campaign', bin: 'campaign.mjs', need: [], opt: ['graph', 'budget', 'full', 'all'], budget: { arg: 'budget', flag: '--budget', value: 25 } },
  { name: 'codeweb_reading_order', bin: 'reading-order.mjs', need: [], opt: ['graph', 'scope', 'value', 'budget'], budget: { arg: 'budget', flag: '--budget', value: 20 } },
  { name: 'codeweb_simulate', bin: 'simulate-edit.mjs', need: [], opt: ['graph', 'delete', 'merge', 'into', 'move', 'to'] },
  { name: 'codeweb_annotate', bin: 'annotate.mjs', need: [], opt: ['graph', 'suppress', 'note', 'list'], dirFromGraph: true },
  { name: 'codeweb_stats', bin: 'stats.mjs', need: [], opt: ['graph'] },
  { name: 'codeweb_map', need: [], opt: ['target', 'out'], graphless: true, map: true },
];

/** The six shared-shape query tools (query.mjs derives its mode flags from these). */
export const QUERY_TOOL_SPECS = TOOL_SPECS.filter((s) => s.kind);

/** A budget-carrying CLI's default top-N — so the script and the injected MCP budget can never
 *  be two literals again (D1's original drift example: find.mjs 10 vs the TOOLS table 10). */
export const budgetOf = (name) => TOOL_SPECS.find((s) => s.name === name)?.budget?.value;
