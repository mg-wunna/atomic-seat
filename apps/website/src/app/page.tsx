"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3002";
const PORTFOLIO_URL = process.env.NEXT_PUBLIC_PORTFOLIO_URL || "https://mg-wunna.vercel.app/";
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/mg-wunna/atomic-seat";
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "mgwunna.mw@icloud.com";
const DOCS_URL = `${API_URL}/docs`;

const images = {
  hero: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=2200&q=85",
  orion:
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=82",
  velvet:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=82",
  static:
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1400&q=82",
};

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

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Request failed");
  return payload.data as T;
}

function eventImage(concertId: string) {
  if (concertId.includes("velvet")) return images.velvet;
  if (concertId.includes("static")) return images.static;
  return images.orion;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Concert[]>("/concerts")
      .then(setConcerts)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load concerts"));
  }, []);

  const totalAvailable = concerts.reduce(
    (sum, concert) => sum + concert.inventory.totalAvailable,
    0,
  );
  const pending = concerts.reduce((sum, concert) => sum + concert.inventory.pending, 0);
  const featured = concerts[0];

  return (
    <main>
      <section
        className="home-hero"
        id="top"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(7,8,12,.9), rgba(7,8,12,.56), rgba(7,8,12,.2)), url(${images.hero})`,
        }}
      >
        <header className="site-shell floating-nav">
          <a className="brand mark-on-dark" href="#top" aria-label="AtomicSeat home">
            <img src="/logo.svg" alt="" />
            AtomicSeat
          </a>
          <div className="nav-links nav-on-dark">
            <a href="/reserve">Reserve seats</a>
            <a href="#lineup">Lineup</a>
            <a href="#case-study">Case study</a>
            <a href={DOCS_URL}>API docs</a>
            <a href={DASHBOARD_URL}>Admin</a>
          </div>
        </header>

        <div className="site-shell hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Atomic reservations for high-demand concerts</p>
            <h1>Seat holds that feel instant and never oversell.</h1>
            <p>
              A polished concert ticketing case study with seat-level inventory, five-minute holds,
              Stripe-style checkout, and transaction-backed protection under concurrency.
            </p>
            <div className="hero-actions">
              <a className="primary-action light" href="/reserve">
                Reserve a seat
              </a>
              <a className="secondary-action glass" href="#case-study">
                View case study
              </a>
            </div>
          </div>

          <section
            className="hero-reservation-card"
            aria-label="Live AtomicSeat reservation preview"
          >
            <img src={featured ? eventImage(featured.id) : images.orion} alt="" />
            <div className="ticket-cut">
              <span>Live ticket desk</span>
              <strong>{featured?.name ?? "Orion Pulse Live"}</strong>
              <small>{featured ? formatDate(featured.startsAt) : "Next show"}</small>
            </div>
            <div className="reservation-rows">
              <div>
                <span>General seats</span>
                <strong>{featured?.inventory.generalAvailable ?? 90}</strong>
              </div>
              <div>
                <span>VIP seats</span>
                <strong>{featured?.inventory.vipAvailable ?? 18}</strong>
              </div>
              <div>
                <span>Pending holds</span>
                <strong>{featured?.inventory.pending ?? 0}</strong>
              </div>
            </div>
            <a href={featured ? `/reserve?concert=${featured.id}` : "/reserve"}>Open seat map</a>
          </section>
        </div>

        <div className="site-shell hero-metrics">
          <div>
            <span>Available now</span>
            <strong>{totalAvailable || 234}</strong>
          </div>
          <div>
            <span>Active holds</span>
            <strong>{pending}</strong>
          </div>
          <div>
            <span>Hold TTL</span>
            <strong>5 min</strong>
          </div>
        </div>
      </section>

      <section className="site-shell editorial-strip">
        <div>
          <span>Buyer view</span>
          <strong>Concert discovery, seat selection, reserve, pay.</strong>
        </div>
        <div>
          <span>Admin view</span>
          <strong>Inventory, reservations, pending holds, cleanup.</strong>
        </div>
        <div>
          <span>Backend proof</span>
          <strong>TypeORM transaction plus rollback test.</strong>
        </div>
      </section>

      <section className="site-shell section" id="lineup">
        <div className="section-heading wide-heading">
          <p className="kicker">Now booking</p>
          <h2>Live inventory with premium event cards.</h2>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="event-grid">
          {concerts.map((concert) => (
            <article className="event-card" key={concert.id}>
              <img src={eventImage(concert.id)} alt="" />
              <div className="event-card-content">
                <span>{formatDate(concert.startsAt)}</span>
                <h3>{concert.name}</h3>
                <p>{concert.venue}</p>
                <div className="event-stock">
                  <strong>{concert.inventory.vipAvailable}</strong>
                  <small>VIP</small>
                  <strong>{concert.inventory.generalAvailable}</strong>
                  <small>General</small>
                </div>
                <a href={`/reserve?concert=${concert.id}`}>Select seats</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="case-study-band" id="case-study">
        <div className="site-shell case-study-grid">
          <div>
            <p className="kicker">Case study</p>
            <h2>Designed to explain the hard part in an interview.</h2>
          </div>
          <div className="phase-list">
            {[
              [
                "01",
                "Seat-level inventory",
                "Every seat is a Ticket row with AVAILABLE, HELD, or SOLD status.",
              ],
              [
                "02",
                "Atomic reserve",
                "Stock decrement, PENDING reservation, and seat hold commit in one transaction.",
              ],
              [
                "03",
                "TTL cleanup",
                "Expired PENDING holds are released so seats become bookable again.",
              ],
              [
                "04",
                "OpenAPI docs",
                "API documentation is generated from /openapi.json and rendered with Scalar.",
              ],
            ].map(([num, title, body]) => (
              <article className="phase" key={num}>
                <span>{num}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-shell footer">
        <div>
          <strong>AtomicSeat</strong>
          <p>Built by Mg Wunna as a full-stack concurrency case study.</p>
        </div>
        <div className="footer-links">
          <a href={PORTFOLIO_URL}>Portfolio</a>
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <a href={REPO_URL}>GitHub</a>
        </div>
      </footer>
    </main>
  );
}
