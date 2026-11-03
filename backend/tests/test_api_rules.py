import base64
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routers import auth, bookings, clients, requests
from app.schemas import ClientInput, LoginInput, PaymentInput, QuoteItemInput, RequestInput
from app.security import require_roles


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": "user-1",
            "name": "Ana Asesora",
            "email": "ana@example.com",
            "password_hash": "hashed-password",
            "role": "Asesor",
            "branch": "Bogotá",
            "avatar_url": None,
            "active": True,
        }

    def test_login_returns_public_user_and_token(self):
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: self.user)
        )
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        with (
            patch.object(auth, "execute", return_value=result) as execute,
            patch.object(auth, "verify_password", return_value=True),
            patch.object(
                auth, "create_access_token", return_value=("signed-token", expires_at)
            ),
        ):
            response = auth.login(
                LoginInput(email="  ANA@example.com ", password="correct-password"),
                db=object(),
            )

        self.assertEqual(response["user"]["id"], "user-1")
        self.assertEqual(response["user"]["role"], "Asesor")
        self.assertEqual(response["token"], "signed-token")
        self.assertEqual(response["expiresAt"], int(expires_at.timestamp() * 1000))
        self.assertNotIn("password_hash", response["user"])
        self.assertEqual(execute.call_args.kwargs["email"], "ANA@example.com")

    def test_login_rejects_invalid_credentials(self):
        result = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))

        with patch.object(auth, "execute", return_value=result):
            with self.assertRaises(HTTPException) as raised:
                auth.login(LoginInput(email="missing@example.com", password="bad"), db=object())

        self.assertEqual(raised.exception.status_code, 401)

    def test_login_rejects_inactive_user(self):
        inactive_user = {**self.user, "active": False}
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: inactive_user)
        )

        with (
            patch.object(auth, "execute", return_value=result),
            patch.object(auth, "verify_password", return_value=True),
        ):
            with self.assertRaises(HTTPException) as raised:
                auth.login(LoginInput(email="ana@example.com", password="correct"), db=object())

        self.assertEqual(raised.exception.status_code, 403)

    def test_role_dependency_allows_and_rejects_roles(self):
        actor = {"id": "user-1", "role": "Asesor"}

        self.assertIs(require_roles("Asesor")(actor), actor)
        with self.assertRaises(HTTPException) as raised:
            require_roles("Administrador")(actor)

        self.assertEqual(raised.exception.status_code, 403)

    def test_user_listing_never_returns_password_hash(self):
        rows = [self.user]
        result = SimpleNamespace(mappings=lambda: rows)

        with patch.object(auth, "execute", return_value=result):
            users = auth.list_users(db=object(), _={"role": "Administrador"})

        self.assertEqual(len(users), 1)
        self.assertEqual(users[0]["email"], "ana@example.com")
        self.assertNotIn("password_hash", users[0])


class InputValidationTests(unittest.TestCase):
    def client_input(self, **overrides):
        values = {
            "name": "Cliente de prueba",
            "email": "cliente@example.com",
            "phone": "3001234567",
            "type": "Persona",
            "segment": "Estándar",
            "docType": "CC",
            "docNumber": "123456789",
            "companions": [],
            "notes": [],
        }
        return ClientInput(**(values | overrides))

    def request_input(self, **overrides):
        values = {
            "client_id": "client-1",
            "destination": "Cartagena",
            "start_date": "2026-11-10",
            "end_date": "2026-11-15",
            "budget_cop": 4500000,
            "travelers_count": 2,
            "notes": "",
            "status": "Abierta",
        }
        return RequestInput(**(values | overrides))

    def test_valid_client_and_request_inputs_pass(self):
        clients.validate_client(self.client_input())
        requests.validate_request(self.request_input())

    def test_request_schema_accepts_frontend_budget_cop_field(self):
        body = RequestInput.model_validate(
            {
                "clientId": "client-1",
                "destination": "Cartagena",
                "startDate": "2026-11-10",
                "endDate": "2026-11-15",
                "budgetCOP": 4500000,
                "travelersCount": 2,
                "notes": "",
                "status": "Abierta",
            }
        )

        self.assertEqual(body.budget_cop, 4500000)

    def test_quote_item_schema_accepts_frontend_unit_price_cop_field(self):
        item = QuoteItemInput.model_validate(
            {
                "category": "Vuelos",
                "description": "Vuelo de ida y vuelta",
                "quantity": 1,
                "unitPriceCOP": 1200000,
            }
        )

        self.assertEqual(item.unit_price_cop, 1200000)

    def test_payment_schema_accepts_frontend_amount_cop_field(self):
        payment = PaymentInput.model_validate(
            {
                "bookingId": "booking-1",
                "amountCOP": 900000,
                "method": "Transferencia",
                "reference": "TRX-001",
                "date": "2026-10-31",
                "notes": "",
            }
        )

        self.assertEqual(payment.amount_cop, 900000)

    def test_client_rejects_invalid_email_and_future_companion_birth_date(self):
        with self.assertRaises(HTTPException) as email_error:
            clients.validate_client(self.client_input(email="invalid"))
        self.assertEqual(email_error.exception.status_code, 422)

        companion = {
            "fullName": "Viajero",
            "birthDate": date.today() + timedelta(days=1),
            "docType": "CC",
            "docNumber": "987654321",
        }
        with self.assertRaises(HTTPException) as birth_error:
            clients.validate_client(
                self.client_input(companions=[companion])
            )
        self.assertIn("futura", birth_error.exception.detail)

    def test_request_rejects_invalid_dates_budget_travelers_and_destination(self):
        invalid_inputs = (
            {"start_date": "2026-11-16", "end_date": "2026-11-15"},
            {"budget_cop": 0},
            {"travelers_count": 0},
            {"destination": "  "},
        )
        for invalid in invalid_inputs:
            with self.subTest(invalid=invalid):
                with self.assertRaises(HTTPException):
                    requests.validate_request(self.request_input(**invalid))


class ReceiptValidationTests(unittest.TestCase):
    def test_decodes_valid_pdf_receipt(self):
        content = b"%PDF-1.7 test"
        data_url = "data:application/pdf;base64," + base64.b64encode(content).decode()

        suffix, decoded = bookings.decode_receipt(data_url, "receipt.pdf")

        self.assertEqual(suffix, ".pdf")
        self.assertEqual(decoded, content)

    def test_rejects_invalid_data_url_and_extension(self):
        with self.assertRaises(HTTPException) as url_error:
            bookings.decode_receipt("not-a-data-url", "receipt.pdf")
        self.assertEqual(url_error.exception.status_code, 422)

        data_url = "data:image/png;base64," + base64.b64encode(b"image").decode()
        with self.assertRaises(HTTPException) as extension_error:
            bookings.decode_receipt(data_url, "receipt.exe")
        self.assertEqual(extension_error.exception.status_code, 422)

    def test_rejects_receipts_larger_than_two_megabytes(self):
        content = b"x" * (bookings.MAX_RECEIPT_BYTES + 1)
        data_url = "data:image/png;base64," + base64.b64encode(content).decode()

        with self.assertRaises(HTTPException) as raised:
            bookings.decode_receipt(data_url, "receipt.png")

        self.assertEqual(raised.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
