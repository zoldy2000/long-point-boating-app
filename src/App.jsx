import React, { useEffect, useMemo, useState } from 'react';

const FORECAST_TEMPLATES = {
  morning: [
    { name: 'The Weather Network', wind: '10-14 mph', direction: 'SW', gusts: '18 mph', waves: '1-2 ft', isDemo: true },
    { name: 'Windfinder', wind: '9-13 mph', direction: 'SW', gusts: '17 mph', waves: '1-2 ft', isDemo: true },
    { name: 'PredictWind', wind: '10-13 mph', direction: 'SW', gusts: '16 mph', waves: '1-2 ft', isDemo: true }
  ],
  afternoon: [
    { name: 'The Weather Network', wind: '15-20 mph', direction: 'SW', gusts: '24 mph', waves: '1-2 ft', isDemo: true },
    { name: 'Windfinder', wind: '14-18 mph', direction: 'SW', gusts: '22 mph', waves: '2-3 ft', isDemo: true },
    { name: 'PredictWind', wind: '13-17 mph', direction: 'SW', gusts: '21 mph', waves: '1-2 ft', isDemo: true }
  ],
  evening: [
    { name: 'The Weather Network', wind: '9-13 mph', direction: 'W', gusts: '16 mph', waves: '1 ft', isDemo: true },
    { name: 'Windfinder', wind: '8-12 mph', direction: 'W', gusts: '15 mph', waves: '1-2 ft', isDemo: true },
    { name: 'PredictWind', wind: '8-11 mph', direction: 'W', gusts: '14 mph', waves: '1 ft', isDemo: true }
  ]
};

const AREA_COORDS = {
  inner: { lat: 42.586, lon: -80.424, label: 'Inner Bay' },
  outer: { lat: 42.629, lon: -80.318, label: 'Outer Bay' },
  mixed: { lat: 42.607, lon: -80.371, label: 'Mixed' }
};

const BOAT_TYPES = [
  'Bowrider', 'Deck Boat', 'Pontoon', 'Tri-toon', 'Center Console', 'Dual Console',
  'Cuddy Cabin', 'Cabin Cruiser', 'Walkaround', 'Fishing Boat', 'Aluminum Fishing Boat',
  'Bass Boat', 'Ski / Wake Boat', 'Jet Boat', 'Express Cruiser', 'Runabout', 'RIB / Inflatable'
];

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const WIND_RANGES = ['Calm', '1-5', '6-10', '11-15', '16-20', '21-25', '26-30', '30+'];
const WAVE_RANGES = ['Flat', 'Under 1 ft', '1-2 ft', '2-3 ft', '3-4 ft', '4-5 ft', '5+ ft'];

const SCORE_GUIDE = [
  { score: '1', text: 'Strongly not recommended. Very uncomfortable for most family boats.' },
  { score: '2', text: 'Very rough. Most typical family boaters would avoid it.' },
  { score: '3', text: 'Poor ride comfort. Only some experienced boaters may tolerate it.' },
  { score: '4', text: 'Below average. Not a comfortable family outing.' },
  { score: '5', text: 'Borderline. You may still go, but expect chop and caution.' },
  { score: '6', text: 'Fair. Acceptable for many, though not especially smooth.' },
  { score: '7', text: 'Good. Comfortable enough for many family boats.' },
  { score: '8', text: 'Very good. Pleasant conditions for a typical outing.' },
  { score: '9', text: 'Excellent. Smooth and highly recommended.' },
  { score: '10', text: 'Outstanding. About as good as most boaters could hope for.' }
];

const DEFAULT_BOATS = [
  { id: '1', lengthFt: 21, type: 'Bowrider' },
  { id: '2', lengthFt: 24, type: 'Pontoon' }
];

const DEFAULT_PENDING = [
  {
    id: 'p1',
    date: '2026-03-29',
    block: 'Afternoon',
    area: 'Outer Bay',
    boatId: '1',
    predictedScore: 5,
    forecastSnapshot: FORECAST_TEMPLATES.afternoon
  }
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
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore localStorage write issues
    }
  }, [key, value]);

  return [value, setValue];
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ftToM(ft) {
  return Math.round(ft * 0.3048 * 10) / 10;
}

