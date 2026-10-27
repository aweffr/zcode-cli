import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeCliOptionType } from "./runtime-capabilities.ts";

/** Resolve launcher-only options before handing the remaining argv to the runtime. */
export function resolveSystemPromptArgs(
  args: string[],
  cwd = process.cwd(),
  optionTypes: Readonly<Record<string, RuntimeCliOptionType>> = {}
): { args: string[]; prompt?: string; source?: string } {
  const forwarded: string[] = [];
  let prompt: string | undefined;
  let source: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") {
      forwarded.push(...args.slice(index));
      break;
    }
    const separator = argument.indexOf("=");
    const option = separator < 0 ? argument : argument.slice(0, separator);
    if (option !== "--system-prompt" && option !== "--system-prompt-file") {
      forwarded.push(argument);
      if (separator < 0 && (option === "--prompt" || option === "-p"
        || optionTypes[option.slice(2)] === "string") && index + 1 < args.length) {
        forwarded.push(args[++index]!);
      }
      continue;
    }
    if (prompt !== undefined) throw new Error("Use only one of --system-prompt or --system-prompt-file.");
    const value = separator < 0 ? args[++index] : argument.slice(separator + 1);
    if (value === undefined || (separator < 0 && value.startsWith("--"))) {
      throw new Error(`${option} requires a value.`);
    }
    if (option === "--system-prompt-file") {
      const path = resolve(cwd, value);
      source = path;
      try {
        prompt = readFileSync(path, "utf8");
      } catch (error) {
        throw new Error(`Unable to read system prompt file ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      prompt = value;
    }
    // The runtime treats a blank custom prompt as "use defaults".
    if (!prompt.trim()) throw new Error("System prompt must not be empty.");
  }
  return { args: forwarded, ...(prompt !== undefined ? { prompt } : {}), ...(source ? { source } : {}) };
}
