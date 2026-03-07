import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

describe("public UI foundation", () => {
  it("renders shadcn button primitives in the test environment", () => {
    render(<Button>Open modal</Button>);

    expect(screen.getByRole("button", { name: "Open modal" })).toBeInTheDocument();
  });

  it("merges utility classes through cn", () => {
    expect(cn("px-4", undefined, "py-2")).toContain("px-4");
    expect(cn("px-4", undefined, "py-2")).toContain("py-2");
  });
});
