import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import ThemeToggle from "@/components/public/ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  it("toggles the document theme and persists the selected mode", () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole("switch", { name: "다크 모드 전환" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle.className).toContain("bg-white/86");
    expect(toggle.querySelectorAll("svg")).toHaveLength(3);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("traceoflight-theme")).toBe("dark");
    expect(toggle.className).toContain("bg-slate-900/92");
    expect(toggle.innerHTML).toContain("translate-x-10");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("traceoflight-theme")).toBe("light");
  });
});
