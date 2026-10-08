// Dependency-free SVG/HTML charts. Colours come from CSS variables so light/dark themes both work.
import { esc, fmtInt, fmtPct } from './fmt.js';

const niceMax = v => { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
const W = 720, H = 300, ML = 46, MR = 46, MT = 14, MB = 44;

export function legend(items) {
  return `<div class="legend">${items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.name)}</span>`).join('')}</div>`;
}
function xlabels(labels, n, plotW, rotate) {
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(plotW / (rotate ? 22 : 56)))));
  return labels.map((l, i) => i % step === 0 || i === labels.length - 1
    ? `<text class="ax" x="${ML + (i + 0.5) * plotW / n}" y="${H - MB + 16}" text-anchor="${rotate ? 'end' : 'middle'}" ${rotate ? `transform="rotate(-35 ${ML + (i + 0.5) * plotW / n} ${H - MB + 16})"` : ''}>${esc(l)}</text>` : '').join('');
}

/** Vertical (optionally stacked) columns, plus an optional line on a right-hand percentage axis. */
export function columnChart({ labels, series, stacked = true, line = null, yFmt = fmtInt, height = H, rotate = false }) {
  const n = labels.length; if (!n) return '<p class="empty">No data in this range.</p>';
  const plotW = W - ML - MR, plotH = height - MT - MB;
  const totals = labels.map((_, i) => stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(...series.map(s => s.values[i] || 0)));
  const ymax = niceMax(Math.max(...totals, 1));
  const y = v => MT + plotH - v / ymax * plotH;
  const bw = plotW / n, gap = Math.min(6, bw * 0.25);
  let bars = '';
  labels.forEach((lab, i) => {
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i] || 0; if (!v) return;
      const w = stacked ? bw - gap : (bw - gap) / series.length;
      const x = ML + i * bw + gap / 2 + (stacked ? 0 : si * w);
      const y0 = stacked ? y(acc + v) : y(v), h = stacked ? y(acc) - y(acc + v) : y(0) - y(v);
      bars += `<rect x="${x}" y="${y0}" width="${Math.max(1, w)}" height="${Math.max(0, h)}" rx="1.5" style="fill:${s.color}"><title>${esc(lab)} · ${esc(s.name)}: ${yFmt(v)}</title></rect>`;
      if (stacked) acc += v;
    });
  });
  let grid = '';
  for (let t = 0; t <= 4; t++) { const v = ymax * t / 4; grid += `<line class="grid" x1="${ML}" x2="${W - MR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${ML - 6}" y="${y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`; }
  let lineSvg = '';
  if (line) {
    const vals = line.values; const lmax = niceMax(Math.max(0.05, ...vals.filter(v => v != null)) * 1.05);
    const ly = v => MT + plotH - v / lmax * plotH;
    let d = '', dots = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      const x = ML + (i + 0.5) * bw; d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${ly(v).toFixed(1)} `; pen = true;
      dots += `<circle cx="${x}" cy="${ly(v)}" r="3" style="fill:${line.color}"><title>${esc(labels[i])} · ${esc(line.name)}: ${fmtPct(v)}</title></circle>`;
    });
    lineSvg = `<path d="${d}" fill="none" stroke-width="2.2" style="stroke:${line.color}"/>${dots}`;
    for (let t = 0; t <= 4; t++) { const v = lmax * t / 4; lineSvg += `<text class="ax" x="${W - MR + 6}" y="${ly(v) + 4}" text-anchor="start" style="fill:${line.color}">${Math.round(v * 100)}%</text>`; }
  }
  const lg = legend([...series.map(s => ({ name: s.name, color: s.color })), ...(line ? [{ name: line.name + ' (right axis)', color: line.color }] : [])]);
  return `${lg}<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" preserveAspectRatio="xMidYMid meet">${grid}${bars}${lineSvg}${xlabels(labels, n, plotW, rotate)}</svg>`;
}

/** Several lines over shared category labels. */
export function lineChart({ labels, series, yFmt = fmtInt, yMax, height = H, rotate = false }) {
  const n = labels.length; if (!n) return '<p class="empty">No data in this range.</p>';
  const plotW = W - ML - MR, plotH = height - MT - MB;
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const ymax = yMax ?? niceMax(Math.max(...all, 0.0001));
  const y = v => MT + plotH - v / ymax * plotH, x = i => ML + (i + 0.5) * plotW / n;
  let grid = '';
  for (let t = 0; t <= 4; t++) { const v = ymax * t / 4; grid += `<line class="grid" x1="${ML}" x2="${W - MR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${ML - 6}" y="${y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`; }
  const paths = series.map(s => {
    let d = '', dots = '', pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true;
      dots += `<circle cx="${x(i)}" cy="${y(v)}" r="3" style="fill:${s.color}"><title>${esc(labels[i])} · ${esc(s.name)}: ${yFmt(v)}</title></circle>`;
    });
    return `<path d="${d}" fill="none" stroke-width="2.2" stroke-linejoin="round" style="stroke:${s.color}${s.dash ? ';stroke-dasharray:5 4' : ''}"/>${dots}`;
  }).join('');
  return `${legend(series.map(s => ({ name: s.name, color: s.color })))}<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${grid}${paths}${xlabels(labels, n, plotW, rotate)}</svg>`;
}

/** Table coloured like a heat map. cells[r][c] = {v: number|null, text, title}. */
export function heatTable({ rowLabels, colLabels, cells, rowHead = '', max, hue = 'var(--heat)' }) {
  const vals = cells.flat().map(c => c && c.v).filter(v => v != null);
  const m = max ?? Math.max(...vals, 0.0001);
  return `<div class="tbl-wrap"><table class="tbl heat"><thead><tr><th>${esc(rowHead)}</th>${colLabels.map(c => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead><tbody>
    ${rowLabels.map((rl, ri) => `<tr><th class="rowh">${esc(rl)}</th>${cells[ri].map(c => {
      if (!c || c.v == null) return `<td class="num muted">${c && c.text ? c.text : '–'}</td>`;
      const a = Math.min(1, c.v / m);
      return `<td class="num" style="background:color-mix(in srgb, ${hue} ${Math.round(a * 85)}%, transparent)" title="${esc(c.title || '')}">${c.text}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function spark(values, { w = 90, h = 24, color = 'var(--c-pos)' } = {}) {
  if (!values.length) return '';
  const m = Math.max(...values, 1), n = values.length;
  const pts = values.map((v, i) => `${(i / Math.max(1, n - 1) * (w - 4) + 2).toFixed(1)},${(h - 2 - v / m * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke-width="1.8" style="stroke:${color}"/></svg>`;
}

export const SERIES_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
export const RESULT_COLORS = { Positive: 'var(--c-pos)', Negative: 'var(--c-neg)', Inconclusive: 'var(--c-inc)', 'Unfit for testing': 'var(--c-oth)', 'No result': 'var(--c-oth)' };
