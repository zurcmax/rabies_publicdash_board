// Heat maps: province -> municipality -> barangay. Reads only the aggregate counts in public-data.json.
import { esc, fmtInt, fmtPct, fmtShare, nk, tallyOf, $ } from './fmt.js';

const REGION_FILES = ['100000000', '200000000', '300000000', '400000000', '500000000', '600000000', '700000000', '800000000', '900000000', '1000000000', '1100000000', '1200000000', '1300000000', '1400000000', '1600000000', '1700000000', '1900000000'];
const NCR_CODES = ['1303900000', '1307400000', '1307500000', '1307600000'];
const GH = 'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/municities';
const W = 700, MIN_TESTED = 5;

const geo = { country: null, prov: {}, brgy: {} };
let metric = 'rate', showLabs = true;
let view = { region: null, prov: null, muni: null };

const getJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const provNameOf = p => /^NCR/.test(p.adm2_en || '') ? 'Metro Manila' : (p.adm2_en || '');

async function countryFeatures() {
  if (!geo.country) {
    const fcs = await Promise.all(REGION_FILES.map(f => getJSON(`data/geo/reg/${f}.json`)));
    geo.country = fcs.flatMap(fc => fc.features.filter(ft => ft.geometry).map(ft => ({ code: String(ft.properties.adm2_psgc), name: provNameOf(ft.properties), rawName: ft.properties.adm2_en || '', geom: ft.geometry })));
  }
  return geo.country;
}
async function provFeatures(prov) {
  if (geo.prov[prov]) return geo.prov[prov];
  const feats = await countryFeatures();
  const codes = prov === 'Metro Manila' ? NCR_CODES : feats.filter(f => f.name === prov).map(f => f.code);
  const fcs = await Promise.all(codes.map(c => getJSON(`data/geo/prov/${c}.json`)));
  return geo.prov[prov] = fcs.flatMap(fc => fc.features.filter(ft => ft.geometry).map(ft => ({ code: String(ft.properties.adm3_psgc), name: ft.properties.adm3_en || '', geom: ft.geometry })));
}
async function brgyFeatures(code) {
  if (geo.brgy[code]) return geo.brgy[code];
  let fc;
  try { fc = await getJSON(`${GH}/medres/bgysubmuns-municity-${code}.0.01.json`); }
  catch { fc = await getJSON(`${GH}/lowres/bgysubmuns-municity-${code}.0.001.json`); }
  return geo.brgy[code] = fc.features.filter(ft => ft.geometry).map(ft => ({ code: String(ft.properties.adm4_psgc || ''), name: ft.properties.adm4_en || '', geom: ft.geometry }));
}

// ---- matching place names to outlines ----
const ALIAS = { bulakan: 'bulacan', baliuag: 'baliwag', montalban: 'rodriguez' };
const squash = s => s.replace(/ /g, '');
function formsOf(name) {
  const base = nk(name), out = new Set([base, squash(base)]);
  const m = String(name).match(/\(([^)]+)\)/);
  if (m) { const p = nk(m[1]); out.add(p); out.add(squash(p)); }
  return out;
}
function linkKeys(keys, feats) {
  const idx = new Map();
  for (const f of feats) for (const k of formsOf(f.name)) if (!idx.has(k)) idx.set(k, f);
  const used = new Set(), link = new Map();
  for (const rk of keys) for (const c of [rk, squash(rk), ALIAS[rk]].filter(Boolean)) {
    const f = idx.get(c); if (f && !used.has(f.code)) { link.set(rk, f); used.add(f.code); break; }
  }
  for (const rk of keys) {
    if (link.has(rk) || rk.length < 4) continue;
    const toks = rk.split(' ');
    const m = feats.filter(f => !used.has(f.code) && toks.every(t => nk(f.name).split(' ').includes(t)));
    if (m.length === 1) { link.set(rk, m[0]); used.add(m[0].code); }
  }
  return link;
}

