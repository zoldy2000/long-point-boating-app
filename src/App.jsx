import React, { useMemo, useState } from 'react';

const zones = [
  {
    id: 'inner-west',
    name: 'Inner Bay West',
    area: 'Inner Bay',
    points: '90,270 170,235 185,285 105,315',
    exposure: { W: 2, SW: 2, S: 1, SE: 0, E: 0, NE: 0, N: 0, NW: 1 },
    notes: 'More protected in many east and northeast setups. Can still get lumpy with stronger west and southwest wind.',
  },
  {
    id: 'inner-central',
    name: 'Inner Bay Central',
    area: 'Inner Bay',
    points: '185,285 170,235 265,215 285,275 220,310',
    exposure: { W: 1, SW: 1, S: 1, SE: 1, E: 1, NE: 0, N: 0, NW: 1 },
    notes: 'Middle of Inner Bay. Usually moderate rather than extreme unless the wind is sustained and aligned across open water.',
  },
  {
    id: 'inner-east',
    name: 'Inner Bay East',
    area: 'Inner Bay',
    points: '285,275 265,215 355,205 380,255 335,300',
    exposure: { W: 0, SW: 0, S: 1, SE: 2, E: 2, NE: 1, N: 0, NW: 0 },
    notes: 'Can be calmer in west wind but more exposed when easterly wind pushes across this side of the bay.',
  },
  {
    id: 'outer-west',
    name: 'Outer Bay West',
    area: 'Outer Bay',
    points: '390,160 500,135 510,195 420,225',
    exposure: { W: 2, SW: 3, S: 2, SE: 1, E: 0, NE: 0, N: 0, NW: 1 },
    notes: 'Western Outer Bay tends to worsen quickly in southwest wind. Often one of the first outer sections to feel uncomfortable for family boats.',
  },
  {
    id: 'outer-central',
    name: 'Outer Bay Central',
    area: 'Outer Bay',
    points: '420,225 510,195 575,230 510,285 430,285',
    exposure: { W: 1, SW: 2, S: 2, SE: 2, E: 1, NE: 0, N: 0, NW: 1 },
    notes: 'A broad open-water zone. More exposed than Inner Bay in almost every setup and often a good indicator of general ride comfort.',
  },
  {
    id: 'outer-east',
    name: 'Outer Bay East',
    area: 'Outer Bay',
    points: '575,230 655,215 700,255 640,305 510,285',
    exposure: { W: 0, SW: 1, S: 2, SE: 3, E: 3, NE: 2, N: 1, NW: 0 },
    notes: 'Eastern Outer Bay gets hit harder in east and southeast patterns. Can look much better than the west side in strong west wind.',
  },
  {
    id: 'bay-mouth',
    name: 'Bay Mouth / Most Exposed Water',
    area: 'Outer Bay',
    points: '355,205 390,160 420,225 380,255',
    exposure: { W: 2, SW: 3, S: 3, SE: 3, E: 2, NE: 2, N: 1, NW: 1 },
    notes: 'This is one of the most sensitive parts of the bay system. It can deteriorate quickly and often deserves separate caution from the rest of the bay.',
  },
];

