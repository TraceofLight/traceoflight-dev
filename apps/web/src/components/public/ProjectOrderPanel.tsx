import { DEFAULT_SERIES_IMAGE } from "@/consts";
import type { ProjectItem } from "@/lib/projects";
import CollectionOrderDialog from "./CollectionOrderDialog";
import type { OrderableCollectionItem } from "./CollectionOrderList";

function toOrderItems(projects: ProjectItem[]): OrderableCollectionItem[] {
  return projects.map((project) => ({
    slug: project.slug,
    title: project.title,
    description: project.summary,
    coverImageUrl: project.coverImageUrl,
    href: `/projects/${project.slug}`,
  }));
}

interface ProjectOrderPanelProps {
  projects: ProjectItem[];
}

export function ProjectOrderPanel({ projects }: ProjectOrderPanelProps) {
  return (
    <CollectionOrderDialog
      defaultCoverImage={DEFAULT_SERIES_IMAGE}
      description="공개 Projects 목록에 노출되는 순서를 직접 조정합니다."
      emptyMessage="정렬할 프로젝트가 없습니다."
      endpoint="/internal-api/projects/order"
      entityLabel="프로젝트"
      initialItems={toOrderItems(projects)}
      payloadKey="project_slugs"
      title="프로젝트 순서 조정"
    />
  );
}

export default ProjectOrderPanel;
