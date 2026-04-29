import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Status = "PENDING" | "COMPLETED" | "EXPIRED";
type Category = "VIP" | "General";

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

type Reservation = {
  id: string;
  concertId: string;
  concertName: string;
  category: Category;
  quantity: number;
  status: Status;
  amountCents: number;
  paymentStatus: "UNPAID" | "CHECKOUT_CREATED" | "PAID";
  paymentId: string | null;
  checkoutSessionId: string | null;
  expiresAt: string;
  createdAt: string;
};

type Metrics = {
  concerts: number;
  tickets: number;
  available: number;
  pending: number;
  completed: number;
  expired: number;
};

type SeedResult = {
  concerts: number;
  tickets: number;
};

type ConcertDetail = Concert & {
  recentReservations: Reservation[];
};

const emptyMetrics: Metrics = {
  concerts: 0,
  tickets: 0,
  available: 0,
  pending: 0,
  completed: 0,
  expired: 0,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request failed");
  }
  return payload.data as T;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return (
    <span className={remaining === 0 ? "countdown expired" : "countdown"}>
      {remaining === 0 ? "Expired" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status.toLowerCase()}`}>{status}</span>;
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [selectedConcertId, setSelectedConcertId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConcertDetail | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === selectedConcertId) ?? concerts[0],
    [concerts, selectedConcertId],
  );

  const loadData = useCallback(async () => {
    const [metricsData, concertData, reservationData] = await Promise.all([
      api<Metrics>("/metrics"),
      api<Concert[]>(`/concerts?upcoming=true&search=${encodeURIComponent(search)}`),
      api<Reservation[]>("/reservations"),
    ]);
    setMetrics(metricsData);
    setConcerts(concertData);
    setReservations(reservationData);
    const firstConcert = concertData[0];
    if (!selectedConcertId && firstConcert) setSelectedConcertId(firstConcert.id);
  }, [search, selectedConcertId]);

  const loadDetail = useCallback(async (concertId: string) => {
    setDetail(await api<ConcertDetail>(`/concerts/${concertId}`));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  useEffect(() => {
    if (!selectedConcert?.id) return;
    loadDetail(selectedConcert.id).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load concert"),
    );
    const timer = window.setInterval(() => {
      loadData().catch(() => undefined);
      loadDetail(selectedConcert.id).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadData, loadDetail, selectedConcert?.id]);

  async function handlePurchase(reservationId: string) {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api("/purchase", { method: "POST", body: JSON.stringify({ reservationId }) });
      setNotice("Purchase completed.");
      await loadData();
      if (selectedConcert?.id) await loadDetail(selectedConcert.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCleanup() {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ expiredReservations: number; releasedTickets: number }>(
        "/cleanup",
        {
          method: "POST",
          body: JSON.stringify({ limit: 100 }),
        },
      );
      setNotice(
        `Expired ${result.expiredReservations} reservation(s), released ${result.releasedTickets} ticket(s).`,
      );
      await loadData();
      if (selectedConcert?.id) await loadDetail(selectedConcert.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSeed() {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<SeedResult>("/seed", { method: "POST" });
      setNotice(`Seeded ${result.concerts} concert(s) and ${result.tickets} ticket(s).`);
      await loadData();
      if (selectedConcert?.id) await loadDetail(selectedConcert.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setActionLoading(false);
    }
  }

  const lowStock = concerts.filter((concert) => concert.inventory.totalAvailable < 30);
  const currentTitle =
    location.pathname === "/concerts"
      ? "Inventory"
      : location.pathname === "/reservations"
        ? "Reservations"
        : "Dashboard";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/logo.svg" alt="" />
          <div>
            <strong>AtomicSeat</strong>
            <span>Premium ticketing</span>
          </div>
        </div>
        <nav className="nav">
          {(
            [
              ["/", "Dashboard"],
              ["/concerts", "Inventory"],
              ["/reservations", "Reservations"],
            ] as const
          ).map(([path, label]) => (
            <NavLink
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              end={path === "/"}
              key={path}
              to={path}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="api-chip">API {API_URL.replace(/^https?:\/\//, "")}</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">High concurrency ticketing</p>
            <h1>{currentTitle}</h1>
          </div>
          <div className="topbar-actions">
            <a className="button secondary" href={`${API_URL}/docs`}>
              API docs
            </a>
            <button
              className="button secondary"
              disabled={actionLoading}
              onClick={handleSeed}
              type="button"
            >
              Run seed
            </button>
            <button
              className="button secondary"
              disabled={actionLoading}
              onClick={handleCleanup}
              type="button"
            >
              Run cleanup
            </button>
          </div>
        </header>

        {notice && <div className="notice success">{notice}</div>}
        {error && <div className="notice danger">{error}</div>}

        {loading ? (
          <div className="grid stats">
            {["concerts", "tickets", "available", "pending", "completed", "expired"].map((key) => (
              <div className="card skeleton" key={key} />
            ))}
          </div>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <section className="stack">
                  <div className="grid stats">
                    <Stat label="Concerts" value={metrics.concerts} />
                    <Stat label="Total tickets" value={metrics.tickets} />
                    <Stat label="Available" value={metrics.available} />
                    <Stat label="Pending" value={metrics.pending} />
                    <Stat label="Completed" value={metrics.completed} />
                    <Stat label="Expired" value={metrics.expired} />
                  </div>

                  <div className="split">
                    <div className="card">
                      <div className="section-title">
                        <h2>Recent reservations</h2>
                        <Link className="link-button" to="/reservations">
                          View all
                        </Link>
                      </div>
                      <ReservationTable
                        compact
                        onPurchase={handlePurchase}
                        reservations={reservations.slice(0, 6)}
                      />
                    </div>
                    <div className="card">
                      <div className="section-title">
                        <h2>Low stock</h2>
                      </div>
                      {lowStock.length === 0 ? (
                        <p className="empty">No low-stock concerts.</p>
                      ) : (
                        <div className="mini-list">
                          {lowStock.map((concert) => (
                            <button
                              className="mini-row"
                              key={concert.id}
                              onClick={() => {
                                setSelectedConcertId(concert.id);
                                navigate("/concerts");
                              }}
                              type="button"
                            >
                              <span>{concert.name}</span>
                              <strong>{concert.inventory.totalAvailable}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              }
            />

            <Route
              path="/concerts"
              element={
                <section className="stack">
                  <div className="toolbar">
                    <input
                      aria-label="Search concerts"
                      className="input"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search concerts"
                      value={search}
                    />
                  </div>
                  <div className="concert-layout">
                    <div className="card">
                      <div className="section-title">
                        <h2>Upcoming inventory</h2>
                      </div>
                      <ConcertTable
                        concerts={concerts}
                        selectedId={selectedConcert?.id}
                        onSelect={(id) => setSelectedConcertId(id)}
                      />
                    </div>
                    <div className="card detail-card">
                      {detail ? (
                        <>
                          <div className="detail-header">
                            <div>
                              <h2>{detail.name}</h2>
                              <p>
                                {detail.venue} / {formatDate(detail.startsAt)}
                              </p>
                            </div>
                            <strong>{detail.inventory.totalAvailable} left</strong>
                          </div>
                          <div className="inventory-grid">
                            <Stat label="VIP available" value={detail.inventory.vipAvailable} />
                            <Stat
                              label="General available"
                              value={detail.inventory.generalAvailable}
                            />
                            <Stat label="Held" value={detail.inventory.pending} />
                            <Stat label="Sold" value={detail.inventory.sold} />
                          </div>
                          <div className="admin-note">
                            <strong>Client checkout lives on the website.</strong>
                            <span>
                              This admin view monitors inventory, active holds, completed sales, and
                              cleanup operations.
                            </span>
                          </div>
                          <div className="section-title nested">
                            <h2>Recent reservations</h2>
                          </div>
                          <ReservationTable
                            compact
                            onPurchase={handlePurchase}
                            reservations={detail.recentReservations}
                          />
                        </>
                      ) : (
                        <p className="empty">Select a concert to inspect inventory.</p>
                      )}
                    </div>
                  </div>
                </section>
              }
            />

            <Route
              path="/reservations"
              element={
                <section className="card">
                  <div className="section-title">
                    <h2>Reservation ledger</h2>
                  </div>
                  <ReservationTable onPurchase={handlePurchase} reservations={reservations} />
                </section>
              }
            />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function ConcertTable({
  concerts,
  selectedId,
  onSelect,
}: {
  concerts: Concert[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (concerts.length === 0) return <p className="empty">No concerts found.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Concert</th>
            <th>Starts</th>
            <th className="num">VIP</th>
            <th className="num">General</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {concerts.map((concert) => (
            <tr
              className={selectedId === concert.id ? "selected-row" : ""}
              key={concert.id}
              onClick={() => onSelect(concert.id)}
            >
              <td>
                <strong>{concert.name}</strong>
                <span>{concert.venue}</span>
              </td>
              <td>{formatDate(concert.startsAt)}</td>
              <td className="num">{concert.inventory.vipAvailable}</td>
              <td className="num">{concert.inventory.generalAvailable}</td>
              <td className="num">{concert.inventory.totalAvailable}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReservationTable({
  reservations,
  compact = false,
  onPurchase,
}: {
  reservations: Reservation[];
  compact?: boolean;
  onPurchase: (id: string) => void;
}) {
  if (reservations.length === 0) return <p className="empty">No reservations yet.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Reservation</th>
            {!compact && <th>Concert</th>}
            <th>Category</th>
            <th className="num">Qty</th>
            <th>Status</th>
            {!compact && <th className="num">Amount</th>}
            <th>Expires</th>
            <th className="actions">Action</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((reservation) => (
            <tr key={reservation.id}>
              <td>
                <strong>{reservation.id.slice(0, 8)}</strong>
                <span>{formatDate(reservation.createdAt)}</span>
              </td>
              {!compact && <td>{reservation.concertName}</td>}
              <td>{reservation.category}</td>
              <td className="num">{reservation.quantity}</td>
              <td>
                <StatusBadge status={reservation.status} />
                {reservation.paymentId?.startsWith("stripe_") && (
                  <span className="payment-chip">Stripe verified</span>
                )}
              </td>
              {!compact && <td className="num">{formatMoney(reservation.amountCents)}</td>}
              <td>
                {reservation.status === "PENDING" ? (
                  <Countdown expiresAt={reservation.expiresAt} />
                ) : (
                  formatDate(reservation.expiresAt)
                )}
              </td>
              <td className="actions">
                {reservation.status === "PENDING" ? (
                  <div className="row-actions">
                    <button
                      className="button small secondary-small"
                      onClick={() => onPurchase(reservation.id)}
                      type="button"
                    >
                      Manual
                    </button>
                  </div>
                ) : (
                  <span className="muted">Closed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
