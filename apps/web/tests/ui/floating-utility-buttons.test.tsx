import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import FloatingUtilityButtons from "@/components/public/FloatingUtilityButtons";

describe("FloatingUtilityButtons", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
  });

  it("renders utility controls without visitor summary content", () => {
    render(<FloatingUtilityButtons />);

    expect(screen.queryByText("Powered by TraceofLight")).not.toBeInTheDocument();
    expect(screen.queryByText(/Today \d+ \/ Total \d+/)).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "다크 모드 전환" })).toBeInTheDocument();
  });

  it("reveals the scroll-top button after scrolling", () => {
    render(<FloatingUtilityButtons />);

    const button = screen.getByRole("button", { name: "맨 위로 이동" });
    expect(button.className).toContain("opacity-0");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 320,
    });
    fireEvent.scroll(window);

    expect(button.className).toContain("opacity-100");
  });
});
