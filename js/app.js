import { esc, fmtInt, fmtPct, fmtDate, cards, statTable, section, tallyOf, $ } from './fmt.js';
import { columnChart } from './charts.js';
import { renderMap } from './map.js';
import { initTheme } from './theme.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REGION_ORDER = ['NCR', 'CAR', 'Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V', 'Region VI', 'NIR', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'];

async function init() {
  initTheme();
  const main = $('#main');
  let D;
  try {
    const r = await fetch('data/public-data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    D = await r.json();
  } catch { main.innerHTML = '<div class="panel"><h2>Data not available</h2><p class="sub">Please try again later.</p></div>'; return; }

  const t = tallyOf(D.totals);
  const upd = new Date(D.generatedAt);
  $('#stamp').innerHTML = `Data through <b>${fmtDate(D.dataThrough)}</b><br>Updated ${upd.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const mo = D.monthly, mt = mo.map(tallyOf);
  const label = m => MONTHS[+m.slice(5) - 1] + (m.slice(5) === '01' || m === mo[0].m ? " '" + m.slice(2, 4) : '');
  const pct = p => `<b style="color:var(--c-pos)">${fmtPct(p.rate, 0)}</b>${p.tested < 30 ? `<span title="Only ${p.tested} tested - unreliable">*</span>` : ""}`;
  const prov = D.provinces.map(tallyOf).map((x, i) => ({ ...x, name: D.provinces[i].p })).sort((a, b) => b.n - a.n).slice(0, 10);
  const reg = D.regions.map((x, i) => ({ ...tallyOf(x), name: x.k })).sort((a, b) => REGION_ORDER.indexOf(a.name) - REGION_ORDER.indexOf(b.name));
  const sp = D.species.map(x => ({ ...tallyOf(x), name: x.k })).slice(0, 8);

  main.innerHTML =
    cards([
      { label: 'Samples submitted', value: fmtInt(t.n), sub: `${fmtDate(D.dataFrom)} – ${fmtDate(D.dataThrough)}` },
      { label: 'Positive', value: fmtInt(t.pos), tone: 'pos' },
      { label: 'Negative', value: fmtInt(t.neg), tone: 'neg' },
      { label: 'Inconclusive', value: fmtInt(t.inc), tone: 'inc', sub: t.n - t.pos - t.neg - t.inc ? `${fmtInt(t.n - t.pos - t.neg - t.inc)} unfit / no result` : '' },
      { label: 'Positivity rate', value: fmtPct(t.rate), sub: 'positive ÷ (positive + negative)' },
    ]) +
    section('Samples and positivity by month', columnChart({
      labels: mo.map(m => label(m.m)),
      series: [{ name: 'Positive', color: 'var(--c-pos)', values: mt.map(x => x.pos) }, { name: 'Negative', color: 'var(--c-neg)', values: mt.map(x => x.neg) }, { name: 'Inconclusive / other', color: 'var(--c-oth)', values: mt.map(x => x.n - x.pos - x.neg) }],
      line: { name: 'Positivity', color: 'var(--c3)', values: mt.map(x => x.tested >= 5 ? x.rate : null) },
    }), 'Month the sample was received by the laboratory.') +
    section('Top 10 provinces', statTable(prov.map(p => ({ name: p.name, t: p })), 'Province', t.n), 'Provinces with the most samples.') +
    section('Regions', statTable(reg.map(p => ({ name: p.name, t: p })), 'Region', t.n)) +
    section('Species', statTable(sp.map(p => ({ name: p.name, t: p })), 'Species', t.n), 'For example, goats are a tiny share of all samples, so their rate rests on very few animals.') +
    `<h2 class="map-h">Heat maps</h2><div id="maps"></div>` +
    ((D.labs || []).length ? section('Participating laboratories', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Laboratory</th><th>Type</th><th>Address</th><th>Contact number</th><th class="num">Samples received</th></tr></thead><tbody>
      ${[...D.labs].sort((a, b) => b.n - a.n).map(l => `<tr><td class="wrap"><b>${esc(l.name)}</b></td><td>${esc(l.type || "")}</td><td class="wrap" style="min-width:220px">${esc(l.address || [l.muni, l.prov].filter(Boolean).join(', '))}</td><td>${l.phone ? `<a href="tel:${esc(String(l.phone).replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : '<span class="muted">–</span>'}</td><td class="num">${l.reports ? fmtInt(l.n) : "–"}</td></tr>`).join('')}</tbody></table></div>`,
      'Laboratories with a known location are also shown as dots on the heat maps.') : '');
  renderMap($('#maps'), D);
}
init();
