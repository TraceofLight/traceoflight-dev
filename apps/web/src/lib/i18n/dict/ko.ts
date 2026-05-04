export const ko = {
  nav: {
    blog: "블로그",
    projects: "프로젝트",
    series: "시리즈",
  },
  footer: {
    copyright: "© TraceofLight",
    builtWith: "Built with Astro",
  },
  buttons: {
    readMore: "더 보기",
    backToList: "목록으로",
    save: "저장하기",
    cancel: "취소",
    delete: "삭제",
    edit: "수정",
    search: "검색",
    loadMore: "더 불러오기",
    retry: "다시 시도",
    viewAll: "전체 보기",
  },
  empty: {
    noPosts: "게시글이 없습니다.",
    noResults: "검색 결과가 없습니다.",
    noProjects: "프로젝트가 없습니다.",
    noSeries: "시리즈가 없습니다.",
  },
  blogPost: {
    backToBlog: "블로그로 돌아가기",
    viewAllPosts: "모든 글 보기",
    relatedSeries: "이 시리즈의 다른 글",
    publishedOn: "작성일",
    updatedOn: "수정일",
    minRead: "분 읽기",
    seriesNavLabel: "시리즈 탐색",
    prevPost: "이전 글",
    nextPost: "다음 글",
    noExcerpt: "요약 없음",
  },
  archiveFilters: {
    searchPlaceholder: "검색어를 입력하세요",
    searchLabel: "포스트 검색",
    sortLabel: "정렬 방식",
    sort: { latest: "최신순", oldest: "오래된순", title: "제목순" },
    visibility: { all: "전체", public: "공개", private: "비공개" },
    privatePost: "비공개 포스트",
    publicPost: "공개 포스트",
    totalCountPrefix: "총 ",
    totalCountSuffix: "개의 포스트",
    commentCount: "개",
    loadingPosts: "포스트를 불러오는 중입니다.",
    loadError: "포스트 목록을 불러오지 못했습니다.",
    loadMoreError: "추가 포스트를 불러오지 못했습니다.",
    coverImageAlt: "대표 이미지",
    writePost: "글 작성",
    readPost: "읽기",
    noPosts: "게시글이 아직 없습니다.",
    archiveDescription: "TraceofLight의 개발과 다양한 이야기 Archive",
  },
  languageToggle: {
    ko: "한국어",
    en: "English",
    ja: "日本語",
    zh: "中文",
  },
  notFound: {
    title: "페이지를 찾을 수 없습니다",
    description: "요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.",
    cta: "홈으로 돌아가기",
  },
  projectDetail: {
    role: "역할",
    period: "기간",
    highlights: "하이라이트",
    resources: "리소스",
  },
  seriesDetail: {
    postCount: "글 개수",
    empty: "이 시리즈에는 아직 글이 없습니다.",
  },
  comments: {
    title: "댓글",
    placeholder: "댓글을 입력하세요",
    submit: "댓글 달기",
    empty: "아직 댓글이 없습니다.",
    deleteConfirm: "정말 삭제하시겠습니까?",
  },
  home: {
    intro: "안녕하세요, TraceofLight입니다.",
    recentPosts: "최근 글",
    seeAllPosts: "모든 글 보기",
    viewProjects: "프로젝트 보기",
    viewBlog: "블로그 보기",
    noSeriesYet: "아직 등록된 시리즈가 없습니다.",
    noPostsYet: "아직 공개된 글이 없습니다.",
    pageTitle: "게임 개발 · 그래픽스 프로그래밍 아카이브",
    sectionTitles: {
      education: "학력",
      license: "자격",
      military: "병역",
      career: "경력",
      experience: "경험",
      award: "수상",
    },
    techStackTitles: {
      language: "언어",
      gameDev: "게임 개발",
      scm: "SCM",
      web: "웹",
    },
    resume: {
      education: [
        "2026.02. 크래프톤 정글 게임테크랩 2기 수료",
        "2023.08. 삼성 청년 SW 아카데미 8기 수료",
        "2022.08. 연세대학교 도시공학과 졸업",
      ],
      license: ["2022.12. SQL 개발자"],
      military: ["2017.06. ~ 2019.05. 공군 병장 만기전역"],
      career: ["2023.10. ~ 2024.11. 티맥스티베로 DB본부 연구원"],
      experience: [
        {
          period: "2023.10. ~ 2024.11.",
          main: "Cloud-Native 차세대 DB 개발 프로젝트 참여",
        },
      ],
      award: [
        {
          main: "2021.11. 도시공학과 종합설계 작품전 우수작품상",
          sub: "미래 모빌리티와 연계한 고양시 발전방향 기획안\n: 성남시와 비교 분석",
        },
      ],
    },
  },
} as const;

type DeepWritableString<T> = T extends string
  ? string
  : { [K in keyof T]: DeepWritableString<T[K]> };

export type Dictionary = DeepWritableString<typeof ko>;
