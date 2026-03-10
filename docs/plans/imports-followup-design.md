# Imports Follow-up Design

## Scope

Close the two known regressions/risks after the imports refactor, then do one more bounded cleanup in the same area:

1. Restore mobile admin access to `/admin/imports`
2. Make backup restore safer when object promotion succeeds but DB work fails
3. Move `AdminImportsPanel` fetch/feedback logic into a helper module

## Design

### Mobile Admin Access

- Add an admin-only `/admin/imports` link to the mobile sheet navigation.
- Keep the existing desktop header/footer admin entry unchanged.

### Restore Rollback

- Stage new media payloads under a temporary prefix.
- Before promoting to the final object key, read and retain any existing object bytes for keys that already exist.
- Promote staged bytes to the final object key.
- Run DB replacement in one transaction.
- If DB replacement fails after promotion, restore previous object bytes for overwritten keys and delete newly created final objects.
- Always clean up staged objects in `finally`.

### Admin Imports Client Boundary

- Extract `resolveErrorMessage`, `readJsonSafe`, and backup request helpers out of `AdminImportsPanel`.
- Keep the panel as a thin UI state component.

## Testing

- Source test for mobile sheet admin link.
- Service tests for restore rollback when DB work fails after object promotion.
- UI test coverage for `AdminImportsPanel` remains green after helper extraction.
