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
 *     provider: string,         // 'openai' | 'stub'
 *   }
 *
 * EditOp shape:
 *   { file: string, op: 'set'|'append'|'remove', key: string, value?: any }
 */

'use strict';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
 * Uses OpenAI when OPENAI_API_KEY is set; falls back to a stub provider.
 *
 * @param {string} instruction
 * @returns {Promise<{summary: string, operations: object[], confidence: number, provider: string}>}
 */
async function parseInstruction(instruction) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[ai-provider] OPENAI_API_KEY not set — using stub provider.');
    return stubProvider(instruction);
  }

  try {
    return await openaiProvider(instruction, apiKey);
  } catch (err) {
    console.error(`[ai-provider] OpenAI call failed: ${err.message} — falling back to stub.`);
    return stubProvider(instruction);
  }
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
