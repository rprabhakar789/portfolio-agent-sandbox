/**
 * tests/path-validator.test.js
 * Unit tests for the path validator.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { validatePath, validatePaths, PathValidationError, ALLOWED_ROOT } = require('../path-validator');

test('validatePath: accepts content/profile.json', () => {
  const result = validatePath('content/profile.json');
  assert.ok(result.startsWith(ALLOWED_ROOT));
});

test('validatePath: accepts content/projects.json', () => {
  const result = validatePath('content/projects.json');
  assert.ok(result.startsWith(ALLOWED_ROOT));
});

test('validatePath: rejects path outside content/', () => {
  assert.throws(
    () => validatePath('index.html'),
    PathValidationError
  );
});

test('validatePath: rejects path traversal attack', () => {
  assert.throws(
    () => validatePath('content/../../package.json'),
    PathValidationError
  );
});

test('validatePath: rejects absolute path outside content/', () => {
  assert.throws(
    () => validatePath('/etc/passwd'),
    PathValidationError
  );
});

test('validatePath: rejects pipeline/ directory', () => {
  assert.throws(
    () => validatePath('pipeline/agent.js'),
    PathValidationError
  );
});

test('validatePaths: accepts all valid content paths', () => {
  const files = ['content/profile.json', 'content/skills.json'];
  const result = validatePaths(files);
  assert.equal(result.length, 2);
  result.forEach(r => assert.ok(r.startsWith(ALLOWED_ROOT)));
});

test('validatePaths: throws on first invalid path', () => {
  assert.throws(
    () => validatePaths(['content/profile.json', 'README.md']),
    PathValidationError
  );
});
