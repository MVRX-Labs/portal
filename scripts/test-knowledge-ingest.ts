/**
 * Test script: Verify knowledge ingestion against live Slack API.
 *
 * Usage: npx tsx scripts/test-knowledge-ingest.ts
 *
 * This does NOT write to the database — it only tests the Slack client
 * and prints what would be ingested.
 */

import "dotenv/config";

const SLACK_API = "https://slack.com/api";
const TOKEN = process.env.KNOWLEDGE_SLACKBOT_TOKEN;
const CHANNEL = "C0A4A5PKUQ5"; // mvrx-60x

if (!TOKEN) {
  console.error("KNOWLEDGE_SLACKBOT_TOKEN not set in .env.local");
  process.exit(1);
}

async function slackGet(method: string, params: Record<string, string>) {
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

async function main() {
  console.log("=== Knowledge Hub Ingestion Test ===\n");

  // 1. Test channel info
  console.log("1. Fetching channel info...");
  const channelInfo = await slackGet("conversations.info", { channel: CHANNEL });
  if (!channelInfo.ok) {
    console.error("  FAILED:", channelInfo.error);
    return;
  }
  console.log(`  ✅ Channel: #${channelInfo.channel.name}`);
  console.log(`  Shared: ${channelInfo.channel.is_shared || channelInfo.channel.is_ext_shared}`);
  console.log(`  Teams: ${channelInfo.channel.connected_team_ids?.join(", ")}\n`);

  // 2. Test recent messages (last 10)
  console.log("2. Fetching recent messages...");
  const history = await slackGet("conversations.history", { channel: CHANNEL, limit: "10" });
  if (!history.ok) {
    console.error("  FAILED:", history.error);
    return;
  }
  console.log(`  ✅ Got ${history.messages.length} messages\n`);

  // 3. Test user resolution
  console.log("3. Testing user resolution...");
  const userIds = new Set<string>();
  for (const msg of history.messages) {
    if (msg.user) userIds.add(msg.user);
  }

  for (const uid of Array.from(userIds).slice(0, 3)) {
    const userInfo = await slackGet("users.info", { user: uid });
    if (userInfo.ok) {
      const name = userInfo.user.profile.real_name || userInfo.user.real_name;
      const team = userInfo.user.team_id;
      console.log(`  ✅ ${uid} → ${name} (team: ${team})`);
    } else {
      console.log(`  ⚠️ ${uid} → ${userInfo.error}`);
    }
  }

  // 4. Count content types
  console.log("\n4. Content type analysis (last 10 messages):");
  let text = 0, voiceNotes = 0, images = 0, gdocs = 0, threads = 0;
  for (const msg of history.messages) {
    if (msg.files?.length) {
      for (const f of msg.files) {
        if (f.filetype === "m4a") voiceNotes++;
        else if (f.mimetype?.startsWith("image/")) images++;
        else if (f.filetype === "gdoc" || f.filetype === "gsheet") gdocs++;
      }
    }
    if (msg.reply_count > 0) threads++;
    if (msg.text?.trim()) text++;
  }
  console.log(`  Text: ${text} | Voice notes: ${voiceNotes} | Images: ${images} | GDocs: ${gdocs} | Threads: ${threads}`);

  // 5. Test thread resolution
  const threadMsg = history.messages.find((m: any) => m.reply_count > 0);
  if (threadMsg) {
    console.log(`\n5. Testing thread fetch (${threadMsg.reply_count} replies)...`);
    const replies = await slackGet("conversations.replies", {
      channel: CHANNEL,
      ts: threadMsg.ts,
      limit: "5",
    });
    if (replies.ok) {
      console.log(`  ✅ Got ${replies.messages.length - 1} replies`);
    }
  }

  console.log("\n=== All tests passed. Ready to ingest. ===");
}

main().catch(console.error);
