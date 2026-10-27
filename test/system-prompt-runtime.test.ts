import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { patchRuntimeSystemPrompt } from "../scripts/sync-runtime.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("system prompt runtime patch remains idempotent", async () => {
  const source = await Bun.file(join(root, "vendor/zcode.cjs")).text();
  const patched = patchRuntimeSystemPrompt(source);
  expect(patchRuntimeSystemPrompt(patched)).toBe(patched);
  expect(() => patchRuntimeSystemPrompt("incompatible runtime")).toThrow(/incompatible/);
});

test("launcher replaces outgoing system messages verbatim for inline/file prompts and resumed sessions", async () => {
  const node = Bun.which("node")!;
  const home = await mkdtemp(join(tmpdir(), "zcode-prompt-runtime-"));
  directories.push(home);
  const workspace = join(home, "workspace");
  await mkdir(join(home, ".zcode/cli"), { recursive: true });
  await mkdir(workspace);
  await writeFile(join(workspace, "AGENTS.md"), "PROJECT_INSTRUCTIONS_SHOULD_NOT_ENTER_CUSTOM_SYSTEM");
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests.push(await request.json() as typeof requests[number]);
      const data = { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture" };
      return new Response([
        `data: ${JSON.stringify({ ...data, choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ ...data, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 1, total_tokens: 101 } })}\n\n`,
        "data: [DONE]\n\n"
      ].join(""), { headers: { "Content-Type": "text/event-stream" } });
    }
  });
  const config = {
    provider: { bigmodel: { kind: "openai-compatible", options: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "fixture" }, models: { fixture: { limit: { context: 1000000 } } } } },
    model: { main: "bigmodel/fixture", lite: "bigmodel/fixture" },
    features: { compact: false, memory: false, skill: false, subagent: false, mcp: false },
    memory: { use: false, write: false }, plugins: { enabled: false }, skills: { enabled: false },
    logging: { level: "error" }
  };
  await writeFile(join(home, ".zcode/cli/config.json"), JSON.stringify(config));
  const run = async (args: string[]) => {
    const child = Bun.spawn([node, join(root, "bin/zcode.js"), "--cwd", workspace, "--prompt", "Reply OK", "--json", ...args], {
      cwd: home,
      env: { ...process.env, HOME: home, USERPROFILE: home, ZCODE_NODE: node },
      stdout: "pipe", stderr: "pipe"
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    return JSON.parse(stdout) as { sessionId: string };
  };
  try {
    const custom = "  You are a custom assistant.\n只返回 OK。\n";
    const first = await run(["--system-prompt", custom]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    await run(["--resume", first.sessionId]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    await run(["--resume", first.sessionId, "--system-prompt", "A different startup prompt"]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    await writeFile(join(home, "prompt.txt"), custom);
    const fileSession = await run(["--system-prompt-file", "prompt.txt"]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    await writeFile(join(home, "prompt.txt"), "modified file");
    await rm(join(home, "prompt.txt"));
    await run(["--resume", fileSession.sessionId]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    await run(["--continue"]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system"))
      .toEqual([{ role: "system", content: custom }]);
    const defaultSession = await run([]);
    await run(["--resume", defaultSession.sessionId, "--system-prompt", "must not change saved default"]);
    expect(requests.at(-1)!.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n"))
      .toContain("You are ZCode");
  } finally {
    server.stop(true);
  }
}, 60000);
