/**
 * ai-provider.js
 * AI integration boundary module.
 *
 * This module is the ONLY place that talks to an external AI API.
 * When OPENAI_API_KEY (or another provider key) is absent, it returns a
 * deterministic stub response so the pipeline works without any secrets.
 *
 * Provider interface:
 *   parseInstruction(instruction: string) → Promise<ParsedInstruction>
 *
 * ParsedInstruction shape:
 *   {
 *     summary: string,          // one-line summary of what was understood
 *     operations: EditOp[],     // array of edit operations for edit-engine.js
 *     confidence: number,       // 0-1, provider's confidence
 *     provider: string,         // 'azure-openai' | 'openai' | 'stub'
 *   }
 *
 * EditOp shape:
 *   { file: string, op: 'set'|'append'|'remove', key: string, value?: any }
 */

'use strict';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
const AZURE_OPENAI_TEMPERATURE = process.env.AZURE_OPENAI_TEMPERATURE;

/** System prompt sent to the AI provider. */
const SYSTEM_PROMPT = `You are a portfolio content editor assistant.
Given a free-text instruction, return a JSON object with this exact shape:
{
  "summary": "<one-sentence summary of the change>",
  "operations": [
    { "file": "content/<file>.json", "op": "set|append|remove", "key": "<dot.path>", "value": <any> }
  ],
  "confidence": <0.0 to 1.0>
}

Rules:
- Only touch files under content/ (profile.json, projects.json, skills.json).
- Use "set" to update a single field, "append" to add to an array, "remove" to delete.
- Key paths use dot notation: e.g. "bio", "0.description" (array index 0, field description).
- Respond ONLY with valid JSON. No prose, no markdown code fences.`;

/**
 * Parses a free-text instruction into structured edit operations.
 * Provider selection order: Azure OpenAI -> OpenAI -> stub.
 *
 * @param {string} instruction
 * @returns {Promise<{summary: string, operations: object[], confidence: number, provider: string}>}
 */
async function parseInstruction(instruction) {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (azureApiKey && azureEndpoint && azureDeployment) {
    try {
      return await azureOpenAIProvider(instruction, azureApiKey, azureEndpoint, azureDeployment);
    } catch (err) {
      console.error(`[ai-provider] Azure OpenAI call failed: ${err.message} — falling back to stub.`);
      return stubProvider(instruction);
    }
  }

  if (openaiApiKey) {
    try {
      return await openaiProvider(instruction, openaiApiKey);
    } catch (err) {
      console.error(`[ai-provider] OpenAI call failed: ${err.message} — falling back to stub.`);
      return stubProvider(instruction);
    }
  }

  console.warn('[ai-provider] No Azure OpenAI or OpenAI credentials found — using stub provider.');
  return stubProvider(instruction);
}

/* ── OpenAI provider ── */
async function openaiProvider(instruction, apiKey) {
  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(content);
  return { ...parsed, provider: 'openai' };
}

/* ── Azure OpenAI provider ── */
async function azureOpenAIProvider(instruction, apiKey, endpoint, deployment) {
  const normalizedEndpoint = endpoint.replace(/\/+$/, '');
  const url = `${normalizedEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`;

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction },
    ],
    response_format: { type: 'json_object' },
  };

  // Some Azure-hosted models only support the provider default temperature.
  // Include temperature only when explicitly configured.
  if (AZURE_OPENAI_TEMPERATURE != null && AZURE_OPENAI_TEMPERATURE !== '') {
    const parsedTemperature = Number(AZURE_OPENAI_TEMPERATURE);
    if (Number.isFinite(parsedTemperature)) {
      payload.temperature = parsedTemperature;
    } else {
      console.warn('[ai-provider] AZURE_OPENAI_TEMPERATURE is not numeric; ignoring override.');
    }
  }

  const body = JSON.stringify(payload);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Azure OpenAI');

  const parsed = JSON.parse(content);
  return { ...parsed, provider: 'azure-openai' };
}

/* ── Stub provider (no API key) ── */
function stubProvider(instruction) {
  console.log('[ai-provider:stub] Instruction received:', instruction);
  return {
    summary: `[STUB] Would process: "${instruction.slice(0, 80)}"`,
    operations: [],
    confidence: 0,
    provider: 'stub',
  };
}

module.exports = { parseInstruction };
