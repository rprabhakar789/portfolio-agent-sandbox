#!/usr/bin/env node
/**
 * agent.js  —  Portfolio content update pipeline entry point.
 *
 * Usage:
 *   node pipeline/agent.js --instruction "Update bio to: I love building tools."
 *   node pipeline/agent.js --json '{"instruction":"...","operations":[...]}'
 *   INSTRUCTION=<text> node pipeline/agent.js
 *
 * Environment variables:
 *   INSTRUCTION        Free-text instruction (alternative to --instruction flag)
 *   OPENAI_API_KEY     (Optional) Enables real AI parsing; stub used when absent
 *   OPENAI_MODEL       (Optional) Model name, default gpt-4o-mini
 *
 * Exit codes:
 *   0  - success
 *   1  - bad input / validation error / edit failure
 *   2  - auto-merge intent detected (caller should handle merge flow)
 */

'use strict';

const { parseInstruction } = require('./ai-provider');
const { detectAutoMergeIntent, matchedPhrases } = require('./intent-detector');
const { applyEdits } = require('./edit-engine');
const { PathValidationError } = require('./path-validator');

async function main() {
  const { instruction, directOps } = parseArgs();

  if (!instruction && !directOps) {
    console.error('[agent] No instruction provided. Use --instruction "<text>" or --json \'{"instruction":"..."}\'');
    process.exit(1);
  }

  console.log('[agent] Starting pipeline…');

  /* ── 1. Intent detection ── */
  const autoMerge = instruction ? detectAutoMergeIntent(instruction) : false;
  if (autoMerge) {
    const phrases = matchedPhrases(instruction);
    console.log(`[agent] ⚠️  Auto-merge intent detected (matched: ${phrases.join(', ')})`);
    console.log('[agent] Setting AUTO_MERGE_INTENT=true in environment output.');
    // Emit for GitHub Actions step output
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `auto_merge=true\n`);
    }
  } else {
    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `auto_merge=false\n`);
    }
  }

  /* ── 2. Parse instruction into edit operations ── */
  let operations = directOps || [];

  if (instruction && operations.length === 0) {
    console.log('[agent] Parsing instruction via AI provider…');
    let parsed;
    try {
      parsed = await parseInstruction(instruction);
    } catch (err) {
      console.error(`[agent] AI provider error: ${err.message}`);
      process.exit(1);
    }

    console.log(`[agent] Provider: ${parsed.provider} | Confidence: ${parsed.confidence}`);
    console.log(`[agent] Summary: ${parsed.summary}`);

    if (!parsed.operations || parsed.operations.length === 0) {
      console.warn('[agent] No edit operations returned. Nothing to apply.');
      process.exit(0);
    }
    operations = parsed.operations;
  }

  /* ── 3. Path validation (fail fast) ── */
  console.log(`[agent] Validating ${operations.length} operation(s)…`);
  for (const op of operations) {
    try {
      require('./path-validator').validatePath(op.file);
    } catch (err) {
      if (err instanceof PathValidationError) {
        console.error(`[agent] ❌ Path validation FAILED: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  /* ── 4. Apply edits ── */
  console.log('[agent] Applying edits…');
  const { applied, errors } = applyEdits(operations);

  if (errors.length > 0) {
    for (const { op, error } of errors) {
      console.error(`[agent] ❌ Edit error on ${op.file}#${op.key}: ${error}`);
    }
    if (applied === 0) {
      process.exit(1);
    }
  }

  console.log(`[agent] ✅ Applied ${applied} edit(s) successfully.`);

  /* ── 5. Auto-merge exit signal ── */
  if (autoMerge) {
    console.log('[agent] Exiting with code 2 to signal auto-merge intent to caller.');
    process.exit(2);
  }

  process.exit(0);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let instruction = process.env.INSTRUCTION || null;
  let directOps = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--instruction' && args[i + 1]) {
      instruction = args[++i];
    } else if (args[i] === '--json' && args[i + 1]) {
      const payload = JSON.parse(args[++i]);
      instruction = payload.instruction || instruction;
      directOps = payload.operations || null;
    }
  }

  return { instruction, directOps };
}

main().catch(err => {
  console.error('[agent] Unhandled error:', err);
  process.exit(1);
});
