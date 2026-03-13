# Writer Submit Guard Design

## Goal

Prevent unintended publish submits from the admin writer when the user presses Enter in the series input or when the browser triggers a form submit without an explicit submit button.

## Problem

- The series input currently allows the Enter key to bubble to the form.
- The submit flow treats `submitter === null` as `published` when the publish layer is open.
- That combination lets an accidental form submit overwrite `published_at` and reorder posts.

## Decision

- Only the explicit publish button may resolve a submit as `published`.
- Submit events with `submitter === null` fall back to `draft`.
- The series input intercepts Enter and prevents default form submission.

## Scope

- Web writer submit status resolution
- Web writer series input keyboard handling
- Regression tests covering both guards
