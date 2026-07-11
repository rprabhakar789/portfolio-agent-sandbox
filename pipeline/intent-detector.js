/**
 * intent-detector.js
 * Detects whether a free-text instruction contains an auto-merge/publish intent.
 */

'use strict';

const AUTO_MERGE_PHRASES = [
  'merge and deploy',
  'auto merge',
  'automerge',
  'publish this',
  'ship this',
  'go live',
];

/**
 * Returns true when the instruction text contains an explicit auto-merge phrase.
 * @param {string} instruction
 * @returns {boolean}
 */
function detectAutoMergeIntent(instruction) {
  if (typeof instruction !== 'string') return false;
  const lower = instruction.toLowerCase();
  return AUTO_MERGE_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Returns the matched phrase(s), or an empty array if none found.
 * @param {string} instruction
 * @returns {string[]}
 */
function matchedPhrases(instruction) {
  if (typeof instruction !== 'string') return [];
  const lower = instruction.toLowerCase();
  return AUTO_MERGE_PHRASES.filter(phrase => lower.includes(phrase));
}

module.exports = { detectAutoMergeIntent, matchedPhrases, AUTO_MERGE_PHRASES };
