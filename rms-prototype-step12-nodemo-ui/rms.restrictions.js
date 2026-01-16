/* =========================================================
   MODULE: PRICING RESTRICTIONS (Hard constraints)
   - Absolute min/max per room type
   - Room type price gaps (A - B)
   - Rate plan price gaps (A - B)
   Stored in localStorage and applied to recommendations.
========================================================== */

(function(){
  if (!window.RMS) return;

  const STORAGE_KEY_BASE = "rms_pricing_restrictions_v1";
  const key = () => RMS.util.storageKey(STORAGE_KEY_BASE);

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const parseNum = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s.replace(/[^\d\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const getMeta = (RMS) => {
    const db = RMS?.db?.data;
    const prices = db?.prices || {};
    const dates = Object.keys(prices);
    if (!dates.length) return { dates: [], roomTypes: [], ratePlans: [] };
    const d0 = dates[0];
    const roomTypes = Object.keys(prices[d0] || {});
    const rp0 = roomTypes[0];
    const ratePlans = Object.keys((prices[d0]?.[rp0]) || {});
    return { dates, roomTypes, ratePlans };
  };

  const suggestAbsBounds = (RMS) => {
    const db = RMS?.db?.data;
    const prices = db?.prices || {};
    const meta = getMeta(RMS);
    const out = {};
    meta.roomTypes.forEach(rt => {
      let mn = Infinity, mx = -Infinity;
      meta.dates.forEach(dk => {
        const byRt = prices[dk]?.[rt] || {};
        Object.values(byRt).forEach(v => {
          const n = Number(v);
          if (!Number.isFinite(n)) return;
          mn = Math.min(mn, n);
          mx = Math.max(mx, n);
        });
      });
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
        out[rt] = { enabled: false, min: null, max: null };
      } else {
        // widen slightly to avoid over-clamping in demos
        const min = Math.max(0, Math.round((mn * 0.7) / 1000) * 1000);
        const max = Math.round((mx * 1.3) / 1000) * 1000;
        out[rt] = { enabled: true, min, max };
      }
    });
    return out;
  };

  const defaultState = (RMS) => ({
    abs: suggestAbsBounds(RMS),
    roomGaps: [],
    planGaps: []
  });

  const load = (RMS) => {
    try {
      const raw = localStorage.getItem(key());
      if (!raw) return defaultState(RMS);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState(RMS);
      // Ensure required keys exist
      return {
        abs: parsed.abs && typeof parsed.abs === "object" ? parsed.abs : suggestAbsBounds(RMS),
        roomGaps: Array.isArray(parsed.roomGaps) ? parsed.roomGaps : [],
        planGaps: Array.isArray(parsed.planGaps) ? parsed.planGaps : []
      };
    } catch (_) {
      return defaultState(RMS);
    }
  };

  const save = (st) => {
    try { localStorage.setItem(key(), JSON.stringify(st)); } catch (_) {}
  };

  const fmtIDR = (RMS, n) => RMS?.ui?.formatIDR ? RMS.ui.formatIDR(n) : ("IDR " + Number(n||0).toLocaleString("en-US"));

  const applyConstraints = (RMS, price, ctx) => {
    const st = RMS.restrictions.getState();
    if (!st) return { price, changed: false, applied: [] };

    let minB = -Infinity;
    let maxB = Infinity;
    const applied = [];

    const rt = ctx?.roomType;
    const rp = ctx?.ratePlan;
    const dk = ctx?.dateKey;

    // Absolute bounds
    if (rt && st.abs?.[rt]?.enabled) {
      const ab = st.abs[rt];
      if (Number.isFinite(ab.min)) { minB = Math.max(minB, ab.min); applied.push({ type:"absMin", roomType:rt, value:ab.min }); }
      if (Number.isFinite(ab.max)) { maxB = Math.min(maxB, ab.max); applied.push({ type:"absMax", roomType:rt, value:ab.max }); }
    }

    // Room gaps: A - B between [minGap, maxGap]
    if (dk && rp && rt && Array.isArray(st.roomGaps)) {
      st.roomGaps.forEach(g => {
        if (!g || g.enabled === false) return;
        const a = g.a, b = g.b;
        if (!a || !b) return;
        const minGap = (g.minGap === null || g.minGap === undefined) ? null : Number(g.minGap);
        const maxGap = (g.maxGap === null || g.maxGap === undefined) ? null : Number(g.maxGap);
        if (rt !== a && rt !== b) return;

        const other = (rt === a) ? b : a;
        const otherPrice = RMS?.db?.getPrice?.(dk, other, rp);
        if (!Number.isFinite(otherPrice)) return;

        if (rt === a) {
          if (Number.isFinite(minGap)) { minB = Math.max(minB, otherPrice + minGap); applied.push({ type:"roomGapMin", a, b, value:minGap }); }
          if (Number.isFinite(maxGap)) { maxB = Math.min(maxB, otherPrice + maxGap); applied.push({ type:"roomGapMax", a, b, value:maxGap }); }
        } else {
          // rt === b; (a - b) in [minGap, maxGap] => b in [a - maxGap, a - minGap]
          if (Number.isFinite(maxGap)) { minB = Math.max(minB, otherPrice - maxGap); applied.push({ type:"roomGapMinInv", a, b, value:maxGap }); }
          if (Number.isFinite(minGap)) { maxB = Math.min(maxB, otherPrice - minGap); applied.push({ type:"roomGapMaxInv", a, b, value:minGap }); }
        }
      });
    }

    // Plan gaps: A - B between [minGap, maxGap]
    if (dk && rt && rp && Array.isArray(st.planGaps)) {
      st.planGaps.forEach(g => {
        if (!g || g.enabled === false) return;
        const a = g.a, b = g.b;
        if (!a || !b) return;
        const minGap = (g.minGap === null || g.minGap === undefined) ? null : Number(g.minGap);
        const maxGap = (g.maxGap === null || g.maxGap === undefined) ? null : Number(g.maxGap);
        if (rp !== a && rp !== b) return;

        const other = (rp === a) ? b : a;
        const otherPrice = RMS?.db?.getPrice?.(dk, rt, other);
        if (!Number.isFinite(otherPrice)) return;

        if (rp === a) {
          if (Number.isFinite(minGap)) { minB = Math.max(minB, otherPrice + minGap); applied.push({ type:"planGapMin", a, b, value:minGap }); }
          if (Number.isFinite(maxGap)) { maxB = Math.min(maxB, otherPrice + maxGap); applied.push({ type:"planGapMax", a, b, value:maxGap }); }
        } else {
          if (Number.isFinite(maxGap)) { minB = Math.max(minB, otherPrice - maxGap); applied.push({ type:"planGapMinInv", a, b, value:maxGap }); }
          if (Number.isFinite(minGap)) { maxB = Math.min(maxB, otherPrice - minGap); applied.push({ type:"planGapMaxInv", a, b, value:minGap }); }
        }
      });
    }

    let p = Number(price);
    if (!Number.isFinite(p)) return { price, changed: false, applied: [] };

    // If constraints conflict, snap to minB
    if (minB > maxB) {
      p = minB;
      return { price: p, changed: true, applied: applied.concat([{ type:"conflict", minB, maxB }]) };
    }

    const before = p;

    if (Number.isFinite(minB) || Number.isFinite(maxB)) {
      const lo = Number.isFinite(minB) ? minB : -Infinity;
      const hi = Number.isFinite(maxB) ? maxB : Infinity;
      p = clamp(p, lo, hi);
    }

    // Re-apply rounding (then clamp again)
    const round = RMS?.modules?.pricingRules?.getRules?.()?.rounding;
    const r = Number(round);
    if (Number.isFinite(r) && r > 0) {
      p = Math.round(p / r) * r;
      if (Number.isFinite(minB) || Number.isFinite(maxB)) {
        const lo = Number.isFinite(minB) ? minB : -Infinity;
        const hi = Number.isFinite(maxB) ? maxB : Infinity;
        p = clamp(p, lo, hi);
      }
    }

    return { price: p, changed: p !== before, applied };
  };

  RMS.registerModule("pricingRestrictions", {
    init(RMS) {
        RMS.events?.on("propertyChanged", ()=>{
          // Reload restrictions for the new property
          try { this._load?.(RMS); } catch(e){}
          this.render?.(RMS);
        });

      this._state = load(RMS);
      this._defaults = defaultState(RMS);

      // Public API
      RMS.restrictions = {
        getState: () => this._state,
        setState: (st) => { this._state = st; save(this._state); },
        resetSuggested: () => { this._state.abs = suggestAbsBounds(RMS); save(this._state); },
        apply: (price, ctx) => applyConstraints(RMS, price, ctx)
      };

      // Patch pricing recommendation to enforce restrictions
      const tryPatch = () => {
        if (this._patched) return;
        const pricing = RMS?.pricing;
        if (!pricing || typeof pricing.recommendPrice !== "function") return;
        const orig = pricing.recommendPrice.bind(pricing);
        pricing.recommendPrice = (current, occPercent, dateKey=null, roomType=null, ratePlan=null) => {
          const rec = orig(current, occPercent, dateKey, roomType, ratePlan);
          if (!rec || !Number.isFinite(rec.recommended)) return rec;
          const out = RMS.restrictions.apply(rec.recommended, { dateKey, roomType, ratePlan, currentPrice: current });
          if (out && out.changed) {
            rec.recommended = out.price;
            rec.restrictionsApplied = out.applied;
          }
          return rec;
        };
        this._patched = true;
      };

      // Patch now and again after modules init (safety)
      tryPatch();
      setTimeout(tryPatch, 0);

      // Wire nav buttons
      document.getElementById("btnRestrBackRules")?.addEventListener("click", () => {
        RMS.ui?.toast?.("Pricing rules", { title: "Navigation" });
        document.querySelector(`#leftMenu [data-nav="rules"]`)?.click?.();
      });
      document.getElementById("btnRestrBackCalendar")?.addEventListener("click", () => {
        RMS.ui?.toast?.("Calendar view", { title: "Navigation" });
        document.querySelector(`#leftMenu [data-nav="calendar"]`)?.click?.();
      });
      document.getElementById("btnRestrSave")?.addEventListener("click", () => {
        save(this._state);
        RMS.ui?.toast?.("Saved locally", { title: "Pricing restrictions" });
      });
      document.getElementById("btnRestrResetAbs")?.addEventListener("click", () => {
        this._state.abs = suggestAbsBounds(RMS);
        save(this._state);
        this.render(RMS);
        RMS.ui?.toast?.("Reset", { title: "Absolute bounds" });
      });
      document.getElementById("btnRestrAddRoomGap")?.addEventListener("click", () => {
        const meta = getMeta(RMS);
        const a = meta.roomTypes?.[0] || "";
        const b = meta.roomTypes?.[1] || meta.roomTypes?.[0] || "";
        this._state.roomGaps.push({ enabled:true, a, b, minGap: null, maxGap: null });
        save(this._state);
        this.render(RMS);
      });
      document.getElementById("btnRestrAddPlanGap")?.addEventListener("click", () => {
        const meta = getMeta(RMS);
        const a = meta.ratePlans?.[0] || "";
        const b = meta.ratePlans?.[1] || meta.ratePlans?.[0] || "";
        this._state.planGaps.push({ enabled:true, a, b, minGap: null, maxGap: null });
        save(this._state);
        this.render(RMS);
      });

      // Event delegation for table changes
      const root = document.getElementById("pricingRestrictionsView");
      if (root) {
        root.addEventListener("change", (e) => {
          const el = e.target;
          if (!(el instanceof HTMLElement)) return;

          const type = el.getAttribute("data-restr-type");
          const idx = parseInt(el.getAttribute("data-idx") || "-1", 10);
          const field = el.getAttribute("data-field");
          if (!type || !field) return;

          if (type === "abs") {
            const rt = el.getAttribute("data-room");
            if (!rt) return;
            const row = this._state.abs[rt] || (this._state.abs[rt] = { enabled:true, min:null, max:null });
            if (field === "enabled") row.enabled = !!(el).checked;
            if (field === "min") row.min = parseNum((el).value);
            if (field === "max") row.max = parseNum((el).value);
            save(this._state);
            return;
          }

          const arr = (type === "roomGap") ? this._state.roomGaps : (type === "planGap" ? this._state.planGaps : null);
          if (!arr || idx < 0 || idx >= arr.length) return;
          const row = arr[idx];

          if (field === "enabled") row.enabled = !!(el).checked;
          if (field === "a") row.a = (el).value;
          if (field === "b") row.b = (el).value;
          if (field === "minGap") row.minGap = parseNum((el).value);
          if (field === "maxGap") row.maxGap = parseNum((el).value);
          save(this._state);
        });

        root.addEventListener("click", (e) => {
          const el = e.target;
          if (!(el instanceof HTMLElement)) return;
          const action = el.getAttribute("data-action");
          if (!action) return;
          const type = el.getAttribute("data-restr-type");
          const idx = parseInt(el.getAttribute("data-idx") || "-1", 10);
          if (action === "delete" && idx >= 0) {
            if (type === "roomGap") {
              this._state.roomGaps.splice(idx, 1);
              save(this._state);
              this.render(RMS);
            }
            if (type === "planGap") {
              this._state.planGaps.splice(idx, 1);
              save(this._state);
              this.render(RMS);
            }
          }
        });
      }
    },

    render(RMS) {
      const meta = getMeta(RMS);
      const st = this._state;

      // Abs table
      const absBody = document.getElementById("restrAbsTbody");
      if (absBody) {
        absBody.innerHTML = meta.roomTypes.map(rt => {
          const row = st.abs?.[rt] || { enabled:false, min:null, max:null };
          const minV = (row.min == null) ? "" : String(row.min);
          const maxV = (row.max == null) ? "" : String(row.max);
          return `
            <tr>
              <td>
                <input type="checkbox" ${row.enabled ? "checked":""}
                  data-restr-type="abs" data-field="enabled" data-room="${rt}">
              </td>
              <td>${rt}</td>
              <td>
                <input type="number" min="0" step="1000" value="${minV}"
                  placeholder="e.g. 1200000"
                  data-restr-type="abs" data-field="min" data-room="${rt}">
              </td>
              <td>
                <input type="number" min="0" step="1000" value="${maxV}"
                  placeholder="e.g. 3500000"
                  data-restr-type="abs" data-field="max" data-room="${rt}">
              </td>
            </tr>
          `;
        }).join("");
      }

      const makeSelect = (opts, val, attrs) => {
        const o = opts.map(x => `<option value="${x}" ${x===val?"selected":""}>${x}</option>`).join("");
        return `<select class="select" ${attrs}>${o}</select>`;
      };

      // Room gaps
      const roomBody = document.getElementById("restrRoomGapTbody");
      if (roomBody) {
        if (!st.roomGaps.length) {
          roomBody.innerHTML = `<tr class="restr-empty"><td colspan="6" class="rms-muted">No room gap constraints. Click “Add constraint” to create one.</td></tr>`;
        } else {
          roomBody.innerHTML = st.roomGaps.map((g, i) => {
            const minV = g.minGap == null ? "" : String(g.minGap);
            const maxV = g.maxGap == null ? "" : String(g.maxGap);
            return `
              <tr>
                <td><input type="checkbox" ${g.enabled!==false?"checked":""} data-restr-type="roomGap" data-idx="${i}" data-field="enabled"></td>
                <td>${makeSelect(meta.roomTypes, g.a, `data-restr-type="roomGap" data-idx="${i}" data-field="a"` )}</td>
                <td>${makeSelect(meta.roomTypes, g.b, `data-restr-type="roomGap" data-idx="${i}" data-field="b"` )}</td>
                <td><input type="number" step="1000" value="${minV}" placeholder="e.g. 200000" data-restr-type="roomGap" data-idx="${i}" data-field="minGap"></td>
                <td><input type="number" step="1000" value="${maxV}" placeholder="e.g. 800000" data-restr-type="roomGap" data-idx="${i}" data-field="maxGap"></td>
                <td><button class="button secondary" type="button" data-action="delete" data-restr-type="roomGap" data-idx="${i}">Delete</button></td>
              </tr>
            `;
          }).join("");
        }
      }

      // Plan gaps
      const planBody = document.getElementById("restrPlanGapTbody");
      if (planBody) {
        if (!st.planGaps.length) {
          planBody.innerHTML = `<tr class="restr-empty"><td colspan="6" class="rms-muted">No rate plan gap constraints. Click “Add constraint” to create one.</td></tr>`;
        } else {
          planBody.innerHTML = st.planGaps.map((g, i) => {
            const minV = g.minGap == null ? "" : String(g.minGap);
            const maxV = g.maxGap == null ? "" : String(g.maxGap);
            return `
              <tr>
                <td><input type="checkbox" ${g.enabled!==false?"checked":""} data-restr-type="planGap" data-idx="${i}" data-field="enabled"></td>
                <td>${makeSelect(meta.ratePlans, g.a, `data-restr-type="planGap" data-idx="${i}" data-field="a"` )}</td>
                <td>${makeSelect(meta.ratePlans, g.b, `data-restr-type="planGap" data-idx="${i}" data-field="b"` )}</td>
                <td><input type="number" step="1000" value="${minV}" placeholder="e.g. 50000" data-restr-type="planGap" data-idx="${i}" data-field="minGap"></td>
                <td><input type="number" step="1000" value="${maxV}" placeholder="e.g. 300000" data-restr-type="planGap" data-idx="${i}" data-field="maxGap"></td>
                <td><button class="button secondary" type="button" data-action="delete" data-restr-type="planGap" data-idx="${i}">Delete</button></td>
              </tr>
            `;
          }).join("");
        }
      }
    }
  });
})();
