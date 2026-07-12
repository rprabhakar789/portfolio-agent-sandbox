'use strict';

const { parseInstruction } = require('../ai-provider');
const { detectAutoMergeIntent, matchedPhrases } = require('../intent-detector');
const { applyEdits } = require('../edit-engine');
const { validatePath, PathValidationError } = require('../path-validator');

async function runLlmOpsProvider(context) {
  const instruction = context.instruction || '';
  const directOps = context.directOps || null;
  const autoMerge = instruction ? detectAutoMergeIntent(instruction) : false;
  const debugEnabled = isDebugEnabled();

  if (autoMerge) {
    const phrases = matchedPhrases(instruction);
    console.log(`[llm-ops] Auto-merge intent detected (matched: ${phrases.join(', ')})`);
  }

  let operations = Array.isArray(directOps) ? directOps : [];

  if (instruction && operations.length === 0) {
    console.log('[llm-ops] Parsing instruction via AI provider…');
    const parsed = await parseInstruction(instruction);
    console.log(`[llm-ops] AI provider: ${parsed.provider} | Confidence: ${parsed.confidence}`);
    console.log(`[llm-ops] Summary: ${parsed.summary}`);
    operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  }

  console.log(`[llm-ops] Operation summary: ${summarizeOperations(operations)}`);
  if (debugEnabled) {
    console.log(`[llm-ops][debug] operations_payload=${JSON.stringify(operations)}`);
  }

  if (operations.length === 0) {
    return {
      provider: 'llm-ops',
      status: 'no_changes',
      autoMerge: false,
      message: 'No edit operations were generated.',
    };
  }

  console.log(`[llm-ops] Validating ${operations.length} operation(s)…`);
  for (const op of operations) {
    try {
      validatePath(op.file);
    } catch (err) {
      if (err instanceof PathValidationError) {
        return {
          provider: 'llm-ops',
          status: 'error',
          autoMerge: false,
          message: `Path validation failed: ${err.message}`,
        };
      }
      throw err;
    }
  }

  console.log('[llm-ops] Applying edits…');
  const { applied, errors } = applyEdits(operations);

  if (errors.length > 0) {
    for (const { op, error } of errors) {
      console.error(`[llm-ops] Edit error on ${op.file}#${op.key}: ${error}`);
    }
    if (applied === 0) {
      return {
        provider: 'llm-ops',
        status: 'error',
        autoMerge: false,
        message: 'All edit operations failed.',
        errors,
      };
    }
  }

  return {
    provider: 'llm-ops',
    status: 'applied',
    autoMerge,
    applied,
    errors,
    message: `Applied ${applied} operation(s).`,
  };
}

function isDebugEnabled() {
  const raw = String(process.env.AI_DEBUG_RESPONSE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function summarizeOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) return 'count=0 files=[]';
  const files = [...new Set(operations.map((op) => op?.file).filter(Boolean))];
  return `count=${operations.length} files=[${files.join(', ')}]`;
}

module.exports = { runLlmOpsProvider };
