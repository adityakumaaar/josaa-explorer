"""Shared fixtures for search integration tests.

These tests run against the REAL database to validate search behavior
against ground-truth data. If a logic change breaks expected behavior,
these tests will fail with clear messages explaining what went wrong.
"""

import pytest
from app.models.database import SessionLocal


@pytest.fixture
def db():
    """Provide a real database session for integration tests."""
    session = SessionLocal()
    yield session
    session.close()
