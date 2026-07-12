#!/usr/bin/env node
/**
 * agent.js  —  Portfolio content update pipeline entry point.
 *
 * Usage:
 *   node pipeline/agent.js --instruction "Update bio to: I love building tools."
 *   node pipeline/agent.js --json '{"instruction":"...","operations":[...]}'
 *   node pipeline/agent.js --provider llm-ops --instruction "Update skills."
 *   INSTRUCTION=<text> node pipeline/agent.js
 *
 * Environment variables:
 *   INSTRUCTION        Free-text instruction (alternative to --instruction flag)
 *   UPDATE_PROVIDER            (Optional) copilot | llm-ops
 *   OPENAI_API_KEY             (Optional) LLM-ops: OpenAI provider key
 *   OPENAI_MODEL               (Optional) LLM-ops: model name, default gpt-4o-mini
 *   AZURE_OPENAI_*             (Optional) LLM-ops: Azure OpenAI credentials
 *   GITHUB_TOKEN/REPOSITORY    (Optional) Copilot delegation via GitHub issue
 *
 * Exit codes:
 *   0  - success
 *   1  - bad input / validation error / edit failure
 *   2  - auto-merge intent detected (caller should handle merge flow)
 */

'use strict';

const fs = require('fs');
const { runUpdateProvider, resolveProviderName } = require('./update-providers');

async function main() {
  const { instruction, directOps, providerOverride } = parseArgs();

  if (!instruction && !directOps) {
    console.error('[agent] No instruction provided. Use --instruction "<text>" or --json \'{"instruction":"..."}\'');
    process.exit(1);
  }

  const provider = resolveProviderName(providerOverride);
  console.log(`[agent] Starting pipeline with provider: ${provider}`);

  const result = await runUpdateProvider(provider, { instruction, directOps });
  console.log(`[agent] Provider result: status=${result.status}; message=${result.message || 'n/a'}`);
  if (result.delegation?.url) {
    console.log(`[agent] Delegation URL: ${result.delegation.url}`);
  }

  writeOutput('provider', provider);
  writeOutput('status', result.status || 'error');
  writeOutput('auto_merge', result.autoMerge ? 'true' : 'false');
  writeOutput('delegation_url', result.delegation?.url || '');
  writeOutput('delegation_id', result.delegation?.id || '');

  const exitCode = computeExitCode(provider, result);
  if (exitCode === 2) {
    console.log('[agent] Exiting with code 2 to signal auto-merge intent to caller.');
  }
  process.exit(exitCode);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let instruction = process.env.INSTRUCTION || null;
  let directOps = null;
  let providerOverride = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--instruction' && args[i + 1]) {
      instruction = args[++i];
    } else if (args[i] === '--json' && args[i + 1]) {
      const payload = JSON.parse(args[++i]);
      instruction = payload.instruction || instruction;
      directOps = payload.operations || null;
    } else if (args[i] === '--provider' && args[i + 1]) {
      providerOverride = args[++i];
    }
  }

  return { instruction, directOps, providerOverride };
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function computeExitCode(provider, result) {
  if (result.status === 'error' || result.status === 'unsupported') return 1;
  if (provider === 'llm-ops' && result.status === 'applied' && result.autoMerge) return 2;
  return 0;
}

main().catch(err => {
  console.error('[agent] Unhandled error:', err);
  process.exit(1);
});
