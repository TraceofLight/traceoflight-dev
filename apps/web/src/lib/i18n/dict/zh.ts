import type { Dictionary } from "./ko";

export const zh: Dictionary = {
  nav: { blog: "博客", projects: "项目", series: "系列" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "阅读更多", backToList: "返回列表",
    save: "保存", cancel: "取消", delete: "删除", edit: "编辑",
    search: "搜索", loadMore: "加载更多", retry: "重试", viewAll: "查看全部",
  },
  empty: {
    noPosts: "还没有文章。", noResults: "没有搜索结果。",
    noProjects: "还没有已登记的项目。", noSeries: "还没有已登记的系列。",
  },
  blogPost: {
    backToBlog: "返回博客", viewAllPosts: "查看所有文章",
    relatedSeries: "本系列其他文章",
    publishedOn: "发布", updatedOn: "更新", minRead: "分钟阅读",
    seriesNavLabel: "系列导航",
    seriesProgress: "第 {order} 篇，共 {total} 篇",
    prevPost: "上一篇",
    nextPost: "下一篇",
    noExcerpt: "无摘要",
  },
  archiveFilters: {
    searchPlaceholder: "搜索文章",
    searchLabel: "搜索文章",
    sortLabel: "排序方式",
    sort: { latest: "最新", oldest: "最早", title: "按标题" },
    visibility: { all: "全部", public: "公开", private: "私密" },
    privatePost: "私密文章",
    publicPost: "公开文章",
    totalCountPrefix: "共 ",
    totalCountSuffix: " 篇文章",
    commentCount: "条",
    loadingPosts: "正在加载文章。",
    loadError: "加载文章失败。",
    loadMoreError: "加载更多文章失败。",
    coverImageAlt: "封面图片",
    writePost: "写文章",
    readPost: "阅读",
    noPosts: "暂无文章。",
    archiveDescription: "TraceofLight 的开发故事与随笔归档",
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "页面未找到",
    description: "您查找的页面不存在或已被移动。",
    cta: "返回首页",
  },
  projectDetail: {
    role: "角色", period: "时间",
    intro: "项目简介", description: "详细内容",
    highlights: "亮点", resources: "资源",
  },
  seriesDetail: {
    postCount: "文章数", empty: "本系列还没有文章。",
  },
  comments: {
    title: "评论", placeholder: "写下评论",
    submit: "发表评论", empty: "还没有评论。",
    deleteConfirm: "确定要删除吗?",
  },
  home: {
    intro:
      "记录游戏开发、图形编程与数据库工程的 TraceofLight 技术归档。",
    introTop:
      "我是 TraceofLight，把想象变为现实、为虚拟世界注入生命力的开发者。",
    introBottom:
      "向上以对新技术的好奇心探索，向下以对基础知识的持续钻研扎根，不断成长。",
    recentPosts: "最近文章", seeAllPosts: "查看所有文章",
    featuredSeries: "精选系列",
    latestPosts: "最新文章",
    viewProjects: "查看项目",
    viewBlog: "查看博客",
    viewAllProjects: "View All Projects",
    viewAllSeries: "View All Series",
    viewAllPosts: "View All Posts",
    seriesArchiveSubtitle:
      "把 TraceofLight 的各种故事按主题编织起来的书库",
    projectsArchiveSubtitle:
      "参与过的项目，以及推进过程中的感受与思考",
    noSeriesYet: "还没有注册的系列。",
    noPostsYet: "还没有公开的文章。",
    pageTitle: "游戏开发 · 图形编程归档",
    sectionTitles: {
      education: "教育",
      license: "资格证书",
      military: "兵役",
      career: "职业",
      experience: "经历",
      award: "获奖",
    },
    techStackTitles: {
      language: "语言",
      gameDev: "游戏开发",
      scm: "SCM",
      web: "Web",
    },
    resume: {
      education: [
        "2026.02 完成 KRAFTON Jungle Gametech Lab 第2期",
        "2023.08 完成三星青年软件学院（SSAFY）第8期",
        "2022.08 延世大学城市工学专业毕业",
      ],
      license: ["2022.12 SQL开发者（SQLD）"],
      military: ["2017.06 - 2019.05 韩国空军 中士 服役期满退伍"],
      career: ["2023.10 - 2024.11 TmaxTibero 数据库本部 研究员"],
      experience: [
        {
          period: "2023.10 - 2024.11",
          main: "参与云原生新一代数据库开发项目",
        },
      ],
      award: [
        {
          main: "2021.11 城市工学专业综合设计作品展 优秀作品奖",
          sub: "结合未来出行的高阳市发展方向规划方案\n：与城南市的对比分析",
        },
      ],
    },
  },
} as const;
