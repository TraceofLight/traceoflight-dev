import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FooterAdminModal } from "@/components/public/FooterAdminModal";

describe("FooterAdminModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders login dialog contents for anonymous viewers", async () => {
    render(
      <FooterAdminModal
        adminNextPath="/blog"
        isAdminViewer={false}
        shouldOpenOnLoad={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Admin Login" }));

    expect(await screen.findByText("ADMIN LOGIN")).toBeInTheDocument();
    expect(screen.getByLabelText("아이디")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByText("로그인 정보를 입력해 주세요.")).toBeInTheDocument();
    expect(
      screen.queryByText("관리자 인증 후 다음 화면으로 이동합니다."),
    ).not.toBeInTheDocument();
  });

  it("renders backup controls for admin viewers and can close the dialog", async () => {
    render(
      <FooterAdminModal
        adminNextPath="/"
        isAdminViewer
        shouldOpenOnLoad
      />,
    );

    expect(await screen.findByText("ADMIN BACKUP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ZIP 불러와 DB 복원" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("ADMIN BACKUP")).not.toBeInTheDocument();
    });
  });
});
