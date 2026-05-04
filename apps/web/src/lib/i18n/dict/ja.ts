import type { Dictionary } from "./ko";

export const ja: Dictionary = {
  nav: { blog: "ブログ", projects: "プロジェクト", series: "シリーズ" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "続きを読む", backToList: "一覧へ戻る",
    save: "保存", cancel: "キャンセル", delete: "削除", edit: "編集",
    search: "検索", loadMore: "もっと読み込む", retry: "再試行", viewAll: "すべて表示",
  },
  empty: {
    noPosts: "記事がありません。", noResults: "検索結果がありません。",
    noProjects: "プロジェクトがありません。", noSeries: "シリーズがありません。",
  },
  blogPost: {
    backToBlog: "ブログへ戻る", viewAllPosts: "すべての記事を見る",
    relatedSeries: "このシリーズの他の記事",
    publishedOn: "公開日", updatedOn: "更新日", minRead: "分で読了",
    seriesNavLabel: "シリーズナビゲーション",
    prevPost: "前の記事",
    nextPost: "次の記事",
    noExcerpt: "要約なし",
  },
  archiveFilters: {
    searchPlaceholder: "記事を検索",
    searchLabel: "記事を検索",
    sortLabel: "並び替え",
    sort: { latest: "新しい順", oldest: "古い順", title: "タイトル順" },
    visibility: { all: "すべて", public: "公開", private: "非公開" },
    privatePost: "非公開記事",
    publicPost: "公開記事",
    totalCountPrefix: "全 ",
    totalCountSuffix: " 件の記事",
    commentCount: "件",
    loadingPosts: "記事を読み込んでいます。",
    loadError: "記事の読み込みに失敗しました。",
    loadMoreError: "追加記事の読み込みに失敗しました。",
    coverImageAlt: "カバー画像",
    writePost: "記事を書く",
    readPost: "読む",
    noPosts: "まだ記事がありません。",
    archiveDescription: "TraceofLightの開発と様々な話のアーカイブ",
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "ページが見つかりません",
    description: "お探しのページは存在しないか、移動した可能性があります。",
    cta: "ホームへ戻る",
  },
  projectDetail: {
    role: "役割", period: "期間",
    highlights: "ハイライト", resources: "リソース",
  },
  seriesDetail: {
    postCount: "記事数", empty: "このシリーズにはまだ記事がありません。",
  },
  comments: {
    title: "コメント", placeholder: "コメントを書く",
    submit: "コメント送信", empty: "まだコメントがありません。",
    deleteConfirm: "本当に削除しますか?",
  },
  home: {
    intro: "こんにちは、TraceofLightです。",
    recentPosts: "最近の記事", seeAllPosts: "すべての記事を見る",
    viewProjects: "プロジェクトを見る",
    viewBlog: "ブログを見る",
    noSeriesYet: "まだシリーズが登録されていません。",
    noPostsYet: "まだ公開された記事がありません。",
    pageTitle: "ゲーム開発 · グラフィックスプログラミングアーカイブ",
    sectionTitles: {
      education: "学歴",
      license: "資格",
      military: "兵役",
      career: "経歴",
      experience: "経験",
      award: "受賞",
    },
    techStackTitles: {
      language: "言語",
      gameDev: "ゲーム開発",
      scm: "SCM",
      web: "Web",
    },
    resume: {
      education: [
        "2026.02 KRAFTON Jungleゲームテックラボ 第2期 修了",
        "2023.08 サムスン青年SWアカデミー（SSAFY）第8期 修了",
        "2022.08 延世大学校 都市工学科 卒業",
      ],
      license: ["2022.12 SQL開発者（SQLD）"],
      military: ["2017.06 ～ 2019.05 韓国空軍 兵長 満期除隊"],
      career: ["2023.10 ～ 2024.11 TmaxTibero DB本部 研究員"],
      experience: [
        {
          period: "2023.10 ～ 2024.11",
          main: "Cloud-Native次世代DB開発プロジェクト参加",
        },
      ],
      award: [
        {
          main: "2021.11 都市工学科 総合設計作品展 優秀賞",
          sub: "未来モビリティと連携した高陽市の発展方向企画案\n：城南市との比較分析",
        },
      ],
    },
  },
} as const;
