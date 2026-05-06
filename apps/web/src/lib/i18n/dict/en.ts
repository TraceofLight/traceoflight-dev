import type { Dictionary } from "./ko";

export const en: Dictionary = {
  nav: { blog: "Blog", projects: "Projects", series: "Series" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "Read more", backToList: "Back to list",
    save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    search: "Search", loadMore: "Load more", retry: "Retry", viewAll: "View all",
  },
  empty: {
    noPosts: "No posts yet.", noResults: "No results found.",
    noProjects: "No projects yet.", noSeries: "No series yet.",
  },
  blogPost: {
    backToBlog: "Back to blog", viewAllPosts: "View all posts",
    relatedSeries: "More from this series",
    publishedOn: "Published", updatedOn: "Updated", minRead: "min read",
    seriesNavLabel: "Series navigation",
    seriesProgress: "Post {order} of {total}",
    prevPost: "Previous post",
    nextPost: "Next post",
    noExcerpt: "No excerpt",
  },
  archiveFilters: {
    searchPlaceholder: "Search posts",
    searchLabel: "Search posts",
    sortLabel: "Sort order",
    sort: { latest: "Latest", oldest: "Oldest", title: "By title" },
    visibility: { all: "All", public: "Public", private: "Private" },
    privatePost: "Private post",
    publicPost: "Public post",
    totalCountPrefix: "",
    totalCountSuffix: " posts",
    commentCount: "",
    loadingPosts: "Loading posts...",
    loadError: "Failed to load posts.",
    loadMoreError: "Failed to load more posts.",
    coverImageAlt: "cover image",
    writePost: "Write post",
    readPost: "Read",
    noPosts: "No posts yet.",
    archiveDescription: "Development stories and more from TraceofLight",
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    cta: "Back to home",
  },
  projectDetail: {
    role: "Role", period: "Period",
    intro: "About", description: "Details",
    highlights: "Highlights", resources: "Resources",
  },
  seriesDetail: {
    postCount: "Posts", empty: "This series has no posts yet.",
  },
  comments: {
    title: "Comments", placeholder: "Write a comment",
    submit: "Post comment", empty: "No comments yet.",
    deleteConfirm: "Are you sure you want to delete this?",
  },
  home: {
    intro:
      "Technical archive of TraceofLight, documenting game development, graphics programming, and database engineering.",
    introTop:
      "I'm TraceofLight, a developer who turns imagination into reality and breathes life into virtual worlds.",
    introBottom:
      "Growing through curiosity for new technologies up top and steady exploration of foundational knowledge underneath.",
    recentPosts: "Recent posts", seeAllPosts: "See all posts",
    viewProjects: "View Projects",
    viewBlog: "View Blog",
    viewAllProjects: "View All Projects",
    viewAllSeries: "View All Series",
    viewAllPosts: "View All Posts",
    seriesArchiveSubtitle:
      "An archive of TraceofLight's varied stories woven together by theme",
    projectsArchiveSubtitle:
      "Projects I've worked on, with the thoughts and questions they raised along the way",
    noSeriesYet: "No series registered yet.",
    noPostsYet: "No public posts yet.",
    pageTitle: "Game Dev · Graphics Programming Archive",
    sectionTitles: {
      education: "Education",
      license: "License",
      military: "Military Service",
      career: "Career",
      experience: "Experience",
      award: "Award",
    },
    techStackTitles: {
      language: "Language",
      gameDev: "Game Development",
      scm: "SCM",
      web: "Web",
    },
    resume: {
      education: [
        "2026.02 Completed KRAFTON Jungle Gametech Lab, 2nd cohort",
        "2023.08 Completed Samsung Software Academy for Youth (SSAFY), 8th cohort",
        "2022.08 Yonsei University, B.S. in Urban Planning",
      ],
      license: ["2022.12 SQL Developer (SQLD)"],
      military: ["2017.06 – 2019.05 Republic of Korea Air Force, completed service as Sergeant"],
      career: ["2023.10 – 2024.11 Researcher, DB Division at TmaxTibero"],
      experience: [
        {
          period: "2023.10 – 2024.11",
          main: "Cloud-native next-generation DB development project",
        },
      ],
      award: [
        {
          main: "2021.11 Excellence Award, Urban Planning Senior Design Showcase",
          sub: "Goyang City development proposal connected with future mobility:\ncomparative analysis with Seongnam City",
        },
      ],
    },
  },
} as const;
