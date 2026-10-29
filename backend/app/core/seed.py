from app.core.database import list_records, save_records
from app.core.security import hash_password


SEED_DATE = "2026-10-26T14:30:00.000Z"
AVATAR = "https://api.dicebear.com/9.x/initials/svg?seed="


def _users() -> list[dict]:
    users = [
        ("u1", "Laura Gómez", "admin@travelrequests.co", "admin123", "Administrador", "Bogotá - Chicó", True),
        ("u2", "Andrés Ruiz", "asesor@travelrequests.co", "asesor123", "Asesor", "Medellín - El Poblado", True),
        ("u3", "Marta Díaz", "contabilidad@travelrequests.co", "conta123", "Contabilidad", "Bogotá - Chicó", True),
        ("u4", "Carlos Pérez", "cliente@travelrequests.co", "cliente123", "Cliente", "Cali - Granada", True),
        ("u5", "Julián Ospina", "inactivo@travelrequests.co", "inactivo123", "Asesor", "Cartagena", False),
    ]
    return [
        {
            "id": user_id,
            "name": name,
            "email": email,
            "passwordHash": hash_password(password),
            "role": role,
            "avatarUrl": AVATAR + name.replace(" ", "%20"),
            "branch": branch,
            "active": active,
        }
        for user_id, name, email, password, role, branch, active in users
    ]


def _client(
    client_id: str,
    code: str,
    name: str,
    email: str,
    phone: str,
    segment: str,
    doc_number: str,
    linked: list[dict],
    companions: list[dict] | None = None,
    notes: list[str] | None = None,
) -> dict:
    return {
        "id": client_id,
        "code": code,
        "name": name,
        "email": email,
        "phone": phone,
        "type": "Persona",
        "segment": segment,
        "docType": "CC",
        "docNumber": doc_number,
        "billingAddress": "",
        "taxRegime": "",
        "companions": companions or [],
        "notes": notes or [],
        "linkedRequests": linked,
        "auditLog": [
            {
                "id": f"{client_id}-a0",
                "action": "Expediente creado",
                "user": "Laura Gómez",
                "timestamp": SEED_DATE,
            }
        ],
    }


