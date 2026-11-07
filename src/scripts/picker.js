import * as d3 from 'd3';

// ====================================================================
// STATE + CONSTANTS
// ====================================================================

const state = {
  data: null,
  currency: (localStorage.getItem('picker-currency') || 'aud'),
  xAxis: 'cost_bracket',
  yAxis: 'benchmark',
  benchmark: null,
  filters: {
    minVram: 0,
    minCc: 5.0,       // LocoBench floor — Maxwell inclusive
    tensorCores: 'any',
    maxCost: 5,
    classFilter: 'both',
    showEstimated: true,
    showPareto: true,
  },
  selectedGpu: null,
};

// Direction of "better" per axis — drives the Pareto frontier.
const AXIS_BETTER = {
  cost_bracket: 'min',
  vram_gb: 'max',
  bandwidth_gb_s: 'max',
  power_draw_w: 'min',
  release_year: 'max',
  cc: 'max',
  benchmark: 'max',     // driven by benchmark.higher_is_better
};

const AXIS_LABELS = {
  cost_bracket: 'Cost bracket',
  vram_gb: 'VRAM (GB)',
  bandwidth_gb_s: 'Bandwidth (GB/s)',
  power_draw_w: 'Power draw (W)',
  release_year: 'Release year',
  cc: 'Compute capability',
};

const AXIS_UNITS = {
  vram_gb: 'GB',
  bandwidth_gb_s: 'GB/s',
  power_draw_w: 'W',
  release_year: '',
  cc: '',
};

const CONFIDENCE_LABELS = {
  measured: 'MEASURED',
  community: 'COMMUNITY',
  estimated: 'ESTIMATED',
};

// ====================================================================
// LOAD DATA
// ====================================================================

async function init() {
  // Try fetch first so a served picker-data.json wins; fall back to the
  // embedded inline copy when the browser blocks file:// fetches.
  try {
    const res = await fetch('./picker-data.json');
    if (!res.ok) throw new Error('fetch returned ' + res.status);
    state.data = await res.json();
    console.log('picker-data loaded via fetch');
  } catch (fetchErr) {
    try {
      const embedded = document.getElementById('embedded-picker-data');
      if (!embedded) throw new Error('No embedded data and fetch failed: ' + fetchErr.message);
      state.data = JSON.parse(embedded.textContent);
      console.log('picker-data loaded from inline fallback (fetch blocked by browser)');
    } catch (parseErr) {
      document.body.innerHTML = `<div style="padding:40px;font-family:IBM Plex Mono,monospace;color:#f97583">
        <h2>Failed to load picker data</h2>
        <p>${parseErr.message}</p>
        <p>The page has an embedded fallback copy of picker-data.json. If this message is showing, the embedded block is missing or malformed.</p>
      </div>`;
      return;
    }
  }

  state.benchmark = state.data.benchmarks[0].id;

  wireUI();
  populateBenchmarkDropdown();
  populateLegend();
  render();
}

init();

// ====================================================================
// CURRENCY
// ====================================================================

function formatCostBracket(code, ccyCode) {
  const bracket = state.data.cost_brackets.find(b => b.code === code);
  if (!bracket) return code;
  const ccy = state.data.currencies[ccyCode];
  const mult = ccy.from_usd;
  const low = Math.round(bracket.usd_low * mult);
  const high = bracket.usd_high == null ? null : Math.round(bracket.usd_high * mult);
  const range = high == null ? `${low}+` : `${low}–${high}`;
  return `${code}  ${ccy.symbol}${range} ${ccy.code}`;
}

function bracketTickLabel(code) {
  return formatCostBracket(code, state.currency);
}

// ====================================================================
// WIRE UP UI EVENTS
// ====================================================================

