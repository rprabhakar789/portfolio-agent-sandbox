/**
 * tests/intent-detector.test.js
 * Unit tests for the intent detector using Node.js built-in test runner (node:test).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectAutoMergeIntent, matchedPhrases } = require('../intent-detector');

test('detectAutoMergeIntent: returns false for empty string', () => {
  assert.equal(detectAutoMergeIntent(''), false);
});

test('detectAutoMergeIntent: returns false for null/undefined', () => {
  assert.equal(detectAutoMergeIntent(null), false);
  assert.equal(detectAutoMergeIntent(undefined), false);
});

test('detectAutoMergeIntent: detects "merge and deploy"', () => {
  assert.equal(detectAutoMergeIntent('Please merge and deploy the changes'), true);
});

test('detectAutoMergeIntent: detects "auto merge"', () => {
  assert.equal(detectAutoMergeIntent('auto merge this PR'), true);
});

test('detectAutoMergeIntent: detects "automerge" (no space)', () => {
  assert.equal(detectAutoMergeIntent('automerge when checks pass'), true);
});

test('detectAutoMergeIntent: detects "publish this"', () => {
  assert.equal(detectAutoMergeIntent('Update bio and publish this'), true);
});

test('detectAutoMergeIntent: detects "ship this"', () => {
  assert.equal(detectAutoMergeIntent('Looks good, ship this!'), true);
});

test('detectAutoMergeIntent: detects "go live"', () => {
  assert.equal(detectAutoMergeIntent('Ready to go live today'), true);
});

test('detectAutoMergeIntent: case-insensitive', () => {
  assert.equal(detectAutoMergeIntent('MERGE AND DEPLOY NOW'), true);
  assert.equal(detectAutoMergeIntent('Go Live Please'), true);
});

test('detectAutoMergeIntent: no false positive for similar text', () => {
  assert.equal(detectAutoMergeIntent('Update the bio and deploy'), false);
  assert.equal(detectAutoMergeIntent('I want to publish a post'), false);
});

test('matchedPhrases: returns matched phrases', () => {
  const result = matchedPhrases('merge and deploy, ship this');
  assert.ok(result.includes('merge and deploy'));
  assert.ok(result.includes('ship this'));
});

test('matchedPhrases: returns empty array for no match', () => {
  assert.deepEqual(matchedPhrases('update the bio'), []);
});
