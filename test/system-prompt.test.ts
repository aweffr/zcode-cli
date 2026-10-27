import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSystemPromptArgs } from "../src/system-prompt.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("system prompt startup options", () => {
  test("preserves the exact inline string and other arguments", () => {
    expect(resolveSystemPromptArgs(["--system-prompt", "  中文\nRules\n", "--prompt", "hello"]))
      .toEqual({ args: ["--prompt", "hello"], prompt: "  中文\nRules\n" });
    expect(resolveSystemPromptArgs(["--system-prompt=a=b"])).toEqual({ args: [], prompt: "a=b" });
  });

  test("reads UTF-8 files relative to the invocation directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zcode-system-prompt-"));
    directories.push(directory);
    await writeFile(join(directory, "prompt.txt"), "文件提示词\n\n");
    expect(resolveSystemPromptArgs(["--system-prompt-file", "prompt.txt", "--cwd", "/tmp"], directory))
      .toEqual({ args: ["--cwd", "/tmp"], prompt: "文件提示词\n\n", source: join(directory, "prompt.txt") });
    expect(resolveSystemPromptArgs([`--system-prompt-file=${join(directory, "prompt.txt")}`]).prompt)
      .toBe("文件提示词\n\n");
  });

  test("rejects conflicting options, missing values, blank prompts and unreadable files", () => {
    expect(() => resolveSystemPromptArgs(["--system-prompt", "a", "--system-prompt-file", "b"]))
      .toThrow(/only one/i);
    expect(() => resolveSystemPromptArgs(["--system-prompt"])).toThrow(/requires/i);
    expect(() => resolveSystemPromptArgs(["--system-prompt", "--json"])).toThrow(/requires/i);
    expect(() => resolveSystemPromptArgs(["--system-prompt=  "])).toThrow(/empty/i);
    expect(() => resolveSystemPromptArgs(["--system-prompt-file", "/missing/prompt.txt"]))
      .toThrow(/read/i);
  });

  test("does not interpret prompt values or arguments after -- as startup options", () => {
    expect(resolveSystemPromptArgs(["--prompt", "--system-prompt", "--json"]))
      .toEqual({ args: ["--prompt", "--system-prompt", "--json"] });
    expect(resolveSystemPromptArgs(["--", "--system-prompt", "literal"]))
      .toEqual({ args: ["--", "--system-prompt", "literal"] });
  });
});
