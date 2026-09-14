import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

test('ac_18: shipped hooks use the documented configuration shape and retain all handlers', () => {
  const config = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'hooks/hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(config), ['hooks']);
  const expected = {
    SessionStart: ['startup|resume|clear', 'session-brief.mjs', 10],
    PreToolUse: ['Edit|Write|MultiEdit', 'pre-edit-impact.mjs', 10],
    PostToolUse: ['Edit|Write|MultiEdit', 'post-edit-diff.mjs', 30],
  };
  assert.deepEqual(Object.keys(config.hooks).sort(), Object.keys(expected).sort());
  const docs = readFileSync(join(PLUGIN_ROOT, 'hooks/README.md'), 'utf8');
  for (const [event, [matcher, file, timeout]] of Object.entries(expected)) {
    assert.deepEqual(config.hooks[event], [{ matcher, hooks: [{
      type: 'command', command: `node "${'${CLAUDE_PLUGIN_ROOT}'}/hooks/${file}"`, timeout,
    }] }]);
    assert.match(docs, new RegExp(event));
    assert.ok(docs.includes(file.replace('.mjs', '')), 'handler description remains discoverable');
  }
});