const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const windBands = [
  { value: 10, label: 'Under 10 mph' },
  { value: 15, label: '10–15 mph' },
  { value: 20, label: '15–20 mph' },
  { value: 25, label: '20–25 mph' },
  { value: 30, label: '25–30 mph' },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function zoneScore(zone, dir, wind) {
  const exposure = zone.exposure[dir] ?? 1;
  const windFactor = wind <= 10 ? 0 : wind <= 15 ? 1 : wind <= 20 ? 2 : wind <= 25 ? 3 : 4;
  let score = 9 - exposure * 1.4 - windFactor * 1.1;
  if (zone.area === 'Outer Bay') score -= 0.4;
  if (zone.id === 'bay-mouth') score -= 0.8;
  return Math.round(clamp(score, 1, 10));
}

function colorForScore(score) {
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#84cc16';
  if (score >= 4) return '#f59e0b';
  if (score >= 3) return '#f97316';
  return '#ef4444';
}

function labelForScore(score) {
  if (score >= 8) return 'Good';
  if (score >= 6) return 'Usable';
  if (score >= 4) return 'Caution';
  return 'Poor';
}

export default function LongPointBayMapPrototype() {
  const [windDir, setWindDir] = useState('SW');
  const [windSpeed, setWindSpeed] = useState(20);
  const [selectedZoneId, setSelectedZoneId] = useState('outer-west');

  const scoredZones = useMemo(() => {
    return zones.map((zone) => {
      const score = zoneScore(zone, windDir, windSpeed);
      return {
        ...zone,
        score,
        fill: colorForScore(score),
        label: labelForScore(score),
      };
    });
  }, [windDir, windSpeed]);

  const selectedZone = scoredZones.find((z) => z.id === selectedZoneId) || scoredZones[0];

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Map prototype</div>
          <h1 className="mt-1 text-2xl font-semibold">Long Point Bay exposure map</h1>
          <p className="mt-2 text-sm text-slate-300">Whole-bay color map for Inner and Outer Bay with click-to-explain zones.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Wind direction</label>
                <select
                  value={windDir}
                  onChange={(e) => setWindDir(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2"
                >
                  {windDirs.map((dir) => (
                    <option key={dir} value={dir}>{dir}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Wind speed</label>
                <select
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2"
                >
                  {windBands.map((band) => (
                    <option key={band.value} value={band.value}>{band.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-sky-50 p-3">
              <svg viewBox="0 0 760 420" className="w-full rounded-2xl bg-sky-100">
                <path d="M40 315 C95 255, 180 215, 290 205 C350 198, 420 150, 520 135 C610 122, 700 170, 720 235 C736 288, 702 344, 640 360 C560 380, 430 368, 320 340 C230 318, 125 320, 40 315 Z" fill="#dbeafe" stroke="#94a3b8" strokeWidth="3" />
                <path d="M65 300 C120 258, 188 230, 278 219 C325 213, 352 208, 372 203" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="8 8" />
                <text x="115" y="185" className="fill-slate-700 text-[16px] font-semibold">Inner Bay</text>
                <text x="505" y="120" className="fill-slate-700 text-[16px] font-semibold">Outer Bay</text>

                {scoredZones.map((zone) => (
                  <g key={zone.id}>
                    <polygon
                      points={zone.points}
                      fill={zone.fill}
                      fillOpacity="0.78"
                      stroke={selectedZoneId === zone.id ? '#0f172a' : '#334155'}
                      strokeWidth={selectedZoneId === zone.id ? '4' : '2'}
                      className="cursor-pointer transition-all"
                      onClick={() => setSelectedZoneId(zone.id)}
                    />
                  </g>
                ))}
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <div className="rounded-full bg-green-500 px-3 py-1 text-white">Good</div>
              <div className="rounded-full bg-lime-500 px-3 py-1 text-white">Usable</div>
              <div className="rounded-full bg-amber-500 px-3 py-1 text-white">Caution</div>
              <div className="rounded-full bg-red-500 px-3 py-1 text-white">Poor</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">Selected zone</div>
              <div className="mt-1 text-xl font-semibold">{selectedZone.name}</div>
              <div className="mt-1 text-sm text-slate-500">{selectedZone.area}</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-3xl font-bold">{selectedZone.score}</div>
                <div className="text-sm text-slate-500">Score / 10</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-lg font-semibold">{selectedZone.label}</div>
                <div className="text-sm text-slate-500">Condition</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">Why this zone got this color</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Wind is set to <strong>{windDir}</strong> at <strong>{windSpeed} mph</strong>. This zone has an exposure value of <strong>{selectedZone.exposure[windDir]}</strong> for that wind direction. {selectedZone.notes}
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-500">What this means</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                This prototype is not pretending to know exact wave height at every point. It is showing a practical zone-based meaning of the forecast so you can compare one side of the bay against another.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'''

path = Path('/mnt/data/long_point_map_prototype.jsx')
path.write_text(code)
print(path)
print(path.read_text()[:200])
Japgollypython_user_visible.exec to=python_user_visible.exec code did not parse: Error(