function wireUI() {
  document.querySelectorAll('.currency-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const ccy = btn.dataset.ccy;
      if (ccy === state.currency) return;
      state.currency = ccy;
      localStorage.setItem('picker-currency', ccy);
      document.querySelectorAll('.currency-toggle button').forEach(b => b.classList.toggle('active', b.dataset.ccy === ccy));
      render();
    });
    btn.classList.toggle('active', btn.dataset.ccy === state.currency);
  });

  document.getElementById('x-axis').value = state.xAxis;
  document.getElementById('x-axis').addEventListener('change', e => { state.xAxis = e.target.value; render(); });

  document.getElementById('y-axis').value = state.yAxis;
  document.getElementById('y-axis').addEventListener('change', e => { state.yAxis = e.target.value; render(); });

  document.getElementById('benchmark').addEventListener('change', e => { state.benchmark = e.target.value; render(); });

  document.getElementById('f-min-vram').addEventListener('input', e => {
    state.filters.minVram = +e.target.value;
    document.getElementById('readout-vram').textContent = `${e.target.value} GB`;
    render();
  });

  document.getElementById('f-min-cc').addEventListener('change', e => {
    state.filters.minCc = parseFloat(e.target.value) || 0;
    const lbl = e.target.options[e.target.selectedIndex].text;
    document.getElementById('readout-cc').textContent = lbl.replace(/\s*\(.*\)/, '').toLowerCase();
    render();
  });

  document.querySelectorAll('input[name="tc"]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.filters.tensorCores = document.querySelector('input[name="tc"]:checked').value;
      document.getElementById('readout-tc').textContent = state.filters.tensorCores;
      render();
    });
  });

  document.getElementById('f-max-cost').addEventListener('input', e => {
    state.filters.maxCost = +e.target.value;
    document.getElementById('readout-cost').textContent = '$'.repeat(+e.target.value);
    render();
  });

  document.querySelectorAll('input[name="class"]').forEach(inp => {
    inp.addEventListener('change', () => {
      state.filters.classFilter = document.querySelector('input[name="class"]:checked').value;
      render();
    });
  });

  document.getElementById('f-show-est').addEventListener('change', e => {
    state.filters.showEstimated = e.target.checked;
    render();
  });

  document.getElementById('f-show-pareto').addEventListener('change', e => {
    state.filters.showPareto = e.target.checked;
    render();
  });

  document.getElementById('shortcut-apply').addEventListener('click', () => applyShortcut());
  document.getElementById('shortcut-reset').addEventListener('click', () => resetFilters());

  document.getElementById('detail-close').addEventListener('click', () => {
    state.selectedGpu = null;
    document.getElementById('detail').classList.remove('visible');
    render();
  });

  // initial readout labels
  document.getElementById('readout-cost').textContent = '$'.repeat(state.filters.maxCost);
  document.getElementById('readout-cc').textContent = 'maxwell+';
  document.getElementById('f-min-cc').value = String(state.filters.minCc);
}

function populateBenchmarkDropdown() {
  const sel = document.getElementById('benchmark');
  sel.innerHTML = '';
  state.data.benchmarks.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.display_name;
    sel.appendChild(opt);
  });
  sel.value = state.benchmark;
}

function populateLegend() {
  const el = document.getElementById('legend-arch');
  el.innerHTML = '';
  const groups = [
    { key: 'pascal_consumer', label: 'Pascal (consumer)' },
    { key: 'turing_consumer', label: 'Turing' },
    { key: 'ampere_consumer', label: 'Ampere' },
    { key: 'ada_consumer', label: 'Ada Lovelace' },
    { key: 'blackwell_consumer', label: 'Blackwell' },
    { key: 'server', label: 'Server / DC' },
  ];
  groups.forEach(g => {
    const color = state.data.architecture_colors[g.key];
    const d = document.createElement('div');
    d.className = 'legend-item';
    d.style.color = color;
    d.innerHTML = `<span class="legend-swatch"></span><span style="color: var(--fg-1)">${g.label}</span>`;
    el.appendChild(d);
  });
}