function mToFt(m) {
  return m * 3.28084;
}

function mpsToMph(v) {
  return v * 2.23694;
}

function mpsToKmh(v) {
  return v * 3.6;
}

function boatLabel(boat, units) {
  if (!boat) return 'Unknown boat';
  const length = units === 'metric' ? `${ftToM(Number(boat.lengthFt))} m` : `${boat.lengthFt} ft`;
  return `${length} ${boat.type}`;
}

function titleCase(v) {
  return `${v.charAt(0).toUpperCase()}${v.slice(1)}`;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function windowHours(block) {
  if (block === 'morning') return [8, 11];
  if (block === 'afternoon') return [12, 16];
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

function degToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function windFromUv(u, v) {
  const speed = Math.sqrt((u ** 2) + (v ** 2));
  const deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  return { speed, direction: degToCompass(deg) };
}

function formatWind(speedMps, units) {
  const value = units === 'metric' ? mpsToKmh(speedMps) : mpsToMph(speedMps);
  const suffix = units === 'metric' ? 'km/h' : 'mph';
  return `${Math.round(value)} ${suffix}`;
}

function formatWindRange(range, units) {
  if (!range) return '—';
  const min = units === 'metric' ? mpsToKmh(range.min) : mpsToMph(range.min);
  const max = units === 'metric' ? mpsToKmh(range.max) : mpsToMph(range.max);
  const suffix = units === 'metric' ? 'km/h' : 'mph';
  return `${Math.round(min)}-${Math.round(max)} ${suffix}`;
}

function formatWaveRange(range, units) {
  if (!range) return '—';
  const min = units === 'metric' ? range.min : mToFt(range.min);
  const max = units === 'metric' ? range.max : mToFt(range.max);
  const suffix = units === 'metric' ? 'm' : 'ft';
  if (Math.abs(min - max) < 0.15) return `${min.toFixed(1)} ${suffix}`;
  return `${min.toFixed(1)}-${max.toFixed(1)} ${suffix}`;
}

function forecastScoreFromLive({ windAvg, gustAvg, waveAvg, area, boatLengthFt }) {
  let score = 10;
  const windMph = mpsToMph(windAvg || 0);
  const gustMph = mpsToMph(gustAvg || 0);
  const waveFt = mToFt(waveAvg || 0);

  score -= Math.max(0, (windMph - 10) / 4);
  score -= Math.max(0, (gustMph - 16) / 5);
  score -= Math.max(0, (waveFt - 1) * 1.5);

  if (area === 'outer') score -= 1;
  if (area === 'mixed') score -= 0.5;
  if (boatLengthFt <= 18) score -= 1;
  else if (boatLengthFt <= 20) score -= 0.5;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function labelFromScore(score) {
  if (score >= 9) return 'Excellent ride comfort for many family boats';
  if (score >= 7) return 'Good day for many family boats';
  if (score >= 5) return 'Usable, but expect some chop';
  if (score >= 3) return 'Use caution for typical family boats';
  return 'Poor ride comfort for many family boats';
}

function cautionFromScore(score, area) {
  if (score >= 7) return `${AREA_COORDS[area].label} looks manageable in this time window.`;
  if (score >= 5) return `${AREA_COORDS[area].label} may still be usable, but expect a rougher ride.`;
  return `${AREA_COORDS[area].label} may be uncomfortable for many family boats in this time window.`;
}

function ScoreRing({ value, label }) {
  const pct = Math.max(0, Math.min(100, value * 10));
  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ background: `conic-gradient(#0f172a ${pct}%, #e2e8f0 ${pct}% 100%)` }}>
        <div className="score-ring-inner">
          <div className="score-value">{value}</div>
          <div className="score-denom">/10</div>
        </div>
      </div>
      <div className="score-label">{label}</div>
    </div>
  );
}

