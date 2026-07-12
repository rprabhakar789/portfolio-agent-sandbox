'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperations } = require('../operation-normalizer');

test('normalizeOperations: converts skills root-array alias key and string skill value', () => {
  const result = normalizeOperations([
    { file: 'content/skills.json', op: 'append', key: 'skills', value: 'Dancing (Beginner)' },
  ], { debugEnabled: true });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.operations, [
    {
      file: 'content/skills.json',
      op: 'append',
      key: '',
      value: { name: 'Dancing', level: 'Beginner' },
    },
  ]);
  assert.equal(result.notes.length, 2);
});

test('normalizeOperations: converts projects root-array alias key to root target', () => {
  const result = normalizeOperations([
    {
      file: 'content/projects.json',
      op: 'append',
      key: 'projects',
      value: {
        id: 'project-3',
        title: 'New Project',
        description: 'Desc',
        url: 'https://example.com',
        tags: ['Node.js'],
        featured: false,
      },
    },
  ], { debugEnabled: true });

  assert.equal(result.errors.length, 0);
  assert.equal(result.operations[0].key, '');
});

test('normalizeOperations: fails on incompatible projects root-array value', () => {
  const result = normalizeOperations([
    { file: 'content/projects.json', op: 'append', key: 'projects', value: 'Not a project object' },
  ]);

  assert.equal(result.operations.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /require a project object value/);
});
