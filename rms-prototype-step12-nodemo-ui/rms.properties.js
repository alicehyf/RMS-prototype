/* =========================================================
   MODULE: PROPERTIES (Multi-property management MVP)
   - Manage properties list (name / currency / timezone)
   - Enable/disable room types and rate plans per property (for UI scope)
   - Duplicate & delete (cleans per-property localStorage)
========================================================= */
RMS.registerModule("propertiesManager", {
  init(RMS){
    document.addEventListener("DOMContentLoaded", ()=>{
      const view = document.getElementById("propertiesView");
      if (!view) return;

      const tb = document.querySelector("#propertiesTable tbody");
      const btnAdd = document.getElementById("btnAddProperty");
      const btnSave = document.getElementById("btnSaveProperty");
      const btnReset = document.getElementById("btnResetPropertySelection");
      const btnSetActive = document.getElementById("btnSetActiveProperty");

      const editor = document.getElementById("propertyEditor");
      const editorEmpty = document.getElementById("propertyEditorEmpty");

      const fName = document.getElementById("propName");
      const fId = document.getElementById("propId");
      const fCur = document.getElementById("propCurrency");
      const fTz = document.getElementById("propTimezone");
      const wrapRooms = document.getElementById("propRoomTypes");
      const wrapPlans = document.getElementById("propRatePlans");

      let selectedId = null;

      const baseKeysToCopy = [
        "rms_db_v1",
        "rms_pricing_rules_v1",
        "rms_pricing_rules_log_v1",
        "rms_pricing_restrictions_v1",
        "rms_forecast_ui_v1",
        "rms_autopilot_v1"
      ];
      const key = (base, pid)=> `${base}::${pid}`;

      const getProp = (id)=> (RMS.state.properties||[]).find(p=>p.id===id);

      const renderChips = (items, enabledList, container) => {
        container.innerHTML = "";
        const enabled = new Set(Array.isArray(enabledList) ? enabledList : items);
        items.forEach(name=>{
          const chip = document.createElement("label");
          chip.className = "chip";
          chip.innerHTML = `<input type="checkbox" ${enabled.has(name) ? "checked":""} data-name="${escapeHtml(name)}"/> <span>${escapeHtml(name)}</span>`;
          container.appendChild(chip);
        });
      };

      const readEnabled = (container) => {
        const out = [];
        container.querySelectorAll("input[type=checkbox]").forEach(cb=>{
          if (cb.checked) out.push(cb.getAttribute("data-name") || "");
        });
        return out.filter(Boolean);
      };

      const renderEditor = (id) => {
        selectedId = id;
        const p = getProp(id);
        if (!p){
          editor.classList.add("hidden");
          editorEmpty.classList.remove("hidden");
          return;
        }
        editorEmpty.classList.add("hidden");
        editor.classList.remove("hidden");

        fName.value = p.name || "";
        fId.value = p.id || "";
        fCur.value = (p.currency || "IDR").toUpperCase();
        fTz.value = p.timezone || "";

        // Full lists come from DB template for that property (fallback: active DB)
        const dbObj = RMS.db?._dbByProperty?.[p.id] || RMS.db?.data || {};
        const allRooms = dbObj.roomTypes || [];
        const allPlans = dbObj.ratePlans || [];

        renderChips(allRooms, p.enabledRoomTypes, wrapRooms);
        renderChips(allPlans, p.enabledRatePlans, wrapPlans);
      };

      const renderTable = () => {
        if (!tb) return;
        tb.innerHTML = "";
        (RMS.state.properties || []).forEach(p=>{
          const tr = document.createElement("tr");
          const isActive = p.id === RMS.state.activePropertyId;
          tr.innerHTML = `
            <td style="text-align:left; font-weight:600;">${escapeHtml(p.name || p.id)}</td>
            <td style="text-align:left;"><code>${escapeHtml(p.id)}</code></td>
            <td style="text-align:left;">${escapeHtml((p.currency||"IDR").toUpperCase())}</td>
            <td style="text-align:left;">${escapeHtml(p.timezone||"")}</td>
            <td style="text-align:left;">${isActive ? '<span class="badge green">Active</span>' : '<span class="badge">—</span>'}</td>
            <td style="text-align:left; white-space:nowrap;">
              <button class="button" data-act="edit" data-id="${escapeHtml(p.id)}" style="padding:6px 10px;">Edit</button>
              <button class="button" data-act="dup" data-id="${escapeHtml(p.id)}" style="padding:6px 10px;">Duplicate</button>
              <button class="button" data-act="del" data-id="${escapeHtml(p.id)}" style="padding:6px 10px;">Delete</button>
            </td>
          `;
          tb.appendChild(tr);
        });

        tb.querySelectorAll("button[data-act]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const act = btn.getAttribute("data-act");
            const id = btn.getAttribute("data-id");
            if (!id) return;
            if (act === "edit") renderEditor(id);
            if (act === "dup") duplicateProperty(id);
            if (act === "del") deleteProperty(id);
          });
        });
      };

      const copyStorage = (fromId, toId) => {
        baseKeysToCopy.forEach(base=>{
          try{
            const raw = localStorage.getItem(key(base, fromId));
            if (raw) localStorage.setItem(key(base, toId), raw);
          }catch(e){}
        });
      };

      const cleanupStorage = (pid) => {
        baseKeysToCopy.forEach(base=>{
          try{ localStorage.removeItem(key(base, pid)); }catch(e){}
        });
      };

      const addProperty = () => {
        const name = prompt("Property name:", "New property");
        if (!name) return;

        const cloneFrom = RMS.state.activePropertyId || (RMS.state.properties?.[0]?.id);
        const prop = RMS.addProperty({ name, cloneFromId: cloneFrom });

        // Copy demo data + settings from template property
        try{
          RMS.db?.ensureProperty?.(prop.id, { cloneFrom });
          copyStorage(cloneFrom, prop.id);
        }catch(e){}

        RMS.ui?.toast?.(`Created ${prop.name}`, { title: "Properties" });
        renderTable();
        renderEditor(prop.id);
      };

      const duplicateProperty = (fromId) => {
        const from = getProp(fromId);
        if (!from) return;
        const name = prompt("New property name (duplicate):", `${from.name} (Copy)`);
        if (!name) return;
        const prop = RMS.addProperty({ name, cloneFromId: fromId });

        try{
          RMS.db?.ensureProperty?.(prop.id, { cloneFrom: fromId });
          copyStorage(fromId, prop.id);
        }catch(e){}

        RMS.ui?.toast?.(`Duplicated from ${from.name}`, { title: "Properties" });
        renderTable();
        renderEditor(prop.id);
      };

      const deleteProperty = (id) => {
        const p = getProp(id);
        if (!p) return;
        if ((RMS.state.properties||[]).length <= 1){
          RMS.ui?.toast?.("Cannot delete the last property.", { title: "Properties" });
          return;
        }
        if (!confirm(`Delete property "${p.name}"?\n\nThis will remove its saved data from this browser.`)) return;

        cleanupStorage(id);
        const ok = RMS.deleteProperty(id);
        if (!ok){
          RMS.ui?.toast?.("Cannot delete this property.", { title: "Properties" });
          return;
        }
        RMS.ui?.toast?.(`Deleted ${p.name}`, { title: "Properties" });
        renderTable();
        selectedId = null;
        editor.classList.add("hidden");
        editorEmpty.classList.remove("hidden");
      };

      const saveCurrent = () => {
        const p = getProp(selectedId);
        if (!p) return;

        const enabledRooms = readEnabled(wrapRooms);
        const enabledPlans = readEnabled(wrapPlans);

        RMS.updateProperty(selectedId, {
          name: fName.value.trim() || p.name,
          currency: (fCur.value || "IDR").toUpperCase(),
          timezone: fTz.value.trim() || p.timezone,
          enabledRoomTypes: enabledRooms.length ? enabledRooms : null,
          enabledRatePlans: enabledPlans.length ? enabledPlans : null
        });

        RMS.ui?.toast?.("Saved", { title: "Properties" });
        renderTable();
      };

      const resetEnabled = () => {
        const p = getProp(selectedId);
        if (!p) return;
        RMS.updateProperty(selectedId, { enabledRoomTypes: null, enabledRatePlans: null });
        renderEditor(selectedId);
        renderTable();
      };

      btnAdd?.addEventListener("click", addProperty);
      btnSave?.addEventListener("click", saveCurrent);
      btnReset?.addEventListener("click", resetEnabled);
      btnSetActive?.addEventListener("click", ()=>{
        if (!selectedId) return;
        RMS.setActiveProperty(selectedId);
        renderTable();
        RMS.ui?.toast?.("Active property updated", { title: "Properties" });
      });

      // Re-render when properties change
      RMS.events?.on("propertiesUpdated", ()=>{
        renderTable();
        if (selectedId) renderEditor(selectedId);
      });

      RMS.events?.on("propertyChanged", ()=>{
        renderTable();
      });

      // Initial
      renderTable();
    });

    // Basic escape to keep template literals safe
    function escapeHtml(str){
      return String(str ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }
  }
});
