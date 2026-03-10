import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminImportsPanel } from "@/components/public/AdminImportsPanel";

describe("AdminImportsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dedicated backup controls", async () => {
    render(<AdminImportsPanel />);

    expect(screen.getByText("IMPORT BACKUP")).toBeInTheDocument();
    expect(screen.getByLabelText("백업 ZIP 파일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DB 저장 ZIP 다운로드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ZIP 불러와 DB 복원" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "ZIP 불러와 DB 복원" }));

    await waitFor(() => {
      expect(
        screen.getByText("DB 복원 완료: 게시글 2, 미디어 3, 시리즈 썸네일 1"),
      ).toBeInTheDocument();
    });
  });
});
