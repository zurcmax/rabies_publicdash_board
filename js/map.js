// Heat maps: province -> municipality -> barangay. Reads only the aggregate counts in public-data.json.
import { esc, fmtInt, fmtPct, nk, tallyOf, $ } from './fmt.js';

const REGION_FILES = ['100000000', '200000000', '300000000', '400000000', '500000000', '600000000', '700000000', '800000000', '900000000', '1000000000', '1100000000', '1200000000', '1300000000', '1400000000', '1600000000', '1700000000', '1900000000'];
const NCR_CODES = ['1303900000', '1307400000', '1307500000', '1307600000'];
const GH = 'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/municities';
const W = 700, MIN_TESTED = 5;

const geo = { country: null, prov: {}, brgy: {} };
let metric = 'rate', showLabs = true;
let view = { prov: null, muni: null };

const getJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const provNameOf = p => /^NCR/.test(p.adm2_en || '') ? 'Metro Manila' : (p.adm2_en || '');

async function countryFeatures() {
  if (!geo.country) {
    const fcs = await Promise.all(REGION_FILES.map(f => getJSON(`data/geo/reg/${f}.json`)));
    geo.country = fcs.flatMap(fc => fc.features.map(ft => ({ code: String(ft.properties.adm2_psgc), name: provNameOf(ft.properties), rawName: ft.properties.adm2_en || '', geom: ft.geometry })));
  }
  return geo.country;
}
async function provFeatures(prov) {
  if (geo.prov[prov]) return geo.prov[prov];
  const feats = await countryFeatures();
  const codes = prov === 'Metro Manila' ? NCR_CODES : feats.filter(f => f.name === prov).map(f => f.code);
  const fcs = await Promise.all(codes.map(c => getJSON(`data/geo/prov/${c}.json`)));
  return geo.prov[prov] = fcs.flatMap(fc => fc.features.map(ft => ({ code: String(ft.properties.adm3_psgc), name: ft.properties.adm3_en || '', geom: ft.geometry })));
}
async function brgyFeatures(code) {
  if (geo.brgy[code]) return geo.brgy[code];
  let fc;
  try { fc = await getJSON(`${GH}/medres/bgysubmuns-municity-${code}.0.01.json`); }
  catch { fc = await getJSON(`${GH}/lowres/bgysubmuns-municity-${code}.0.001.json`); }
  return geo.brgy[code] = fc.features.map(ft => ({ code: String(ft.properties.adm4_psgc || ''), name: ft.properties.adm4_en || '', geom: ft.geometry }));
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

// ---- projection ----
const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function eachPt(geom, fn) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const p of polys) for (const ring of p) for (const pt of ring) fn(pt);
}
function layout(feats) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of feats) eachPt(f.geom, ([lon, lat]) => { const y = merc(lat); if (lon < x0) x0 = lon; if (lon > x1) x1 = lon; if (y < y0) y0 = y; if (y > y1) y1 = y; });
  const k = 180 / Math.PI, s = W / (x1 - x0), H = Math.max(120, Math.round((y1 - y0) * k * s)), pad = 6;
  return { proj: ([lon, lat]) => [(lon - x0) * s + pad, (y1 - merc(lat)) * k * s + pad], W: W + pad * 2, Ht: H + pad * 2 };
}
function pathD(geom, proj) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
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

