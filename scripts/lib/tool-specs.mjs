// D1 (reports/DEBT.md): THE tool-interface manifest. Each of these tools used to state its
// interface once per surface — the script's parseArgs spec, mcp-server's TOOLS table, the docs —
// and 5 of mcp-server's 7 recorded fix commits were exactly that triplication drifting (CLI↔MCP
// parity). One spec per tool now, consumed by BOTH transports: query.mjs derives its mode flags
// from `kind` + `need`, mcp-server.mjs generates its TOOLS entries (schema, validation, budget
// injection, descriptions' budget numbers) from the same objects, and the release gate
// (scripts/release-utils.mjs) counts tool names across this file and mcp-server.mjs together.
// The remaining 21 tools convert tool-by-tool; entries here stay in served (tools/list) order.
//
// Shape: { name, kind, need, opt, budget } — `kind` is the query.mjs mode flag (--<kind>);
// need: ['symbol'] means the mode flag takes a value (and MCP requires the arg); `opt` is the
// MCP schema's optional-arg list; `budget` is the MCP-injected default when the caller passes
// neither its arg nor full:true ({ arg, flag, value } — flag/value speak the CLI's dialect).
// Zero imports by design: pure data both transports (and the gate's text scan) can afford.

export const QUERY_TOOL_SPECS = [
  { name: 'codeweb_callers', kind: 'callers', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_callees', kind: 'callees', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_impact', kind: 'impact', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
  { name: 'codeweb_cycles', kind: 'cycles', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 15 } },
  { name: 'codeweb_orphans', kind: 'orphans', need: [], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 25 } },
  { name: 'codeweb_tests', kind: 'tests', need: ['symbol'], opt: ['graph', 'limit', 'offset', 'full'], budget: { arg: 'limit', flag: '--limit', value: 20 } },
];
