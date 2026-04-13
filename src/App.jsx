import React, { useEffect, useMemo, useRef, useState } from "react";

const LENGTH_RANGES = [
  { value: "15-18", label: "15–18 ft", boatLengthFt: 17 },
  { value: "19-21", label: "19–21 ft", boatLengthFt: 20 },
  { value: "22-24", label: "22–24 ft", boatLengthFt: 23 },
  { value: "25-27", label: "25–27 ft", boatLengthFt: 26 },
  { value: "28-30", label: "28–30 ft", boatLengthFt: 29 },
];

const MAP_START = { lat: 42.603, lon: -80.345 };
const MAP_CENTER = [42.585, -80.31];

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  const fromDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  return { speed, direction: degToCompass(fromDeg) };
}

function formatSpeedRange(range, units) {
  if (!range) return "—";
  if (units === "metric") return `${range.min.toFixed(1)}-${range.max.toFixed(1)} m/s`;
  return `${Math.round(mpsToMph(range.min))}-${Math.round(mpsToMph(range.max))} mph`;
}

function formatWaveRange(range, units) {
  if (!range) return "—";
  if (units === "metric") {
    if (Math.abs(range.min - range.max) < 0.08) return `${range.min.toFixed(1)} m`;
    return `${range.min.toFixed(1)}-${range.max.toFixed(1)} m`;
  }
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

function scoreFromForecast({ windAvg, gustAvg, waveAvg, boatLengthFt }) {
  let score = 10;
  const windMph = mpsToMph(windAvg || 0);
  const gustMph = mpsToMph(gustAvg || 0);
  const waveFt = mToFt(waveAvg || 0);

  score -= Math.max(0, (windMph - 10) / 4);
  score -= Math.max(0, (gustMph - 16) / 5);
  score -= Math.max(0, (waveFt - 1) * 1.6);
  score += boatFactor(boatLengthFt);

  return Math.max(1, Math.min(10, Math.round(score)));
}

function labelFromScore(score) {
  if (score >= 9) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5) return "Fair";
  if (score >= 3) return "Use caution";
  return "Poor";
}

function genericInterpretation({ score, boatLengthFt }) {
  if (score >= 9) {
    return `Conditions look very comfortable for a boat around ${boatLengthFt} ft. Most boaters in this size range should find this a very good ride.`;
  }
  if (score >= 7) {
    return `Conditions look generally good for a boat around ${boatLengthFt} ft. Expect a decent ride, with some movement still possible depending on your comfort level.`;
  }
  if (score >= 5) {
    return `Conditions look mixed for a boat around ${boatLengthFt} ft. Some boaters may still go, but comfort will depend on how much chop you are willing to tolerate.`;
  }
  if (score >= 3) {
    return `Use caution with a boat around ${boatLengthFt} ft. Many boaters would consider this an uncomfortable ride.`;
  }
  return `Conditions look poor for a boat around ${boatLengthFt} ft. For many boaters this would likely be an uncomfortable or not worthwhile outing.`;
}

function pickSeries(obj, exactKeys = [], containsTerms = []) {
  for (const key of exactKeys) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  for (const [key, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) continue;
    const lower = key.toLowerCase();
    if (containsTerms.every((term) => lower.includes(term))) return value;
  }
  return [];
}

