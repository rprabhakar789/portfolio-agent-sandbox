/**
 * edit-engine.js
 * Deterministic layer that applies structured edit operations to content/ JSON files.
 *
 * An "edit operation" is a plain object describing what to change:
 *   {
 *     file: 'content/profile.json',   // repo-relative path (must be under content/)
 *     op: 'set',                      // 'set' | 'append' | 'remove'
 *     key: 'bio',                     // dot-notation key path within the JSON
 *     value: 'New bio text',          // value for set/append; ignored for remove
 *   }
 *
 * Operations:
 *   set    - sets key to value (creates if missing)
 *   append - appends value to an array at key (creates array if missing)
 *   remove - deletes key from object, or removes matching item from array
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { validatePath } = require('./path-validator');

/**
 * Applies an array of edit operations and writes the results to disk.
 * @param {Array<{file: string, op: string, key: string, value?: any}>} operations
 * @returns {{ applied: number, errors: Array<{op: object, error: string}> }}
 */
function applyEdits(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { applied: 0, errors: [] };
  }

  // Group by file so we read/write each file once
  const byFile = new Map();
  for (const op of operations) {
    if (!byFile.has(op.file)) byFile.set(op.file, []);
    byFile.get(op.file).push(op);
  }

  let applied = 0;
  const errors = [];

  for (const [file, ops] of byFile) {
    let resolvedPath;
    try {
      resolvedPath = validatePath(file);
    } catch (e) {
      for (const op of ops) errors.push({ op, error: e.message });
      continue;
    }

    let data;
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      data = JSON.parse(raw);
    } catch (e) {
      for (const op of ops) errors.push({ op, error: `Cannot read/parse ${file}: ${e.message}` });
      continue;
    }

    for (const op of ops) {
      try {
        data = applyOp(data, op);
        applied++;
      } catch (e) {
        errors.push({ op, error: e.message });
      }
    }

    try {
      fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    } catch (e) {
      // Mark all ops for this file as errored on write
      for (const op of ops) errors.push({ op, error: `Failed to write ${file}: ${e.message}` });
      applied -= ops.length; // revert count for this file
    }
  }

  return { applied, errors };
}

/**
 * Applies a single op to a data object/array, returning the modified copy.
 */
function applyOp(data, op) {
  const { op: opType, key, value } = op;
  const hasKey = key !== undefined && key !== null && key !== '';
  if (!hasKey) {
    if (!Array.isArray(data)) {
      throw new Error('op.key is required unless target JSON document is an array');
    }

    switch (opType) {
      case 'append':
        data.push(value);
        return data;
      case 'remove':
        return data.filter(item =>
          typeof item === 'object' ? JSON.stringify(item) !== JSON.stringify(value) : item !== value
        );
      case 'set':
        if (!Array.isArray(value)) {
          throw new Error('Root-level set without key requires value to be an array');
        }
        return value;
      default:
        throw new Error(`Unknown op type: "${opType}". Must be set | append | remove`);
    }
  }

  const keys = key.split('.');
  const last = keys[keys.length - 1];
  const parent = keys.slice(0, -1).reduce((obj, k) => {
    if (obj == null || typeof obj !== 'object') throw new Error(`Key path "${key}" is not traversable`);
    return obj[k];
  }, data);

  if (parent == null || typeof parent !== 'object') {
    throw new Error(`Cannot reach parent for key "${key}"`);
  }

  switch (opType) {
    case 'set':
      parent[last] = value;
      break;
    case 'append': {
      if (!Array.isArray(parent[last])) parent[last] = parent[last] != null ? [parent[last]] : [];
      parent[last].push(value);
      break;
    }
    case 'remove': {
      if (Array.isArray(parent[last])) {
        parent[last] = parent[last].filter(item =>
          typeof item === 'object' ? JSON.stringify(item) !== JSON.stringify(value) : item !== value
        );
      } else {
        delete parent[last];
      }
      break;
    }
    default:
      throw new Error(`Unknown op type: "${opType}". Must be set | append | remove`);
  }

  return data;
}

module.exports = { applyEdits, applyOp };
