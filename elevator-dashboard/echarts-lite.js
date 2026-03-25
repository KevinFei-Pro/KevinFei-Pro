/**
 * echarts-lite.js — Lightweight canvas chart library (ECharts-compatible API).
 * Supports: line (with area fill), bar, pie/donut, radar.
 */
(function (global) {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function parseColor(c, alpha) {
    if (!c || typeof c !== 'string') return `rgba(0,200,255,${alpha !== undefined ? alpha : 1})`;
    if (alpha === undefined) return c;
    if (c.startsWith('rgba(')) {
      return c.replace(/,\s*[\d.]+\)$/, `,${alpha})`);
    }
    if (c.startsWith('rgb(')) {
      return c.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    }
    if (c.startsWith('#') && c.length === 7) {
      const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return c;
  }

  function resolveColor(ctx, colorDef, x0, y0, x1, y1) {
    if (!colorDef) return 'rgba(0,200,255,0.8)';
    if (typeof colorDef === 'string') return colorDef;
    if (colorDef.colorStops) {
      const lg = ctx.createLinearGradient(x0, y0, x1, y1);
      colorDef.colorStops.forEach(s => lg.addColorStop(s.offset, s.color));
      return lg;
    }
    return 'rgba(0,200,255,0.8)';
  }

  // ── EChart instance ──────────────────────────────────────────────────────────
  function EChart(el) {
    this._el     = el;
    this._opt    = null;
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display:block;width:100%;height:100%;';
    el.innerHTML = '';
    el.appendChild(this._canvas);
    el._eInst    = this;            // expose on element for debugging
    this._initSize();
    var self = this;
    window.addEventListener('resize', function() { self._initSize(); });
  }

  EChart.prototype._initSize = function () {
    var r = this._el.getBoundingClientRect();
    var w = Math.round(r.width)  || 300;
    var h = Math.round(r.height) || 200;
    if (this._canvas.width !== w)  this._canvas.width  = w;
    if (this._canvas.height !== h) this._canvas.height = h;
    if (this._opt) this._draw();
  };

  EChart.prototype.resize = function () { this._initSize(); };

  EChart.prototype.setOption = function (opt) {
    this._opt = opt;
    var self = this;
    // Use rAF to ensure layout is complete before first draw
    requestAnimationFrame(function() { self._draw(); });
  };

  EChart.prototype.getOption = function () { return this._opt; };

  EChart.prototype._draw = function () {
    if (!this._opt) return;
    var c   = this._canvas;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    var series = this._opt.series || [];
    var self = this;
    series.forEach(function(s) {
      try {
        if      (s.type === 'line')  self._drawLine(ctx, s);
        else if (s.type === 'bar')   self._drawBar(ctx, s);
        else if (s.type === 'pie')   self._drawPie(ctx, s);
        else if (s.type === 'radar') self._drawRadar(ctx, s);
      } catch(e) {
        console.error('[echarts-lite] draw error for type=' + s.type, e);
      }
    });
    try { this._drawLegend(ctx); } catch(e) { /* silent */ }
  };

  // ── Grid helper ──────────────────────────────────────────────────────────────
  EChart.prototype._getGrid = function () {
    var g  = this._opt.grid || {};
    var cW = this._canvas.width, cH = this._canvas.height;
    return {
      l: g.left   !== undefined ? +g.left   : 46,
      t: g.top    !== undefined ? +g.top    : 10,
      r: cW - (g.right  !== undefined ? +g.right  : 16),
      b: cH - (g.bottom !== undefined ? +g.bottom : 28)
    };
  };

  // ── Line / Area ──────────────────────────────────────────────────────────────
  EChart.prototype._drawLine = function (ctx, s) {
    var opt  = this._opt;
    var g    = this._getGrid();
    var xAx  = Array.isArray(opt.xAxis) ? opt.xAxis[s.xAxisIndex || 0] : (opt.xAxis || {});
    var yAx  = Array.isArray(opt.yAxis) ? opt.yAxis[s.yAxisIndex || 0] : (opt.yAxis || {});
    var raw  = s.data || [];
    var vals = raw.filter(function(v) { return v !== null && v !== undefined; });
    if (!vals.length) return;

    var cats = xAx.data || [];
    var n    = cats.length || raw.length;
    if (n < 2) return;

    var yMin = yAx.min !== undefined ? +yAx.min : Math.min.apply(null, vals) * 0.95;
    var yMax = yAx.max !== undefined ? +yAx.max : Math.max.apply(null, vals) * 1.05;
    var gW = g.r - g.l, gH = g.b - g.t;

    function xP(i) { return g.l + (i / (n - 1)) * gW; }
    function yP(v) { return g.b - ((v - yMin) / ((yMax - yMin) || 1)) * gH; }

    // Grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.08)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var gy = g.t + (i / 4) * gH;
      ctx.beginPath(); ctx.moveTo(g.l, gy); ctx.lineTo(g.r, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // X-axis labels
    ctx.fillStyle = '#7fb3d3';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    var step = Math.max(1, Math.floor(n / 6));
    cats.forEach(function(lbl, i) {
      if (i % step === 0) ctx.fillText(String(lbl), xP(i), g.b + 14);
    });

    // Y-axis labels
    ctx.textAlign = 'right';
    for (var j = 0; j <= 4; j++) {
      var v = yMin + ((yMax - yMin) / 4) * (4 - j);
      ctx.fillText(Math.round(v).toLocaleString(), g.l - 4, g.t + (j / 4) * gH + 4);
    }
    ctx.restore();

    // Build point array
    var pts = [];
    for (var k = 0; k < raw.length; k++) {
      if (raw[k] !== null && raw[k] !== undefined) {
        pts.push({ x: xP(k), y: yP(raw[k]) });
      }
    }
    if (!pts.length) return;

    // Area fill
    var areaStyle = s.areaStyle;
    if (areaStyle) {
      var aColor = resolveColor(ctx, areaStyle.color, 0, g.t, 0, g.b);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, g.b);
      pts.forEach(function(p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(pts[pts.length - 1].x, g.b);
      ctx.closePath();
      ctx.fillStyle = aColor;
      ctx.fill();
      ctx.restore();
    }

    // Line stroke
    var ls = s.lineStyle || {};
    ctx.save();
    ctx.strokeStyle = ls.color || '#00c8ff';
    ctx.lineWidth   = ls.width || 2;
    if (ls.type === 'dashed') ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pts.forEach(function(p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Point symbols
    var symSize = s.symbolSize || 0;
    if (symSize > 0 && s.symbol !== 'none') {
      var itemColor = (s.itemStyle || {}).color || ls.color || '#00c8ff';
      ctx.save();
      pts.forEach(function(p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, symSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = itemColor;
        ctx.fill();
      });
      ctx.restore();
    }
  };

  // ── Bar ──────────────────────────────────────────────────────────────────────
  EChart.prototype._drawBar = function (ctx, s) {
    var opt  = this._opt;
    var g    = this._getGrid();
    var xAx  = Array.isArray(opt.xAxis) ? opt.xAxis[0] : (opt.xAxis || {});
    var raw  = s.data || [];
    var vals = raw.filter(function(v) { return v !== null && v !== undefined; });
    if (!vals.length) return;

    var cats = xAx.data || [];
    var n    = cats.length || raw.length;
    var yMax = Math.max.apply(null, vals) * 1.1;
    var gW = g.r - g.l, gH = g.b - g.t;
    var bW   = Math.min(s.barMaxWidth || 22, (gW / n) * 0.55);

    function xC(i) { return g.l + (i + 0.5) * (gW / n); }
    function yV(v) { return g.b - (v / (yMax || 1)) * gH; }

    // Grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.08)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var gy = g.t + (i / 4) * gH;
      ctx.beginPath(); ctx.moveTo(g.l, gy); ctx.lineTo(g.r, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = '#7fb3d3'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    cats.forEach(function(lbl, i) { ctx.fillText(String(lbl), xC(i), g.b + 14); });
    ctx.textAlign = 'right';
    for (var j = 0; j <= 4; j++) {
      var v = (yMax / 4) * (4 - j);
      ctx.fillText(Math.round(v).toLocaleString(), g.l - 4, g.t + (j / 4) * gH + 4);
    }
    ctx.restore();

    // Bars
    var it = s.itemStyle || {};
    raw.forEach(function(val, i) {
      if (val === null || val === undefined) return;
      var x  = xC(i) - bW / 2;
      var y  = yV(val);
      var bH = g.b - y;
      var br = (it.borderRadius && it.borderRadius[0]) || 0;
      var fill = resolveColor(ctx, it.color, 0, y, 0, g.b);
      ctx.save();
      ctx.fillStyle = fill;
      ctx.beginPath();
      if (br > 0) {
        ctx.moveTo(x + br, y);
        ctx.lineTo(x + bW - br, y);
        ctx.arcTo(x + bW, y, x + bW, y + br, br);
        ctx.lineTo(x + bW, g.b);
        ctx.lineTo(x, g.b);
        ctx.lineTo(x, y + br);
        ctx.arcTo(x, y, x + br, y, br);
      } else {
        ctx.rect(x, y, bW, bH);
      }
      ctx.fill();
      ctx.restore();
    });
  };

  // ── Pie / Donut ──────────────────────────────────────────────────────────────
  EChart.prototype._drawPie = function (ctx, s) {
    var cW = this._canvas.width, cH = this._canvas.height;
    var center = s.center || ['50%', '50%'];
    var cx = cW * (parseFloat(center[0]) / 100);
    var cy = cH * (parseFloat(center[1]) / 100);
    var radius = s.radius || '72%';
    var rOuter, rInner;
    if (Array.isArray(radius)) {
      rInner = Math.min(cW, cH) * (parseFloat(radius[0]) / 100);
      rOuter = Math.min(cW, cH) * (parseFloat(radius[1]) / 100);
    } else {
      rOuter = Math.min(cW, cH) * (parseFloat(radius) / 100);
      rInner = 0;
    }

    var data  = s.data || [];
    var total = data.reduce(function(a, d) { return a + (d.value || 0); }, 0);
    if (!total) return;

    var angle = -Math.PI / 2;
    data.forEach(function(d) {
      var sweep = (d.value / total) * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rOuter, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = (d.itemStyle && d.itemStyle.color) || '#00c8ff';
      ctx.fill();
      ctx.restore();
      angle += sweep;
    });

    // Donut cutout
    if (rInner > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = '#081a36';
      ctx.fill();
      ctx.restore();
    }

    // Legend (right side)
    var leg = this._opt.legend || {};
    if (leg.orient === 'vertical') {
      var legX = cx + rOuter + 14;
      var legY = cy - (data.length * 16) / 2 + 8;
      data.forEach(function(d) {
        var col = (d.itemStyle && d.itemStyle.color) || '#7fb3d3';
        ctx.save();
        ctx.fillStyle = col;
        ctx.fillRect(legX, legY - 6, 10, 10);
        ctx.fillStyle = '#7fb3d3';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        var lbl = d.name && d.name.length > 6 ? d.name.slice(0, 6) + '…' : (d.name || '');
        ctx.fillText(lbl, legX + 14, legY + 2);
        ctx.restore();
        legY += 16;
      });
    }
  };

  // ── Radar ────────────────────────────────────────────────────────────────────
  EChart.prototype._drawRadar = function (ctx, s) {
    var opt    = this._opt;
    var radar  = opt.radar || {};
    var cW = this._canvas.width, cH = this._canvas.height;
    var center = radar.center || ['50%', '46%'];
    var cx     = cW * (parseFloat(center[0]) / 100);
    var cy     = cH * (parseFloat(center[1]) / 100);
    var R      = Math.min(cW, cH) * (parseFloat(radar.radius || '62%') / 100);
    var inds   = radar.indicator || [];
    var n      = inds.length;
    if (!n) return;

    function angle(i) { return (Math.PI * 2 * i / n) - Math.PI / 2; }

    // Web grid
    for (var ring = 1; ring <= 4; ring++) {
      var r = R * ring / 4;
      ctx.save();
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var a = angle(i);
        if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,200,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Axes + labels
    inds.forEach(function(ind, i) {
      var a = angle(i);
      ctx.save();
      ctx.strokeStyle = 'rgba(0,200,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke();
      ctx.fillStyle = '#7fb3d3'; ctx.font = '10px sans-serif';
      var lx = cx + (R + 18) * Math.cos(a), ly = cy + (R + 18) * Math.sin(a);
      ctx.textAlign = Math.cos(a) > 0.1 ? 'left' : (Math.cos(a) < -0.1 ? 'right' : 'center');
      ctx.fillText(ind.name || '', lx, ly + 4);
      ctx.restore();
    });

    // Data series
    (s.data || []).forEach(function(d) {
      var vals = d.value || [];
      var ls = d.lineStyle || {};
      var as = d.areaStyle || {};
      ctx.save();
      ctx.beginPath();
      vals.forEach(function(v, i) {
        var max = (inds[i] && inds[i].max) || 100;
        var pr  = R * (v / max);
        var a   = angle(i);
        if (i === 0) ctx.moveTo(cx + pr * Math.cos(a), cy + pr * Math.sin(a));
        else ctx.lineTo(cx + pr * Math.cos(a), cy + pr * Math.sin(a));
      });
      ctx.closePath();
      if (as.color) { ctx.fillStyle = as.color; ctx.fill(); }
      ctx.strokeStyle = ls.color || '#00ff9d';
      ctx.lineWidth   = ls.width || 2;
      if (ls.type === 'dashed') ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  };

  // ── Legend ───────────────────────────────────────────────────────────────────
  EChart.prototype._drawLegend = function (ctx) {
    var opt = this._opt;
    var leg = opt.legend;
    if (!leg || !leg.data || !leg.data.length) return;
    var cW = this._canvas.width, cH = this._canvas.height;

    // Build color map from series
    var colorMap = {};
    (opt.series || []).forEach(function(s) {
      var col = (s.lineStyle && s.lineStyle.color) || ((s.itemStyle && typeof s.itemStyle.color === 'string') ? s.itemStyle.color : null);
      if (s.name && col) colorMap[s.name] = col;
      (s.data || []).forEach(function(d) {
        if (d.name && d.lineStyle && d.lineStyle.color) colorMap[d.name] = d.lineStyle.color;
      });
    });

    ctx.save();
    ctx.font = '10px sans-serif';
    var items = leg.data;
    var totalW = items.reduce(function(a, lbl) { return a + ctx.measureText(lbl).width + 28; }, 0);
    var lx = (cW - totalW) / 2;
    var ly = leg.bottom !== undefined ? cH - (parseInt(leg.bottom) || 4) - 2 : cH - 6;

    items.forEach(function(lbl) {
      var col = colorMap[lbl] || '#7fb3d3';
      ctx.fillStyle = col;
      ctx.fillRect(lx, ly - 7, 12, 8);
      ctx.fillStyle = '#7fb3d3';
      ctx.textAlign = 'left';
      ctx.fillText(lbl, lx + 16, ly);
      lx += ctx.measureText(lbl).width + 28;
    });
    ctx.restore();
  };

  // ── Public factory ────────────────────────────────────────────────────────────
  var echartsLib = {
    init: function(el) {
      if (el._eInst) return el._eInst;   // reuse existing instance
      return new EChart(el);             // constructor sets el._eInst
    }
  };

  global.echarts = global.echarts || echartsLib;

})(window);
