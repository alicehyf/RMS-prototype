/* =========================================================
       MODULE: PRICING RULES
       (Editable rule set for recommendations; stored in localStorage)
    ========================================================== */
    RMS.registerModule("pricingRules", {
      storageKey: "rms_pricing_rules_v1",
      logKey: "rms_pricing_rules_log_v1",

      defaultRules(){
        return {
          rounding: 5000,
          soldOut: {
            hideRecommendation: true,
            hideLatestChange: true
          },
pricingMode: "occ",
leadTimeTiers: [
  { minDays: 0,  maxDays: 7,   adjPct: 0 },
  { minDays: 8,  maxDays: 30,  adjPct: 2 },
  { minDays: 31, maxDays: 90,  adjPct: 5 },
  { minDays: 91, maxDays: 365, adjPct: 8 }
],
          occupancyTiers: [
            { min: 0,  max: 35, adjPct: -5 },
            { min: 36, max: 45, adjPct: -3 },
            { min: 46, max: 69, adjPct: 0 },
            { min: 70, max: 84, adjPct: 3 },
            { min: 85, max: 100, adjPct: 6 }
          ]
        };
      },

      getRules(){
        try {
          const raw = localStorage.getItem(this.storageKey);
          if (!raw) return this.defaultRules();
          const parsed = JSON.parse(raw);
          return this.normalizeRules(parsed);
        } catch (e) {
          return this.defaultRules();
        }
      },

      normalizeRules(r){
        const d = this.defaultRules();
        const out = {
  rounding: Number(r?.rounding ?? d.rounding),
  soldOut: {
    hideRecommendation: !!(r?.soldOut?.hideRecommendation ?? d.soldOut.hideRecommendation),
    hideLatestChange: !!(r?.soldOut?.hideLatestChange ?? d.soldOut.hideLatestChange)
  },
  pricingMode: (typeof r?.pricingMode === "string" ? r.pricingMode : d.pricingMode),
  leadTimeTiers: Array.isArray(r?.leadTimeTiers) ? r.leadTimeTiers.map(t => ({
    minDays: Number(t.minDays),
    maxDays: Number(t.maxDays),
    adjPct: Number(t.adjPct)
  })) : d.leadTimeTiers,
  occupancyTiers: Array.isArray(r?.occupancyTiers) ? r.occupancyTiers.map(t => ({
    min: Number(t.min),
    max: Number(t.max),
    adjPct: Number(t.adjPct)
  })) : d.occupancyTiers
};

        if (!Number.isFinite(out.rounding) || out.rounding <= 0) out.rounding = d.rounding;

// Pricing mode
const allowedModes = new Set(["manual", "occ", "occ_lead"]);
if (!allowedModes.has(out.pricingMode)) out.pricingMode = d.pricingMode;

// Lead time tiers
out.leadTimeTiers = (out.leadTimeTiers || [])
  .filter(t => Number.isFinite(t.minDays) && Number.isFinite(t.maxDays) && Number.isFinite(t.adjPct))
  .map(t => ({
    minDays: Math.max(0, Math.round(t.minDays)),
    maxDays: Math.max(0, Math.round(t.maxDays)),
    adjPct: Math.max(-100, Math.min(100, Number(t.adjPct)))
  }))
  .filter(t => t.maxDays >= t.minDays)
  .sort((a,b) => a.minDays - b.minDays);

if (!out.leadTimeTiers.length) out.leadTimeTiers = d.leadTimeTiers;

        // Clean tiers
        out.occupancyTiers = out.occupancyTiers
          .filter(t => Number.isFinite(t.min) && Number.isFinite(t.max) && Number.isFinite(t.adjPct))
          .map(t => ({
            min: Math.max(0, Math.min(100, Math.round(t.min))),
            max: Math.max(0, Math.min(100, Math.round(t.max))),
            adjPct: Math.max(-100, Math.min(100, Number(t.adjPct)))
          }))
          .sort((a,b) => a.min - b.min);

        if (!out.occupancyTiers.length) out.occupancyTiers = d.occupancyTiers;

        return out;
      },

      setRules(rules, { logMessage } = {}){
        const normalized = this.normalizeRules(rules);
        localStorage.setItem(this.storageKey, JSON.stringify(normalized));
        this.appendLog(logMessage || "Saved pricing rules");
        return normalized;
      },

      reset(){
        localStorage.removeItem(this.storageKey);
        this.appendLog("Reset to default rules");
      },

      getLog(){
        try {
          const raw = localStorage.getItem(this.logKey);
          if (!raw) return [];
          const arr = JSON.parse(raw);
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      },

      appendLog(message){
        const ts = new Date().toISOString().replace("T"," ").slice(0,19);
        const line = `[${ts}] ${message}`;
        const log = this.getLog();
        log.unshift(line);
        localStorage.setItem(this.logKey, JSON.stringify(log.slice(0, 50)));
      },

      getModeLabel(mode){
        const m = String(mode || "");
        if (m === "manual") return "Manual pricing";
        if (m === "occ") return "Occupancy-based";
        if (m === "occ_lead") return "Lead time + occupancy";
        return m || "—";
      },

      // Public API consumed by the calendar view
      recommendPrice(current, occPercent, dateKey = null){
  if (current == null) return null;
  const rules = this.getRules();
  const mode = rules.pricingMode || "occ";

  // Manual pricing mode: no automatic recommendation
  if (mode === "manual") return null;

  // Occupancy adjustment
  const occ = Number(occPercent);
  const occTier = rules.occupancyTiers.find(t => occ >= t.min && occ <= t.max);
  const occAdjPct = occTier ? Number(occTier.adjPct) : 0;

  // Lead time adjustment (only for occ_lead)
  let leadAdjPct = 0;
  if (mode === "occ_lead" && dateKey) {
    const parseKey = (k) => {
      const [y,m,d] = String(k).split("-").map(Number);
      return new Date(y, (m||1) - 1, d || 1);
    };
    const refKey = window.RMS?.time?.businessDateKey || dateKey;
    const ms = parseKey(dateKey).getTime() - parseKey(refKey).getTime();
    const leadDays = Math.max(0, Math.round(ms / 86400000));

    const lt = rules.leadTimeTiers.find(t => leadDays >= t.minDays && leadDays <= t.maxDays);
    leadAdjPct = lt ? Number(lt.adjPct) : 0;
  }

  const totalAdj = (occAdjPct + leadAdjPct) / 100;
  const rec = current * (1 + totalAdj);
  const round = Math.max(1, Number(rules.rounding) || 1);
  return Math.round(rec / round) * round;
},

      explainRecommendation(current, occPercent, dateKey = null){
        if (current == null) return null;
        const rules = this.getRules();
        const mode = rules.pricingMode || "occ";
        if (mode === "manual") return { mode, current, recommended: null, note: "Manual pricing mode" };

        const occ = Number(occPercent);
        const occTier = rules.occupancyTiers.find(t => occ >= t.min && occ <= t.max) || null;
        const occAdjPct = occTier ? Number(occTier.adjPct) : 0;

        let leadDays = null;
        let leadTier = null;
        let leadAdjPct = 0;

        if (mode === "occ_lead" && dateKey) {
          const parseKey = (k) => {
            const [y,m,d] = String(k).split("-").map(Number);
            return new Date(y, (m||1) - 1, d || 1);
          };
          const refKey = window.RMS?.time?.businessDateKey || dateKey;
          const ms = parseKey(dateKey).getTime() - parseKey(refKey).getTime();
          leadDays = Math.max(0, Math.round(ms / 86400000));
          leadTier = (rules.leadTimeTiers || []).find(t => leadDays >= t.minDays && leadDays <= t.maxDays) || null;
          leadAdjPct = leadTier ? Number(leadTier.adjPct) : 0;
        }

        const totalAdjPct = occAdjPct + leadAdjPct;
        const recRaw = current * (1 + totalAdjPct / 100);
        const round = Math.max(1, Number(rules.rounding) || 1);
        const recommended = Math.round(recRaw / round) * round;

        return {
          mode,
          current,
          recommended,
          rounding: round,
          occPercent: occ,
          occTier,
          occAdjPct,
          leadDays,
          leadTier,
          leadAdjPct,
          totalAdjPct
        };
      },


      init(RMS){
        // Expose helpers under RMS.pricing for convenient access across modules
        RMS.pricing = {
          getRules: () => this.getRules(),
          setRules: (r, opts) => this.setRules(r, opts),
          recommendPrice: (current, occPercent, dateKey = null) => this.recommendPrice(current, occPercent, dateKey),
          explainRecommendation: (current, occPercent, dateKey = null) => this.explainRecommendation(current, occPercent, dateKey),
          getModeLabel: (mode) => this.getModeLabel(mode)
        };

        // Establish a consistent "business date" for lead-time calculations in this prototype
        if (!RMS.time) RMS.time = {};
        if (!RMS.time.businessDateKey) {
          try {
            const keys = Object.keys(RMS.db?.data?.prices || {});
            RMS.time.businessDateKey = keys.sort().slice(-1)[0] || new Date().toISOString().slice(0,10);
          } catch {
            RMS.time.businessDateKey = new Date().toISOString().slice(0,10);
          }
        }

        // Bind UI controls (rules view)
        document.getElementById("btnRulesSave")?.addEventListener("click", () => {
          const rules = this.readFromUI();
          if (!rules) return; // validation already shown
          this.setRules(rules, { logMessage: "Saved changes from Pricing rule change page" });
          RMS.ui?.toast?.("Saved", { title: "Pricing rules" });
          // Re-render details table if open
          RMS.modules.coreCalendar?.renderDetailsTable?.(RMS);
          this.render(RMS);
        });

        document.getElementById("btnRulesReset")?.addEventListener("click", () => {
          this.reset();
          RMS.ui?.toast?.("Default rules restored", { title: "Pricing rules" });
          this.render(RMS);
          RMS.modules.coreCalendar?.renderDetailsTable?.(RMS);
        });

        document.getElementById("btnRulesAddTier")?.addEventListener("click", () => {
  const cur = this.readFromUI({ validate: false }) || this.getRules();
  cur.occupancyTiers.push({ min: 0, max: 0, adjPct: 0 });
  this.render(RMS, cur);
});

document.getElementById("btnRulesAddLeadTier")?.addEventListener("click", () => {
  const cur = this.readFromUI({ validate: false }) || this.getRules();
  cur.leadTimeTiers = cur.leadTimeTiers || [];
  cur.leadTimeTiers.push({ minDays: 0, maxDays: 0, adjPct: 0 });
  this.render(RMS, cur);
});

document.getElementById("btnRulesResetLead")?.addEventListener("click", () => {
  const cur = this.readFromUI({ validate: false }) || this.getRules();
  const defaults = this.defaultRules();
  cur.leadTimeTiers = defaults.leadTimeTiers;
  this.render(RMS, cur);
});

// Mode selection: re-render instantly (Save to apply)
document.getElementById("pricingModeList")?.addEventListener("change", () => {
  const cur = this.readFromUI({ validate: false });
  if (!cur) return;
  this.render(RMS, cur);
});

// Delete tier actions (draft only; Save to apply)
document.getElementById("rulesTierBody")?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.('button[data-action="delete-tier"]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const cur = this.readFromUI({ validate: false });
  if (!cur) return;
  if (Number.isFinite(idx)) cur.occupancyTiers.splice(idx, 1);
  this.render(RMS, cur);
});

document.getElementById("rulesLeadTierBody")?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.('button[data-action="delete-lead-tier"]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const cur = this.readFromUI({ validate: false });
  if (!cur) return;
  cur.leadTimeTiers = cur.leadTimeTiers || [];
  if (Number.isFinite(idx)) cur.leadTimeTiers.splice(idx, 1);
  this.render(RMS, cur);
});

document.getElementById("rulesTierBody")?.addEventListener("input"
, (e) => {
          const t = e.target;
          if (!(t instanceof HTMLInputElement)) return;
          // keep UI responsive; no-op here, values will be read on Save
        });
      },

      readFromUI({ validate = true } = {}){
        const tbody = document.getElementById("rulesTierBody");
        if (!tbody) return null;

        const rows = [...tbody.querySelectorAll("tr")];
        const tiers = rows.map((tr) => {
          const min = Number(tr.querySelector('input[data-field="min"]')?.value);
          const max = Number(tr.querySelector('input[data-field="max"]')?.value);
          const adjPct = Number(tr.querySelector('input[data-field="adjPct"]')?.value);
          return { min, max, adjPct };
        });

        // Basic validation (occupancy tiers)
        if (validate) {
          for (const t of tiers) {
            if (!Number.isFinite(t.min) || !Number.isFinite(t.max) || !Number.isFinite(t.adjPct)) {
              window.RMS?.ui?.toast?.("Please fill in all tier values.", { title: "Validation" });
              return null;
            }
            if (t.min > t.max) {
              window.RMS?.ui?.toast?.("Tier min occupancy must be ≤ max occupancy.", { title: "Validation" });
              return null;
            }
          }
        } else {
          // Make the draft robust while switching modes (avoid blocking on partially edited inputs)
          for (const t of tiers) {
            if (!Number.isFinite(t.min)) t.min = 0;
            if (!Number.isFinite(t.max)) t.max = 0;
            if (!Number.isFinite(t.adjPct)) t.adjPct = 0;
            if (t.min > t.max) [t.min, t.max] = [t.max, t.min];
          }
        }

        
        // Lead-time tiers
        const leadTbody = document.getElementById("rulesLeadTierBody");
        const leadRows = leadTbody ? [...leadTbody.querySelectorAll("tr")] : [];
        const leadTimeTiers = leadRows.length ? leadRows.map((tr) => {
          const minDays = Number(tr.querySelector('input[data-field="minDays"]')?.value);
          const maxDays = Number(tr.querySelector('input[data-field="maxDays"]')?.value);
          const adjPct = Number(tr.querySelector('input[data-field="adjPct"]')?.value);
          return { minDays, maxDays, adjPct };
        }) : (this.getRules().leadTimeTiers || []);

        if (validate) {
          for (const t of leadTimeTiers) {
            if (!Number.isFinite(t.minDays) || !Number.isFinite(t.maxDays) || !Number.isFinite(t.adjPct)) {
              window.RMS?.ui?.toast?.("Please fill in all lead-time tier values.", { title: "Validation" });
              return null;
            }
            if (t.minDays > t.maxDays) {
              window.RMS?.ui?.toast?.("Lead-time tier min days must be ≤ max days.", { title: "Validation" });
              return null;
            }
          }
        } else {
          for (const t of leadTimeTiers) {
            if (!Number.isFinite(t.minDays)) t.minDays = 0;
            if (!Number.isFinite(t.maxDays)) t.maxDays = 0;
            if (!Number.isFinite(t.adjPct)) t.adjPct = 0;
            if (t.minDays > t.maxDays) [t.minDays, t.maxDays] = [t.maxDays, t.minDays];
          }
        }

const rounding = Number(document.getElementById("ruleRounding")?.value);
        if (!Number.isFinite(rounding) || rounding <= 0) {
          window.RMS?.ui?.toast?.("Rounding must be a positive number.", { title: "Validation" });
          return null;
        }

        const hideRec = !!document.getElementById("ruleSoldOutHideRec")?.checked;
        const hideLatest = !!document.getElementById("ruleSoldOutHideLatest")?.checked;

        const pricingMode = document.querySelector('input[name="pricingMode"]:checked')?.value || this.getRules().pricingMode || "occ";

        return {
          pricingMode,
          rounding,
          soldOut: {
            hideRecommendation: hideRec,
            hideLatestChange: hideLatest
          },
          occupancyTiers: tiers,
          leadTimeTiers: leadTimeTiers
        };
      },

      render(RMS, draftRules = null){
  const appliedRules = this.getRules();
  const rules = draftRules ? this.normalizeRules(draftRules) : appliedRules;

  // Mode UI (applied vs editing)
  const appliedMode = appliedRules.pricingMode || "occ";
  const editingMode = rules.pricingMode || "occ";
  const pill = document.getElementById("activeModePill");
  if (pill) pill.textContent = `Applied mode: ${this.getModeLabel(appliedMode)}`;

  const modeNote = document.getElementById("modeNote");
  if (modeNote) {
    const extra = (editingMode !== appliedMode) ? ` • Editing: ${this.getModeLabel(editingMode)} (Save to apply)` : "";
    let detail = "";
    if (editingMode === "manual") {
      detail = "Manual mode disables automatic recommendations.";
    } else if (editingMode === "occ") {
      detail = "Recommendations adjust price based on occupancy tiers only.";
    } else {
      detail = "Recommendations increase with both lead time (farther dates) and occupancy.";
    }
    modeNote.textContent = `${detail}${extra}`;
  }

  // Set radio selection
  document.querySelectorAll('input[name="pricingMode"]').forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = (el.value === editingMode);
  });

  // Enable/disable rule editing panels depending on mode
  const tiersCard = document.getElementById("rulesTiersCard");
  const behaviorCard = document.getElementById("rulesBehaviorCard");
  const isManual = (editingMode === "manual");
  tiersCard?.classList.toggle("rules-disabled", isManual);
  behaviorCard?.classList.toggle("rules-disabled", isManual);

  const leadCard = document.getElementById("rulesLeadCard");
  const showLead = (editingMode === "occ_lead");
  if (leadCard) leadCard.classList.toggle("hidden", !showLead);

  // Update section labels to match the selected mode
  const occTitle = document.getElementById("rulesOccTitle");
  const occDesc = document.getElementById("rulesOccDesc");
  if (occTitle) occTitle.textContent = (editingMode === "occ_lead")
    ? "Occupancy adjustment tiers"
    : "Occupancy-based recommendation tiers";
  if (occDesc) occDesc.textContent = (editingMode === "occ_lead")
    ? "Occupancy contributes an adjustment by tier. Combined with lead-time tiers below."
    : "For the selected date and room type, the recommendation adjusts the current price by the tier percentage.";

  // Lead-time tiers table
  const ltBody = document.getElementById("rulesLeadTierBody");
  if (ltBody) {
    ltBody.innerHTML = (rules.leadTimeTiers || []).map((t, i) => `
      <tr>
        <td style="padding:10px 12px;"><input class="input" type="number" min="0" max="3650" data-idx="${i}" data-field="minDays" value="${t.minDays}" style="width:140px;"></td>
        <td style="padding:10px 12px;"><input class="input" type="number" min="0" max="3650" data-idx="${i}" data-field="maxDays" value="${t.maxDays}" style="width:140px;"></td>
        <td style="padding:10px 12px; display:flex; gap:10px; align-items:center;">
          <input class="input" type="number" min="-100" max="100" step="1" data-idx="${i}" data-field="adjPct" value="${t.adjPct}" style="width:140px;">
          <button class="button" data-action="delete-lead-tier" data-idx="${i}" style="padding:6px 10px;">Delete</button>
        </td>
      </tr>
    `).join("");
  }

        // Controls
        const roundingEl = document.getElementById("ruleRounding");
        if (roundingEl) roundingEl.value = String(rules.rounding);

        const hideRec = document.getElementById("ruleSoldOutHideRec");
        if (hideRec) hideRec.checked = !!rules.soldOut.hideRecommendation;

        const hideLatest = document.getElementById("ruleSoldOutHideLatest");
        if (hideLatest) hideLatest.checked = !!rules.soldOut.hideLatestChange;

        // Tiers
        const tbody = document.getElementById("rulesTierBody");
        if (tbody) {
          tbody.innerHTML = rules.occupancyTiers.map((t, i) => `
            <tr>
              <td><input class="input" type="number" min="0" max="100" step="1" data-idx="${i}" data-field="min" value="${t.min}" style="width:120px;"></td>
              <td><input class="input" type="number" min="0" max="100" step="1" data-idx="${i}" data-field="max" value="${t.max}" style="width:120px;"></td>
              <td style="display:flex; gap:10px; align-items:center;">
                <input class="input" type="number" min="-100" max="100" step="0.5" data-idx="${i}" data-field="adjPct" value="${t.adjPct}" style="width:120px;">
                <button class="button" data-action="delete-tier" data-idx="${i}" style="padding:6px 10px;">Delete</button>
              </td>
            </tr>
          `).join("");

          // bind delete buttons
          tbody.querySelectorAll('button[data-action="delete-tier"]').forEach((btn) => {
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              const idx = Number(btn.getAttribute("data-idx"));
              const cur = this.readFromUI();
              if (!cur) return;
              cur.occupancyTiers.splice(idx, 1);
              this.render(RMS, cur);
            });
          });
        }

        // Log
        const logEl = document.getElementById("rulesLog");
        if (logEl) {
          const log = this.getLog();
          logEl.innerHTML = log.length ? log.map(l => `<div>${l.replace(/</g,"&lt;")}</div>`).join("") : `<div class="rms-muted">No changes yet.</div>`;
        }
      }
    });