function applyShortcut() {
  const size = document.getElementById('shortcut-size').value;
  const quant = document.getElementById('shortcut-quant').value;
  if (!size) return;

  const shortcut = state.data.model_shortcuts[size]?.[quant];
  if (!shortcut) return;

  // Set min VRAM
  state.filters.minVram = shortcut.vram_required_gb;
  const slider = document.getElementById('f-min-vram');
  slider.value = shortcut.vram_required_gb;
  document.getElementById('readout-vram').textContent = `${shortcut.vram_required_gb} GB`;

  // Set Y axis to benchmark, switch benchmark
  state.yAxis = 'benchmark';
  document.getElementById('y-axis').value = 'benchmark';

  if (shortcut.matching_benchmark) {
    state.benchmark = shortcut.matching_benchmark;
    document.getElementById('benchmark').value = shortcut.matching_benchmark;
  }

  // Set X to cost by default for the shortcut
  state.xAxis = 'cost_bracket';
  document.getElementById('x-axis').value = 'cost_bracket';

  render();
}

function resetFilters() {
  state.filters = { minVram: 0, minCc: 5.0, tensorCores: 'any', maxCost: 5, classFilter: 'both', showEstimated: true, showPareto: true };
  document.getElementById('f-min-vram').value = 0;
  document.getElementById('readout-vram').textContent = '0 GB';
  document.getElementById('f-min-cc').value = 5.0;
  document.getElementById('readout-cc').textContent = 'maxwell+';
  document.querySelector('input[name="tc"][value="any"]').checked = true;
  document.getElementById('readout-tc').textContent = 'any';
  document.getElementById('f-max-cost').value = 5;
  document.getElementById('readout-cost').textContent = '$$$$$';
  document.querySelector('input[name="class"][value="both"]').checked = true;
  document.getElementById('f-show-est').checked = true;
  document.getElementById('f-show-pareto').checked = true;
  document.getElementById('shortcut-size').value = '';
  render();
}

// ====================================================================
// FILTERING
// ====================================================================

function costBracketRank(code) {
  return code.length;  // "$" = 1, "$$" = 2, ..., "$$$$$" = 5
}

function passesFilters(gpu) {
  if (gpu.vram_gb < state.filters.minVram) return false;
  if (gpu.cc < state.filters.minCc) return false;
  if (state.filters.tensorCores === 'yes' && !gpu.tensor_cores.present) return false;
  if (state.filters.tensorCores === 'no' && gpu.tensor_cores.present) return false;
  if (costBracketRank(gpu.cost_bracket) > state.filters.maxCost) return false;
  if (state.filters.classFilter !== 'both' && gpu.class !== state.filters.classFilter) return false;
  return true;
}

function getAxisValue(gpu, axis) {
  if (axis === 'benchmark') {
    const r = gpu.results?.[state.benchmark];
    return r?.value;
  }
  if (axis === 'cost_bracket') {
    return costBracketRank(gpu.cost_bracket);
  }
  if (axis === 'vram_gb') return gpu.vram_gb;
  if (axis === 'bandwidth_gb_s') return gpu.memory.bandwidth_gb_s;
  if (axis === 'power_draw_w') return gpu.power_draw_w;
  if (axis === 'release_year') return gpu.release_year;
  if (axis === 'cc') return gpu.cc;
  return null;
}

function getConfidence(gpu) {
  // Worst-case confidence across the two axes used
  const confidences = [];
  if (state.yAxis === 'benchmark') {
    const r = gpu.results?.[state.benchmark];
    if (r?.confidence) confidences.push(r.confidence);
  }
  // X-axis values are from specs → treat as measured unless benchmark-dependent
  if (state.xAxis === 'benchmark') {
    const r = gpu.results?.[state.benchmark];
    if (r?.confidence) confidences.push(r.confidence);
  }
  if (confidences.includes('estimated')) return 'estimated';
  if (confidences.includes('community')) return 'community';
  return 'measured';
}

function archColor(gpu) {
  if (gpu.class === 'server') return state.data.architecture_colors.server;
  const key = `${gpu.architecture}_consumer`;
  return state.data.architecture_colors[key] || '#888';
}

// ====================================================================
// PARETO FRONTIER
// ====================================================================

