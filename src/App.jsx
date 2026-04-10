import React, { useEffect, useMemo, useState } from "react";

const LONG_POINT = { lat: 42.58, lon: -80.4 };
const TIME_WINDOWS = {
  morning: { startHour: 8, endHour: 11 },
  afternoon: { startHour: 12, endHour: 16 },
  evening: { startHour: 17, endHour: 20 },
};

const BOAT_TYPES = [
  "Bowrider","Deck Boat","Pontoon","Tri-toon","Center Console","Dual Console",
  "Cuddy Cabin","Cabin Cruiser","Walkaround","Fishing Boat","Aluminum Fishing Boat",
  "Bass Boat","Ski / Wake Boat","Jet Boat","Express Cruiser","Runabout","RIB / Inflatable",
];

const DIRECTIONS = ["N","NE","E","SE","S","SW","W","NW"];
const WIND_RANGES = ["Calm","1-5","6-10","11-15","16-20","21-25","26-30","30+"];
const WAVE_RANGES = ["Flat","Under 1 ft","1-2 ft","2-3 ft","3-4 ft","4-5 ft","5+ ft"];

const SCORE_GUIDE = {
  "1":"Strongly not recommended.","2":"Very rough.","3":"Poor ride comfort.","4":"Below average.",
  "5":"Borderline.","6":"Fair.","7":"Good.","8":"Very good.","9":"Excellent.","10":"Outstanding.",
};

const STARTER_BOATS = [
  { id: "1", lengthFt: 21, type: "Bowrider" },
  { id: "2", lengthFt: 24, type: "Pontoon" },
];

function useLocalState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

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
    arr.push(d.toISOString());
  }
  return arr;
}

