import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const ACTION_COLORS = {
  ACCEPTED:   { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
  UPDATED:    { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  MERGED:     { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  DOWNGRADED: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  REJECTED:   { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
  FORGOTTEN:  { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
};

const NAV_ITEMS = [
  { id: "memory",    label: "Memory Store",   icon: "🧠" },
  { id: "ingest",    label: "Ingest Claims",  icon: "📥" },
  { id: "batch",     label: "Batch Ingest",   icon: "📦" },
  { id: "stats",     label: "Statistics",     icon: "📊" },
  { id: "changelog", label: "Changelog",      icon: "📋" },
  { id: "explain",   label: "Explain Belief", icon: "🔍" },
  { id: "subject",   label: "Subject Lookup", icon: "🏷️" },
];

function Badge({ action }) {
  const c = ACTION_COLORS[action] || ACTION_COLORS.FORGOTTEN;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11,
      fontWeight: 600, whiteSpace: "nowrap", letterSpacing: 0.3
    }}>{action}</span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#18181b", border: "1px solid #27272a",
      borderRadius: 12, padding: "20px 24px", flex: 1, minWidth: 140
    }}>
      <p style={{ margin: 0, fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700, color: "#f4f4f5" }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#52525b" }}>{sub}</p>}
    </div>
  );
}

function PageHeader({ title, desc, icon }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f4f4f5" }}>{title}</h2>
      </div>
      {desc && <p style={{ margin: 0, fontSize: 13, color: "#71717a" }}>{desc}</p>}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "#52525b", fontSize: 14 }}>
      <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #52525b", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      Loading…
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "#52525b", fontSize: 14 }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🫙</div>
      {msg}
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 20 }}>
      ⚠️ {msg}
    </div>
  );
}

function JsonBlock({ data }) {
  return (
    <pre style={{
      background: "#09090b", border: "1px solid #27272a", borderRadius: 10,
      padding: 16, fontSize: 12, color: "#a1a1aa", overflow: "auto",
      maxHeight: 400, margin: 0, lineHeight: 1.6
    }}>{JSON.stringify(data, null, 2)}</pre>
  );
}

