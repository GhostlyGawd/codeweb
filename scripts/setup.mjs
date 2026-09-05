#!/usr/bin/env node
import { parseArgs, die, emitJson, emitText } from './lib/cli.mjs';
import { clientRecipes, getClientRecipe } from './lib/client-setup.mjs';
const usage = `usage: codeweb setup --client <${clientRecipes.map(r => r.id).join('|')}> [--json]\nPrint a client recipe. No configuration file is written.`;
const { opts, pos } = parseArgs(process.argv.slice(2), { usage, flags: {
  client: { type: 'string' }, json: { type: 'bool', default: false },
} });
const recipe = getClientRecipe(opts.client);
if (!recipe || pos.length) die(usage, 2);
const steps = [
  'Run from your project directory: npx -y @ghostlygawd/codeweb .',
  `Merge the recipe into ${recipe.configPath}. Keep existing entries. Approve the server in your client if requested.`,
  'Restart or reload your client.',
  `Run: npx -y @ghostlygawd/codeweb doctor --client ${recipe.id} --config <config-file>`,
  'Ask your agent to call codeweb_callers with {"symbol":"<your function name>"}.',
  'To remove this setup, remove only the codeweb server entry that you added.',
];
if (opts.json) emitJson({ recipe, written: false, steps });
else emitText(`${recipe.label}: ${recipe.configPath}\n\n${recipe.content}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nNo configuration was written. A local doctor check does not verify an editor connection.`);
