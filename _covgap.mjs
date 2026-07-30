// Ad-hoc: parse coverage-final.json → per-file uncovered stmts/branches/funcs.
// Focus on api/v1/corporate/*. Prints line numbers of uncovered code so we can
// target tests precisely. Deleted after use.
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('./coverage/coverage-final.json', 'utf8'));

const rows = [];
for (const [file, cov] of Object.entries(raw)) {
  const norm = file.replace(/\\/g, '/');
  if (!norm.includes('api/v1/corporate/')) continue;

  const { statementMap, s, branchMap, b, fnMap, f } = cov;

  // statements
  const sTot = Object.keys(s).length;
  const sHit = Object.values(s).filter((n) => n > 0).length;
  const uncoveredStmtLines = [];
  for (const [id, count] of Object.entries(s)) {
    if (count === 0) {
      const loc = statementMap[id]?.start?.line;
      if (loc != null) uncoveredStmtLines.push(loc);
    }
  }

  // functions
  const fTot = Object.keys(f).length;
  const fHit = Object.values(f).filter((n) => n > 0).length;
  const uncoveredFns = [];
  for (const [id, count] of Object.entries(f)) {
    if (count === 0) {
      const fn = fnMap[id];
      uncoveredFns.push(`${fn?.name || 'anon'}@${fn?.decl?.start?.line}`);
    }
  }

  // branches (each branch id has array of counts, one per path)
  let bTot = 0;
  let bHit = 0;
  const uncoveredBranchLines = [];
  for (const [id, counts] of Object.entries(b)) {
    counts.forEach((c, idx) => {
      bTot += 1;
      if (c > 0) bHit += 1;
      else {
        const loc = branchMap[id]?.locations?.[idx]?.start?.line ?? branchMap[id]?.loc?.start?.line;
        if (loc != null) uncoveredBranchLines.push(loc);
      }
    });
  }

  rows.push({
    file: norm.split('api/v1/corporate/')[1],
    sPct: ((sHit / sTot) * 100).toFixed(1),
    sHit, sTot,
    fPct: ((fHit / fTot) * 100).toFixed(1),
    fHit, fTot,
    bPct: bTot ? ((bHit / bTot) * 100).toFixed(1) : '100',
    bHit, bTot,
    uStmt: [...new Set(uncoveredStmtLines)].sort((a, z) => a - z),
    uFns: uncoveredFns,
    uBranch: [...new Set(uncoveredBranchLines)].sort((a, z) => a - z),
  });
}

rows.sort((a, z) => Number(a.sPct) - Number(z.sPct));

for (const r of rows) {
  console.log(`\n=== ${r.file} ===`);
  console.log(`  stmts ${r.sPct}% (${r.sHit}/${r.sTot}) | funcs ${r.fPct}% (${r.fHit}/${r.fTot}) | branch ${r.bPct}% (${r.bHit}/${r.bTot})`);
  if (r.uStmt.length) console.log(`  uncovered stmt lines: ${r.uStmt.join(', ')}`);
  if (r.uFns.length) console.log(`  uncovered fns: ${r.uFns.join(', ')}`);
  if (r.uBranch.length) console.log(`  uncovered branch lines: ${r.uBranch.join(', ')}`);
}

// module totals
const agg = rows.reduce((a, r) => ({
  sHit: a.sHit + r.sHit, sTot: a.sTot + r.sTot,
  fHit: a.fHit + r.fHit, fTot: a.fTot + r.fTot,
  bHit: a.bHit + r.bHit, bTot: a.bTot + r.bTot,
}), { sHit: 0, sTot: 0, fHit: 0, fTot: 0, bHit: 0, bTot: 0 });
console.log('\n=== MODULE TOTAL ===');
console.log(`  stmts ${(agg.sHit/agg.sTot*100).toFixed(2)}% (${agg.sHit}/${agg.sTot})`);
console.log(`  funcs ${(agg.fHit/agg.fTot*100).toFixed(2)}% (${agg.fHit}/${agg.fTot})`);
console.log(`  branch ${(agg.bHit/agg.bTot*100).toFixed(2)}% (${agg.bHit}/${agg.bTot})`);
