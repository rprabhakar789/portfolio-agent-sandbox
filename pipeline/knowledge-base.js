'use strict';

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../docs/portfolio-agent-knowledge-base.md');

let cachedKnowledgeBase = null;

function loadKnowledgeBase() {
  if (cachedKnowledgeBase !== null) return cachedKnowledgeBase;

  try {
    cachedKnowledgeBase = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8').trim();
  } catch (error) {
    console.warn(`[knowledge-base] Failed to read ${KNOWLEDGE_BASE_PATH}: ${error.message}`);
    cachedKnowledgeBase = '';
  }

  return cachedKnowledgeBase;
}

module.exports = { loadKnowledgeBase, KNOWLEDGE_BASE_PATH };