// Independent cities (Cebu City, Baguio, Zamboanga ...) have no municipal outline in the map data, but their barangay files exist:
// draw the city as the combination of its barangay shapes.
let cityIdx = null;
async function cityFeatures(prov, keys) {
  if (!keys.length) return [];
  cityIdx ||= await getJSON('data/geo/city-index.json').catch(() => []);
  const picks = [];
  for (const k of keys) { const e = cityIdx.find(c => c.prov === prov && (c.keys.includes(k) || c.keys.includes(squash(k)))); if (e && !picks.includes(e)) picks.push(e); }
  const out = [];
  for (const e of picks) {
    try {
      const bf = await brgyFeatures(e.code);
      const polys = bf.flatMap(f => f.geom.type === 'Polygon' ? [f.geom.coordinates] : f.geom.coordinates);
      out.push({ code: e.code, name: e.name, key: nk(e.name), geom: { type: 'MultiPolygon', coordinates: polys } });
    } catch { /* offline: the city stays in the table only */ }
  }
  return out;
}
// ---- projection ----
const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function eachPt(geom, fn) {
  const polys = !geom ? [] : geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const p of polys) for (const ring of p) for (const pt of ring) fn(pt);
}
function layout(feats) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of feats) eachPt(f.geom, ([lon, lat]) => { const y = merc(lat); if (lon < x0) x0 = lon; if (lon > x1) x1 = lon; if (y < y0) y0 = y; if (y > y1) y1 = y; });
  const k = 180 / Math.PI, s = W / (x1 - x0), H = Math.max(120, Math.round((y1 - y0) * k * s)), pad = 6;
  return { proj: ([lon, lat]) => [(lon - x0) * s + pad, (y1 - merc(lat)) * k * s + pad], W: W + pad * 2, Ht: H + pad * 2 };
}
function pathD(geom, proj) {
  const polys = !geom ? [] : geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let d = '';
  for (const p of polys) for (const ring of p) {
    let lx = -9, ly = -9, first = true, seg = '';
    for (const pt of ring) {
      const [x, y] = proj(pt);
      if (!first && Math.abs(x - lx) < 0.35 && Math.abs(y - ly) < 0.35) continue;
      seg += (first ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1); lx = x; ly = y; first = false;
    }
    if (seg) d += seg + 'Z';
  }
  return d;
}

// ---- colour classes ----
const valueOf = t => t == null ? null : metric === 'rate' ? (t.tested >= MIN_TESTED ? t.rate : null) : metric === 'pos' ? t.pos : t.n;
const metricName = () => metric === 'rate' ? 'Positivity rate' : metric === 'pos' ? 'Positive cases' : 'Samples tested';
function makeScale(values) {
  const cls = br => v => v == null ? -1 : br.findIndex(b => v < b) < 0 ? 4 : br.findIndex(b => v < b);
  if (metric === 'rate') return { cls: cls([0.05, 0.15, 0.30, 0.50]), labels: ['< 5%', '5–15%', '15–30%', '30–50%', '≥ 50%'] };
  const nz = values.filter(v => v > 0).sort((a, b) => a - b);
  let br = [];
  if (nz.length) for (const q of [0.2, 0.4, 0.6, 0.8]) br.push(Math.max(1, Math.round(nz[Math.min(nz.length - 1, Math.floor(q * nz.length))])));
  br = [...new Set(br)].sort((a, b) => a - b);
  while (br.length < 4) br.push((br[br.length - 1] || 0) + 1);
  return { cls: cls(br), labels: [`0–${Math.max(1, br[0] - 1)}`, `${br[0]}–${br[1] - 1}`, `${br[1]}–${br[2] - 1}`, `${br[2]}–${br[3] - 1}`, `${br[3]}+`] };
}

function addLabMarkers(box, L, prov, labs) {
  let out = '';
  labs.forEach((lab, i) => {
    if (prov && lab.prov && lab.prov !== prov) return;
    const [x, y] = L.proj([lab.lon, lab.lat]);
    if (x < 0 || y < 0 || x > L.W || y > L.Ht) return;
    out += `<g class="lab" data-lab="${i}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${prov ? 8 : 6}"></circle><circle class="in" r="${prov ? 3 : 2.2}"></circle></g>`;
  });
  box.querySelector('svg').insertAdjacentHTML('beforeend', out);
}