function computePareto(points, xDir, yDir) {
  // Points already have { x, y }; return subset not dominated.
  const pts = points.filter(p => p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y));

  const frontier = pts.filter(p => {
    return !pts.some(q => {
      if (p === q) return false;
      const xBetterOrEqual = xDir === 'max' ? q.x >= p.x : q.x <= p.x;
      const yBetterOrEqual = yDir === 'max' ? q.y >= p.y : q.y <= p.y;
      const xStrictly = xDir === 'max' ? q.x > p.x : q.x < p.x;
      const yStrictly = yDir === 'max' ? q.y > p.y : q.y < p.y;
      return xBetterOrEqual && yBetterOrEqual && (xStrictly || yStrictly);
    });
  });

  // Sort by x (ascending) for drawing a line
  frontier.sort((a, b) => a.x - b.x);
  return frontier;
}

// ====================================================================
// RENDER
// ====================================================================

function render() {
  const gpus = state.data.gpus.filter(passesFilters);

  // Extract (x, y, gpu) points; drop any with undefined values
  const points = gpus.map(gpu => {
    const confidence = getConfidence(gpu);
    if (confidence === 'estimated' && !state.filters.showEstimated) return null;
    const x = getAxisValue(gpu, state.xAxis);
    const y = getAxisValue(gpu, state.yAxis);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, gpu, confidence };
  }).filter(Boolean);

  // Counts
  document.getElementById('visible-n').textContent = points.length;
  document.getElementById('total-n').textContent = state.data.gpus.length;

  // Channel meta
  const xLabel = state.xAxis === 'cost_bracket'
    ? 'COST'
    : AXIS_LABELS[state.xAxis].toUpperCase();
  const yLabel = state.yAxis === 'benchmark'
    ? state.data.benchmarks.find(b => b.id === state.benchmark)?.short_name?.toUpperCase() || 'BENCH'
    : AXIS_LABELS[state.yAxis].toUpperCase();
  document.getElementById('channel-meta').textContent = `${xLabel}  ×  ${yLabel}`;

  // Pareto
  const xDir = AXIS_BETTER[state.xAxis] || 'max';
  let yDir = AXIS_BETTER[state.yAxis] || 'max';
  if (state.yAxis === 'benchmark') {
    const b = state.data.benchmarks.find(bb => bb.id === state.benchmark);
    yDir = b?.higher_is_better ? 'max' : 'min';
  }
  const paretoSet = state.filters.showPareto ? computePareto(points, xDir, yDir) : [];
  const paretoIds = new Set(paretoSet.map(p => p.gpu.id));

  drawPlot(points, paretoSet, paretoIds, xDir, yDir);
}

// ====================================================================
// D3 PLOT
// ====================================================================

