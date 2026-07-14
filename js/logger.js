(function initialiserLoggerMPP(global) {
  "use strict";

  const ACTION_SURE = /[^a-zA-Z0-9_.-]/g;

  function actionSure(action) {
    return String(action || "action-inconnue").replace(ACTION_SURE, "_").slice(0, 80);
  }

  function duree(debut) {
    return Math.max(0, Math.round(performance.now() - Number(debut || performance.now())));
  }

  function api(action, debut, succes) {
    const message = `MPP API | action=${actionSure(action)} | statut=${succes ? "succes" : "echec"} | duree=${duree(debut)}ms`;
    if (succes) console.info(message);
    else console.error(message);
  }

  function information(code, contexte) {
    const morceaux = [`MPP | evenement=${actionSure(code)}`];
    if (contexte && typeof contexte === "object") {
      if (contexte.action) morceaux.push(`action=${actionSure(contexte.action)}`);
      if (contexte.statut) morceaux.push(`statut=${actionSure(contexte.statut)}`);
      if (Number.isFinite(contexte.dureeMs)) morceaux.push(`duree=${Math.max(0, Math.round(contexte.dureeMs))}ms`);
    }
    console.info(morceaux.join(" | "));
  }

  function avertissement(code) {
    console.warn(`MPP | avertissement=${actionSure(code)}`);
  }

  function erreur(code) {
    console.error(`MPP | erreur=${actionSure(code)}`);
  }

  global.MPPLogger = Object.freeze({ api, information, avertissement, erreur });
})(window);
