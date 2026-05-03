import { DEFAULT_SERIES_IMAGE } from "@/consts";
import type { SeriesSummary } from "@/lib/series-db";
import CollectionOrderDialog from "./CollectionOrderDialog";
import type { OrderableCollectionItem } from "./CollectionOrderList";

function toOrderItems(series: SeriesSummary[]): OrderableCollectionItem[] {
  return series.map((item) => ({
    slug: item.slug,
    title: item.title,
    description: item.description,
    coverImageUrl: item.coverImageUrl,
    href: `/series/${item.slug}`,
  }));
}

interface SeriesOrderPanelProps {
  series: SeriesSummary[];
}

export function SeriesOrderPanel({ series }: SeriesOrderPanelProps) {
  return (
    <CollectionOrderDialog
      defaultCoverImage={DEFAULT_SERIES_IMAGE}
      description="공개 Series 목록에 노출되는 순서를 직접 조정합니다."
      emptyMessage="정렬할 시리즈가 없습니다."
      endpoint="/internal-api/series/order"
      entityLabel="시리즈"
      initialItems={toOrderItems(series)}
      payloadKey="series_slugs"
      title="시리즈 순서 조정"
    />
  );
}

export default SeriesOrderPanel;
