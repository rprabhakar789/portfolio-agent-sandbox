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
 *        ALLOWED_SENDERS — required comma-separated sender emails
 *   3. Create a time-driven trigger: forwardLabeledEmails, every 10 minutes.
 *
 * How it works:
 *   - Searches for unread messages with the configured Gmail label.
 *   - Enforces sender allowlist from ALLOWED_SENDERS.
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
  const allowedSendersRaw = props.getProperty('ALLOWED_SENDERS');

  if (!token) throw new Error('Script property GITHUB_TOKEN is not set.');
  if (!repo)  throw new Error('Script property GITHUB_REPO is not set.');
  if (!allowedSendersRaw) throw new Error('Script property ALLOWED_SENDERS is not set.');

  const allowedSenders = parseAllowedSenders(allowedSendersRaw);
  if (allowedSenders.length === 0) {
    throw new Error('Script property ALLOWED_SENDERS has no valid email addresses.');
  }

  return { token, repo, label, allowedSenders: new Set(allowedSenders) };
}

// ── Main entry point ──────────────────────────────────────────────────────────

function forwardLabeledEmails() {
  const { token, repo, label, allowedSenders } = getConfig();

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
    const fromHeader = message.getFrom();
    const senderEmail = extractSenderEmail(fromHeader);

    if (!senderEmail) {
      Logger.log(`Skipping thread "${subject}" — cannot parse sender from header: ${fromHeader}`);
      continue;
    }

    if (!allowedSenders.has(senderEmail)) {
      Logger.log(`Skipping thread "${subject}" — sender "${senderEmail}" is not allowlisted.`);
      // Intentionally do NOT mark read / remove label for manual review.
      continue;
    }

    const body     = message.getPlainBody().trim();

    if (!body) {
      Logger.log(`Skipping thread "${subject}" — empty body.`);
      continue;
    }

    /**
     * Parses ALLOWED_SENDERS CSV into normalized email list.
     * @param {string} raw
     * @returns {string[]}
     */
    function parseAllowedSenders(raw) {
      return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
    }

    /**
     * Extract sender email from a Gmail From header.
     * Handles values like:
     *   - "Jane Doe <jane@example.com>"
     *   - "jane@example.com"
     *   - "\"Jane, Inc\" <jane@example.com>"
     * @param {string} fromHeader
     * @returns {string|null}
     */
    function extractSenderEmail(fromHeader) {
      if (!fromHeader) return null;
      const text = String(fromHeader).trim();

      const angleMatch = text.match(/<\s*([^<>@\s]+@[^<>@\s]+)\s*>/);
      if (angleMatch && angleMatch[1]) return angleMatch[1].trim().toLowerCase();

      const directMatch = text.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
      if (directMatch && directMatch[1]) return directMatch[1].trim().toLowerCase();

      return null;
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
