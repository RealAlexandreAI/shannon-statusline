import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getConfigPath, loadConfig } from "./config.js";

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "shannon-statusline-config-"));
  mkdirSync(join(home, ".shannon", "shannon-statusline"), { recursive: true });
  return home;
}

describe("loadConfig", () => {
  it("defaults to rain enabled", () => {
    const home = makeHome();
    expect(loadConfig(home)).toEqual({ rain: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("respects rain false", () => {
    const home = makeHome();
    writeFileSync(getConfigPath(home), JSON.stringify({ rain: false }));
    expect(loadConfig(home)).toEqual({ rain: false });
    rmSync(home, { recursive: true, force: true });
  });

  it("ignores invalid values and malformed JSON", () => {
    const home = makeHome();
    writeFileSync(getConfigPath(home), JSON.stringify({ rain: "no" }));
    expect(loadConfig(home)).toEqual({ rain: true });
    writeFileSync(getConfigPath(home), "{ broken");
    expect(loadConfig(home)).toEqual({ rain: true });
    rmSync(home, { recursive: true, force: true });
  });
});
