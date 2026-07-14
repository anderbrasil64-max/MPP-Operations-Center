(function initialiserDomaineJoueurs(global) {
  "use strict";

  const roles = Object.freeze(["SuperAdmin", "Officier", "Strateur", "Soldat", "Réserviste", "Recrue"]);
  const statuts = Object.freeze(["Actif", "Inactif", "Suspendu"]);

  function listeRoles(valeur) {
    return String(valeur || "").split(",").map(function (role) { return role.trim(); }).filter(Boolean);
  }

  function normaliser(valeur) {
    return String(valeur || "")
      .trim()
      .toLocaleLowerCase("fr-FR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function rolePresent(valeur, role) {
    const attendu = normaliser(role);
    return listeRoles(valeur).some(function (item) { return normaliser(item) === attendu; });
  }

  function rolesSelectionnes(controles) {
    return (controles || []).filter(function (item) { return item.controle.checked; }).map(function (item) { return item.role; }).join(",");
  }

  function filtrerEtTrier(joueurs, recherche, statut, ascendant) {
    const texte = normaliser(recherche);
    return [...(joueurs || [])].filter(function (joueur) {
      const index = normaliser(`${joueur.pseudo || ""} ${joueur.roles || ""}`);
      return (!texte || index.includes(texte)) && (statut === "Tous" || joueur.statut === statut);
    }).sort(function (a, b) {
      const ordre = String(a.pseudo || "").localeCompare(String(b.pseudo || ""), "fr", { sensitivity: "base" });
      return ascendant ? ordre : -ordre;
    });
  }

  global.MPPJoueurs = Object.freeze({ roles, statuts, listeRoles, rolesSelectionnes, filtrerEtTrier, normaliser, rolePresent });
})(window);