function Card({ title, subtitle, children, action }) {
  return (
    <section className="card">
      {(title || subtitle || action) && (
        <div className="card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function App() {
  const [screen, setScreen] = useLocalState('lp-app-screen', 'home');
  const [area, setArea] = useLocalState('lp-app-area', 'outer');
  const [timeBlock, setTimeBlock] = useLocalState('lp-app-time-block', 'afternoon');
  const [boatId, setBoatId] = useLocalState('lp-app-boat-id', '1');
  const [communityMode, setCommunityMode] = useLocalState('lp-app-community-mode', 'similar');
  const [units, setUnits] = useLocalState('lp-app-units', 'imperial');
  const [boats, setBoats] = useLocalState('lp-app-boats', DEFAULT_BOATS);
  const [pendingTrips, setPendingTrips] = useLocalState('lp-app-pending-trips', DEFAULT_PENDING);
  const [completedTrips, setCompletedTrips] = useLocalState('lp-app-completed-trips', []);
  const [selectedPendingId, setSelectedPendingId] = useLocalState('lp-app-selected-pending', 'p1');
  const [tripDate, setTripDate] = useLocalState('lp-app-trip-date', todayString());
  const [email, setEmail] = useLocalState('lp-app-email', '');
  const [isLoggedIn, setIsLoggedIn] = useLocalState('lp-app-logged-in', false);

  const [password, setPassword] = useState('');
  const [newBoatLengthFt, setNewBoatLengthFt] = useState('22');
  const [newBoatType, setNewBoatType] = useState('Bowrider');
  const [actualWindRange, setActualWindRange] = useState('16-20');
  const [actualDirection, setActualDirection] = useState('SW');
  const [actualWaveRange, setActualWaveRange] = useState('2-3 ft');
  const [actualScore, setActualScore] = useState('6');
  const [tripNote, setTripNote] = useState('Forecast was close, but rougher near the bay mouth.');
  const [windyData, setWindyData] = useState({ status: 'idle', card: null, summary: null, message: '' });

  const activeBoat = boats.find((b) => b.id === boatId) || boats[0];
  const selectedPending = pendingTrips.find((t) => t.id === selectedPendingId) || pendingTrips[0];

  const personalAverage = useMemo(() => {
    if (!completedTrips.length) return null;
    const avgScore = completedTrips.reduce((sum, t) => sum + Number(t.actualScore || 0), 0) / completedTrips.length;
    return Math.round(avgScore * 10) / 10;
  }, [completedTrips]);

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setWindyData({ status: 'missing-key', card: null, summary: null, message: 'Windy key not found in app environment.' });
      return;
    }

    const coords = AREA_COORDS[area];
    const [startHour, endHour] = windowHours(timeBlock);

    async function fetchWindy() {
      setWindyData((prev) => ({ ...prev, status: 'loading', message: '' }));
      try {
        const windBody = {
          lat: coords.lat,
          lon: coords.lon,
          model: 'gfs',
          parameters: ['wind', 'windGust'],
          levels: ['surface'],
          key
        };

        const wavesBody = {
          lat: coords.lat,
          lon: coords.lon,
          model: 'gfsWave',
          parameters: ['waves'],
          levels: ['surface'],
          key
        };

        const [windResp, waveResp] = await Promise.all([
          fetch('https://api.windy.com/api/point-forecast/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(windBody)
          }),
          fetch('https://api.windy.com/api/point-forecast/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wavesBody)
          })
        ]);

        if (!windResp.ok) throw new Error(`Windy wind request failed: ${windResp.status}`);
        if (!waveResp.ok) throw new Error(`Windy wave request failed: ${waveResp.status}`);

        const windJson = await windResp.json();
        const waveJson = await waveResp.json();

        const ts = windJson.ts || [];
        const u = windJson['wind_u-surface'] || [];
        const v = windJson['wind_v-surface'] || [];
        const gust = windJson['gust-surface'] || [];
        const waveHeight = waveJson['waves_height-surface'] || [];

        const indexes = ts
          .map((stamp, idx) => ({ idx, date: new Date(stamp) }))
          .filter(({ date }) => toYmd(date) === tripDate && date.getHours() >= startHour && date.getHours() <= endHour)
          .map(({ idx }) => idx);

        if (!indexes.length) {
          throw new Error('No Windy forecast points returned for that date and time window.');
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
          boatLengthFt: Number(activeBoat?.lengthFt || 21)
        });

        const card = {
          name: 'Windy',
          wind: formatWindRange(windSpeedRange, units),
          direction: avgWindVector.direction,
          gusts: formatWindRange(gustRange, units),
          waves: formatWaveRange(waveRange, units),
          isLive: true,
          updatedAt: new Date().toLocaleString()
        };

        const summary = {
          predicted: liveScore,
          label: labelFromScore(liveScore),
          caution: cautionFromScore(liveScore, area),
          confidence: 74
        };

        if (!cancelled) {
          setWindyData({ status: 'ready', card, summary, message: '' });
        }
      } catch (error) {
        if (!cancelled) {
          setWindyData({ status: 'error', card: null, summary: null, message: error.message || 'Windy request failed.' });
        }
      }
    }

    fetchWindy();
    return () => { cancelled = true; };
  }, [area, timeBlock, tripDate, units, activeBoat]);

  const forecastSources = useMemo(() => {
    const demoSources = FORECAST_TEMPLATES[timeBlock] || FORECAST_TEMPLATES.afternoon;
    return windyData.card ? [windyData.card, ...demoSources] : demoSources;
  }, [timeBlock, windyData.card]);

  const recommendation = useMemo(() => {
    const boatLength = Number(activeBoat?.lengthFt || 21);
    const smallBoatPenalty = boatLength <= 18 ? 1 : boatLength <= 20 ? 0.5 : 0;
    const livePredicted = windyData.summary?.predicted;

    if (livePredicted) {
      return {
        predicted: livePredicted,
        personal: personalAverage || Math.max(1, Math.min(10, livePredicted + 1)),
        allUsers: communityMode === 'similar' ? livePredicted : Math.min(10, livePredicted + 1),
        label: windyData.summary.label,
        caution: windyData.summary.caution,
        confidence: windyData.summary.confidence
      };
    }

    if (area === 'inner') {
      return {
        predicted: Math.max(1, Math.round(8 - smallBoatPenalty)),
        personal: personalAverage || 7,
        allUsers: 8,
        label: 'Good day for many family boats',
        caution: 'Inner Bay looks more comfortable than Outer Bay for this time window.',
        confidence: 78
      };
    }

    if (area === 'mixed') {
      return {
        predicted: Math.max(1, Math.round(6 - smallBoatPenalty)),
        personal: personalAverage || 6,
        allUsers: 6,
        label: 'Usable, but expect rougher stretches',
        caution: 'Mixed routes can change quickly as you move toward the bay mouth.',
        confidence: 69
      };
    }

    return {
      predicted: Math.max(1, Math.round(5 - smallBoatPenalty)),
      personal: personalAverage || 6,
      allUsers: communityMode === 'similar' ? 5 : 6,
      label: 'Use caution for typical family boats',
      caution: 'Southwest wind may create uncomfortable chop in Outer Bay.',
      confidence: 72
    };
  }, [activeBoat, area, communityMode, personalAverage, windyData.summary]);

  function addBoat() {
    const lengthFt = Number(newBoatLengthFt);
    if (!lengthFt || lengthFt < 15 || lengthFt > 30) return;
    const newBoat = { id: String(Date.now()), lengthFt, type: newBoatType };
    setBoats((prev) => [newBoat, ...prev]);
    setBoatId(newBoat.id);
    setNewBoatLengthFt('22');
    setNewBoatType('Bowrider');
  }

  function saveTrip() {
    const newTrip = {
      id: String(Date.now()),
      date: tripDate,
      block: titleCase(timeBlock),
      area: area === 'outer' ? 'Outer Bay' : area === 'inner' ? 'Inner Bay' : 'Mixed',
      boatId,
      predictedScore: recommendation.predicted,
      forecastSnapshot: forecastSources
    };
    setPendingTrips((prev) => [newTrip, ...prev]);
    setSelectedPendingId(newTrip.id);
    setScreen('trips');
  }

  function submitResults() {
    if (!selectedPending) return;
    const completed = {
      ...selectedPending,
      actualWindRange,
      actualDirection,
      actualWaveRange,
      actualScore: Number(actualScore),
      tripNote,
      completedAt: new Date().toISOString()
    };
    setCompletedTrips((prev) => [completed, ...prev]);
    setPendingTrips((prev) => prev.filter((t) => t.id !== selectedPending.id));
    setSelectedPendingId('');
    setTripNote('Forecast was close, but rougher near the bay mouth.');
    setActualWindRange('16-20');
    setActualDirection('SW');
    setActualWaveRange('2-3 ft');
    setActualScore('6');
  }

  function cancelTrip() {
    if (!selectedPending) return;
    setPendingTrips((prev) => prev.filter((t) => t.id !== selectedPending.id));
    setSelectedPendingId('');
  }

  function logIn() {
    if (!email.trim()) return;
    setIsLoggedIn(true);
    setPassword('');
    setScreen('home');
  }

  function logOut() {
    setIsLoggedIn(false);
    setPassword('');
  }

  return (
    <div className="app-shell">
      <div className="hero">
        <div>
          <div className="eyebrow">Working web app package</div>
          <h1>Long Point Bay Boating Score</h1>
          <p>Phone-friendly boating conditions app for Long Point Bay family boats.</p>
        </div>
        <div className="hero-boat">⛵</div>
      </div>

      <nav className="top-nav">
        <button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>Home</button>
        <button className={screen === 'trips' ? 'active' : ''} onClick={() => setScreen('trips')}>Trips</button>
        <button className={screen === 'boats' ? 'active' : ''} onClick={() => setScreen('boats')}>Boats</button>
        <button className={screen === 'account' ? 'active' : ''} onClick={() => setScreen('account')}>Account</button>
      </nav>

      {screen === 'home' && (
        <>
          <Card title="Plan your boating window" subtitle="Choose date, area, boat, and time window.">
            <div className="stack">
              <div>
                <label>Date</label>
                <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} />
              </div>

              <div className="grid-2">
                <div>
                  <label>Area</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)}>
                    <option value="inner">Inner Bay</option>
                    <option value="outer">Outer Bay</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label>Boat</label>
                  <select value={boatId} onChange={(e) => setBoatId(e.target.value)}>
                    {boats.map((b) => <option key={b.id} value={b.id}>{boatLabel(b, units)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label>Time window</label>
                <div className="pill-row">
                  {['morning', 'afternoon', 'evening'].map((block) => (
                    <button key={block} className={timeBlock === block ? 'pill active' : 'pill'} onClick={() => setTimeBlock(block)}>
                      {titleCase(block)}
                    </button>
                  ))}
                </div>
                <div className="tiny-note">
                  {timeBlock === 'morning' && '8 AM to 11 AM'}
                  {timeBlock === 'afternoon' && '12 PM to 4 PM'}
                  {timeBlock === 'evening' && '5 PM to 8 PM'}
                </div>
              </div>
            </div>
          </Card>

          <Card title="App recommendation" subtitle="Predicted score plus personal and shared views.">
            <div className="score-grid">
              <ScoreRing value={recommendation.predicted} label="Predicted" />
              <ScoreRing value={Number(recommendation.personal)} label="Your Score" />
              <ScoreRing value={recommendation.allUsers} label="All Users" />
            </div>

            <div className="info-box">
              <strong>{recommendation.label}</strong>
              <div>{recommendation.caution}</div>
            </div>

            <div className="filter-box">
              <div>
                <strong>Shared score filter</strong>
                <div className="muted small">Switch between similar-length boats and all boats.</div>
              </div>
              <div className="inline-actions">
                <button className={communityMode === 'similar' ? 'small-btn active' : 'small-btn'} onClick={() => setCommunityMode('similar')}>Similar</button>
                <button className={communityMode === 'all' ? 'small-btn active' : 'small-btn'} onClick={() => setCommunityMode('all')}>All</button>
              </div>
            </div>
          </Card>

          <Card title="Forecast by source" subtitle="Windy is live now. The other sources are still demo placeholders until they are connected.">
            <div className="stack">
              {windyData.status === 'loading' ? <div className="info-box">Loading live Windy forecast…</div> : null}
              {windyData.status === 'error' ? <div className="info-box">Windy error: {windyData.message}</div> : null}
              {windyData.status === 'missing-key' ? <div className="info-box">{windyData.message}</div> : null}
              {forecastSources.map((source) => (
                <div className="forecast-card" key={source.name}>
                  <div className="forecast-head">
                    <strong>{source.name}</strong>
                    <div className="inline-actions">
                      {source.isLive ? <span className="badge">live</span> : null}
                      {source.isDemo ? <span className="badge">demo</span> : null}
                      <span className="badge">{timeBlock}</span>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="metric-box">
                      <div className="metric-label">Wind</div>
                      <div className="metric-value">{source.wind} {source.direction}</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-label">Gusts</div>
                      <div className="metric-value">{source.gusts}</div>
                    </div>
                    <div className="metric-box full">
                      <div className="metric-label">Waves</div>
                      <div className="metric-value">{source.waves}</div>
                    </div>
                    {source.updatedAt ? (
                      <div className="tiny-note full">Updated: {source.updatedAt}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Why this score">
            <div className="stack">
              <div className="info-box">
                <strong>Boat in use</strong>
                <div>{boatLabel(activeBoat, units)}</div>
              </div>
              <div className="info-box">
                <strong>Main factor</strong>
                <div>Outer Bay and Mixed routes react more sharply to southwest wind and chop for family boats.</div>
              </div>
              <div className="info-box">
                <strong>Forecast confidence</strong>
                <div className="progress-row">
                  <span>{recommendation.confidence}%</span>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${recommendation.confidence}%` }} /></div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid-2 action-grid">
            <button className="primary-btn" onClick={saveTrip}>Save as Trip</button>
            <button className="secondary-btn" onClick={() => setScreen('trips')}>Pending Trips</button>
          </div>
        </>
      )}

      {screen === 'trips' && (
        <>
          <Card title="Pending trips" subtitle="Complete actual results later or cancel trips not taken.">
            {pendingTrips.length === 0 ? (
              <div className="empty-box">No pending trips right now.</div>
            ) : (
              <div className="stack">
                {pendingTrips.map((trip) => {
                  const tripBoat = boats.find((b) => b.id === trip.boatId);
                  return (
                    <button
                      key={trip.id}
                      className={selectedPendingId === trip.id ? 'trip-item active' : 'trip-item'}
                      onClick={() => setSelectedPendingId(trip.id)}
                    >
                      <div className="trip-line-1">{trip.date} · {trip.block}</div>
                      <div className="trip-line-2">{trip.area} · {boatLabel(tripBoat, units)}</div>
                      <div className="trip-line-3">Predicted at save time: {trip.predictedScore}/10</div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {selectedPending && (
            <Card title="Log actual trip results" subtitle={`${selectedPending.date} · ${selectedPending.block} · ${selectedPending.area}`}>
              <div className="stack">
                <div className="info-box">Forecast snapshot saved with this trip: <strong>{selectedPending.predictedScore}/10 predicted</strong></div>
                <div className="grid-2">
                  <div>
                    <label>Actual wind</label>
                    <select value={actualWindRange} onChange={(e) => setActualWindRange(e.target.value)}>
                      {WIND_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Direction</label>
                    <select value={actualDirection} onChange={(e) => setActualDirection(e.target.value)}>
                      {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label>Actual wave range</label>
                  <select value={actualWaveRange} onChange={(e) => setActualWaveRange(e.target.value)}>
                    {WAVE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label>Ride comfort score</label>
                  <select value={actualScore} onChange={(e) => setActualScore(e.target.value)}>
                    {SCORE_GUIDE.map((item) => <option key={item.score} value={item.score}>{item.score}</option>)}
                  </select>
                  <div className="tiny-note">{actualScore}/10: {SCORE_GUIDE.find((s) => s.score === actualScore)?.text}</div>
                </div>
                <div>
                  <label>Short note</label>
                  <textarea value={tripNote} onChange={(e) => setTripNote(e.target.value)} rows={4} />
                </div>
                <div className="grid-2 action-grid">
                  <button className="primary-btn" onClick={submitResults}>Submit Results</button>
                  <button className="secondary-btn" onClick={cancelTrip}>Cancel Trip</button>
                </div>
              </div>
            </Card>
          )}

          <Card title="Completed trips" subtitle="Stored in your browser for this version.">
            {completedTrips.length === 0 ? (
              <div className="empty-box">No completed trips yet.</div>
            ) : (
              <div className="stack">
                {completedTrips.map((trip) => {
                  const tripBoat = boats.find((b) => b.id === trip.boatId);
                  return (
                    <div className="completed-item" key={`${trip.id}-${trip.completedAt}`}>
                      <div className="trip-line-1">{trip.date} · {trip.block} · {trip.actualScore}/10</div>
                      <div className="trip-line-2">{trip.area} · {boatLabel(tripBoat, units)}</div>
                      <div className="trip-line-3">Actual: {trip.actualWindRange} {trip.actualDirection} · {trip.actualWaveRange}</div>
                      {trip.tripNote ? <div className="trip-note">“{trip.tripNote}”</div> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {screen === 'boats' && (
        <>
          <Card title="Your boats" subtitle="Save boats to your profile and choose one for each trip.">
            <div className="stack">
              {boats.map((b) => (
                <div key={b.id} className={boatId === b.id ? 'boat-item active' : 'boat-item'}>
                  <div>
                    <div className="trip-line-1">{boatLabel(b, units)}</div>
                    <div className="trip-line-2">Type: {b.type}</div>
                  </div>
                  <button className={boatId === b.id ? 'small-btn active' : 'small-btn'} onClick={() => setBoatId(b.id)}>
                    {boatId === b.id ? 'Selected' : 'Use'}
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Add a boat" subtitle="Version 1 range is 15 to 30 feet.">
            <div className="stack">
              <div>
                <label>Boat length in feet</label>
                <input value={newBoatLengthFt} onChange={(e) => setNewBoatLengthFt(e.target.value)} />
              </div>
              <div>
                <label>Boat type</label>
                <select value={newBoatType} onChange={(e) => setNewBoatType(e.target.value)}>
                  {BOAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <button className="primary-btn" onClick={addBoat}>Save Boat</button>
            </div>
          </Card>
        </>
      )}

      {screen === 'account' && (
        <>
          <Card title="Login / sign up" subtitle="Account-based app with saved boats, personal history, and anonymous shared scoring.">
            <div className="stack">
              <div>
                <label>Email</label>
                <input placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label>Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="grid-2 action-grid">
                <button className="primary-btn" onClick={logIn}>Log In</button>
                <button className="secondary-btn" onClick={logIn}>Create Account</button>
              </div>
              <div className="info-box">Status: <strong>{isLoggedIn ? `Logged in as ${email || 'demo user'}` : 'Not logged in'}</strong></div>
              {isLoggedIn ? <button className="secondary-btn" onClick={logOut}>Log Out</button> : null}
            </div>
          </Card>

          <Card title="Profile and privacy">
            <div className="stack">
              <div className="info-box">Trip results contribute anonymously to the all-users score. Boat length and boat type remain in shared data because they are needed to keep results relevant.</div>
              <div className="info-box">Your personal score stays tied to your own history.</div>
            </div>
          </Card>

          <Card title="Units and app settings">
            <div className="stack">
              <div>
                <label>Measurement system</label>
                <div className="pill-row">
                  <button className={units === 'imperial' ? 'pill active' : 'pill'} onClick={() => setUnits('imperial')}>Imperial</button>
                  <button className={units === 'metric' ? 'pill active' : 'pill'} onClick={() => setUnits('metric')}>Metric</button>
                </div>
              </div>
              <div className="info-box">Version 1 is focused on Long Point Bay with separate scoring for Inner Bay, Outer Bay, and Mixed routes.</div>
            </div>
          </Card>
        </>
      )}

      <Card title="Score guide">
        <div className="stack">
          {SCORE_GUIDE.map((item) => (
            <div key={item.score} className="guide-item"><strong>{item.score}</strong> — {item.text}</div>
          ))}
        </div>
      </Card>

      <div className="warning-box">
        Windy is now wired for live data. The other forecast sources are still placeholders until their APIs are added.
      </div>
    </div>
  );
}

export default App;
