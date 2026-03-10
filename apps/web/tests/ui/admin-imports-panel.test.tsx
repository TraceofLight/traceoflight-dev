import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminImportsPanel } from "@/components/public/AdminImportsPanel";

describe("AdminImportsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dedicated backup controls", async () => {
    render(<AdminImportsPanel />);

    const downloadButton = screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" });
    const chooseFileButton = screen.getByRole("button", { name: "ZIP 파일 선택" });
    const restoreButton = screen.getByRole("button", { name: "ZIP 불러와 DB 복원" });

    expect(screen.getByText("서비스 중인 내용 Save & Load")).toBeInTheDocument();
    expect(screen.getByText("현재 상태 저장")).toBeInTheDocument();
    expect(screen.getByText("백업 ZIP으로 복원")).toBeInTheDocument();
    expect(screen.getByText("복원 전 체크")).toBeInTheDocument();
    expect(
      screen.queryByText("복원 테스트 전에는 항상 최신 ZIP을 먼저 받아 두는 편이 안전합니다."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("백업 ZIP 파일")).toBeInTheDocument();
    expect(chooseFileButton).toBeInTheDocument();
    expect(screen.getByText("선택된 파일이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("백업 ZIP 파일")).not.toBeInTheDocument();
    expect(
      screen.queryByText("`.zip` 형식의 백업 파일만 업로드할 수 있습니다."),
    ).not.toBeInTheDocument();
    expect(downloadButton).toBeInTheDocument();
    expect(restoreButton).toBeInTheDocument();
    expect(
      screen.queryByText("현재 DB의 게시글/미디어를 ZIP으로 저장하거나 ZIP 파일로 복원하세요."),
    ).not.toBeInTheDocument();
    expect(downloadButton).toHaveClass("border-white/80");
    expect(downloadButton).toHaveClass("hover:border-sky-300/90");
    expect(chooseFileButton).toHaveClass("border-white/80");
    expect(chooseFileButton).toHaveClass("hover:border-sky-300/90");
    expect(restoreButton).toHaveClass("border-white/80");
    expect(restoreButton).toHaveClass("hover:border-sky-300/90");
    expect(restoreButton).toHaveClass("hover:text-sky-700");
  });

  it("shows restore summary after a successful upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        restored_posts: 2,
        restored_media: 3,
        restored_series_overrides: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminImportsPanel />);

    const file = new File(["zip"], "backup.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("백업 ZIP 파일"), {
      target: { files: [file] },
    });
    expect(screen.getByText("backup.zip")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ZIP 불러와 DB 복원" }));

    await waitFor(() => {
      expect(
        screen.getByText("DB 복원 완료: 게시글 2, 미디어 3, 시리즈 썸네일 1"),
      ).toBeInTheDocument();
    });
  });

  it("shows download status near the save action after starting a backup download", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["zip"], { type: "application/zip" }),
      headers: new Headers({
        "content-disposition": 'attachment; filename="backup.zip"',
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    render(<AdminImportsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" }));

    await waitFor(() => {
      expect(screen.getByText("DB 백업 ZIP 다운로드를 시작했습니다.")).toBeInTheDocument();
    });
  });
});
