// Small helpers for the public dashboard.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtInt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
export const fmtPct = (x, d = 1) => x == null ? '—' : (x * 100).toFixed(d) + '%';
export const fmtShare = x => x == null ? '—' : (x * 100).toFixed(x < 0.01 ? 2 : 1) + '%';   // two decimals under 1% so small places do not read as 0.0%
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = iso => iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '—';
export const $ = (s, r = document) => r.querySelector(s);

/** Same name-matching key the private dashboard uses, so place names line up. */
export function nk(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/\bcity of\b/g, ' ').replace(/\bmunicipality of\b/g, ' ').replace(/\bcity\b/g, ' ')
    .replace(/\bsta\.\s*|\bsta\s/g, 'santa ').replace(/\bsto\.\s*|\bsto\s/g, 'santo ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export const tallyOf = o => { const tested = o.pos + o.neg; return { ...o, tested, rate: tested ? o.pos / tested : null }; };

export function cards(items) {
  return `<div class="cards">${items.map(c => `<div class="card ${c.tone || ''}"><div class="card-label">${esc(c.label)}</div><div class="card-value">${c.value}</div>${c.sub ? `<div class="card-sub">${c.sub}</div>` : ''}</div>`).join('')}</div>`;
}
/** Clearly labelled breakdown table: samples, % of all samples, positive, negative, positivity rate (+ the counts behind it). */
export function statTable(items, firstLabel, total) {
  const rows = items.map(({ name, t }) => {
    const share = total ? t.n / total : null;
    const rate = t.tested < 5
      ? `<span class="muted" title="Fewer than 5 tested – rate not shown">–</span> <small class="muted">${t.pos}/${t.tested}</small>`
      : `<b style="color:var(--c-pos)">${fmtPct(t.rate, 1)}</b> <small class="muted" title="${t.pos} positive of ${t.tested} tested">${t.pos}/${t.tested}</small>${t.tested < 30 ? `<span class="muted" title="Only ${t.tested} tested – unreliable">*</span>` : ''}`;
    return `<tr><td>${esc(name)}</td><td class="num">${fmtInt(t.n)}</td><td class="num">${fmtShare(share)}</td><td class="num">${fmtInt(t.pos)}</td><td class="num">${fmtInt(t.neg)}</td><td class="num">${rate}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(firstLabel)}</th>
    <th class="num" title="Samples submitted in this row">Samples</th>
    <th class="num" title="This row's samples ÷ all samples">% of all samples</th>
    <th class="num">Positive</th><th class="num">Negative</th>
    <th class="num" title="Positive ÷ (positive + negative)">Positivity rate<br><small>(positive ÷ tested)</small></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sub" style="margin-top:6px"><b>% of all samples</b> = this row's share of every sample. <b>Positivity rate</b> = positive ÷ tested (positive + negative); the small figure is positive/tested. "–" = fewer than 5 tested; * = fewer than 30 tested, so the rate is unreliable.</p>`;
}
export function barList(items) {
  const m = Math.max(1, ...items.map(i => i.value || 0));
  return `<div class="barlist">${items.map(i => `<div class="bl-row"><div class="bl-label">${esc(i.label)}</div><div class="bl-track"><div class="bl-fill" style="width:${(i.value || 0) / m * 100}%"></div></div><div class="bl-val">${i.text}</div></div>`).join('')}</div>`;
}
export function section(title, body, sub = '') {
  return `<section class="panel"><div class="panel-h"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>${body}</section>`;
}
