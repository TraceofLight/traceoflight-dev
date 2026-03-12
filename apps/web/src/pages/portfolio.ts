import type { APIRoute } from "astro";

import { requestBackend } from "../lib/backend-api";

export const prerender = false;

function renderPortfolioUnavailableHtml(message: string) {
  const safeMessage = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Portfolio PDF</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at 14% 12%, rgba(147,197,253,.22), transparent 28%),
          radial-gradient(circle at 84% 6%, rgba(191,219,254,.55), transparent 24%),
          linear-gradient(180deg, #f6f9fc 0%, #eef4ff 100%);
        font-family: "Pretendard Variable","Pretendard","Noto Sans KR",sans-serif;
        color: #0f172a;
      }
      main {
        width: min(100%, 34rem);
        border: 1px solid rgba(255,255,255,.8);
        border-radius: 2rem;
        background: rgba(255,255,255,.94);
        box-shadow: 0 28px 70px rgba(15,23,42,.10);
        padding: 2rem;
      }
      h1 { margin: 0 0 .75rem; font-size: 1.75rem; }
      p { margin: 0; line-height: 1.7; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>Portfolio PDF</h1>
      <p>${safeMessage}</p>
    </main>
  </body>
</html>`;
}

export const GET: APIRoute = async () => {
  let response: Response;
  try {
    response = await requestBackend("/portfolio", {
      method: "GET",
    });
  } catch {
    return new Response(
      renderPortfolioUnavailableHtml("포트폴리오 PDF를 불러오지 못했습니다."),
      {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }

  if (response.status === 404) {
    return new Response(
      renderPortfolioUnavailableHtml("등록된 포트폴리오 PDF가 없습니다."),
      {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }

  const payload = await response.arrayBuffer();
  return new Response(payload, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/pdf",
      "content-disposition":
        response.headers.get("content-disposition") ?? 'inline; filename="portfolio.pdf"',
    },
  });
};
