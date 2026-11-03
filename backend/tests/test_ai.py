import json
import os
from io import BytesIO
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from app.ai import AIProviderError, generate_quote_suggestion


class GeminiSuggestionTests(unittest.TestCase):
    def setUp(self):
        self.request_data = {
            "destination": "Cartagena",
            "start_date": "2026-12-10",
            "end_date": "2026-12-15",
            "travelers_count": 2,
            "budget_cop": 8_000_000,
            "notes": "Hotel frente al mar",
        }
        self.output = {
            "commercialDescription": "Viaje preliminar a Cartagena.",
            "items": [
                {
                    "category": "Vuelos",
                    "description": "Vuelos ida y regreso",
                    "quantity": 2,
                    "unitPriceCOP": 1_000_000,
                },
                {
                    "category": "Alojamiento",
                    "description": "Alojamiento",
                    "quantity": 5,
                    "unitPriceCOP": 500_000,
                },
                {
                    "category": "Actividades",
                    "description": "Recorrido guiado",
                    "quantity": 2,
                    "unitPriceCOP": 100_000,
                },
            ],
        }

    def test_requires_api_key_without_calling_provider(self):
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False),
            patch("app.ai.urlopen") as urlopen,
        ):
            with self.assertRaisesRegex(AIProviderError, "GEMINI_API_KEY"):
                generate_quote_suggestion(self.request_data)

        urlopen.assert_not_called()

    def test_sends_only_trip_details_and_validates_structured_response(self):
        response_body = {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": json.dumps(self.output)}]},
                }
            ]
        }

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return json.dumps(response_body).encode()

        with (
            patch.dict(
                os.environ,
                {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"},
                clear=False,
            ),
            patch("app.ai.urlopen", return_value=FakeResponse()) as urlopen,
        ):
            result = generate_quote_suggestion(self.request_data)

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        prompt = payload["contents"][0]["parts"][0]["text"]
        self.assertEqual(request.get_header("X-goog-api-key"), "test-key")
        self.assertIn("Destino: Cartagena", prompt)
        self.assertIn("Presupuesto total COP: 8000000", prompt)
        self.assertNotIn("clientName", prompt)
        self.assertEqual(result.commercialDescription, self.output["commercialDescription"])
        self.assertEqual(result.items[0].unitPriceCOP, 1_000_000)

    def test_rejects_invalid_provider_output(self):
        response_body = {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": '{"items": []}'}]},
                }
            ]
        }

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return json.dumps(response_body).encode()

        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False),
            patch("app.ai.urlopen", return_value=FakeResponse()),
        ):
            with self.assertRaisesRegex(AIProviderError, "formato no válido"):
                generate_quote_suggestion(self.request_data)

    def test_reports_provider_rate_limit(self):
        error = HTTPError(
            "https://example.test",
            429,
            "Rate limited",
            {},
            BytesIO(b""),
        )
        with (
            patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False),
            patch("app.ai.urlopen", side_effect=error),
        ):
            with self.assertRaisesRegex(AIProviderError, "límite de solicitudes"):
                generate_quote_suggestion(self.request_data)


if __name__ == "__main__":
    unittest.main()
