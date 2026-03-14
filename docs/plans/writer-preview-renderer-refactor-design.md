# Writer Preview Renderer Refactor Design

## Goal

Refactor the admin writer preview subsystem so body edits no longer remount heavy media nodes such as top-media videos, YouTube iframes, and body-embedded videos.

## Problem

- The writer currently rebuilds the entire live preview with `previewContent.innerHTML = ...`.
- Every preview refresh recreates top media and body embed DOM nodes even when their source URLs have not changed.
- Browser caching does not solve the real issue because remounted `<video>` and `<iframe>` elements still lose in-flight load and playback state.

## Decision

- Keep the existing writer form, draft, upload, and submit flows unchanged.
- Replace the preview content `innerHTML` swap with a dedicated preview renderer that manages stable DOM slots for top media and body content.
- Reuse existing media DOM nodes when the rendered media signature is unchanged, while still allowing surrounding text and markup to update normally.

## Architecture

- `initNewPostAdminPage()` builds a preview view model and hands it to a preview renderer instance.
- The preview renderer owns two update surfaces:
  - Top media slot: preserve the current `<video>` or `<iframe>` node unless the media kind or URL changes.
  - Body slot: parse the next HTML off-DOM, match media elements by signature, and move existing nodes into the new tree before replacing non-media content.
- Preview title and metadata remain separate lightweight updates.

## Scope

- Admin writer preview rendering code
- Preview renderer regression tests for top media and body embeds
- No changes to editor bridge, submit pipeline, draft persistence, or publish-side top-media panel
