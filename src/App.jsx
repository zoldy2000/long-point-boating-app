import React, { useMemo, useState } from "react";

const LENGTH_RANGES = [
  { value: "15-18", label: "15–18 ft", boatLengthFt: 17 },
  { value: "19-21", label: "19–21 ft", boatLengthFt: 20 },
  { value: "22-24", label: "22–24 ft", boatLengthFt: 23 },
  { value: "25-27", label: "25–27 ft", boatLengthFt: 26 },
  { value: "28-30", label: "28–30 ft", boatLengthFt: 29 },
];

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const SEGMENTS = [
  { id: "start", label: "Start" },
  { id: "middle", label: "Middle" },
  { id: "end", label: "End" },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function labelFromScore(score) {
  if (score >= 9) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5) return "Fair";
  if (score >= 3) return "Use caution";
  return "Poor";
}

function boatFactor(boatLengthFt) {
  if (boatLengthFt <= 18) return 0;
  if (boatLengthFt <= 21) return 0.5;
  if (boatLengthFt <= 24) return 1;
  if (boatLengthFt <= 27) return 1.5;
  return 2;
}

function scorePoint({ windMph, waveFt, gustMph, boatLengthFt }) {
  let score = 10;
  score -= Math.max(0, (windMph - 10) / 4);
  score -= Math.max(0, (gustMph - 16) / 5);
  score -= Math.max(0, (waveFt - 1) * 1.7);
  score += boatFactor(boatLengthFt);
  return Math.round(clamp(score, 1, 10));
}

function interpretation(score, boatLengthFt) {
  if (score >= 9) return `Very comfortable for about a ${boatLengthFt} ft boat.`;
  if (score >= 7) return `Generally good for about a ${boatLengthFt} ft boat.`;
  if (score >= 5) return `Mixed conditions for about a ${boatLengthFt} ft boat.`;
  if (score >= 3) return `Use caution with about a ${boatLengthFt} ft boat.`;
  return `Poor for about a ${boatLengthFt} ft boat.`;
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compareTrip(points) {
  if (!points.length) return "Enter at least one point.";
  if (points.length === 1) return `${points[0].label} looks ${labelFromScore(points[0].score).toLowerCase()}.`;
  const first = points[0];
  const last = points[points.length - 1];
  const worst = [...points].sort((a, b) => a.score - b.score)[0];

  if (first.score >= 7 && last.score <= 4) {
    return `The start may be okay, but the final destination looks bad.`;
  }
  if (first.score > last.score + 2) {
    return `The trip gets worse as you move along.`;
  }
  if (last.score > first.score + 2) {
    return `The trip looks worse at the start and improves later.`;
  }
  if (worst.score <= 4) {
    return `${worst.label} is the weak point of this trip.`;
  }
  return `The trip looks fairly consistent overall.`;
}

export default function App() {
  const [lengthRange, setLengthRange] = useState("19-21");
  const [segments, setSegments] = useState({
    start: { name: "Start point", wind: "", gust: "", wave: "", dir: "SW" },
    middle: { name: "Middle point", wind: "", gust: "", wave: "", dir: "SW" },
    end: { name: "End point", wind: "", gust: "", wave: "", dir: "SW" },
  });

  const boatLengthFt = LENGTH_RANGES.find((x) => x.value === lengthRange)?.boatLengthFt || 20;

  const scored = useMemo(() => {
    return SEGMENTS.map((seg) => {
      const raw = segments[seg.id];
      const windMph = parseNum(raw.wind);
      const waveFt = parseNum(raw.wave);
      const gustMph = parseNum(raw.gust) ?? windMph;
      const filled = windMph != null && waveFt != null;
      const score = filled ? scorePoint({ windMph, waveFt, gustMph, boatLengthFt }) : null;
      return {
        id: seg.id,
        label: raw.name?.trim() || seg.label,
        dir: raw.dir,
        windMph,
        gustMph,
        waveFt,
        filled,
        score,
      };
    }).filter((x) => x.filled);
  }, [segments, boatLengthFt]);

  const tripSummary = useMemo(() => compareTrip(scored), [scored]);

  const overall = useMemo(() => {
    if (!scored.length) return null;
    const avg = Math.round(scored.reduce((sum, p) => sum + p.score, 0) / scored.length);
    const worst = Math.min(...scored.map((p) => p.score));
    return { avg, worst, label: labelFromScore(avg) };
  }, [scored]);

  function setField(segmentId, field, value) {
    setSegments((prev) => ({
      ...prev,
      [segmentId]: { ...prev[segmentId], [field]: value },
    }));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{ borderRadius: 20, background: "#0f172a", color: "white", padding: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Boater's App</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Trip Score Tester</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Enter start, middle, and end conditions manually. You can fill one point or multiple points. The app scores each point and the trip overall.
          </p>
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Boat length range</label>
          <select
            value={lengthRange}
            onChange={(e) => setLengthRange(e.target.value)}
            style={{ width: 260, maxWidth: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}
          >
            {LENGTH_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {SEGMENTS.map((seg) => {
            const raw = segments[seg.id];
            const matched = scored.find((x) => x.id === seg.id);
            return (
              <div key={seg.id} style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
                <h2 style={{ marginTop: 0 }}>{seg.label}</h2>

                <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Point name</label>
                <input
                  value={raw.name}
                  onChange={(e) => setField(seg.id, "name", e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box", marginBottom: 12 }}
                />

                <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Wind speed (mph)</label>
                <input
                  value={raw.wind}
                  onChange={(e) => setField(seg.id, "wind", e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box", marginBottom: 12 }}
                />

                <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Wind gusts (mph)</label>
                <input
                  value={raw.gust}
                  onChange={(e) => setField(seg.id, "gust", e.target.value)}
                  placeholder="Optional"
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box", marginBottom: 12 }}
                />

                <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Wave height (ft)</label>
                <input
                  value={raw.wave}
                  onChange={(e) => setField(seg.id, "wave", e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box", marginBottom: 12 }}
                />

                <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Wind direction</label>
                <select
                  value={raw.dir}
                  onChange={(e) => setField(seg.id, "dir", e.target.value)}
                  style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}
                >
                  {DIRS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Point result</div>
                  {matched ? (
                    <>
                      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{matched.score}</div>
                      <div style={{ fontWeight: 700 }}>{labelFromScore(matched.score)}</div>
                      <div style={{ marginTop: 8, color: "#475569" }}>{interpretation(matched.score, boatLengthFt)}</div>
                    </>
                  ) : (
                    <div style={{ marginTop: 8, color: "#475569" }}>Enter wind speed and wave height.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0 }}>Trip summary</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Overall score</div>
              <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{overall ? overall.avg : "—"}</div>
              <div style={{ fontWeight: 700 }}>{overall ? overall.label : "Waiting for input"}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Worst point</div>
              <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{overall ? overall.worst : "—"}</div>
              <div style={{ color: "#475569" }}>{scored.length ? `${scored.slice().sort((a,b)=>a.score-b.score)[0].label}` : "Waiting for input"}</div>
            </div>
          </div>

          <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Trip interpretation</div>
            <p style={{ marginTop: 10, lineHeight: 1.6, color: "#334155" }}>{tripSummary}</p>
          </div>

          {!!scored.length && (
            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Point-by-point view</div>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {scored.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.label}</div>
                      <div style={{ color: "#64748b", fontSize: 14 }}>
                        {p.windMph} mph wind, {p.gustMph} mph gusts, {p.waveFt} ft waves, {p.dir}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{p.score}/10</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
