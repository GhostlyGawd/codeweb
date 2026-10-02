// One recipe source for the CLI, local diagnostics, and setup page.
export const serverRecipe = Object.freeze({
  command: 'npx',
  args: Object.freeze(['-y', '-p', '@ghostlygawd/codeweb', 'codeweb-mcp']),
});
const json = JSON.stringify({ mcpServers: { codeweb: serverRecipe } }, null, 2);
export const clientRecipes = Object.freeze([
  { id: 'claude', label: 'Claude Code', configPath: '.mcp.json', format: 'json', content: json },
  { id: 'cursor', label: 'Cursor', configPath: '.cursor/mcp.json', format: 'json', content: json },
  { id: 'windsurf', label: 'Windsurf', configPath: '~/.codeium/windsurf/mcp_config.json', format: 'json', content: json },
  { id: 'gemini', label: 'Gemini CLI', configPath: '.gemini/settings.json', format: 'json', content: json },
  { id: 'codex', label: 'Codex', configPath: '~/.codex/config.toml', format: 'toml',
    content: `[mcp_servers.codeweb]\ncommand = "npx"\nargs = ${JSON.stringify(serverRecipe.args)}\n` },
].map(Object.freeze));
export const getClientRecipe = (id) => clientRecipes.find(recipe => recipe.id === id) || null;

/** Inspect recipe evidence only. Never execute a command or expose supplied config values. */
export function inspectClientConfig(client, text) {
  let server;
  try {
    if (client.format === 'json') server = JSON.parse(text)?.mcpServers?.codeweb;
    else {
      // This intentionally accepts the documented basic TOML recipe, not all TOML syntax.
      // Other valid TOML forms are unknown rather than a false configuration pass.
      const sections = [...text.matchAll(/^\s*\[([^\]\n]+)\]\s*(?:#.*)?$/gm)];
      const entries = sections.filter(m => m[1].trim() === 'mcp_servers.codeweb');
      if (!entries.length) {
        const plugin = sections.filter(m => m[1].trim() === 'plugins."codeweb@codeweb"');
        if (plugin.length === 1) {
          const end = sections.find(m => m.index > plugin[0].index)?.index ?? text.length;
          const body = text.slice(plugin[0].index + plugin[0][0].length, end);
          const policy = sections.find(m => m[1].trim() === 'plugins."codeweb@codeweb".mcp_servers.codeweb');
          const policyEnd = policy ? sections.find(m => m.index > policy.index)?.index ?? text.length : 0;
          const policyBody = policy ? text.slice(policy.index + policy[0].length, policyEnd) : '';
          if (/^\s*enabled\s*=\s*false\b/m.test(body) || /^\s*enabled\s*=\s*false\b/m.test(policyBody)) return { status:'fail',message:'The Codeweb plugin or its bundled MCP server is disabled.' };
          if (/^\s*enabled\s*=\s*true\b/m.test(body)) return { status:'pass',message:'The Codeweb plugin is enabled in the supplied configuration. Installed MCP/skill definitions and host connection remain unverified.' };
          return { status:'unknown',message:'Codeweb plugin enablement is not explicit in this configuration.' };
        }
      }
      if (entries.length !== 1) return { status: 'fail', message: 'The CodeWeb server section is missing or repeated.' };
      const start = entries[0];
      const end = sections.find(m => m.index > start.index)?.index ?? text.length;
      const body = text.slice(start.index + start[0].length, end);
      const commands = [...body.matchAll(/^\s*command\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/gm)];
      const arrays = [...body.matchAll(/^\s*args\s*=\s*(\[[\s\S]*?\])\s*(?:#.*)?$/gm)];
      if (commands.length !== 1 || arrays.length > 1) return { status: 'unknown', message: 'Cannot verify this TOML form. Use the basic setup recipe for the CodeWeb section.' };
      server = { command: JSON.parse(commands[0][1]), args: arrays.length ? JSON.parse(arrays[0][1]) : [] };
      if (/^\s*(?:enabled\s*=\s*false|disabled\s*=\s*true)\b/m.test(body)) server.disabled = true;
    }
  } catch {
    return { status: 'fail', message: 'Cannot parse the supplied client configuration. Check its syntax.' };
  }
  const args = server?.args ?? [];
  const binary = typeof server?.command === 'string' ? server.command.replace(/\\/g, '/').split('/').at(-1) : '';
  const direct = /^(?:codeweb-mcp)(?:\.cmd|\.exe)?$/.test(binary) && Array.isArray(args) && args.length === 0;
  const canonical = server?.command === serverRecipe.command && Array.isArray(args)
    && JSON.stringify(args) === JSON.stringify(serverRecipe.args);
  const match = (direct || canonical) && server.enabled !== false && server.disabled !== true && !server.url;
  return match
    ? { status: 'pass', message: 'The supplied file contains a recognized CodeWeb launch recipe. Configured executable loading and editor connection remain unverified.' }
    : { status: 'fail', message: 'The CodeWeb launch recipe is missing, disabled, or different. Compare it with codeweb setup.' };
}
