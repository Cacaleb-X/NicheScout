import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

export function loadLocalEnv(path = resolve(".env")): void {
  if (loaded) return;
  loaded = true;
  if (existsSync(path)) process.loadEnvFile(path);
}
