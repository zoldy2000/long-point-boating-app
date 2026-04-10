import React, { useEffect, useMemo, useState } from "react";

const AREA_COORDS = {
  inner: { lat: 42.586, lon: -80.424, label: "Inner Bay" },
  outer: { lat: 42.629, lon: -80.318, label: "Outer Bay" },
};

const LENGTH_RANGES = [
  { value: "15-18", label: "15–18 ft", boatLengthFt: 17 },
  { value: "19-21", label: "19–21 ft", boatLengthFt: 20 },
  { value: "22-24", label: "22–24 ft", boatLengthFt: 23 },
  { value: "25-27", label: "25–27 ft", boatLengthFt: 26 },
  { value: "28-30", label: "28–30 ft", boatLengthFt: 29 },
];

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function windowHours(block) {
  if (block === "morning") return [8, 11];
  if (block === "afternoon") return [12, 16];
  return [17, 20];
}

function avg(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function minMax(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return { min: Math.min(...clean), max: Math.max(...clean) };
}

function mToFt(m) {
  return m * 3.28084;
}

function mpsToMph(v) {
  return v * 2.23694;
}

function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function windFromUv(u, v) {
  const speed = Math.sqrt(u * u + v * v);
  const deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  return { speed, direction: degToCompass(deg) };
}

function formatWindRange(range) {
  if (!range) return "—";
  return `${Math.round(mpsToMph(range.min))}-${Math.round(mpsToMph(range.max))} mph`;
}

function formatWaveRange(range) {
  if (!range) return "—";
  const min = mToFt(range.min);
  const max = mToFt(range.max);
  if (Math.abs(min - max) < 0.15) return `${min.toFixed(1)} ft`;
  return `${min.toFixed(1)}-${max.toFixed(1)} ft`;
}

function forecastScoreFromLive({ windAvg, gustAvg, waveAvg, area, boatLengthFt }) {
  let score = 10;
  const windMph = mpsToMph(windAvg || 0);
  const gustMph = mpsToMph(gustAvg || 0);
  const waveFt = mToFt(waveAvg || 0);

  score -= Math.max(0, (windMph - 10) / 4);
  score -= Math.max(0, (gustMph - 16) / 5);
  score -= Math.max(0, (waveFt - 1) * 1.5);

  if (area === "outer") score -= 1;
  if (boatLengthFt <= 18) score -= 1;
  else if (boatLengthFt <= 20) score -= 0.5;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function labelFromScore(score) {
  if (score >= 9) return "Excellent ride comfort";
  if (score >= 7) return "Good day for many family boats";
  if (score >= 5) return "Usable, but expect some chop";
  if (score >= 3) return "Use caution";
  return "Poor ride comfort";
}

function cautionFromScore(score, area) {
  if (score >= 7) return `${AREA_COORDS[area].label} looks manageable in this time window.`;
  if (score >= 5) return `${AREA_COORDS[area].label} may still be usable, but expect a rougher ride.`;
  return `${AREA_COORDS[area].label} may be uncomfortable for many family boats in this time window.`;
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
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState("afternoon");
  const [area, setArea] = useState("outer");
  const [lengthRange, setLengthRange] = useState("19-21");
  const [windyData, setWindyData] = useState({ status: "idle", card: null, summary: null, message: "" });

  const boatLengthFt = LENGTH_RANGES.find((item) => item.value === lengthRange)?.boatLengthFt || 20;

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setWindyData({ status: "missing-key", card: null, summary: null, message: "Windy key not found in app environment." });
      return;
    }

    const coords = AREA_COORDS[area];
    const [startHour, endHour] = windowHours(timeBlock);

    async function fetchWindy() {
      setWindyData((prev) => ({ ...prev, status: "loading", message: "" }));
      try {
        const windBody = {
          lat: coords.lat,
          lon: coords.lon,
          model: "gfs",
          parameters: ["wind", "windGust"],
          levels: ["surface"],
          key,
        };

        const wavesBody = {
          lat: coords.lat,
          lon: coords.lon,
          model: "gfsWave",
          parameters: ["waves"],
          levels: ["surface"],
          key,
        };

        const [windResp, waveResp] = await Promise.all([
          fetch("https://api.windy.com/api/point-forecast/v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(windBody),
          }),
          fetch("https://api.windy.com/api/point-forecast/v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(wavesBody),
          }),
        ]);

        if (!windResp.ok) throw new Error(`Windy wind request failed: ${windResp.status}`);
        if (!waveResp.ok) throw new Error(`Windy wave request failed: ${waveResp.status}`);

        const windJson = await windResp.json();
        const waveJson = await waveResp.json();

        const ts = windJson.ts || [];
        const u = windJson["wind_u-surface"] || [];
        const v = windJson["wind_v-surface"] || [];
        const gust = windJson["gust-surface"] || [];
        const waveHeight = waveJson["waves_height-surface"] || [];

        const indexes = ts
          .map((stamp, idx) => ({ idx, date: new Date(stamp) }))
          .filter(({ date }) => toYmd(date) === tripDate && date.getHours() >= startHour && date.getHours() <= endHour)
          .map(({ idx }) => idx);

        if (!indexes.length) {
          throw new Error("No Windy forecast points returned for that date and time window.");
        }

        const windVectors = indexes.map((idx) => windFromUv(u[idx], v[idx]));
        const windSpeedRange = minMax(windVectors.map((item) => item.speed));
        const avgWindVector = windFromUv(avg(indexes.map((idx) => u[idx])) || 0, avg(indexes.map((idx) => v[idx])) || 0);
        const gustRange = minMax(indexes.map((idx) => gust[idx]));
        const waveRange = minMax(indexes.map((idx) => waveHeight[idx]));
        const waveAvg = avg(indexes.map((idx) => waveHeight[idx])) || 0;
        const gustAvg = avg(indexes.map((idx) => gust[idx])) || 0;
        const windAvg = avg(windVectors.map((item) => item.speed)) || 0;

        const liveScore = forecastScoreFromLive({
          windAvg,
          gustAvg,
          waveAvg,
          area,
          boatLengthFt,
        });

        const card = {
          wind: formatWindRange(windSpeedRange),
          direction: avgWindVector.direction,
          gusts: formatWindRange(gustRange),
          waves: formatWaveRange(waveRange),
        };

        const summary = {
          predicted: liveScore,
          label: labelFromScore(liveScore),
          caution: cautionFromScore(liveScore, area),
        };

        if (!cancelled) {
          setWindyData({ status: "ready", card, summary, message: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setWindyData({ status: "error", card: null, summary: null, message: error.message || "Windy request failed." });
        }
      }
    }

    fetchWindy();
    return () => {
      cancelled = true;
    };
  }, [area, timeBlock, tripDate, boatLengthFt]);

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
          <input style={styles.input} type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} />

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
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={styles.label}>Time window</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {["morning", "afternoon", "evening"].map((b) => (
                <button key={b} onClick={() => setTimeBlock(b)} style={timeBlock === b ? styles.primary : styles.secondary}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Forecast</h2>
          {windyData.status === "loading" && <div>Loading Windy forecast...</div>}
          {(windyData.status === "error" || windyData.status === "missing-key") && (
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12 }}>{windyData.message}</div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Wind</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{windyData.card ? `${windyData.card.wind} ${windyData.card.direction}` : "—"}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Gusts</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{windyData.card ? windyData.card.gusts : "—"}</div>
            </div>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
              <div style={{ color: "#64748b", fontSize: 14 }}>Waves</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{windyData.card ? windyData.card.waves : "—"}</div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Prediction</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ textAlign: "center", background: "#f8fafc", borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 40, fontWeight: 700 }}>{windyData.summary ? windyData.summary.predicted : "—"}</div>
              <div>Score / 10</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{windyData.summary ? windyData.summary.label : "Waiting for forecast"}</div>
              <div style={{ marginTop: 8, color: "#64748b" }}>
                {windyData.summary ? windyData.summary.caution : "Pick a date and time window to load the forecast."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
