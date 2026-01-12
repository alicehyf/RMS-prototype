/* =========================================================
       MODULE: KPI DASHBOARD + VIEW ROUTER
       - Overview page shows Revenue / RevPAR / Occupancy / ADR
       - Uses existing in-memory DB (prices + inventory)
       - Does NOT modify calendar UI; just toggles views
    ========================================================== */
    RMS.registerModule("kpiDashboard", {
      init(RMS){
        const dashboardView = document.getElementById("dashboardView");
        const calendarView = document.getElementById("calendarView");
        const pricingRulesView = document.getElementById("pricingRulesView");
        const sidebar = document.querySelector(".sidebar");
const show = (which) => {
          const isDash = (which === "dashboard" || which === "overview");
          const isCal = (which === "calendar");
          const isRules = (which === "rules");
if (dashboardView) dashboardView.classList.toggle("hidden", !isDash);
          if (calendarView) calendarView.classList.toggle("hidden", !isCal);
          if (pricingRulesView) pricingRulesView.classList.toggle("hidden", !isRules);
          if (isRules) {
            const pr = RMS.modules.pricingRules;
            if (pr && typeof pr.render === "function") {
              pr.render(RMS);
            }
          }

          // IMPORTANT: coreCalendar renders on DOMContentLoaded even when the calendar view is hidden.
          // When the view is hidden, column width measurements become 0, so pinned (sticky) columns
          // won't activate until the user toggles a pin checkbox. Re-render once the calendar becomes
          // visible to ensure widths + sticky offsets are computed correctly.
          if (isCal) {
            const cal = RMS.modules.coreCalendar;
            if (cal && typeof cal.render === "function") {
              requestAnimationFrame(() => {
                cal.render(RMS);
                requestAnimationFrame(() => cal.applyPinnedColumns?.(RMS));
              });
            }
          } else if (isRules) {
            const pr = RMS.modules.pricingRules;
            pr?.render?.(RMS);
          } else if (isDash) {
            // Refresh KPIs when returning to Overview
            this.render?.(RMS);
          }
        };

        // default landing: dashboard
        show("dashboard");
        // Left menu navigation (Prostay-style shell)
        const ratesToggle = document.getElementById('ratesToggle');
        const rmsToggle = document.getElementById('rmsToggle');
        const rmsSubmenu = document.getElementById('rmsSubmenu');
        const ratesSubmenu = document.getElementById('ratesSubmenu');
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsSubmenu = document.getElementById('settingsSubmenu');

        const setRatesOpen = (open) => {
          if (!ratesToggle || !ratesSubmenu) return;
          ratesToggle.classList.toggle('open', open);
          ratesSubmenu.classList.toggle('open', open);
          ratesToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };


const setRmsOpen = (open) => {
  if (!rmsToggle || !rmsSubmenu) return;
  rmsToggle.classList.toggle('open', open);
  rmsSubmenu.classList.toggle('open', open);
  rmsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
};

        const setSettingsOpen = (open) => {
          if (!settingsToggle || !settingsSubmenu) return;
          settingsToggle.classList.toggle('open', open);
          settingsSubmenu.classList.toggle('open', open);
          settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };

        // Default: RMS section expanded
        setRmsOpen(true);
        setRatesOpen(false);

        ratesToggle?.addEventListener('click', () => {
          const open = !ratesSubmenu?.classList.contains('open');
          setRatesOpen(open);
        });

rmsToggle?.addEventListener('click', () => {
  const open = !rmsSubmenu?.classList.contains('open');
  setRmsOpen(open);
});


        settingsToggle?.addEventListener('click', () => {
          const open = !settingsSubmenu?.classList.contains('open');
          setSettingsOpen(open);
        });

        const setActiveMenu = (which) => {
          document.querySelectorAll('#leftMenu .sb-item, #leftMenu .sb-subitem').forEach(btn => {
            btn.classList.remove('active');
          });

          const activeLeaf = document.querySelector(`#leftMenu [data-nav="${which}"]`);
          if (activeLeaf) activeLeaf.classList.add('active');

          // Parent highlighting + auto expand
          const isRms = (which === 'overview' || which === 'calendar' || which === 'rules');
          if (isRms) {
            setRmsOpen(true);
            rmsToggle?.classList.add('active');
          } else {
            rmsToggle?.classList.remove('active');
          ratesToggle?.classList.remove('active');
          }
        };

        document.querySelectorAll('#leftMenu [data-nav]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (btn.classList.contains('disabled')) return;
            const which = btn.getAttribute('data-nav');
            if (which) go(which);
          });
        });

