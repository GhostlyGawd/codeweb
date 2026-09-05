#!/usr/bin/env node
// Development-only browser verification. All generated evidence goes to a new output directory.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, die } from './lib/cli.mjs';
import { clientRecipes } from './lib/client-setup.mjs';
import { resolvePlaywright, findChromium } from '../bench/experiments/report-scale.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { opts, pos } = parseArgs(process.argv.slice(2), {
  usage: 'usage: verify-product-ui.mjs --out <new-directory>\nRequires development-only Playwright and Chromium. Never updates committed screenshots.',
  flags: { out: { type: 'string', default: null } },
});
if (!opts.out || pos.length) die('Specify --out with a new output directory.', 2);
const out = resolve(opts.out);
if (existsSync(out)) die('Use a new output directory; existing evidence must not be overwritten.', 2);
const playwrightPath = resolvePlaywright();
if (!playwrightPath) die('Playwright is required. Set CODEWEB_PLAYWRIGHT_DIR to its temporary installation prefix.', 2);
const playwright = await import(pathToFileURL(playwrightPath).href);
const chromium = playwright.chromium || playwright.default?.chromium;
if (!chromium) die('Resolved Playwright module has no Chromium export.', 2);
mkdirSync(out, { recursive: true });
const site = join(out, 'site');
const fixture = join(out, 'change-demo');
const shots = join(out, 'screens');
mkdirSync(shots);
const checks = [];
const log = (name, data = {}) => { checks.push({ name, ...data }); console.log(`product-ui: ${name}`); };
function command(script, args, { cwd = ROOT, timeout = 120000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(ROOT, script), ...args], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let killTimer;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => { clearTimeout(timer); clearTimeout(killTimer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(killTimer);
      writeFileSync(join(out, script.split('/').at(-1) + '.log'), output);
      if (code !== 0) reject(new Error(`${script} failed (${signal || code}): ${output.slice(-6000)}`));
      else resolvePromise(output);
    });
  });
}
const mounts = { '/site/': site, '/demo/': join(ROOT, 'docs/demo'), '/review/': fixture };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const mount = Object.keys(mounts).find(prefix => path.startsWith(prefix));
    if (!mount) throw new Error('missing route');
    const root = mounts[mount];
    const file = resolve(root, path.slice(mount.length) || 'index.html');
    const rel = relative(root, file);
    if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('outside route');
    const bytes = readFileSync(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
});
let browser, context, page;
const pageErrors = [];
const capture = async name => {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: join(shots, name), fullPage: true });
};
try {
  await command('site/build.mjs', ['--out', site]);
  await command('scripts/product-demo.mjs', ['--out', fixture]);
  const receipt = JSON.parse(readFileSync(join(fixture, 'receipt.json'), 'utf8'));
  assert.equal(receipt.verified, true, 'technical demo must pass before browser inspection');
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: findChromium() });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => pageErrors.push(error.message));
  const visit = path => page.goto(origin + path, { waitUntil: 'networkidle' });
  const noOverflow = async name => {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width + 1, `${name}: page overflow ${JSON.stringify(dimensions)}`);
    log('no horizontal page overflow', { page: name, ...dimensions });
  };
  await visit('/site/start.html');
  await page.locator('#setup-client').focus();
  assert.equal(await page.locator('#setup-client').evaluate(el => el === document.activeElement), true);
  for (const recipe of clientRecipes) {
    await page.selectOption('#setup-client', recipe.id);
    const panel = page.locator(`[data-setup-client="${recipe.id}"]`);
    assert.equal(await page.locator('[data-setup-client]:visible').count(), 1);
    assert.equal(await panel.locator('pre code').textContent(), recipe.content);
    assert.equal(await page.locator('#setup-command').textContent(), `npx -y @ghostlygawd/codeweb setup --client ${recipe.id}`);
    assert.equal(await page.locator('#doctor-command').textContent(), `npx -y @ghostlygawd/codeweb doctor --client ${recipe.id} --config ${recipe.configPath}`);
    await panel.getByRole('button', { name: 'Copy recipe' }).click();
    await panel.getByRole('status').filter({ hasText: 'Copied.' }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), recipe.content);
    log('client recipe selected and copied', { client: recipe.id });
  }
  await capture('setup-desktop.png');
  await page.locator('.nav-more summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.nav-menu a:visible').count(), 2);
  await page.keyboard.press('Enter');
  log('secondary plan links open with keyboard');
  // Denied clipboard access is a user-visible browser state, verified separately from success.
  await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('permission denied for test')) }); });
  await page.locator('[data-setup-client]:visible').getByRole('button', { name: 'Copy recipe' }).click();
  await page.getByRole('status').filter({ hasText: 'copy it manually' }).waitFor();
  // Native Selection omits the terminal line break in a preformatted code block.
  assert.equal((await page.evaluate(() => getSelection().toString())).trimEnd(), clientRecipes.at(-1).content.trimEnd());
  log('copy failure offers selected recipe text');

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [['/site/index.html','home'], ['/site/start.html','setup'], ['/review/review.html','change-review']]) {
      await visit(path);
      await noOverflow(`${name}-${width}`);
      await capture(`${name}-${width}.png`);
    }
  }
  await visit('/review/review.html');
  assert.match(await page.locator('#changes').innerText(), /calculateFeature/);
  assert.match(await page.locator('#callers').innerText(), /app\.js:/);
  assert.match(await page.locator('#findings').innerText(), /New dependency cycle/);
  assert.ok((await page.locator('#limits').innerText()).length > 50);
  await page.getByRole('link', { name: 'Analysis limits', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#limits');
  log('HTML review shows changed symbol, external caller, cycle, and analysis limits');

  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit('/demo/');
  await page.locator('.tab[data-view="graph"]').click();
  const selected = await page.evaluate(() => window.__codewebStage.topHotspot());
  assert.ok(selected, 'real graph hotspot must be selectable');
  assert.ok((await page.locator('#detail').innerText()).length > 30);
  log('graph hotspot opens the source inspector', { selected });
  await page.locator('.tab[data-view="findings"]').click();
  const finding = page.locator('tr[data-ov]').first();
  await finding.waitFor();
  await finding.focus();
  await page.keyboard.press('Enter');
  await page.locator('#copyAgentTask').waitFor();
  const task = await page.locator('#agentTaskText').inputValue();
  assert.ok(task.length > 80, 'task includes concrete review instructions');
  await page.locator('#copyAgentTask').click();
  await page.locator('#agentTaskStatus').filter({ hasText: 'Agent task copied' }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), task);
  log('finding keyboard action and agent-task clipboard round trip');
  await capture('finding-action-desktop.png');
  await noOverflow('report-desktop');
  await page.setViewportSize({ width: 375, height: 1000 });
  await noOverflow('report-375');
  await capture('finding-action-375.png');
  assert.deepEqual(pageErrors, [], 'browser page errors');
  await browser.close(); browser = null;
  await new Promise(resolvePromise => server.close(resolvePromise));
  // Existing screenshot staging is reused unchanged. Cwd resolves its dev-only Playwright.
  const screenshotCwd = process.env.CODEWEB_PLAYWRIGHT_DIR || process.cwd();
  await command('scripts/screenshot.mjs', [join(ROOT, 'docs/demo/index.html'), '--out', shots, '--prefix', 'axios'], { cwd: screenshotCwd });
  for (const view of ['findings','graph','blast','treemap','matrix']) assert.ok(existsSync(join(shots, `axios-${view}.png`)), `missing ${view} frame`);
  log('five report screenshot frames captured');
  writeFileSync(join(out, 'verification.json'), JSON.stringify({ verified: true, commit: process.env.GITHUB_SHA || null, browser: await chromium.executablePath(), checks, technicalDemo: receipt }, null, 2) + '\n');
} catch (error) {
  if (page && !page.isClosed()) await capture('failure.png').catch(() => {});
  writeFileSync(join(out, 'failure.json'), JSON.stringify({ verified: false, error: error.message, pageErrors, checks }, null, 2) + '\n');
  console.error(`product-ui: FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise(resolvePromise => server.close(resolvePromise));
}
