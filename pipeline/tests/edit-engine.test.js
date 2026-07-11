/**
 * tests/edit-engine.test.js
 * Unit tests for the edit engine using Node.js built-in test runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { applyEdits, applyOp } = require('../edit-engine');

// ── applyOp unit tests (pure, no I/O) ──

test('applyOp: set scalar field', () => {
  const data = { name: 'Old', bio: 'old bio' };
  const result = applyOp(data, { key: 'bio', op: 'set', value: 'new bio' });
  assert.equal(result.bio, 'new bio');
});

test('applyOp: set nested field', () => {
  const data = { meta: { version: 1 } };
  const result = applyOp(data, { key: 'meta.version', op: 'set', value: 2 });
  assert.equal(result.meta.version, 2);
});

test('applyOp: append to array', () => {
  const data = { tags: ['a', 'b'] };
  const result = applyOp(data, { key: 'tags', op: 'append', value: 'c' });
  assert.deepEqual(result.tags, ['a', 'b', 'c']);
});

test('applyOp: append creates array if field is absent', () => {
  const data = {};
  const result = applyOp(data, { key: 'tags', op: 'append', value: 'x' });
  assert.deepEqual(result.tags, ['x']);
});

test('applyOp: remove scalar key', () => {
  const data = { name: 'Alice', secret: 'hidden' };
  const result = applyOp(data, { key: 'secret', op: 'remove' });
  assert.equal(result.secret, undefined);
});

test('applyOp: remove from array by value', () => {
  const data = { tags: ['a', 'b', 'c'] };
  const result = applyOp(data, { key: 'tags', op: 'remove', value: 'b' });
  assert.deepEqual(result.tags, ['a', 'c']);
});

test('applyOp: throws on unknown op', () => {
  assert.throws(
    () => applyOp({}, { key: 'x', op: 'upsert', value: 1 }),
    /Unknown op type/
  );
});

test('applyOp: throws when key is missing', () => {
  assert.throws(
    () => applyOp({}, { op: 'set', value: 1 }),
    /key is required/
  );
});

// ── applyEdits integration tests (real file I/O on actual content/) ──
// These tests mutate content/profile.json; they restore the original value after.

test('applyEdits: set field on content/profile.json and restore', () => {
  const filePath = path.join(__dirname, '../../content/profile.json');
  const original = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const originalBio = original.bio;

  const ops = [{ file: 'content/profile.json', op: 'set', key: 'bio', value: '__test_bio__' }];
  const { applied, errors } = applyEdits(ops);

  // Restore original value
  const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  updated.bio = originalBio;
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n');

  assert.equal(applied, 1);
  assert.equal(errors.length, 0);
});

test('applyEdits: returns zero applied for empty array', () => {
  const { applied, errors } = applyEdits([]);
  assert.equal(applied, 0);
  assert.equal(errors.length, 0);
});
