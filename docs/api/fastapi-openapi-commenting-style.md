# FastAPI OpenAPI Commenting Style

This guide standardizes how endpoint docs are written so Swagger/ReDoc reads like API reference documentation.

## Route Decorator Rules

- Always define `summary`.
- Always define `description`.
- Always define explicit `responses` for known success and error outcomes.
- Document non-obvious headers (for example `x-internal-api-secret`, `x-upload-url`) in the operation schema.

## Route Docstring Rules

- Keep route docstrings short and action-oriented.
- First sentence explains endpoint intent.
- Mention behavior caveats only when they are not obvious from code.

## Pydantic Schema Rules

- Use `Field(description=..., json_schema_extra={"example": ...})` for request-model properties.
- Prefer concrete, realistic examples over placeholder text.
- Keep description wording stable to avoid unnecessary OpenAPI contract churn.

## Verification

- Run `pytest tests/api/test_openapi_docs.py -q` after OpenAPI metadata edits.
- Run `pytest -q` before merging broader API changes.
