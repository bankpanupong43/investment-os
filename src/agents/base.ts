import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, MAX_AGENT_ITERATIONS } from "@/lib/constants";

export interface AgentTool {
  definition: Anthropic.Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  model?: string;
  maxIterations?: number;
}

export interface AgentResult {
  success: boolean;
  output: string;
  toolCallCount: number;
  error?: string;
}

export class BaseAgent {
  protected client: Anthropic;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.client = new Anthropic();
    this.config = config;
  }

  async run(userMessage: string): Promise<AgentResult> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];
    let toolCallCount = 0;
    const maxIterations = this.config.maxIterations ?? MAX_AGENT_ITERATIONS;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: this.config.model ?? DEFAULT_MODEL,
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        system: this.config.systemPrompt,
        tools: this.config.tools.map((t) => t.definition),
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        const textContent = response.content
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        return { success: true, output: textContent, toolCallCount };
      }

      if (response.stop_reason === "tool_use") {
        const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          toolCallCount++;

          const tool = this.config.tools.find(
            (t) => t.definition.name === block.name
          );

          if (!tool) {
            toolResultContent.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Tool "${block.name}" not found`,
              is_error: true,
            });
            continue;
          }

          try {
            const result = await tool.handler(
              block.input as Record<string, unknown>
            );
            toolResultContent.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            toolResultContent.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true,
            });
          }
        }

        messages.push({ role: "user", content: toolResultContent });
      }
    }

    return {
      success: false,
      output: "",
      toolCallCount,
      error: `Max iterations (${maxIterations}) reached without end_turn`,
    };
  }
}
