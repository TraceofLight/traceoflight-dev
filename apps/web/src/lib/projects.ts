import type { ImageMetadata } from "astro";

import projectCoverA from "../assets/blog-placeholder-1.jpg";
import projectCoverB from "../assets/blog-placeholder-4.jpg";
import projectCoverC from "../assets/blog-placeholder-5.jpg";

export interface ProjectLink {
  label: string;
  href: string;
}

export interface ProjectItem {
  slug: string;
  title: string;
  summary: string;
  description: string;
  role: string;
  period: string;
  stack: string[];
  highlights: string[];
  coverImage: ImageMetadata;
  links: ProjectLink[];
}

const projects: ProjectItem[] = [
  {
    slug: "trace-editor",
    title: "Lorem ipsum dolor",
    summary:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    role: "Lorem ipsum role",
    period: "2026.03 - ongoing",
    stack: ["Lorem", "Ipsum", "Dolor", "Amet"],
    highlights: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    ],
    coverImage: projectCoverA,
    links: [{ label: "Lorem", href: "/blog" }],
  },
  {
    slug: "infra-pipeline",
    title: "Ipsum dolor sit",
    summary:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    role: "Dolor sit role",
    period: "2026.03 - ongoing",
    stack: ["Consectetur", "Adipiscing", "Elit", "Tempor"],
    highlights: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    ],
    coverImage: projectCoverB,
    links: [{ label: "Ipsum", href: "https://jenkins.traceoflight.dev" }],
  },
  {
    slug: "content-backend-ready",
    title: "Amet consectetur elit",
    summary:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    role: "Amet role",
    period: "2026.03",
    stack: ["Labore", "Magna", "Aliqua", "Nostrud"],
    highlights: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    ],
    coverImage: projectCoverC,
    links: [{ label: "Dolor", href: "/projects" }],
  },
];

export function getProjects(): ProjectItem[] {
  return projects;
}

export function getProjectBySlug(slug: string): ProjectItem | undefined {
  return projects.find((project) => project.slug === slug);
}
