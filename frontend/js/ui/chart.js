(function (global) {
  "use strict";
  const { formatINR } = global.fmt;

  function svgEl(tag, attrs) {
    let s = `<${tag} `;
    Object.keys(attrs || {}).forEach((k) => { s += `${k}="${attrs[k]}" `; });
    return s + "/>";
  }

  // ---------------------------------------------------------------- line
  function lineChart({ series, width = 640, height = 220, padding = { t: 16, r: 16, b: 28, l: 44 }, yFormat }) {
    const allPoints = series.flatMap((s) => s.points);
    const maxY = Math.max(1, ...allPoints.map((p) => p.y)) * 1.15;
    const minY = Math.min(0, ...allPoints.map((p) => p.y));
    const n = series[0] ? series[0].points.length : 0;
    const innerW = width - padding.l - padding.r;
    const innerH = height - padding.t - padding.b;
    const xAt = (i) => padding.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => padding.t + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const y = padding.t + innerH * (1 - f);
      const val = minY + (maxY - minY) * f;
      return `<line x1="${padding.l}" y1="${y}" x2="${width - padding.r}" y2="${y}" class="chart-grid" />
              <text x="${padding.l - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${yFormat ? yFormat(val) : Math.round(val)}</text>`;
    }).join("");

    const xLabels = series[0] ? series[0].points.map((p, i) =>
      `<text x="${xAt(i)}" y="${height - 6}" class="chart-axis-label" text-anchor="middle">${p.label || ""}</text>`).join("") : "";

    const paths = series.map((s) => {
      const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(" ");
      const area = `M ${xAt(0).toFixed(1)} ${yAt(minY).toFixed(1)} ` + s.points.map((p, i) => `L ${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(" ") + ` L ${xAt(s.points.length - 1).toFixed(1)} ${yAt(minY).toFixed(1)} Z`;
      const dots = s.points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="3.5" fill="${s.color}" class="chart-dot"><title>${p.label}: ${yFormat ? yFormat(p.y) : p.y}</title></circle>`).join("");
      return `<path d="${area}" fill="${s.color}" opacity="0.08"></path>
              <path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
              ${dots}`;
    }).join("");

    return `<svg viewBox="0 0 ${width} ${height}" class="chart chart--line" role="img" aria-label="Line chart" preserveAspectRatio="xMidYMid meet">
      ${gridLines}${paths}${xLabels}
    </svg>`;
  }

  // ----------------------------------------------------------------- bar
  function barChart({ categories, series, width = 640, height = 220, padding = { t: 16, r: 16, b: 28, l: 44 }, yFormat, stacked = false }) {
    const n = categories.length;
    const innerW = width - padding.l - padding.r;
    const innerH = height - padding.t - padding.b;
    const groupW = innerW / n;
    const maxStack = stacked
      ? Math.max(1, ...categories.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0)))
      : Math.max(1, ...series.flatMap((s) => s.values));
    const maxY = maxStack * 1.15;
    const yAt = (v) => padding.t + innerH - (v / maxY) * innerH;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const y = padding.t + innerH * (1 - f);
      return `<line x1="${padding.l}" y1="${y}" x2="${width - padding.r}" y2="${y}" class="chart-grid" />
              <text x="${padding.l - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${yFormat ? yFormat(maxY * f) : Math.round(maxY * f)}</text>`;
    }).join("");

    let bars = "";
    categories.forEach((cat, i) => {
      const groupX = padding.l + i * groupW;
      if (stacked) {
        let yCursor = 0;
        series.forEach((s) => {
          const v = s.values[i] || 0;
          const barW = groupW * 0.5;
          const x = groupX + (groupW - barW) / 2;
          const yTop = yAt(yCursor + v), yBottom = yAt(yCursor);
          bars += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${(yBottom - yTop).toFixed(1)}" fill="${s.color}" rx="3"><title>${s.label} — ${cat}: ${yFormat ? yFormat(v) : v}</title></rect>`;
          yCursor += v;
        });
      } else {
        const barW = (groupW * 0.62) / series.length;
        series.forEach((s, si) => {
          const v = s.values[i] || 0;
          const x = groupX + (groupW - barW * series.length) / 2 + si * barW;
          const yTop = yAt(v), yBottom = yAt(0);
          bars += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${(barW - 3).toFixed(1)}" height="${Math.max(1, yBottom - yTop).toFixed(1)}" fill="${s.color}" rx="3"><title>${s.label} — ${cat}: ${yFormat ? yFormat(v) : v}</title></rect>`;
        });
      }
      bars += `<text x="${(groupX + groupW / 2).toFixed(1)}" y="${height - 6}" class="chart-axis-label" text-anchor="middle">${cat}</text>`;
    });

    return `<svg viewBox="0 0 ${width} ${height}" class="chart chart--bar" role="img" aria-label="Bar chart" preserveAspectRatio="xMidYMid meet">
      ${gridLines}${bars}
    </svg>`;
  }

  // --------------------------------------------------------------- donut
  function donutChart({ segments, size = 200, thickness = 26, centerLabel, centerSub }) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const r = size / 2 - thickness / 2;
    const cx = size / 2, cy = size / 2;
    let angle = -90;
    const arcs = segments.map((seg) => {
      const frac = seg.value / total;
      const start = angle;
      const end = angle + frac * 360;
      angle = end;
      const large = end - start > 180 ? 1 : 0;
      const toXY = (deg) => {
        const rad = (deg * Math.PI) / 180;
        return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
      };
      const [x1, y1] = toXY(start), [x2, y2] = toXY(end);
      return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"
        fill="none" stroke="${seg.color}" stroke-width="${thickness}" class="donut-seg">
        <title>${seg.label}: ${formatINR(seg.value)} (${Math.round(frac * 100)}%)</title></path>`;
    }).join("");

    return `<svg viewBox="0 0 ${size} ${size}" class="chart chart--donut" role="img" aria-label="Breakdown chart">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${thickness}" opacity="0.35"></circle>
      ${arcs}
      ${centerLabel ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center-value">${centerLabel}</text>` : ""}
      ${centerSub ? `<text x="${cx}" y="${cy + 18}" text-anchor="middle" class="donut-center-sub">${centerSub}</text>` : ""}
    </svg>`;
  }

  function progressRing({ pct, size = 56, thickness = 6, color = "var(--accent)" }) {
    const r = size / 2 - thickness / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.min(100, Math.max(0, pct));
    const offset = c * (1 - clamped / 100);
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="progress-ring">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${thickness}"></circle>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"
        transform="rotate(-90 ${size / 2} ${size / 2})" class="progress-ring__value"></circle>
    </svg>`;
  }

  global.Chart = { line: lineChart, bar: barChart, donut: donutChart, ring: progressRing };
})(window);
