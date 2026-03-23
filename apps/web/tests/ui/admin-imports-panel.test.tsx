import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminImportsPanel } from "@/components/public/AdminImportsPanel";

describe("AdminImportsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_count: 0,
        items: [],
      }),
    }));
  });

  it("renders dedicated backup controls", async () => {
    render(<AdminImportsPanel />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const downloadButton = screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" });
    const chooseFileButton = screen.getByRole("button", { name: "ZIP 파일 선택" });
    const restoreButton = screen.getByRole("button", { name: "ZIP 불러와 DB 복원" });
    const choosePortfolioButton = screen.getByRole("button", { name: "포트폴리오 PDF 선택" });
    const uploadPortfolioButton = screen.getByRole("button", { name: "Portfolio PDF 업로드" });
    const chooseResumeButton = screen.getByRole("button", { name: "이력서 PDF 선택" });
    const uploadResumeButton = screen.getByRole("button", { name: "Resume PDF 업로드" });
    const saveSiteProfileButton = screen.getByRole("button", { name: "사용자 정보 저장" });

    expect(screen.getByText("User Info")).toBeInTheDocument();
    expect(screen.getByText("사용자 정보")).toBeInTheDocument();
    expect(screen.getByText("footer 메일/GitHub 버튼에 연결되는 주소를 바로 수정할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("Footer 메일 주소")).toHaveValue("rickyjun96@gmail.com");
    expect(screen.getByLabelText("Footer GitHub 주소")).toHaveValue("https://github.com/TraceofLight");
    expect(screen.getByRole("link", { name: "메일 열기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub 열기" })).toBeInTheDocument();
    expect(screen.getByText("footer 메일 버튼은 mailto:, GitHub 버튼은 입력한 URL로 연결됩니다.")).toBeInTheDocument();
    expect(screen.getByText("Backup Utility")).toBeInTheDocument();
    expect(screen.getByText("서비스 중인 내용 Save & Load")).toBeInTheDocument();
    expect(screen.getByText("PDF Utility")).toBeInTheDocument();
    expect(screen.getByText("PDF 파일 관리")).toBeInTheDocument();
    expect(screen.getByText("현재 상태 저장")).toBeInTheDocument();
    expect(screen.getByText("백업 ZIP으로 복원")).toBeInTheDocument();
    expect(screen.getAllByText("Portfolio PDF")).toHaveLength(1);
    expect(screen.getAllByText("Resume PDF")).toHaveLength(1);
    expect(screen.getByText("포트폴리오 파일 교체")).toBeInTheDocument();
    expect(screen.getByText("이력서 파일 교체")).toBeInTheDocument();
    expect(screen.queryByText("이력서 PDF 관리")).not.toBeInTheDocument();
    expect(
      screen.queryByText("바깥 공개 경로는 닫혀 있지만, 내부 관리자 경로로는 업로드와 교체를 계속 진행할 수 있습니다."),
    ).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("포트폴리오 PDF 파일")).toBeInTheDocument();
    expect(screen.getByLabelText("이력서 PDF 파일")).toBeInTheDocument();
    expect(screen.getByText("현재 제공 중인 포트폴리오 PDF가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 제공 중인 이력서 PDF가 없습니다.")).toBeInTheDocument();
    expect(choosePortfolioButton).toBeInTheDocument();
    expect(chooseResumeButton).toBeInTheDocument();
    expect(uploadResumeButton).toBeInTheDocument();
    expect(uploadPortfolioButton).toBeInTheDocument();
    expect(downloadButton).toBeInTheDocument();
    expect(restoreButton).toBeInTheDocument();
    expect(saveSiteProfileButton).toBeInTheDocument();
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
    expect(choosePortfolioButton).toHaveClass("border-white/80");
    expect(uploadPortfolioButton).toHaveClass("border-white/80");
    expect(chooseResumeButton).toHaveClass("border-white/80");
    expect(uploadResumeButton).toHaveClass("border-white/80");
    expect(screen.queryByRole("button", { name: "포트폴리오 PDF 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이력서 PDF 삭제" })).not.toBeInTheDocument();
  });

  it("saves footer site profile inputs through the internal route", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl.includes("/internal-api/admin/comments")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_count: 0,
            items: [],
          }),
        });
      }

      if (requestUrl.includes("/internal-api/site-profile")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            email: "hello@traceoflight.dev",
            github_url: "https://github.com/TraceofLight/dev",
          }),
        });
      }

      throw new Error(`unexpected request: ${requestUrl} ${JSON.stringify(init ?? {})}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminImportsPanel />);

    fireEvent.change(screen.getByLabelText("Footer 메일 주소"), {
      target: { value: "hello@traceoflight.dev" },
    });
    fireEvent.change(screen.getByLabelText("Footer GitHub 주소"), {
      target: { value: "https://github.com/TraceofLight/dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "사용자 정보 저장" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/internal-api/site-profile",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          email: "hello@traceoflight.dev",
          githubUrl: "https://github.com/TraceofLight/dev",
        }),
      }),
    );
    expect(screen.getByText("footer 사용자 정보를 저장했습니다.")).toBeInTheDocument();
    expect(screen.getByText("hello@traceoflight.dev")).toBeInTheDocument();
    expect(screen.getAllByText("https://github.com/TraceofLight/dev").length).toBeGreaterThan(0);
  });

  it("shows separate PDF availability state and delete controls", async () => {
    render(<AdminImportsPanel initialPortfolioAvailable initialResumeAvailable={false} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("현재 제공 중인 포트폴리오 PDF가 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 제공 중인 이력서 PDF가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "포트폴리오 PDF 삭제" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이력서 PDF 삭제" })).not.toBeInTheDocument();
  });

  it("shows restore progress in the action button and resets after success", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.includes("/internal-api/admin/comments")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_count: 0,
            items: [],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          restored_posts: 2,
          restored_media: 3,
          restored_series_overrides: 1,
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminImportsPanel />);

    const file = new File(["zip"], "backup.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("백업 ZIP 파일"), {
      target: { files: [file] },
    });
    expect(screen.getByText("backup.zip")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ZIP 불러와 DB 복원" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", {
        name: "DB 복원 완료: 게시글 2, 미디어 3, 시리즈 1",
      }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(
      screen.getByRole("button", {
        name: "ZIP 불러와 DB 복원",
      }),
    ).toBeInTheDocument();
  });

  it("shows save progress in the action button and resets after success", async () => {
    vi.useFakeTimers();
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.includes("/internal-api/admin/comments")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_count: 0,
            items: [],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(["zip"], { type: "application/zip" }),
        headers: new Headers({
          "content-disposition": 'attachment; filename="backup.zip"',
        }),
      });
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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", { name: "DB 저장 ZIP 다운로드 시작" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(
      screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" }),
    ).toBeInTheDocument();

    anchorClickMock.mockRestore();
  });
});
