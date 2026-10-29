import { canAccess, listUsers } from "./auth";
import { listRequests, type RequestActor } from "./requests";
import { listQuotes } from "./quotes";
import { listBookings, listPayments } from "./bookings";

export interface RadarCity {
  code: string;
  city: string;
  country: string;
  timeZone: string;
  tempC: number;
  condition: string;
  isHub?: boolean;
  imageUrl: string;
}

export interface RadarPulse {
  passengersInFlight: number;
  landingsToday: number;
  itineraryAlerts: number;
}

export interface TravelOffer {
  id: string;
  destination: string;
  country: string;
  title: string;
  includes: string;
  duration: string;
  badge: string;
  priceCOP: number;
  previousPriceCOP: number;
  imageUrl: string;
}

export const TRAVEL_OFFERS: TravelOffer[] = [
  {
    id: "offer-cancun",
    destination: "Cancún & Riviera Maya",
    country: "México",
    title: "6 días frente al mar Caribe con tiquetes, comidas y traslados resueltos",
    includes: "Vuelo directo desde Bogotá, 5 noches en hotel 5 estrellas y transporte aeropuerto–hotel",
    duration: "6 días / 5 noches",
    badge: "Ahorra 25% esta semana",
    priceCOP: 4850000,
    previousPriceCOP: 6450000,
    imageUrl: "https://images.unsplash.com/photo-1552074284-5e88ef1aef18?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "offer-madrid",
    destination: "Madrid & Andalucía",
    country: "España",
    title: "De Madrid a Sevilla en tren de alta velocidad con hoteles céntricos",
    includes: "Tiquetes ida y regreso, 7 noches con desayuno y billetes AVE reservados",
    duration: "8 días / 7 noches",
    badge: "Últimos 6 cupos",
    priceCOP: 7900000,
    previousPriceCOP: 9200000,
    imageUrl: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "offer-cartagena",
    destination: "Cartagena de Indias",
    country: "Colombia",
    title: "Casa boutique dentro de la ciudad amurallada y día en Islas del Rosario",
    includes: "Vuelos nacionales, 3 noches con desayuno artesanal y lancha ida y vuelta al archipiélago",
    duration: "4 días / 3 noches",
    badge: "Salidas cada jueves",
    priceCOP: 2350000,
    previousPriceCOP: 2950000,
    imageUrl: "https://images.unsplash.com/photo-1583531352515-8884af319dc1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "offer-tokio",
    destination: "Tokio & Kioto",
    country: "Japón",
    title: "10 días conectando barrios de Tokio y templos de Kioto en tren bala",
    includes: "Vuelos internacionales, 9 noches de alojamiento y pase ilimitado JR Rail por 7 días",
    duration: "10 días / 9 noches",
    badge: "Tarifa preventa 2026",
    priceCOP: 12400000,
    previousPriceCOP: 14500000,
    imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80",
  },
];

export const RADAR_CITIES: RadarCity[] = [
  {
    code: "BOG",
    city: "Bogotá",
    country: "Hora local · Base",
    timeZone: "America/Bogota",
    tempC: 15,
    condition: "Parcialmente nublado",
    isHub: true,
    imageUrl: "https://images.unsplash.com/photo-1568632234157-ce7aecd03d0d?auto=format&fit=crop&w=900&q=80",
  },
  {
    code: "MAD",
    city: "Madrid",
    country: "España · Top destino",
    timeZone: "Europe/Madrid",
    tempC: 18,
    condition: "Cielo despejado",
    imageUrl: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=900&q=80",
  },
  {
    code: "CUN",
    city: "Cancún",
    country: "México · Top destino",
    timeZone: "America/Cancun",
    tempC: 29,
    condition: "Soleado cálido",
    imageUrl: "https://images.unsplash.com/photo-1552074284-5e88ef1aef18?auto=format&fit=crop&w=900&q=80",
  },
  {
    code: "HND",
    city: "Tokio",
    country: "Japón · Top destino",
    timeZone: "Asia/Tokyo",
    tempC: 14,
    condition: "Brisa ligera",
    imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=900&q=80",
  },
];

export const DEFAULT_RADAR_PULSE: RadarPulse = {
  passengersInFlight: 14,
  landingsToday: 3,
  itineraryAlerts: 2,
};

export async function getDashboard(actor: RequestActor) {
  const [requests, quotes, bookings, payments, users] = await Promise.all([
    canAccess(actor.role, "/solicitudes") ? listRequests(actor) : [],
    listQuotes(actor),
    canAccess(actor.role, "/reservas") ? listBookings(actor) : [],
    canAccess(actor.role, "/pagos") ? listPayments(actor) : [],
    actor.role === "Administrador" ? listUsers(actor) : [],
  ]);
  return {
    requests,
    quotes,
    bookings,
    payments,
    users,
    radar: {
      cities: RADAR_CITIES,
      pulse: DEFAULT_RADAR_PULSE,
    },
  };
}