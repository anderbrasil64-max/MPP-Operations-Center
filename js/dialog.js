(function initialiserDialoguesMPP(global) {
  "use strict";

  let dialogueActif = null;
  let focusPrecedent = null;
  let notifierFermeture = null;
  let gestionnaireEchap = null;

  function elementsFocusables(racine) {
    return Array.from(racine.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) { return !element.hidden && element.offsetParent !== null; });
  }

  function fermer(notifier) {
    if (!dialogueActif) return;
    const callback = notifierFermeture;
    dialogueActif.querySelectorAll('input[type="password"]').forEach(function (champ) { champ.value = ""; });
    dialogueActif.remove();
    dialogueActif = null;
    notifierFermeture = null;
    if (gestionnaireEchap) document.removeEventListener("keydown", gestionnaireEchap, true);
    gestionnaireEchap = null;
    document.getElementById("app")?.removeAttribute("inert");
    if (focusPrecedent && document.contains(focusPrecedent)) focusPrecedent.focus();
    focusPrecedent = null;
    if (notifier !== false && typeof callback === "function") callback();
  }

  function creer(titre, options) {
    fermer(true);
    focusPrecedent = document.activeElement;
    notifierFermeture = typeof options?.onClose === "function" ? options.onClose : null;

    const overlay = document.createElement("div");
    overlay.id = "modal-overlay";
    overlay.setAttribute("role", options?.type === "alertdialog" ? "alertdialog" : "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "modal-title");

    const boite = document.createElement("div");
    boite.className = "modal-box";
    boite.tabIndex = -1;

    const entete = document.createElement("h2");
    entete.id = "modal-title";
    entete.textContent = String(titre || "");

    const contenu = document.createElement("div");
    contenu.className = "modal-message";
    contenu.id = "modal-description";
    overlay.setAttribute("aria-describedby", contenu.id);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    boite.append(entete, contenu, actions);
    overlay.appendChild(boite);
    document.body.appendChild(overlay);
    document.getElementById("app")?.setAttribute("inert", "");
    dialogueActif = overlay;

    gestionnaireEchap = function (evenement) {
      if (evenement.key !== "Escape" || options?.fermetureEchap === false) return;
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer(true);
    };
    document.addEventListener("keydown", gestionnaireEchap, true);

    overlay.addEventListener("keydown", function (evenement) {
      if (evenement.key !== "Tab") return;
      const focusables = elementsFocusables(overlay);
      if (!focusables.length) {
        evenement.preventDefault();
        boite.focus();
        return;
      }
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    });

    function focaliser(element) {
      requestAnimationFrame(function () {
        if (dialogueActif !== overlay || !overlay.isConnected) return;
        if (!(element instanceof HTMLElement) || !element.isConnected) return;
        if ("disabled" in element && element.disabled) return;
        element.focus();
      });
    }

    return {
      overlay,
      boite,
      contenu,
      actions,
      focaliser,
      fermer: function () { fermer(false); }
    };
  }

  global.MPPDialog = Object.freeze({ creer, fermer });
})(window);
