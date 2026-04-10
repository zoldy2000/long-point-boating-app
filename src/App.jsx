import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const LONG_POINT_CENTER = [42.585, -80.36];
const LENGTH_RANGES = [
  { value: '15-18', label: '15–18 ft', boatLengthFt: 17 },
  { value: '19-21', label: '19–21 ft', boatLengthFt: 20 },
  { value: '22-24', label: '22–24 ft', boatLengthFt: 23 },
  { value: '25-27', label: '25–27 ft', boatLengthFt: 26 },
  { value: '28-30', label: '28–30 ft', boatLengthFt: 29 },
];

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayString() {
  return toYmd(new Date());
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

function mToFt(m) {
  return m * 3.28084;
}

function mpsToMph(v) {
  return v * 2.23694;
}

function degToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function windFromUv(u, v) {
  const speed = Math.sqrt(u * u + v * v);
  const deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  return { speed, direction: degToCompass(deg), degrees: deg };
}

function formatWindRange(range) {
  if (!range) return '—';
  return `${Math.round(mpsToMph(range.min))}-${Math.round(mpsToMph(range.max))} mph`;
}

function formatWaveRange(range) {
  if (!range) return '—';
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

function classifyPoint(lat, lon) {
  if (lon < -80.39) return 'West side';
  if (lon > -80.31) return 'East side';
  if (lat > 42.61) return 'More exposed water';
  return 'Central bay';
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
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Fair';
  if (score >= 3) return 'Use caution';
  return 'Poor';
}

function reasonFromForecast({ spotName, windDir, waveAvg, gustAvg, boatLengthFt, score }) {
  const waveFt = mToFt(waveAvg || 0);
  const gustMph = Math.round(mpsToMph(gustAvg || 0));

  if (score >= 8) {
    return `${spotName} looks manageable for about a ${boatLengthFt} ft family boat. Wind is coming from ${windDir} and waves look relatively moderate for this spot.`;
  }
  if (score >= 6) {
    return `${spotName} should still be usable, but expect some chop. ${windDir} wind and gusts near ${gustMph} mph may make the ride less comfortable.`;
  }
  if (score >= 4) {
    return `${spotName} is getting into caution territory. Waves around ${waveFt.toFixed(1)} ft may feel uncomfortable for many family boats around ${boatLengthFt} ft.`;
  }
  return `${spotName} looks poor for a family boat around ${boatLengthFt} ft. This spot is likely too rough or uncomfortable in this setup.`;
}

async function fetchWindyPoint({ lat, lon, tripDate, timeBlock, key }) {
  const [startHour, endHour] = windowHours(timeBlock);

  const makeReq = (model, parameters) =>
    fetch('https://api.windy.com/api/point-forecast/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lon,
        model,
        parameters,
        levels: ['surface'],
        key,
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Windy request failed: ${res.status}`);
      return res.json();
    });

  const [windJson, waveJson] = await Promise.all([
    makeReq('gfs', ['wind', 'windGust']),
    makeReq('gfsWave', ['waves']),
  ]);

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

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });
  return null;
}

export default function App() {
  const [tripDate, setTripDate] = useState(todayString());
  const [timeBlock, setTimeBlock] = useState('afternoon');
  const [lengthRange, setLengthRange] = useState('19-21');
  const [selectedPoint, setSelectedPoint] = useState({ lat: 42.603, lng: -80.345 });
  const [pointData, setPointData] = useState({ status: 'idle', message: '', forecast: null });

  const boatLengthFt = LENGTH_RANGES.find((item) => item.value === lengthRange)?.boatLengthFt || 20;

  useEffect(() => {
    let cancelled = false;
    const key = import.meta.env.VITE_WINDY_API_KEY;
    if (!key) {
      setPointData({ status: 'missing-key', message: 'Windy key not found in app environment.', forecast: null });
      return;
    }

    async function run() {
      setPointData((prev) => ({ ...prev, status: 'loading', message: '' }));
      try {
        const forecast = await fetchWindyPoint({
          lat: selectedPoint.lat,
          lon: selectedPoint.lng,
          tripDate,
          timeBlock,
          key,
        });
        if (!cancelled) {
          setPointData({ status: 'ready', message: '', forecast });
        }
      } catch (error) {
        if (!cancelled) {
          setPointData({ status: 'error', message: error.message || 'Windy request failed.', forecast: null });
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
    const spotName = classifyPoint(selectedPoint.lat, selectedPoint.lng);
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-6">
        <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Click-a-spot interpreter</div>
          <h1 className="mt-1 text-2xl font-semibold">Long Point Bay Boating Meaning</h1>
          <p className="mt-2 text-sm text-slate-300">Click any spot on the map. The app reads Windy data for that point and translates it into simple boating meaning for your boat size.</p>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
              <input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="w-full rounded-2xl border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Time window</label>
              <select value={timeBlock} onChange={(e) => setTimeBlock(e.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2">
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Boat length range</label>
              <select value={lengthRange} onChange={(e) => setLengthRange(e.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2">
                {LENGTH_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm">
            <div className="mb-3 text-sm text-slate-500">Click any water spot in Long Point Bay.</div>
            <div className="h-[620px] overflow-hidden rounded-2xl border border-slate-200">
              <MapContainer center={LONG_POINT_CENTER} zoom={11} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={(latlng) => setSelectedPoint({ lat: latlng.lat, lng: latlng.lng })} />
                <Marker position={[selectedPoint.lat, selectedPoint.lng]} icon={markerIcon}>
                  <Popup>Selected spot</Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">Selected spot</div>
              <div className="mt-1 text-xl font-semibold">{interpreted?.spotName || 'Waiting for forecast'}</div>
              <div className="mt-1 text-sm text-slate-500">
                {selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}
              </div>
            </div>

            {pointData.status === 'loading' && <div className="mt-4 rounded-2xl bg-slate-50 p-4">Loading Windy forecast...</div>}
            {(pointData.status === 'error' || pointData.status === 'missing-key') && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-red-700">{pointData.message}</div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-3xl font-bold">{interpreted ? interpreted.score : '—'}</div>
                <div className="text-sm text-slate-500">Score / 10</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-xl font-semibold">{interpreted ? interpreted.label : '—'}</div>
                <div className="text-sm text-slate-500">Meaning</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">Windy forecast at this exact spot</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Wind</div>
                  <div className="mt-1 font-semibold">{pointData.forecast ? `${pointData.forecast.wind} ${pointData.forecast.windDir}` : '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Gusts</div>
                  <div className="mt-1 font-semibold">{pointData.forecast ? pointData.forecast.gusts : '—'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Waves</div>
                  <div className="mt-1 font-semibold">{pointData.forecast ? pointData.forecast.waves : '—'}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">Plain-English interpretation</div>
              <p className="mt-2 leading-6 text-slate-700">
                {interpreted ? interpreted.reason : 'Click a spot and wait for the forecast.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'''
path = Path('/mnt/data/App_click_spot.jsx')
path.write_text(code)
print(path)
print(path.read_text()[:180])
Japgollypython_user_visible.exec to=python_user_visible.exec code did not parse: Error(