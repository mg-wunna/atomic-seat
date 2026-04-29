"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const DOCS_URL = `${API_URL}/docs`;

const images = {
  hero: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1800&q=84",
  detail:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=84",
};

const testCardNumber = "4242 4242 4242 4242";
const seatRowPatterns: Record<string, number[]> = {
  "Zone A": [4, 5],
  "Zone B": [5, 4],
  "Zone C": [8, 10, 12, 12, 12, 12, 10, 8, 6],
};

type Category = "VIP" | "General";
type SeatStatus = "AVAILABLE" | "HELD" | "SOLD";

type Concert = {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  inventory: {
    vipAvailable: number;
    generalAvailable: number;
    totalAvailable: number;
    pending: number;
    sold: number;
  };
};

type Seat = {
  id: string;
  code: string;
  category: Category;
  zone: string;
  status: SeatStatus;
  row: string;
  priceCents: number;
};

type SeatMap = {
  concert: Concert;
  seats: Seat[];
};

type Hold = {
  reservationId: string;
  expiresAt: string;
  amountCents: number;
  tickets: Array<{ id: string; seatCode: string; category: Category }>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Request failed");
  return payload.data as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

function toSeatRows(zone: string, seats: Seat[]) {
  const pattern = seatRowPatterns[zone] ?? [seats.length];
  let cursor = 0;
  return pattern
    .map((size) => {
      const row = seats.slice(cursor, cursor + size);
      cursor += size;
      return row;
    })
    .filter((row) => row.length > 0);
}

function Countdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Date.parse(expiresAt) - Date.now());
      setRemaining(next);
      if (next === 0) {
        window.clearInterval(timer);
        onExpired();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return (
    <strong>
      {remaining === 0 ? "Expired" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </strong>
  );
}

export default function ReservePage() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState("");
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("mgwunna.mw@icloud.com");
  const [holds, setHolds] = useState<Hold[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    api<Concert[]>("/concerts")
      .then((data) => {
        setConcerts(data);
        setSelectedConcertId(params.get("concert") || data[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load concerts"));
  }, []);

  useEffect(() => {
    if (!selectedConcertId) return;
    setSelectedSeatIds([]);
    setHolds([]);
    api<SeatMap>(`/concerts/${selectedConcertId}/seats`)
      .then(setSeatMap)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load seats"));
  }, [selectedConcertId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reservationId = params.get("reservationId");
    const reservationIds = params.get("reservationIds");
    const sessionId = params.get("session_id");
    const ids =
      reservationIds?.split(",").filter(Boolean) ?? (reservationId ? [reservationId] : []);
    if (params.get("stripe") !== "success" || ids.length === 0 || !sessionId) return;

    setLoading(true);
    api("/payment/stripe-confirm", {
      method: "POST",
      body: JSON.stringify({ reservationIds: ids, sessionId }),
    })
      .then(async () => {
        setNotice("Stripe payment verified. Your selected seats are confirmed.");
        setHolds([]);
        window.history.replaceState({}, "", window.location.pathname);
        if (selectedConcertId)
          setSeatMap(await api<SeatMap>(`/concerts/${selectedConcertId}/seats`));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Stripe confirmation failed"))
      .finally(() => setLoading(false));
  }, [selectedConcertId]);

  const seats = seatMap?.seats ?? [];
  const visibleSeats = seats;
  const selectedSeats = seats.filter((seat) => selectedSeatIds.includes(seat.id));
  const selectedConcert =
    seatMap?.concert ?? concerts.find((concert) => concert.id === selectedConcertId);
  const seatCounts = useMemo(
    () => ({
      available: visibleSeats.filter((seat) => seat.status === "AVAILABLE").length,
      held: visibleSeats.filter((seat) => seat.status === "HELD").length,
      sold: visibleSeats.filter((seat) => seat.status === "SOLD").length,
    }),
    [visibleSeats],
  );
  const zoneGroups = useMemo(() => {
    const groups = new Map<string, Seat[]>();
    for (const seat of visibleSeats) {
      groups.set(seat.zone, [...(groups.get(seat.zone) ?? []), seat]);
    }
    return [...groups.entries()].map(([zone, zoneSeats]) => ({
      zone,
      seats: zoneSeats,
      priceCents: zoneSeats[0]?.priceCents ?? 0,
      available: zoneSeats.filter((seat) => seat.status === "AVAILABLE").length,
    }));
  }, [visibleSeats]);
  const selectedTotalCents = selectedSeats.reduce((sum, seat) => sum + seat.priceCents, 0);
  const heldTotalCents = holds.reduce((sum, hold) => sum + hold.amountCents, 0);
  const firstHold = holds[0];
  const zoneMap = new Map(zoneGroups.map((group) => [group.zone, group]));
  const mapZones = ["Zone A", "Zone B", "Zone C"];

  async function reloadSeats() {
    if (!selectedConcertId) return;
    setSeatMap(await api<SeatMap>(`/concerts/${selectedConcertId}/seats`));
    setConcerts(await api<Concert[]>("/concerts"));
  }

  async function releaseExpiredHold() {
    setHolds([]);
    setSelectedSeatIds([]);
    setNotice("The five-minute hold expired. The seats are available again.");
    await api("/cleanup", { method: "POST", body: JSON.stringify({ limit: 100 }) }).catch(
      () => undefined,
    );
    await reloadSeats().catch(() => undefined);
  }

  function toggleSeat(seat: Seat) {
    setSelectedSeatIds((current) =>
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : [...current, seat.id].slice(0, 6),
    );
  }

  async function reserveSeats() {
    if (!selectedConcert || selectedSeats.length === 0) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const nextHolds: Hold[] = [];
      for (const seat of selectedSeats) {
        nextHolds.push(
          await api<Hold>("/reserve", {
            method: "POST",
            body: JSON.stringify({
              concertId: selectedConcert.id,
              userId: buyerEmail,
              category: seat.category,
              ticketId: seat.id,
            }),
          }),
        );
      }
      setHolds(nextHolds);
      setNotice(`${nextHolds.length} seat${nextHolds.length === 1 ? "" : "s"} held for 5 minutes.`);
      await reloadSeats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setLoading(false);
    }
  }

  async function payWithStripe() {
    if (holds.length === 0) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setError("Allow pop-ups to open Stripe Checkout.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await api<{ url: string }>("/payment/stripe-checkout", {
        method: "POST",
        body: JSON.stringify({ reservationIds: holds.map((hold) => hold.reservationId) }),
      });
      tab.location.href = session.url;
      setNotice("Stripe Checkout opened. Copy the test card below if needed.");
    } catch (err) {
      tab.close();
      setError(err instanceof Error ? err.message : "Stripe checkout failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setNotice(`Copied ${value}`);
  }

  return (
    <main className="reserve-page">
      <header
        className="reserve-hero"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(7,8,12,.9), rgba(7,8,12,.62), rgba(7,8,12,.26)), url(${images.hero})`,
        }}
      >
        <nav className="site-shell floating-nav">
          <a className="brand mark-on-dark" href="/" aria-label="AtomicSeat home">
            <img src="/logo.svg" alt="" />
            AtomicSeat
          </a>
          <div className="nav-links nav-on-dark">
            <a href="/">Showcase</a>
            <a href={DOCS_URL}>API docs</a>
          </div>
        </nav>
        <div className="site-shell reserve-hero-copy">
          <p className="eyebrow">Seat selection</p>
          <h1>Pick the exact seat you want to hold.</h1>
          <p>
            Choose a concert, inspect the live seat map, reserve up to six seats for five minutes,
            then complete payment before the hold expires.
          </p>
        </div>
      </header>

      <section className="site-shell booking-shell">
        <section className="seat-stage">
          <div className="stage-image">
            <img src={images.detail} alt="" />
            <div>
              <span>Stage</span>
              <strong>{selectedConcert?.name ?? "Select concert"}</strong>
            </div>
          </div>

          <div className="seat-toolbar">
            <div>
              <span>{seatCounts.available} available</span>
              <span>{seatCounts.held} held</span>
              <span>{seatCounts.sold} sold</span>
            </div>
            <strong>Live seating</strong>
          </div>

          <section className="zone-pricing" aria-label="Zone pricing">
            {zoneGroups.map((group) => (
              <button className="zone-price" key={group.zone} type="button">
                <span>{group.zone}</span>
                <strong>{money(group.priceCents)}</strong>
                <small>{group.available} available</small>
              </button>
            ))}
          </section>

          <section className="seat-legend" aria-label="Seat legend">
            <span className="legend-dot zone-a" /> Zone A
            <span className="legend-dot zone-b" /> Zone B
            <span className="legend-dot zone-c" /> Zone C
            <span className="legend-dot selected-dot" /> Selected
            <span className="legend-dot unavailable-dot" /> Held/Sold
          </section>

          <section className="venue-map" aria-label="Live venue seat map">
            <div className="scene">
              <span>SCENE</span>
            </div>
            <div className="venue-zones">
              {mapZones.map((zone) => {
                const group = zoneMap.get(zone);
                if (!group) return null;
                return (
                  <section
                    className={`seat-zone ${zone.toLowerCase().replaceAll(" ", "-")}`}
                    key={group.zone}
                  >
                    <header>
                      <span>{group.zone}</span>
                      <strong>{money(group.priceCents)}</strong>
                    </header>
                    <div className="zone-seats">
                      {toSeatRows(group.zone, group.seats).map((row) => (
                        <div className="seat-row" key={`${group.zone}-${row[0]?.id ?? "empty"}`}>
                          {row.map((seat) => (
                            <button
                              aria-label={`${seat.code} ${seat.zone} ${seat.status}`}
                              className={`seat ${seat.status.toLowerCase()} ${selectedSeatIds.includes(seat.id) ? "selected" : ""}`}
                              disabled={seat.status !== "AVAILABLE" || holds.length > 0}
                              key={seat.id}
                              onClick={() => toggleSeat(seat)}
                              type="button"
                            >
                              <span>{seat.code}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </section>

        <aside className="booking-rail">
          <div className="booking-sidebar">
            <span className="panel-label">Concert</span>
            <div className="concert-stack">
              {concerts.map((concert) => (
                <button
                  className={
                    concert.id === selectedConcertId ? "concert-tile active" : "concert-tile"
                  }
                  key={concert.id}
                  onClick={() => setSelectedConcertId(concert.id)}
                  type="button"
                >
                  <strong>{concert.name}</strong>
                  <span>{concert.venue}</span>
                  <small>{formatDate(concert.startsAt)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="checkout-panel">
            <span className="panel-label">Checkout</span>
            <h2>
              {selectedSeats.length > 0
                ? `${selectedSeats.length} seat${selectedSeats.length === 1 ? "" : "s"} selected`
                : "Select seats"}
            </h2>
            <p>
              {selectedSeats.length > 0
                ? `${selectedSeats.map((seat) => seat.code).join(", ")} / ${money(selectedTotalCents)}`
                : "Choose up to 6 available seats. Higher-demand zones closer to the stage cost more."}
            </p>

            <label>
              Buyer email
              <input
                type="email"
                value={buyerEmail}
                onChange={(event) => setBuyerEmail(event.target.value)}
              />
            </label>

            <button
              className="reserve-button"
              disabled={selectedSeats.length === 0 || holds.length > 0 || loading}
              onClick={reserveSeats}
              type="button"
            >
              {loading ? "Working..." : `Reserve ${selectedSeats.length || ""} selected`}
            </button>

            {firstHold && (
              <div className="active-hold">
                <span>Hold expires in</span>
                <Countdown expiresAt={firstHold.expiresAt} onExpired={releaseExpiredHold} />
                <small>
                  {holds.length} seat{holds.length === 1 ? "" : "s"} / {money(heldTotalCents)} due
                  before TTL ends
                </small>
                <button onClick={payWithStripe} type="button">
                  Pay with Stripe
                </button>
              </div>
            )}

            <div className="test-card">
              <div>
                <span>Click to copy</span>
                <strong>Stripe test payment</strong>
              </div>
              <button
                aria-label="Copy Stripe test card number"
                onClick={() => copy(testCardNumber)}
                type="button"
              >
                <span>
                  <small>Card number</small>
                  <strong>{testCardNumber}</strong>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <rect x="8" y="8" width="10" height="10" rx="2" />
                  <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <div className="test-card-help">
                <span>
                  <small>Expiry</small>
                  <strong>Use any future date</strong>
                </span>
                <span>
                  <small>CVC</small>
                  <strong>Use any 3 digits</strong>
                </span>
              </div>
            </div>

            {notice && <p className="form-success">{notice}</p>}
            {error && <p className="form-error">{error}</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}