// ─── Memory Page ────────────────────────────────────────────────────────────
function MemoryPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${API}/memory`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.memories || []); setLoading(false); })
      .catch(() => { setError("Cannot reach backend at " + API); setLoading(false); });
  }, []);

  const actions = ["ALL", ...Object.keys(ACTION_COLORS)];
  const filtered = data.filter(m => {
    const matchFilter = filter === "ALL" || m.last_action === filter;
    const matchSearch = !search || [m.subject, m.predicate, m.object, m.source]
      .some(f => String(f || "").toLowerCase().includes(search.toLowerCase()));
    return matchFilter && matchSearch;
  });

  const actionCounts = data.reduce((a, m) => { a[m.last_action] = (a[m.last_action] || 0) + 1; return a; }, {});

  return (
    <div>
      <PageHeader icon="🧠" title="Memory Store" desc="All active beliefs and their current trust status." />
      {error && <ErrorBox msg={error} />}

      {/* Summary row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Total beliefs" value={data.length} />
        {Object.entries(actionCounts).map(([k, v]) => (
          <StatCard key={k} label={k} value={v} />
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text" placeholder="Search subject, predicate, object, source…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "8px 14px", color: "#f4f4f5", fontSize: 13, outline: "none"
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {actions.map(a => (
            <button key={a} onClick={() => setFilter(a)} style={{
              background: filter === a ? "#7c3aed" : "#18181b",
              border: `1px solid ${filter === a ? "#7c3aed" : "#3f3f46"}`,
              borderRadius: 6, padding: "6px 12px", color: filter === a ? "#fff" : "#a1a1aa",
              fontSize: 12, cursor: "pointer", fontWeight: filter === a ? 600 : 400
            }}>{a}</button>
          ))}
        </div>
      </div>

      {loading ? <Loader /> : filtered.length === 0 ? <Empty msg="No entries found." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m, i) => (
            <div key={m.id || i} style={{
              background: "#18181b", border: "1px solid #27272a",
              borderRadius: 12, overflow: "hidden"
            }}>
              <div
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
              >
                <span style={{ color: "#52525b", fontSize: 12 }}>{expanded === i ? "▲" : "▼"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "#f4f4f5", fontSize: 14 }}>{m.subject}</span>
                  <span style={{ color: "#52525b", margin: "0 8px" }}>·</span>
                  <span style={{ color: "#a1a1aa", fontSize: 13 }}>{m.predicate}</span>
                </div>
                <span style={{ color: "#e4e4e7", fontSize: 13, flex: 1 }}>{m.object}</span>
                <Badge action={m.last_action} />
                <span style={{ color: "#52525b", fontSize: 12, marginLeft: 8 }}>
                  {m.confidence != null ? `${(m.confidence * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
              {expanded === i && (
                <div style={{
                  borderTop: "1px solid #27272a", padding: "14px 18px",
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12
                }}>
                  {[
                    ["Source", m.source],
                    ["Reliability", m.source_reliability != null ? (m.source_reliability * 100).toFixed(0) + "%" : "—"],
                    ["Confidence", m.confidence != null ? (m.confidence * 100).toFixed(0) + "%" : "—"],
                    ["Corroborations", m.corroboration_count ?? "—"],
                    ["Label", m.label],
                    ["Uncertainty", m.uncertainty_flag ? "⚠️ Yes" : "✓ No"],
                    ["Timestamp", m.timestamp ? new Date(m.timestamp).toLocaleString() : "—"],
                    ["ID", m.id],
                  ].map(([k, v]) => v != null && v !== "—" && (
                    <div key={k}>
                      <p style={{ margin: 0, fontSize: 11, color: "#52525b", textTransform: "uppercase", letterSpacing: 0.8 }}>{k}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 13, color: "#d4d4d8" }}>{String(v)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ingest Page ────────────────────────────────────────────────────────────
function IngestPage() {
  const SAMPLE = `{
  "claim_id": "C001",
  "subject": "Startup A",
  "predicate": "raised funding of",
  "object": "$5M in 2021",
  "source": "TechCrunch",
  "source_reliability": 0.85,
  "label": "VERIFIABLE",
  "timestamp": "2024-01-15T10:00:00Z"
}`;
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setResult(null);
    try {
      const body = JSON.parse(text);
      const r = await fetch(`${API}/ingest`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setResult(await r.json());
    } catch (e) { setResult({ error: e.message }); }
    setLoading(false);
  };

  return (
    <div>
      <PageHeader icon="📥" title="Ingest Single Claim" desc="Run one claim through the full agent pipeline: verify → detect contradictions → curate → store." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Claim JSON</label>
          <textarea
            value={text} onChange={e => setText(e.target.value)} rows={14}
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 8,
              background: "#09090b", border: "1px solid #3f3f46", borderRadius: 10,
              padding: 14, color: "#a1a1aa", fontSize: 12, fontFamily: "monospace",
              resize: "vertical", outline: "none"
            }}
          />
          <button onClick={submit} disabled={loading} style={{
            marginTop: 10, background: "#7c3aed", border: "none", borderRadius: 8,
            padding: "10px 24px", color: "#fff", fontWeight: 600, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Processing…" : "Submit claim →"}
          </button>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Result</label>
          <div style={{ marginTop: 8 }}>
            {!result ? (
              <div style={{ background: "#09090b", border: "1px dashed #27272a", borderRadius: 10, padding: 40, textAlign: "center", color: "#52525b", fontSize: 13 }}>
                Result will appear here
              </div>
            ) : result.error ? (
              <ErrorBox msg={result.error} />
            ) : (
              <div>
                <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <Badge action={result.action} />
                    <span style={{ color: "#f4f4f5", fontWeight: 600 }}>{result.subject}</span>
                  </div>
                  {[
                    ["Predicate", result.predicate],
                    ["Object", result.object],
                    ["Confidence", result.confidence != null ? (result.confidence * 100).toFixed(1) + "%" : null],
                    ["Reason", result.reason],
                  ].filter(([, v]) => v != null).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#52525b", minWidth: 80 }}>{k}</span>
                      <span style={{ fontSize: 13, color: "#d4d4d8" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <JsonBlock data={result} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Ingest Page ──────────────────────────────────────────────────────
function BatchPage() {
  const SAMPLE = `[
  {
    "claim_id": "C001",
    "subject": "Startup A",
    "predicate": "raised funding of",
    "object": "$5M in 2021",
    "source": "TechCrunch",
    "source_reliability": 0.85,
    "label": "VERIFIABLE",
    "timestamp": "2024-01-15T10:00:00Z"
  },
  {
    "claim_id": "C002",
    "subject": "GreenTech Corp",
    "predicate": "was founded in",
    "object": "2010",
    "source": "Wikipedia",
    "source_reliability": 0.7,
    "label": "VERIFIABLE",
    "timestamp": "2024-01-10T08:00:00Z"
  }
]`;
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setResult(null);
    try {
      const claims = JSON.parse(text);
      const r = await fetch(`${API}/batch-ingest`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims })
      });
      setResult(await r.json());
    } catch (e) { setResult({ error: e.message }); }
    setLoading(false);
  };

  const results = result?.results || [];
  const counts = results.reduce((a, r) => { a[r.action] = (a[r.action] || 0) + 1; return a; }, {});

  return (
    <div>
      <PageHeader icon="📦" title="Batch Ingest" desc="Paste a JSON array of claims. Converts data/claims_1_1.jsonl and sends all 50 at once." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Claims Array (JSON)</label>
          <textarea
            value={text} onChange={e => setText(e.target.value)} rows={18}
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 8,
              background: "#09090b", border: "1px solid #3f3f46", borderRadius: 10,
              padding: 14, color: "#a1a1aa", fontSize: 12, fontFamily: "monospace",
              resize: "vertical", outline: "none"
            }}
          />
          <button onClick={submit} disabled={loading} style={{
            marginTop: 10, background: "#7c3aed", border: "none", borderRadius: 8,
            padding: "10px 24px", color: "#fff", fontWeight: 600, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Processing…" : `Submit ${(() => { try { return JSON.parse(text).length; } catch { return ""; } })()} claims →`}
          </button>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#71717a", textTransform: "uppercase", letterSpacing: 1 }}>Results</label>
          <div style={{ marginTop: 8 }}>
            {!result ? (
              <div style={{ background: "#09090b", border: "1px dashed #27272a", borderRadius: 10, padding: 40, textAlign: "center", color: "#52525b", fontSize: 13 }}>
                Results will appear here
              </div>
            ) : result.error ? <ErrorBox msg={result.error} /> : (
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  {Object.entries(counts).map(([k, v]) => (
                    <div key={k} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
                      <Badge action={k} />
                      <p style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: "#f4f4f5" }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 380, overflow: "auto" }}>
                  {results.map((r, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#18181b", borderRadius: 8, padding: "8px 12px",
                      border: "1px solid #27272a"
                    }}>
                      <Badge action={r.action} />
                      <span style={{ fontSize: 13, color: "#f4f4f5", fontWeight: 500 }}>{r.subject}</span>
                      <span style={{ fontSize: 12, color: "#52525b" }}>·</span>
                      <span style={{ fontSize: 12, color: "#71717a", flex: 1 }}>{r.predicate}</span>
                      {r.confidence != null && (
                        <span style={{ fontSize: 12, color: "#52525b" }}>{(r.confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Page ─────────────────────────────────────────────────────────────
function StatsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/stats`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Cannot reach backend"); setLoading(false); });
  }, []);

  if (loading) return <><PageHeader icon="📊" title="Statistics" /><Loader /></>;
  if (error) return <><PageHeader icon="📊" title="Statistics" /><ErrorBox msg={error} /></>;
  if (!data) return null;

  const actionBreakdown = typeof data.action_breakdown === "object" ? data.action_breakdown : null;
  const statusBreakdown = typeof data.status_breakdown === "object" ? data.status_breakdown : null;
  const topFacts = Array.isArray(data.top_corroborated_facts) ? data.top_corroborated_facts : null;

  return (
    <div>
      <PageHeader icon="📊" title="Statistics" desc="Live system overview — beliefs, actions, and corroboration." />
      {error && <ErrorBox msg={error} />}

      {/* Top numbers */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        {data.total_memory_entries != null && <StatCard label="Total beliefs" value={data.total_memory_entries} />}
        {data.total_changelog_entries != null && <StatCard label="Changelog entries" value={data.total_changelog_entries} />}
        {data.active_entries != null && <StatCard label="Active entries" value={data.active_entries} />}
        {data.rejected_entries != null && <StatCard label="Rejected" value={data.rejected_entries} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Action breakdown */}
        {actionBreakdown && (
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "20px 24px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 }}>Action breakdown</h3>
            {Object.entries(actionBreakdown).map(([action, count]) => {
              const total = Object.values(actionBreakdown).reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((count / total) * 100) : 0;
              return (
                <div key={action} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <Badge action={action} />
                    <span style={{ fontSize: 13, color: "#a1a1aa", fontWeight: 600 }}>{count} <span style={{ color: "#52525b" }}>({pct}%)</span></span>
                  </div>
                  <div style={{ background: "#27272a", borderRadius: 99, height: 5 }}>
                    <div style={{
                      height: 5, borderRadius: 99, width: `${pct}%`,
                      background: ACTION_COLORS[action]?.border || "#7c3aed"
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Status breakdown */}
        {statusBreakdown && (
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "20px 24px" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 }}>Status breakdown</h3>
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #27272a" }}>
                <span style={{ fontSize: 13, color: "#d4d4d8", fontWeight: 500 }}>{status}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#f4f4f5" }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top corroborated facts */}
      {topFacts && topFacts.length > 0 && (
        <div style={{ marginTop: 20, background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 }}>Top corroborated facts</h3>
          {topFacts.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid #27272a" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#7c3aed", minWidth: 28 }}>#{i + 1}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#f4f4f5" }}>{f.subject}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#71717a" }}>{f.predicate} → <span style={{ color: "#a1a1aa" }}>{f.object}</span></p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{f.corroboration_count}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#52525b" }}>corroborations</p>
              </div>
              {f.confidence != null && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#34d399" }}>{(f.confidence * 100).toFixed(0)}%</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#52525b" }}>confidence</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Changelog Page ─────────────────────────────────────────────────────────
function ChangelogPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetch(`${API}/changelog`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : d.changelog || []); setLoading(false); })
      .catch(() => { setError("Cannot reach backend"); setLoading(false); });
  }, []);

  const actions = ["ALL", ...Object.keys(ACTION_COLORS)];
  const filtered = filter === "ALL" ? data : data.filter(d => d.action === filter);

  return (
    <div>
      <PageHeader icon="📋" title="Changelog" desc="Full audit trail of every belief change, newest first." />
      {error && <ErrorBox msg={error} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {actions.map(a => (
          <button key={a} onClick={() => setFilter(a)} style={{
            background: filter === a ? "#7c3aed" : "#18181b",
            border: `1px solid ${filter === a ? "#7c3aed" : "#3f3f46"}`,
            borderRadius: 6, padding: "5px 12px", color: filter === a ? "#fff" : "#a1a1aa",
            fontSize: 12, cursor: "pointer", fontWeight: filter === a ? 600 : 400
          }}>{a} {a !== "ALL" && `(${data.filter(d => d.action === a).length})`}</button>
        ))}
      </div>

      {loading ? <Loader /> : filtered.length === 0 ? <Empty msg="No changelog entries yet." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 14, background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ width: 3, borderRadius: 99, background: ACTION_COLORS[entry.action]?.border || "#3f3f46", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "#f4f4f5", fontSize: 14 }}>{entry.subject}</span>
                  <span style={{ color: "#52525b", fontSize: 12 }}>·</span>
                  <span style={{ color: "#71717a", fontSize: 13 }}>{entry.predicate}</span>
                  {entry.action && <Badge action={entry.action} />}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#a1a1aa" }}>{entry.object}</p>
                {entry.reason && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#52525b", fontStyle: "italic" }}>{entry.reason}</p>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {entry.confidence != null && (
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#a78bfa" }}>{(entry.confidence * 100).toFixed(0)}%</p>
                )}
                {entry.timestamp && (
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#52525b" }}>{new Date(entry.timestamp).toLocaleString()}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Explain Page ────────────────────────────────────────────────────────────
function ExplainPage() {
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!subject.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const r = await fetch(`${API}/explain/${encodeURIComponent(subject.trim())}`);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      setResult(await r.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const EXAMPLES = ["Startup A", "GreenTech Corp", "History Channel"];

  return (
    <div>
      <PageHeader icon="🔍" title="Explain Belief" desc="Trace the full provenance of a belief — why the system believes what it believes about any entity." />

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          type="text" placeholder="Enter a subject name…"
          value={subject} onChange={e => setSubject(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{
            flex: 1, background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "10px 14px", color: "#f4f4f5",
            fontSize: 14, outline: "none"
          }}
        />
        <button onClick={submit} disabled={loading || !subject.trim()} style={{
          background: "#7c3aed", border: "none", borderRadius: 8,
          padding: "10px 24px", color: "#fff", fontWeight: 600, fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
        }}>
          {loading ? "…" : "Explain →"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <span style={{ fontSize: 12, color: "#52525b" }}>Try:</span>
        {EXAMPLES.map(e => (
          <button key={e} onClick={() => { setSubject(e); }} style={{
            background: "transparent", border: "1px solid #3f3f46", borderRadius: 6,
            padding: "3px 10px", color: "#a1a1aa", fontSize: 12, cursor: "pointer"
          }}>{e}</button>
        ))}
      </div>

      {error && <ErrorBox msg={error} />}
      {loading && <Loader />}

      {result && !error && (
        <div>
          {result.current_beliefs?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 }}>Current beliefs</h3>
              {result.current_beliefs.map((b, i) => (
                <div key={i} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "16px 20px", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <Badge action={b.last_action} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#f4f4f5" }}>{b.predicate}</span>
                    <span style={{ color: "#52525b" }}>→</span>
                    <span style={{ fontSize: 14, color: "#a78bfa" }}>{b.object}</span>
                    <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: "#34d399" }}>
                      {b.confidence != null ? `${(b.confidence * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {[["Source", b.source], ["Reliability", b.source_reliability != null ? `${(b.source_reliability * 100).toFixed(0)}%` : null], ["Corroborations", b.corroboration_count]].filter(([, v]) => v != null).map(([k, v]) => (
                      <div key={k}>
                        <p style={{ margin: 0, fontSize: 11, color: "#52525b", textTransform: "uppercase" }}>{k}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#d4d4d8" }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.history?.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 1 }}>Belief history ({result.history.length} events)</h3>
              <div style={{ position: "relative", paddingLeft: 24 }}>
                <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: "#27272a", borderRadius: 99 }} />
                {result.history.map((h, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                    <div style={{ position: "absolute", left: -20, top: 14, width: 10, height: 10, borderRadius: "50%", background: ACTION_COLORS[h.action]?.border || "#52525b", border: "2px solid #09090b" }} />
                    <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Badge action={h.action} />
                        <span style={{ fontSize: 13, color: "#d4d4d8" }}>{h.object}</span>
                        {h.timestamp && <span style={{ fontSize: 11, color: "#52525b", marginLeft: "auto" }}>{new Date(h.timestamp).toLocaleDateString()}</span>}
                      </div>
                      {h.reason && <p style={{ margin: 0, fontSize: 12, color: "#52525b", fontStyle: "italic" }}>{h.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!result.current_beliefs && !result.history && <JsonBlock data={result} />}
        </div>
      )}
    </div>
  );
}

// ─── Subject Lookup Page ────────────────────────────────────────────────────
function SubjectPage() {
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!subject.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const r = await fetch(`${API}/memory/${encodeURIComponent(subject.trim())}`);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      setResult(await r.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const entries = Array.isArray(result) ? result : result?.memories || result?.entries || [];

  return (
    <div>
      <PageHeader icon="🏷️" title="Subject Lookup" desc="Fetch all current beliefs about a specific entity from GET /memory/{subject}." />

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="text" placeholder="Enter subject name…"
          value={subject} onChange={e => setSubject(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{
            flex: 1, background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "10px 14px", color: "#f4f4f5",
            fontSize: 14, outline: "none"
          }}
        />
        <button onClick={submit} disabled={loading || !subject.trim()} style={{
          background: "#7c3aed", border: "none", borderRadius: 8,
          padding: "10px 24px", color: "#fff", fontWeight: 600, fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
        }}>
          {loading ? "…" : "Lookup →"}
        </button>
      </div>

      {error && <ErrorBox msg={error} />}
      {loading && <Loader />}

      {result && !error && (
        entries.length === 0 ? <Empty msg={`No beliefs found for "${subject}".`} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((m, i) => (
              <div key={i} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <Badge action={m.last_action} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#f4f4f5" }}>{m.predicate}</span>
                  <span style={{ color: "#52525b" }}>→</span>
                  <span style={{ color: "#a78bfa", fontSize: 14 }}>{m.object}</span>
                  <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: "#34d399" }}>
                    {m.confidence != null ? `${(m.confidence * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {[["Source", m.source], ["Reliability", m.source_reliability != null ? `${(m.source_reliability * 100).toFixed(0)}%` : null], ["Corroborations", m.corroboration_count], ["Uncertainty", m.uncertainty_flag != null ? (m.uncertainty_flag ? "⚠️ Yes" : "✓ No") : null]].filter(([, v]) => v != null).map(([k, v]) => (
                    <div key={k}>
                      <p style={{ margin: 0, fontSize: 11, color: "#52525b", textTransform: "uppercase" }}>{k}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#d4d4d8" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── App Shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("memory");
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm("Wipe all memory? This cannot be undone.")) return;
    setResetting(true);
    try { await fetch(`${API}/memory/reset`, { method: "DELETE" }); window.location.reload(); }
    catch { alert("Reset failed — is the backend running?"); }
    setResetting(false);
  };

  const PAGES = { memory: MemoryPage, ingest: IngestPage, batch: BatchPage, stats: StatsPage, changelog: ChangelogPage, explain: ExplainPage, subject: SubjectPage };
  const PageComponent = PAGES[page];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#09090b", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        input::placeholder { color: #52525b; }
        textarea::placeholder { color: #52525b; }
        button:disabled { cursor: not-allowed; opacity: 0.5; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #18181b; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 99px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#111113", borderRight: "1px solid #1c1c1e", padding: "24px 0", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1c1c1e" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#52525b", textTransform: "uppercase", letterSpacing: 1.5 }}>Trust Memory</p>
          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: "#f4f4f5" }}>Intelligence System</p>
        </div>
        <nav style={{ flex: 1, padding: "12px 10px" }}>
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setPage(id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              background: page === id ? "#1c1c24" : "transparent",
              border: page === id ? "1px solid #2d2d3a" : "1px solid transparent",
              borderRadius: 8, padding: "9px 12px", cursor: "pointer", marginBottom: 2,
              color: page === id ? "#c4b5fd" : "#71717a", textAlign: "left",
              fontSize: 13, fontWeight: page === id ? 600 : 400,
              transition: "all 0.15s"
            }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 10px", borderTop: "1px solid #1c1c1e" }}>
          <button onClick={handleReset} disabled={resetting} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "transparent", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "8px 12px", cursor: "pointer",
            color: "#ef4444", fontSize: 12, fontWeight: 500
          }}>
            🗑 {resetting ? "Resetting…" : "Reset all memory"}
          </button>
          <a href={`${API}/docs`} target="_blank" rel="noreferrer" style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 6,
            background: "transparent", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "8px 12px",
            color: "#71717a", fontSize: 12, textDecoration: "none", fontWeight: 500
          }}>
            📖 Swagger docs ↗
          </a>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "36px 40px", overflow: "auto" }}>
        <PageComponent />
      </div>
    </div>
  );
}
