import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Anchor,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Cloud,
  ListChecks,
  LogIn,
  Plus,
  Sailboat,
  Settings,
  TriangleAlert,
  User,
  Waves,
  Wind,
  XCircle,
} from 'lucide-react';

const fallbackForecastTemplates = {
  morning: [
    { name: 'Windy', wind: '10-14 mph', direction: 'SW', gusts: '18 mph', waves: '1-2 ft' },
  ],
  afternoon: [
    { name: 'Windy', wind: '15-20 mph', direction: 'SW', gusts: '24 mph', waves: '2-3 ft' },
  ],
  evening: [
    { name: 'Windy', wind: '9-13 mph', direction: 'W', gusts: '16 mph', waves: '1-2 ft' },
  ],
};

const boatTypes = [
  'Bowrider', 'Deck Boat', 'Pontoon', 'Tri-toon', 'Center Console', 'Dual Console',
  'Cuddy Cabin', 'Cabin Cruiser', 'Walkaround', 'Fishing Boat', 'Aluminum Fishing Boat',
  'Bass Boat', 'Ski / Wake Boat', 'Jet Boat', 'Express Cruiser', 'Runabout', 'RIB / Inflatable',
];

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const windRanges = ['Calm', '1-5', '6-10', '11-15', '16-20', '21-25', '26-30', '30+'];
const waveRanges = ['Flat', 'Under 1 ft', '1-2 ft', '2-3 ft', '3-4 ft', '4-5 ft', '5+ ft'];

const scoreGuide = [
  { score: '1', text: 'Strongly not recommended. Very uncomfortable for most family boats.' },
  { score: '2', text: 'Very rough. Most typical family boaters would avoid it.' },
  { score: '3', text: 'Poor ride comfort. Only some experienced boaters may tolerate it.' },
  { score: '4', text: 'Below average. Not a comfortable family outing.' },
  { score: '5', text: 'Borderline. You may still go, but expect chop and caution.' },
  { score: '6', text: 'Fair. Acceptable for many, though not especially smooth.' },
  { score: '7', text: 'Good. Comfortable enough for many family boats.' },
  { score: '8', text: 'Very good. Pleasant conditions for a typical outing.' },
  { score: '9', text: 'Excellent. Smooth and highly recommended.' },
  { score: '10', text: 'Outstanding. About as good as most boaters could hope for.' },
];

const starterBoats = [
  { id: '1', lengthFt: 21, type: 'Bowrider' },
  { id: '2', lengthFt: 24, type: 'Pontoon' },
];

const starterPendingTrips = [
  {
    id: 'p1',
    date: '2026-03-29',
    block: 'Afternoon',
    area: 'Outer Bay',
    boatId: '1',
    predictedScore: 5,
    forecastSnapshot: fallbackForecastTemplates.afternoon,
  },
];

