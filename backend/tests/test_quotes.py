from datetime import date, timedelta
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.ai import QuoteSuggestion
from app import booking_service
from app.routers import bookings, quotes
from app.schemas import QuoteDraftInput, QuoteItemInput, QuoteResponseInput


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


class QuoteGenerationTests(unittest.TestCase):
    def test_creates_draft_from_gemini_suggestion_without_sending_client_identity(self):
        request = {
            "id": "request-1",
            "status": "Abierta",
            "destination": "Cartagena",
            "start_date": date(2026, 12, 10),
            "end_date": date(2026, 12, 15),
            "travelers_count": 2,
            "budget_cop": 8_000_000,
            "notes": "Hotel frente al mar",
            "client_name": "Cliente privado",
            "client_email": "private@example.com",
        }
        items = [
            {
                "category": "Vuelos",
                "description": "Vuelos de ida y regreso",
                "quantity": 2,
                "unitPriceCOP": 1_000_000,
            },
            {
                "category": "Alojamiento",
                "description": "Hotel",
                "quantity": 5,
                "unitPriceCOP": 500_000,
            },
            {
                "category": "Actividades",
                "description": "Recorrido guiado",
                "quantity": 2,
                "unitPriceCOP": 100_000,
            },
        ]
        suggestion = QuoteSuggestion.model_validate(
            {
                "commercialDescription": "Borrador de viaje",
                "items": items,
            }
        )
        quote_row = {"id": "quote-1", "code": "COT-001"}
        insert_params = {}

        def result(_db, statement, **_params):
            if "FROM travel_requests" in statement:
                return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: request))
            if "SELECT 1 FROM quotes" in statement:
                return SimpleNamespace(first=lambda: None)
            if "COALESCE(MAX(version)" in statement:
                return SimpleNamespace(scalar_one=lambda: 1)
            if "next_code" in statement:
                return SimpleNamespace(scalar_one=lambda: "COT-001")
            if "INSERT INTO quotes" in statement:
                insert_params.update(_params)
                return SimpleNamespace(mappings=lambda: SimpleNamespace(one=lambda: quote_row))
            if "SELECT * FROM quotes WHERE id" in statement:
                return SimpleNamespace(mappings=lambda: SimpleNamespace(one=lambda: quote_row))
            return SimpleNamespace()

        db = SimpleNamespace(commit=Mock(), rollback=Mock())
        actor = {"id": "advisor-1", "name": "Asesora", "role": "Asesor"}
        with (
            patch.object(quotes, "execute", side_effect=result),
            patch.object(quotes, "code", return_value="COT-001"),
            patch.object(quotes, "generate_quote_suggestion", return_value=suggestion) as generate,
            patch.object(quotes, "set_request_status"),
            patch.object(quotes, "quote_record", return_value={"id": "quote-1"}) as serialize,
        ):
            response = quotes.create_from_request("request-1", db, actor)

        generate.assert_called_once_with(
            {
                "destination": "Cartagena",
                "start_date": "2026-12-10",
                "end_date": "2026-12-15",
                "travelers_count": 2,
                "budget_cop": 8_000_000,
                "notes": "Hotel frente al mar",
            }
        )
        self.assertEqual(insert_params["base"], 4_700_000)
        self.assertIn("Borrador preliminar sugerido por Gemini", insert_params["log"])
        self.assertEqual(response, {"id": "quote-1"})
        db.commit.assert_called_once()
        serialize.assert_called_once()


