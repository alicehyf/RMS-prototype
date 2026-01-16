/* =========================================================
       MODULE: MONTH SWITCHER (3 months: Jan/Feb/Mar 2024)
    ========================================================== */
    RMS.registerModule("monthSwitcher3", {
      init(RMS) {
        const cal = RMS.modules.coreCalendar;
        if (!cal) return;

        const months = [
          { year: 2024, monthIndex: 0, monthName: "January" },
          { year: 2024, monthIndex: 1, monthName: "February" },
          { year: 2024, monthIndex: 2, monthName: "March" }
        ];

        RMS.state._monthCursor3 = (RMS.state._monthCursor3 ?? 1);

        const applyMonth = (cursor) => {
          const m = months[cursor];
          cal.year = m.year;
          cal.monthIndex = m.monthIndex;
          cal.monthName = m.monthName;

          const daysInMonth = new Date(cal.year, cal.monthIndex + 1, 0).getDate();
          if ((RMS.state.selectedDay || 1) > daysInMonth) RMS.state.selectedDay = daysInMonth;
        };

        const resetBtn = (id) => {
          const old = document.getElementById(id);
          if (!old) return null;
          const neu = old.cloneNode(true);
          old.parentNode.replaceChild(neu, old);
          return neu;
        };

        const prevBtn = resetBtn("prevMonth");
        const nextBtn = resetBtn("nextMonth");
        const todayBtn = resetBtn("btnToday");

        const go = (delta) => {
          let c = RMS.state._monthCursor3;
          c = Math.max(0, Math.min(2, c + delta));
          RMS.state._monthCursor3 = c;
          applyMonth(c);
          renderAll();
          RMS.ui?.toast?.(`${months[c].monthName} ${months[c].year}`, { title: "Month" });
        };

        prevBtn?.addEventListener("click", () => go(-1));
        nextBtn?.addEventListener("click", () => go(+1));
        todayBtn?.addEventListener("click", () => {
          RMS.state._monthCursor3 = 1;
          applyMonth(1);
          RMS.state.selectedDay = 16;
          renderAll();
          RMS.ui?.toast?.("Back to Feb 16, 2024", { title: "Today" });
        });

        applyMonth(RMS.state._monthCursor3);
      }
    });

    /* =========================================================
       MODULE: MANUAL PRICE EDITOR (DB-backed)
       - edits price for selected date × selected room × selected rate plan
       - supports "Clear override" (reset to auto computed price)
    ========================================================== */
    RMS.registerModule("manualPriceEditorDB", {
      init(RMS) {
        const cal = RMS.modules.coreCalendar;
        if (!cal) return;

        const resetBtn = (id) => {
          const old = document.getElementById(id);
          if (!old) return null;
          const neu = old.cloneNode(true);
          old.parentNode.replaceChild(neu, old);
          return neu;
        };

        const btnTop = resetBtn("btnManualPrices");
        const btnDetail = resetBtn("detailManual");

        const parseIDR = (raw) => {
          const cleaned = String(raw || "").replace(/idr/ig, "").replace(/[^\d]/g, "");
          if (!cleaned) return null;
          const n = Number(cleaned);
          return Number.isFinite(n) ? n : null;
        };

        const openEditor = () => {
          const day = RMS.state.selectedDay;
          if (!day) { RMS.ui.toast("Please select a date first.", { title: "Manual price" }); return; }

          const roomType = RMS.state.selectedRoomType;
          const ratePlan = RMS.state.selectedRatePlan;
          const dk = cal.getDateKey(day);

          const inv = RMS.db.getInventory(dk, roomType);
          if (inv.remaining <= 0) {
            RMS.ui.toast("Selected room type is sold out on this date.", { title: "Manual price" });
            return;
          }

          const current = RMS.db.getPrice(dk, roomType, ratePlan);

          const bodyHTML = `
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div>
                <div style="font-weight:800; font-size:14px;">${cal.formatDate(new Date(cal.year, cal.monthIndex, day))}</div>
                <div class="rms-muted">Room type: <strong>${roomType}</strong></div>
                <div class="rms-muted">Rate plan: <strong>${ratePlan}</strong></div>
              </div>

              <div>
                <label for="rmsManualPriceInput" style="display:block; font-weight:700; font-size:13px; margin-bottom:6px;">
                  Price (IDR)
                </label>
                <input
                  id="rmsManualPriceInput"
                  type="text"
                  inputmode="numeric"
                  placeholder="Example: 2,500,000"
                  value="${current ? Number(current).toLocaleString("en-US") : ""}"
                  style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:14px; outline:none;"
                />
                <div id="rmsManualPriceError" class="rms-muted" style="color:#b91c1c; margin-top:6px; display:none;"></div>
                <div class="rms-muted" style="margin-top:6px;">
                  Stored in DB at: <code>${dk}</code>
                </div>
              </div>
            </div>
          `;

          const footerHTML = `
            <button type="button" class="button secondary" id="rmsManualCancel">Cancel</button>
            <button type="button" class="button secondary" id="rmsManualClear">Clear override</button>
            <button type="button" class="button primary" id="rmsManualSave">Save</button>
          `;

          const { close } = RMS.ui.openModal({
            title: "Manually set prices",
            bodyHTML,
            footerHTML
          });

          const input = document.getElementById("rmsManualPriceInput");
          const err = document.getElementById("rmsManualPriceError");

          const showErr = (msg) => { err.textContent = msg; err.style.display = "block"; };
          const clearErr = () => { err.textContent = ""; err.style.display = "none"; };

          input?.addEventListener("blur", () => {
            const n = parseIDR(input.value);
            if (n != null) input.value = n.toLocaleString("en-US");
          });

          const pushHistory = (action, oldPrice, newPrice) => {
            RMS.state.history.unshift({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              time: new Date().toLocaleString("en-US"),
              action,
              dateKey: dk,
              day,
              roomType,
              ratePlan,
              oldPrice,
              newPrice
            });
          };

          document.getElementById("rmsManualCancel")?.addEventListener("click", close);

          document.getElementById("rmsManualClear")?.addEventListener("click", () => {
            const before = RMS.db.getPrice(dk, roomType, ratePlan);
            RMS.db.resetToAuto(dk, roomType, ratePlan);
            const after = RMS.db.getPrice(dk, roomType, ratePlan);
            pushHistory("Manual override cleared (reset to auto)", before, after);
            renderAll();
            RMS.ui.toast("Override cleared (back to auto).", { title: "Manual price" });
            close();
          });

          document.getElementById("rmsManualSave")?.addEventListener("click", () => {
            clearErr();
            const n = parseIDR(input?.value);
            if (n == null || n <= 0) { showErr("Please enter a valid number."); return; }

            const before = RMS.db.getPrice(dk, roomType, ratePlan);
            RMS.db.setPrice(dk, roomType, ratePlan, n, "manual");
            pushHistory("Manual price set", before, n);

            renderAll();
            RMS.ui.toast(`Saved: ${cal.formatIDR(n)}`, { title: "Manual price" });
            close();
          });

          input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") document.getElementById("rmsManualSave")?.click();
          });
        };

        btnTop?.addEventListener("click", openEditor);
        btnDetail?.addEventListener("click", openEditor);
      }
    });

    /* =========================================================
       MODULE: APPLY RECOMMENDATION + UNDO (DB-backed)
    ========================================================== */
    RMS.registerModule("applyWithUndoDB", {
      init(RMS) {
        const cal = RMS.modules.coreCalendar;
        if (!cal) return;

        const resetBtn = (id) => {
          const old = document.getElementById(id);
          if (!old) return null;
          const neu = old.cloneNode(true);
          old.parentNode.replaceChild(neu, old);
          return neu;
        };

        const applyBtn = resetBtn("detailApply");

        const recommend = (current, occPercent) => {
          if (current == null) return null;
          // Deterministic rule-based recommendation (no randomness):
          // High occupancy => raise; Low occupancy => lower; Otherwise keep.
          let adj = 0.0;
          if (occPercent >= 85) adj = 0.06;
          else if (occPercent >= 70) adj = 0.03;
          else if (occPercent <= 35) adj = -0.05;
          else if (occPercent <= 45) adj = -0.03;
          else adj = 0.0;

          const rec = current * (1 + adj);
          return Math.round(rec / 5000) * 5000;
        };

        const undoLast = () => {
          const last = RMS.state.undoStack.shift();
          if (!last) {
            RMS.ui.toast("Nothing to undo.", { title: "Undo" });
            return;
          }

          const { dk, roomType, ratePlan, prevPrice, prevMode } = last;
          RMS.db.setPrice(dk, roomType, ratePlan, prevPrice, prevMode);
          renderAll();
          RMS.ui.toast("Reverted.", { title: "Undo" });
        };

        applyBtn?.addEventListener("click", async () => {
          const day = RMS.state.selectedDay;
          if (!day) { RMS.ui.toast("Please select a date first.", { title: "Apply" }); return; }

          const roomType = RMS.state.selectedRoomType;
          const ratePlan = RMS.state.selectedRatePlan;
          const dk = cal.getDateKey(day);

          const inv = RMS.db.getInventory(dk, roomType);
          if (inv.remaining <= 0) { RMS.ui.toast("Sold out. Nothing to apply.", { title: "Apply" }); return; }

          const current = RMS.db.getPrice(dk, roomType, ratePlan);
          const occP = cal.getOccPercent(day, roomType);
          const pricingMode = RMS.pricing?.getRules?.()?.pricingMode || "occ";
          if (pricingMode === "manual") { RMS.ui.toast("Manual pricing mode. No recommendation to apply.", { title: "Apply" }); return; }
          const rec = recommend(current, occP, dk);


          if (rec == null) { RMS.ui.toast("No price available to recommend.", { title: "Apply" }); return; }

          const ok = await RMS.ui.confirm({
            title: "Apply recommendation?",
            message:
              `${cal.formatDate(new Date(cal.year, cal.monthIndex, day))}\n` +
              `${roomType} • ${ratePlan}\n\n` +
              `Current: ${current ? cal.formatIDR(current) : "—"}\n` +
              `Recommended: ${cal.formatIDR(rec)}\n\n` +
              `This will write to the in-memory DB.`,
            confirmText: "Apply",
            cancelText: "Cancel"
          });

          if (!ok) return;

          const prevPrice = current;
          const prevMode = RMS.db.getPriceMode(dk, roomType, ratePlan);

          // store undo snapshot
          RMS.state.undoStack.unshift({ dk, roomType, ratePlan, prevPrice, prevMode });

          RMS.db.setPrice(dk, roomType, ratePlan, rec, "applied");
          RMS.state.history.unshift({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            time: new Date().toLocaleString("en-US"),
            action: "Apply recommendation",
            dateKey: dk,
            day,
            roomType,
            ratePlan,
            oldPrice: prevPrice,
            newPrice: rec
          });

          renderAll();

          RMS.ui.toast(`Applied: ${cal.formatIDR(rec)}`, {
            title: "Apply recommendation",
            actionText: "Undo",
            onAction: undoLast,
            duration: 3200
          });
        });

        // optional exposure
        RMS.undo = RMS.undo || {};
        RMS.undo.undoLast = undoLast;
      }
    });
