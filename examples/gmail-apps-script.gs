/**
 * gmail-apps-script.gs
 * Google Apps Script — forward labeled Gmail messages to GitHub repository_dispatch.
 *
 * Setup:
 *   1. Open script.google.com → New project → paste this file.
 *   2. Add Script Properties (Project Settings → Script properties):
 *        GITHUB_TOKEN  — Personal Access Token with repo scope
 *        GITHUB_REPO   — e.g. "rprabhakar789/portfolio-agent-sandbox"
 *        GMAIL_LABEL   — Gmail label to watch, e.g. "portfolio-update"
 *   3. Create a time-driven trigger: forwardLabeledEmails, every 10 minutes.
 *
 * How it works:
 *   - Searches for unread messages with the configured Gmail label.
 *   - Uses the plain-text body of the first matching email as the "instruction".
 *   - POSTs a repository_dispatch event to GitHub.
 *   - Removes the label from the thread so it isn't processed again.
 *   - Logs success/failure to the Apps Script logger.
 */

// ── Configuration (read from Script Properties) ──────────────────────────────

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo  = props.getProperty('GITHUB_REPO');
  const label = props.getProperty('GMAIL_LABEL') || 'portfolio-update';

  if (!token) throw new Error('Script property GITHUB_TOKEN is not set.');
  if (!repo)  throw new Error('Script property GITHUB_REPO is not set.');

  return { token, repo, label };
}

// ── Main entry point ──────────────────────────────────────────────────────────

function forwardLabeledEmails() {
  const { token, repo, label } = getConfig();

  const query = `label:${label} is:unread`;
  const threads = GmailApp.search(query, 0, 10); // process up to 10 at a time

  if (threads.length === 0) {
    Logger.log('No labeled unread messages found.');
    return;
  }

  Logger.log(`Found ${threads.length} thread(s) to process.`);

  const labelObj = GmailApp.getUserLabelByName(label);

  for (const thread of threads) {
    const messages = thread.getMessages();
    const message  = messages[messages.length - 1]; // use the latest message in thread
    const subject  = message.getSubject();
    const body     = message.getPlainBody().trim();

    if (!body) {
      Logger.log(`Skipping thread "${subject}" — empty body.`);
      continue;
    }

    Logger.log(`Processing: "${subject}"`);
    Logger.log(`Instruction (first 120 chars): ${body.slice(0, 120)}`);

    const success = dispatchToGitHub(token, repo, body, subject);

    if (success) {
      // Mark thread as read and remove the label so it's not processed again
      thread.markRead();
      if (labelObj) thread.removeLabel(labelObj);
      Logger.log(`Dispatched OK for thread: "${subject}"`);
    } else {
      Logger.log(`Dispatch FAILED for thread: "${subject}" — leaving label for retry.`);
    }
  }
}

// ── GitHub repository_dispatch ────────────────────────────────────────────────

/**
 * Sends a repository_dispatch event to GitHub.
 * @param {string} token   - GitHub PAT
 * @param {string} repo    - "owner/repo"
 * @param {string} instruction - free-text instruction
 * @param {string} subject - email subject (included in payload for context)
 * @returns {boolean}      - true on HTTP 204 success
 */
function dispatchToGitHub(token, repo, instruction, subject) {
  const url = `https://api.github.com/repos/${repo}/dispatches`;

  const payload = JSON.stringify({
    event_type: 'portfolio-update',
    client_payload: {
      instruction: instruction,
      source: 'gmail',
      subject: subject,
    },
  });

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: payload,
    muteHttpExceptions: true, // handle errors ourselves
  };

  let response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log(`UrlFetchApp error: ${e.message}`);
    return false;
  }

  const code = response.getResponseCode();
  if (code === 204) {
    return true;
  } else {
    Logger.log(`GitHub API returned HTTP ${code}: ${response.getContentText()}`);
    return false;
  }
}

// ── Utility: test function (run manually from Apps Script editor) ─────────────

/**
 * Test function — run this manually from the Apps Script editor to verify
 * your token, repo, and connectivity without needing a real Gmail message.
 */
function testDispatch() {
  const { token, repo } = getConfig();
  const ok = dispatchToGitHub(
    token,
    repo,
    'Test from Apps Script: Update bio to: Testing the Gmail integration.',
    'Test subject'
  );
  Logger.log(ok ? '✅ Dispatch succeeded.' : '❌ Dispatch failed — check logs above.');
}
