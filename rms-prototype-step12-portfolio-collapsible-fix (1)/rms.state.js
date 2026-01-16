    /* =========================================================
       CORE NAMESPACE (stable)
    ========================================================== */
    window.RMS = {
      state: {
        // UI selections
        selectedDay: null,
        selectedRoomType: null,
        selectedRatePlan: null,

        // Multi-property
        properties: (function(){
          const defaults = [{"id": "komodo", "name": "Komodo Resort", "currency": "IDR", "timezone": "Asia/Makassar"}, {"id": "bali", "name": "Bali Villa Collection", "currency": "IDR", "timezone": "Asia/Makassar"}];
          try {
            const raw = localStorage.getItem("rms_properties_v1");
            if (raw){
              const arr = JSON.parse(raw);
              if (Array.isArray(arr) && arr.length && arr.every(x=>x && x.id && x.name)){
                return arr;
              }
            }
          } catch(e){}
          return defaults;
        })(),
        activePropertyId: (function(){
          try { return localStorage.getItem("rms_active_property_v1") || (function(){
            const ps = (function(){
              try { return JSON.parse(localStorage.getItem("rms_properties_v1")||"null"); } catch(e){ return null; }
            })();
            return (ps && ps[0] && ps[0].id) ? ps[0].id : "komodo";
          })(); }
          catch(e){ return "komodo"; }
        })(),


        // Undo / history
        history: [],
        undoStack: []
      },

      modules: {},

      // Simple event bus
      events: {
        _h: {},
        on(evt, fn){
          (this._h[evt] ||= []).push(fn);
        },
        emit(evt, payload){
          (this._h[evt] || []).forEach(fn => {
            try { fn(payload); } catch(e){ console.error(e); }
          });
        }
      },

      // Key helper to avoid cross-property collisions in localStorage
      util: {
        storageKey(base){
          const pid = (window.RMS?.state?.activePropertyId) || "komodo";
          return `${base}::${pid}`;
        }
      },

      setActiveProperty(propertyId){
        const props = this.state.properties || [];
        if (!props.some(p => p.id === propertyId)) return;

        const prev = this.state.activePropertyId;
        const prevRoom = this.state.selectedRoomType;
        const prevRate = this.state.selectedRatePlan;
        this.state.activePropertyId = propertyId;
        try { localStorage.setItem("rms_active_property_v1", propertyId); } catch(e){}

        // Keep day selection, but re-bind room / rate to valid values for the new property.
        this.state.selectedDay = this.state.selectedDay || 1;

        // First, switch the underlying DB + modules.
        this.events.emit("propertyChanged", { propertyId, prevPropertyId: prev });

        // Then, ensure selections are valid in the new property scope.
        const rooms = this.getRoomTypes?.() || [];
        const rates = this.getRatePlans?.() || [];
        this.state.selectedRoomType = (prevRoom && rooms.includes(prevRoom)) ? prevRoom : (rooms[0] || null);
        this.state.selectedRatePlan = (prevRate && rates.includes(prevRate)) ? prevRate : (rates[0] || null);

        try { renderAll(); } catch(e){}
      },

      
      // --- Property helpers ---
      getActiveProperty(){
        return (this.state.properties || []).find(p=>p.id===this.state.activePropertyId) || (this.state.properties||[])[0] || null;
      },
      saveProperties(){
        try { localStorage.setItem("rms_properties_v1", JSON.stringify(this.state.properties||[])); } catch(e){}
        this.events.emit("propertiesUpdated", { properties: this.state.properties||[] });
      },
      _slugifyId(name){
        return (name || "property").toLowerCase()
          .replace(/[^a-z0-9]+/g,'-')
          .replace(/(^-|-$)/g,'')
          .slice(0,24) || "property";
      },
      ensureUniqueId(base){
        const exists = (id)=> (this.state.properties||[]).some(p=>p.id===id);
        let id = base;
        let n = 2;
        while(exists(id)){ id = `${base}-${n++}`; }
        return id;
      },
      addProperty({ name, cloneFromId }){
        const base = this._slugifyId(name);
        const id = this.ensureUniqueId(base);
        const template = (this.state.properties||[]).find(p=>p.id===cloneFromId) || this.getActiveProperty();
        const prop = {
          id,
          name: name || ("New property " + id),
          currency: template?.currency || "IDR",
          timezone: template?.timezone || "Asia/Makassar",
          enabledRoomTypes: template?.enabledRoomTypes ? [...template.enabledRoomTypes] : null,
          enabledRatePlans: template?.enabledRatePlans ? [...template.enabledRatePlans] : null
        };
        (this.state.properties ||= []).push(prop);
        this.saveProperties();
        // Ensure DB exists for the new property
        try { this.db?.ensureProperty?.(id, { cloneFrom: cloneFromId || template?.id }); } catch(e){}
        return prop;
      },
      updateProperty(id, patch){
        const p = (this.state.properties||[]).find(x=>x.id===id);
        if (!p) return;
        Object.assign(p, patch||{});
        this.saveProperties();
      },
      deleteProperty(id){
        // Prevent deleting the last property
        if ((this.state.properties||[]).length <= 1) return false;
        this.state.properties = (this.state.properties||[]).filter(p=>p.id!==id);
        this.saveProperties();
        if (this.state.activePropertyId===id){
          this.setActiveProperty((this.state.properties[0]||{}).id);
        }
        return true;
      },
      getRoomTypes(){
        const p = this.getActiveProperty();
        const all = this.db?.data?.roomTypes || [];
        const enabled = p?.enabledRoomTypes;
        if (Array.isArray(enabled) && enabled.length){
          return all.filter(x=>enabled.includes(x));
        }
        return all;
      },
      getRatePlans(){
        const p = this.getActiveProperty();
        const all = this.db?.data?.ratePlans || [];
        const enabled = p?.enabledRatePlans;
        if (Array.isArray(enabled) && enabled.length){
          return all.filter(x=>enabled.includes(x));
        }
        return all;
      },
      getCurrencySymbol(){
        const cur = (this.getActiveProperty()?.currency || "IDR").toUpperCase();
        const map = { IDR:"Rp", USD:"$", EUR:"€", GBP:"£", SGD:"S$", AUD:"A$", CNY:"¥", JPY:"¥" };
        return map[cur] || cur + " ";
      },

      registerModule(name, module) {
        this.modules[name] = module;
        if (module.init) module.init(this);
      }
    };

    function renderAll() {
      Object.values(RMS.modules).forEach(m => {
        if (m.render) m.render(RMS);
      });
    }

    