def seed_if_empty() -> None:
    if list_records("users"):
        return

    clients = [
        _client(
            "u4", "EXP-2026-001", "Carlos Pérez", "cliente@travelrequests.co",
            "+57 300 000 0001", "Estándar", "1030000001",
            [
                {"code": "SOL-2026-001", "destination": "Cartagena", "date": "2026-11-12", "status": "Abierta"},
                {"code": "SOL-2026-004", "destination": "San Andrés", "date": "2026-10-12", "status": "Cerrada"},
            ],
            [{"id": "v1", "fullName": "Ana Pérez", "birthDate": "1994-05-18", "isMinor": False, "docType": "CC", "docNumber": "1030000004"}],
            ["Prefiere alojamiento cerca del centro histórico."],
        ),
        _client(
            "c2", "EXP-2026-002", "Valentina Torres", "valentina@example.com",
            "+57 300 000 0002", "VIP", "1030000002",
            [{"code": "SOL-2026-002", "destination": "San Andrés", "date": "2026-12-05", "status": "En cotización"}],
            [{"id": "v2", "fullName": "Sofía Torres", "birthDate": "2016-02-12", "isMinor": True, "docType": "Pasaporte", "docNumber": "DEMO0002", "passportExpiry": "2028-02-12"}],
        ),
        _client(
            "c3", "EXP-2026-003", "Diego Martínez", "diego@example.com",
            "+57 300 000 0003", "Estándar", "1030000003",
            [{"code": "SOL-2026-003", "destination": "Cartagena", "date": "2026-12-18", "status": "Abierta"}],
        ),
    ]
    save_records("users", _users())
    save_records("clients", clients)

    requests = [
        ("r1", "SOL-2026-001", "u4", "Cartagena", "2026-11-12", "2026-11-17", 4500000, 2, "Abierta", "Viaje en pareja. Preferimos un hotel cerca del centro histórico y desayuno incluido."),
        ("r2", "SOL-2026-002", "c2", "San Andrés", "2026-12-05", "2026-12-10", 7200000, 4, "En cotización", "Vacaciones en familia. Dos adultos y dos niños; habitaciones comunicadas."),
        ("r3", "SOL-2026-003", "c3", "Cartagena", "2026-12-18", "2026-12-22", 3200000, 1, "Abierta", "Viaje de descanso. Hotel con piscina y traslado desde el aeropuerto."),
        ("r4", "SOL-2026-004", "u4", "San Andrés", "2026-10-12", "2026-10-16", 5100000, 2, "Cerrada", "Solicitud finalizada. Viaje de aniversario."),
    ]
    client_index = {client["id"]: client for client in clients}
    request_records = []
    for number, (request_id, code, client_id, destination, start, end, budget, travelers, state, notes) in enumerate(requests, 1):
        client = client_index[client_id]
        request_records.append(
            {
                "id": request_id, "code": code, "clientId": client_id,
                "clientName": client["name"], "clientEmail": client["email"],
                "clientPhone": client["phone"], "destination": destination,
                "thumbnailUrl": f"https://images.unsplash.com/photo-1583531352515-8884af319dc1?auto=format&fit=crop&w=900&q=80",
                "startDate": start, "endDate": end, "budgetCOP": budget,
                "travelersCount": travelers, "status": state, "notes": notes,
                "createdBy": "Andrés Ruiz", "createdAt": SEED_DATE,
                "updatedBy": "Andrés Ruiz", "updatedAt": SEED_DATE,
                "history": [{"id": f"a{number}", "action": "Solicitud creada", "user": "Andrés Ruiz", "timestamp": SEED_DATE}],
            }
        )
    save_records("requests", request_records)

    quote_items = [
        {"id": "i1", "category": "Vuelos", "description": "Tiquete ida y regreso Bogotá – Cartagena con equipaje", "quantity": 2, "unitPriceCOP": 855000, "isAiGenerated": True, "editedByAdvisor": False},
        {"id": "i2", "category": "Alojamiento", "description": "Hotel cerca del centro histórico en Cartagena con desayuno", "quantity": 5, "unitPriceCOP": 325000, "isAiGenerated": True, "editedByAdvisor": False},
        {"id": "i3", "category": "Traslados", "description": "Traslado privado aeropuerto – hotel – aeropuerto", "quantity": 1, "unitPriceCOP": 360000, "isAiGenerated": True, "editedByAdvisor": False},
        {"id": "i4", "category": "Actividades", "description": "Recorrido guiado y experiencia local en Cartagena", "quantity": 2, "unitPriceCOP": 270000, "isAiGenerated": True, "editedByAdvisor": False},
        {"id": "i5", "category": "Asistencia", "description": "Asistencia médica integral durante el viaje", "quantity": 2, "unitPriceCOP": 135000, "isAiGenerated": True, "editedByAdvisor": False},
    ]
    save_records(
        "quotes",
        [
            {
                "id": "q1", "code": "COT-2026-001", "requestId": "r1",
                "requestBudgetCOP": 4500000, "version": 1, "clientName": "Carlos Pérez",
                "clientEmail": "cliente@travelrequests.co", "destination": "Cartagena",
                "commercialDescription": "Viaje de 5 noches en Cartagena para dos viajeros, con vuelos, alojamiento, traslados, actividades y asistencia.",
                "isDescriptionAiGenerated": True, "items": quote_items,
                "basePriceCOP": 4505000, "seasonSurchargePercent": 8, "seasonSurchargeCOP": 360400,
                "discountPercent": 5, "discountCOP": 243270, "requiresAdminApproval": False,
                "totalCOP": 4622130, "validUntil": "2026-11-30", "status": "Enviada",
                "advisorDecisionLog": "27/10/2026 · Andrés Ruiz: Cotización enviada al cliente.",
                "updatedBy": "Andrés Ruiz", "updatedAt": "2026-10-27T15:00:00.000Z",
            },
            {
                "id": "q2", "code": "COT-2026-002", "requestId": "r2",
                "requestBudgetCOP": 7200000, "version": 1, "clientName": "Valentina Torres",
                "clientEmail": "valentina@example.com", "destination": "San Andrés",
                "commercialDescription": "Vacaciones familiares en San Andrés con habitaciones comunicadas y actividades para niños.",
                "isDescriptionAiGenerated": False, "items": [
                    {"id": "i6", "category": "Vuelos", "description": "Tiquete ida y regreso Bogotá – San Andrés, tarifa con equipaje", "quantity": 4, "unitPriceCOP": 612000, "isAiGenerated": True, "editedByAdvisor": False},
                    {"id": "i7", "category": "Alojamiento", "description": "Hotel con habitaciones comunicadas", "quantity": 5, "unitPriceCOP": 640000, "isAiGenerated": True, "editedByAdvisor": True},
                    {"id": "i8", "category": "Traslados", "description": "Traslado privado aeropuerto – hotel – aeropuerto", "quantity": 1, "unitPriceCOP": 576000, "isAiGenerated": True, "editedByAdvisor": False},
                    {"id": "i9", "category": "Actividades", "description": "Recorrido guiado y experiencia local en San Andrés", "quantity": 4, "unitPriceCOP": 180000, "isAiGenerated": True, "editedByAdvisor": False},
                    {"id": "i10", "category": "Asistencia", "description": "Asistencia médica integral durante el viaje", "quantity": 4, "unitPriceCOP": 108000, "isAiGenerated": True, "editedByAdvisor": False},
                ],
                "basePriceCOP": 7376000, "seasonSurchargePercent": 15, "seasonSurchargeCOP": 1106400,
                "discountPercent": 12, "discountCOP": 1017888, "requiresAdminApproval": True,
                "totalCOP": 7464512, "validUntil": "2026-11-20", "status": "Borrador",
                "advisorDecisionLog": "27/10/2026 · Andrés Ruiz: Descuento pendiente de aprobación.",
                "updatedBy": "Andrés Ruiz", "updatedAt": "2026-10-27T15:00:00.000Z",
            },
        ],
    )
    seed_bookings()


