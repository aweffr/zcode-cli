#!/usr/bin/env bun
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const command = process.argv[2] ? [process.argv[2]] : [Bun.which("node")!, join(root, "bin/zcode.js")];
const home = await mkdtemp(join(tmpdir(), "zcode-system-prompt-tui-"));
const workspace = join(home, "workspace");
const promptPath = join(home, "prompt.txt");
const custom = "Fixture live runtime prompt. Always reply OK.";
const systems: string[][] = [];
const server = Bun.serve({ port: 0, async fetch(request) {
  const body = await request.json() as { messages: Array<{ role: string; content: string }> };
  systems.push(body.messages.filter((m) => m.role === "system").map((m) => m.content));
  const base = { id: "chatcmpl-prompt", created: 1, model: "fixture", object: "chat.completion.chunk" };
  const chunks = [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 1, total_tokens: 101 } }
  ];
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
} });
const dbPath = join(home, ".zcode/cli/db.sqlite");
await mkdir(join(home, ".zcode/cli"), { recursive: true });
await mkdir(workspace);
await writeFile(promptPath, custom);
await writeFile(join(home, ".zcode/cli/config.json"), JSON.stringify({
  provider: { bigmodel: { kind: "openai-compatible", options: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "fixture" }, models: { fixture: { limit: { context: 1000000 } } } } },
  model: { main: "bigmodel/fixture", lite: "bigmodel/fixture" },
  storage: { dir: join(home, ".zcode"), sessionDbPath: dbPath },
  features: { compact: false, memory: false, skill: false, subagent: false, mcp: false },
  memory: { use: false, write: false }, plugins: { enabled: false }, skills: { enabled: false }, logging: { level: "error" }
}));
async function run(args: string[], notice: string): Promise<void> {
  let output = "";
  const decoder = new TextDecoder();
  const terminal = new Bun.Terminal({ cols: 110, rows: 32, data(_terminal, chunk) { output += decoder.decode(chunk, { stream: true }); } });
  const child = Bun.spawn([...command, "--cwd", workspace, ...args], {
    cwd: root, terminal, env: { ...process.env, HOME: home, USERPROFILE: home, TERM: "xterm-256color", CI: "1", ZCODE_TUI_MODE: "regular" }
  });
  const plain = () => output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\r/g, "");
  const wait = async (predicate: () => boolean, label: string) => {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (predicate()) return;
      if (child.exitCode !== null) break;
      await Bun.sleep(30);
    }
    throw new Error(`Missing ${label}: ${plain().slice(-4500)}`);
  };
  try {
    await wait(() => plain().includes(notice) && plain().includes(custom) && plain().includes("prompt.txt"), "prompt notice and preview");
    const before = systems.length;
    terminal.write("hello\r");
    await wait(() => systems.length > before && plain().includes("OK"), "model response");
    if (JSON.stringify(systems.at(-1)) !== JSON.stringify([custom])) throw new Error("Outgoing system prompt did not match snapshot.");
    await Bun.sleep(100);
    terminal.write("/exit\r");
    await wait(() => child.exitCode !== null, "clean TUI shutdown");
    if (await child.exited !== 0) throw new Error(`TUI exit failure: ${plain().slice(-3000)}`);
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    terminal.close();
  }
}
try {
  await run(["--system-prompt-file", promptPath], "Custom system prompt active");
  const snapshots = await readdir(join(home, ".zcode/cli/system-prompts"));
  if (snapshots.length !== 1) throw new Error(`Expected one session, got ${snapshots.length}`);
  const session = { id: snapshots[0]!.replace(/\.json$/u, "") };
  await rm(promptPath);
  await run(["--resume", session.id], "Custom system prompt restored");
  console.log("System prompt TUI startup, preview, snapshot and resume smoke test passed.");
} finally {
  server.stop(true);
  await rm(home, { recursive: true, force: true });
}
