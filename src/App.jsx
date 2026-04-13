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

function blockTargetHour(block) {
  if (block === "morning") return 10;
  if (block === "afternoon") return 14;
  return 18;
}

function targetDate(dateStr, block) {
  return new Date(`${dateStr}T${String(blockTargetHour(block)).padStart(2, "0")}:00:00`);
}

function nearestIndex(times, targetMs) {
  let best = -1;
  let bestDiff = Infinity;
  times.forEach((stamp, idx) => {
    const diff = Math.abs(new Date(stamp).getTime() - targetMs);
    if (diff < bestDiff) {
      best = idx;
      bestDiff = diff;
    }
  });
  return best;
}

function mToFt(m) {
  return m * 3.28084;
}

function kmhToMph(v) {
  return v * 0.621371;
}

function degToCompass(deg) {
  if (!Number.isFinite(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function formatWind(valueKmh, units) {
  if (!Number.isFinite(valueKmh)) return "—";
  return units === "metric" ? `${Math.round(valueKmh)} km/h` : `${Math.round(kmhToMph(valueKmh))} mph`;
}

function formatWave(valueM, units) {
  if (!Number.isFinite(valueM)) return "—";
  return units === "metric" ? `${valueM.toFixed(1)} m` : `${mToFt(valueM).toFixed(1)} ft`;
}

function boatFactor(boatLengthFt) {
  if (boatLengthFt <= 18) return 0;
  if (boatLengthFt <= 21) return 0.5;
  if (boatLengthFt <= 24) return 1;
  if (boatLengthFt <= 27) return 1.5;
  return 2;
}

function scoreFromForecast({ windAvgKmh, gustAvgKmh, waveAvgM, boatLengthFt }) {
  let score = 10;
  const windMph = kmhToMph(windAvgKmh || 0);
  const gustMph = kmhToMph(gustAvgKmh || 0);
  const waveFt = mToFt(waveAvgM || 0);

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
  if (score >= 9) return `Conditions look very comfortable for a boat around ${boatLengthFt} ft. Most boaters in this size range should find this a very good ride.`;
  if (score >= 7) return `Conditions look generally good for a boat around ${boatLengthFt} ft. Expect a decent ride, with some movement still possible depending on your comfort level.`;
  if (score >= 5) return `Conditions look mixed for a boat around ${boatLengthFt} ft. Some boaters may still go, but comfort will depend on how much chop you are willing to tolerate.`;
  if (score >= 3) return `Use caution with a boat around ${boatLengthFt} ft. Many boaters would consider this an uncomfortable ride.`;
  return `Conditions look poor for a boat around ${boatLengthFt} ft. For many boaters this would likely be an uncomfortable or not worthwhile outing.`;
}

async function fetchOpenMeteoPoint({ lat, lon, tripDate, timeBlock }) {
  const targetMs = targetDate(tripDate, timeBlock).getTime();

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=auto&forecast_days=16`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&hourly=wave_height&timezone=auto&forecast_days=16`;

  const [weatherResp, marineResp] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
  if (!weatherResp.ok) throw new Error(`Open-Meteo weather failed: ${weatherResp.status}`);
  if (!marineResp.ok) throw new Error(`Open-Meteo marine failed: ${marineResp.status}`);

  const weatherJson = await weatherResp.json();
  const marineJson = await marineResp.json();

  const weatherTimes = weatherJson.hourly?.time || [];
  const marineTimes = marineJson.hourly?.time || [];

  const weatherIdx = nearestIndex(weatherTimes, targetMs);
  const marineIdx = nearestIndex(marineTimes, targetMs);

  if (weatherIdx < 0) throw new Error("No weather data returned.");
  if (marineIdx < 0) throw new Error("No marine data returned.");

  return {
    sourceTimeWeather: weatherTimes[weatherIdx] || null,
    sourceTimeMarine: marineTimes[marineIdx] || null,
    windAvgKmh: weatherJson.hourly?.wind_speed_10m?.[weatherIdx] ?? null,
    windDirDeg: weatherJson.hourly?.wind_direction_10m?.[weatherIdx] ?? null,
    windDir: degToCompass(weatherJson.hourly?.wind_direction_10m?.[weatherIdx]),
    gustAvgKmh: weatherJson.hourly?.wind_gusts_10m?.[weatherIdx] ?? null,
    waveAvgM: marineJson.hourly?.wave_height?.[marineIdx] ?? null,
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

    async function run() {
      setPointData((prev) => ({ ...prev, status: "loading", message: "" }));
      try {
        const forecast = await fetchOpenMeteoPoint({
          lat: selectedPoint.lat,
          lon: selectedPoint.lon,
          tripDate,
          timeBlock,
        });
        if (!cancelled) setPointData({ status: "ready", message: "", forecast });
      } catch (error) {
        if (!cancelled) setPointData({ status: "error", message: error.message || "Open-Meteo request failed.", forecast: null });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedPoint, tripDate, timeBlock]);

  const interpreted = useMemo(() => {
    if (!pointData.forecast) return { score: "—", label: "—", reason: "Click a spot and wait for the forecast." };
    const score = scoreFromForecast({
      windAvgKmh: pointData.forecast.windAvgKmh,
      gustAvgKmh: pointData.forecast.gustAvgKmh,
      waveAvgM: pointData.forecast.waveAvgM,
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
            Click any spot on the map. This version uses Open-Meteo weather plus Open-Meteo marine data for one exact forecast hour.
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

            {pointData.status === "loading" && <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>Loading forecast...</div>}
            {pointData.status === "error" && (
              <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", borderRadius: 16, padding: 14 }}>{pointData.message}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 34, fontWeight: 700 }}>{interpreted.score}</div>
                <div style={{ color: "#64748b" }}>Score / 10</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{interpreted.label}</div>
                <div style={{ color: "#64748b" }}>Meaning</div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Open-Meteo data at this exact spot</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Wind</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? `${formatWind(pointData.forecast.windAvgKmh, units)} ${pointData.forecast.windDir}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Gusts</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? formatWind(pointData.forecast.gustAvgKmh, units) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Waves</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {pointData.forecast ? formatWave(pointData.forecast.waveAvgM, units) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Plain-English interpretation</div>
              <p style={{ marginTop: 10, lineHeight: 1.6, color: "#334155" }}>
                {interpreted.reason}
              </p>
            </div>

            <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Debug timestamps</div>
              <div style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>
                Weather: {pointData.forecast?.sourceTimeWeather || "—"}<br />
                Marine: {pointData.forecast?.sourceTimeMarine || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