const LONG_POINT = { lat: 42.58, lon: -80.40 };
const TIME_WINDOWS = {
  morning: { startHour: 8, endHour: 11 },
  afternoon: { startHour: 12, endHour: 16 },
  evening: { startHour: 17, endHour: 20 },
};

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}
function titleCase(v) {
  return v.charAt(0).toUpperCase() + v.slice(1);
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
function boatLabel(boat, units) {
  if (!boat) return 'Unknown boat';
  const length = units === 'metric' ? `${ftToM(Number(boat.lengthFt))} m` : `${boat.lengthFt} ft`;
  return `${length} ${boat.type}`;
}
function useLocalState(key, fallback) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}
function ScoreRing({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) * 10));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-8 border-slate-200 bg-white shadow-sm">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(#0f172a ${pct}%, #e2e8f0 ${pct}% 100%)`,
            mask: 'radial-gradient(circle at center, transparent 56%, black 57%)',
            WebkitMask: 'radial-gradient(circle at center, transparent 56%, black 57%)',
          }}
        />
        <div className="relative z-10 text-center">
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">/10</div>
        </div>
      </div>
      <div className="text-center text-sm font-medium text-slate-700">{label}</div>
    </div>
  );
}
function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-slate-100 p-2">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function windRangeString(mps, units = 'imperial') {
  if (mps == null) return '—';
  const mph = mps * 2.23694;
  const kmh = mps * 3.6;
  if (units === 'metric') {
    return `${Math.round(kmh)} km/h`;
  }
  return `${Math.round(mph)} mph`;
}
function waveString(meters, units = 'imperial') {
  if (meters == null) return '—';
  if (units === 'metric') return `${meters.toFixed(1)} m`;
  return `${mToFt(meters).toFixed(1)} ft`;
}
function getWindowHours(dateStr, timeBlock) {
  const base = new Date(`${dateStr}T00:00:00`);
  const config = TIME_WINDOWS[timeBlock] || TIME_WINDOWS.afternoon;
  const hours = [];
  for (let h = config.startHour; h <= config.endHour; h += 1) {
    const d = new Date(base);
    d.setHours(h, 0, 0, 0);
    hours.push(d.toISOString());
  }
  return hours;
}
function parseSeries(payload, key) {
  return payload?.[key] || payload?.ts?.[key] || [];
}
function closestIndexes(hours, targetHours) {
  const ts = hours.map((h) => new Date(h).getTime());
  return targetHours
    .map((iso) => {
      const target = new Date(iso).getTime();
      let bestIdx = -1;
      let bestDiff = Infinity;
      ts.forEach((t, i) => {
        const diff = Math.abs(t - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      });
      return bestIdx;
    })
    .filter((v) => v >= 0);
}

export default function App() {
  const [screen, setScreen] = useLocalState('lp2-screen', 'home');
  const [area, setArea] = useLocalState('lp2-area', 'outer');
  const [timeBlock, setTimeBlock] = useLocalState('lp2-time-block', 'afternoon');
  const [boatId, setBoatId] = useLocalState('lp2-boat-id', '1');
  const [communityMode, setCommunityMode] = useLocalState('lp2-community-mode', 'similar');
  const [units, setUnits] = useLocalState('lp2-units', 'imperial');
  const [boats, setBoats] = useLocalState('lp2-boats', starterBoats);
  const [pendingTrips, setPendingTrips] = useLocalState('lp2-pending-trips', starterPendingTrips);
  const [completedTrips, setCompletedTrips] = useLocalState('lp2-completed-trips', []);
  const [selectedPendingId, setSelectedPendingId] = useLocalState('lp2-selected-pending-id', 'p1');
  const [tripDate, setTripDate] = useLocalState('lp2-trip-date', todayString());
  const [email, setEmail] = useLocalState('lp2-email', '');
  const [isLoggedIn, setIsLoggedIn] = useLocalState('lp2-is-logged-in', false);

  const [password, setPassword] = useState('');
  const [newBoatLengthFt, setNewBoatLengthFt] = useState('22');
  const [newBoatType, setNewBoatType] = useState('Bowrider');
  const [actualWindRange, setActualWindRange] = useState('16-20');
  const [actualDirection, setActualDirection] = useState('SW');
  const [actualWaveRange, setActualWaveRange] = useState('2-3 ft');
  const [actualScore, setActualScore] = useState('6');
  const [tripNote, setTripNote] = useState('Forecast was close, but rougher near the bay mouth.');

  const [windyForecast, setWindyForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState('');

  const activeBoat = boats.find((b) => b.id === boatId) || boats[0];
  const selectedPending = pendingTrips.find((t) => t.id === selectedPendingId) || pendingTrips[0];

  useEffect(() => {
    const apiKey = import.meta.env.VITE_WINDY_API_KEY;
    if (!apiKey) {
      setForecastError('Missing Windy API key');
      setWindyForecast(null);
      return;
    }

    const targets = getWindowHours(tripDate, timeBlock);
    setForecastLoading(true);
    setForecastError('');

    fetch('https://api.windy.com/api/point-forecast/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-windy-api-key': apiKey,
      },
      body: JSON.stringify({
        lat: LONG_POINT.lat,
        lon: LONG_POINT.lon,
        model: 'gfs',
        parameters: [
          'wind',
          'windGust',
          'waves',
          'wavesHeight',
          'windDir',
        ],
        levels: ['surface'],
        key: apiKey,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Windy request failed: ${res.status}`);
        }
        return res.json();
      })
      .then((payload) => {
        const hours = payload.ts || payload.hours || payload.timestamps || [];
        const idxs = closestIndexes(hours, targets);

        const windU = parseSeries(payload, 'wind_u-surface') || parseSeries(payload, 'wind_u');
        const windV = parseSeries(payload, 'wind_v-surface') || parseSeries(payload, 'wind_v');
        const gust = parseSeries(payload, 'gust-surface') || parseSeries(payload, 'windGust-surface') || parseSeries(payload, 'gust');
        const windDir = parseSeries(payload, 'windDir-surface') || parseSeries(payload, 'windDirection-surface') || parseSeries(payload, 'windDir');
        const waveHeight =
          parseSeries(payload, 'waves_height-surface') ||
          parseSeries(payload, 'wavesHeight-surface') ||
          parseSeries(payload, 'waves_height') ||
          parseSeries(payload, 'wavesHeight');

        const windowWindSpeeds = idxs.map((i) => {
          const u = windU?.[i];
          const v = windV?.[i];
          if (typeof u === 'number' && typeof v === 'number') {
            return Math.sqrt(u * u + v * v);
          }
          return null;
        });

        const result = {
          windAvg: average(windowWindSpeeds),
          gustAvg: average(idxs.map((i) => gust?.[i])),
          windDirAvg: average(idxs.map((i) => windDir?.[i])),
          waveAvg: average(idxs.map((i) => waveHeight?.[i])),
        };
        setWindyForecast(result);
      })
      .catch((err) => {
        setForecastError(err.message || 'Failed to load forecast');
        setWindyForecast(null);
      })
      .finally(() => setForecastLoading(false));
  }, [tripDate, timeBlock]);

  const personalAverage = useMemo(() => {
    if (!completedTrips.length) return null;
    const avg = completedTrips.reduce((sum, t) => sum + Number(t.actualScore || 0), 0) / completedTrips.length;
    return Math.round(avg * 10) / 10;
  }, [completedTrips]);

  const forecastSources = useMemo(() => {
    if (!windyForecast) return fallbackForecastTemplates[timeBlock] || fallbackForecastTemplates.afternoon;
    return [
      {
        name: 'Windy',
        wind: windRangeString(windyForecast.windAvg, units),
        direction: degToCompass(windyForecast.windDirAvg),
        gusts: windRangeString(windyForecast.gustAvg, units),
        waves: waveString(windyForecast.waveAvg, units),
      },
    ];
  }, [timeBlock, units, windyForecast]);

  const recommendation = useMemo(() => {
    const boatLength = Number(activeBoat?.lengthFt || 21);
    const smallBoatPenalty = boatLength <= 18 ? 1 : boatLength <= 20 ? 0.5 : 0;
    const wavePenalty = windyForecast?.waveAvg ? Math.min(3, Math.round(mToFt(windyForecast.waveAvg) / 1.5)) : 0;

    if (area === 'inner') {
      return {
        predicted: Math.max(1, Math.round(8 - smallBoatPenalty - wavePenalty * 0.5)),
        personal: personalAverage || 7,
        allUsers: 8,
        label: 'Good day for many family boats',
        caution: 'Inner Bay looks more comfortable than Outer Bay for this time window.',
        confidence: 78,
      };
    }

    if (area === 'mixed') {
      return {
        predicted: Math.max(1, Math.round(6 - smallBoatPenalty - wavePenalty)),
        personal: personalAverage || 6,
        allUsers: 6,
        label: 'Usable, but expect rougher stretches',
        caution: 'Mixed routes can change quickly as you move toward the bay mouth.',
        confidence: 69,
      };
    }

    return {
      predicted: Math.max(1, Math.round(5 - smallBoatPenalty - wavePenalty)),
      personal: personalAverage || 6,
      allUsers: communityMode === 'similar' ? 5 : 6,
      label: 'Use caution for typical family boats',
      caution: 'Southwest wind may create uncomfortable chop in Outer Bay.',
      confidence: 72,
    };
  }, [activeBoat, area, communityMode, personalAverage, windyForecast]);

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
      forecastSnapshot: forecastSources,
    };
    setPendingTrips((prev) => [newTrip, ...prev]);
    setSelectedPendingId(newTrip.id);
    setScreen('pending');
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
      completedAt: new Date().toISOString(),
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
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto flex max-w-md flex-col gap-4 pb-8">
        <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Working app canvas</div>
              <h1 className="mt-1 text-2xl font-semibold">Long Point Bay Boating Score</h1>
              <p className="mt-2 text-sm text-slate-300">Now pulling Windy forecast data including wave height when available.</p>
            </div>
            <Sailboat className="mt-1 h-6 w-6 text-slate-200" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-3xl bg-white p-2 shadow-sm">
          <Button variant={screen === 'home' ? 'default' : 'ghost'} className="rounded-2xl px-2" onClick={() => setScreen('home')}>Home</Button>
          <Button variant={screen === 'pending' ? 'default' : 'ghost'} className="rounded-2xl px-2" onClick={() => setScreen('pending')}>Trips</Button>
          <Button variant={screen === 'boats' ? 'default' : 'ghost'} className="rounded-2xl px-2" onClick={() => setScreen('boats')}>Boats</Button>
          <Button variant={screen === 'account' ? 'default' : 'ghost'} className="rounded-2xl px-2" onClick={() => setScreen('account')}>Account</Button>
        </div>

        {screen === 'home' && (
          <>
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <SectionTitle icon={CalendarDays} title="Plan your boating window" subtitle="Choose date, area, boat, and time window" />
                <div className="space-y-3">
                  <div>
                    <Label className="mb-2 block">Date</Label>
                    <Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} className="rounded-2xl" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-2 block">Area</Label>
                      <Select value={area} onValueChange={setArea}>
                        <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inner">Inner Bay</SelectItem>
                          <SelectItem value="outer">Outer Bay</SelectItem>
                          <SelectItem value="mixed">Mixed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block">Boat</Label>
                      <Select value={boatId} onValueChange={setBoatId}>
                        <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {boats.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{boatLabel(b, units)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Time window</Label>
                    <Tabs value={timeBlock} onValueChange={setTimeBlock}>
                      <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                        <TabsTrigger value="morning" className="rounded-2xl">Morning</TabsTrigger>
                        <TabsTrigger value="afternoon" className="rounded-2xl">Afternoon</TabsTrigger>
                        <TabsTrigger value="evening" className="rounded-2xl">Evening</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="mt-2 text-xs text-slate-500">
                      {timeBlock === 'morning' && '8 AM to 11 AM'}
                      {timeBlock === 'afternoon' && '12 PM to 4 PM'}
                      {timeBlock === 'evening' && '5 PM to 8 PM'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" /> App recommendation</CardTitle>
                <CardDescription>Predicted score plus personal and shared views</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <ScoreRing value={recommendation.predicted} label="Predicted" />
                  <ScoreRing value={Number(recommendation.personal)} label="Your Score" />
                  <ScoreRing value={recommendation.allUsers} label="All Users" />
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">{recommendation.label}</div>
                  <div className="mt-1 text-sm text-slate-600">{recommendation.caution}</div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
                  <div>
                    <div className="text-sm font-medium">Shared score filter</div>
                    <div className="text-xs text-slate-500">Switch between similar-length boats and all boats</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant={communityMode === 'similar' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setCommunityMode('similar')}>Similar</Button>
                    <Button variant={communityMode === 'all' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setCommunityMode('all')}>All</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><Cloud className="h-5 w-5" /> Forecast by source</CardTitle>
                <CardDescription>Wind speed, direction, gusts, and wave height shown separately</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {forecastLoading && (
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">Loading live Windy forecast…</div>
                )}
                {forecastError && (
                  <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{forecastError}</div>
                )}
                {forecastSources.map((source) => (
                  <div key={source.name} className="rounded-2xl border border-slate-200 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="font-medium">{source.name}</div>
                      <Badge variant="secondary" className="rounded-full">{timeBlock}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-slate-50 p-2">
                        <div className="flex items-center gap-1 text-slate-500"><Wind className="h-4 w-4" /> Wind</div>
                        <div className="mt-1 font-medium">{source.wind} {source.direction}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <div className="text-slate-500">Gusts</div>
                        <div className="mt-1 font-medium">{source.gusts}</div>
                      </div>
                      <div className="col-span-2 rounded-xl bg-slate-50 p-2">
                        <div className="flex items-center gap-1 text-slate-500"><Waves className="h-4 w-4" /> Waves</div>
                        <div className="mt-1 font-medium">{source.waves}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Why this score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-800">Boat in use</div>
                  <div className="mt-1">{boatLabel(activeBoat, units)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-800">Main factor</div>
                  <div className="mt-1">Outer Bay and Mixed routes react more sharply to southwest wind and chop for family boats.</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-800">Forecast confidence</div>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs"><span>Source agreement and past match rate</span><span>{recommendation.confidence}%</span></div>
                    <Progress value={recommendation.confidence} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button className="h-12 rounded-2xl text-base" onClick={saveTrip}>Save as Trip</Button>
              <Button variant="outline" className="h-12 rounded-2xl text-base" onClick={() => setScreen('pending')}>
                Pending Trips
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {screen === 'pending' && (
          <>
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <SectionTitle icon={ListChecks} title="Pending trips" subtitle="Complete actual results later or cancel trips not taken" />
                <div className="space-y-3">
                  {pendingTrips.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No pending trips right now.</div>
                  ) : (
                    pendingTrips.map((trip) => {
                      const tripBoat = boats.find((b) => b.id === trip.boatId);
                      return (
                        <button
                          key={trip.id}
                          onClick={() => setSelectedPendingId(trip.id)}
                          className={cx(
                            'w-full rounded-2xl border p-3 text-left transition',
                            selectedPendingId === trip.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{trip.date} · {trip.block}</div>
                              <div className="mt-1 text-sm text-slate-600">{trip.area} · {boatLabel(tripBoat, units)}</div>
                              <div className="mt-2 text-xs text-slate-500">Predicted at save time: {trip.predictedScore}/10</div>
                            </div>
                            <Badge variant="secondary" className="rounded-full">Pending</Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedPending && (
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Log actual trip results</CardTitle>
                  <CardDescription>{selectedPending.date} · {selectedPending.block} · {selectedPending.area}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    Forecast snapshot saved with this trip: <span className="font-medium text-slate-900">{selectedPending.predictedScore}/10 predicted</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-2 block">Actual wind</Label>
                      <Select value={actualWindRange} onValueChange={setActualWindRange}>
                        <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {windRanges.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block">Direction</Label>
                      <Select value={actualDirection} onValueChange={setActualDirection}>
                        <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {directions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Actual wave range</Label>
                    <Select value={actualWaveRange} onValueChange={setActualWaveRange}>
                      <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {waveRanges.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Ride comfort score</Label>
                    <Select value={actualScore} onValueChange={setActualScore}>
                      <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {scoreGuide.map((item) => <SelectItem key={item.score} value={item.score}>{item.score}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{actualScore}/10:</span>{' '}
                      {scoreGuide.find((s) => s.score === actualScore)?.text}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Short note</Label>
                    <Textarea value={tripNote} onChange={(e) => setTripNote(e.target.value)} className="min-h-[100px] rounded-2xl" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className="h-12 rounded-2xl" onClick={submitResults}><CircleCheck className="mr-2 h-4 w-4" />Submit results</Button>
                    <Button variant="outline" className="h-12 rounded-2xl" onClick={cancelTrip}><XCircle className="mr-2 h-4 w-4" />Cancel trip</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Completed trips</CardTitle>
                <CardDescription>Stored in the browser for this working demo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {completedTrips.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No completed trips yet.</div>
                ) : (
                  completedTrips.map((trip) => {
                    const tripBoat = boats.find((b) => b.id === trip.boatId);
                    return (
                      <div key={trip.id + trip.completedAt} className="rounded-2xl border border-slate-200 p-3">
                        <div className="font-medium">{trip.date} · {trip.block} · {trip.actualScore}/10</div>
                        <div className="mt-1 text-sm text-slate-600">{trip.area} · {boatLabel(tripBoat, units)}</div>
                        <div className="mt-2 text-sm text-slate-600">Actual: {trip.actualWindRange} {trip.actualDirection} · {trip.actualWaveRange}</div>
                        {trip.tripNote ? <div className="mt-2 text-sm text-slate-500">“{trip.tripNote}”</div> : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        )}

        {screen === 'boats' && (
          <>
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <SectionTitle icon={Anchor} title="Your boats" subtitle="Save boats to your profile and choose one for each trip" />
                <div className="space-y-3">
                  {boats.map((b) => (
                    <div key={b.id} className={cx('rounded-2xl border p-3', boatId === b.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white')}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{boatLabel(b, units)}</div>
                          <div className="text-sm text-slate-500">Type: {b.type}</div>
                        </div>
                        <Button variant={boatId === b.id ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setBoatId(b.id)}>
                          {boatId === b.id ? 'Selected' : 'Use'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5" /> Add a boat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block">Boat length in feet</Label>
                  <Input value={newBoatLengthFt} onChange={(e) => setNewBoatLengthFt(e.target.value)} className="rounded-2xl" />
                  <div className="mt-1 text-xs text-slate-500">Version 1 range: 15 to 30 feet</div>
                </div>
                <div>
                  <Label className="mb-2 block">Boat type</Label>
                  <Select value={newBoatType} onValueChange={setNewBoatType}>
                    <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {boatTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="h-12 w-full rounded-2xl" onClick={addBoat}>Save boat</Button>
              </CardContent>
            </Card>
          </>
        )}

        {screen === 'account' && (
          <>
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <SectionTitle icon={LogIn} title="Login / sign up" subtitle="Account-based app with saved boats, personal history, and anonymous shared scoring" />
                <div className="space-y-3">
                  <div>
                    <Label className="mb-2 block">Email</Label>
                    <Input placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-2xl" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Password</Label>
                    <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-2xl" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className="h-12 rounded-2xl" onClick={logIn}>Log in</Button>
                    <Button variant="outline" className="h-12 rounded-2xl" onClick={logIn}>Create account</Button>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    Status: <span className="font-medium text-slate-900">{isLoggedIn ? `Logged in as ${email || 'demo user'}` : 'Not logged in'}</span>
                  </div>
                  {isLoggedIn ? <Button variant="outline" className="h-12 rounded-2xl" onClick={logOut}>Log out</Button> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5" /> Profile and privacy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-3">
                  Trip results contribute anonymously to the all-users score. Boat length and boat type remain in shared data because they are needed to keep results relevant.
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  Your personal score stays tied to your own history.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><Settings className="h-5 w-5" /> Units and app settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block">Measurement system</Label>
                  <div className="flex gap-2">
                    <Button variant={units === 'imperial' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setUnits('imperial')}>Imperial</Button>
                    <Button variant={units === 'metric' ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setUnits('metric')}>Metric</Button>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  Version 1 is focused on Long Point Bay with separate scoring for Inner Bay, Outer Bay, and Mixed routes.
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="rounded-3xl border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Score guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scoreGuide.map((item) => (
              <div key={item.score} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{item.score}</span> — {item.text}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4" />
            <div>
              Windy is now the live source in this file. The other sources still need separate API connections.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
