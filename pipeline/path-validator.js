/**
 * path-validator.js
 * Enforces that all edit targets are strictly within the content/ directory.
 * Fails fast — throws on any violation.
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWED_ROOT = path.join(REPO_ROOT, 'content');

/**
 * Resolves and validates that `filePath` is inside content/.
 * Throws PathValidationError if not.
 * @param {string} filePath  - repo-relative or absolute path
 * @returns {string}         - resolved absolute path
 */
function validatePath(filePath) {
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(REPO_ROOT, filePath);

  // Ensure the resolved path is inside ALLOWED_ROOT (guards against path traversal)
  const relative = path.relative(ALLOWED_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathValidationError(
      `Edit target is outside content/: "${filePath}" resolves to "${resolved}". ` +
      `Only paths inside "${ALLOWED_ROOT}" are permitted.`
    );
  }
  return resolved;
}

/**
 * Validates a list of edit targets, returning all resolved paths.
 * Throws PathValidationError on the first violation.
 * @param {string[]} paths
 * @returns {string[]}
 */
function validatePaths(paths) {
  return paths.map(validatePath);
}

class PathValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PathValidationError';
  }
}

module.exports = { validatePath, validatePaths, PathValidationError, ALLOWED_ROOT };
