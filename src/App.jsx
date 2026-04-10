import React, { useEffect, useMemo, useState } from "react";

const LONG_POINT = { lat: 42.58, lon: -80.4 };
const TIME_WINDOWS = {
  morning: { startHour: 8, endHour: 11 },
  afternoon: { startHour: 12, endHour: 16 },
  evening: { startHour: 17, endHour: 20 },
};

const LENGTH_RANGES = [
  { value: "15-18", label: "15–18 ft", bonus: 0 },
  { value: "19-21", label: "19–21 ft", bonus: 0.5 },
  { value: "22-24", label: "22–24 ft", bonus: 1 },
  { value: "25-27", label: "25–27 ft", bonus: 1.5 },
  { value: "28-30", label: "28–30 ft", bonus: 2 },
];

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWindowHours(dateStr, block) {
  const base = new Date(`${dateStr}T00:00:00`);
  const cfg = TIME_WINDOWS[block];
  const arr = [];
  for (let h = cfg.startHour; h <= cfg.endHour; h += 1) {
    const d = new Date(base);
    d.setHours(h, 0, 0, 0);
    arr.push(d.getTime());
  }
  return arr;
}

function closestIndexes(hours, targets) {
  return targets.map((target) => {
    let bestIdx = 0;
    let bestDiff = Infinity;
    hours.forEach((t, i) => {
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    });
    return bestIdx;
  });
}

function avg(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function mpsToMph(v) {
  return Math.round(v * 2.23694);
}

function metersToFeet(v) {
  return v * 3.28084;
}

function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

function recommendationText(score) {
  if (score <= 3) return "Not recommended";
  if (score <= 5) return "Use caution";
  if (score <= 7) return "Fair to good";
  return "Very good";
}

const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" },
  container: { maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 },
  hero: { borderRadius: 20, background: "#0f172a", color: "white", padding: 20 },
  card: { background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" },
  input: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  select: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" },
  label: { marginBottom: 6, fontWeight: 700, display: "block" },
  primary: { padding: 12, borderRadius: 12, border: 0, background: "#0f172a", color: "white", fontWeight: 700, cursor: "pointer" },
  secondary: { padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white", fontWeight: 700, cursor: "pointer" },
};

export default function App() {
  const [date, setDate] = useState(todayStr());
  const [block, setBlock] = useState("afternoon");
  const [area, setArea] = useState("outer");
  const [lengthRange, setLengthRange] = useState("19-21");

  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setErr("Missing Windy API key");
      setForecast(null);
      return;
    }

    setLoading(true);
    setErr("");

    const targets = getWindowHours(date, block);

    const windReq = fetch("https://api.windy.com/api/point-forecast/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-windy-api-key": key },
      body: JSON.stringify({
        lat: LONG_POINT.lat,
        lon: LONG_POINT.lon,
        model: "gfs",
        parameters: ["wind", "windGust"],
        levels: ["surface"],
        key,
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Windy wind request failed: ${res.status}`);
      return res.json();
    });

    const waveReq = fetch("https://api.windy.com/api/point-forecast/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-windy-api-key": key },
      body: JSON.stringify({
        lat: LONG_POINT.lat,
        lon: LONG_POINT.lon,
        model: "gfsWave",
        parameters: ["waves"],
        key,
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Windy wave request failed: ${res.status}`);
      return res.json();
    });

    Promise.all([windReq, waveReq])
      .then(([windPayload, wavePayload]) => {
        const windHours = (windPayload.ts || []).map((t) => Number(t));
        const waveHours = (wavePayload.ts || []).map((t) => Number(t));
        const windIdxs = closestIndexes(windHours, targets);
        const waveIdxs = closestIndexes(waveHours, targets);

        const windU = windPayload["wind_u-surface"] || windPayload.wind_u || [];
        const windV = windPayload["wind_v-surface"] || windPayload.wind_v || [];
        const gust = windPayload["gust-surface"] || windPayload.gust || [];
        const waveHeights = wavePayload["waves_height-surface"] || [];

        const windSpeeds = windIdxs.map((i) => {
          const u = windU[i];
          const v = windV[i];
          return typeof u === "number" && typeof v === "number" ? Math.sqrt(u * u + v * v) : null;
        });

        const windDirs = windIdxs.map((i) => {
          const u = windU[i];
          const v = windV[i];
          if (typeof u !== "number" || typeof v !== "number") return null;
          const deg = (270 - Math.atan2(v, u) * 180 / Math.PI) % 360;
          return deg < 0 ? deg + 360 : deg;
        });

        setForecast({
          windAvg: avg(windSpeeds),
          gustAvg: avg(windIdxs.map((i) => gust[i])),
          dirAvg: avg(windDirs),
          waveAvg: avg(waveIdxs.map((i) => waveHeights[i])),
        });
      })
      .catch((e) => {
        setErr(e.message || "Failed to load forecast");
        setForecast(null);
      })
      .finally(() => setLoading(false));
  }, [date, block]);

  const predictedScore = useMemo(() => {
    const waveFt = forecast?.waveAvg != null ? metersToFeet(forecast.waveAvg) : 0;
    const sizeBonus = LENGTH_RANGES.find((r) => r.value === lengthRange)?.bonus || 0;

    let score = area === "inner" ? 8 : 5;

    if (waveFt > 1) score -= 1;
    if (waveFt > 2) score -= 1;
    if (waveFt > 3) score -= 1;
    if (waveFt > 4) score -= 1;

    score += sizeBonus;

    return Math.max(1, Math.min(10, Math.round(score)));
  }, [forecast, area, lengthRange]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Simplified version</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Long Point Bay Boating Score</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Inner and Outer Bay only. No accounts, no saved boats, no trip logging.
          </p>
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Check conditions</h2>

          <label style={styles.label}>Date</label>
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <label style={styles.label}>Area</label>
              <select style={styles.select} value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="inner">Inner Bay</option>
                <option value="outer">Outer Bay</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Boat length range</label>
              <select style={styles.select} value={lengthRange} onChange={(e) => setLengthRange(e.target.value)}>
                {LENGTH_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={styles.label}>Time window</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {["morning", "afternoon", "evening"].map((b) => (
                <button key={b} onClick={() => setBlock(b)} style={block === b ? styles.primary : styles.secondary}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Forecast</h2>
          {loading && <div>Loading Windy forecast...</div>}
          {err && <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12 }}>{err}</div>}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Wind</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {forecast ? `${mpsToMph(forecast.windAvg || 0)} mph ${degToCompass(forecast.dirAvg)}` : "—"}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Gusts</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {forecast ? `${mpsToMph(forecast.gustAvg || 0)} mph` : "—"}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Waves</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {forecast?.waveAvg != null ? `${metersToFeet(forecast.waveAvg).toFixed(1)} ft` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Prediction</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ textAlign: "center", background: "#f8fafc", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 40, fontWeight: 700 }}>{predictedScore}</div>
              <div>Score / 10</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{recommendationText(predictedScore)}</div>
              <div style={{ marginTop: 8, color: "#64748b" }}>
                {area === "inner"
                  ? "Inner Bay usually stays friendlier than Outer Bay."
                  : "Outer Bay gets rougher faster when wind and waves build."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