function closestIndexes(hours, targets) {
  const ts = hours.map((h) => new Date(h).getTime());
  return targets.map((targetIso) => {
    const target = new Date(targetIso).getTime();
    let bestIdx = 0;
    let bestDiff = Infinity;
    ts.forEach((t, i) => {
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

function mpsToMph(v) { return Math.round(v * 2.23694); }
function metersToFeet(v) { return v * 3.28084; }

function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

function boatLabel(boat) {
  if (!boat) return "Unknown boat";
  return `${boat.lengthFt} ft ${boat.type}`;
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
  const [screen, setScreen] = useLocalState("lp-screen", "home");
  const [date, setDate] = useLocalState("lp-date", todayStr());
  const [block, setBlock] = useLocalState("lp-block", "afternoon");
  const [area, setArea] = useLocalState("lp-area", "outer");
  const [selectedBoatId, setSelectedBoatId] = useLocalState("lp-boat-id", "1");
  const [boats, setBoats] = useLocalState("lp-boats", STARTER_BOATS);
  const [pending, setPending] = useLocalState("lp-pending", []);
  const [doneTrips, setDoneTrips] = useLocalState("lp-doneTrips", []);

  const [tripScore, setTripScore] = useState("6");
  const [tripWave, setTripWave] = useState("2-3 ft");
  const [tripWind, setTripWind] = useState("16-20");
  const [tripDir, setTripDir] = useState("SW");
  const [note, setNote] = useState("");

  const [boatLength, setBoatLength] = useState("22");
  const [boatType, setBoatType] = useState("Bowrider");
  const [editingBoatId, setEditingBoatId] = useState("");

  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const selectedBoat = boats.find((b) => b.id === selectedBoatId) || boats[0] || null;

  useEffect(() => {
    if (!selectedBoatId && boats.length) setSelectedBoatId(boats[0].id);
  }, [boats, selectedBoatId, setSelectedBoatId]);

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

    fetch("https://api.windy.com/api/point-forecast/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-windy-api-key": key },
      body: JSON.stringify({
        lat: LONG_POINT.lat,
        lon: LONG_POINT.lon,
        model: "gfs",
        parameters: ["wind", "windGust", "waves", "wavesHeight", "windDir"],
        levels: ["surface"],
        key,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Windy request failed: ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        const hours = payload.ts || payload.hours || [];
        const idxs = closestIndexes(hours, targets);
        const windU = payload["wind_u-surface"] || payload.wind_u || [];
        const windV = payload["wind_v-surface"] || payload.wind_v || [];
        const gust = payload["gust-surface"] || payload["windGust-surface"] || payload.gust || [];
        const windDir = payload["windDir-surface"] || payload.windDir || [];
        const waves = payload["waves_height-surface"] || payload["wavesHeight-surface"] || payload.wavesHeight || payload.waves_height || [];

        const windSpeeds = idxs.map((i) => {
          const u = windU[i];
          const v = windV[i];
          return typeof u === "number" && typeof v === "number" ? Math.sqrt(u * u + v * v) : null;
        });

        setForecast({
          windAvg: avg(windSpeeds),
          gustAvg: avg(idxs.map((i) => gust[i])),
          dirAvg: avg(idxs.map((i) => windDir[i])),
          waveAvg: avg(idxs.map((i) => waves[i])),
        });
      })
      .catch((e) => {
        setErr(e.message || "Failed to load forecast");
        setForecast(null);
      })
      .finally(() => setLoading(false));
  }, [date, block]);

  const predictedScore = useMemo(() => {
    const boatLengthFt = Number(selectedBoat?.lengthFt || 21);
    const waveFt = forecast?.waveAvg != null ? metersToFeet(forecast.waveAvg) : 0;
    let score = area === "inner" ? 8 : area === "mixed" ? 6 : 5;

    if (waveFt > 1) score -= 1;
    if (waveFt > 2) score -= 1;
    if (waveFt > 3) score -= 1;
    if (waveFt > 4) score -= 1;

    if (boatLengthFt >= 22) score += 1;
    if (boatLengthFt >= 25) score += 1;

    return Math.max(1, Math.min(10, score));
  }, [forecast, area, selectedBoat]);

  const personalScore = useMemo(() => {
    if (!doneTrips.length) return 6;
    const average = doneTrips.reduce((sum, t) => sum + Number(t.score), 0) / doneTrips.length;
    return Math.round(average * 10) / 10;
  }, [doneTrips]);

  function resetBoatForm() {
    setBoatLength("22");
    setBoatType("Bowrider");
    setEditingBoatId("");
  }

  function saveBoat() {
    const lengthFt = Number(boatLength);
    if (!lengthFt || lengthFt < 15 || lengthFt > 30) return;

    if (editingBoatId) {
      setBoats(boats.map((b) => (b.id === editingBoatId ? { ...b, lengthFt, type: boatType } : b)));
      resetBoatForm();
      return;
    }

    const newBoat = { id: String(Date.now()), lengthFt, type: boatType };
    setBoats([newBoat, ...boats]);
    setSelectedBoatId(newBoat.id);
    resetBoatForm();
  }

  function startEditBoat(id) {
    const boat = boats.find((b) => b.id === id);
    if (!boat) return;
    setBoatLength(String(boat.lengthFt));
    setBoatType(boat.type);
    setEditingBoatId(id);
    setScreen("boats");
  }

  function deleteBoat(id) {
    if (boats.length <= 1) return;
    const next = boats.filter((b) => b.id !== id);
    setBoats(next);
    if (selectedBoatId === id && next.length) setSelectedBoatId(next[0].id);
    setPending(pending.filter((t) => t.boatId !== id));
    setDoneTrips(doneTrips.filter((t) => t.boatId !== id));
    if (editingBoatId === id) resetBoatForm();
  }

  function saveTrip() {
    if (!selectedBoat) return;
    setPending([{ id: String(Date.now()), date, block, area, boatId: selectedBoat.id, predicted: predictedScore }, ...pending]);
  }

  function completeTrip(id) {
    const trip = pending.find((t) => t.id === id);
    if (!trip) return;
    setDoneTrips([{ ...trip, score: tripScore, wave: tripWave, wind: tripWind, dir: tripDir, note }, ...doneTrips]);
    setPending(pending.filter((t) => t.id !== id));
    setNote("");
  }

  function cancelTrip(id) {
    setPending(pending.filter((t) => t.id !== id));
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#cbd5e1" }}>Live app</div>
          <h1 style={{ margin: "8px 0 0 0" }}>Long Point Bay Boating Score</h1>
          <p style={{ margin: "10px 0 0 0", color: "#cbd5e1" }}>Boats can now be edited and deleted, and longer boats score better instead of worse.</p>
        </div>

        <div style={{ ...styles.card, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {["home", "boats", "trips"].map((name) => (
            <button key={name} onClick={() => setScreen(name)} style={screen === name ? styles.primary : styles.secondary}>
              {name === "trips" ? "Trips" : name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>

        {screen === "home" && (
          <>
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Plan your boating window</h2>

              <label style={styles.label}>Date</label>
              <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div>
                  <label style={styles.label}>Area</label>
                  <select style={styles.select} value={area} onChange={(e) => setArea(e.target.value)}>
                    <option value="inner">Inner Bay</option>
                    <option value="outer">Outer Bay</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Boat</label>
                  <select style={styles.select} value={selectedBoatId} onChange={(e) => setSelectedBoatId(e.target.value)}>
                    {boats.map((b) => <option key={b.id} value={b.id}>{boatLabel(b)}</option>)}
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
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{forecast ? `${mpsToMph(forecast.windAvg || 0)} mph ${degToCompass(forecast.dirAvg)}` : "—"}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
                  <div style={{ color: "#64748b", fontSize: 14 }}>Gusts</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{forecast ? `${mpsToMph(forecast.gustAvg || 0)} mph` : "—"}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12 }}>
                  <div style={{ color: "#64748b", fontSize: 14 }}>Waves</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{forecast?.waveAvg != null ? `${metersToFeet(forecast.waveAvg).toFixed(1)} ft` : "—"}</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Scores</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 30, fontWeight: 700 }}>{predictedScore}</div><div>Predicted</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 30, fontWeight: 700 }}>{personalScore}</div><div>Your Score</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 30, fontWeight: 700 }}>{area === "inner" ? 8 : area === "mixed" ? 6 : 5}</div><div>All Users</div></div>
              </div>
              <div style={{ marginTop: 12, background: "#f8fafc", padding: 12, borderRadius: 12 }}>
                <strong>Boat effect:</strong> longer boats now raise the score slightly instead of lowering it.
              </div>
            </div>

            <div style={styles.card}>
              <button style={{ ...styles.primary, width: "100%" }} onClick={saveTrip}>Save this forecast as a trip</button>
            </div>
          </>
        )}

        {screen === "boats" && (
          <>
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Your boats</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {boats.map((b) => (
                  <div key={b.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{boatLabel(b)}</div>
                    <div style={{ color: "#64748b", marginTop: 4 }}>Type: {b.type}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                      <button style={selectedBoatId === b.id ? styles.primary : styles.secondary} onClick={() => setSelectedBoatId(b.id)}>
                        {selectedBoatId === b.id ? "Selected" : "Use"}
                      </button>
                      <button style={styles.secondary} onClick={() => startEditBoat(b.id)}>Edit</button>
                      <button style={styles.secondary} onClick={() => deleteBoat(b.id)} disabled={boats.length <= 1}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>{editingBoatId ? "Edit boat" : "Add a boat"}</h2>
              <label style={styles.label}>Boat length in feet</label>
              <input style={styles.input} value={boatLength} onChange={(e) => setBoatLength(e.target.value)} />
              <div style={{ marginTop: 12 }}>
                <label style={styles.label}>Boat type</label>
                <select style={styles.select} value={boatType} onChange={(e) => setBoatType(e.target.value)}>
                  {BOAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <button style={styles.primary} onClick={saveBoat}>{editingBoatId ? "Save changes" : "Save boat"}</button>
                <button style={styles.secondary} onClick={resetBoatForm}>Clear</button>
              </div>
            </div>
          </>
        )}

        {screen === "trips" && (
          <>
            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Pending trips</h2>
              {!pending.length && <div>No pending trips.</div>}
              <div style={{ display: "grid", gap: 10 }}>
                {pending.map((trip) => {
                  const boat = boats.find((b) => b.id === trip.boatId);
                  return (
                    <div key={trip.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{trip.date} · {trip.block} · {trip.area}</div>
                      <div style={{ color: "#64748b", marginTop: 4 }}>{boatLabel(boat)} · predicted {trip.predicted}/10</div>
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <select style={styles.select} value={tripWind} onChange={(e) => setTripWind(e.target.value)}>
                            {WIND_RANGES.map((r) => <option key={r}>{r}</option>)}
                          </select>
                          <select style={styles.select} value={tripDir} onChange={(e) => setTripDir(e.target.value)}>
                            {DIRECTIONS.map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </div>
                        <select style={styles.select} value={tripWave} onChange={(e) => setTripWave(e.target.value)}>
                          {WAVE_RANGES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <select style={styles.select} value={tripScore} onChange={(e) => setTripScore(e.target.value)}>
                          {Object.keys(SCORE_GUIDE).map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <div style={{ color: "#64748b" }}>{tripScore}/10 — {SCORE_GUIDE[tripScore]}</div>
                        <textarea style={{ ...styles.input, minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <button style={styles.primary} onClick={() => completeTrip(trip.id)}>Submit results</button>
                          <button style={styles.secondary} onClick={() => cancelTrip(trip.id)}>Cancel trip</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={{ marginTop: 0 }}>Completed trips</h2>
              {!doneTrips.length && <div>No completed trips.</div>}
              <div style={{ display: "grid", gap: 10 }}>
                {doneTrips.map((trip) => {
                  const boat = boats.find((b) => b.id === trip.boatId);
                  return (
                    <div key={trip.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{trip.date} · {trip.block} · {trip.score}/10</div>
                      <div style={{ color: "#64748b", marginTop: 4 }}>{trip.area} · {boatLabel(boat)}</div>
                      <div style={{ color: "#64748b", marginTop: 4 }}>{trip.wind} {trip.dir} · {trip.wave}</div>
                      {trip.note && <div style={{ marginTop: 6 }}>“{trip.note}”</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
