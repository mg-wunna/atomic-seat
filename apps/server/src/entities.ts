import { EntitySchema } from "typeorm";

export type Concert = {
  id: string;
  title: string;
  venue: string;
  startsAt: Date;
  totalStock: number;
  availableStock: number;
  createdAt: Date;
};

export type Ticket = {
  id: string;
  concertId: string;
  category: "VIP" | "General";
  status: "AVAILABLE" | "HELD" | "SOLD";
  reservationId: string | null;
  createdAt: Date;
};

export type Reservation = {
  id: string;
  concertId: string;
  ticketId: string;
  userId: string;
  status: "PENDING" | "COMPLETED" | "EXPIRED";
  expiresAt: Date;
  amountCents: number;
  paymentStatus: "UNPAID" | "CHECKOUT_CREATED" | "PAID";
  paymentId: string | null;
  checkoutSessionId: string | null;
  createdAt: Date;
};

export const ConcertEntity = new EntitySchema<Concert>({
  name: "Concert",
  tableName: "concerts",
  columns: {
    id: { type: String, primary: true },
    title: { type: String },
    venue: { type: String },
    startsAt: { type: Date, name: "starts_at" },
    totalStock: { type: Number, name: "total_stock" },
    availableStock: { type: Number, name: "available_stock" },
    createdAt: { type: Date, name: "created_at", createDate: true },
  },
});

export const TicketEntity = new EntitySchema<Ticket>({
  name: "Ticket",
  tableName: "tickets",
  columns: {
    id: { type: String, primary: true },
    concertId: { type: String, name: "concert_id" },
    category: { type: String, default: "General" },
    status: { type: String },
    reservationId: { type: String, name: "reservation_id", nullable: true },
    createdAt: { type: Date, name: "created_at", createDate: true },
  },
});

export const ReservationEntity = new EntitySchema<Reservation>({
  name: "Reservation",
  tableName: "reservations",
  columns: {
    id: { type: String, primary: true },
    concertId: { type: String, name: "concert_id" },
    ticketId: { type: String, name: "ticket_id" },
    userId: { type: String, name: "user_id" },
    status: { type: String },
    expiresAt: { type: Date, name: "expires_at" },
    amountCents: { type: Number, name: "amount_cents", default: 0 },
    paymentStatus: { type: String, name: "payment_status", default: "UNPAID" },
    paymentId: { type: String, name: "payment_id", nullable: true },
    checkoutSessionId: { type: String, name: "checkout_session_id", nullable: true },
    createdAt: { type: Date, name: "created_at", createDate: true },
  },
});