def seed_bookings() -> None:
    conditions = "Tarifa sujeta a condiciones del proveedor aéreo y hotelero. Cambios de fecha o pasajero hasta 7 días antes de la salida."
    history = [{"id": "seed", "action": "Reserva creada", "user": "Andrés Ruiz", "timestamp": "2026-10-27T15:00:00Z"}]
    booking_records = [
        {
            "id": "b1", "code": "RES-2026-001", "quoteId": "demo-q1", "requestId": "r1",
            "clientId": "u4", "clientName": "Carlos Pérez", "destination": "Cartagena",
            "thumbnailUrl": "https://images.unsplash.com/photo-1583531352515-8884af319dc1?auto=format&fit=crop&w=900&q=80",
            "startDate": "2026-11-12", "endDate": "2026-11-17", "paymentDueDate": "2026-11-05",
            "travelersCount": 2, "travelers": [
                {"id": "u4", "fullName": "Carlos Pérez", "docType": "CC", "docNumber": "1030000001", "isMinor": False},
                {"id": "v1", "fullName": "Ana Pérez", "docType": "CC", "docNumber": "1030000004", "isMinor": False},
            ],
            "agreedItems": [
                {"id": "bi1", "category": "Vuelos", "description": "Tiquete ida y regreso Bogotá – Cartagena con equipaje", "quantity": 2, "unitPriceCOP": 855000, "isAiGenerated": True, "editedByAdvisor": False},
                {"id": "bi2", "category": "Alojamiento", "description": "Hotel centro histórico con desayuno (5 noches)", "quantity": 5, "unitPriceCOP": 460000, "isAiGenerated": True, "editedByAdvisor": False},
            ],
            "conditions": conditions, "totalCOP": 4500000, "paidCOP": 1500000,
            "status": "pendiente_pago", "notes": "Habitación doble con desayuno. Traslados incluidos.", "history": history,
        },
        {
            "id": "b2", "code": "RES-2026-002", "quoteId": "demo-q2", "requestId": "r2",
            "clientId": "c2", "clientName": "Valentina Torres", "destination": "San Andrés",
            "thumbnailUrl": "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=900&q=80",
            "startDate": "2026-12-05", "endDate": "2026-12-10", "paymentDueDate": "2026-11-28",
            "travelersCount": 4, "travelers": [
                {"id": "c2", "fullName": "Valentina Torres", "docType": "CC", "docNumber": "1030000002", "isMinor": False},
                {"id": "v2", "fullName": "Sofía Torres", "docType": "Pasaporte", "docNumber": "DEMO0002", "isMinor": True, "passportExpiry": "2028-02-12"},
            ],
            "agreedItems": [
                {"id": "bi4", "category": "Vuelos", "description": "Tiquetes ida y regreso Bogotá – San Andrés", "quantity": 4, "unitPriceCOP": 850000, "isAiGenerated": True, "editedByAdvisor": False},
                {"id": "bi5", "category": "Alojamiento", "description": "Hotel con habitaciones comunicadas (5 noches)", "quantity": 5, "unitPriceCOP": 640000, "isAiGenerated": True, "editedByAdvisor": True},
            ],
            "conditions": conditions, "totalCOP": 7200000, "paidCOP": 7200000,
            "status": "confirmada", "notes": "Habitaciones comunicadas para viaje familiar.", "history": history,
        },
    ]
    save_records("bookings", booking_records)
    save_records(
        "payments",
        [
            {"id": "p1", "code": "PAG-2026-001", "bookingId": "b1", "bookingCode": "RES-2026-001", "clientId": "u4", "clientName": "Carlos Pérez", "amountCOP": 1500000, "method": "Transferencia", "reference": "DEMO-TR-001", "date": "2026-10-27", "receiptName": "comprobante-bancolombia-001.pdf", "status": "validado", "notes": "Abono inicial.", "history": history},
            {"id": "p2", "code": "PAG-2026-002", "bookingId": "b1", "bookingCode": "RES-2026-001", "clientId": "u4", "clientName": "Carlos Pérez", "amountCOP": 3000000, "method": "Transferencia", "reference": "DEMO-TR-002", "date": "2026-10-28", "receiptName": "soporte-pse-002.pdf", "status": "por_conciliar", "notes": "Saldo pendiente de verificación.", "history": history},
            {"id": "p3", "code": "PAG-2026-003", "bookingId": "b2", "bookingCode": "RES-2026-002", "clientId": "c2", "clientName": "Valentina Torres", "amountCOP": 7200000, "method": "Consignación", "reference": "DEMO-CONS-003", "date": "2026-10-26", "receiptName": "consignacion-davivienda-003.pdf", "status": "validado", "notes": "Pago completo.", "history": history},
        ],
    )
