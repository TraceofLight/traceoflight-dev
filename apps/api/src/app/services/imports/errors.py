class ImportServiceError(Exception):
    """Base class for import flow failures."""


class ImportValidationError(ImportServiceError):
    """Raised when payload or snapshot format is invalid."""
