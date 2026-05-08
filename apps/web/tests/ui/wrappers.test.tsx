import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "../../src/components/ui/field";
import { IconButton } from "../../src/components/ui/icon-button";
import { MediaFrame } from "../../src/components/ui/media-frame";
import { Pill } from "../../src/components/ui/pill";
import { Surface } from "../../src/components/ui/surface";

describe("ui wrappers", () => {
  it("Surface renders as div with card recipe classes", () => {
    render(<Surface kind="card" data-testid="s">child</Surface>);
    const el = screen.getByTestId("s");
    expect(el.className).toContain("rounded-[2rem]");
    expect(el.className).toContain("bg-surface");
  });

  it("MediaFrame applies aspect", () => {
    render(<MediaFrame aspect="16/9" data-testid="m" />);
    expect(screen.getByTestId("m").className).toContain("aspect-[16/9]");
  });

  it("IconButton is square h-10/w-10", () => {
    render(<IconButton aria-label="x" data-testid="b" />);
    const el = screen.getByTestId("b");
    expect(el.className).toContain("h-10");
    expect(el.className).toContain("w-10");
  });

  it("Pill active uses surface bg", () => {
    render(<Pill active data-testid="p">x</Pill>);
    expect(screen.getByTestId("p").className).toContain("bg-surface");
  });

  it("Field display uses display kind", () => {
    render(<Field kind="display" data-testid="f">v</Field>);
    expect(screen.getByTestId("f").className).toContain("rounded-[1.25rem]");
  });
});