// Keep menu in sync when navigating via in-page buttons
        const go = (which) => {
          show(which);
          setActiveMenu(which);
        };


                document.getElementById("btnGoRules")?.addEventListener("click", () => {
          go("rules");
          RMS.ui?.toast?.("Pricing rules", { title: "Navigation" });
        });

document.getElementById("btnGoCalendar")?.addEventListener("click", () => {
          go("calendar");
          RMS.ui?.toast?.("Calendar view", { title: "Navigation" });
        });

        document.getElementById("btnGoDashboard")?.addEventListener("click", () => {
          go("dashboard");
          RMS.ui?.toast?.("Overview", { title: "Navigation" });
        });


        
        document.getElementById("btnPricingRules")?.addEventListener("click", () => {
          go("rules");
          RMS.ui?.toast?.("Pricing rules", { title: "Navigation" });
        });

        document.getElementById("detailRules")?.addEventListener("click", () => {
          go("rules");
          RMS.ui?.toast?.("Pricing rules", { title: "Navigation" });
        });

        document.getElementById("btnRulesBackCalendar")?.addEventListener("click", () => {
          go("calendar");
          RMS.ui?.toast?.("Calendar view", { title: "Navigation" });
        });

        document.getElementById("btnRulesBackOverview")?.addEventListener("click", () => {
          go("dashboard");
          RMS.ui?.toast?.("Overview", { title: "Navigation" });
        });