/** Search box with a drop-down list: type part of a province (or region) name and pick it to jump straight there. */
function provinceFinder(el, provinces, onPick) {
  const provs = provinces.filter(x => x.p && x.p !== 'Unspecified' && x.region && x.region !== 'Unassigned')
    .map(x => ({ p: x.p, r: x.region, k: nk(x.p), rk: nk(x.region) })).sort((a, b) => a.p.localeCompare(b.p));
  el.innerHTML = `<div class="finder"><input type="search" placeholder="Search province…" aria-label="Search province" autocomplete="off"><ul class="finder-list" role="listbox" hidden></ul></div>`;
  const inp = el.querySelector('input'), ul = el.querySelector('ul');
  let idx = 0, shown = [];
  const mark = () => ul.querySelectorAll('li[data-i]').forEach(li => li.classList.toggle('on', +li.dataset.i === idx));
  const draw = () => {
    const q = nk(inp.value);
    shown = (q ? provs.filter(x => x.k.includes(q) || x.rk.includes(q)) : provs).slice(0, 16); idx = 0;
    ul.innerHTML = shown.map((x, i) => `<li role="option" data-i="${i}" class="${i === 0 ? 'on' : ''}"><b>${esc(x.p)}</b><span>${esc(x.r)}</span></li>`).join('') || '<li class="none">No province found</li>';
    ul.hidden = false;
  };
  const choose = x => { ul.hidden = true; inp.value = ''; inp.blur(); onPick(x); };
  inp.addEventListener('focus', draw);
  inp.addEventListener('input', draw);
  inp.addEventListener('blur', () => setTimeout(() => { ul.hidden = true; }, 150));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (shown[idx]) choose(shown[idx]); e.preventDefault(); }
    else if (e.key === 'Escape') { ul.hidden = true; }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(shown[+li.dataset.i]); } });
}

