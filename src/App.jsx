import React, { useEffect, useMemo, useRef, useState } from "react";

const MAP_BOUNDS = {
  north: 42.69,
  south: 42.49,
  west: -80.54,
  east: -80.14,
};

const MAP_CENTER = { lat: 42.585, lon: -80.36 };

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

function classifySpot(lat, lon) {
  const westThird = MAP_BOUNDS.west + (MAP_BOUNDS.east - MAP_BOUNDS.west) * 0.33;
  const eastThird = MAP_BOUNDS.west + (MAP_BOUNDS.east - MAP_BOUNDS.west) * 0.66;
  if (lat > 42.61) return "More exposed water";
  if (lon <= westThird) return "West side";
  if (lon >= eastThird) return "East side";
  return "Central bay";
}

function reasonFromForecast({ spotName, windDir, waveAvg, gustAvg, boatLengthFt, score }) {
  const waveFt = mToFt(waveAvg || 0);
  const gustMph = Math.round(mpsToMph(gustAvg || 0));

  if (score >= 8) {
    return `${spotName} looks manageable for about a ${boatLengthFt} ft family boat. Wind is ${windDir} here and the forecasted waves remain relatively modest at this clicked point.`;
  }
  if (score >= 6) {
    return `${spotName} should still be usable, but expect some chop. ${windDir} wind with gusts near ${gustMph} mph may make the ride less comfortable.`;
  }
  if (score >= 4) {
    return `${spotName} is getting into caution territory. Forecast waves around ${waveFt.toFixed(1)} ft may feel uncomfortable for many family boats around ${boatLengthFt} ft.`;
  }
  return `${spotName} looks poor for a family boat around ${boatLengthFt} ft. This clicked spot is likely too rough or uncomfortable in this setup.`;
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

  return {
    windAvg,
    gustAvg,
    waveAvg,
    windDir: avgWindVector.direction,
    wind: formatWindRange(windSpeedRange),
    gusts: formatWindRange(gustRange),
    waves: formatWaveRange(waveRange),
  };
}

function latLonToMarkerStyle(lat, lon) {
  const leftPct = ((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100;
  const topPct = ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100;
  return {
    left: `${leftPct}%`,
    top: `${topPct}%`,
  };
}

export default function App() {
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState("afternoon");
  const [lengthRange, setLengthRange] = useState("19-21");
  const [selectedPoint, setSelectedPoint] = useState({ lat: 42.603, lon: -80.345 });
  const [pointData, setPointData] = useState({ status: "idle", message: "", forecast: null });
  const mapRef = useRef(null);

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
        if (!cancelled) {
          setPointData({ status: "ready", message: "", forecast });
        }
      } catch (error) {
        if (!cancelled) {
          setPointData({ status: "error", message: error.message || "Windy request failed.", forecast: null });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedPoint, tripDate, timeBlock]);

  const interpreted = useMemo(() => {
    if (!pointData.forecast) return null;
    const score = scoreFromForecast({
      windAvg: pointData.forecast.windAvg,
      gustAvg: pointData.forecast.gustAvg,
      waveAvg: pointData.forecast.waveAvg,
      boatLengthFt,
    });
    const spotName = classifySpot(selectedPoint.lat, selectedPoint.lon);
    return {
      score,
      label: labelFromScore(score),
      reason: reasonFromForecast({
        spotName,
        windDir: pointData.forecast.windDir,
        waveAvg: pointData.forecast.waveAvg,
        gustAvg: pointData.forecast.gustAvg,
        boatLengthFt,
        score,
      }),
      spotName,
    };
  }, [pointData.forecast, boatLengthFt, selectedPoint]);

  function handleMapClick(e) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const lon = MAP_BOUNDS.west + x * (MAP_BOUNDS.east - MAP_BOUNDS.west);
    const lat = MAP_BOUNDS.north - y * (MAP_BOUNDS.north - MAP_BOUNDS.south);

    setSelectedPoint({ lat, lon });
  }

  const markerStyle = latLonToMarkerStyle(selectedPoint.lat, selectedPoint.lon);

  const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${MAP_CENTER.lat},${MAP_CENTER.lon}&zoom=11&size=900x620&maptype=mapnik`;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16, fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 24 }}>
        <div style={{ borderRadius: 20, background: "#0f172a", color: "white", padding: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Click-a-spot interpreter</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Long Point Bay Boating Meaning</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>
            Click any spot on the map. The app reads Windy data for that exact point and translates it into simple boating meaning for your boat size.
          </p>
        </div>

        <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
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
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.35fr 0.95fr" }}>
          <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ marginBottom: 10, color: "#64748b", fontSize: 14 }}>Click any water spot in Long Point Bay.</div>
            <div
              ref={mapRef}
              onClick={handleMapClick}
              style={{
                position: "relative",
                height: 620,
                overflow: "hidden",
                borderRadius: 16,
                border: "1px solid #cbd5e1",
                cursor: "crosshair",
                background: "#e2e8f0",
              }}
            >
              <img src={mapUrl} alt="Long Point Bay map" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div
                style={{
                  position: "absolute",
                  transform: "translate(-50%, -100%)",
                  ...markerStyle,
                  pointerEvents: "none",
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 999, background: "#ef4444", border: "3px solid white", boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }} />
                <div style={{ width: 2, height: 18, background: "#ef4444", margin: "0 auto" }} />
              </div>
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>Selected spot</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{interpreted?.spotName || "Waiting for forecast"}</div>
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
                  <div style={{ marginTop: 4, fontWeight: 700 }}>{pointData.forecast ? `${pointData.forecast.wind} ${pointData.forecast.windDir}` : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Gusts</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>{pointData.forecast ? pointData.forecast.gusts : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b" }}>Waves</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>{pointData.forecast ? pointData.forecast.waves : "—"}</div>
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
