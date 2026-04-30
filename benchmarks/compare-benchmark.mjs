import fs from 'fs';

const baselinePath = process.argv[2] || 'benchmarks/baseline.json';
const currentPath = process.argv[3] || 'benchmarks/history/latest.json';
const regressionThreshold = Number(process.argv[4] || '0.15');

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

const mapRows = (snapshot) => new Map(snapshot.rows.map((r) => [r.name, r]));
const baseMap = mapRows(baseline);
const curMap = mapRows(current);

let hasRegression = false;
const report = [];

for (const [name, base] of baseMap.entries()) {
  const cur = curMap.get(name);
  if (!cur) continue;
  const throughputDrop = (base.throughputAvgOps - cur.throughputAvgOps) / base.throughputAvgOps;
  const latencyIncrease = (cur.latencyAvgNs - base.latencyAvgNs) / base.latencyAvgNs;
  const throughputPct = (throughputDrop * 100).toFixed(2);
  const latencyPct = (latencyIncrease * 100).toFixed(2);

  report.push({
    name,
    baselineOps: base.throughputAvgOps,
    currentOps: cur.throughputAvgOps,
    throughputDropPct: Number(throughputPct),
    baselineNs: base.latencyAvgNs,
    currentNs: cur.latencyAvgNs,
    latencyIncreasePct: Number(latencyPct),
  });

  if (throughputDrop > regressionThreshold || latencyIncrease > regressionThreshold) {
    hasRegression = true;
  }
}

console.table(report);

if (hasRegression) {
  console.error(`Benchmark regression detected above ${(regressionThreshold * 100).toFixed(0)}% threshold.`);
  process.exit(1);
}
