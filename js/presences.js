(function initialiserDomainePresences(global) {
  "use strict";

  const statuts = Object.freeze(["Non renseigné", "Présent", "Absent", "Remplaçant"]);

  function horaires(texte) {
    return String(texte || "").split(",").map(function (valeur) { return valeur.trim(); }).filter(Boolean);
  }

  function normaliserStatut(statut) {
    return String(statut || "").toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function autoriseHoraires(statut) {
    const valeur = normaliserStatut(statut);
    return valeur !== "absent" && valeur !== "non renseigne";
  }

  function valeurControle(controle) {
    return {
      dateCompetition: controle.date.dateCompetition,
      statut: controle.statut.value,
      horairesDisponibles: autoriseHoraires(controle.statut.value)
        ? controle.cases.filter(function (item) { return item.controle.checked; }).map(function (item) { return item.horaire; }).join(",")
        : ""
    };
  }

  function construirePayload(controles) {
    return (controles || []).map(valeurControle).filter(function (presence, index) {
      const initiale = controles[index].initiale;
      return !initiale || presence.statut !== initiale.statut || presence.horairesDisponibles !== initiale.horairesDisponibles;
    });
  }

  global.MPPPresences = Object.freeze({ statuts, horaires, autoriseHoraires, valeurControle, construirePayload });
})(window);
