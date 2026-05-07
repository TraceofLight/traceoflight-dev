# Writer Modal Interaction Guard Design

## Goal

Prevent background writer interactions while modal layers are open, and keep transient feedback visible above modal blur surfaces.

## Problem

- The writer toast currently renders below the publish layer backdrop, so drag-and-drop upload feedback appears blurred.
- Global drag-and-drop handlers still fall back to body uploads even when the publish modal is open.
- Dropping a file outside the publish panel can therefore mutate the background editor while the modal is active.

## Decision

- Treat publish, draft, and reauth layers as modal interaction guards for writer media drag-and-drop.
- While any modal guard is active, global writer drag-and-drop handlers must suppress background uploads instead of falling back to the editor body.
- Keep publish-cover drag-and-drop working inside the publish modal.
- Raise the shared writer toast above modal layers so upload and validation feedback remains readable.

## Scope

- Writer modal state wiring in `apps/web/src/lib/admin/new-post-page.ts`
- Global media drag/drop guard logic in `apps/web/src/lib/admin/new-post-page/media-controller.ts`
- Writer toast layering in `apps/web/src/styles/components/writer/preview.css`
- Regression coverage for modal drag/drop blocking and toast stacking