export function renderMap(host, D) {
  const provT = new Map(D.provinces.map(p => [p.p, tallyOf(p)]));
  const provRegion = new Map(D.provinces.map(p => [p.p, p.region]));
  const regT = new Map((D.regions || []).map(r => [r.k, tallyOf(r)]));
  host.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <div class="seg" id="metric" role="group" aria-label="Map measure"><button data-m="rate">Positivity rate</button><button data-m="pos">Positive cases</button><button data-m="n">Samples tested</button></div>
      <div id="prov-finder"></div>
      <label class="row" style="gap:6px"><input type="checkbox" id="showlabs" ${showLabs ? 'checked' : ''}> Show laboratories</label>
    </div>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr))">
      <section class="panel"><div class="panel-h"><div><h2 id="map-title"></h2><p class="sub" id="map-sub"></p></div><div class="crumbs" id="crumbs"></div></div>
        <div class="mapbox" id="mapbox"><p class="loading">Loading map…</p></div><div id="legend" style="margin-top:8px"></div><p class="sub" id="map-note" style="margin-top:6px"></p></section>
      <section class="panel"><div class="panel-h"><div><h2 id="tbl-title"></h2><p class="sub" id="tbl-sub"></p></div></div><div id="tbl"></div>
        <p class="sub" style="margin-top:6px"><b>% of all samples</b> = this place's share of every sample nationwide. <b>Positivity rate</b> = positive ÷ tested (positive + negative), with the counts shown beside it; samples that were unfit for testing or inconclusive are not counted as tested. "–" = fewer than 5 tested; * = fewer than 30 tested, so the rate is unreliable.</p></section>
    </div>`;
  let token = 0, sortKey = 'n', sortDir = -1;

  function table(rows, firstLabel, clickable) {
    const sorted = [...rows].sort((a, b) => {
      const g = r => sortKey === 'name' ? r.name : sortKey === 'rate' ? (r.t.tested >= MIN_TESTED ? r.t.rate : -1) : sortKey === 'share' ? r.t.n : r.t[sortKey];
      const x = g(a), y = g(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
    });
    const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${sortKey === k ? 'sorted' : ''}" data-k="${k}" tabindex="0">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    $('#tbl', host).innerHTML = `<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="tbl"><thead><tr>${th('name', firstLabel)}${th('n', 'Samples', 1)}${th('share', '% of all samples', 1)}${th('pos', 'Positive', 1)}${th('rate', 'Positivity rate', 1)}</tr></thead><tbody>
      ${sorted.map(r => `<tr ${clickable && r.go ? `data-go="${esc(r.go)}" style="cursor:pointer"` : ''}><td class="wrap">${esc(r.name)}</td><td class="num">${fmtInt(r.t.n)}</td><td class="num">${fmtShare(r.t.n / D.totals.n)}</td><td class="num">${fmtInt(r.t.pos)}</td><td class="num">${r.t.tested >= MIN_TESTED ? `${fmtPct(r.t.rate)} <small class="muted" title="${r.t.pos} positive of ${r.t.tested} tested">${r.t.pos}/${r.t.tested}</small>${r.t.tested < 30 ? `<span class="muted" title="Only ${r.t.tested} tested – the rate is unreliable">*</span>` : ''}` : `<span class="muted" title="Fewer than 5 tested – rate not shown">–</span> <small class="muted">${r.t.pos}/${r.t.tested}</small>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function draw() {
    const my = ++token;
    host.querySelectorAll('#metric button').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    const box = $('#mapbox', host);
    $('#crumbs', host).innerHTML = `<button data-crumb="country">Philippines</button>${view.region ? (view.prov ? ` › <button data-crumb="region">${esc(view.region)}</button>` : ` › <b>${esc(view.region)}</b>`) : ''}${view.prov ? (view.muni ? ` › <button data-crumb="prov">${esc(view.prov)}</button>` : ` › <b>${esc(view.prov)}</b>`) : ''}${view.muni ? ` › <b>${esc(view.muni.name)}</b>` : ''}`;
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
    try {
      let items = [], rows = [], title, sub, note = '', tblTitle, first, L, onPick = null, clickable = false;
      if (!view.region && !view.prov) {
        // regions: every province is coloured with the value of the region it belongs to
        const feats = await countryFeatures(); if (my !== token) return;
        L = geo.cl ||= layout(feats); geo.cd ||= feats.map(f => pathD(f.geom, L.proj));
        items = feats.map((f, i) => { const rg = provRegion.get(f.name); return { key: f.code, name: rg || f.rawName || f.name, d: geo.cd[i], t: rg ? regT.get(rg) || null : null, go: rg }; });
        title = 'Regions'; sub = `${metricName()} by region. Click a region (or a row) to see its provinces.`; tblTitle = 'Regions'; first = 'Region'; clickable = true;
        rows = [...regT].filter(([r]) => r !== 'Unassigned').map(([r, t]) => ({ name: r, t, go: r }));
        onPick = i => i.go && regT.has(i.go) && (view = { region: i.go, prov: null, muni: null }, draw());
      } else if (view.region && !view.prov) {
        // the provinces of one region
        const all = await countryFeatures(); if (my !== token) return;
        const feats = all.filter(f => provRegion.get(f.name) === view.region);
        const cache = geo.rc ||= {};
        const cc = cache[view.region] ||= (() => { const l = layout(feats); return { l, ds: feats.map(f => pathD(f.geom, l.proj)) }; })();
        L = cc.l;
        items = feats.map((f, i) => ({ key: f.code, name: f.name, d: cc.ds[i], t: provT.get(f.name) || null, go: f.name }));
        title = view.region; sub = `${metricName()} by province in ${view.region}. Click a province (or a row) to see its municipalities.`; tblTitle = `Provinces in ${view.region}`; first = 'Province'; clickable = true;
        rows = D.provinces.filter(p => p.region === view.region).map(p => ({ name: p.p, t: provT.get(p.p), go: p.p }));
        onPick = i => i.go && provT.has(i.go) && (view = { region: view.region, prov: i.go, muni: null }, draw());
      } else {
        let feats = await provFeatures(view.prov); if (my !== token) return;
        const mrows = D.munis.filter(m => m.p === view.prov).map(m => ({ ...m, t: tallyOf(m) }));
        const byM = new Map(mrows.map(m => [m.mk, m]));
        let link = linkKeys([...byM.keys()], feats);
        const extra = await cityFeatures(view.prov, [...byM.keys()].filter(k => !link.has(k)));   // big independent cities: drawn from their barangay shapes
        if (my !== token) return;
        if (extra.length) { feats = [...feats, ...extra]; link = linkKeys([...byM.keys()], feats); }
        const featRec = new Map([...link].map(([rk, f]) => [f.code, rk]));
        let bf = null;
        if (view.muni) {
          const f = link.get(view.muni.key);
          if (!f) note = `No boundary outline is available for ${esc(view.muni.name)}, so only its table is shown.`;
          else {
            box.innerHTML = '<p class="loading">Loading barangay outlines…</p>';
            try { bf = await brgyFeatures(f.code); } catch { note = 'Barangay outlines could not be loaded right now (they need an internet connection to GitHub). The table is still shown.'; }
            if (my !== token) return;
          }
        }
        if (bf) {
          const brows = D.brgys.filter(b => b.p === view.prov && b.mk === view.muni.key).map(b => ({ ...b, name: b.b, t: tallyOf(b) }));
          const byB = new Map(brows.map(b => [b.bk, b])), bl = link2(byB, bf);
          L = layout(bf);
          items = bf.map(f => ({ key: f.code || f.name, name: f.name, d: pathD(f.geom, L.proj), t: bl.rec.get(f.code || f.name) ? byB.get(bl.rec.get(f.code || f.name)).t : null }));
          const un = brows.filter(b => !bl.link.has(b.bk));
          if (un.length) note = `Not drawn (no matching outline): ${un.slice(0, 8).map(b => `${esc(b.name)} (${b.t.n})`).join(', ')}${un.length > 8 ? ` and ${un.length - 8} more` : ''}.`;
          if (metric === 'rate') note += ' Most barangays have too few samples for a reliable rate – try “Positive cases”.';
          title = view.muni.name; sub = `${metricName()} by barangay.`; tblTitle = `Barangays in ${view.muni.name}`; first = 'Barangay';
          rows = brows;
        } else {
          L = layout(feats);
          items = feats.map(f => { const rk = featRec.get(f.code); return { key: f.code, name: f.name, d: pathD(f.geom, L.proj), t: rk ? byM.get(rk).t : null, mk: rk, mname: rk ? byM.get(rk).m : f.name }; });
          const un = mrows.filter(m => !link.has(m.mk));
          if (un.length) note += `Not drawn (no matching outline): ${un.slice(0, 8).map(m => `${esc(m.m)} (${m.t.n})`).join(', ')}${un.length > 8 ? ` and ${un.length - 8} more` : ''}. They appear in the table.`;
          title = view.prov; sub = `${metricName()} by municipality / city.`;
          if (view.muni) {
            rows = D.brgys.filter(b => b.p === view.prov && b.mk === view.muni.key).map(b => ({ ...b, name: b.b, t: tallyOf(b) }));
            tblTitle = `Barangays in ${view.muni.name}`; first = 'Barangay';
          } else { rows = mrows.map(m => ({ name: m.m, t: m.t, go: m.mk })); tblTitle = `Municipalities in ${view.prov}`; first = 'Municipality / city'; clickable = true; }
          onPick = i => i.mk && (view.muni = { key: i.mk, name: i.mname }, draw());
        }
      }
      if (my !== token) return;
      const sc = makeScale(items.map(i => valueOf(i.t)).filter(v => v != null));
      const paths = items.map(i => { const c = sc.cls(valueOf(i.t)); return `<path data-k="${esc(i.key)}" class="${c < 0 ? 'nodata' : ''}" ${c < 0 ? '' : `style="fill:var(--map${c})"`} d="${i.d}"></path>`; }).join('');
      box.innerHTML = `<svg class="map" viewBox="0 0 ${L.W} ${L.Ht}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Heat map of ${esc(title)}">${paths}</svg>`; box.append(tip);
      if (showLabs) addLabMarkers(box, L, view.prov, D.labs || []);
      $('#legend', host).innerHTML = `<div class="map-legend"><b>${metricName()}</b>${sc.labels.map((l, i) => `<span><i style="background:var(--map${i})"></i> ${l}</span>`).join('')}<span><i style="background:var(--nodata)"></i> ${metric === 'rate' ? `no samples / fewer than ${MIN_TESTED} tested` : 'no samples'}</span></div>`;
      $('#map-title', host).textContent = title; $('#map-sub', host).textContent = sub; $('#map-note', host).innerHTML = note;
      $('#tbl-title', host).textContent = tblTitle; $('#tbl-sub', host).textContent = clickable ? 'Click a row, or a shape on the map, to zoom in.' : (view.muni ? 'Barangay is the lowest level. Positivity is hidden where fewer than 5 samples were tested.' : '');
      const byKey = new Map(items.map(i => [i.key, i]));
      box.onmousemove = e => {
        const lg = e.target.closest('g.lab');
        if (lg) {
          const lab = (D.labs || [])[+lg.dataset.lab], r0 = box.getBoundingClientRect();
          tip.innerHTML = `<b>${esc(lab.name)}</b><br>${esc(lab.address || [lab.muni, lab.prov].filter(Boolean).join(', '))}${lab.phone ? `<br>Tel. ${esc(lab.phone)}` : ''}${lab.type ? `<br><i>${esc(lab.type)}</i>` : ""}${lab.reports ? `<br>${fmtInt(lab.n)} samples received` : ""}`; tip.hidden = false;
          tip.style.left = Math.min(e.clientX - r0.left + 12, r0.width - 200) + 'px'; tip.style.top = (e.clientY - r0.top + 12) + 'px'; return;
        }
        const p = e.target.closest('path'); if (!p) { tip.hidden = true; return; }
        const i = byKey.get(p.dataset.k); if (!i) return; const r = box.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(i.name)}</b><br>${i.t ? `${fmtInt(i.t.n)} samples · ${fmtInt(i.t.pos)} positive<br>Positivity ${i.t.tested >= MIN_TESTED ? `${fmtPct(i.t.rate)} (${i.t.pos} of ${i.t.tested} tested)${i.t.tested < 30 ? ' – few tested, unreliable' : ''}` : `not shown (${i.t.pos} of ${i.t.tested} tested)`}` : 'No samples'}`;
        tip.hidden = false; tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
      };
      box.onmouseleave = () => tip.hidden = true;
      box.onclick = e => { const p = e.target.closest('path'); if (p && onPick) onPick(byKey.get(p.dataset.k)); };
      table(rows, first, clickable);
      $('#tbl', host).onclick = e => {
        const th = e.target.closest('th[data-k]');
        if (th) { const k = th.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; } table(rows, first, clickable); return; }
        const tr = e.target.closest('tr[data-go]'); if (!tr) return;
        if (!view.region && !view.prov) { view = { region: tr.dataset.go, prov: null, muni: null }; draw(); }
        else if (!view.prov) { view = { region: view.region, prov: tr.dataset.go, muni: null }; draw(); }
        else if (!view.muni) { const m = D.munis.find(x => x.p === view.prov && x.mk === tr.dataset.go); view.muni = { key: tr.dataset.go, name: m ? m.m : tr.dataset.go }; draw(); }
      };
    } catch (e) { console.error(e); box.innerHTML = `<p class="empty">The map could not be drawn. Please refresh the page.</p>`; }
  }
  const link2 = (byB, bf) => { const link = linkKeys([...byB.keys()], bf.map(f => ({ ...f, code: f.code || f.name }))); return { link, rec: new Map([...link].map(([rk, f]) => [f.code || f.name, rk])) }; };

  host.addEventListener('click', e => {
    const c = e.target.closest('button[data-crumb]'); if (!c) return;
    if (c.dataset.crumb === 'country') view = { region: null, prov: null, muni: null };
    else if (c.dataset.crumb === 'region') view = { region: view.region, prov: null, muni: null };
    else view.muni = null;
    draw();
  });
  provinceFinder($('#prov-finder', host), D.provinces, x => { view = { region: x.r, prov: x.p, muni: null }; draw(); });
  $('#showlabs', host).onchange = e => { showLabs = e.target.checked; draw(); };
  $('#metric', host).onclick = e => { const m = e.target.dataset.m; if (m) { metric = m; draw(); } };
  draw();
}
