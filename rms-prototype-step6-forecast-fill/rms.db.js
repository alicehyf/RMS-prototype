/* =========================================================
       MODULE: TINY IN-MEMORY DB (date × room × rate)
       - prices
       - inventory (total + remaining + delta24h)
       - latest price change events (per date × room × rate)
    ========================================================== */
    RMS.registerModule("db", {
      init(RMS) {
        const roomTypes = [
          "Ocean View Bungalow",
          "Family Bungalow",
          "Grand View",
          "Grand Beach",
          "Private Bamboo Bungalow",
          "Presidential Suite"
        ];

        const ratePlans = [
          "Flexible Rate",
          "Non-refundable Rate",
          "Breakfast Included",
          "Package Deal"
        ];

        const roomMult = {
          "Ocean View Bungalow": 1.00,
          "Family Bungalow": 1.12,
          "Grand View": 1.35,
          "Grand Beach": 1.48,
          "Private Bamboo Bungalow": 1.22,
          "Presidential Suite": 2.70
        };

        const rateMult = {
          "Flexible Rate": 1.00,
          "Non-refundable Rate": 0.92,
          "Breakfast Included": 1.10,
          "Package Deal": 1.18
        };

        const roomCapacity = {
          "Ocean View Bungalow": 12,
          "Family Bungalow": 8,
          "Grand View": 6,
          "Grand Beach": 4,
          "Private Bamboo Bungalow": 5,
          "Presidential Suite": 2
        };

        const roundTo = (n, step = 5000) => Math.round(n / step) * step;

        const dateKey = (y, mi, d) => {
          const mm = String(mi + 1).padStart(2, "0");
          const dd = String(d).padStart(2, "0");
          return `${y}-${mm}-${dd}`;
        };

        // Base prices (Ocean View + Flexible) per day for Feb (taken from your earlier mock)
        const febBase = {
          1:1900000, 2:1875000, 3:2050000, 4:1625000, 5:1975000, 6:1925000, 7:1850000,
          8:1925000, 9:1750000, 10:1900000, 11:1675000, 12:1650000, 13:1800000, 14:2150000,
          15:1925000, 16:2400000, 17:null, 18:2050000, 19:1950000, 20:1875000, 21:1900000,
          22:2000000, 23:2250000, 24:null, 25:1825000, 26:1775000, 27:1800000, 28:1850000, 29:1925000
        };

        const buildMonthBase = (days, baseStart) => {
          const o = {};
          for (let d = 1; d <= days; d++) {
            // small deterministic variation
            const bump = ((d % 9) * 0.018) + ((d % 4 === 0) ? -0.03 : 0);
            o[d] = roundTo(baseStart * (1 + bump), 5000);
          }
          // a couple sold-out days
          o[Math.min(17, days)] = null;
          o[Math.min(24, days)] = null;
          return o;
        };

        const janBase = buildMonthBase(31, 1750000);
        const marBase = buildMonthBase(31, 1950000);

        const db = {
          roomTypes,
          ratePlans,
          roomMult,
          rateMult,
          roomCapacity,
          prices: {},        // prices[date][room][rate] = number|null
          priceMode: {},     // priceMode[date][room][rate] = "auto"|"manual"|"applied"
          inventory: {},     // inventory[date][room] = {total, remaining, delta24h}
          latestChange: {},  // latestChange[date][room][rate] = {old, now, when}
          lastSoldPrice: {}, // lastSoldPrice[date][room][rate] = number|null
          baseFlexibleOcean: {} // baseFlexibleOcean[date] = base price (Ocean+Flexible) or null
        };

        const ensure = (obj, k, initVal) => {
          if (!obj[k]) obj[k] = initVal;
          return obj[k];
        };

        const seedMonth = (year, monthIndex, baseMap, whenLabel) => {
          const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

          for (let day = 1; day <= daysInMonth; day++) {
            const dk = dateKey(year, monthIndex, day);
            const base = baseMap[day] ?? null;
            db.baseFlexibleOcean[dk] = base;

            const pDay = ensure(db.prices, dk, {});
            const mDay = ensure(db.priceMode, dk, {});
            const iDay = ensure(db.inventory, dk, {});
            const cDay = ensure(db.latestChange, dk, {});

            roomTypes.forEach((room) => {
              pDay[room] = pDay[room] || {};
              mDay[room] = mDay[room] || {};
              cDay[room] = cDay[room] || {};

              // inventory
              const total = roomCapacity[room] ?? 5;
              // deterministic-ish remaining: more sold near weekends
              const dow = new Date(year, monthIndex, day).getDay(); // 0 Sun ... 6 Sat
              const isWeekend = (dow === 0 || dow === 6);
              const pressure = (isWeekend ? 0.72 : 0.55) + ((day % 7) * 0.03);
              let remaining = Math.max(0, Math.round(total * (1 - Math.min(0.98, pressure))));
              // if base is null => sold out across the board
              if (base == null) remaining = 0;

              const delta24 = -((day % 4)); // 0..-3 (availability usually decreases)
              iDay[room] = { total, remaining, delta24h: delta24 };

              const sDay = ensure(db.lastSoldPrice, dk, {});
              sDay[room] = sDay[room] || {};

              // prices for all rate plans
              ratePlans.forEach((rp) => {
                const rm = roomMult[room] ?? 1.0;
                const rtm = rateMult[rp] ?? 1.0;

                const autoPrice = (base == null) ? null : roundTo(base * rm * rtm, 5000);

// If sold out for this date+room: don't show "current price", keep last sold price for history
if (iDay[room].remaining <= 0) {
  pDay[room][rp] = null;
  mDay[room][rp] = "auto";
  sDay[room][rp] = autoPrice; // last sold at the would-be auto price (prototype)
  const old = (autoPrice == null) ? null : roundTo(autoPrice * 0.96, 5000);
  cDay[room][rp] = { old, now: autoPrice, when: whenLabel };
} else {
  pDay[room][rp] = autoPrice;
  mDay[room][rp] = "auto";
  sDay[room][rp] = null;
  const old = (autoPrice == null) ? null : roundTo(autoPrice * 0.96, 5000);
  cDay[room][rp] = { old, now: autoPrice, when: whenLabel };
}
              });
            });
          }
        };

        // Seed Jan/Feb/Mar 2024
        seedMonth(2024, 0, janBase, "Initial");
        seedMonth(2024, 1, febBase, "Jan 1");
        seedMonth(2024, 2, marBase, "Initial");


        // Keep a deep copy of the seeded DB for reset/migrations
        const __initialSnapshot = JSON.parse(JSON.stringify(db));

        // Public API
        RMS.db = {
          data: db,

          // --- Persistence (localStorage) ---
          storageKey: "rms_db_v1",
          autosave: true,
          _saveTimer: null,

          _clone(obj){
            return JSON.parse(JSON.stringify(obj));
          },

          _applySnapshot(snapshot){
            // mutate in place to keep references stable
            Object.keys(db).forEach(k => { if (!(k in snapshot)) delete db[k]; });
            Object.keys(snapshot).forEach(k => { db[k] = snapshot[k]; });
          },

          load(){
            try{
              const raw = localStorage.getItem(this.storageKey);
              if (!raw) return false;
              const parsed = JSON.parse(raw);
              const snap = parsed?.db;
              if (!snap || typeof snap !== "object") return false;

              // Only merge known collections; keep seeded metadata (roomTypes/ratePlans/multipliers/capacity)
              const allowed = ["prices","priceMode","inventory","latestChange","lastSoldPrice","baseFlexibleOcean"];
              allowed.forEach(k => { if (snap[k]) db[k] = snap[k]; });

              return true;
            }catch(e){
              return false;
            }
          },

          save({ immediate = false } = {}){
            if (!this.autosave && !immediate) return;
            const doSave = () => {
              try{
                localStorage.setItem(this.storageKey, JSON.stringify({ v: 1, db }));
              }catch(e){
                // ignore quota / private mode
              }
            };

            if (immediate){
              doSave();
              return;
            }

            // debounce
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(doSave, 120);
          },

          reset(){
            try{ localStorage.removeItem(this.storageKey); }catch(e){}
            this._applySnapshot(this._clone(__initialSnapshot));
            this.save({ immediate: true });
          },

          dateKey,

          getPrice(dateKey, roomType, ratePlan) {
            return db.prices?.[dateKey]?.[roomType]?.[ratePlan] ?? null;
          },

          getLastSoldPrice(dateKey, roomType, ratePlan) {
            return db.lastSoldPrice?.[dateKey]?.[roomType]?.[ratePlan]
              ?? db.latestChange?.[dateKey]?.[roomType]?.[ratePlan]?.now
              ?? null;
          },

          getPriceMode(dateKey, roomType, ratePlan) {
            return db.priceMode?.[dateKey]?.[roomType]?.[ratePlan] ?? "auto";
          },

          setPrice(dateKey, roomType, ratePlan, newPrice, mode = "manual") {
            const old = db.prices?.[dateKey]?.[roomType]?.[ratePlan] ?? null;

            if (!db.prices[dateKey]) db.prices[dateKey] = {};
            if (!db.prices[dateKey][roomType]) db.prices[dateKey][roomType] = {};
            db.prices[dateKey][roomType][ratePlan] = newPrice;

            if (!db.priceMode[dateKey]) db.priceMode[dateKey] = {};
            if (!db.priceMode[dateKey][roomType]) db.priceMode[dateKey][roomType] = {};
            db.priceMode[dateKey][roomType][ratePlan] = mode;

            if (!db.latestChange[dateKey]) db.latestChange[dateKey] = {};
            if (!db.latestChange[dateKey][roomType]) db.latestChange[dateKey][roomType] = {};
            db.latestChange[dateKey][roomType][ratePlan] = { old, now: newPrice, when: "Just now" };

            this.save();
            return { old, now: newPrice };
          },

          resetToAuto(dateKey, roomType, ratePlan) {
            const base = db.baseFlexibleOcean[dateKey];
            const rm = db.roomMult[roomType] ?? 1.0;
            const rtm = db.rateMult[ratePlan] ?? 1.0;
            const autoPrice = (base == null) ? null : roundTo(base * rm * rtm, 5000);

            return this.setPrice(dateKey, roomType, ratePlan, autoPrice, "auto");
          },

          getInventory(dateKey, roomType) {
            return db.inventory?.[dateKey]?.[roomType] ?? { total: 0, remaining: 0, delta24h: 0 };
          },

          setInventory(dateKey, roomType, patch) {
            if (!db.inventory[dateKey]) db.inventory[dateKey] = {};
            const current = db.inventory[dateKey][roomType] || { total: 0, remaining: 0, delta24h: 0 };
            db.inventory[dateKey][roomType] = { ...current, ...patch };
            this.save();
          },

          getLatestChange(dateKey, roomType, ratePlan) {
            return db.latestChange?.[dateKey]?.[roomType]?.[ratePlan] ?? { old: null, now: null, when: "—" };
          }
        };

        // Load persisted data (if any) after seeding
        RMS.db.load();

      }
    });

    
