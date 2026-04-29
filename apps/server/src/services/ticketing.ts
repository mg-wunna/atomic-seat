import { In, LessThanOrEqual } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../data-source.js";
import type { Concert, Reservation, Ticket } from "../entities.js";
import { ConcertEntity, ReservationEntity, TicketEntity } from "../entities.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { getCheckoutReturnUrl, getStripeClient } from "../stripe.js";

export const ReserveRequestSchema = z.object({
  concertId: z.string().min(1),
  userId: z.string().min(1),
  category: z.enum(["VIP", "General"]).optional().default("General"),
  ticketId: z.string().min(1).optional(),
  simulateFailure: z.boolean().optional(),
});

export const PurchaseRequestSchema = z.object({
  reservationId: z.string().min(1),
});

export const CleanupRequestSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

export const StripeCheckoutRequestSchema = z
  .object({
    reservationId: z.string().min(1).optional(),
    reservationIds: z.array(z.string().min(1)).min(1).max(8).optional(),
  })
  .refine((value) => value.reservationId || value.reservationIds?.length, {
    message: "reservationId or reservationIds is required",
  });

export const StripeConfirmRequestSchema = z
  .object({
    reservationId: z.string().min(1).optional(),
    reservationIds: z.array(z.string().min(1)).min(1).max(8).optional(),
    sessionId: z.string().min(1),
  })
  .refine((value) => value.reservationId || value.reservationIds?.length, {
    message: "reservationId or reservationIds is required",
  });

function ticketNumber(ticket: Ticket) {
  return Number(ticket.id.split("-").at(-1) ?? "0");
}

function getTicketZone(ticket: Ticket) {
  const number = ticketNumber(ticket);
  if (ticket.category === "VIP") return number % 2 === 1 ? "Zone A" : "Zone B";
  return "Zone C";
}

