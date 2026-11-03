import base64
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Annotated, get_args, get_origin, get_type_hints
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.params import Depends

from app.routers import auth, bookings, clients, dashboard, quotes, requests
from app.schemas import ClientInput, LoginInput, PaymentInput, QuoteItemInput, RequestInput, UserInput
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


class ClientAccountLinkTests(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": "user-1",
            "name": "Cliente",
            "email": "cliente@example.com",
            "role": "Cliente",
        }
        self.actor = {"id": "admin-1", "name": "Administradora", "role": "Administrador"}
        self.body = UserInput(
            name="Cliente",
            email="cliente@example.com",
            role="Cliente",
            branch="",
            password="password-seguro",
            clientPhone="3001234567",
            clientDocType="CC",
            clientDocNumber="123456789",
        )

    def test_creates_a_client_profile_for_a_new_client_account(self):
        empty_result = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        db = object()

        with (
            patch.object(auth, "execute", side_effect=[empty_result, empty_result, None]) as execute,
            patch.object(auth, "code", return_value="EXP-2026-001"),
            patch.object(auth, "new_id", return_value="client-1"),
            patch.object(auth, "audit") as audit,
        ):
            auth.ensure_client_profile(db, self.user, self.body, self.actor)

        insert = execute.call_args_list[-1]
        self.assertIn("INSERT INTO client_records", insert.args[1])
        self.assertEqual(insert.kwargs["user_id"], "user-1")
        self.assertEqual(insert.kwargs["doc_number"], "123456789")
        audit.assert_called_once_with(
            db, "client", "client-1", "Expediente creado y vinculado a cuenta", self.actor
        )

    def test_links_an_existing_expediente_by_email_without_creating_a_duplicate(self):
        missing_link = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        existing_profile = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: {"id": "client-1", "user_id": None})
        )
        db = object()

        with (
            patch.object(auth, "execute", side_effect=[missing_link, existing_profile, None]) as execute,
            patch.object(auth, "audit") as audit,
        ):
            auth.ensure_client_profile(db, self.user, self.body, self.actor)

        self.assertIn("UPDATE client_records", execute.call_args_list[-1].args[1])
        self.assertEqual(execute.call_args_list[-1].kwargs["user_id"], "user-1")
        self.assertEqual(execute.call_count, 3)
        audit.assert_called_once_with(
            db, "client", "client-1", "Cuenta de cliente vinculada", self.actor
        )

    def test_creating_a_client_user_commits_the_user_and_profile_together(self):
        user_row = self.user | {"branch": "", "avatar_url": None, "active": True}
        inserted_user = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: user_row)
        )
        no_profile = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        db = SimpleNamespace(commit=Mock(), rollback=Mock())

        with (
            patch.object(
                auth,
                "execute",
                side_effect=[inserted_user, no_profile, no_profile, None],
            ) as execute,
            patch.object(auth, "hash_password", return_value="hashed"),
            patch.object(auth, "code", return_value="EXP-2026-001"),
            patch.object(auth, "new_id", return_value="client-1"),
            patch.object(auth, "audit"),
        ):
            result = auth.create_user(self.body, db, self.actor)

        self.assertEqual(result["id"], "user-1")
        self.assertEqual(result["role"], "Cliente")
        db.commit.assert_called_once()
        db.rollback.assert_not_called()
        self.assertIn("INSERT INTO client_records", execute.call_args_list[-1].args[1])

    def test_missing_profile_data_rolls_back_client_account_creation(self):
        user_row = self.user | {"branch": "", "avatar_url": None, "active": True}
        inserted_user = SimpleNamespace(
            mappings=lambda: SimpleNamespace(one=lambda: user_row)
        )
        no_profile = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        db = SimpleNamespace(commit=Mock(), rollback=Mock())
        incomplete = self.body.model_copy(
            update={"client_phone": None, "client_doc_type": None, "client_doc_number": None}
        )

        with (
            patch.object(
                auth, "execute", side_effect=[inserted_user, no_profile, no_profile]
            ),
            patch.object(auth, "hash_password", return_value="hashed"),
        ):
            with self.assertRaises(HTTPException):
                auth.create_user(incomplete, db, self.actor)

        db.commit.assert_not_called()
        db.rollback.assert_called_once()

    def test_rejects_a_new_client_account_without_required_profile_data(self):
        empty_result = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        incomplete = self.body.model_copy(
            update={"client_phone": None, "client_doc_type": None, "client_doc_number": None}
        )

        with (
            patch.object(auth, "execute", side_effect=[empty_result, empty_result]) as execute,
            patch.object(auth, "code") as code,
        ):
            with self.assertRaises(HTTPException) as raised:
                auth.ensure_client_profile(object(), self.user, incomplete, self.actor)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("teléfono y documento", raised.exception.detail)
        self.assertEqual(execute.call_count, 2)
        code.assert_not_called()

    def test_does_not_link_an_expediente_already_owned_by_another_user(self):
        missing_link = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: None))
        other_owner = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: {"id": "client-1", "user_id": "user-2"})
        )

        with patch.object(auth, "execute", side_effect=[missing_link, other_owner]) as execute:
            with self.assertRaises(HTTPException) as raised:
                auth.ensure_client_profile(object(), self.user, self.body, self.actor)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(execute.call_count, 2)


