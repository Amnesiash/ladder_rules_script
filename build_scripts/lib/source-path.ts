import path from "node:path";
import { access } from "node:fs/promises";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRuleSourcePath(repoRoot: string): Promise<string> {
  const preferred = path.join(repoRoot, "Rules", "rule_source.txt");
  if (await exists(preferred)) return preferred;
  throw new Error(`rule source file not found: ${preferred}`);
}
