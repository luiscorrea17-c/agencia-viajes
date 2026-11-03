from datetime import date, timedelta
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from app.routers import quotes


class QuoteListTests(unittest.TestCase):
    def test_expired_quotes_are_marked_in_response_without_database_writes(self):
        expired_quote = {
            "id": "expired",
            "status": "Enviada",
            "valid_until": date.today() - timedelta(days=1),
        }
        current_quote = {
            "id": "current",
            "status": "Enviada",
            "valid_until": date.today(),
        }
        db = SimpleNamespace(commit=Mock())
        result = SimpleNamespace(mappings=lambda: [expired_quote, current_quote])

        with (
            patch.object(quotes, "execute", return_value=result) as execute,
            patch.object(
                quotes,
                "quote_record",
                side_effect=lambda _db, row: {"id": row["id"], "status": row["status"]},
            ),
        ):
            response = quotes.list_quotes(db, {"role": "Administrador"})

        self.assertEqual(
            response,
            [
                {"id": "expired", "status": "Expirada"},
                {"id": "current", "status": "Enviada"},
            ],
        )
        self.assertEqual(expired_quote["status"], "Enviada")
        execute.assert_called_once()
        self.assertTrue(execute.call_args.args[1].lstrip().startswith("SELECT"))
        db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
