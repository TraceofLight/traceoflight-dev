import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FooterAdminModal } from "@/components/public/FooterAdminModal";
import { PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS } from "@/lib/ui-effects";

describe("FooterAdminModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login dialog contents for anonymous viewers", async () => {
    render(
      <FooterAdminModal
        adminNextPath="/blog"
        shouldOpenOnLoad={false}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Admin Login" });
    expect(trigger).toHaveClass("border-white/80");
    expect(trigger).toHaveClass("bg-white/88");
    expect(trigger).toHaveClass("shadow-[0_10px_30px_rgba(15,23,42,0.08)]");
    expect(trigger).toHaveClass("hover:-translate-y-0.5");

    fireEvent.click(trigger);

    expect(await screen.findByText("ADMIN LOGIN")).toBeInTheDocument();
    expect(screen.getByLabelText("아이디")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByText("로그인 정보를 입력해 주세요.")).toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: "로그인" });
    expect(submitButton.className).toContain(
      PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS.split(" ")[0],
    );
    expect(submitButton.className).toContain("border-sky-200/70");
    expect(submitButton.className).toContain("text-sky-700");
    expect(
      screen.queryByText("관리자 인증 후 다음 화면으로 이동합니다."),
    ).not.toBeInTheDocument();
  });

  it("can open and close the login dialog when requested on load", async () => {
    render(
      <FooterAdminModal
        adminNextPath="/"
        shouldOpenOnLoad
      />,
    );

    expect(
      screen.getByRole("button", { name: "Admin Login", hidden: true }),
    ).toHaveClass("text-muted-foreground");
    expect(await screen.findByText("ADMIN LOGIN")).toBeInTheDocument();
    expect(screen.getByLabelText("아이디")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("ADMIN LOGIN")).not.toBeInTheDocument();
    });
  });
});
