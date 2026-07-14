(function initialiserDomaineDiscord(global) {
  "use strict";

  function presentation(joueur) {
    const lie = joueur?.discordLie === true;
    return Object.freeze({
      lie,
      libelle: lie ? "Discord lié" : "Discord non lié",
      titreBadge: lie && joueur.discordUsername ? `Discord lié : ${joueur.discordUsername}` : "Discord lié"
    });
  }

  global.MPPDiscord = Object.freeze({ presentation });
})(window);
