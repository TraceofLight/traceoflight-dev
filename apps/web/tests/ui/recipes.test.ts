import { describe, expect, it } from "vitest";
import {
  action,
  field,
  mediaFrame,
  overlay,
  pill,
  statusBadge,
  surface,
} from "../../src/lib/ui/recipes";

const FORBIDDEN = [/bg-white\//, /bg-slate-\d/, /border-white\//, /shadow-\[/];

const ALL_OUTPUTS = [
  surface(),
  surface({ kind: "section" }),
  surface({ kind: "section", tone: "strong" }),
  surface({ kind: "panel" }),
  surface({ kind: "panel", tone: "soft" }),
  surface({ kind: "card" }),
  surface({ kind: "card", interactive: true }),
  surface({ kind: "media" }),
  surface({ kind: "empty" }),
  mediaFrame(),
  mediaFrame({ aspect: "16/9" }),
  action({ variant: "primary" }),
  action({ variant: "primaryOutline" }),
  action({ variant: "dangerOutline" }),
  action({ variant: "surface" }),
  action({ variant: "surface", size: "icon" }),
  action({ variant: "dangerOutline", size: "pill" }),
  pill(),
  pill({ active: true }),
  field(),
  field({ kind: "frame" }),
  field({ kind: "display" }),
  overlay({ kind: "popover" }),
  overlay({ kind: "modal-overlay" }),
  overlay({ kind: "modal-surface" }),
  overlay({ kind: "modal-close" }),
  statusBadge(),
  statusBadge({ tone: "success" }),
  statusBadge({ tone: "warning" }),
  statusBadge({ tone: "danger" }),
  statusBadge({ tone: "info" }),
];

describe("recipes", () => {
  it.each(ALL_OUTPUTS)("output %# uses no raw color/shadow utilities", (out) => {
    for (const pattern of FORBIDDEN) {
      expect(out).not.toMatch(pattern);
    }
  });

  it("surface(card, interactive) includes hover lift", () => {
    expect(surface({ kind: "card", interactive: true })).toMatch(/hover:-translate-y/);
  });

  it("statusBadge(success) uses --success token", () => {
    expect(statusBadge({ tone: "success" })).toMatch(/(bg-success|text-success)/);
  });

  it("action(icon) is square", () => {
    const out = action({ variant: "surface", size: "icon" });
    expect(out).toMatch(/h-10/);
    expect(out).toMatch(/w-10/);
  });
});