// KPI range toggle (Overview only)
        this._range = "month";
        const setRange = (r) => {
          this._range = r;
          document.querySelectorAll("#kpiRangeGroup .toggle").forEach((b) => {
            b.classList.toggle("active", b.dataset.range === r);
          });
          this.render(RMS);
        };
        document.querySelectorAll("#kpiRangeGroup .toggle").forEach((btn) => {
          btn.addEventListener("click", () => setRange(btn.dataset.range));
        });

        this._show = show;
      },

      formatIDR(RMS, n){
        const cal = RMS.modules.coreCalendar;
        if (cal && typeof cal.formatIDR === "function") return cal.formatIDR(n);
        return "IDR " + Number(n).toLocaleString("en-US");
      },

      computeRangeKPIs(RMS, range, refOverride){
        const cal = RMS.modules.coreCalendar;
        if (!cal || !RMS.db) return null;

        const inv = RMS.db.data?.inventory || {};
        const allDates = Object.keys(inv).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        if (!allDates.length) return null;

        const refDate = refOverride || allDates[allDates.length - 1]; // YYYY-MM-DD
        const [refY, refM] = refDate.split("-").map(Number);
        const refQ = Math.floor((refM - 1) / 3) + 1;

        const inRange = (dk) => {
          const [y, m] = dk.split("-").map(Number);
          const q = Math.floor((m - 1) / 3) + 1;
          if (range === "day") return dk === refDate;
          if (range === "month") return (y === refY && m === refM);
          if (range === "quarter") return (y === refY && q === refQ);
          return true;
        };

        const dateKeys = allDates.filter(inRange);

        // We do not have booking-by-rate-plan mix in this prototype.
        // To estimate realized revenue across *all* rate plans, we apply a simple plan mix.
        const planMix = {
          BAR: 0.65,
          "Member Rate": 0.20,
          "Corporate": 0.10,
          "Promotion": 0.05
        };

        let revenue = 0;
        let soldRooms = 0;
        let availableRooms = 0;

        dateKeys.forEach((dk) => {
          RMS.db.data.roomTypes.forEach((room) => {
            const invRow = RMS.db.getInventory(dk, room);
            const total = invRow.total || 0;
            const remaining = invRow.remaining || 0;
            const sold = Math.max(0, total - remaining);

            availableRooms += total;
            soldRooms += sold;

            if (sold <= 0) return;

            let weightedPrice = 0;
            let wSum = 0;

            Object.keys(planMix).forEach((plan) => {
              const w = planMix[plan] || 0;
              let p = RMS.db.getPrice(dk, room, plan);
              if (p == null) p = RMS.db.getLastSoldPrice(dk, room, plan);
              if (p == null) return;
              weightedPrice += w * p;
              wSum += w;
            });

            let realized = (wSum > 0) ? (weightedPrice / wSum) : null;

            if (realized == null) {
              for (const plan of RMS.db.data.ratePlans) {
                let p = RMS.db.getPrice(dk, room, plan);
                if (p == null) p = RMS.db.getLastSoldPrice(dk, room, plan);
                if (p != null) { realized = p; break; }
              }
            }

            if (realized != null) revenue += sold * realized;
          });
        });

        const occ = (availableRooms > 0) ? (soldRooms / availableRooms) : 0;
        const adr = (soldRooms > 0) ? (revenue / soldRooms) : 0;
        const revpar = (availableRooms > 0) ? (revenue / availableRooms) : 0;

        return { range, refDate, refY, refM, refQ, revenue, soldRooms, availableRooms, occ, adr, revpar };
      },

      _getAllDates(RMS){
        const inv = RMS.db?.data?.inventory || {};
        return Object.keys(inv).sort();
      },

      _parseDateKey(dk){
        const [y, m, d] = dk.split("-").map(Number);
        return { y, m, d, q: Math.floor((m - 1) / 3) + 1 };
      },

      _getRangeDateKeys(RMS, range, refDate){
        const allDates = this._getAllDates(RMS);
        if (!allDates.length) return [];

        const ref = this._parseDateKey(refDate);
        const inRange = (dk) => {
          const p = this._parseDateKey(dk);
          if (range === "day") return dk === refDate;
          if (range === "month") return (p.y === ref.y && p.m === ref.m);
          if (range === "quarter") return (p.y === ref.y && p.q === ref.q);
          return true;
        };
        return allDates.filter(inRange);
      },

      _findPrevRefDate(RMS, range, currentRefDate){
        const allDates = this._getAllDates(RMS);
        if (!allDates.length) return null;

        const cur = this._parseDateKey(currentRefDate);
        const idx = allDates.indexOf(currentRefDate);

        if (range === "day"){
          if (idx > 0) return allDates[idx - 1];
          return null;
        }

        if (range === "month"){
          let y = cur.y, m = cur.m - 1;
          if (m < 1){ y -= 1; m = 12; }
          const candidates = allDates.filter(dk => {
            const p = this._parseDateKey(dk);
            return p.y === y && p.m === m;
          });
          return candidates.length ? candidates[candidates.length - 1] : null;
        }

        if (range === "quarter"){
          let y = cur.y, q = cur.q - 1;
          if (q < 1){ y -= 1; q = 4; }
          const candidates = allDates.filter(dk => {
            const p = this._parseDateKey(dk);
            return p.y === y && p.q === q;
          });
          return candidates.length ? candidates[candidates.length - 1] : null;
        }

        return null;
      },

      computePreviousRangeKPIs(RMS, range, currentK){
        const prevRef = this._findPrevRefDate(RMS, range, currentK?.refDate);
        if (!prevRef) return null;
        return this.computeRangeKPIs(RMS, range, prevRef);
      },

      computeDailySeries(RMS, range, refDate){
        const dateKeys = this._getRangeDateKeys(RMS, range, refDate);
        if (!dateKeys.length) return null;

        const points = dateKeys.map(dk => {
          const k = this.computeRangeKPIs(RMS, "day", dk);
          return { dk, revenue: k?.revenue ?? 0, revpar: k?.revpar ?? 0, occ: k?.occ ?? 0, adr: k?.adr ?? 0 };
        });

        return {
          dateKeys,
          revenue: points.map(p => p.revenue),
          revpar: points.map(p => p.revpar),
          occ: points.map(p => p.occ),
          adr: points.map(p => p.adr),
        };
      },

      _drawLine(svgEl, values, opts = {}){
        if (!svgEl) return;
        const w = opts.w ?? 100;
        const h = opts.h ?? 30;
        const pad = opts.pad ?? 3;
        const strokeWidth = opts.strokeWidth ?? 2;

        if (!values || !values.length){
          svgEl.innerHTML = "";
          return;
        }

        const nums = values.map(v => Number.isFinite(v) ? v : 0);
        let vmin = Math.min(...nums);
        let vmax = Math.max(...nums);
        if (vmin === vmax){
          vmin -= 1;
          vmax += 1;
        }

        const xStep = (nums.length === 1) ? 0 : ((w - pad * 2) / (nums.length - 1));
        const yScale = (h - pad * 2) / (vmax - vmin);

        const pts = nums.map((v, i) => {
          const x = pad + i * xStep;
          const y = h - pad - (v - vmin) * yScale;
          return [x, y];
        });

        const d = pts.map((p, i) => (i === 0 ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}` : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)).join(" ");
        const last = pts[pts.length - 1];

        svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svgEl.innerHTML = `
          <path d="M ${pad} ${h - pad} L ${w - pad} ${h - pad}" stroke="currentColor" stroke-opacity="0.18" stroke-width="1" fill="none"></path>
          <path d="${d}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="2.4" fill="currentColor" fill-opacity="0.95"></circle>
        `;
      },


      _niceStep(n){
        // returns a "nice" step size for axis ticks
        if (!Number.isFinite(n) || n === 0) return 1;
        const exp = Math.floor(Math.log10(Math.abs(n)));
        const f = Math.abs(n) / Math.pow(10, exp);
        let nf = 1;
        if (f < 1.5) nf = 1;
        else if (f < 3) nf = 2;
        else if (f < 7) nf = 5;
        else nf = 10;
        return nf * Math.pow(10, exp);
      },

      _niceTicks(minV, maxV, nTicks = 4){
        if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return {min:0,max:1,step:1,ticks:[0,1]};
        if (minV === maxV){
          minV -= 1; maxV += 1;
        }
        const span = maxV - minV;
        const step = this._niceStep(span / Math.max(1, (nTicks - 1)));
        const niceMin = Math.floor(minV / step) * step;
        const niceMax = Math.ceil(maxV / step) * step;
        const ticks = [];
        for (let v = niceMin; v <= niceMax + step * 0.5; v += step){
          ticks.push(v);
        }
        return { min: niceMin, max: niceMax, step, ticks };
      },

      _formatCompact(n, kind){
        if (!Number.isFinite(n)) return "—";
        if (kind === "pct") return `${Math.round(n)}%`;

        // compact for currency-like numbers
        const abs = Math.abs(n);
        if (abs >= 1e9) return `${(n/1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `${(n/1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${(n/1e3).toFixed(1)}K`;
        return `${Math.round(n)}`;
      },

      _drawChartWithAxes(svgEl, values, opts = {}){
        if (!svgEl) return;
        const w = opts.w ?? 300;
        const h = opts.h ?? 90;
        const kind = opts.kind ?? "num"; // "num" | "pct"
        const padL = opts.padL ?? 36;
        const padR = opts.padR ?? 8;
        const padT = opts.padT ?? 10;
        const padB = opts.padB ?? 22;
        const strokeWidth = opts.strokeWidth ?? 2;

        const seriesA = (values?.a || values || []).map(v => Number.isFinite(v) ? v : 0);
        const seriesB = (values?.b || null);
        const seriesBNums = seriesB ? seriesB.map(v => Number.isFinite(v) ? v : 0) : null;

        if (!seriesA.length){
          svgEl.innerHTML = "";
          return;
        }

        const allNums = seriesBNums ? seriesA.concat(seriesBNums) : seriesA.slice();
        let vmin = Math.min(...allNums);
        let vmax = Math.max(...allNums);

        // If percent, keep within [0,100] with padding
        if (kind === "pct"){
          vmin = Math.min(0, vmin);
          vmax = Math.max(100, vmax);
        } else {
          // add small padding for readability
          const span = (vmax - vmin) || 1;
          vmin = vmin - span * 0.08;
          vmax = vmax + span * 0.08;
        }

        const ticksInfo = this._niceTicks(vmin, vmax, 4);
        const yMin = ticksInfo.min;
        const yMax = ticksInfo.max;

        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        const xStep = (seriesA.length === 1) ? 0 : (plotW / (seriesA.length - 1));
        const yScale = plotH / (yMax - yMin || 1);

        const toPt = (v, i) => {
          const x = padL + i * xStep;
          const y = padT + (yMax - v) * yScale;
          return [x, y];
        };

        const buildPath = (arr) => {
          const pts = arr.map((v,i)=>toPt(v,i));
          return {
            d: pts.map((p,i)=> (i===0?`M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`:`L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)).join(" "),
            last: pts[pts.length-1],
          };
        };

        const pathA = buildPath(seriesA);
        const pathB = seriesBNums ? buildPath(seriesBNums) : null;

        // X labels: first / middle / last
        const xLabels = opts.xLabels || [];
        const idxFirst = 0;
        const idxMid = Math.floor((seriesA.length - 1) / 2);
        const idxLast = seriesA.length - 1;

        const labelFor = (i) => xLabels[i] || "";

        const xTickItems = [
          {i: idxFirst, txt: labelFor(idxFirst), anchor: "start"},
          {i: idxMid, txt: labelFor(idxMid), anchor: "middle"},
          {i: idxLast, txt: labelFor(idxLast), anchor: "end"},
        ].filter(it => it.txt);

        svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);

        // Build grid + axes + labels
        const gridLines = ticksInfo.ticks.map(tv => {
          const y = padT + (yMax - tv) * yScale;
          return `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${(w-padR).toFixed(2)}" y2="${y.toFixed(2)}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"></line>`;
        }).join("");

        const yLabels = ticksInfo.ticks.map(tv => {
          const y = padT + (yMax - tv) * yScale;
          return `<text x="${padL - 6}" y="${(y + 3).toFixed(2)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.7">${this._formatCompact(tv, kind)}</text>`;
        }).join("");

        const xAxisY = padT + plotH;
        const xTicks = xTickItems.map(it => {
          const x = padL + it.i * xStep;
          return `<text x="${x.toFixed(2)}" y="${(xAxisY + 14).toFixed(2)}" text-anchor="${it.anchor}" font-size="10" fill="currentColor" fill-opacity="0.65">${it.txt}</text>`;
        }).join("");

        // Paths
        const prevPath = pathB ? `
          <path d="${pathB.d}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="${strokeWidth}" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"></path>
        ` : "";

        svgEl.innerHTML = `
          ${gridLines}
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${xAxisY}" stroke="currentColor" stroke-opacity="0.25" stroke-width="1"></line>
          <line x1="${padL}" y1="${xAxisY}" x2="${w-padR}" y2="${xAxisY}" stroke="currentColor" stroke-opacity="0.25" stroke-width="1"></line>
          ${yLabels}
          ${xTicks}
          ${prevPath}
          <path d="${pathA.d}" fill="none" stroke="currentColor" stroke-opacity="0.9" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="${pathA.last[0].toFixed(2)}" cy="${pathA.last[1].toFixed(2)}" r="2.6" fill="currentColor" fill-opacity="0.95"></circle>
        `;
      },

      _renderMiniBars(containerId, curr, prev){
        const el = document.getElementById(containerId);
        if (!el) return;

        const c = Number.isFinite(curr) ? curr : 0;
        const p = Number.isFinite(prev) ? prev : 0;
        const maxv = Math.max(c, p, 1);

        const cW = Math.max(2, Math.round((c / maxv) * 100));
        const pW = Math.max(2, Math.round((p / maxv) * 100));

        el.innerHTML = `
          <div class="mini-bar-row">
            <div class="mini-bar-label">Cur</div>
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${cW}%"></div></div>
          </div>
          <div class="mini-bar-row">
            <div class="mini-bar-label">Prev</div>
            <div class="mini-bar-track"><div class="mini-bar-fill prev" style="width:${pW}%"></div></div>
          </div>
        `;
      },

      _setDelta(elId, deltaText, cls){
        const el = document.getElementById(elId);
        if (!el) return;
        el.classList.remove("pos","neg");
        if (cls) el.classList.add(cls);
        el.textContent = deltaText;
      },

      _setCompareRow(prefix, curTxt, prevTxt, deltaTxt, deltaCls){
        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        setText(`cmp${prefix}Cur`, curTxt);
        setText(`cmp${prefix}Prev`, prevTxt);

        const dEl = document.getElementById(`cmp${prefix}Delta`);
        if (dEl){
          dEl.innerHTML = deltaTxt ? `<span class="delta-pill ${deltaCls || ""}">${deltaTxt}</span>` : "—";
        }
      },


      render(RMS){
        const range = this._range || "month";
        const k = this.computeRangeKPIs(RMS, range);
        if (!k) return;

        const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

        // Primary values
        setText("kpiRevenue", this.formatIDR(RMS, Math.round(k.revenue)));
        setText("kpiRevPAR", this.formatIDR(RMS, Math.round(k.revpar)));
        setText("kpiOcc", `${Math.round(k.occ * 100)}%`);
        setText("kpiADR", this.formatIDR(RMS, Math.round(k.adr)));

        // Header description + reference date
        const desc = document.getElementById("kpiRangeDesc");
        if (desc){
          if (range === "day") desc.textContent = "Property-level KPIs for today";
          if (range === "month") desc.textContent = "Property-level KPIs for this month";
          if (range === "quarter") desc.textContent = "Property-level KPIs for this quarter";
        }
        setText("kpiRefDateLabel", `(Reference date: ${k.refDate})`);

        // Sub lines (Chinese range label)
        const rangeLabel = (range === "day") ? "Today" : (range === "month") ? "This month" : "This quarter";
        const monthName = ["January","February","March","April","May","June","July","August","September","October","November","December"][k.refM - 1];
        const quarterLabel = `Q${k.refQ} ${k.refY}`;

        if (range === "day") setText("kpiRevenueSub", `${rangeLabel} • ${k.refDate} • All rate plans`);
        if (range === "month") setText("kpiRevenueSub", `${rangeLabel} • ${monthName} ${k.refY} • All rate plans`);
        if (range === "quarter") setText("kpiRevenueSub", `${rangeLabel} • ${quarterLabel} • All rate plans`);

        setText("kpiRevPARSub", `Revenue / available rooms (${k.availableRooms.toLocaleString("en-US")} room-nights)`);
        setText("kpiOccSub", `${k.soldRooms.toLocaleString("en-US")} sold / ${k.availableRooms.toLocaleString("en-US")} available`);
        setText("kpiADRSub", `Revenue / sold rooms (${k.soldRooms.toLocaleString("en-US")} room-nights)`);

        // Comparison vs previous period
        const prevK = this.computePreviousRangeKPIs(RMS, range, k);
        const prevLabel = (range === "day") ? "yesterday" : (range === "month") ? "previous month" : "previous quarter";

        const cmpLabelEl = document.getElementById("compareLabel");
        if (cmpLabelEl){
          cmpLabelEl.textContent = prevK ? `Comparing to the ${prevLabel}` : "No previous period data available for comparison.";
        }

        const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
        const fmtPts = (x) => `${x.toFixed(1)} pts`;
        const deltaClass = (x) => (x > 0) ? "pos" : (x < 0) ? "neg" : "";

        const setDeltaLine = (id, txt, cls) => this._setDelta(id, txt || "—", cls || "");

        if (prevK){
          const dRev = (prevK.revenue > 0) ? ((k.revenue - prevK.revenue) / prevK.revenue) : null;
          const dRevPAR = (prevK.revpar > 0) ? ((k.revpar - prevK.revpar) / prevK.revpar) : null;
          const dADR = (prevK.adr > 0) ? ((k.adr - prevK.adr) / prevK.adr) : null;
          const dOccPts = (k.occ - prevK.occ) * 100;

          setDeltaLine("kpiRevenueDelta", (dRev != null) ? `${(dRev >= 0 ? "+" : "")}${(dRev * 100).toFixed(1)}% vs ${prevLabel}` : `— vs ${prevLabel}`, deltaClass(dRev || 0));
          setDeltaLine("kpiRevPARDelta", (dRevPAR != null) ? `${(dRevPAR >= 0 ? "+" : "")}${(dRevPAR * 100).toFixed(1)}% vs ${prevLabel}` : `— vs ${prevLabel}`, deltaClass(dRevPAR || 0));
          setDeltaLine("kpiADRDelta", (dADR != null) ? `${(dADR >= 0 ? "+" : "")}${(dADR * 100).toFixed(1)}% vs ${prevLabel}` : `— vs ${prevLabel}`, deltaClass(dADR || 0));
          setDeltaLine("kpiOccDelta", `${(dOccPts >= 0 ? "+" : "")}${dOccPts.toFixed(1)} pts vs ${prevLabel}`, deltaClass(dOccPts));

          // Mini comparison bars
          this._renderMiniBars("barRevenue", k.revenue, prevK.revenue);
          this._renderMiniBars("barRevPAR", k.revpar, prevK.revpar);
          this._renderMiniBars("barADR", k.adr, prevK.adr);
          this._renderMiniBars("barOcc", k.occ * 100, prevK.occ * 100);

          // Comparison table
          this._setCompareRow("Revenue",
            this.formatIDR(RMS, Math.round(k.revenue)),
            this.formatIDR(RMS, Math.round(prevK.revenue)),
            (dRev != null) ? `${(dRev >= 0 ? "+" : "")}${(dRev * 100).toFixed(1)}%` : "—",
            deltaClass(dRev || 0)
          );

          this._setCompareRow("RevPAR",
            this.formatIDR(RMS, Math.round(k.revpar)),
            this.formatIDR(RMS, Math.round(prevK.revpar)),
            (dRevPAR != null) ? `${(dRevPAR >= 0 ? "+" : "")}${(dRevPAR * 100).toFixed(1)}%` : "—",
            deltaClass(dRevPAR || 0)
          );

          this._setCompareRow("Occ",
            `${Math.round(k.occ * 100)}%`,
            `${Math.round(prevK.occ * 100)}%`,
            `${(dOccPts >= 0 ? "+" : "")}${dOccPts.toFixed(1)} pts`,
            deltaClass(dOccPts)
          );

          this._setCompareRow("ADR",
            this.formatIDR(RMS, Math.round(k.adr)),
            this.formatIDR(RMS, Math.round(prevK.adr)),
            (dADR != null) ? `${(dADR >= 0 ? "+" : "")}${(dADR * 100).toFixed(1)}%` : "—",
            deltaClass(dADR || 0)
          );
        } else {
          // Clear compare UI gracefully
          setDeltaLine("kpiRevenueDelta", "—", "");
          setDeltaLine("kpiRevPARDelta", "—", "");
          setDeltaLine("kpiADRDelta", "—", "");
          setDeltaLine("kpiOccDelta", "—", "");

          this._renderMiniBars("barRevenue", k.revenue, 0);
          this._renderMiniBars("barRevPAR", k.revpar, 0);
          this._renderMiniBars("barADR", k.adr, 0);
          this._renderMiniBars("barOcc", k.occ * 100, 0);

          this._setCompareRow("Revenue", this.formatIDR(RMS, Math.round(k.revenue)), "—", "—", "");
          this._setCompareRow("RevPAR", this.formatIDR(RMS, Math.round(k.revpar)), "—", "—", "");
          this._setCompareRow("Occ", `${Math.round(k.occ * 100)}%`, "—", "—", "");
          this._setCompareRow("ADR", this.formatIDR(RMS, Math.round(k.adr)), "—", "—", "");
        }

        // Daily trend charts (sparklines + mini charts)
        const series = this.computeDailySeries(RMS, range, k.refDate);
        if (series){
          // sparklines
          this._drawLine(document.getElementById("sparkRevenue"), series.revenue, { w: 100, h: 30, strokeWidth: 2 });
          this._drawLine(document.getElementById("sparkRevPAR"), series.revpar, { w: 100, h: 30, strokeWidth: 2 });
          this._drawLine(document.getElementById("sparkOcc"), series.occ.map(v => v * 100), { w: 100, h: 30, strokeWidth: 2 });
          this._drawLine(document.getElementById("sparkADR"), series.adr, { w: 100, h: 30, strokeWidth: 2 });

          // larger mini charts (with axes)
          const xLabels = series.dateKeys.map(dk => {
            const parts = dk.split("-");
            return (range === "day") ? dk.slice(5) : parts[2]; // "DD"
          });

          const prevSeries = prevK ? this.computeDailySeries(RMS, range, prevK.refDate) : null;

          this._drawChartWithAxes(
            document.getElementById("chartRevenue"),
            { a: series.revenue, b: prevSeries?.revenue || null },
            { w: 300, h: 90, strokeWidth: 2, kind: "num", xLabels }
          );
          this._drawChartWithAxes(
            document.getElementById("chartRevPAR"),
            { a: series.revpar, b: prevSeries?.revpar || null },
            { w: 300, h: 90, strokeWidth: 2, kind: "num", xLabels }
          );
          this._drawChartWithAxes(
            document.getElementById("chartOcc"),
            { a: series.occ.map(v => v * 100), b: prevSeries ? prevSeries.occ.map(v => v * 100) : null },
            { w: 300, h: 90, strokeWidth: 2, kind: "pct", xLabels }
          );
          this._drawChartWithAxes(
            document.getElementById("chartADR"),
            { a: series.adr, b: prevSeries?.adr || null },
            { w: 300, h: 90, strokeWidth: 2, kind: "num", xLabels }
          );
}

      }
    });


    /* =========================================================
       BOOTSTRAP
    ========================================================== */
    document.addEventListener("DOMContentLoaded", () => {
      renderAll();
    });
  
