// Gmail OAuth2 Bootstrap — Phase 14
//
// One-time script to obtain a refresh token for Gmail API access.
// Run: npm run gmail:bootstrap
//
// Steps:
//   1. Reads GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from .env
//   2. Prints the OAuth consent URL — open it in your browser
//   3. After granting access, Google redirects to localhost (or shows a code)
//   4. Paste the authorization code here
//   5. Prints the REFRESH_TOKEN — copy it into .env as GMAIL_REFRESH_TOKEN

import * as readline from "readline";
import * as dotenv from "dotenv";
import * as path from "path";
import { google } from "googleapis";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"; // Out-of-band — shows code in browser

async function main() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("ERROR: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // force consent screen so refresh_token is always returned
  });

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("  Gmail OAuth2 Bootstrap");
  console.log("────────────────────────────────────────────────────────────\n");
  console.log("1. Open this URL in your browser:\n");
  console.log("   " + authUrl);
  console.log("\n2. Sign in with your Google account and grant Gmail read access.");
  console.log("3. Copy the authorization code shown on the page.");
  console.log("────────────────────────────────────────────────────────────\n");

  const code = await prompt("Paste authorization code: ");

  if (!code.trim()) {
    console.error("No code provided. Exiting.");
    process.exit(1);
  }

  console.log("\nExchanging code for tokens...");

  try {
    const { tokens } = await oauth2Client.getToken(code.trim());

    if (!tokens.refresh_token) {
      console.error(
        "\nERROR: No refresh_token returned.\n" +
        "This usually means the account already authorized this app.\n" +
        "Fix: Go to https://myaccount.google.com/permissions, revoke access\n" +
        "for this app, then re-run this script."
      );
      process.exit(1);
    }

    console.log("\n────────────────────────────────────────────────────────────");
    console.log("  Success! Add this to your .env file:");
    console.log("────────────────────────────────────────────────────────────\n");
    console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"\n`);

    if (tokens.access_token) {
      // Verify the token works by fetching the profile
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      console.log(`Verified: connected as ${profile.data.emailAddress}`);
    }

    console.log("\n────────────────────────────────────────────────────────────");
    console.log("  Next step: paste GMAIL_REFRESH_TOKEN into .env, then");
    console.log("  run npm run newsletter:refresh to test ingestion.");
    console.log("────────────────────────────────────────────────────────────\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nToken exchange failed: ${message}`);
    process.exit(1);
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

main();
