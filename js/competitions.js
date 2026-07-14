(function initialiserDomaineCompetitions(global) {
  "use strict";

  const statuts = Object.freeze(["Brouillon", "Ouverte", "Fermée", "Archivée"]);

  function dateIsoValide(valeur) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
    const date = new Date(`${valeur}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === valeur;
  }

  function analyserDates(texte) {
    const valeurs = String(texte || "").split(",").map(function (valeur) { return valeur.trim(); }).filter(Boolean);
    const dates = [];
    const invalides = [];
    const doublons = [];
    const vues = new Set();
    valeurs.forEach(function (valeur) {
      if (!dateIsoValide(valeur)) {
        invalides.push(valeur);
      } else if (vues.has(valeur)) {
        doublons.push(valeur);
      } else {
        vues.add(valeur);
        dates.push(valeur);
      }
    });
    return { dates, invalides, doublons };
  }

  function datesIso(texte) {
    return analyserDates(texte).dates;
  }

  function analyserHoraires(texte) {
    const valeurs = String(texte || "").split(",").map(function (valeur) { return valeur.trim(); }).filter(Boolean);
    const horaires = [];
    const invalides = [];
    const doublons = [];
    const vus = new Set();
    valeurs.forEach(function (valeur) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(valeur)) {
        invalides.push(valeur);
      } else if (vus.has(valeur)) {
        doublons.push(valeur);
      } else {
        vus.add(valeur);
        horaires.push(valeur);
      }
    });
    return { horaires, invalides, doublons };
  }

  global.MPPCompetitions = Object.freeze({
    statuts, dateIsoValide, analyserDates, datesIso, analyserHoraires
  });
})(window);
