"""Force-rebuild every translation sibling currently in the database.

When the masking pipeline that protects markdown structure (blockquote `>`
markers, code, etc.) is changed, already-stored EN/JA/ZH translations stay
broken - the worker's hash check only re-translates when the source changes,
not when the *masking rules* change. This script bridges that gap.

What it does:

1. Marks every non-Korean post and series sibling as ``FAILED`` so the worker
   treats it as needing retranslation regardless of its current hash.
2. Enqueues a translation job for every (Korean source, target locale) pair
   for both posts and series.

Run it once after deploying a masking change. Re-runs are idempotent: workers
will re-translate the affected siblings on the next invocation.

Usage (inside the API container or any environment with the API package and
its DB / Redis credentials available):

    python -m scripts.rebuild_translations             # run for real
    python -m scripts.rebuild_translations --dry-run   # report only

The script must be invoked from ``apps/api`` with ``src`` on the Python path
(matching ``pyproject.toml`` ``pythonpath = ["src"]``); the same setup pytest
uses works here too.
"""

from __future__ import annotations

import argparse
import sys
from typing import Iterable

from sqlalchemy import select

from app.api.deps import _get_translation_queue
from app.db.session import SessionLocal
from app.models.post import Post, PostLocale, PostTranslationStatus
from app.models.series import Series

TARGET_LOCALES: tuple[str, ...] = ("en", "ja", "zh")


def _mark_siblings_failed(db, model, *, label: str) -> int:
    siblings = list(db.scalars(select(model).where(model.locale != PostLocale.KO)))
    for row in siblings:
        row.translation_status = PostTranslationStatus.FAILED
    print(f"  {label}: marked {len(siblings)} sibling row(s) as FAILED")
    return len(siblings)


def _enqueue_sources(
    db, model, *, source_id_attr: str, kind: str, queue, dry_run: bool,
) -> tuple[int, int]:
    sources = list(
        db.scalars(
            select(model).where(
                model.locale == PostLocale.KO,
                getattr(model, source_id_attr).is_(None),
            )
        )
    )
    enqueued = 0
    if not dry_run:
        for source in sources:
            for target in TARGET_LOCALES:
                queue.enqueue_translation_job(
                    source_post_id=source.id,
                    target_locale=target,
                    kind=kind,
                )
                enqueued += 1
    print(
        f"  {kind}: {len(sources)} Korean source(s) x {len(TARGET_LOCALES)} locales "
        f"= {len(sources) * len(TARGET_LOCALES)} job(s)"
        + ("" if not dry_run else " (skipped - dry run)")
    )
    return len(sources), enqueued


def _run(*, dry_run: bool) -> int:
    queue = _get_translation_queue()
    if queue is None and not dry_run:
        print(
            "ERROR: translation queue is unavailable — Redis appears unreachable. "
            "Check REDIS_URL and try again, or use --dry-run to preview the work.",
            file=sys.stderr,
        )
        return 1

    print(f"=== rebuild_translations {'(dry run)' if dry_run else ''} ===")
    with SessionLocal() as db:
        print("[1/2] marking existing siblings as FAILED")
        post_failed = _mark_siblings_failed(db, Post, label="post")
        series_failed = _mark_siblings_failed(db, Series, label="series")
        if not dry_run:
            db.commit()
        else:
            db.rollback()

        print("[2/2] enqueuing translation jobs for Korean sources")
        post_sources, post_jobs = _enqueue_sources(
            db, Post, source_id_attr="source_post_id", kind="post",
            queue=queue, dry_run=dry_run,
        )
        series_sources, series_jobs = _enqueue_sources(
            db, Series, source_id_attr="source_series_id", kind="series",
            queue=queue, dry_run=dry_run,
        )

    print("---")
    print(
        f"summary: {post_failed} post sibling(s) + {series_failed} series sibling(s) "
        f"flagged FAILED; "
        f"{post_jobs} post job(s) + {series_jobs} series job(s) "
        f"{'enqueued' if not dry_run else 'would be enqueued'}."
    )
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would happen without writing to the DB or queue.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    return _run(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