class RoleAccessTests(unittest.TestCase):
    ROLES = ("Administrador", "Asesor", "Contabilidad", "Cliente")

    def endpoint_roles(self, router, path, method):
        route = next(
            route
            for route in router.routes
            if route.path == path and method in route.methods
        )
        for annotation in get_type_hints(route.endpoint, include_extras=True).values():
            if get_origin(annotation) is not Annotated:
                continue
            for metadata in get_args(annotation)[1:]:
                if (
                    isinstance(metadata, Depends)
                    and metadata.dependency.__name__ == "dependency"
                ):
                    allowed = []
                    for role in self.ROLES:
                        try:
                            metadata.dependency({"role": role})
                        except HTTPException as error:
                            self.assertEqual(error.status_code, 403)
                        else:
                            allowed.append(role)
                    return tuple(allowed)
        self.fail(f"No se encontró una dependencia de roles para {method} {path}")

    def test_api_routes_enforce_the_approved_role_matrix(self):
        expectations = (
            (clients.router, "/api/clients", "GET", ("Administrador", "Asesor", "Cliente")),
            (clients.router, "/api/clients", "POST", ("Asesor",)),
            (clients.router, "/api/clients/{client_id}", "PUT", ("Asesor", "Cliente")),
            (requests.router, "/api/requests", "GET", ("Administrador", "Asesor", "Cliente")),
            (requests.router, "/api/requests", "POST", ("Asesor", "Cliente")),
            (requests.router, "/api/requests/{request_id}", "PUT", ("Asesor", "Cliente")),
            (quotes.router, "/api/quotes", "GET", ("Administrador", "Asesor", "Cliente")),
            (quotes.router, "/api/quotes/from-request/{request_id}", "POST", ("Asesor",)),
            (
                quotes.router,
                "/api/quotes/{quote_id}/ensure-booking",
                "POST",
                ("Cliente",),
            ),
            (
                quotes.router,
                "/api/quotes/{quote_id}/approve-discount",
                "POST",
                ("Administrador",),
            ),
            (bookings.router, "/api/bookings", "GET", ("Administrador", "Asesor", "Cliente")),
            (bookings.router, "/api/bookings", "POST", ("Asesor",)),
            (
                bookings.router,
                "/api/bookings/{booking_id}/status",
                "PATCH",
                ("Asesor",),
            ),
            (
                bookings.router,
                "/api/bookings/sources",
                "GET",
                ("Asesor",),
            ),
            (
                bookings.router,
                "/api/payments",
                "GET",
                ("Administrador", "Contabilidad", "Cliente"),
            ),
            (bookings.router, "/api/payments", "POST", ("Cliente",)),
            (
                bookings.router,
                "/api/payments/{payment_id}/reconcile",
                "PATCH",
                ("Contabilidad",),
            ),
        )

        for router, path, method, roles in expectations:
            with self.subTest(path=path, method=method):
                self.assertEqual(self.endpoint_roles(router, path, method), roles)

    def test_accounting_booking_options_only_expose_payment_fields(self):
        row = {
            "id": "booking-1",
            "code": "RES-001",
            "client_id": "client-1",
            "payment_client_name": "Cliente",
            "destination": "Cartagena",
            "payment_due_date": date(2026, 11, 1),
            "total_cop": 1200000,
            "paid_cop": 300000,
            "status": "pendiente_pago",
            "conditions": "No se debe devolver",
            "notes": "No se debe devolver",
        }
        result = SimpleNamespace(mappings=lambda: [row])

        with patch.object(bookings, "execute", return_value=result):
            options = bookings.booking_options(
                db=object(),
                actor={"id": "accounting-1", "role": "Contabilidad"},
            )

        self.assertEqual(
            set(options[0]),
            {
                "id",
                "code",
                "clientId",
                "clientName",
                "destination",
                "paymentDueDate",
                "totalCOP",
                "paidCOP",
                "status",
            },
        )
        self.assertNotIn("conditions", options[0])
        self.assertNotIn("notes", options[0])

    def test_accounting_dashboard_contains_only_payment_data(self):
        result = SimpleNamespace(mappings=lambda: [])

        with patch.object(dashboard, "execute", return_value=result) as execute:
            response = dashboard.dashboard(
                db=object(),
                actor={"id": "accounting-1", "role": "Contabilidad"},
            )

        self.assertEqual(response["requests"], [])
        self.assertEqual(response["quotes"], [])
        self.assertEqual(response["bookings"], [])
        self.assertEqual(response["payments"], [])
        queried_tables = " ".join(call.args[1] for call in execute.call_args_list)
        self.assertNotIn("quotes", queried_tables)
        self.assertNotIn("travel_requests", queried_tables)
        self.assertNotIn("bookings", queried_tables)


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

    def test_client_request_uses_the_linked_client_record_not_the_submitted_id(self):
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: {"id": "a9efb1d1-5567-4e16-a4cf-90b773d70f26"})
        )
        actor = {"id": "user-1", "role": "Cliente"}

        with patch.object(requests, "execute", return_value=result) as execute:
            client_id = requests.resolve_client_id(object(), actor, "")

        self.assertEqual(client_id, "a9efb1d1-5567-4e16-a4cf-90b773d70f26")
        self.assertEqual(execute.call_args.kwargs["user_id"], "user-1")

    def test_client_without_linked_record_gets_actionable_conflict(self):
        result = SimpleNamespace(
            mappings=lambda: SimpleNamespace(first=lambda: None)
        )
        actor = {"id": "user-1", "role": "Cliente"}

        with patch.object(requests, "execute", return_value=result):
            with self.assertRaises(HTTPException) as raised:
                requests.resolve_client_id(object(), actor, "")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("expediente de cliente vinculado", raised.exception.detail)

    def test_staff_request_rejects_malformed_client_id_without_querying_database(self):
        with patch.object(requests, "execute") as execute:
            with self.assertRaises(HTTPException) as raised:
                requests.resolve_client_id(
                    object(), {"id": "advisor-1", "role": "Asesor"}, ""
                )

        self.assertEqual(raised.exception.status_code, 422)
        execute.assert_not_called()

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
