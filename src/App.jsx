import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LENGTH_RANGES = [
  { value: "15-18", label: "15–18 ft", boatLengthFt: 17 },
  { value: "19-21", label: "19–21 ft", boatLengthFt: 20 },
  { value: "22-24", label: "22–24 ft", boatLengthFt: 23 },
  { value: "25-27", label: "25–27 ft", boatLengthFt: 26 },
  { value: "28-30", label: "28–30 ft", boatLengthFt: 29 },
];

const MAP_START = { lat: 42.603, lon: -80.345 };

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function targetTimestamp(dateStr, block) {
  const hour = block === "morning" ? 10 : block === "afternoon" ? 14 : 18;
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`).getTime();
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

function formatWind(value, units) {
  if (!Number.isFinite(value)) return "—";
  return units === "metric" ? `${value.toFixed(1)} m/s` : `${Math.round(mpsToMph(value))} mph`;
}

function formatGust(value, units) {
  if (!Number.isFinite(value)) return "—";
  return units === "metric" ? `${value.toFixed(1)} m/s` : `${Math.round(mpsToMph(value))} mph`;
}

function formatWaves(value, units) {
  if (!Number.isFinite(value)) return "—";
  return units === "metric" ? `${value.toFixed(1)} m` : `${mToFt(value).toFixed(1)} ft`;
}

function useWindyMap({ mapKey, selectedPoint, timeBlock, tripDate, onPick, onData, units }) {
  const mapDivRef = useRef(null);
  const apiRef = useRef(null);
  const pendingRef = useRef(0);

  const collectAtPoint = useCallback(async (lat, lon) => {
    const api = apiRef.current;
    if (!api) return;
    const runId = Date.now();
    pendingRef.current = runId;

    const { picker, store, broadcast, utils } = api;

    const openAndWait = (overlayName) =>
      new Promise((resolve, reject) => {
        let timeoutId;
        const done = () => {
          clearTimeout(timeoutId);
          picker.off("pickerMoved", movedHandler);
          resolve();
        };
        const movedHandler = ({ lat: pLat, lon: pLon }) => {
          if (Math.abs(pLat - lat) < 0.02 && Math.abs(pLon - lon) < 0.02) done();
        };
        timeoutId = window.setTimeout(() => {
          picker.off("pickerMoved", movedHandler);
          reject(new Error(`Timeout waiting for ${overlayName} picker values`));
        }, 5000);

        picker.on("pickerMoved", movedHandler);
        broadcast.once("redrawFinished", () => {
          picker.open({ lat, lon });
        });
        store.set("overlay", overlayName);
      });

    try {
      onData((prev) => ({ ...prev, status: "loading", message: "" }));

      store.set("timestamp", targetTimestamp(tripDate, timeBlock));

      await openAndWait("wind");
      if (pendingRef.current !== runId) return;
      const windParams = picker.getParams();
      const windObj = utils.wind2obj(windParams.values);

      await openAndWait("waves");
      if (pendingRef.current !== runId) return;
      const waveParams = picker.getParams();
      const waveObj = utils.wave2obj(waveParams.values);

      await openAndWait("gust");
      if (pendingRef.current !== runId) return;
      const gustParams = picker.getParams();
      const gustValue = Array.isArray(gustParams.values) ? gustParams.values[0] : gustParams.values;

      store.set("overlay", "wind");
      broadcast.once("redrawFinished", () => {
        picker.open({ lat, lon });
      });

      onData({
        status: "ready",
        message: "",
        windAvg: windObj.wind,
        windDir: degToCompass(windObj.dir),
        gustAvg: Number.isFinite(gustValue) ? gustValue : null,
        waveAvg: Number.isFinite(waveObj.size) ? waveObj.size : null,
      });
    } catch (error) {
      onData({
        status: "error",
        message: error.message || "Windy map data failed.",
        windAvg: null,
        windDir: "—",
        gustAvg: null,
        waveAvg: null,
      });
    }
  }, [onData, timeBlock, tripDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadWindy() {
      if (!mapKey || !mapDivRef.current || apiRef.current) return;

      if (!window.L) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.4.0/dist/leaflet.js";
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      if (!window.windyInit) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://api.windy.com/assets/map-forecast/libBoot.js";
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }

      if (cancelled) return;

      window.windyInit(
        {
          key: mapKey,
          lat: selectedPoint.lat,
          lon: selectedPoint.lon,
          zoom: 10,
          timestamp: targetTimestamp(tripDate, timeBlock),
          overlay: "wind",
        },
        (windyAPI) => {
          if (cancelled) return;
          apiRef.current = windyAPI;
          const { map } = windyAPI;

          map.on("click", (e) => {
            const next = { lat: e.latlng.lat, lon: e.latlng.lng };
            onPick(next);
          });

          windyAPI.broadcast.once("redrawFinished", () => {
            collectAtPoint(selectedPoint.lat, selectedPoint.lon);
          });
        }
      );
    }

    loadWindy();
    return () => {
      cancelled = true;
    };
  }, [mapKey, collectAtPoint, onPick, selectedPoint.lat, selectedPoint.lon, timeBlock, tripDate]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      api.store.set("timestamp", targetTimestamp(tripDate, timeBlock));
      collectAtPoint(selectedPoint.lat, selectedPoint.lon);
    } catch {}
  }, [tripDate, timeBlock, selectedPoint.lat, selectedPoint.lon, collectAtPoint]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const windMetric = units === "metric" ? "m/s" : "mph";
      const waveMetric = units === "metric" ? "m" : "ft";
      const gustMetric = units === "metric" ? "m/s" : "mph";

      const windAllowed = api.overlays?.wind?.listMetrics?.() || [];
      const waveAllowed = api.overlays?.waves?.listMetrics?.() || [];
      const gustAllowed = api.overlays?.gust?.listMetrics?.() || [];

      if (windAllowed.includes(windMetric)) api.overlays.wind.setMetric(windMetric);
      if (waveAllowed.includes(waveMetric)) api.overlays.waves.setMetric(waveMetric);
      if (gustAllowed.includes(gustMetric)) api.overlays.gust.setMetric(gustMetric);
    } catch {}
  }, [units]);

  return mapDivRef;
}

export default function App() {
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState("afternoon");
  const [lengthRange, setLengthRange] = useState("19-21");
  const [units, setUnits] = useState("imperial");
  const [selectedPoint, setSelectedPoint] = useState(MAP_START);
  const [weatherData, setWeatherData] = useState({
    status: "idle",
    message: "",
    windAvg: null,
    windDir: "—",
    gustAvg: null,
    waveAvg: null,
  });

  const mapKey = import.meta.env.VITE_WINDY_MAP_API_KEY;
  const mapDivRef = useWindyMap({
    mapKey,
    selectedPoint,
    timeBlock,
    tripDate,
    onPick: setSelectedPoint,
    onData: setWeatherData,
    units,
  });

  const boatLengthFt = LENGTH_RANGES.find((item) => item.value === lengthRange)?.boatLengthFt || 20;

  const interpreted = useMemo(() => {
    if (!Number.isFinite(weatherData.windAvg) || !Number.isFinite(weatherData.gustAvg) || !Number.isFinite(weatherData.waveAvg)) {
      return { score: "—", label: "—", reason: "Click a spot and wait for the forecast." };
    }

    const score = scoreFromForecast({
      windAvg: weatherData.windAvg,
      gustAvg: weatherData.gustAvg,
      waveAvg: weatherData.waveAvg,
      boatLengthFt,
    });

    return {
      score,
      label: labelFromScore(score),
      reason: genericInterpretation({ score, boatLengthFt }),
    };
  }, [weatherData, boatLengthFt]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{ borderRadius: 20, background: "#0f172a", color: "white", padding: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Boater's App</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Boating Meaning</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Click any spot on the map. Wind, gusts, and waves come directly from Windy’s map picker for that exact point.
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

            {weatherData.status === "loading" && <div style={{ marginTop: 14, background: "#f8fafc", borderRadius: 16, padding: 14 }}>Loading forecast...</div>}
            {weatherData.status === "error" && (
              <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", borderRadius: 16, padding: 14 }}>{weatherData.message}</div>
            )}
            {!mapKey && (
              <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", borderRadius: 16, padding: 14 }}>
                Missing VITE_WINDY_MAP_API_KEY
              </div>
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
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Windy data at this exact spot</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Wind</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {Number.isFinite(weatherData.windAvg) ? `${formatSpeedRange({ min: weatherData.windAvg, max: weatherData.windAvg }, units)} ${weatherData.windDir}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Gusts</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {Number.isFinite(weatherData.gustAvg) ? formatGust(weatherData.gustAvg, units) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Waves</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    {Number.isFinite(weatherData.waveAvg) ? formatWaves(weatherData.waveAvg, units) : "—"}
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
          </div>
        </div>
      </div>
    </div>
  );
}
