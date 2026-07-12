'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runCopilotProvider } = require('../update-providers/copilot');
const { runLlmOpsProvider } = require('../update-providers/llm-ops');

async function withEnv(temp, fn) {
  const keys = Object.keys(temp);
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    if (temp[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = temp[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('runCopilotProvider: returns unsupported without GitHub env', async () => {
  await withEnv({ GITHUB_TOKEN: null, GITHUB_REPOSITORY: null }, async () => {
    const result = await runCopilotProvider({ instruction: 'Update bio' });
    assert.equal(result.provider, 'copilot');
    assert.equal(result.status, 'unsupported');
  });
});

test('runLlmOpsProvider: returns no_changes when no operations are generated', async () => {
  await withEnv({
    OPENAI_API_KEY: null,
    AZURE_OPENAI_API_KEY: null,
    AZURE_OPENAI_ENDPOINT: null,
    AZURE_OPENAI_DEPLOYMENT: null,
  }, async () => {
    const result = await runLlmOpsProvider({ instruction: 'Update my portfolio summary.' });
    assert.equal(result.provider, 'llm-ops');
    assert.equal(result.status, 'no_changes');
  });
});

test('runLlmOpsProvider: fails on non-content paths', async () => {
  const result = await runLlmOpsProvider({
    instruction: 'malicious',
    directOps: [{ file: 'README.md', op: 'set', key: 'x', value: 'y' }],
  });
  assert.equal(result.provider, 'llm-ops');
  assert.equal(result.status, 'error');
});

test('runLlmOpsProvider: fails when non-empty operations produce no diff', async () => {
  const profilePath = path.join(__dirname, '../../content/profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

  const result = await runLlmOpsProvider({
    instruction: 'set bio to current value',
    directOps: [{ file: 'content/profile.json', op: 'set', key: 'bio', value: profile.bio }],
  });

  assert.equal(result.provider, 'llm-ops');
  assert.equal(result.status, 'error');
  assert.match(result.message, /no content diff/i);
});
