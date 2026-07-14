(function initialiserEtatMPP(global) {
  "use strict";

  const etat = {
    utilisateur: null,
    accesAdmin: false,
    estSuperAdmin: false,
    vue: "connexion",
    chargement: false,
    cache: new Map()
  };

  function definirUtilisateur(resultat) {
    etat.utilisateur = resultat?.joueur || null;
    etat.accesAdmin = false;
    etat.estSuperAdmin = false;
    etat.cache.clear();
  }

  function definirAccesAdmin(resultat) {
    etat.accesAdmin = resultat?.succes === true;
    etat.estSuperAdmin = resultat?.estSuperAdmin === true;
  }

  function effacer() {
    etat.utilisateur = null;
    etat.accesAdmin = false;
    etat.estSuperAdmin = false;
    etat.vue = "connexion";
    etat.chargement = false;
    etat.cache.clear();
  }

  function roles() {
    return String(etat.utilisateur?.roles || "")
      .split(",")
      .map(function (role) {
        return role.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      })
      .filter(Boolean);
  }

  function estOfficier() {
    const liste = roles();
    return liste.includes("officier") || liste.includes("superadmin");
  }

  global.MPPState = Object.freeze({ etat, definirUtilisateur, definirAccesAdmin, effacer, roles, estOfficier });
})(window);
