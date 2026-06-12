import { describe, expect, it } from "bun:test";
import {
  fmtTokens,
  fmtDurationShort,
  contextBar,
  contextPercentColor,
  makeSeparator,
  detectSepState,
  makeRainRow,
  rainVisibleWidth,
} from "./render.js";

describe("fmtTokens", () => {
  it("formats small numbers", () => {
    expect(fmtTokens(0)).toBe("0");
    expect(fmtTokens(42)).toBe("42");
    expect(fmtTokens(999)).toBe("999");
  });

  it("formats thousands with k", () => {
    expect(fmtTokens(1000)).toBe("1.0k");
    expect(fmtTokens(1500)).toBe("1.5k");
    expect(fmtTokens(99999)).toBe("100.0k");
  });

  it("formats millions with M", () => {
    expect(fmtTokens(1_000_000)).toBe("1.0M");
    expect(fmtTokens(2_500_000)).toBe("2.5M");
  });
});

describe("fmtDurationShort", () => {
  it("formats milliseconds", () => {
    expect(fmtDurationShort(500)).toBe("500ms");
    expect(fmtDurationShort(999)).toBe("999ms");
  });

  it("formats seconds", () => {
    expect(fmtDurationShort(1000)).toBe("1s");
    expect(fmtDurationShort(30000)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(fmtDurationShort(60000)).toBe("1m 0s");
    expect(fmtDurationShort(90000)).toBe("1m 30s");
  });

  it("formats hours", () => {
    expect(fmtDurationShort(3_600_000)).toBe("1h 0m");
    expect(fmtDurationShort(5_400_000)).toBe("1h 30m");
  });
});

describe("contextBar", () => {
  it("returns correct length", () => {
    const bar = contextBar(50, 10);
    const visible = bar.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(10);
  });

  it("shows empty bar at 0%", () => {
    const bar = contextBar(0, 4);
    const visible = bar.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible).toBe("░░░░");
  });

  it("shows full bar at 100%", () => {
    const bar = contextBar(100, 4);
    const visible = bar.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible).toBe("████");
  });

  it("clamps values", () => {
    const barNeg = contextBar(-10, 4);
    const visibleNeg = barNeg.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visibleNeg.length).toBe(4);

    const barOver = contextBar(200, 4);
    const visibleOver = barOver.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visibleOver).toBe("████");
  });
});

describe("contextPercentColor", () => {
  it("returns green below 70%", () => {
    const color = contextPercentColor(50);
    expect(color).toContain("57;255;20");
  });

  it("returns orange at 70-84%", () => {
    const color = contextPercentColor(75);
    expect(color).toContain("255;107;0");
  });

  it("returns pink at 85%+", () => {
    const color = contextPercentColor(90);
    expect(color).toContain("255;0;144");
  });
});

describe("makeSeparator", () => {
  it("returns correct length", () => {
    const sep = makeSeparator("idle", 20);
    const visible = sep.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(20);
  });

  it("idle is gray", () => {
    const sep = makeSeparator("idle", 5);
    expect(sep).toContain("─");
  });

  it("waiting has breathing color", () => {
    const sep = makeSeparator("waiting", 5);
    expect(sep).toContain("─");
    expect(sep).toContain("\x1b[38;2;");
  });

  it("done has rainbow", () => {
    const sep = makeSeparator("done", 5);
    expect(sep).toContain("─");
  });
});

describe("detectSepState", () => {
  const baseStdin = {
    output_style: { name: "" },
  } as any;
  const baseTranscript = {
    tools: [],
    agents: [],
    todos: [],
  } as any;

  it("returns waiting when output_style is waiting_input", () => {
    const stdin = { ...baseStdin, output_style: { name: "waiting_input" } };
    expect(detectSepState(stdin, baseTranscript)).toBe("waiting");
  });

  it("returns waiting when output_style is ask_user", () => {
    const stdin = { ...baseStdin, output_style: { name: "ask_user" } };
    expect(detectSepState(stdin, baseTranscript)).toBe("waiting");
  });

  it("returns done when all todos completed", () => {
    const transcript = {
      ...baseTranscript,
      todos: [{ status: "completed" }, { status: "completed" }],
    };
    const state = detectSepState(baseStdin, transcript);
    expect(state).toBe("done");
  });

  it("returns idle when no signals active", () => {
    expect(detectSepState(baseStdin, baseTranscript)).not.toBe("waiting");
  });
});

describe("makeRainRow", () => {
  it("returns non-empty string", () => {
    const row = makeRainRow(0, Date.now(), 3);
    expect(row.length).toBeGreaterThan(0);
  });

  it("contains ANSI color codes", () => {
    const row = makeRainRow(0, Date.now(), 3);
    expect(row).toContain("\x1b[38;2;");
    expect(row).toContain("\x1b[0m");
  });

  it("produces different output at different times", () => {
    const row1 = makeRainRow(0, 1000, 3);
    const row2 = makeRainRow(0, 2000, 3);
    expect(row1).not.toBe(row2);
  });

  it("produces different output for different rows", () => {
    const now = Date.now();
    const row0 = makeRainRow(0, now, 3);
    const row1 = makeRainRow(1, now, 3);
    expect(row0).not.toBe(row1);
  });
});

describe("rainVisibleWidth", () => {
  it("returns 11 for 6 cols (6 chars + 5 spaces)", () => {
    expect(rainVisibleWidth()).toBe(11);
  });
});
