import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { withHeadroom } from "headroom-ai/anthropic";

async function main() {
  console.log("=== Headroom Integration Test ===\n");

  const raw = new Anthropic();
  const client = withHeadroom(raw, {
    fallback: true,
    ...(process.env.HEADROOM_BASE_URL && { baseUrl: process.env.HEADROOM_BASE_URL }),
    ...(process.env.HEADROOM_API_KEY  && { apiKey:  process.env.HEADROOM_API_KEY  }),
  }) as Anthropic;

  const keyLen = process.env.ANTHROPIC_API_KEY?.length ?? 0;
  console.log("API key loaded:", keyLen > 20 ? `✓ (${keyLen} chars)` : `✗ too short (${keyLen} chars)`);
  console.log("Client wrapped with headroom: ✓");
  console.log("Fallback mode:", !process.env.HEADROOM_BASE_URL ? "ON (no proxy)" : "OFF (proxy active)");
  console.log("Proxy URL:", process.env.HEADROOM_BASE_URL ?? "(none)");
  console.log("");

  // ส่ง request ง่ายๆ — headroom จะ intercept messages.create()
  console.log("Sending test message to Anthropic via headroom wrapper...\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [
      { role: "user", content: "Reply with exactly: headroom integration works" },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  console.log("Response:", text);
  console.log("\nStop reason:", response.stop_reason);
  console.log("Model used:", response.model);
  console.log("\n=== Test PASSED ===");
}

main().catch((err) => {
  console.error("=== Test FAILED ===");
  console.error(err);
  process.exit(1);
});
