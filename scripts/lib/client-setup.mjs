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
      if (entries.length !== 1) return { status: 'fail', message: 'The CodeWeb server section is missing or repeated.' };
      const start = entries[0];
      const end = sections.find(m => m.index > start.index)?.index ?? text.length;
      const body = text.slice(start.index + start[0].length, end);
      const commands = [...body.matchAll(/^\s*command\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/gm)];
      const arrays = [...body.matchAll(/^\s*args\s*=\s*(\[[\s\S]*?\])\s*(?:#.*)?$/gm)];
      if (commands.length !== 1 || arrays.length !== 1) return { status: 'unknown', message: 'Cannot verify this TOML form. Use the basic setup recipe for the CodeWeb section.' };
      server = { command: JSON.parse(commands[0][1]), args: JSON.parse(arrays[0][1]) };
      if (/^\s*(?:enabled\s*=\s*false|disabled\s*=\s*true)\b/m.test(body)) server.disabled = true;
    }
  } catch {
    return { status: 'fail', message: 'Cannot parse the supplied client configuration. Check its syntax.' };
  }
  const match = server?.command === serverRecipe.command && Array.isArray(server.args)
    && JSON.stringify(server.args) === JSON.stringify(serverRecipe.args)
    && server.enabled !== false && server.disabled !== true && !server.url;
  return match
    ? { status: 'pass', message: 'The supplied file contains the expected CodeWeb launch recipe. Editor loading and connection remain unverified.' }
    : { status: 'fail', message: 'The CodeWeb launch recipe is missing, disabled, or different. Compare it with codeweb setup.' };
}
