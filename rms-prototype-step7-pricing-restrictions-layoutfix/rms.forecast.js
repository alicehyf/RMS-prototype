/* =========================================================
   MODULE: FORECAST & PACE (MVP)
   - OTB (on-the-books) derived from inventory (total - remaining)
   - Pickup (last 24h) derived from demo delta24h
   - Lightweight heuristic forecast (prototype-only)
   - Reuses Overview SVG axis renderer for consistency
========================================================== */

RMS.registerModule("forecastPace", {
  init(RMS){
    this._uiKey = "rms_forecast_ui_v1";
    this._asOf = null;
    this._room = "__all__";
    this._window = 30;

    // Restore UI state
    try{
      const raw = localStorage.getItem(this._uiKey);
      if (raw){
        const st = JSON.parse(raw);
        if (st && typeof st === "object"){
          if (typeof st.asOf === "string") this._asOf = st.asOf;
          if (typeof st.room === "string") this._room = st.room;
          if (Number.isFinite(+st.window)) this._window = Math.max(7, Math.min(90, +st.window));
        }
      }
    }catch(e){ /* ignore */ }

    const asOfSel = document.getElementById("forecastAsOf");
    const roomSel = document.getElementById("forecastRoom");
    const winSel = document.getElementById("forecastWindow");

    const saveUI = () => {
      try{
        localStorage.setItem(this._uiKey, JSON.stringify({ asOf: this._asOf, room: this._room, window: this._window }));
      }catch(e){ /* ignore */ }
    };

    asOfSel?.addEventListener("change", () => {
      this._asOf = asOfSel.value;
      saveUI();
      this.render(RMS);
    });

    roomSel?.addEventListener("change", () => {
      this._room = roomSel.value;
      saveUI();
      this.render(RMS);
    });

    winSel?.addEventListener("change", () => {
      this._window = parseInt(winSel.value, 10) || 30;
      saveUI();
      this.render(RMS);
    });
  },

  _getAllDates(RMS){
    const inv = RMS.db?.data?.inventory || {};
    return Object.keys(inv).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  },

  _parseDateKey(dk){
    const [y,m,d] = dk.split("-").map(Number);
    return new Date(y, m-1, d);
  },

  _formatShortDate(dk){
    // MM/DD
    const [y,m,d] = dk.split("-");
    return `${m}/${d}`;
  },

  _isWeekend(dk){
    const dt = this._parseDateKey(dk);
    const dow = dt.getDay();
    return (dow === 0 || dow === 6);
  },

  _getWindowDates(RMS, asOf, windowDays){
    const all = this._getAllDates(RMS);
    if (!all.length) return [];

    const start = this._parseDateKey(asOf);
    const end = new Date(start.getTime() + (windowDays-1) * 86400000);

    return all.filter(dk => {
      const t = this._parseDateKey(dk);
      return t >= start && t <= end;
    });
  },

  _aggregateForDate(RMS, dk, room){
    const invDay = RMS.db?.data?.inventory?.[dk] || {};

    let total = 0;
    let remaining = 0;
    let delta24h = 0;

    Object.keys(invDay).forEach(rt => {
      if (room !== "__all__" && rt !== room) return;
      const rec = invDay[rt];
      total += Number(rec?.total || 0);
      remaining += Number(rec?.remaining || 0);
      delta24h += Number(rec?.delta24h || 0);
    });

    const sold = Math.max(0, total - remaining);
    const occ = total > 0 ? (sold / total) : 0;
    const pickup = Math.max(0, -delta24h); // demo uses negative deltas (availability decreases)

    return { total, remaining, sold, occ, pickup };
  },

  _forecastFinalSold({ sold, occ, total, leadDays, weekend }){
    // Prototype heuristic:
    // - the further away the stay date, the more potential to sell remaining inventory
    // - weekend adds slightly more demand
    // - capped at total
    if (leadDays <= 0) return Math.min(total, sold);

    const demandBoost = weekend ? 0.12 : 0.0;
    const potential = Math.max(0, (1 - occ)) * total;
    const timeFactor = 1 - Math.exp(-leadDays / 18); // 0..1
    const captureRate = 0.65 + demandBoost; // 0.65..0.77

    const add = potential * timeFactor * captureRate;
    return Math.min(total, sold + add);
  },

  _drawBarsWithAxes(RMS, svgEl, values, opts = {}){
    if (!svgEl) return;

    const w = opts.w ?? 300;
    const h = opts.h ?? 120;
    const padL = opts.padL ?? 36;
    const padR = opts.padR ?? 8;
    const padT = opts.padT ?? 10;
    const padB = opts.padB ?? 22;
    const kind = opts.kind ?? "num";

    const arr = (values || []).map(v => Number.isFinite(v) ? v : 0);
    if (!arr.length){
      svgEl.innerHTML = "";
      return;
    }

    const minV = Math.min(0, ...arr);
    const maxV = Math.max(0, ...arr);

    const kpi = RMS.modules.kpiDashboard;
    const ticksInfo = kpi?._niceTicks ? kpi._niceTicks(minV, maxV || 1, 4) : { min: minV, max: maxV || 1, ticks: [minV, maxV||1] };

    const yMin = ticksInfo.min;
    const yMax = ticksInfo.max;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const xStep = plotW / arr.length;
    const barW = Math.max(2, xStep * 0.72);

    const yScale = plotH / (yMax - yMin || 1);
    const y0 = padT + (yMax - 0) * yScale;

    const xLabels = opts.xLabels || [];
    const idxFirst = 0;
    const idxMid = Math.floor((arr.length - 1) / 2);
    const idxLast = arr.length - 1;

    const labelFor = (i) => xLabels[i] || "";
    const xTickItems = [
      {i: idxFirst, txt: labelFor(idxFirst), anchor: "start"},
      {i: idxMid, txt: labelFor(idxMid), anchor: "middle"},
      {i: idxLast, txt: labelFor(idxLast), anchor: "end"},
    ].filter(it => it.txt);

    svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const gridLines = (ticksInfo.ticks || []).map(tv => {
      const y = padT + (yMax - tv) * yScale;
      return `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${(w-padR).toFixed(2)}" y2="${y.toFixed(2)}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"></line>`;
    }).join("");

    const yLabels = (ticksInfo.ticks || []).map(tv => {
      const y = padT + (yMax - tv) * yScale;
      const label = kpi?._formatCompact ? kpi._formatCompact(tv, kind) : String(Math.round(tv));
      return `<text x="${padL - 6}" y="${(y + 3).toFixed(2)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.7">${label}</text>`;
    }).join("");

    const xAxisY = padT + plotH;
    const xTicks = xTickItems.map(it => {
      const x = padL + (it.i + 0.5) * xStep;
      return `<text x="${x.toFixed(2)}" y="${(xAxisY + 14).toFixed(2)}" text-anchor="${it.anchor}" font-size="10" fill="currentColor" fill-opacity="0.65">${it.txt}</text>`;
    }).join("");

    const bars = arr.map((v,i) => {
      const x = padL + i * xStep + (xStep - barW) / 2;
      const y = padT + (yMax - Math.max(v, 0)) * yScale;
      const bh = Math.abs(v) * yScale;
      const yy = (v >= 0) ? y : y0;
      return `<rect x="${x.toFixed(2)}" y="${yy.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="2" fill="currentColor" fill-opacity="0.25"></rect>`;
    }).join("");

    svgEl.innerHTML = `
      ${gridLines}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${xAxisY}" stroke="currentColor" stroke-opacity="0.25" stroke-width="1"></line>
      <line x1="${padL}" y1="${xAxisY}" x2="${w-padR}" y2="${xAxisY}" stroke="currentColor" stroke-opacity="0.25" stroke-width="1"></line>
      <line x1="${padL}" y1="${y0.toFixed(2)}" x2="${(w-padR).toFixed(2)}" y2="${y0.toFixed(2)}" stroke="currentColor" stroke-opacity="0.16" stroke-width="1"></line>
      ${yLabels}
      ${xTicks}
      ${bars}
    `;
  },

  // Public helper: forecast occupancy percent for a given date and room type
  getForecastOccPercent(RMS, dateKey, roomType = '__all__', asOfKey = null){
    try{
      const asOf = asOfKey || this._asOf || RMS.time?.businessDateKey || dateKey;
      const agg = this._aggregateForDate(RMS, dateKey, roomType);
      const leadDays = Math.max(0, Math.round((this._parseDateKey(dateKey).getTime() - this._parseDateKey(asOf).getTime()) / 86400000));
      const fcSold = this._forecastFinalSold({
        sold: agg.sold,
        occ: agg.occ,
        total: agg.total,
        leadDays,
        weekend: this._isWeekend(dateKey)
      });
      const fcOcc = agg.total > 0 ? (fcSold / agg.total) : 0;
      return Math.round(fcOcc * 100);
    }catch(e){
      return null;
    }
  },

  render(RMS){
    const view = document.getElementById("forecastView");
    if (!view || view.classList.contains("hidden")) return;

    const allDates = this._getAllDates(RMS);
    if (!allDates.length) return;

    // Populate As-of dates
    const asOfSel = document.getElementById("forecastAsOf");
    if (asOfSel && asOfSel.options.length === 0){
      asOfSel.innerHTML = allDates.map(dk => `<option value="${dk}">${dk}</option>`).join("");
    }

    // Default as-of: use selected calendar day if available, else mid-point
    if (!this._asOf){
      const prefer = RMS.state?.selectedDay;
      this._asOf = (prefer && allDates.includes(prefer)) ? prefer : allDates[Math.floor(allDates.length * 0.55)];
    }

    if (asOfSel){
      if (!allDates.includes(this._asOf)) this._asOf = allDates[0];
      asOfSel.value = this._asOf;
    }

    // Populate room types
    const roomSel = document.getElementById("forecastRoom");
    if (roomSel && roomSel.options.length <= 1){
      const rts = RMS.db?.data?.roomTypes || [];
      const opts = rts.map(rt => `<option value="${rt}">${rt}</option>`).join("");
      roomSel.insertAdjacentHTML("beforeend", opts);
    }
    if (roomSel) roomSel.value = this._room;

    const winSel = document.getElementById("forecastWindow");
    if (winSel) winSel.value = String(this._window);

    // Build window series
    const windowDates = this._getWindowDates(RMS, this._asOf, this._window);
    const asOfDt = this._parseDateKey(this._asOf);

    const seriesSold = [];
    const seriesForecastSold = [];
    const seriesOcc = [];
    const seriesForecastOcc = [];
    const seriesPickup = [];
    const xLabels = [];

    windowDates.forEach(dk => {
      const agg = this._aggregateForDate(RMS, dk, this._room);
      const leadDays = Math.round((this._parseDateKey(dk).getTime() - asOfDt.getTime()) / 86400000);
      const fcSold = this._forecastFinalSold({
        sold: agg.sold,
        occ: agg.occ,
        total: agg.total,
        leadDays,
        weekend: this._isWeekend(dk)
      });

      seriesSold.push(agg.sold);
      seriesForecastSold.push(fcSold);
      seriesPickup.push(agg.pickup);

      const occPct = agg.total > 0 ? (agg.sold / agg.total) * 100 : 0;
      const fcOccPct = agg.total > 0 ? (fcSold / agg.total) * 100 : 0;
      seriesOcc.push(occPct);
      seriesForecastOcc.push(fcOccPct);

      xLabels.push(this._formatShortDate(dk));
    });

    // Range label
    const rangeLabel = document.getElementById("forecastRangeLabel");
    if (rangeLabel){
      const end = windowDates[windowDates.length - 1] || this._asOf;
      rangeLabel.textContent = `${this._asOf} → ${end} (${windowDates.length} days)`;
    }

    // Charts
    const kpi = RMS.modules.kpiDashboard;
    const chartOTB = document.getElementById("chartOTB");
    const chartPickup = document.getElementById("chartPickup");
    const chartOccFc = document.getElementById("chartOccForecast");

    // Rooms sold: solid = forecast, dashed = current OTB
    kpi?._drawChartWithAxes?.(chartOTB, { a: seriesForecastSold, b: seriesSold }, { w: 300, h: 120, kind: "num", xLabels });

    // Pickup bars
    this._drawBarsWithAxes(RMS, chartPickup, seriesPickup, { w: 300, h: 120, kind: "num", xLabels });

    // Occupancy: solid = forecast, dashed = current
    kpi?._drawChartWithAxes?.(chartOccFc, { a: seriesForecastOcc, b: seriesOcc }, { w: 300, h: 120, kind: "pct", xLabels });

    // Alerts
    this._renderAlerts(RMS, windowDates, { seriesPickup, seriesForecastOcc, seriesOcc, xLabels });
  },

  _renderAlerts(RMS, windowDates, ctx){
    const tbody = document.getElementById("forecastAlertsBody");
    if (!tbody) return;

    const rows = [];
    for (let i = 0; i < windowDates.length; i++){
      const dk = windowDates[i];
      const pickup = ctx.seriesPickup[i] || 0;
      const fcOcc = ctx.seriesForecastOcc[i] || 0;
      const occ = ctx.seriesOcc[i] || 0;

      if (pickup >= 3){
        rows.push({ dk, signal: "Pickup", note: `Strong pickup (+${Math.round(pickup)} rooms in 24h)` });
      }
      if (fcOcc >= 90 && occ < 90){
        rows.push({ dk, signal: "High demand", note: `Forecast occupancy ${Math.round(fcOcc)}% (consider price increase / restrictions)` });
      }
      if (occ >= 95){
        rows.push({ dk, signal: "Near sold out", note: `Current occupancy ${Math.round(occ)}% (close low rates / min-stay)` });
      }
    }

    // Prioritize: high forecast occ, then pickup
    rows.sort((a,b) => {
      const score = (r) => {
        let s = 0;
        if (r.signal === "High demand") s += 200;
        if (r.signal === "Near sold out") s += 160;
        if (r.signal === "Pickup") s += 120;
        return s;
      };
      return score(b) - score(a);
    });

    const top = rows.slice(0, 6);

    if (!top.length){
      tbody.innerHTML = `<tr><td colspan="3" class="rms-muted">No alerts in this window.</td></tr>`;
      return;
    }

    tbody.innerHTML = top.map(r => {
      return `<tr>
        <td>${r.dk}</td>
        <td><span class="badge" style="font-size:12px;">${r.signal}</span></td>
        <td>${r.note}</td>
      </tr>`;
    }).join("");
  }
});
