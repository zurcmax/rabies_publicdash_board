// Small helpers for the public dashboard.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtInt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
export const fmtPct = (x, d = 1) => x == null ? '—' : (x * 100).toFixed(d) + '%';
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
export function barList(items) {
  const m = Math.max(1, ...items.map(i => i.value || 0));
  return `<div class="barlist">${items.map(i => `<div class="bl-row"><div class="bl-label">${esc(i.label)}</div><div class="bl-track"><div class="bl-fill" style="width:${(i.value || 0) / m * 100}%"></div></div><div class="bl-val">${i.text}</div></div>`).join('')}</div>`;
}
export function section(title, body, sub = '') {
  return `<section class="panel"><div class="panel-h"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>${body}</section>`;
}
