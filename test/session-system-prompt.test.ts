import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSessionSystemPrompt } from "../src/session-system-prompt.ts";
const roots: string[] = [];
afterEach(async () => { for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true }); });

test("resuming restores the saved content and source instead of the new process prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-session-prompt-")); roots.push(root);
  const options = { cliStorageRoot: root, sessionId: "sess_a", env: { ZCODE_CLI_SYSTEM_PROMPT: "original\n", ZCODE_CLI_SYSTEM_PROMPT_SOURCE: "/tmp/original.txt" } };
  expect(resolveSessionSystemPrompt(options)).toEqual({ content: "original\n", source: "/tmp/original.txt", resumed: false });
  expect(resolveSessionSystemPrompt({ ...options, resume: true, env: {} })).toEqual({ content: "original\n", source: "/tmp/original.txt", resumed: true });
  expect(resolveSessionSystemPrompt({ ...options, resume: true, env: { ZCODE_CLI_SYSTEM_PROMPT: "different" } })?.content).toBe("original\n");
  expect(resolveSessionSystemPrompt({ ...options, sessionId: "sess_b", env: {} })).toBeUndefined();
  expect(resolveSessionSystemPrompt({ ...options, sessionId: "sess_b", resume: true })).toBeUndefined();
});

test("explicit child-agent prompts keep their own behavior", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-child-prompt-")); roots.push(root);
  expect(resolveSessionSystemPrompt({ cliStorageRoot: root, sessionId: "child", currentSystemPrompt: "child prompt", env: { ZCODE_CLI_SYSTEM_PROMPT: "parent prompt" } })).toBeUndefined();
});
