import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

describe("public UI foundation", () => {
  it("renders shadcn button primitives in the test environment", () => {
    render(<Button>Open modal</Button>);

    const button = screen.getByRole("button", { name: "Open modal" });

    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("select-none");
  });

  it("merges utility classes through cn", () => {
    expect(cn("px-4", undefined, "py-2")).toContain("px-4");
    expect(cn("px-4", undefined, "py-2")).toContain("py-2");
  });

  it("renders badge primitives without selectable label text", () => {
    render(<Badge>Database</Badge>);

    expect(screen.getByText("Database")).toHaveClass("select-none");
  });
});
