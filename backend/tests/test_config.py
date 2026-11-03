import unittest

from app.config import normalize_database_url


class DatabaseURLTests(unittest.TestCase):
    def test_normalizes_postgresql_scheme_to_declared_driver(self):
        self.assertEqual(
            normalize_database_url("postgresql://user:password@db.example:5432/app"),
            "postgresql+psycopg://user:password@db.example:5432/app",
        )

    def test_normalizes_legacy_postgres_scheme(self):
        self.assertEqual(
            normalize_database_url("postgres://user:password@db.example:5432/app"),
            "postgresql+psycopg://user:password@db.example:5432/app",
        )

    def test_preserves_explicit_driver(self):
        value = "postgresql+psycopg://user:password@db.example:5432/app"
        self.assertEqual(normalize_database_url(value), value)


if __name__ == "__main__":
    unittest.main()
