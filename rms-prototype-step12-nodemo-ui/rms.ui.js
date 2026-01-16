/* =========================================================
       MODULE: UI UTILS (toast / modal / drawer)
    ========================================================== */
    RMS.registerModule("uiUtilsBase", {
      init(RMS) {
        if (!document.getElementById("rms-ui-utils-style")) {
          const style = document.createElement("style");
          style.id = "rms-ui-utils-style";
          style.textContent = `
            #toast-root{
              position: fixed;
              right: 16px;
              bottom: 16px;
              display: flex;
              flex-direction: column;
              gap: 10px;
              z-index: 9999;
              pointer-events: none;
            }
            .rms-toast{
              background: #111827;
              color: #fff;
              padding: 10px 12px;
              border-radius: 8px;
              font-size: 13px;
              box-shadow: 0 10px 20px rgba(0,0,0,0.18);
              max-width: 340px;
              line-height: 1.25;
              opacity: 0;
              transform: translateY(8px);
              transition: opacity .15s ease, transform .15s ease;
              pointer-events: auto;
            }
            .rms-toast.show{ opacity: 1; transform: translateY(0); }
            .rms-toast .title{ font-weight: 700; margin-bottom: 4px; }
            .rms-toast .row{ display:flex; gap:8px; margin-top:8px; justify-content:flex-end; }
            .rms-toast button{
              border: 1px solid rgba(255,255,255,0.25);
              background: rgba(255,255,255,0.10);
              color: #fff;
              border-radius: 6px;
              padding: 6px 8px;
              font-size: 12px;
              cursor: pointer;
            }
            .rms-toast button:hover{ background: rgba(255,255,255,0.16); }

            .rms-backdrop{
              position: fixed;
              inset: 0;
              background: rgba(17,24,39,0.45);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 9998;
              padding: 18px;
            }

            .rms-modal{
              width: min(720px, 100%);
              background: #fff;
              border-radius: 10px;
              box-shadow: 0 18px 40px rgba(0,0,0,0.22);
              overflow: hidden;
            }
            .rms-modal-header{
              padding: 14px 16px;
              border-bottom: 1px solid #e5e7eb;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
            }
            .rms-modal-title{ font-weight: 800; font-size: 15px; }
            .rms-modal-close{
              border: 1px solid #e5e7eb;
              background: #f9fafb;
              border-radius: 8px;
              width: 34px;
              height: 34px;
              cursor: pointer;
              font-size: 16px;
            }
            .rms-modal-close:hover{ background: #f3f4f6; }
            .rms-modal-body{ padding: 16px; }
            .rms-modal-footer{
              padding: 14px 16px;
              border-top: 1px solid #e5e7eb;
              display: flex;
              gap: 10px;
              justify-content: flex-end;
              background: #fff;
            }
            .rms-muted{ color:#6b7280; font-size:13px; }
          `;
          document.head.appendChild(style);
        }

        const ensureRoot = (id) => {
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement("div");
            el.id = id;
            document.body.appendChild(el);
          }
          return el;
        };
        const toastRoot = ensureRoot("toast-root");
        const modalRoot = ensureRoot("modal-root");

        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") modalRoot.innerHTML = "";
        });

        const api = {
          toast(message, opts = {}) {
            const { title = "", duration = 1800, actionText = "", onAction = null } = opts;

            const t = document.createElement("div");
            t.className = "rms-toast";
            t.innerHTML = `
              ${title ? `<div class="title">${title}</div>` : ""}
              <div>${message}</div>
              ${actionText ? `<div class="row"><button type="button" class="act">${actionText}</button></div>` : ""}
            `;

            toastRoot.appendChild(t);
            requestAnimationFrame(() => t.classList.add("show"));

            let timer = null;
            const remove = () => {
              t.classList.remove("show");
              setTimeout(() => t.remove(), 150);
            };

            if (actionText && onAction) {
              t.querySelector(".act")?.addEventListener("click", () => {
                try { onAction(); } finally { remove(); }
              });
            }

            timer = setTimeout(remove, duration);
            t.addEventListener("mouseenter", () => timer && clearTimeout(timer));
            t.addEventListener("mouseleave", () => timer = setTimeout(remove, duration));
          },

          openModal({ title = "Dialog", bodyHTML = "", footerHTML = "", onClose = null } = {}) {
            modalRoot.innerHTML = `
              <div class="rms-backdrop" role="dialog" aria-modal="true">
                <div class="rms-modal">
                  <div class="rms-modal-header">
                    <div class="rms-modal-title">${title}</div>
                    <button type="button" class="rms-modal-close" aria-label="Close">✕</button>
                  </div>
                  <div class="rms-modal-body">${bodyHTML}</div>
                  ${footerHTML ? `<div class="rms-modal-footer">${footerHTML}</div>` : ""}
                </div>
              </div>
            `;

            const backdrop = modalRoot.querySelector(".rms-backdrop");
            const closeBtn = modalRoot.querySelector(".rms-modal-close");

            const close = () => {
              modalRoot.innerHTML = "";
              if (typeof onClose === "function") onClose();
            };

            closeBtn?.addEventListener("click", close);
            backdrop?.addEventListener("click", (e) => {
              if (e.target === backdrop) close();
            });

            return { close };
          },

          closeModal() { modalRoot.innerHTML = ""; },

          confirm({ title = "Confirm", message = "Are you sure?", confirmText = "Confirm", cancelText = "Cancel" } = {}) {
            return new Promise((resolve) => {
              const footer = `
                <button type="button" class="button secondary" id="rmsConfirmCancel">${cancelText}</button>
                <button type="button" class="button primary" id="rmsConfirmOk">${confirmText}</button>
              `;
              api.openModal({
                title,
                bodyHTML: `<div class="rms-muted" style="white-space:pre-line;">${message}</div>`,
                footerHTML: footer,
                onClose: () => resolve(false)
              });

              document.getElementById("rmsConfirmCancel")?.addEventListener("click", () => {
                api.closeModal(); resolve(false);
              });
              document.getElementById("rmsConfirmOk")?.addEventListener("click", () => {
                api.closeModal(); resolve(true);
              });
            });
          }
        };

        RMS.ui = api;
      }
    });

    


/* =========================================================
   MODULE: PROPERTY SWITCHER (multi-property support)
========================================================== */
RMS.registerModule("propertySwitcher", {
  init(RMS){
    document.addEventListener("DOMContentLoaded", ()=>{
      const sel = document.getElementById("propertySelect");
      if (!sel) return;

      const buildOptions = ()=>{
        sel.innerHTML = "";
        };

      // Build options
      buildOptions();
      (RMS.state.properties || []).forEach(p=>{
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });

      // Select active
      sel.value = RMS.state.activePropertyId || (RMS.state.properties?.[0]?.id);

      sel.addEventListener("change", ()=>{
        RMS.setActiveProperty(sel.value);
        RMS.ui?.toast?.(`Switched to ${sel.options[sel.selectedIndex].text}`, { title: "Property" });
      });

      // Rebuild options when properties list changes
      RMS.events?.on("propertiesUpdated", ()=>{
        buildOptions();
        sel.value = RMS.state.activePropertyId || (RMS.state.properties?.[0]?.id);
      });

      // Keep select in sync
      RMS.events?.on("propertyChanged", ({propertyId})=>{
        sel.value = propertyId;
      });
    });
  }
});
