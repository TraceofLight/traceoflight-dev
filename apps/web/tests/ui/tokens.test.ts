import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tokens.css", () => {
  const css = readFileSync(
    resolve(__dirname, "../../src/styles/tokens.css"),
    "utf8",
  );

  const expected = [
    "--success:",
    "--success-foreground:",
    "--success-soft:",
    "--warning:",
    "--warning-foreground:",
    "--warning-soft:",
    "--info:",
    "--info-foreground:",
    "--info-soft:",
    "--surface:",
    "--surface-strong:",
    "--surface-soft:",
    "--surface-border:",
    "--shadow-pill:",
    "--shadow-card:",
    "--shadow-card-hover:",
    "--shadow-modal:",
  ];

  it.each(expected)("declares %s in :root", (token) => {
    const root = css.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(root).toContain(token);
  });

  it.each(expected)("redeclares %s in :root[data-theme='dark']", (token) => {
    const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(dark).toContain(token);
  });
});
