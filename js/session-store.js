(function initialiserSessionsMPP(global) {
  "use strict";

  const cle = global.MPP_CONFIG.playerSessionStorageKey;
  let jetonJoueur = "";
  let jetonAdmin = "";
  let expirationAdmin = 0;
  let expirationInactiviteAdmin = 0;
  let timerAvertissementAdmin = 0;
  let timerExpirationAdmin = 0;

  function annulerTimersAdmin() {
    if (timerAvertissementAdmin) clearTimeout(timerAvertissementAdmin);
    if (timerExpirationAdmin) clearTimeout(timerExpirationAdmin);
    timerAvertissementAdmin = 0;
    timerExpirationAdmin = 0;
  }

  function emettre(nom) {
    global.dispatchEvent(new CustomEvent(nom));
  }

  function programmerTimersAdmin() {
    annulerTimersAdmin();
    if (!jetonAdmin) return;
    const maintenant = Date.now();
    const limiteAbsolue = expirationAdmin || Number.POSITIVE_INFINITY;
    const limite = Math.min(limiteAbsolue, expirationInactiviteAdmin || limiteAbsolue);
    const delaiExpiration = Math.max(0, limite - maintenant);
    const delaiAvertissement = Math.min(
      global.MPP_CONFIG.adminIdleWarningMs,
      Math.max(0, delaiExpiration - 30_000)
    );
    if (delaiAvertissement > 0) {
      timerAvertissementAdmin = setTimeout(function () {
        if (jetonAdmin) emettre("mpp:admin-session-warning");
      }, delaiAvertissement);
    }
    timerExpirationAdmin = setTimeout(function () {
      if (!jetonAdmin) return;
      effacerSessionAdmin();
      emettre("mpp:admin-session-expired");
    }, delaiExpiration);
  }

  function lireSessionJoueur() {
    if (jetonJoueur) return jetonJoueur;
    try {
      jetonJoueur = String(sessionStorage.getItem(cle) || "");
    } catch (_erreur) {
      global.MPPLogger.avertissement("session_storage_indisponible");
    }
    return jetonJoueur;
  }

  function definirSessionJoueur(token) {
    jetonJoueur = String(token || "");
    try {
      if (jetonJoueur) sessionStorage.setItem(cle, jetonJoueur);
      else sessionStorage.removeItem(cle);
    } catch (_erreur) {
      global.MPPLogger.avertissement("session_storage_indisponible");
    }
  }

  function definirSessionAdmin(token, expiresAt) {
    jetonAdmin = String(token || "");
    expirationAdmin = Date.parse(expiresAt || "") || 0;
    expirationInactiviteAdmin = jetonAdmin
      ? Date.now() + global.MPP_CONFIG.adminIdleTimeoutMs
      : 0;
    programmerTimersAdmin();
  }

  function notifierActiviteAdmin() {
    if (!jetonAdmin) return;
    expirationInactiviteAdmin = Date.now() + global.MPP_CONFIG.adminIdleTimeoutMs;
    programmerTimersAdmin();
  }

  function lireSessionAdmin() {
    if (!jetonAdmin) return "";
    if ((expirationAdmin && Date.now() >= expirationAdmin) ||
        (expirationInactiviteAdmin && Date.now() >= expirationInactiviteAdmin)) {
      effacerSessionAdmin();
      return "";
    }
    return jetonAdmin;
  }

  function expirationSessionAdmin() {
    return Math.min(
      expirationAdmin || Number.POSITIVE_INFINITY,
      expirationInactiviteAdmin || Number.POSITIVE_INFINITY
    );
  }

  function effacerSessionAdmin() {
    annulerTimersAdmin();
    jetonAdmin = "";
    expirationAdmin = 0;
    expirationInactiviteAdmin = 0;
  }

  function toutEffacer() {
    effacerSessionAdmin();
    definirSessionJoueur("");
  }

  global.MPPSession = Object.freeze({
    lireSessionJoueur,
    definirSessionJoueur,
    lireSessionAdmin,
    expirationSessionAdmin,
    definirSessionAdmin,
    notifierActiviteAdmin,
    effacerSessionAdmin,
    toutEffacer
  });
})(window);