RMS.registerModule("coreCalendar", {
      init(RMS) {
        // default: Feb 2024 / day 16
        this.year = 2024;
        this.monthIndex = 1;
        this.monthName = "February";
        RMS.state.selectedDay = 16;

        RMS.state.selectedRoomType = "Ocean View Bungalow";
        RMS.state.selectedRatePlan = "Flexible Rate";

        this.bindEvents(RMS);
      
        this.bindPinnedControls(RMS);
},

      mondayIndex(jsDay){ return (jsDay + 6) % 7; },

      formatDate(d){
        return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" });
      },

      formatIDR(n){
        return "IDR " + Number(n).toLocaleString("en-US");
      },

      // Explain popover (Why this recommendation?)
      ensureExplainPopover(){
        let el = document.getElementById("rmsExplainPopover");
        if (el) return el;
        el = document.createElement("div");
        el.id = "rmsExplainPopover";
        el.className = "rms-explain-popover rms-hidden";
        el.innerHTML = `
          <div class="rms-explain-head">
            <div class="rms-explain-title">Price explanation</div>
            <button type="button" class="rms-explain-close" aria-label="Close">×</button>
          </div>
          <div class="rms-explain-body"></div>
        `;
        document.body.appendChild(el);

        el.querySelector(".rms-explain-close")?.addEventListener("click", () => this.hideExplainPopover());

        // click outside to close
        document.addEventListener("click", (e) => {
          if (el.classList.contains("rms-hidden")) return;
          const inside = e.target?.closest?.("#rmsExplainPopover");
          const btn = e.target?.closest?.(".rms-explain-btn");
          if (!inside && !btn) this.hideExplainPopover();
        });

        // esc to close
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") this.hideExplainPopover();
        });

        return el;
      },

      hideExplainPopover(){
        const el = document.getElementById("rmsExplainPopover");
        if (el) el.classList.add("rms-hidden");
      },

      showExplainPopover(RMS, anchorEl, payload){
        const el = this.ensureExplainPopover();
        const body = el.querySelector(".rms-explain-body");
        if (!body) return;

        const explain = RMS.pricing?.explainRecommendation?.(
          Number(payload.current),
          Number(payload.occ),
          payload.dateKey
        );

        const dateLabel = this.formatDate(new Date(payload.year, payload.monthIndex, Number(payload.day)));
        const room = payload.room;
        const rate = payload.rate;

        if (!explain || explain.recommended == null) {
          body.innerHTML = `
            <div class="rms-muted">No recommendation in current pricing mode.</div>
            <div class="rms-explain-meta">${dateLabel} • ${room} • ${rate}</div>
          `;
        } else {
          const fmt = (n) => this.formatIDR(n);
          const occLine = (explain.occTier)
            ? `${explain.occPercent}% → Tier ${explain.occTier.min}–${explain.occTier.max}% (${explain.occAdjPct >= 0 ? "+" : ""}${explain.occAdjPct}%)`
            : `${explain.occPercent}% (no tier)`;

          const leadLine = (explain.mode === "occ_lead")
            ? (explain.leadTier
                ? `${explain.leadDays} days → Tier ${explain.leadTier.minDays}–${explain.leadTier.maxDays}d (${explain.leadAdjPct >= 0 ? "+" : ""}${explain.leadAdjPct}%)`
                : `${explain.leadDays} days (no tier)`)
            : "Not used";

          body.innerHTML = `
            <div class="rms-explain-meta">${dateLabel} • ${room} • ${rate}</div>

            <div class="rms-explain-grid">
              <div class="k">Current price</div><div class="v">${fmt(explain.current)}</div>
              <div class="k">Occupancy</div><div class="v">${occLine}</div>
              <div class="k">Lead time</div><div class="v">${leadLine}</div>
              <div class="k">Total adjustment</div><div class="v">${explain.totalAdjPct >= 0 ? "+" : ""}${explain.totalAdjPct}%</div>
              <div class="k">Rounding</div><div class="v">${fmt(explain.rounding)}</div>
              <div class="k"><strong>Recommended</strong></div><div class="v"><strong>${fmt(explain.recommended)}</strong></div>
            </div>

            <div class="rms-explain-foot">
              Mode: <strong>${RMS.pricing?.getModeLabel?.(explain.mode) || explain.mode}</strong>
            </div>
          `;
        }

        // position near anchor
        const r = anchorEl.getBoundingClientRect();
        const top = window.scrollY + r.bottom + 8;
        const left = Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 360);
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.classList.remove("rms-hidden");
      },

      getDateKey(day) {
        return RMS.db.dateKey(this.year, this.monthIndex, day);
      },

      // occupancy% computed from inventory for selected room type
      getOccPercent(day, roomType) {
        const dk = this.getDateKey(day);
        const inv = RMS.db.getInventory(dk, roomType);
        if (!inv.total) return 0;
        const occ = Math.round((1 - (inv.remaining / inv.total)) * 100);
        return Math.max(0, Math.min(100, occ));
      },

      render(RMS){
        const monthTitle = document.getElementById("monthTitle");
        if(monthTitle) monthTitle.textContent = `${this.monthName} ${this.year}`;

        // keep detailSub up to date
        const sub = document.getElementById("detailSub");
        if (sub) sub.textContent = `Showing: ${RMS.state.selectedRoomType} • ${RMS.state.selectedRatePlan}`;


const applyBtn = document.getElementById("detailApply");
if (applyBtn) {
  const pm = RMS.pricing?.getRules?.()?.pricingMode || "occ";
  applyBtn.disabled = (pm === "manual");
  applyBtn.title = (pm === "manual") ? "Manual pricing mode: no recommendation to apply." : "";
}

        this.renderCalendarGrid(RMS);
        this.renderTable(RMS);
        this.applySelectedDay(RMS, RMS.state.selectedDay ?? 1);
      },

      renderCalendarGrid(RMS){
        const grid = document.getElementById("calendarGrid");
        if(!grid) return;

        const firstDay = new Date(this.year, this.monthIndex, 1);
        const daysInMonth = new Date(this.year, this.monthIndex + 1, 0).getDate();
        const leadBlanks = this.mondayIndex(firstDay.getDay());

        const roomType = RMS.state.selectedRoomType;
        const ratePlan = RMS.state.selectedRatePlan;

        const cellHTML = (dayNumber, isMuted=false) => {
          if(isMuted) return `<div class="day muted" aria-hidden="true"></div>`;

          const dk = this.getDateKey(dayNumber);
          const price = RMS.db.getPrice(dk, roomType, ratePlan);
          const inv = RMS.db.getInventory(dk, roomType);
          const soldOut = inv.remaining <= 0;

          const occ = this.getOccPercent(dayNumber, roomType);

          return `
            <div class="day" role="button" tabindex="0" data-day="${dayNumber}">
              <div class="occfill" style="height:${occ}%;"></div>
              <div class="day-content">
                <div class="daynum">${dayNumber}</div>
                <div class="occ">${occ}% • ${inv.remaining}/${inv.total} left</div>
                ${soldOut ? (()=>{ const ls = RMS.db.getLastSoldPrice(dk, roomType, ratePlan); return `<div class="soldout">Sold out</div>${ls ? `<div class="footer-note" style="margin-top:4px;">Last sold: ${this.formatIDR(ls)}</div>` : ``}`; })() : `<div class="price">${this.formatIDR(price)}</div>`}
              </div>
            </div>
          `;
        };

        grid.innerHTML = "";
        for(let i=0;i<leadBlanks;i++) grid.insertAdjacentHTML("beforeend", cellHTML(null,true));
        for(let d=1; d<=daysInMonth; d++) grid.insertAdjacentHTML("beforeend", cellHTML(d,false));
        const total = leadBlanks + daysInMonth;
        const trailing = (7 - (total % 7)) % 7;
        for(let i=0;i<trailing;i++) grid.insertAdjacentHTML("beforeend", cellHTML(null,true));
      },

      renderTable(RMS){
        const tbody = document.getElementById("roomTableBody");
        const thead = document.getElementById("roomTableHead");
        if(!tbody) return;

        const day = RMS.state.selectedDay ?? 1;
        const dk = this.getDateKey(day);
        const ratePlan = RMS.state.selectedRatePlan;
        const selectedRoom = RMS.state.selectedRoomType;

        const otherPlans = RMS.db.data.ratePlans.filter(p => p !== ratePlan);

        if (thead) {
          const otherHead = otherPlans.map(p => `<th data-col="plan-${p}">${p} price</th>`).join("");
          thead.innerHTML = `
            <tr>
              <th data-col="room">Room type</th>
              <th data-col="avail">Availability change (last 24 hours)</th>
              <th data-col="latest">Latest price change (${ratePlan})</th>
              <th data-col="rec">Price recommendation (${ratePlan})</th>
${otherHead}
            </tr>
          `;
        }


        const recommend = (current, occPercent, dateKey) => RMS.pricing?.recommendPrice?.(current, occPercent, dateKey);

        tbody.innerHTML = "";

        RMS.db.data.roomTypes.forEach((room) => {
          const isFocused = (room === selectedRoom);

          const inv = RMS.db.getInventory(dk, room);
          const prevRemaining = Math.min(inv.total, Math.max(0, inv.remaining - inv.delta24h));
          const availHTML = `<span style="color:#6b7280;">${prevRemaining}</span> → <strong>${inv.remaining}</strong> <span style="color:#6b7280;">(of ${inv.total})</span>`;

          const sold = inv.remaining <= 0;

          const latest = RMS.db.getLatestChange(dk, room, ratePlan);
          const hideLatestWhenSoldOut = !!(RMS.pricing?.getRules?.()?.soldOut?.hideLatestChange);
          let latestHTML = "";
          if (sold && hideLatestWhenSoldOut) {
            latestHTML = `<span style="color:#9ca3af; font-style:italic;">Sold out</span>`;
          } else if (latest.old == null || latest.now == null) {
            latestHTML = `<span style="color:#9ca3af;">—</span><div class="footer-note" style="margin-top:2px;">${latest.when}</div>`;
          } else {
            latestHTML = `
              <span style="color:#6b7280;">${this.formatIDR(latest.old)}</span> → <strong>${this.formatIDR(latest.now)}</strong>
              <div class="footer-note" style="margin-top:2px;">${latest.when}</div>
            `;
          }

          const current = sold ? null : RMS.db.getPrice(dk, room, ratePlan);
          const occP = this.getOccPercent(day, room);
          const rec = sold ? null : recommend(current, occP);
          const mode = RMS.db.getPriceMode(dk, room, ratePlan);

          const hideRecWhenSoldOut = !!(RMS.pricing?.getRules?.()?.soldOut?.hideRecommendation);
          const pricingMode = RMS.pricing?.getRules?.()?.pricingMode || "occ";

          const canExplain = (!sold && pricingMode !== "manual" && current != null);
          const explainBtn = canExplain ? `
            <button type="button"
              class="rms-explain-btn"
              data-action="explain"
              data-date="${dk}"
              data-day="${day}"
              data-room="${room}"
              data-rate="${ratePlan}"
              data-current="${current}"
              data-occ="${occP}"
              data-rec="${rec ?? ""}"
              title="Why this recommendation?">ⓘ</button>` : "";


          let recHTML = "";
          if (sold && hideRecWhenSoldOut) {
            recHTML = `<span style="color:#9ca3af; font-style:italic;">Sold out (no recommendation)</span>`;
          } else if (sold) {
            const ls = RMS.db.getLastSoldPrice(dk, room, ratePlan);
            recHTML = (ls == null)
              ? `<span style="color:#9ca3af;">—</span>`
              : `
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <div style="color:#6b7280; font-weight:800;">${this.formatIDR(ls)}</div>
                  <div class="footer-note" style="margin-top:0;">Last sold (${ratePlan})</div>
                </div>
              `;
          } else if (pricingMode === "manual") {
            recHTML = `<span style="color:#6b7280; font-style:italic;">Manual pricing mode (no recommendation)</span>`;
          } else if (rec == null || current == null) {
            recHTML = `<span style="color:#9ca3af;">—</span>`;
          } else if (rec === current) {
            recHTML = `<span style="color:#6b7280; font-style:italic;">You are up to date</span> ${explainBtn}`;
          } else {
            const direction = (rec > current) ? "Increase to" : "Decrease to";
            const diffPct = Math.round(((rec - current) / current) * 100);
            recHTML = `
              <div style="display:flex; flex-direction:column; gap:2px;">
                <div style="font-weight:800;">${direction} ${this.formatIDR(rec)}</div>
                <div class="footer-note" style="margin-top:0;">
                  ${diffPct > 0 ? "+" : ""}${diffPct}% • ${mode} ${explainBtn}
                </div>
              </div>
            `;
          }
          const otherCellsHTML = otherPlans.map((p) => {
            const soldOut = inv.remaining <= 0;
            let pNow = soldOut ? null : RMS.db.getPrice(dk, room, p);
            if (pNow == null) {
              const ls = RMS.db.getLastSoldPrice(dk, room, p);
              if (ls != null) {
                return `
                  <td data-col="plan-${p}">
                    <div class="price" style="color:#6b7280;">
                      ${this.formatIDR(ls)}
                      <div class="footer-note" style="margin-top:2px;">Last sold</div>
                    </div>
                  </td>
                `;
              }
              return `<td data-col="plan-${p}"><span style="color:#9ca3af;">—</span></td>`;
            }
            return `
              <td data-col="plan-${p}">
                <div class="price">${this.formatIDR(pNow)}</div>
              </td>
            `;
          }).join("");


          tbody.insertAdjacentHTML("beforeend", `
            <tr class="${isFocused ? 'row-focused' : ''}" data-room="${room}">
              <td data-col="room">
                <strong>${room}</strong>
                ${isFocused ? ' <span style="color:#1d4ed8; font-size:12px; font-weight:600;">(Selected)</span>' : ""}
                <div class="footer-note" style="margin-top:4px;">Mode: ${mode}</div>
              </td>
              <td data-col="avail">${availHTML}</td>
              <td data-col="latest">${latestHTML}</td>
              <td data-col="rec">${recHTML}</td>
${otherCellsHTML}
            </tr>
          `);
        });

        this.autoSizeDetailColumns(RMS);
        this.applyPinnedColumns(RMS);
      },


      autoSizeDetailColumns(RMS){
        const wrap = document.getElementById("detailTableWrap");
        if(!wrap) return;
        const table = wrap.querySelector("table");
        if(!table) return;

        const headRow = table.querySelector("thead tr");
        if(!headRow) return;
        const headers = Array.from(headRow.children);
        if(headers.length === 0) return;

        // Create/refresh <colgroup> so we can control column widths precisely
        let colgroup = table.querySelector("colgroup");
        if(!colgroup){
          colgroup = document.createElement("colgroup");
          table.insertBefore(colgroup, table.firstChild);
        }
        colgroup.innerHTML = headers.map(() => "<col>").join("");
        const cols = Array.from(colgroup.children);

        // Measure a sample of rows for performance
        const sampleRows = Array.from(table.querySelectorAll("tbody tr")).slice(0, 14);

        // Fixed layout so col widths are respected
        table.style.tableLayout = "fixed";

        headers.forEach((th, idx) => {
          const key = th.getAttribute("data-col") || "";
          let maxW = th.scrollWidth;

          sampleRows.forEach((tr) => {
            const cell = tr.children[idx];
            if(cell) maxW = Math.max(maxW, cell.scrollWidth);
          });

          // Padding + sane min/max by column type
          let padding = 28;
          let min = 120;
          let cap = 520;

          if(key === "room"){ min = 220; cap = 560; }
          else if(key === "avail"){ min = 200; cap = 420; }
          else if(key === "latest"){ min = 220; cap = 540; }
          else if(key === "rec"){ min = 240; cap = 560; }
          else if(key.startsWith("plan-")){ min = 180; cap = 420; }

          const w = Math.min(cap, Math.max(min, Math.ceil(maxW + padding)));
          cols[idx].style.width = w + "px";
        });
      },

      bindPinnedControls(RMS){
        const ids = ["room","avail","latest","rec"];
        ids.forEach((key) => {
          const el = document.getElementById(`pin_${key}`);
          if(!el) return;
          el.addEventListener("change", () => this.applyPinnedColumns(RMS));
        });
      },

      applyPinnedColumns(RMS){
        const wrap = document.getElementById("detailTableWrap");
        if(!wrap) return;
        const table = wrap.querySelector("table");
        if(!table) return;

        // Reset
        table.querySelectorAll("[data-col]").forEach((el) => {
          el.classList.remove("sticky-cell","sticky-shadow");
          el.style.left = "";
        });

        const order = ["room","avail","latest","rec"];
        const pinned = order.filter((key) => {
          const cb = document.getElementById(`pin_${key}`);
          return cb ? cb.checked : false;
        });

        let left = 0;
        pinned.forEach((key, idx) => {
          const header = table.querySelector(`thead [data-col="${key}"]`);
          const w = header ? header.getBoundingClientRect().width : 0;

          const cells = table.querySelectorAll(`[data-col="${key}"]`);
          cells.forEach((el) => {
            el.classList.add("sticky-cell");
            el.style.left = `${left}px`;
          });

          left += w;

          if(idx === pinned.length - 1){
            cells.forEach((el) => el.classList.add("sticky-shadow"));
          }
        });
      },

      applySelectedDay(RMS, d){
        RMS.state.selectedDay = d;

        document.querySelectorAll(".day").forEach(c=>c.classList.remove("selected"));
        const target = document.querySelector(`.day[data-day="${d}"]`);
        if(target) target.classList.add("selected");

        const detailDate = document.getElementById("detailDate");
        if(detailDate) detailDate.textContent = this.formatDate(new Date(this.year, this.monthIndex, d));

        // Disable Apply when selected room is sold out
        const dk = this.getDateKey(d);
        const inv = RMS.db.getInventory(dk, RMS.state.selectedRoomType);
        const sold = inv.remaining <= 0;

        const applyBtn = document.getElementById("detailApply");
        if(applyBtn){
          applyBtn.disabled = !!sold;
          applyBtn.style.opacity = sold ? "0.55" : "1";
          applyBtn.style.cursor = sold ? "not-allowed" : "pointer";
        }
      },

      bindEvents(RMS){
        const grid = document.getElementById("calendarGrid");

        if(grid){
          grid.addEventListener("click", (e)=>{
            const cell = e.target.closest(".day");
            if(!cell || cell.classList.contains("muted")) return;
            const d = Number(cell.dataset.day);
            if(!Number.isFinite(d)) return;
            this.applySelectedDay(RMS, d);
            this.renderTable(RMS);
          });

          grid.addEventListener("keydown", (e)=>{
            if(e.key !== "Enter" && e.key !== " ") return;
            const cell = e.target.closest(".day");
            if(!cell || cell.classList.contains("muted")) return;
            const d = Number(cell.dataset.day);
            if(!Number.isFinite(d)) return;
            this.applySelectedDay(RMS, d);
            this.renderTable(RMS);
          });
        }

        document.getElementById("roomTypeSelect")?.addEventListener("change", ()=>{
          RMS.state.selectedRoomType = document.getElementById("roomTypeSelect").value;
          this.applySelectedDay(RMS, RMS.state.selectedDay);
          renderAll();
        });

        document.getElementById("ratePlanSelect")?.addEventListener("change", ()=>{
          RMS.state.selectedRatePlan = document.getElementById("ratePlanSelect").value;

          // keep pinbar selector in sync
          const lp = document.getElementById("latestPlanSelect");
          if (lp) lp.value = RMS.state.selectedRatePlan;

          renderAll();
        });

        // Day detail panel: click a row to select room type (sync to calendar)
        const dtBody = document.getElementById("roomTableBody");
        if (dtBody && !dtBody.dataset.boundRowClick) {
          dtBody.dataset.boundRowClick = "1";
          dtBody.addEventListener("click", (e) => {
            const explain = e.target?.closest?.('button[data-action="explain"]');
            if (explain) {
              e.preventDefault();
              e.stopPropagation();
              this.showExplainPopover(RMS, explain, {
                dateKey: explain.dataset.date,
                day: explain.dataset.day,
                room: explain.dataset.room,
                rate: explain.dataset.rate,
                current: explain.dataset.current,
                occ: explain.dataset.occ,
                rec: explain.dataset.rec,
                year: this.year,
                monthIndex: this.monthIndex
              });
              return;
            }

            const tr = e.target.closest("tr");
            if (!tr) return;
            const room = tr.dataset.room;
            if (!room) return;

            RMS.state.selectedRoomType = room;
            const sel = document.getElementById("roomTypeSelect");
            if (sel) sel.value = room;

            renderAll();
          });
        }

        // Pinbar: choose which rate plan to show for "Latest price change" (sync to calendar)
        const latestSel = document.getElementById("latestPlanSelect");
        if (latestSel && !latestSel.dataset.bound) {
          latestSel.dataset.bound = "1";

          // populate options
          latestSel.innerHTML = RMS.db.data.ratePlans.map(p => `<option value="${p}">${p}</option>`).join("");
          latestSel.value = RMS.state.selectedRatePlan;

          latestSel.addEventListener("change", () => {
            const next = latestSel.value;
            if (!next) return;
            RMS.state.selectedRatePlan = next;

            const rp = document.getElementById("ratePlanSelect");
            if (rp) rp.value = next;

            renderAll();
          });
        }
      }
    });

    
