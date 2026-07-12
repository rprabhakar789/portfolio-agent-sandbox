'use strict';

async function runCopilotProvider(context) {
  const instruction = context.instruction || '';
  const token = process.env.GITHUB_TOKEN || '';
  const repository = process.env.GITHUB_REPOSITORY || '';

  if (!instruction) {
    return {
      provider: 'copilot',
      status: 'error',
      autoMerge: false,
      message: 'No instruction provided for Copilot delegation.',
    };
  }

  if (!token || !repository) {
    return {
      provider: 'copilot',
      status: 'unsupported',
      autoMerge: false,
      message: 'Copilot provider requires GITHUB_TOKEN and GITHUB_REPOSITORY in environment.',
    };
  }

  const issueTitle = buildIssueTitle();
  const issueBody = buildIssueBody({
    instruction,
    eventName: process.env.GITHUB_EVENT_NAME || 'unknown',
    runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : '',
  });

  try {
    const issue = await createDelegationIssue({
      repository,
      token,
      title: issueTitle,
      body: issueBody,
    });

    return {
      provider: 'copilot',
      status: 'delegated',
      autoMerge: false,
      message: 'Delegated to GitHub issue for Copilot follow-up.',
      delegation: {
        type: 'issue',
        id: String(issue.number),
        url: issue.html_url,
      },
    };
  } catch (err) {
    return {
      provider: 'copilot',
      status: 'error',
      autoMerge: false,
      message: `Copilot delegation failed: ${err.message}`,
    };
  }
}

function buildIssueTitle() {
  const datePart = new Date().toISOString().slice(0, 10);
  return `Copilot content update request (${datePart})`;
}

function buildIssueBody({ instruction, eventName, runUrl }) {
  return [
    '## Copilot Delegation Request',
    '',
    'This issue was created by the dispatch workflow because `UPDATE_PROVIDER=copilot`.',
    '',
    `- **Source event:** \`${eventName}\``,
    runUrl ? `- **Workflow run:** ${runUrl}` : '',
    '',
    '### Instruction',
    '',
    '```text',
    instruction,
    '```',
    '',
    '### Expected next step',
    '',
    'Use GitHub Copilot/Coding Agent workflow to implement the requested content updates and open a PR.',
  ].filter(Boolean).join('\n');
}

async function createDelegationIssue({ repository, token, title, body }) {
  const url = `https://api.github.com/repos/${repository}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub issue create failed (${response.status}): ${text}`);
  }

  return response.json();
}

module.exports = { runCopilotProvider };
