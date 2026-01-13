    /* =========================================================
       CORE NAMESPACE (stable)
    ========================================================== */
    window.RMS = {
      state: {
        selectedDay: null,
        selectedRoomType: null,
        selectedRatePlan: null,
        history: [],
        undoStack: []
      },
      modules: {},
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

    