async function fetchWindyPoint({ lat, lon, tripDate, timeBlock, key }) {
  const [startHour, endHour] = windowHours(timeBlock);

  const makeReq = (model, parameters) =>
    fetch("https://api.windy.com/api/point-forecast/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lon,
        model,
        parameters,
        levels: ["surface"],
        key,
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Windy request failed: ${res.status}`);
      return res.json();
    });

  const [windJson, waveJson] = await Promise.all([
    makeReq("gfs", ["wind", "windGust"]),
    makeReq("gfsWave", ["waves"]),
  ]);

  const windTs = windJson.ts || [];
  const waveTs = waveJson.ts || [];

  const windIndexes = windTs
    .map((stamp, idx) => ({ idx, date: new Date(stamp) }))
    .filter(({ date }) => toYmd(date) === tripDate && date.getHours() >= startHour && date.getHours() <= endHour)
    .map(({ idx }) => idx);

  const waveIndexes = waveTs
    .map((stamp, idx) => ({ idx, date: new Date(stamp) }))
    .filter(({ date }) => toYmd(date) === tripDate && date.getHours() >= startHour && date.getHours() <= endHour)
    .map(({ idx }) => idx);

  if (!windIndexes.length) throw new Error("No Windy wind forecast points returned for that date and time window.");
  if (!waveIndexes.length) throw new Error("No Windy wave forecast points returned for that date and time window.");

  const u = pickSeries(windJson, ["wind_u-surface", "wind_u"], ["wind_u"]);
  const v = pickSeries(windJson, ["wind_v-surface", "wind_v"], ["wind_v"]);
  const gust = pickSeries(windJson, ["gust-surface", "windGust-surface", "gust"], ["gust"]);
  const waveHeight = pickSeries(
    waveJson,
    ["waves_height-surface", "wavesHeight-surface", "waves", "waves_height"],
    ["wave", "height"]
  );

  const windVectors = windIndexes.map((idx) => windFromUv(u[idx], v[idx]));
  const windSpeedRange = minMax(windVectors.map((item) => item.speed));
  const avgWindVector = windFromUv(avg(windIndexes.map((idx) => u[idx])) || 0, avg(windIndexes.map((idx) => v[idx])) || 0);
  const gustRange = minMax(windIndexes.map((idx) => gust[idx]));
  const waveRange = minMax(waveIndexes.map((idx) => waveHeight[idx]));
  const waveAvg = avg(waveIndexes.map((idx) => waveHeight[idx])) || 0;
  const gustAvg = avg(windIndexes.map((idx) => gust[idx])) || 0;
  const windAvg = avg(windVectors.map((item) => item.speed)) || 0;

  return {
    windAvg,
    gustAvg,
    waveAvg,
    windDir: avgWindVector.direction,
    windRange: windSpeedRange,
    gustRange,
    waveRange,
  };
}

function useLeafletMap({ selectedPoint, onPick }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaflet() {
      if (!document.querySelector('link[data-leaflet="true"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.leaflet = "true";
        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      if (cancelled || !mapDivRef.current || mapRef.current) return;

      const L = window.L;
      const map = L.map(mapDivRef.current, {
        center: [MAP_CENTER[0], MAP_CENTER[1]],
        zoom: 10,
        minZoom: 9,
        maxZoom: 14,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const marker = L.marker([selectedPoint.lat, selectedPoint.lon]).addTo(map);

      map.on("click", (e) => {
        onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;
    }

    loadLeaflet();
    return () => {
      cancelled = true;
    };
  }, [onPick]);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([selectedPoint.lat, selectedPoint.lon]);
    }
  }, [selectedPoint.lat, selectedPoint.lon]);

  return mapDivRef;
}

export default function App() {
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState("afternoon");
  const [lengthRange, setLengthRange] = useState("19-21");
  const [units, setUnits] = useState("imperial");
  const [selectedPoint, setSelectedPoint] = useState(MAP_START);
  const [pointData, setPointData] = useState({ status: "idle", message: "", forecast: null });

  const mapDivRef = useLeafletMap({
    selectedPoint,
    onPick: setSelectedPoint,
  });

  const boatLengthFt = LENGTH_RANGES.find((item) => item.value === lengthRange)?.boatLengthFt || 20;

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setPointData({ status: "missing-key", message: "Windy key not found in app environment.", forecast: null });
      return;
    }

    async function run() {
      setPointData((prev) => ({ ...prev, status: "loading", message: "" }));
      try {
        const forecast = await fetchWindyPoint({
          lat: selectedPoint.lat,
          lon: selectedPoint.lon,
          tripDate,
          timeBlock,
          key,
        });
        if (!cancelled) setPointData({ status: "ready", message: "", forecast });
      } catch (error) {
        if (!cancelled) setPointData({ status: "error", message: error.message || "Windy request failed.", forecast: null });
      }
    }

    run();
    return () => { cancelled = true; };
  }, [selectedPoint, tripDate, timeBlock]);

  const interpreted = useMemo(() => {
    if (!pointData.forecast) return null;
    const score = scoreFromForecast({
      windAvg: pointData.forecast.windAvg,
      gustAvg: pointData.forecast.gustAvg,
      waveAvg: pointData.forecast.waveAvg,
      boatLengthFt,
    });

    return {
      score,
      label: labelFromScore(score),
      reason: genericInterpretation({ score, boatLengthFt }),
    };
  }, [pointData.forecast, boatLengthFt]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{ borderRadius: 20, background: "#0f172a", color: "white", padding: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Boater's App</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Boating Meaning</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Click any spot on the map. The app reads Windy data for that exact point and translates it into simple boating meaning for your boat size.
          </p>
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div>
              <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Date</label>
              <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Time window</label>
              <select value={timeBlock} onChange={(e) => setTimeBlock(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
            <div>
              <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Boat length range</label>
              <select value={lengthRange} onChange={(e) => setLengthRange(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}>
                {LENGTH_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ marginBottom: 6, fontWeight: 700, display: "block" }}>Units</label>
              <select value={units} onChange={(e) => setUnits(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}>
                <option value="imperial">Imperial</option>
                <option value="metric">Metric</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.35fr 0.95fr" }}>
          <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ marginBottom: 10, color: "#64748b", fontSize: 14 }}>Click any water spot. You can also zoom and drag.</div>
            <div
              ref={mapDivRef}
              style={{
                width: "100%",
                height: 620,
                borderRadius: 16,
                border: "1px solid #cbd5e1",
                overflow: "hidden",
                background: "#dbeafe",
              }}
            />
          </div>

          <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Selected spot</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>Point forecast</div>
              <div style={{ color: "#64748b", marginTop: 4 }}>
                {selectedPoint.lat.toFixed(4)}, {selectedPoint.lon.toFixed(4)}
              </div>
            </div>

            {pointData.status === "loading" && <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>Loading Windy forecast...</div>}
            {(pointData.status === "error" || pointData.status === "missing-key") && (
              <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", borderRadius: 16, padding: 14 }}>{pointData.message}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 34, fontWeight: 700 }}>{interpreted ? interpreted.score : "—"}</div>
                <div style={{ color: "#64748b" }}>Score / 10</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{interpreted ? interpreted.label : "—"}</div>
                <div style={{ color: "#64748b" }}>Meaning</div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Windy forecast at this exact spot</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Wind</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? `${formatSpeedRange(pointData.forecast.windRange, units)} ${pointData.forecast.windDir}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Gusts</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? formatSpeedRange(pointData.forecast.gustRange, units) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Waves</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? formatWaveRange(pointData.forecast.waveRange, units) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Plain-English interpretation</div>
              <p style={{ marginTop: 10, lineHeight: 1.6, color: "#334155" }}>
                {interpreted ? interpreted.reason : "Click a spot and wait for the forecast."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
