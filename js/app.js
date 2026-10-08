import { esc, fmtInt, fmtPct, fmtDate, cards, barList, section, tallyOf, $ } from './fmt.js';
import { columnChart } from './charts.js';
import { renderMap } from './map.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REGION_ORDER = ['NCR', 'CAR', 'Region I', 'Region II', 'Region III', 'Region IV-A', 'Region IV-B', 'Region V', 'Region VI', 'NIR', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XII', 'Region XIII', 'BARMM'];

async function init() {
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
  const pct = p => `<b style="color:var(--c-pos)">${fmtPct(p.rate, 0)}</b>`;
  const prov = D.provinces.map(tallyOf).map((x, i) => ({ ...x, name: D.provinces[i].p })).sort((a, b) => b.n - a.n).slice(0, 10);
  const reg = D.regions.map((x, i) => ({ ...tallyOf(x), name: x.k })).sort((a, b) => REGION_ORDER.indexOf(a.name) - REGION_ORDER.indexOf(b.name));
  const sp = D.species.map(x => ({ ...tallyOf(x), name: x.k })).slice(0, 6);

  main.innerHTML =
    cards([
      { label: 'Samples tested', value: fmtInt(t.n), sub: `${fmtDate(D.dataFrom)} – ${fmtDate(D.dataThrough)}` },
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
    `<div class="grid2">` +
    section('Top provinces by samples', barList(prov.map(p => ({ label: p.name, value: p.n, text: `${fmtInt(p.n)} · ${p.tested >= 5 ? pct(p) : '–'}` }))), 'Bar = samples; % = positivity.') +
    section('Samples by region', barList(reg.map(p => ({ label: p.name, value: p.n, text: `${fmtInt(p.n)} · ${p.tested >= 5 ? pct(p) : '–'}` })))) +
    section('Species submitted', barList(sp.map(p => ({ label: p.name, value: p.n, text: `${fmtInt(p.n)} · ${p.tested >= 5 ? pct(p) : '–'}` })))) +
    `</div>` +
    `<h2 class="map-h">Heat maps</h2><div id="maps"></div>` +
    ((D.labs || []).length ? section('Participating laboratories', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Laboratory</th><th>Location</th><th class="num">Samples received</th></tr></thead><tbody>
      ${[...D.labs].sort((a, b) => b.n - a.n).map(l => `<tr><td class="wrap">${esc(l.name)}</td><td class="wrap">${esc([l.muni, l.prov].filter(Boolean).join(', '))}</td><td class="num">${fmtInt(l.n)}</td></tr>`).join('')}</tbody></table></div>`,
      'Laboratories with a known location are also shown as dots on the heat maps.') : '');
  renderMap($('#maps'), D);
}
init();
