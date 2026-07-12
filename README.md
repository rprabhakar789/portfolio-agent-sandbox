# Portfolio Agent Sandbox

A minimal portfolio site (plain HTML/CSS) paired with a **Node.js automation pipeline** that accepts free-text instructions and updates portfolio content files automatically — optionally driven by GitHub Actions `repository_dispatch` events.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Content Files](#content-files)
- [Running the Agent Locally](#running-the-agent-locally)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Update Providers](#update-providers)
- [Secrets Setup](#secrets-setup)
- [Payload Format](#payload-format)
- [Auto-merge Intent](#auto-merge-intent)
- [Gmail → Dispatch Integration](#gmail--dispatch-integration)
- [Runbook](#runbook)
- [Safety Notes](#safety-notes)

---

## Architecture

```
┌──────────────────────────────────────────┐
│  Triggers                                │
│  - repository_dispatch (external)        │
│  - workflow_dispatch (manual)            │
│  - Gmail Apps Script (example)           │
└────────────┬─────────────────────────────┘
             │  instruction (free text)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  pipeline/agent.js  (orchestrator)                              │
│                                                                 │
│  1. Intent detection    ← pipeline/intent-detector.js          │
│  2. AI parsing          ← pipeline/ai-provider.js              │
│     └─ OpenAI when OPENAI_API_KEY present, stub otherwise       │
│  3. Path validation     ← pipeline/path-validator.js           │
│     └─ Fail fast if target is outside content/                 │
│  4. Deterministic edits ← pipeline/edit-engine.js              │
│     └─ set | append | remove on content/*.json                 │
│                                                                 │
│  exit 0  → PR-first flow (no auto-merge intent)                │
│  exit 2  → auto-merge intent detected (GitHub Actions merges)  │
└──────────────────────────────────────────┬──────────────────────┘
                                           │  writes
                                           ▼
                                    content/*.json
                                           │
                              ┌────────────▼────────────┐
                              │  GitHub Pages            │
                              │  index.html + styles.css │
                              │  reads content/*.json    │
                              └─────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- A GitHub repository with Pages enabled (Settings → Pages → Source: GitHub Actions)

### Clone & run tests

```bash
git clone https://github.com/rprabhakar789/portfolio-agent-sandbox.git
cd portfolio-agent-sandbox
node --test 'pipeline/tests/*.test.js'
```

### Preview the site locally

```bash
# Any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

---

## Content Files

All content lives in `content/` as JSON. **Only these files may be edited by the pipeline.**

| File | Purpose |
|------|---------|
| `content/profile.json` | Name, title, bio, contact links |
| `content/projects.json` | Array of project objects |
| `content/skills.json` | Array of skill objects |

### `content/profile.json`

```json
{
  "name": "Your Name",
  "title": "Software Engineer",
  "bio": "Short bio text",
  "email": "you@example.com",
  "github": "https://github.com/yourusername",
  "linkedin": "https://linkedin.com/in/yourusername",
  "avatar": "assets/avatar.png"
}
```

### `content/projects.json`

```json
[
  {
    "id": "project-1",
    "title": "Project Title",
    "description": "Short description.",
    "url": "https://github.com/...",
    "tags": ["Node.js", "API"],
    "featured": true
  }
]
```

### `content/skills.json`

```json
[
  { "name": "JavaScript", "level": "Expert" }
]
```

---

## Running the Agent Locally

### Free-text instruction (uses AI provider or stub)

```bash
node pipeline/agent.js --instruction "Update my bio to: I'm a fullstack engineer based in NYC."
```

### With a real OpenAI key

```bash
OPENAI_API_KEY=sk-... node pipeline/agent.js --instruction "Add Docker to my skills list."
```

### With Azure OpenAI / Azure AI Foundry

```bash
AZURE_OPENAI_API_KEY=... \
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com \
AZURE_OPENAI_DEPLOYMENT=<deployment-name> \
AZURE_OPENAI_API_VERSION=2024-10-21 \
node pipeline/agent.js --instruction "Add Docker to my skills list."
```

Azure requests omit `temperature` by default for compatibility with models that only support provider-default temperature. If your deployment supports explicit temperature, set `AZURE_OPENAI_TEMPERATURE` (for example `0.2`).

### Bypass AI — pass edit operations directly

```bash
node pipeline/agent.js --json '{
  "instruction": "Update bio",
  "operations": [
    { "file": "content/profile.json", "op": "set", "key": "bio", "value": "Available for freelance work." }
  ]
}'
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success, no auto-merge intent |
| `1` | Error (bad input, path violation, edit failure) |
| `2` | Success **with** auto-merge intent detected |

---

## GitHub Actions Workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `.github/workflows/ci.yml` | Push / PR | Syntax check, tests, JSON validation |
| `.github/workflows/dispatch.yml` | `repository_dispatch` / `workflow_dispatch` | Run agent, commit changes, open PR, optional auto-merge |
| `.github/workflows/pages.yml` | Push to `main` (site files) | Deploy to GitHub Pages |

---

## Update Providers

The update pipeline supports two provider strategies via dependency injection.

| Provider | What it does | Output behavior |
|------|---------|---------|
| `llm-ops` | Existing Azure/OpenAI/stub JSON-ops flow → path-validated `content/` edits → commit/PR flow | Applies edits in-repo and can auto-merge when requested |
| `copilot` | GitHub-native delegation path that creates a handoff issue for Copilot/Coding Agent follow-up | Returns explicit `delegated` / `unsupported` / `error`; does not fake applied edits |

Selection uses `UPDATE_PROVIDER` (`copilot` or `llm-ops`).

- If `UPDATE_PROVIDER` is set, it is used.
- If unset, default is `copilot` when running in GitHub Actions with `GITHUB_TOKEN` + `GITHUB_REPOSITORY`; otherwise `llm-ops`.

For `copilot` in Actions, the workflow needs `issues: write` permission so it can create delegation issues.

### Provider examples

```bash
# Force existing JSON-op behavior
UPDATE_PROVIDER=llm-ops node pipeline/agent.js --instruction "Update my bio"

# Force Copilot delegation behavior
UPDATE_PROVIDER=copilot node pipeline/agent.js --instruction "Add a new featured project"
```

---

## Secrets Setup

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Required | Description |
|--------|----------|-------------|
| `AZURE_OPENAI_API_KEY` | Optional (Azure path) | Azure OpenAI/AI Foundry API key. |
| `OPENAI_API_KEY` | Optional (OpenAI path) | Enables OpenAI parsing when Azure credentials are not configured. |
| `GITHUB_TOKEN` | Required for `copilot` in Actions | Used to create delegation issue in the target repository. |
| `DISPATCH_TOKEN` | Recommended | A PAT with `repo` scope for triggering `repository_dispatch` from external sources (Gmail script, etc.). |

Recommended Azure configuration:
- Keep `AZURE_OPENAI_API_KEY` in **Secrets**.
- Put these in **Variables** (with secret fallback still supported):
  - `AZURE_OPENAI_ENDPOINT` (e.g. `https://<resource>.openai.azure.com`)
  - `AZURE_OPENAI_DEPLOYMENT`
  - Optional: `AZURE_OPENAI_API_VERSION` (default `2024-10-21`)
  - Optional: `AZURE_OPENAI_TEMPERATURE`

> **Note:** `GITHUB_TOKEN` is automatically available to all workflows — no setup needed for PR creation and auto-merge.
>
> `llm-ops` provider AI selection order: **Azure OpenAI (if configured)** → **OpenAI** → **stub**.
>
> `copilot` provider currently uses issue-based delegation in GitHub Actions. This is asynchronous: it creates a handoff issue and expects a follow-up PR from Copilot/Coding Agent workflow.

---

## Payload Format

Send a `repository_dispatch` event to the GitHub API:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <DISPATCH_TOKEN>" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{
    "event_type": "portfolio-update",
    "client_payload": {
      "instruction": "Update bio to: Available for new opportunities. Ship this.",
      "update_provider": "llm-ops"
    }
  }'
```

### With explicit operations (skip AI)

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <DISPATCH_TOKEN>" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{
    "event_type": "portfolio-update",
    "client_payload": {
      "instruction": "Add Python to skills",
      "operations": [
        {
          "file": "content/skills.json",
          "op": "append",
          "key": "",
          "value": { "name": "Python", "level": "Advanced" }
        }
      ]
    }
  }'
```

> For top-level array operations (appending to `skills.json` root), set `"key": ""` and the engine will handle it. *(Or use `"op": "append"` on a wrapper key if your schema nests the array.)*

---

## Auto-merge Intent

The pipeline scans the instruction for explicit merge/publish intent phrases:

| Phrase | Example usage |
|--------|--------------|
| `merge and deploy` | "Update bio and merge and deploy" |
| `auto merge` | "auto merge this update" |
| `automerge` | "automerge when ready" |
| `publish this` | "looks good, publish this" |
| `ship this` | "ship this update live" |
| `go live` | "ready to go live" |

When detected:
1. The pipeline exits with code `2`.
2. The dispatch workflow reads this and enables **auto-merge** (squash) on the created PR.
3. Once required CI checks pass, GitHub merges the PR automatically.

When **not** detected, a PR is created and waits for manual review.

---

## Gmail → Dispatch Integration

See [`examples/gmail-apps-script.gs`](examples/gmail-apps-script.gs) for a Google Apps Script that:

1. Searches Gmail for messages with a specific label (e.g. `portfolio-update`).
2. Extracts the email body as the instruction.
3. POSTs a `repository_dispatch` event to GitHub.
4. Marks the message as processed (removes the label).

### Setup

1. Open [script.google.com](https://script.google.com) → New project.
2. Paste the script from `examples/gmail-apps-script.gs`.
3. Set **Script Properties** (Project Settings → Script properties):
   - `GITHUB_TOKEN` — a PAT with `repo` scope
   - `GITHUB_REPO` — `owner/repo` (e.g. `rprabhakar789/portfolio-agent-sandbox`)
   - `GMAIL_LABEL` — label name to watch (e.g. `portfolio-update`)
   - `ALLOWED_SENDERS` — required comma-separated sender emails (normalized with trim + lowercase), e.g. `alice@example.com,bob@company.com`
   - `UPDATE_PROVIDER` — optional, defaults to `llm-ops` (set `copilot` only if you want delegation mode)
4. Create a **time-driven trigger**: Run `forwardLabeledEmails` every 5–15 minutes.

Only allowlisted senders are dispatched to GitHub. Non-allowlisted senders are skipped and logged, and messages are left unread/labeled by default for manual review.
Email-triggered updates now use `llm-ops` by default unless you explicitly override provider.

---

## Runbook

### Manually trigger an update

```bash
# Via GitHub CLI
gh workflow run dispatch.yml \
  --field instruction="Update bio to: Senior engineer, open to remote work."
```

### Manually trigger via API

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/rprabhakar789/portfolio-agent-sandbox/dispatches \
  -d '{"event_type":"portfolio-update","client_payload":{"instruction":"Update title to: Principal Engineer"}}'
```

### Enable GitHub Pages

1. Go to **Settings → Pages**.
2. Set Source to **GitHub Actions**.
3. Push to `main` — the `pages.yml` workflow deploys automatically.

### What to do when a PR is created but not auto-merged

1. Review the diff in `content/`.
2. If the changes look correct, approve and merge.
3. The `pages.yml` workflow triggers on merge and deploys.

### Debugging pipeline failures

1. Check the Actions run log for the failing step.
2. Common causes:
   - `PathValidationError` — the AI tried to edit a non-content file. Review the instruction and add `operations` manually.
   - OpenAI quota / key issue — the stub provider will be used as fallback.
   - JSON parse error in content file — restore from the last good commit.
   - Copilot provider `unsupported` — ensure `GITHUB_TOKEN` and `GITHUB_REPOSITORY` are available in the workflow runtime.

### Troubleshooting: no visible UI changes

If the workflow succeeds but no site content changed:

1. Confirm `UPDATE_PROVIDER`.
   - `copilot` path delegates by creating an issue and does not directly edit `content/`.
   - `llm-ops` path applies JSON operations directly and opens a PR with content changes.
2. For `copilot`, open the delegation issue URL from workflow logs/outputs and track the follow-up PR.
3. If you want immediate content edits in this repo, rerun with `update_provider: llm-ops`.

---

## Safety Notes

- **Strict path enforcement**: The pipeline will hard-fail (`exit 1`) if any edit operation targets a file outside `content/`. This is enforced in `pipeline/path-validator.js` before any writes occur.
- **AI is sandboxed**: `pipeline/ai-provider.js` is the only module that calls external APIs. All instructions go through it; the rest of the pipeline is deterministic.
- **No secrets in code**: API keys are always read from environment variables.
- **GitHub Actions orchestrates; AI assists**: The workflow controls branching, PR creation, and merge decisions. The AI only suggests edit operations.