class QuoteValueValidationTests(unittest.TestCase):
    def test_quote_items_require_positive_quantity_and_unit_price(self):
        item = {
            "category": "Vuelos",
            "description": "Vuelo",
            "quantity": 1,
            "unit_price_cop": 100_000,
        }
        with self.assertRaises(ValidationError):
            QuoteItemInput(**{**item, "quantity": 0})
        with self.assertRaises(ValidationError):
            QuoteItemInput(**{**item, "unit_price_cop": 0})
        with self.assertRaises(ValidationError):
            QuoteDraftInput(
                commercial_description="Propuesta",
                items=[],
                season_surcharge_percent=0,
                discount_percent=0,
                valid_until=date.today(),
            )

    def test_draft_with_zero_total_is_rejected_before_database_writes(self):
        body = QuoteDraftInput(
            commercial_description="Propuesta",
            items=[
                QuoteItemInput(
                    category="Vuelos",
                    description="Vuelo",
                    quantity=1,
                    unit_price_cop=100_000,
                )
            ],
            season_surcharge_percent=0,
            discount_percent=100,
            valid_until=date.today(),
        )
        db = SimpleNamespace()
        actor = {"id": "advisor-1", "name": "Asesora", "role": "Asesor"}

        with (
            patch.object(quotes, "visible_quote", return_value={"status": "Borrador"}),
            patch.object(quotes, "execute") as execute,
        ):
            with self.assertRaises(HTTPException) as error:
                quotes.save_draft("quote-1", body, db, actor)

        self.assertEqual(error.exception.status_code, 422)
        self.assertIn("mayor que $0", error.exception.detail)
        execute.assert_not_called()

    def test_zero_value_quote_cannot_be_sent(self):
        quote = {
            "status": "Borrador",
            "total_cop": 0,
        }
        actor = {"id": "advisor-1", "name": "Asesora", "role": "Asesor"}

        with (
            patch.object(quotes, "visible_quote", return_value=quote),
            patch.object(quotes, "execute") as execute,
        ):
            with self.assertRaises(HTTPException) as error:
                quotes.send_quote("quote-1", SimpleNamespace(), actor)

        self.assertEqual(error.exception.status_code, 409)
        execute.assert_not_called()

    def test_zero_value_approved_quote_cannot_become_a_booking(self):
        result = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: {"total_cop": 0}))
        db = SimpleNamespace()
        actor = {"id": "admin-1", "role": "Administrador"}

        with patch.object(bookings, "execute", return_value=result) as execute:
            with self.assertRaises(HTTPException) as error:
                bookings.create_booking(SimpleNamespace(quote_id="quote-1"), db, actor)

        self.assertEqual(error.exception.status_code, 409)
        execute.assert_called_once()


class QuoteApprovalBookingTests(unittest.TestCase):
    def setUp(self):
        self.quote = {
            "id": "quote-1",
            "code": "COT-001",
            "request_id": "request-1",
            "status": "Enviada",
            "total_cop": 1_200_000,
            "advisor_decision_log": "",
        }
        self.actor = {"id": "client-user", "name": "Cliente", "role": "Cliente"}

    def test_client_approval_creates_booking_in_the_same_transaction(self):
        approved = self.quote | {"status": "Aprobada"}
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: approved)
        )
        db = SimpleNamespace(commit=Mock(), rollback=Mock())
        booking = {"code": "RES-2026-001"}

        with (
            patch.object(quotes, "visible_quote", return_value=self.quote),
            patch.object(quotes, "execute", return_value=result),
            patch.object(quotes, "create_booking_from_quote", return_value=booking) as create_booking,
            patch.object(quotes, "quote_record", return_value={"id": "quote-1"}) as serialize,
        ):
            response = quotes.respond_quote(
                "quote-1", QuoteResponseInput(decision="Aprobada"), db, self.actor
            )

        create_booking.assert_called_once_with(db, approved, self.actor)
        serialize.assert_called_once_with(db, approved)
        self.assertEqual(response["bookingCode"], booking["code"])
        db.commit.assert_called_once()
        db.rollback.assert_not_called()

    def test_rejection_does_not_create_booking(self):
        rejected = self.quote | {"status": "Rechazada"}
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: rejected)
        )
        db = SimpleNamespace(commit=Mock(), rollback=Mock())

        with (
            patch.object(quotes, "visible_quote", return_value=self.quote),
            patch.object(quotes, "execute", return_value=result),
            patch.object(quotes, "create_booking_from_quote") as create_booking,
            patch.object(quotes, "quote_record", return_value={"id": "quote-1"}),
        ):
            response = quotes.respond_quote(
                "quote-1", QuoteResponseInput(decision="Rechazada"), db, self.actor
            )

        create_booking.assert_not_called()
        self.assertNotIn("bookingCode", response)
        db.commit.assert_called_once()

    def test_missing_travelers_rolls_back_quote_approval(self):
        approved = self.quote | {"status": "Aprobada"}
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: approved)
        )
        db = SimpleNamespace(commit=Mock(), rollback=Mock())
        error = HTTPException(status_code=422, detail="Registra al menos un viajero.")

        with (
            patch.object(quotes, "visible_quote", return_value=self.quote),
            patch.object(quotes, "execute", return_value=result),
            patch.object(quotes, "create_booking_from_quote", side_effect=error),
        ):
            with self.assertRaises(HTTPException):
                quotes.respond_quote(
                    "quote-1", QuoteResponseInput(decision="Aprobada"), db, self.actor
                )

        db.commit.assert_not_called()
        db.rollback.assert_called_once()

    def test_existing_approved_quote_can_be_converted_by_its_client(self):
        approved = self.quote | {"status": "Aprobada"}
        no_booking = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: None)
        )
        db = SimpleNamespace(commit=Mock(), rollback=Mock())
        booking = {"code": "RES-2026-001"}

        with (
            patch.object(quotes, "visible_quote", return_value=approved),
            patch.object(quotes, "execute", return_value=no_booking),
            patch.object(quotes, "create_booking_from_quote", return_value=booking) as create_booking,
        ):
            response = quotes.ensure_approved_quote_booking("quote-1", db, self.actor)

        create_booking.assert_called_once_with(db, approved, self.actor)
        self.assertEqual(response, {"bookingCode": booking["code"]})
        db.commit.assert_called_once()
        db.rollback.assert_not_called()


