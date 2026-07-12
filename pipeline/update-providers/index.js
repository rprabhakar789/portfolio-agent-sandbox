'use strict';

const { runLlmOpsProvider } = require('./llm-ops');
const { runCopilotProvider } = require('./copilot');

const PROVIDERS = {
  'llm-ops': runLlmOpsProvider,
  copilot: runCopilotProvider,
};

function resolveProviderName(explicitProvider) {
  if (explicitProvider) {
    const normalized = String(explicitProvider).trim().toLowerCase();
    if (normalized in PROVIDERS) return normalized;
  }

  const envProvider = process.env.UPDATE_PROVIDER;
  if (envProvider) {
    const normalized = String(envProvider).trim().toLowerCase();
    if (normalized in PROVIDERS) return normalized;
  }

  const hasGithubContext = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
  return hasGithubContext ? 'copilot' : 'llm-ops';
}

async function runUpdateProvider(providerName, context) {
  const selected = resolveProviderName(providerName);
  const provider = PROVIDERS[selected];
  return provider(context);
}

module.exports = { resolveProviderName, runUpdateProvider, PROVIDERS };
