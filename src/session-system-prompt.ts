export interface SessionSystemPrompt {
  content: string;
  source?: string;
  resumed: boolean;
}

interface SessionSystemPromptOptions {
  cliStorageRoot: string;
  sessionId: string;
  resume?: boolean;
  currentSystemPrompt?: string;
  env: Record<string, string | undefined>;
}

/** Self-contained: sync-runtime embeds this function into the CommonJS runtime. */
export function resolveSessionSystemPrompt(options: SessionSystemPromptOptions): SessionSystemPrompt | undefined {
  if (options.currentSystemPrompt !== undefined) return undefined;
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const directory = path.join(options.cliStorageRoot, "system-prompts");
  const file = path.join(directory, `${options.sessionId}.json`);
  if (options.resume) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { content: string | null; source?: string };
    return saved.content === null ? undefined : { content: saved.content, source: saved.source, resumed: true };
  }
  const content = options.env.ZCODE_CLI_SYSTEM_PROMPT;
  const source = options.env.ZCODE_CLI_SYSTEM_PROMPT_SOURCE;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ content: content ?? null, ...(source ? { source } : {}) }));
  return content === undefined ? undefined : { content, ...(source ? { source } : {}), resumed: false };
}
