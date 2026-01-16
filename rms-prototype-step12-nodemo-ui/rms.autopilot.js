/* =========================================================
   MODULE: AUTOPILOT (Prototype)
   - Toggle on/off
   - Preferences stored in localStorage
   - Interval-based auto-run (surface simulation)
   - Uses current Pricing mode labels and shows scheduling status
========================================================== */

(function(){
  if (!window.RMS) return;

  const STORAGE_KEY_BASE = "rms_autopilot_v1";
    const key = () => RMS.util.storageKey(STORAGE_KEY_BASE);
  let _autoTimer = null;
  let _countdownTimer = null;
  let _nextRunAt = null;
  let _autoIntervalMs = null;

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const fmtCountdown = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    return `${mm}:${String(ss).padStart(2,'0')}`;
  };

  const setNextRunText = (st) => {
    const el = document.getElementById("apNextRunIn");
    if (!el) return;
    if (!st?.enabled || !_nextRunAt) { el.textContent = "—"; return; }
    el.textContent = fmtCountdown(_nextRunAt - Date.now());
  };

  const todayKey = () => {
    const k = window.RMS?.time?.businessDateKey;
    if (k && /^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
    return new Date().toISOString().slice(0,10);
  };

  const parseKey = (k) => {
    const [y,m,d] = String(k||"").split("-").map(Number);
    return new Date(y, (m||1)-1, d||1);
  };

  const addDaysKey = (k, days) => {
    const dt = parseKey(k);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0,10);
  };

  const fmtIDR = (n) => {
    const cal = RMS.modules?.coreCalendar;
    if (cal?.formatIDR) return cal.formatIDR(n);
    return "IDR " + Number(n||0).toLocaleString("en-US");
  };

  const getModeLabel = () => RMS.pricing?.getModeLabel?.(RMS.pricing?.getRules?.()?.pricingMode || "occ") || "—";

  const defaultState = () => ({
    enabled: false,
    windowDays: 14,
    intervalMinutes: 10,
    roomTypes: {},   // rt -> true/false
    ratePlans: {},   // rp -> true/false
    skipSoldOut: true,
    maxPct: 10,
    maxAbs: 200000,
    bigChangeAction: "queue", // queue | cap
    minDelta: 5000,
    lastRunAt: null,
    lastRunSummary: null,
    runLog: []
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(key());
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      const d = defaultState();
      return {
        ...d,
        ...p,
        roomTypes: (p?.roomTypes && typeof p.roomTypes === "object") ? p.roomTypes : d.roomTypes,
        ratePlans: (p?.ratePlans && typeof p.ratePlans === "object") ? p.ratePlans : d.ratePlans,
        runLog: Array.isArray(p?.runLog) ? p.runLog : d.runLog
      };
    } catch {
      return defaultState();
    }
  };

  const save = (st) => {
    try { localStorage.setItem(key(), JSON.stringify(st)); } catch {}
  };

  const getMeta = () => {
    const db = RMS?.db?.data;
    if (!db) return { dates: [], roomTypes: [], ratePlans: [] };
    const dates = Object.keys(db.prices || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const roomTypes = Array.isArray(db.roomTypes) ? db.roomTypes.slice() : [];
    const ratePlans = Array.isArray(db.ratePlans) ? db.ratePlans.slice() : [];
    return { dates, roomTypes, ratePlans };
  };

  const isSelectedAny = (obj) => Object.values(obj || {}).some(Boolean);

  const getSelectedList = (obj, fallbackList) => {
    const selected = Object.entries(obj || {}).filter(([_,v]) => !!v).map(([k]) => k);
    return selected.length ? selected : (fallbackList || []);
  };

  const occPercent = (dk, roomType) => {
    const inv = RMS.db?.getInventory?.(dk, roomType) || { total: 0, remaining: 0 };
    if (!inv.total) return 0;
    const occ = Math.round((1 - (inv.remaining / inv.total)) * 100);
    return clamp(occ, 0, 100);
  };

  const isSoldOut = (dk, roomType) => {
    const inv = RMS.db?.getInventory?.(dk, roomType);
    return inv && inv.remaining <= 0;
  };

  const buildPlan = (st) => {
    const meta = getMeta();
    const startKey = todayKey();
    const endKey = addDaysKey(startKey, Math.max(0, Number(st.windowDays)||0));
    const datesInRange = meta.dates.filter(dk => dk >= startKey && dk <= endKey);

    const rts = getSelectedList(st.roomTypes, meta.roomTypes);
    const rps = getSelectedList(st.ratePlans, meta.ratePlans);

    const pricingMode = RMS.pricing?.getRules?.()?.pricingMode || "occ";
    const rounding = Number(RMS.pricing?.getRules?.()?.rounding) || 1;

    const changes = [];
    const queued = [];
    const skipped = { soldOut: 0, noRec: 0, small: 0, manualMode: 0 };

    datesInRange.forEach(dk => {
      rts.forEach(rt => {
        const sold = isSoldOut(dk, rt);
        rps.forEach(rp => {
          if (st.skipSoldOut && sold) { skipped.soldOut++; return; }

          const current = RMS.db?.getPrice?.(dk, rt, rp);
          if (!Number.isFinite(current)) { skipped.noRec++; return; }

          // compute occupancy% (pricing module will decide which basis to use)
          const occ = occPercent(dk, rt);

          if (pricingMode === "manual") { skipped.manualMode++; return; }

          const recObj = RMS.pricing?.recommendPrice?.(current, occ, dk, rt, rp);
          const rec = recObj?.recommended;

          if (!Number.isFinite(rec)) { skipped.noRec++; return; }

          const delta = rec - current;
          if (Math.abs(delta) < (Number(st.minDelta)||0)) { skipped.small++; return; }

          const pct = current ? Math.round((Math.abs(delta) / current) * 100) : 0;
          const abs = Math.abs(delta);

          const overPct = (Number(st.maxPct) >= 0) ? (pct > Number(st.maxPct)) : false;
          const overAbs = (Number(st.maxAbs) >= 0) ? (abs > Number(st.maxAbs)) : false;
          const over = overPct || overAbs;

          let finalRec = rec;
          let note = `${getModeLabel()}`;

          if (over && st.bigChangeAction === "queue") {
            queued.push({
              dk, rt, rp, current, recommended: rec,
              note: `Queued for review (Δ ${pct}% / ${fmtIDR(abs)})`
            });
            return;
          }

          if (over && st.bigChangeAction === "cap") {
            // Cap by abs and pct (whichever is tighter)
            let capByPct = current;
            if (Number(st.maxPct) >= 0) {
              const maxDeltaPct = current * (Number(st.maxPct)/100);
              capByPct = current + Math.sign(delta) * maxDeltaPct;
            }
            let capByAbs = current;
            if (Number(st.maxAbs) >= 0) {
              capByAbs = current + Math.sign(delta) * Number(st.maxAbs);
            }
            const candidate = (Math.abs(capByPct-current) < Math.abs(capByAbs-current)) ? capByPct : capByAbs;
            finalRec = candidate;

            // Re-round & re-apply restrictions (important after capping)
            finalRec = Math.round(finalRec / rounding) * rounding;
            if (RMS.restrictions?.apply) {
              const out = RMS.restrictions.apply(finalRec, { dateKey: dk, roomType: rt, ratePlan: rp, currentPrice: current });
              if (out && Number.isFinite(out.price)) finalRec = out.price;
            }

            note = `Capped & applied (Δ ${pct}% / ${fmtIDR(abs)})`;
          }

          if (!Number.isFinite(finalRec)) { skipped.noRec++; return; }
          if (Math.abs(finalRec - current) < (Number(st.minDelta)||0)) { skipped.small++; return; }

          changes.push({
            dk, rt, rp, current, recommended: finalRec,
            note
          });
        });
      });
    });

    return { changes, queued, skipped, startKey, endKey };
  };

  const renderChecks = (rootId, items, stObj) => {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = "";
    items.forEach((name, idx) => {
      const id = `${rootId}_${idx}`.replace(/[^\w\-]/g,"_");
      const checked = (stObj[name] !== false); // default on
      const el = document.createElement("label");
      el.className = "ap-check";
      el.innerHTML = `
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} data-name="${name}">
        <span>${name}</span>
      `;
      root.appendChild(el);
    });

    root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const name = cb.getAttribute("data-name");
        if (!name) return;
        stObj[name] = cb.checked;
        save(RMS.modules.autopilot._state);
      });
    });
  };

  const setStatus = (st) => {
    const pill = document.getElementById("apStatusPill");
    const last = document.getElementById("apLastRun");
    const mode = document.getElementById("apModeLabel");
    if (pill) {
      pill.textContent = st.enabled ? `Status: Enabled • every ${st.intervalMinutes || 10}m` : "Status: Disabled";
      pill.classList.toggle("on", !!st.enabled);
    }
    if (last) last.textContent = st.lastRunAt ? new Date(st.lastRunAt).toLocaleString("en-US") : "—";
    if (mode) mode.textContent = getModeLabel();

    const runOnce = document.getElementById("apRunOnceBtn");
    if (runOnce) runOnce.disabled = !st.enabled;
    setNextRunText(st);
  };

  const appendRunLog = (st, message) => {
    const t = new Date().toLocaleString("en-US");
    st.runLog = Array.isArray(st.runLog) ? st.runLog : [];
    st.runLog.unshift({ t, message });
    st.runLog = st.runLog.slice(0, 25);
    save(st);
    renderRunLog(st);
  };

  const renderRunLog = (st) => {
    const el = document.getElementById("apAutoRunLog");
    if (!el) return;
    const log = Array.isArray(st.runLog) ? st.runLog : [];
    if (!log.length) {
      el.innerHTML = '<div class="rms-muted">No scheduled runs yet.</div>';
      return;
    }
    el.innerHTML = log.map(x => `<div style="display:flex; gap:10px; padding:3px 0;">
      <div class="rms-muted" style="min-width:160px;">${x.t}</div>
      <div>${x.message}</div>
    </div>`).join("");
  };

  const stopAutoRun = () => {
    if (_autoTimer) {
      clearInterval(_autoTimer);
      _autoTimer = null;
    }
    if (_countdownTimer) {
      clearInterval(_countdownTimer);
      _countdownTimer = null;
    }
    _nextRunAt = null;
    _autoIntervalMs = null;
  };

  const runCycle = (st, reason = "auto") => {
    st.lastRunAt = Date.now();
    st.lastRunSummary = { reason };
    save(st);
    setStatus(st);
    appendRunLog(st, reason === "manual" ? "Manual run executed." : "Scheduled run completed." );
    if (reason === "manual") {
      RMS.ui?.toast?.("Manual run executed.", { title: "Autopilot" });
    }
  };

  const rescheduleFromNow = (st) => {
    if (!st?.enabled || !_autoIntervalMs) return;
    if (_autoTimer) {
      clearInterval(_autoTimer);
      _autoTimer = null;
    }
    _nextRunAt = Date.now() + _autoIntervalMs;
    setNextRunText(st);
    _autoTimer = setInterval(() => {
      if (!st.enabled) return;
      runCycle(st, "auto");
      _nextRunAt = Date.now() + _autoIntervalMs;
      setNextRunText(st);
    }, _autoIntervalMs);
  };

  const startAutoRun = (st) => {
    stopAutoRun();
    const mins = Math.max(1, Number(st.intervalMinutes) || 10);
    const ms = mins * 60 * 1000;
    _autoIntervalMs = ms;

    // Countdown ticker
    _nextRunAt = Date.now() + Math.min(600, ms);
    setNextRunText(st);
    _countdownTimer = setInterval(() => setNextRunText(st), 1000);

    // surface simulation: run once shortly after enabling, then on interval
    setTimeout(() => {
      if (!st.enabled) return;
      runCycle(st, "auto");
      _nextRunAt = Date.now() + ms;
      setNextRunText(st);
      RMS.ui?.toast?.(`Scheduled run executed (every ${mins} min).`, { title: "Autopilot" });
    }, 600);

    _autoTimer = setInterval(() => {
      if (!st.enabled) return;
      runCycle(st, "auto");
      _nextRunAt = Date.now() + ms;
      setNextRunText(st);
    }, ms);
  };


  RMS.registerModule("autopilot", {
    init(RMS){
        RMS.events?.on("propertyChanged", ()=>{
          // Stop any active timers for previous property
          try { this._stopAuto?.(); } catch(e){}
          // Reload per-property settings
          try { this._state = load(); } catch(e){}
          this.render?.(RMS);
          // Restart auto-run if enabled for the new property
          try { if (this._state?.enabled) this._startAuto?.(RMS); } catch(e){}
        });

      this._state = load();

      const meta = getMeta();
      // Default: all room types & plans checked ON unless previously stored
      meta.roomTypes.forEach(rt => {
        if (this._state.roomTypes[rt] === undefined) this._state.roomTypes[rt] = true;
      });
      meta.ratePlans.forEach(rp => {
        if (this._state.ratePlans[rp] === undefined) this._state.ratePlans[rp] = true;
      });
      save(this._state);

      // Wire controls
      const enabled = document.getElementById("apEnabled");
      const windowDays = document.getElementById("apWindowDays");
      const intervalMins = document.getElementById("apIntervalMinutes");
      const skipSold = document.getElementById("apSkipSoldOut");
      const maxPct = document.getElementById("apMaxPct");
      const maxAbs = document.getElementById("apMaxAbs");
      const bigAction = document.getElementById("apBigChangeAction");
      const minDelta = document.getElementById("apMinDelta");

      if (enabled) {
        enabled.checked = !!this._state.enabled;
        enabled.addEventListener("change", async () => {
          const wantEnable = !!enabled.checked;

          if (wantEnable) {
            const mins = Math.max(1, Number(this._state.intervalMinutes) || 10);
            const msg =
              `You are about to enable Autopilot.\n\n` +
              `While enabled, the system will run automatically every ${mins} minutes (until you disable it).\n\n` +
              `Each run refreshes the latest inputs and applies pricing updates within your restrictions and safety limits.`;

            const ok = await (RMS.ui?.confirm
              ? RMS.ui.confirm({ title: "Enable Autopilot?", message: msg, confirmText: "Enable", cancelText: "Cancel" })
              : Promise.resolve(window.confirm(msg)));

            if (!ok) {
              enabled.checked = false;
              return;
            }

            this._state.enabled = true;
            save(this._state);
            setStatus(this._state);
            renderRunLog(this._state);
            appendRunLog(this._state, `Autopilot enabled (every ${mins} min).`);
            startAutoRun(this._state);
            RMS.ui?.toast?.(`Autopilot enabled. Running every ${mins} min.`, { title: "Autopilot" });
            return;
          }

          // Disable
          this._state.enabled = false;
          save(this._state);
          stopAutoRun();
          setStatus(this._state);
          renderRunLog(this._state);
          appendRunLog(this._state, "Autopilot disabled.");
          RMS.ui?.toast?.("Autopilot disabled.", { title: "Autopilot" });
        });
      }

      const bindNum = (el, key, {min=null, max=null}={}) => {
        if (!el) return;
        el.value = String(this._state[key] ?? el.value);
        el.addEventListener("change", () => {
          const v = Number(el.value);
          if (!Number.isFinite(v)) return;
          this._state[key] = (min!=null || max!=null) ? clamp(v, min??v, max??v) : v;
          el.value = String(this._state[key]);
          save(this._state);
        });
      };

      if (windowDays) {
        windowDays.value = String(this._state.windowDays || 14);
        windowDays.addEventListener("change", () => {
          this._state.windowDays = Number(windowDays.value) || 14;
          save(this._state);
        });
      }

      if (intervalMins) {
        intervalMins.value = String(this._state.intervalMinutes || 10);
        intervalMins.addEventListener("change", () => {
          const v = Math.max(1, Number(intervalMins.value) || 10);
          this._state.intervalMinutes = v;
          save(this._state);
          setStatus(this._state);
          renderRunLog(this._state);
          if (this._state.enabled) startAutoRun(this._state);
        });
      }

      if (skipSold) {
        skipSold.checked = !!this._state.skipSoldOut;
        skipSold.addEventListener("change", () => {
          this._state.skipSoldOut = !!skipSold.checked;
          save(this._state);
        });
      }

      bindNum(maxPct, "maxPct", {min:0, max:100});
      bindNum(maxAbs, "maxAbs", {min:0});
      bindNum(minDelta, "minDelta", {min:0});

      if (bigAction) {
        bigAction.value = this._state.bigChangeAction || "queue";
        bigAction.addEventListener("change", () => {
          this._state.bigChangeAction = bigAction.value;
          save(this._state);
        });
      }

      // Check grids
      renderChecks("apRoomTypeChecks", meta.roomTypes, this._state.roomTypes);
      renderChecks("apRatePlanChecks", meta.ratePlans, this._state.ratePlans);

      // Run once (surface simulation) / Reset
      const runOnceBtn = document.getElementById("apRunOnceBtn");
      const resetBtn = document.getElementById("apResetBtn");

      runOnceBtn?.addEventListener("click", () => {
        if (!this._state.enabled) return;
        runCycle(this._state, "manual");
        // For demo clarity: treat a manual run as restarting the schedule from now
        rescheduleFromNow(this._state);
      });

      resetBtn?.addEventListener("click", () => {
        this._state = defaultState();
        const meta = getMeta();
        meta.roomTypes.forEach(rt => this._state.roomTypes[rt] = true);
        meta.ratePlans.forEach(rp => this._state.ratePlans[rp] = true);
        save(this._state);

        // Re-bind UI values
        if (enabled) enabled.checked = !!this._state.enabled;
        if (windowDays) windowDays.value = String(this._state.windowDays);
        if (skipSold) skipSold.checked = !!this._state.skipSoldOut;
        if (maxPct) maxPct.value = String(this._state.maxPct);
        if (maxAbs) maxAbs.value = String(this._state.maxAbs);
        if (bigAction) bigAction.value = this._state.bigChangeAction;
        if (minDelta) minDelta.value = String(this._state.minDelta);

        renderChecks("apRoomTypeChecks", meta.roomTypes, this._state.roomTypes);
        renderChecks("apRatePlanChecks", meta.ratePlans, this._state.ratePlans);

        // Clear scheduling state
        stopAutoRun();

        setStatus(this._state);
        RMS.ui?.toast?.("Preferences reset.", { title: "Autopilot" });
      });

      setStatus(this._state);
      renderRunLog(this._state);
      if (this._state.enabled) startAutoRun(this._state);
    },

    render(RMS){
      // Keep labels up-to-date when pricing mode changes elsewhere
      setStatus(this._state);
    }
  });

})();
