"use client";

import { useCallback, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const WS_URL = API_URL.replace(/^http/, "ws");

interface HealthResponse {
  status: string;
  timestamp: number;
}

interface WsMessage {
  type: string;
  timestamp: number;
  data?: string;
}

export default function Home() {
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected",
  );
  const [wsMessages, setWsMessages] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const pingHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthResult(null);
    try {
      const res = await fetch(`${API_URL}/health`);
      const data: HealthResponse = await res.json();
      setHealthResult(`${data.status} - ${new Date(data.timestamp).toLocaleTimeString()}`);
    } catch (err) {
      setHealthResult(`Error: ${err instanceof Error ? err.message : "Failed to connect"}`);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const toggleSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      return;
    }

    setWsStatus("connecting");
    setWsMessages([]);
    const ws = new WebSocket(`${WS_URL}/ws`);

    ws.onopen = () => {
      setWsStatus("connected");
      setWsMessages((prev) => [...prev, "Connected"]);
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      const time = new Date(msg.timestamp).toLocaleTimeString();
      setWsMessages((prev) => [...prev, `${msg.type} - ${time}`]);
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      setWsMessages((prev) => [...prev, "Disconnected"]);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsStatus("disconnected");
      setWsMessages((prev) => [...prev, "Connection failed"]);
      wsRef.current = null;
    };

    wsRef.current = ws;
  }, []);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send("ping");
      setWsMessages((prev) => [...prev, "Sent: ping"]);
    }
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Template Project</h1>
        <p style={styles.description}>
          A reusable scaffold for building products. Copy this template to create a new app with
          server, dashboard, website, and mobile — all pre-configured.
        </p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Health Check</h2>
          <p style={styles.sectionDesc}>Ping the server&apos;s /health endpoint</p>
          <button type="button" onClick={pingHealth} disabled={healthLoading} style={styles.button}>
            {healthLoading ? "Pinging..." : "Ping Health"}
          </button>
          {healthResult && (
            <div
              style={{
                ...styles.result,
                ...(healthResult.startsWith("Error") ? styles.resultError : styles.resultSuccess),
              }}
            >
              {healthResult}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>WebSocket</h2>
          <p style={styles.sectionDesc}>Connect to the server via WebSocket</p>
          <div style={styles.buttonRow}>
            <button
              type="button"
              onClick={toggleSocket}
              style={{
                ...styles.button,
                ...(wsStatus === "connected" ? styles.buttonDanger : {}),
              }}
            >
              {wsStatus === "connected"
                ? "Disconnect"
                : wsStatus === "connecting"
                  ? "Connecting..."
                  : "Connect"}
            </button>
            {wsStatus === "connected" && (
              <button type="button" onClick={sendPing} style={styles.buttonOutline}>
                Send Ping
              </button>
            )}
          </div>
          {wsMessages.length > 0 && (
            <div style={styles.log}>
              {wsMessages.map((msg, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
                <div key={i} style={styles.logLine}>
                  {msg}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.dot} /> API: {API_URL}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8f9fa",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    padding: 24,
    margin: 0,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 40,
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 30px rgba(0,0,0,0.04)",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 8px",
    color: "#111",
  },
  description: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#666",
    margin: "0 0 32px",
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    margin: "0 0 4px",
    color: "#333",
  },
  sectionDesc: {
    fontSize: 13,
    color: "#999",
    margin: "0 0 12px",
  },
  button: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    backgroundColor: "#111",
    color: "#fff",
  },
  buttonDanger: {
    backgroundColor: "#e53e3e",
  },
  buttonOutline: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    border: "1.5px solid #ddd",
    borderRadius: 8,
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#333",
  },
  buttonRow: {
    display: "flex",
    gap: 8,
  },
  result: {
    marginTop: 12,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "monospace",
  },
  resultSuccess: {
    backgroundColor: "#f0fdf4",
    color: "#16a34a",
    border: "1px solid #bbf7d0",
  },
  resultError: {
    backgroundColor: "#fef2f2",
    color: "#dc2626",
    border: "1px solid #fecaca",
  },
  log: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    maxHeight: 160,
    overflowY: "auto" as const,
  },
  logLine: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#a3e635",
    lineHeight: 1.8,
  },
  footer: {
    paddingTop: 20,
    borderTop: "1px solid #f0f0f0",
    fontSize: 12,
    color: "#999",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#a3e635",
    display: "inline-block",
  },
};