export function renderMap(host, D) {
  const provT = new Map(D.provinces.map(p => [p.p, tallyOf(p)]));
  host.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <div class="seg" id="metric" role="group" aria-label="Map measure"><button data-m="rate">Positivity rate</button><button data-m="pos">Positive cases</button><button data-m="n">Samples tested</button></div>
      <label class="row" style="gap:6px"><input type="checkbox" id="showlabs" ${showLabs ? 'checked' : ''}> Show laboratories</label>
    </div>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr))">
      <section class="panel"><div class="panel-h"><div><h2 id="map-title"></h2><p class="sub" id="map-sub"></p></div><div class="crumbs" id="crumbs"></div></div>
        <div class="mapbox" id="mapbox"><p class="loading">Loading map…</p></div><div id="legend" style="margin-top:8px"></div><p class="sub" id="map-note" style="margin-top:6px"></p></section>
      <section class="panel"><div class="panel-h"><div><h2 id="tbl-title"></h2><p class="sub" id="tbl-sub"></p></div></div><div id="tbl"></div></section>
    </div>`;
  let token = 0, sortKey = 'n', sortDir = -1;

  function table(rows, firstLabel, clickable) {
    const sorted = [...rows].sort((a, b) => {
      const g = r => sortKey === 'name' ? r.name : sortKey === 'rate' ? (r.t.tested >= MIN_TESTED ? r.t.rate : -1) : r.t[sortKey];
      const x = g(a), y = g(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
    });
    const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${sortKey === k ? 'sorted' : ''}" data-k="${k}" tabindex="0">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    $('#tbl', host).innerHTML = `<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="tbl"><thead><tr>${th('name', firstLabel)}${th('n', 'Samples', 1)}${th('pos', 'Positive', 1)}${th('rate', 'Positivity', 1)}</tr></thead><tbody>
      ${sorted.map(r => `<tr ${clickable && r.go ? `data-go="${esc(r.go)}" style="cursor:pointer"` : ''}><td class="wrap">${esc(r.name)}</td><td class="num">${fmtInt(r.t.n)}</td><td class="num">${fmtInt(r.t.pos)}</td><td class="num">${r.t.tested >= MIN_TESTED ? fmtPct(r.t.rate) : '<span class="muted" title="Fewer than 5 tested – rate not shown">–</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function draw() {
    const my = ++token;
    host.querySelectorAll('#metric button').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    const box = $('#mapbox', host);
    $('#crumbs', host).innerHTML = `<button data-crumb="country">Philippines</button>${view.prov ? ` › <button data-crumb="prov">${esc(view.prov)}</button>` : ''}${view.muni ? ` › <b>${esc(view.muni.name)}</b>` : ''}`;
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
    try {
      let items = [], rows = [], title, sub, note = '', tblTitle, first, L, onPick = null, clickable = false;
      if (!view.prov) {
        const feats = await countryFeatures(); if (my !== token) return;
        L = geo.cl ||= layout(feats); geo.cd ||= feats.map(f => pathD(f.geom, L.proj));
        items = feats.map((f, i) => ({ key: f.code, name: f.name || f.rawName, d: geo.cd[i], t: f.name ? provT.get(f.name) || null : null, go: f.name }));
        title = 'Provinces'; sub = `${metricName()} by province.`; tblTitle = 'Provinces'; first = 'Province'; clickable = true;
        rows = [...provT].map(([p, t]) => ({ name: p, t, go: p }));
        onPick = i => i.go && provT.has(i.go) && (view = { prov: i.go, muni: null }, draw());
      } else {
        const feats = await provFeatures(view.prov); if (my !== token) return;
        const mrows = D.munis.filter(m => m.p === view.prov).map(m => ({ ...m, t: tallyOf(m) }));
        const byM = new Map(mrows.map(m => [m.mk, m]));
        const link = linkKeys([...byM.keys()], feats), featRec = new Map([...link].map(([rk, f]) => [f.code, rk]));
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
          tip.innerHTML = `<b>${esc(lab.name)}</b><br>${esc([lab.muni, lab.prov].filter(Boolean).join(', '))}<br>${fmtInt(lab.n)} samples received`; tip.hidden = false;
          tip.style.left = Math.min(e.clientX - r0.left + 12, r0.width - 200) + 'px'; tip.style.top = (e.clientY - r0.top + 12) + 'px'; return;
        }
        const p = e.target.closest('path'); if (!p) { tip.hidden = true; return; }
        const i = byKey.get(p.dataset.k); if (!i) return; const r = box.getBoundingClientRect();
        tip.innerHTML = `<b>${esc(i.name)}</b><br>${i.t ? `${fmtInt(i.t.n)} samples · ${fmtInt(i.t.pos)} positive<br>Positivity ${i.t.tested >= MIN_TESTED ? fmtPct(i.t.rate) : 'not shown (few tested)'}` : 'No samples'}`;
        tip.hidden = false; tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
      };
      box.onmouseleave = () => tip.hidden = true;
      box.onclick = e => { const p = e.target.closest('path'); if (p && onPick) onPick(byKey.get(p.dataset.k)); };
      table(rows, first, clickable);
      $('#tbl', host).onclick = e => {
        const th = e.target.closest('th[data-k]');
        if (th) { const k = th.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' ? 1 : -1; } table(rows, first, clickable); return; }
        const tr = e.target.closest('tr[data-go]'); if (!tr) return;
        if (!view.prov) { view = { prov: tr.dataset.go, muni: null }; draw(); }
        else if (!view.muni) { const m = D.munis.find(x => x.p === view.prov && x.mk === tr.dataset.go); view.muni = { key: tr.dataset.go, name: m ? m.m : tr.dataset.go }; draw(); }
      };
    } catch (e) { console.error(e); box.innerHTML = `<p class="empty">The map could not be drawn. Please refresh the page.</p>`; }
  }
  const link2 = (byB, bf) => { const link = linkKeys([...byB.keys()], bf.map(f => ({ ...f, code: f.code || f.name }))); return { link, rec: new Map([...link].map(([rk, f]) => [f.code || f.name, rk])) }; };

  host.addEventListener('click', e => {
    const c = e.target.closest('button[data-crumb]'); if (!c) return;
    if (c.dataset.crumb === 'country') view = { prov: null, muni: null }; else view.muni = null;
    draw();
  });
  $('#showlabs', host).onchange = e => { showLabs = e.target.checked; draw(); };
  $('#metric', host).onclick = e => { const m = e.target.dataset.m; if (m) { metric = m; draw(); } };
  draw();
}