function drawPlot(points, paretoPoints, paretoIds, xDir, yDir) {
  const svg = d3.select('#plot');
  svg.selectAll('*').remove();

  const frameEl = document.querySelector('.plot-frame');
  const rect = frameEl.getBoundingClientRect();
  const W = Math.max(640, rect.width);
  const H = 560;

  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);

  const margin = { top: 32, right: 36, bottom: 60, left: 72 };
  const iw = W - margin.left - margin.right;
  const ih = H - margin.top - margin.bottom;

  // Gradient for pareto area
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', 'paretoGradient').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
  grad.append('stop').attr('offset', '0%').attr('stop-color', '#ffb454').attr('stop-opacity', 0.25);
  grad.append('stop').attr('offset', '100%').attr('stop-color', '#ffb454').attr('stop-opacity', 0);

  // Scales
  let xScale;
  const xVals = points.map(p => p.x);
  if (state.xAxis === 'cost_bracket') {
    xScale = d3.scaleLinear().domain([0.5, 5.5]).range([0, iw]);
  } else {
    const [lo, hi] = d3.extent(xVals);
    const pad = (hi - lo) * 0.08 || 1;
    xScale = d3.scaleLinear().domain([lo - pad, hi + pad]).range([0, iw]).nice();
  }

  let yScale;
  const yVals = points.map(p => p.y);
  if (yVals.length === 0) {
    yScale = d3.scaleLinear().domain([0, 100]).range([ih, 0]);
  } else {
    const [lo, hi] = d3.extent(yVals);
    const pad = (hi - lo) * 0.12 || 1;
    yScale = d3.scaleLinear().domain([Math.max(0, lo - pad), hi + pad]).range([ih, 0]).nice();
  }

  const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

  // Grid
  g.append('g').attr('class', 'grid')
    .call(d3.axisLeft(yScale).tickSize(-iw).tickFormat('').ticks(6));

  g.append('g').attr('class', 'grid')
    .attr('transform', `translate(0, ${ih})`)
    .call(state.xAxis === 'cost_bracket'
      ? d3.axisBottom(xScale).tickValues([1, 2, 3, 4, 5]).tickSize(-ih).tickFormat('')
      : d3.axisBottom(xScale).tickSize(-ih).tickFormat('').ticks(6));

  // Axes
  const xAxisG = g.append('g').attr('class', 'axis x').attr('transform', `translate(0, ${ih})`);
  if (state.xAxis === 'cost_bracket') {
    xAxisG.call(d3.axisBottom(xScale).tickValues([1, 2, 3, 4, 5]).tickFormat(n => '$'.repeat(n)));
    // annotate with currency range below the dollar signs
    xAxisG.selectAll('.tick').each(function(d) {
      const label = bracketTickLabel('$'.repeat(d));
      const currencyText = label.split('  ').slice(1).join('  ');
      d3.select(this).append('text')
        .attr('y', 28)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', 'var(--fg-3)')
        .text(currencyText);
    });
  } else {
    xAxisG.call(d3.axisBottom(xScale).ticks(6).tickFormat(d => formatNumber(d)));
  }

  const yAxisG = g.append('g').attr('class', 'axis y');
  yAxisG.call(d3.axisLeft(yScale).ticks(6).tickFormat(d => formatNumber(d)));

  // Axis titles
  const xTitle = state.xAxis === 'cost_bracket'
    ? `Cost bracket · ${state.data.currencies[state.currency].code}`
    : AXIS_LABELS[state.xAxis];
  svg.append('text').attr('class', 'axis-title')
    .attr('text-anchor', 'middle')
    .attr('x', margin.left + iw / 2)
    .attr('y', H - 14)
    .text(`X  ·  ${xTitle}`);

  const yTitle = state.yAxis === 'benchmark'
    ? state.data.benchmarks.find(b => b.id === state.benchmark)?.display_name || 'metric'
    : AXIS_LABELS[state.yAxis];
  svg.append('text').attr('class', 'axis-title')
    .attr('text-anchor', 'middle')
    .attr('transform', `rotate(-90, 22, ${margin.top + ih / 2})`)
    .attr('x', 22)
    .attr('y', margin.top + ih / 2)
    .text(`Y  ·  ${yTitle}`);

  // Frame rectangle
  g.append('rect')
    .attr('width', iw)
    .attr('height', ih)
    .attr('fill', 'none')
    .attr('stroke', '#2a3749')
    .attr('stroke-width', 1);

  // Corner brackets on the plot frame (instrumentation feel)
  const brkLen = 10;
  const brkCorners = [
    [0, 0, 0, brkLen, brkLen, 0],
    [iw, 0, iw - brkLen, 0, iw, brkLen],
    [0, ih, 0, ih - brkLen, brkLen, ih],
    [iw, ih, iw - brkLen, ih, iw, ih - brkLen]
  ];
  brkCorners.forEach(([cx, cy, x1, y1, x2, y2]) => {
    g.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x1).attr('y2', y1).attr('stroke', '#ffb454').attr('stroke-width', 1.5);
    g.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x2).attr('y2', y2).attr('stroke', '#ffb454').attr('stroke-width', 1.5);
  });

  // Pareto area + line
  if (paretoPoints.length > 1) {
    const linePath = d3.line()
      .x(p => xScale(p.x))
      .y(p => yScale(p.y))
      .curve(d3.curveLinear);
    g.append('path')
      .datum(paretoPoints)
      .attr('class', 'pareto-line')
      .attr('d', linePath);

    // Subtle band showing "better" side
    const areaPoints = paretoPoints.slice();
    const yTop = yDir === 'max' ? yScale.range()[1] : yScale.range()[0];
    const xEnd = xDir === 'min' ? xScale.range()[0] : xScale.range()[1];
    const bandPath = d3.line().x(p => xScale(p.x)).y(p => yScale(p.y))(areaPoints);
    g.append('path')
      .attr('class', 'pareto-area')
      .attr('d', `${bandPath} L ${xScale(paretoPoints[paretoPoints.length - 1].x)} ${yTop} L ${xScale(paretoPoints[0].x)} ${yTop} Z`);
  }

  // Crosshair (hover)
  const xhair = g.append('g').style('display', 'none');
  xhair.append('line').attr('class', 'crosshair-line').attr('id', 'xhair-v').attr('y1', 0).attr('y2', ih);
  xhair.append('line').attr('class', 'crosshair-line').attr('id', 'xhair-h').attr('x1', 0).attr('x2', iw);

  // Dots
  const dotG = g.append('g').attr('class', 'dots');

  // For cost_bracket X, jitter dots horizontally a bit so same-bracket cards don't overlap
  function jitteredX(p) {
    if (state.xAxis !== 'cost_bracket') return xScale(p.x);
    // deterministic jitter by hashing gpu.id
    const h = p.gpu.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const jitter = ((h % 80) / 80 - 0.5) * 0.6; // ±0.3 bracket units
    return xScale(p.x + jitter);
  }

  const tooltip = document.getElementById('tooltip');

  const dots = dotG.selectAll('.dot')
    .data(points, d => d.gpu.id)
    .join('circle')
    .attr('class', d => {
      const cls = ['dot'];
      if (paretoIds.has(d.gpu.id)) cls.push('pareto');
      if (state.selectedGpu && state.selectedGpu.id === d.gpu.id) cls.push('selected');
      return cls.join(' ');
    })
    .attr('cx', d => jitteredX(d))
    .attr('cy', d => yScale(d.y))
    .attr('r', d => paretoIds.has(d.gpu.id) ? 8 : 6)
    .attr('fill', d => d.confidence === 'estimated' ? 'none' : archColor(d.gpu))
    .attr('stroke', d => archColor(d.gpu))
    .attr('stroke-dasharray', d => d.confidence === 'estimated' ? '2,2' : null)
    .style('color', d => archColor(d.gpu))
    .on('mouseenter', function(ev, d) {
      xhair.style('display', '');
      xhair.select('#xhair-v').attr('x1', jitteredX(d)).attr('x2', jitteredX(d));
      xhair.select('#xhair-h').attr('y1', yScale(d.y)).attr('y2', yScale(d.y));

      const gpu = d.gpu;
      const benchName = state.data.benchmarks.find(b => b.id === state.benchmark)?.short_name;
      const benchVal = gpu.results?.[state.benchmark];
      tooltip.innerHTML = `
        <div class="tt-name">${gpu.display_name}</div>
        <div class="tt-arch" style="color:${archColor(gpu)}">${gpu.architecture.replace('_', ' ')} · ${gpu.class}</div>
        <dl class="tt-grid">
          <dt>VRAM</dt><dd class="amber">${gpu.vram_gb} GB</dd>
          <dt>Bandwidth</dt><dd>${gpu.memory.bandwidth_gb_s} GB/s</dd>
          <dt>CC</dt><dd>${gpu.cc.toFixed(1)}</dd>
          <dt>Tensor Cores</dt><dd>${gpu.tensor_cores.present ? 'gen ' + (gpu.tensor_cores.generation || '?') : '—'}</dd>
          <dt>Cost</dt><dd>${formatCostBracket(gpu.cost_bracket, state.currency)}</dd>
          ${benchVal ? `<dt>${benchName}</dt><dd class="amber">${formatNumber(benchVal.value)} ${state.data.benchmarks.find(b => b.id === state.benchmark).metric_units}</dd>` : ''}
        </dl>
        <span class="tt-tag ${d.confidence}">${CONFIDENCE_LABELS[d.confidence]}</span>
        ${paretoIds.has(gpu.id) ? '<span class="tt-tag estimated" style="margin-left: 6px; background: var(--amber-glow); color: var(--amber);">⭐ PARETO</span>' : ''}
      `;
      positionTooltip(ev);
      tooltip.classList.add('visible');
    })
    .on('mousemove', function(ev) {
      positionTooltip(ev);
    })
    .on('mouseleave', function() {
      tooltip.classList.remove('visible');
      xhair.style('display', 'none');
    })
    .on('click', function(ev, d) {
      state.selectedGpu = d.gpu;
      renderDetail();
      render();
      const detail = document.getElementById('detail');
      detail.classList.add('visible');
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

  function positionTooltip(ev) {
    const r = frameEl.getBoundingClientRect();
    const offsetX = ev.clientX - r.left;
    const offsetY = ev.clientY - r.top;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let x = offsetX + 14;
    let y = offsetY + 14;
    if (x + tw > r.width - 8) x = offsetX - tw - 14;
    if (y + th > r.height - 8) y = offsetY - th - 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
}

function formatNumber(n) {
  if (n == null) return '—';
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

// ====================================================================
// DETAIL PANEL
// ====================================================================

function renderDetail() {
  const gpu = state.selectedGpu;
  if (!gpu) return;

  document.getElementById('detail-title').textContent = gpu.display_name;
  document.getElementById('detail-meta').textContent = `${gpu.architecture.replace('_', ' ')} · ${gpu.class} · released ${gpu.release_year}`;

  const specsHTML = `
    <dt>VRAM</dt><dd class="amber">${gpu.vram_gb} GB ${gpu.memory.type.toUpperCase()}</dd>
    <dt>Bandwidth</dt><dd class="amber">${gpu.memory.bandwidth_gb_s} GB/s</dd>
    <dt>Memory bus</dt><dd>${gpu.memory.bus_bits}-bit</dd>
    <dt>Compute capability</dt><dd>${gpu.cc.toFixed(1)}</dd>
    <dt>Tensor Cores</dt><dd>${gpu.tensor_cores.present ? 'present · gen ' + (gpu.tensor_cores.generation || '?') : 'absent'}</dd>
    <dt>Power draw</dt><dd>${gpu.power_draw_w} W</dd>
    <dt>Form factor</dt><dd>${gpu.form_factor.replace('_', ' ')}</dd>
    <dt>Cost bracket</dt><dd class="amber">${formatCostBracket(gpu.cost_bracket, state.currency)}</dd>
    <dt>Release year</dt><dd>${gpu.release_year}</dd>
    <dt>Class</dt><dd>${gpu.class}</dd>
    <dt>Status</dt><dd>${gpu.status}</dd>
  `;
  document.getElementById('detail-specs-list').innerHTML = specsHTML;

  const tbody = document.querySelector('#detail-results-table tbody');
  tbody.innerHTML = '';
  state.data.benchmarks.forEach(b => {
    const r = gpu.results?.[b.id];
    const tr = document.createElement('tr');
    const hasValue = r && r.value != null;
    tr.innerHTML = `
      <td>${b.short_name}</td>
      <td>${r ? `<span class="tt-tag ${r.confidence}" style="display:inline-block">${CONFIDENCE_LABELS[r.confidence]}</span>` : '<span class="tt-tag" style="color: var(--fg-4); border-color: var(--border)">N/A</span>'}</td>
      <td class="value ${hasValue ? r.confidence : 'na'}">${hasValue ? `${formatNumber(r.value)} <span style="color: var(--fg-3); font-size: 11px">${b.metric_units}</span>` : '—'}</td>
    `;
    tbody.appendChild(tr);
  });

  const notesEl = document.getElementById('detail-notes');
  notesEl.textContent = gpu.notes || 'No notes yet.';
}
