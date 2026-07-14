(function initialiserDomaineJournal(global) {
  "use strict";

  function filtrer(entrees, recherche) {
    const texte = String(recherche || "").trim().toLocaleLowerCase("fr-FR");
    if (!texte) return [...(entrees || [])];
    return (entrees || []).filter(function (entree) {
      return `${entree.utilisateur || ""} ${entree.action || ""} ${entree.details || ""}`
        .toLocaleLowerCase("fr-FR")
        .includes(texte);
    });
  }

  global.MPPJournal = Object.freeze({ filtrer });
})(window);
