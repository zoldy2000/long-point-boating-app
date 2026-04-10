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

const ZONES = [
  {
    id: "inner-west",
    name: "Inner Bay West",
    area: "inner",
    points: "88,270 170,236 186,286 104,314",
    exposure: { N: 0, NE: 0, E: 0, SE: 0, S: 1, SW: 2, W: 2, NW: 1 },
    notes: "Often more protected in east and northeast setups. It can get lumpier in stronger west and southwest wind.",
  },
  {
    id: "inner-central",
    name: "Inner Bay Central",
    area: "inner",
    points: "186,286 170,236 265,216 286,276 220,311",
    exposure: { N: 0, NE: 0, E: 1, SE: 1, S: 1, SW: 1, W: 1, NW: 1 },
    notes: "Usually moderate rather than extreme unless the wind is sustained and aligned across open water.",
  },
  {
    id: "inner-east",
    name: "Inner Bay East",
    area: "inner",
    points: "286,276 265,216 356,206 380,256 336,301",
    exposure: { N: 0, NE: 1, E: 2, SE: 2, S: 1, SW: 0, W: 0, NW: 0 },
    notes: "Often calmer in west wind but more exposed in easterly patterns.",
  },
  {
    id: "bay-mouth",
    name: "Bay Mouth",
    area: "outer",
    points: "356,206 390,160 420,226 380,256",
    exposure: { N: 1, NE: 2, E: 2, SE: 3, S: 3, SW: 3, W: 2, NW: 1 },
    notes: "One of the most sensitive parts of the bay system. Often deserves separate caution.",
  },
  {
    id: "outer-west",
    name: "Outer Bay West",
    area: "outer",
    points: "390,160 500,136 510,196 420,226",
    exposure: { N: 0, NE: 0, E: 0, SE: 1, S: 2, SW: 3, W: 2, NW: 1 },
    notes: "Usually worsens quickly in southwest wind and is often one of the first outer sections to feel uncomfortable.",
  },
  {
    id: "outer-central",
    name: "Outer Bay Central",
    area: "outer",
    points: "420,226 510,196 575,230 510,286 430,286",
    exposure: { N: 0, NE: 0, E: 1, SE: 2, S: 2, SW: 2, W: 1, NW: 1 },
    notes: "Broad open-water zone. Often a good indicator of general ride comfort.",
  },
  {
    id: "outer-east",
    name: "Outer Bay East",
    area: "outer",
    points: "575,230 655,216 700,256 640,306 510,286",
    exposure: { N: 1, NE: 2, E: 3, SE: 3, S: 2, SW: 1, W: 0, NW: 0 },
    notes: "Usually gets hit harder in east and southeast patterns, but can look better than the west side in west wind.",
  },
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
  return { speed, direction: degToCompass(deg), degrees: deg };
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

function boatFactor(boatLengthFt) {
  if (boatLengthFt <= 18) return 0;
  if (boatLengthFt <= 21) return 0.5;
  if (boatLengthFt <= 24) return 1;
  if (boatLengthFt <= 27) return 1.5;
  return 2;
}

function zoneScore({ zone, windAvg, gustAvg, waveAvg, windDir, boatLengthFt }) {
  const windMph = mpsToMph(windAvg || 0);
  const gustMph = mpsToMph(gustAvg || 0);
  const waveFt = mToFt(waveAvg || 0);
  const exposure = zone.exposure[windDir] ?? 1;

  let score = 9.5;
  score -= exposure * 1.15;
  score -= Math.max(0, (windMph - 10) / 5);
  score -= Math.max(0, (gustMph - 16) / 7);
  score -= Math.max(0, (waveFt - 1) * 0.9);
  score += boatFactor(boatLengthFt);

  if (zone.id === "bay-mouth") score -= 0.8;
  return Math.max(1, Math.min(10, Math.round(score)));
}

function colorForScore(score) {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#84cc16";
  if (score >= 4) return "#f59e0b";
  if (score >= 3) return "#f97316";
  return "#ef4444";
}

function labelForScore(score) {
  if (score >= 8) return "Good";
  if (score >= 6) return "Usable";
  if (score >= 4) return "Caution";
  return "Poor";
}

const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" },
  container: { maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 },
  hero: { borderRadius: 20, background: "#0f172a", color: "white", padding: 20 },
  card: { background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" },
  input: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  select: { width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" },
  label: { marginBottom: 6, fontWeight: 700, display: "block" },
  primary: { padding: 12, borderRadius: 12, border: 0, background: "#0f172a", color: "white", fontWeight: 700, cursor: "pointer" },
};

export default function App() {
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState("afternoon");
  const [lengthRange, setLengthRange] = useState("19-21");
  const [windyData, setWindyData] = useState({ status: "idle", card: null, summary: null, message: "" });
  const [selectedZoneId, setSelectedZoneId] = useState("outer-west");

  const boatLengthFt = LENGTH_RANGES.find((item) => item.value === lengthRange)?.boatLengthFt || 20;

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setWindyData({ status: "missing-key", card: null, summary: null, message: "Windy key not found in app environment." });
      return;
    }

    const [startHour, endHour] = windowHours(timeBlock);

    async function fetchWindy() {
      setWindyData((prev) => ({ ...prev, status: "loading", message: "" }));
      try {
        const inner = AREA_COORDS.inner;
        const outer = AREA_COORDS.outer;

        const makeReq = (coords, model, parameters) =>
          fetch("https://api.windy.com/api/point-forecast/v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: coords.lat,
              lon: coords.lon,
              model,
              parameters,
              levels: ["surface"],
              key,
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Windy request failed: ${res.status}`);
            return res.json();
          });

        const [windInner, windOuter, waveInner, waveOuter] = await Promise.all([
          makeReq(inner, "gfs", ["wind", "windGust"]),
          makeReq(outer, "gfs", ["wind", "windGust"]),
          makeReq(inner, "gfsWave", ["waves"]),
          makeReq(outer, "gfsWave", ["waves"]),
        ]);

        const buildAreaData = (windJson, waveJson) => {
          const ts = windJson.ts || [];
          const u = windJson["wind_u-surface"] || [];
          const v = windJson["wind_v-surface"] || [];
          const gust = windJson["gust-surface"] || [];
          const waveHeight = waveJson["waves_height-surface"] || [];

          const indexes = ts
            .map((stamp, idx) => ({ idx, date: new Date(stamp) }))
            .filter(({ date }) => toYmd(date) === tripDate && date.getHours() >= startHour && date.getHours() <= endHour)
            .map(({ idx }) => idx);

          if (!indexes.length) throw new Error("No Windy forecast points returned for that date and time window.");

          const windVectors = indexes.map((idx) => windFromUv(u[idx], v[idx]));
          const windSpeedRange = minMax(windVectors.map((item) => item.speed));
          const avgWindVector = windFromUv(avg(indexes.map((idx) => u[idx])) || 0, avg(indexes.map((idx) => v[idx])) || 0);
          const gustRange = minMax(indexes.map((idx) => gust[idx]));
          const waveRange = minMax(indexes.map((idx) => waveHeight[idx]));
          const waveAvg = avg(indexes.map((idx) => waveHeight[idx])) || 0;
          const gustAvg = avg(indexes.map((idx) => gust[idx])) || 0;
          const windAvg = avg(windVectors.map((item) => item.speed)) || 0;

          return {
            windAvg,
            gustAvg,
            waveAvg,
            windDir: avgWindVector.direction,
            card: {
              wind: formatWindRange(windSpeedRange),
              direction: avgWindVector.direction,
              gusts: formatWindRange(gustRange),
              waves: formatWaveRange(waveRange),
            },
          };
        };

        const innerData = buildAreaData(windInner, waveInner);
        const outerData = buildAreaData(windOuter, waveOuter);

        if (!cancelled) {
          setWindyData({
            status: "ready",
            card: { inner: innerData.card, outer: outerData.card },
            summary: { inner: innerData, outer: outerData },
            message: "",
          });
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
  }, [timeBlock, tripDate]);

  const scoredZones = useMemo(() => {
    if (!windyData.summary) return [];
    return ZONES.map((zone) => {
      const areaData = windyData.summary[zone.area];
      const score = zoneScore({
        zone,
        windAvg: areaData.windAvg,
        gustAvg: areaData.gustAvg,
        waveAvg: areaData.waveAvg,
        windDir: areaData.windDir,
        boatLengthFt,
      });
      return {
        ...zone,
        score,
        fill: colorForScore(score),
        label: labelForScore(score),
        windDir: areaData.windDir,
      };
    });
  }, [windyData.summary, boatLengthFt]);

  const selectedZone = scoredZones.find((z) => z.id === selectedZoneId) || scoredZones[0] || null;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Map version</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Long Point Bay Conditions Map</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Whole-bay color map using Windy forecast plus basic exposure logic. Tap a zone to see why.
          </p>
        </div>

        <div style={styles.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={styles.label}>Date</label>
              <input style={styles.input} type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} />
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
                <button key={b} onClick={() => setTimeBlock(b)} style={timeBlock === b ? styles.primary : { ...styles.primary, background: "white", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

                {windyData.status === "loading" && <div style={styles.card}>Loading Windy forecast...</div>}
        {(windyData.status === "error" || windyData.status === "missing-key") && (
          <div style={styles.card}>
            <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12 }}>{windyData.message}</div>
          </div>
        )}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.45fr 0.95fr" }}>
          <div style={styles.card}>
            <svg viewBox="0 0 760 420" style={{ width: "100%", borderRadius: 16, background: "#e0f2fe" }}>
              <path d="M40 315 C95 255, 180 215, 290 205 C350 198, 420 150, 520 135 C610 122, 700 170, 720 235 C736 288, 702 344, 640 360 C560 380, 430 368, 320 340 C230 318, 125 320, 40 315 Z" fill="#dbeafe" stroke="#94a3b8" strokeWidth="3" />
              <path d="M65 300 C120 258, 188 230, 278 219 C325 213, 352 208, 372 203" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="8 8" />
              <text x="115" y="185" fill="#334155" fontSize="16" fontWeight="700">Inner Bay</text>
              <text x="505" y="120" fill="#334155" fontSize="16" fontWeight="700">Outer Bay</text>

              {scoredZones.map((zone) => (
                <polygon
                  key={zone.id}
                  points={zone.points}
                  fill={zone.fill}
                  fillOpacity="0.8"
                  stroke={selectedZoneId === zone.id ? "#0f172a" : "#334155"}
                  strokeWidth={selectedZoneId === zone.id ? "4" : "2"}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedZoneId(zone.id)}
                />
              ))}
            </svg>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ background: "#22c55e", color: "white", padding: "6px 10px", borderRadius: 999 }}>Good</div>
              <div style={{ background: "#84cc16", color: "white", padding: "6px 10px", borderRadius: 999 }}>Usable</div>
              <div style={{ background: "#f59e0b", color: "white", padding: "6px 10px", borderRadius: 999 }}>Caution</div>
              <div style={{ background: "#ef4444", color: "white", padding: "6px 10px", borderRadius: 999 }}>Poor</div>
            </div>
          </div>

          <div style={styles.card}>
            {!selectedZone ? (
              <div>Select a zone.</div>
            ) : (
              <>
                <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Selected zone</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{selectedZone.name}</div>
                  <div style={{ color: "#64748b", marginTop: 4 }}>{selectedZone.area === "inner" ? "Inner Bay" : "Outer Bay"}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 34, fontWeight: 700 }}>{selectedZone.score}</div>
                    <div style={{ color: "#64748b" }}>Zone score</div>
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedZone.label}</div>
                    <div style={{ color: "#64748b" }}>Condition</div>
                  </div>
                </div>

                <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Why this zone is this color</div>
                  <div style={{ marginTop: 8, lineHeight: 1.5 }}>
                    Wind in this area is reading about <strong>{windyData.card?.[selectedZone.area]?.wind || "—"} {selectedZone.windDir || ""}</strong> with gusts near <strong>{windyData.card?.[selectedZone.area]?.gusts || "—"}</strong> and waves around <strong>{windyData.card?.[selectedZone.area]?.waves || "—"}</strong>. This zone has an exposure value of <strong>{selectedZone.exposure[selectedZone.windDir] ?? "—"}</strong> for that wind direction. {selectedZone.notes}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
