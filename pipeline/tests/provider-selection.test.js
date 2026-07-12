'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveProviderName } = require('../update-providers');

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

test('resolveProviderName: explicit provider wins', async () => {
  await withEnv({ UPDATE_PROVIDER: 'copilot' }, () => {
    assert.equal(resolveProviderName('llm-ops'), 'llm-ops');
  });
});

test('resolveProviderName: UPDATE_PROVIDER env is used when explicit not provided', async () => {
  await withEnv({ UPDATE_PROVIDER: 'llm-ops' }, () => {
    assert.equal(resolveProviderName(null), 'llm-ops');
  });
});

test('resolveProviderName: defaults to copilot when GitHub context is available', async () => {
  await withEnv({
    UPDATE_PROVIDER: null,
    GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
  }, () => {
    assert.equal(resolveProviderName(null), 'copilot');
  });
});

test('resolveProviderName: defaults to llm-ops outside GitHub context', async () => {
  await withEnv({
    UPDATE_PROVIDER: null,
    GITHUB_TOKEN: null,
    GITHUB_REPOSITORY: null,
  }, () => {
    assert.equal(resolveProviderName(null), 'llm-ops');
  });
});