class BookingServiceTests(unittest.TestCase):
    def test_creates_pending_booking_with_quote_items_and_profile_traveler(self):
        start = date.today() + timedelta(days=30)
        request = {
            "id": "request-1",
            "client_id": "client-1",
            "destination": "Cartagena",
            "thumbnail_url": "",
            "start_date": start,
            "end_date": start + timedelta(days=5),
            "travelers_count": 1,
        }
        client = {
            "id": "client-1",
            "name": "Cliente",
            "doc_type": "CC",
            "doc_number": "123456789",
            "passport_expiry": None,
        }
        item = {
            "category": "Alojamiento",
            "description": "Hotel",
            "quantity": 2,
            "unit_price_cop": 300_000,
        }
        booking_row = {"id": "booking-1", "code": "RES-2026-001"}
        empty = SimpleNamespace(first=lambda: None)
        request_result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: request)
        )
        client_result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: client)
        )
        items_result = SimpleNamespace(mappings=lambda: [item])
        booking_result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: booking_row)
        )

        def execute_result(_db, statement, **_params):
            if "FROM bookings WHERE quote_id" in statement:
                return empty
            if "FROM travel_requests" in statement:
                return request_result
            if "FROM client_records" in statement:
                return client_result
            if "FROM client_companions" in statement:
                return SimpleNamespace(mappings=lambda: [])
            if "INSERT INTO bookings" in statement:
                return booking_result
            if "FROM quote_items" in statement:
                return items_result
            return SimpleNamespace()

        db = object()
        actor = {"id": "client-user", "name": "Cliente", "role": "Cliente"}
        quote = {
            "id": "quote-1",
            "code": "COT-001",
            "request_id": "request-1",
            "total_cop": 600_000,
            "commercial_description": "Viaje a Cartagena",
        }
        params = {}

        def capture(_db, statement, **values):
            if "INSERT INTO bookings" in statement:
                params.update(values)
            return execute_result(_db, statement, **values)

        with (
            patch.object(booking_service, "execute", side_effect=capture),
            patch.object(booking_service, "code", return_value="RES-2026-001"),
            patch.object(
                booking_service,
                "new_id",
                side_effect=["booking-1", "traveler-1", "item-1"],
            ),
            patch.object(booking_service, "audit") as audit,
        ):
            result = booking_service.create_booking_from_quote(db, quote, actor)

        self.assertEqual(result, booking_row)
        self.assertEqual(params["status"] if "status" in params else "pendiente_pago", "pendiente_pago")
        self.assertEqual(params["total"], 600_000)
        self.assertEqual(params["due"], start - timedelta(days=7))
        self.assertEqual(params["actor"], actor["id"])
        audit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
