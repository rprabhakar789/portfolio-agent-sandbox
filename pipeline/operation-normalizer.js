'use strict';

const ROOT_ARRAY_ALIASES = {
  'content/skills.json': 'skills',
  'content/projects.json': 'projects',
};

function normalizeOperations(operations, options = {}) {
  const debugEnabled = Boolean(options.debugEnabled);
  const normalized = [];
  const notes = [];
  const errors = [];

  for (const op of operations || []) {
    try {
      const result = normalizeOperation(op);
      normalized.push(result.operation);
      if (debugEnabled) notes.push(...result.notes);
    } catch (error) {
      errors.push({ op, error: error.message });
    }
  }

  return { operations: normalized, notes, errors };
}

function normalizeOperation(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    throw new Error('Each operation must be a plain object');
  }

  const operation = { ...op };
  const notes = [];
  const alias = ROOT_ARRAY_ALIASES[operation.file];

  if (!alias) {
    return { operation, notes };
  }

  const keyNormalization = normalizeRootArrayKey(operation.key, alias);
  operation.key = keyNormalization.key;
  if (keyNormalization.note) notes.push(`[${operation.file}] ${keyNormalization.note}`);

  if (operation.file === 'content/skills.json') {
    const skillNormalization = normalizeSkillOperation(operation);
    operation.value = skillNormalization.value;
    if (skillNormalization.key !== undefined) operation.key = skillNormalization.key;
    notes.push(...skillNormalization.notes.map((note) => `[${operation.file}] ${note}`));
  }

  if (operation.file === 'content/projects.json') {
    validateProjectOperation(operation);
  }

  return { operation, notes };
}

function normalizeRootArrayKey(key, alias) {
  if (key == null) return { key };

  const trimmed = String(key).trim();
  if (!trimmed) return { key: '' };
  if (trimmed === alias) {
    return {
      key: '',
      note: `normalized key "${alias}" to the root array`,
    };
  }
  if (trimmed.startsWith(`${alias}.`)) {
    return {
      key: trimmed.slice(alias.length + 1),
      note: `stripped "${alias}." prefix from key "${trimmed}"`,
    };
  }

  return { key: trimmed };
}

function normalizeSkillOperation(operation) {
  const notes = [];
  const rootTarget = isRootArrayTarget(operation.key);
  const itemTarget = typeof operation.key === 'string' && /^\d+$/.test(operation.key);
  const allowDefaultLevel = operation.op === 'append' || operation.op === 'set';

  if (operation.op === 'set' && rootTarget) {
    if (!Array.isArray(operation.value)) {
      throw new Error('content/skills.json root-level set operations require an array value');
    }
    const normalizedItems = operation.value.map((value) => {
      const result = normalizeSkillItem(value, { allowDefaultLevel });
      if (result.note) notes.push(result.note);
      return result.value;
    });
    return { value: normalizedItems, notes };
  }

  if ((operation.op === 'append' || operation.op === 'remove') && rootTarget) {
    const result = normalizeSkillItem(operation.value, { allowDefaultLevel });
    if (result.note) notes.push(result.note);
    return { value: result.value, notes };
  }

  if (operation.op === 'set' && itemTarget) {
    const result = normalizeSkillItem(operation.value, { allowDefaultLevel });
    if (result.note) notes.push(result.note);
    return { value: result.value, notes };
  }

  return { value: operation.value, notes };
}

function normalizeSkillItem(value, options = {}) {
  const allowDefaultLevel = Boolean(options.allowDefaultLevel);

  if (isPlainObject(value)) {
    const name = normalizeNonEmptyString(value.name);
    const level = normalizeNonEmptyString(value.level);

    if (!name) {
      throw new Error('Skill values must include non-empty "name" and "level" fields');
    }

    if (!level) {
      if (!allowDefaultLevel) {
        throw new Error('Skill values must include non-empty "name" and "level" fields');
      }

      const normalized = { ...value, name, level: 'Beginner' };
      return {
        value: normalized,
        note: `defaulted missing skill level to "Beginner" for ${JSON.stringify(normalized)}`,
      };
    }

    const normalized = { ...value, name, level };
    return {
      value: normalized,
      note: JSON.stringify(normalized) === JSON.stringify(value)
        ? null
        : `trimmed skill object to ${JSON.stringify(normalized)}`,
    };
  }

  if (typeof value === 'string') {
    const parsed = parseSkillString(value);
    if (parsed) {
      return {
        value: parsed,
        note: `normalized skill string "${value}" to ${JSON.stringify(parsed)}`,
      };
    }

    if (!allowDefaultLevel) {
      throw new Error('Skill string values must use the form "Name (Level)"');
    }

    const name = normalizeNonEmptyString(value);
    if (!name) {
      throw new Error('Skill string values must use the form "Name (Level)"');
    }

    return {
      value: { name, level: 'Beginner' },
      note: `defaulted missing skill level to "Beginner" for "${name}"`,
    };
  }

  throw new Error('Skill values must be an object or a "Name (Level)" string');
}

function validateProjectOperation(operation) {
  const rootTarget = isRootArrayTarget(operation.key);
  const itemTarget = typeof operation.key === 'string' && /^\d+$/.test(operation.key);

  if (operation.op === 'set' && rootTarget) {
    if (!Array.isArray(operation.value) || operation.value.some((value) => !isPlainObject(value))) {
      throw new Error('content/projects.json root-level set operations require an array of project objects');
    }
    return;
  }

  if ((operation.op === 'append' || operation.op === 'remove') && rootTarget) {
    if (!isPlainObject(operation.value)) {
      throw new Error(`content/projects.json root-array ${operation.op} operations require a project object value`);
    }
    return;
  }

  if (operation.op === 'set' && itemTarget && !isPlainObject(operation.value)) {
    throw new Error('content/projects.json index set operations require a project object value');
  }
}

function parseSkillString(value) {
  const trimmed = normalizeNonEmptyString(value);
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*?)\s*\(([^()]+)\)$/);
  if (!match) return null;

  const name = normalizeNonEmptyString(match[1]);
  const level = normalizeNonEmptyString(match[2]);
  if (!name || !level) return null;
  return { name, level };
}

function normalizeNonEmptyString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRootArrayTarget(key) {
  return key == null || key === '';
}

module.exports = { normalizeOperations };