function getTicketPriceCents(ticket: Ticket) {
  const zone = getTicketZone(ticket);
  if (zone === "Zone A") return 25_000;
  if (zone === "Zone B") return 23_000;
  return 8_500;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function toConcertDto(
  concert: Concert,
  counts: { pending: number; sold: number; vip: number; general: number },
) {
  return {
    id: concert.id,
    name: concert.title,
    title: concert.title,
    venue: concert.venue,
    startsAt: concert.startsAt.toISOString(),
    totalStock: concert.totalStock,
    availableStock: concert.availableStock,
    inventory: {
      vipAvailable: counts.vip,
      generalAvailable: counts.general,
      totalAvailable: concert.availableStock,
      pending: counts.pending,
      sold: counts.sold,
    },
  };
}

function toReservationDto(
  reservation: Reservation,
  concertTitle = "",
  category: "VIP" | "General" = "General",
) {
  return {
    id: reservation.id,
    concertId: reservation.concertId,
    concertName: concertTitle,
    ticketId: reservation.ticketId,
    userId: reservation.userId,
    category,
    quantity: 1,
    status: reservation.status,
    amountCents: reservation.amountCents,
    paymentStatus: reservation.paymentStatus,
    paymentId: reservation.paymentId,
    checkoutSessionId: reservation.checkoutSessionId,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
  };
}

async function getCounts(concertId: string) {
  const ticketRepo = AppDataSource.getRepository<Ticket>(TicketEntity);
  const [pending, sold, vip, general] = await Promise.all([
    ticketRepo.countBy({ concertId, status: "HELD" }),
    ticketRepo.countBy({ concertId, status: "SOLD" }),
    ticketRepo.countBy({ concertId, status: "AVAILABLE", category: "VIP" }),
    ticketRepo.countBy({ concertId, status: "AVAILABLE", category: "General" }),
  ]);
  return { pending, sold, vip, general };
}

export async function listConcerts(params: { search?: string } = {}) {
  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const query = concertRepo.createQueryBuilder("concert").orderBy("concert.startsAt", "ASC");
  if (params.search) {
    query.where("LOWER(concert.title) LIKE LOWER(:search)", { search: `%${params.search}%` });
  }
  const concerts = await query.getMany();
  return Promise.all(
    concerts.map(async (concert) => toConcertDto(concert, await getCounts(concert.id))),
  );
}

export async function getConcert(id: string) {
  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const concert = await concertRepo.findOneBy({ id });
  if (!concert) throw notFound("Concert not found");

  const recentReservations = await listReservations({ concertId: id, limit: 8 });
  return { ...toConcertDto(concert, await getCounts(concert.id)), recentReservations };
}

function toSeatCode(ticket: Ticket) {
  const rawNumber = String(ticketNumber(ticket) || ticket.id.slice(-3));
  const prefix = ticket.category === "VIP" ? "V" : "G";
  return `${prefix}-${rawNumber.padStart(3, "0")}`;
}

export async function listSeats(concertId: string) {
  await cleanup({ limit: 100 });

  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const ticketRepo = AppDataSource.getRepository<Ticket>(TicketEntity);
  const concert = await concertRepo.findOneBy({ id: concertId });
  if (!concert) throw notFound("Concert not found");

  const tickets = await ticketRepo.find({
    where: { concertId },
    order: { category: "DESC", id: "ASC" },
  });

  return {
    concert: toConcertDto(concert, await getCounts(concert.id)),
    seats: tickets.map((ticket, index) => ({
      id: ticket.id,
      code: toSeatCode(ticket),
      category: ticket.category,
      zone: getTicketZone(ticket),
      status: ticket.status,
      reservationId: ticket.reservationId,
      row: ticket.category === "VIP" ? getTicketZone(ticket) : `Row ${Math.floor(index / 10) + 1}`,
      priceCents: getTicketPriceCents(ticket),
    })),
  };
}

export async function listReservations(params: { concertId?: string; limit?: number } = {}) {
  const reservationRepo = AppDataSource.getRepository<Reservation>(ReservationEntity);
  const query = reservationRepo
    .createQueryBuilder("reservation")
    .orderBy("reservation.createdAt", "DESC")
    .limit(params.limit ?? 100);

  if (params.concertId) {
    query.where("reservation.concertId = :concertId", { concertId: params.concertId });
  }

  const reservations = await query.getMany();
  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const ticketRepo = AppDataSource.getRepository<Ticket>(TicketEntity);
  const concertIds = [...new Set(reservations.map((reservation) => reservation.concertId))];
  const ticketIds = [...new Set(reservations.map((reservation) => reservation.ticketId))];
  const concerts = await concertRepo
    .createQueryBuilder("concert")
    .where(concertIds.length > 0 ? "concert.id IN (:...concertIds)" : "1 = 0", { concertIds })
    .getMany();
  const tickets = await ticketRepo
    .createQueryBuilder("ticket")
    .where(ticketIds.length > 0 ? "ticket.id IN (:...ticketIds)" : "1 = 0", { ticketIds })
    .getMany();
  const titles = new Map(concerts.map((concert) => [concert.id, concert.title]));
  const categories = new Map(tickets.map((ticket) => [ticket.id, ticket.category]));

  return reservations.map((reservation) =>
    toReservationDto(
      reservation,
      titles.get(reservation.concertId),
      categories.get(reservation.ticketId),
    ),
  );
}

export async function reserve(input: unknown) {
  const parsed = ReserveRequestSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid reservation request", parsed.error.flatten());

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const concertRepo = queryRunner.manager.getRepository<Concert>(ConcertEntity);
    const ticketRepo = queryRunner.manager.getRepository<Ticket>(TicketEntity);
    const reservationRepo = queryRunner.manager.getRepository<Reservation>(ReservationEntity);

    const concert = await concertRepo.findOneBy({ id: parsed.data.concertId });
    if (!concert) throw notFound("Concert not found");
    if (concert.availableStock <= 0) throw conflict("Stock is 0");

    const ticket = parsed.data.ticketId
      ? await ticketRepo.findOne({
          where: {
            id: parsed.data.ticketId,
            concertId: parsed.data.concertId,
            category: parsed.data.category,
            status: "AVAILABLE",
          },
        })
      : await ticketRepo.findOne({
          where: {
            concertId: parsed.data.concertId,
            category: parsed.data.category,
            status: "AVAILABLE",
          },
          order: { createdAt: "ASC" },
        });
    if (!ticket) throw conflict("No available ticket for this category");

    concert.availableStock -= 1;
    await concertRepo.save(concert);

    if (parsed.data.simulateFailure) {
      throw new Error("Simulated reservation failure after stock decrement");
    }

    const reservation = reservationRepo.create({
      id: crypto.randomUUID(),
      concertId: concert.id,
      ticketId: ticket.id,
      userId: parsed.data.userId,
      status: "PENDING",
      expiresAt: addMinutes(new Date(), 5),
      amountCents: getTicketPriceCents(ticket),
      paymentStatus: "UNPAID",
      paymentId: null,
      checkoutSessionId: null,
      createdAt: new Date(),
    });
    await reservationRepo.save(reservation);

    ticket.status = "HELD";
    ticket.reservationId = reservation.id;
    await ticketRepo.save(ticket);

    await queryRunner.commitTransaction();

    return {
      reservationId: reservation.id,
      concertId: concert.id,
      userId: reservation.userId,
      status: "PENDING" as const,
      expiresAt: reservation.expiresAt.toISOString(),
      amountCents: reservation.amountCents,
      tickets: [{ id: ticket.id, seatCode: toSeatCode(ticket), category: ticket.category }],
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function purchase(input: unknown) {
  const parsed = PurchaseRequestSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid purchase request", parsed.error.flatten());

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const result = await completePendingReservation(
      parsed.data.reservationId,
      "manual_purchase",
      queryRunner.manager,
    );
    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function completePendingReservation(
  reservationId: string,
  paymentId: string,
  manager = AppDataSource.manager,
) {
  const reservationRepo = manager.getRepository<Reservation>(ReservationEntity);
  const ticketRepo = manager.getRepository<Ticket>(TicketEntity);
  const concertRepo = manager.getRepository<Concert>(ConcertEntity);

  const reservation = await reservationRepo.findOneBy({ id: reservationId });
  if (!reservation) throw notFound("Reservation not found");
  if (reservation.status === "COMPLETED") throw conflict("Reservation already completed");
  if (reservation.status === "EXPIRED") throw conflict("Reservation expired");

  if (reservation.expiresAt <= new Date()) {
    const concert = await concertRepo.findOneBy({ id: reservation.concertId });
    const ticket = await ticketRepo.findOneBy({ id: reservation.ticketId });
    reservation.status = "EXPIRED";
    await reservationRepo.save(reservation);
    if (ticket && ticket.status === "HELD") {
      ticket.status = "AVAILABLE";
      ticket.reservationId = null;
      await ticketRepo.save(ticket);
      if (concert) {
        concert.availableStock += 1;
        await concertRepo.save(concert);
      }
    }
    throw conflict("Reservation expired");
  }

  reservation.status = "COMPLETED";
  reservation.paymentStatus = "PAID";
  reservation.paymentId = paymentId;
  await reservationRepo.save(reservation);

  const ticket = await ticketRepo.findOneBy({ id: reservation.ticketId });
  if (ticket) {
    ticket.status = "SOLD";
    await ticketRepo.save(ticket);
  }

  return {
    reservationId: reservation.id,
    status: "COMPLETED" as const,
    purchasedAt: new Date().toISOString(),
  };
}

export async function cleanup(input: unknown) {
  const parsed = CleanupRequestSchema.safeParse(input ?? {});
  if (!parsed.success) throw badRequest("Invalid cleanup request", parsed.error.flatten());

  const reservationRepo = AppDataSource.getRepository<Reservation>(ReservationEntity);
  const expired = await reservationRepo.find({
    where: { status: "PENDING", expiresAt: LessThanOrEqual(new Date()) },
    take: parsed.data.limit ?? 100,
  });

  if (expired.length === 0) return { expiredReservations: 0, releasedTickets: 0 };

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    let releasedTickets = 0;
    const concertRepo = queryRunner.manager.getRepository<Concert>(ConcertEntity);
    const ticketRepo = queryRunner.manager.getRepository<Ticket>(TicketEntity);
    const txReservationRepo = queryRunner.manager.getRepository<Reservation>(ReservationEntity);

    for (const pending of expired) {
      const reservation = await txReservationRepo.findOneBy({ id: pending.id, status: "PENDING" });
      if (!reservation) continue;
      const ticket = await ticketRepo.findOneBy({ id: reservation.ticketId });
      const concert = await concertRepo.findOneBy({ id: reservation.concertId });

      reservation.status = "EXPIRED";
      await txReservationRepo.save(reservation);

      if (ticket && ticket.status === "HELD") {
        ticket.status = "AVAILABLE";
        ticket.reservationId = null;
        await ticketRepo.save(ticket);
        releasedTickets += 1;
        if (concert) {
          concert.availableStock += 1;
          await concertRepo.save(concert);
        }
      }
    }

    await queryRunner.commitTransaction();
    return { expiredReservations: expired.length, releasedTickets };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function createStripeCheckout(input: unknown, requestOrigin?: string | null) {
  const parsed = StripeCheckoutRequestSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Invalid Stripe checkout request", parsed.error.flatten());

  const reservationRepo = AppDataSource.getRepository<Reservation>(ReservationEntity);
  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const reservationIds = parsed.data.reservationIds ?? [parsed.data.reservationId as string];
  const reservations = await reservationRepo.findBy({ id: In(reservationIds) });
  if (reservations.length !== reservationIds.length) throw notFound("Reservation not found");
  if (reservations.some((reservation) => reservation.status !== "PENDING")) {
    throw conflict("Reservation is not payable");
  }
  if (reservations.some((reservation) => reservation.expiresAt <= new Date())) {
    throw conflict("Reservation expired");
  }

  const stripe = getStripeClient();
  if (!stripe)
    throw badRequest("Stripe is not configured. Add STRIPE_SECRET_KEY to .env.development.");

  const concertIds = [...new Set(reservations.map((reservation) => reservation.concertId))];
  const concerts = await concertRepo.findBy({ id: In(concertIds) });
  const concertTitles = new Map(concerts.map((concert) => [concert.id, concert.title]));
  const dashboardUrl = getCheckoutReturnUrl(requestOrigin);
  const reservationParam = encodeURIComponent(reservationIds.join(","));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: reservationIds[0],
    success_url: `${dashboardUrl}/reserve?stripe=success&reservationIds=${reservationParam}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${dashboardUrl}/reserve?stripe=cancelled&reservationIds=${reservationParam}`,
    metadata: { reservationIds: reservationIds.join(","), product: "AtomicSeat" },
    custom_text: {
      submit: {
        message: "AtomicSeat test checkout. Use Stripe test card 4242 4242 4242 4242.",
      },
    },
    line_items: reservations.map((reservation) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${concertTitles.get(reservation.concertId) ?? "AtomicSeat"} ticket`,
        },
        unit_amount: reservation.amountCents,
      },
      quantity: 1,
    })),
  });

  if (!session.url) throw badRequest("Stripe did not return a Checkout URL");

  await reservationRepo.save(
    reservations.map((reservation) => ({
      ...reservation,
      paymentStatus: "CHECKOUT_CREATED" as const,
      checkoutSessionId: session.id,
    })),
  );

  return { sessionId: session.id, url: session.url };
}

export async function confirmStripePayment(input: unknown) {
  const parsed = StripeConfirmRequestSchema.safeParse(input);
  if (!parsed.success)
    throw badRequest("Invalid Stripe confirmation request", parsed.error.flatten());

  const stripe = getStripeClient();
  if (!stripe)
    throw badRequest("Stripe is not configured. Add STRIPE_SECRET_KEY to .env.development.");

  const reservationIds = parsed.data.reservationIds ?? [parsed.data.reservationId as string];
  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
  if (session.metadata?.reservationIds !== reservationIds.join(",")) {
    throw conflict("Stripe session does not match reservation");
  }
  if (session.payment_status !== "paid") throw badRequest("Stripe payment has not completed");

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const completed = [];
    for (const reservationId of reservationIds) {
      completed.push(
        await completePendingReservation(
          reservationId,
          `stripe_${session.id}`,
          queryRunner.manager,
        ),
      );
    }
    await queryRunner.commitTransaction();
    return {
      reservationIds,
      status: "COMPLETED" as const,
      completed,
      purchasedAt: new Date().toISOString(),
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function metrics() {
  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const ticketRepo = AppDataSource.getRepository<Ticket>(TicketEntity);
  const reservationRepo = AppDataSource.getRepository<Reservation>(ReservationEntity);
  const [concerts, tickets, available, pending, completed, expired] = await Promise.all([
    concertRepo.count(),
    ticketRepo.count(),
    ticketRepo.countBy({ status: "AVAILABLE" }),
    reservationRepo.countBy({ status: "PENDING" }),
    reservationRepo.countBy({ status: "COMPLETED" }),
    reservationRepo.countBy({ status: "EXPIRED" }),
  ]);
  return { concerts, tickets, available, pending, completed, expired };
}

export async function explainCleanupQuery() {
  return AppDataSource.query(
    "EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING'",
  );
}
