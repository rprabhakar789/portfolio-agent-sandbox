# Portfolio Agent Knowledge Base

This checked-in document is the runtime knowledge base used today by both the Azure OpenAI and OpenAI prompt paths in `pipeline/ai-provider.js`.

Reference-only external knowledge base:
- id: `vs_UDwZF3DPEi4eo2JqXZeoVYEl`
- name: `portfolio-knowledge-base`

The runtime does not currently query that external vector store directly. Instead, the local guidance below is injected into the model prompt so Azure and OpenAI behave consistently.

## Allowed files

Only these files may be changed:
- `content/profile.json`
- `content/projects.json`
- `content/skills.json`

Never propose edits outside `content/`.

## File contracts

### `content/profile.json`

This file is a JSON object. Typical editable keys include:
- `name`
- `title`
- `bio`
- `email`
- `github`
- `linkedin`
- `avatar`

### `content/projects.json`

This file is a **root JSON array** of project objects.

Each project entry should look like:

```json
{
  "id": "project-3",
  "title": "Project Title",
  "description": "Short description.",
  "url": "https://github.com/yourusername/project",
  "tags": ["Node.js", "Automation"],
  "featured": true
}
```

Prompting rules:
- To append or remove a whole project entry, target the **root array**.
- Do **not** use `key: "projects"` for root-array append/remove operations.
- If updating a specific field on an existing project, use array-index paths like `0.title` or `1.description`.

### `content/skills.json`

This file is a **root JSON array** of skill objects.

Each skill entry should look like:

```json
{
  "name": "Dancing",
  "level": "Beginner"
}
```

Prompting rules:
- To append or remove a whole skill entry, target the **root array**.
- Do **not** use `key: "skills"` for root-array append/remove operations.
- Prefer structured skill objects with `name` and `level`.
- If the instruction adds a skill without specifying a level, default the level to `Beginner`.
- If the instruction is phrased like `Dancing (Beginner)`, convert it to:

```json
{
  "name": "Dancing",
  "level": "Beginner"
}
```

## Operation shape reminders

Return JSON only:

```json
{
  "summary": "One sentence summary",
  "operations": [
    {
      "file": "content/skills.json",
      "op": "append",
      "key": "",
      "value": { "name": "Dancing", "level": "Beginner" }
    }
  ],
  "confidence": 0.9
}
```

Key rules:
- `profile.json` is an object, so object keys like `bio` are valid.
- `projects.json` and `skills.json` are root arrays, so whole-entry append/remove operations should use an empty key (or omit it entirely).
- Never return markdown fences or prose outside the JSON object.
