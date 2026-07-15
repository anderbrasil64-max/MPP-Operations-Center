(function initialiserIconesMPP(global) {
  "use strict";

  const espaceSVG = "http://www.w3.org/2000/svg";
  const definitions = Object.freeze({
    archive: [["rect", { x: "3", y: "4", width: "18", height: "4", rx: "1" }], ["path", { d: "M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" }], ["path", { d: "M10 12h4" }]],
    "arrow-left": [["path", { d: "m12 19-7-7 7-7" }], ["path", { d: "M19 12H5" }]],
    "arrow-up-down": [["path", { d: "m21 16-4 4-4-4" }], ["path", { d: "M17 20V4" }], ["path", { d: "m3 8 4-4 4 4" }], ["path", { d: "M7 4v16" }]],
    calendar: [["path", { d: "M8 2v4" }], ["path", { d: "M16 2v4" }], ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }], ["path", { d: "M3 10h18" }]],
    "calendar-check": [["path", { d: "M8 2v4" }], ["path", { d: "M16 2v4" }], ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }], ["path", { d: "M3 10h18" }], ["path", { d: "m9 16 2 2 4-4" }]],
    check: [["path", { d: "m5 12 4 4L19 6" }]],
    circle: [["circle", { cx: "12", cy: "12", r: "9" }]],
    "clipboard-list": [["rect", { x: "5", y: "4", width: "14", height: "18", rx: "2" }], ["path", { d: "M9 4V2h6v2" }], ["path", { d: "M9 12h6" }], ["path", { d: "M9 16h6" }], ["path", { d: "M9 8h.01" }]],
    copy: [["rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }], ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]],
    eye: [["path", { d: "M2.1 12a10.8 10.8 0 0 1 19.8 0 10.8 10.8 0 0 1-19.8 0" }], ["circle", { cx: "12", cy: "12", r: "3" }]],
    history: [["path", { d: "M3 12a9 9 0 1 0 3-6.7L3 8" }], ["path", { d: "M3 3v5h5" }], ["path", { d: "M12 7v5l3 2" }]],
    house: [["path", { d: "m3 11 9-8 9 8" }], ["path", { d: "M5 10v10h14V10" }], ["path", { d: "M9 20v-6h6v6" }]],
    key: [["circle", { cx: "7.5", cy: "15.5", r: "4.5" }], ["path", { d: "m10.7 12.3 8-8" }], ["path", { d: "m15 8 2 2" }], ["path", { d: "m17 6 2 2" }]],
    link: [["path", { d: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" }], ["path", { d: "M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" }]],
    "log-in": [["path", { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }], ["path", { d: "m10 17 5-5-5-5" }], ["path", { d: "M15 12H3" }]],
    "log-out": [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["path", { d: "m16 17 5-5-5-5" }], ["path", { d: "M21 12H9" }]],
    "message-circle": [["path", { d: "M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4.6A8.5 8.5 0 1 1 21 11.5" }]],
    pencil: [["path", { d: "M12 20h9" }], ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" }]],
    plus: [["path", { d: "M12 5v14" }], ["path", { d: "M5 12h14" }]],
    refresh: [["path", { d: "M20 11a8 8 0 1 0 2 5" }], ["path", { d: "M20 4v7h-7" }]],
    save: [["path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2" }], ["path", { d: "M17 21v-8H7v8" }], ["path", { d: "M7 3v5h8" }]],
    "shield-check": [["path", { d: "M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z" }], ["path", { d: "m9 12 2 2 4-4" }]],
    "trash-2": [["path", { d: "M3 6h18" }], ["path", { d: "M8 6V4h8v2" }], ["path", { d: "M19 6 18 21H6L5 6" }], ["path", { d: "M10 11v5" }], ["path", { d: "M14 11v5" }]],
    trophy: [["path", { d: "M8 21h8" }], ["path", { d: "M12 17v4" }], ["path", { d: "M7 4h10v5a5 5 0 0 1-10 0Z" }], ["path", { d: "M7 6H4a2 2 0 0 0 2 4h1" }], ["path", { d: "M17 6h3a2 2 0 0 1-2 4h-1" }]],
    users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: "9", cy: "7", r: "4" }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.9" }], ["path", { d: "M16 3.1a4 4 0 0 1 0 7.8" }]],
    "user-x": [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: "9", cy: "7", r: "4" }], ["path", { d: "m17 8 5 5" }], ["path", { d: "m22 8-5 5" }]],
    x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]]
  });

  function normaliser(libelle) {
    return String(libelle || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "'")
      .toLowerCase()
      .trim();
  }

  function nomPourAction(libelle) {
    const action = normaliser(libelle);
    if (action.includes("retour a l'accueil")) return "house";
    if (action.startsWith("retour")) return "arrow-left";
    if (action.includes("deconnect")) return "log-out";
    if (action.includes("se connecter")) return "log-in";
    if (action.includes("espace officier")) return "shield-check";
    if (action.includes("lier") || action.includes("liaison")) return "link";
    if (action.includes("mot de passe") || action.includes("code d'acces")) return "key";
    if (action.includes("presences du jour")) return "calendar-check";
    if (action.includes("consulter les presences")) return "clipboard-list";
    if (action.includes("competition")) {
      if (action.includes("consulter") || action.includes("gerer")) return "trophy";
      if (action.includes("creer")) return "plus";
    }
    if (action.includes("gerer les joueurs")) return "users";
    if (action.includes("journal")) return "history";
    if (action.includes("discord")) return "message-circle";
    if (action.includes("sans reponse")) return "user-x";
    if (action.includes("actualiser")) return "refresh";
    if (action.includes("archiver")) return "archive";
    if (action.includes("supprimer")) return "trash-2";
    if (action.includes("enregistrer")) return "save";
    if (action.includes("ajouter") || action.includes("creer") || action.includes("generer")) return "plus";
    if (action.includes("modifier")) return "pencil";
    if (action.includes("confirmer") || action.includes("valider") || action === "ok") return "check";
    if (action.includes("annuler") || action.includes("fermer") || action.includes("refuser")) return "x";
    if (action.includes("copier")) return "copy";
    if (action === "dates" || action.includes("calendrier")) return "calendar";
    if (action.startsWith("pseudo ")) return "arrow-up-down";
    if (action.includes("voir") || action.includes("consulter") || action.includes("ouvrir") || action.includes("detail")) return "eye";
    return "circle";
  }

  function creerIcone(nom) {
    const definition = definitions[nom] || definitions.circle;
    const svg = document.createElementNS(espaceSVG, "svg");
    svg.setAttribute("class", "button-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    definition.forEach(function ([balise, attributs]) {
      const forme = document.createElementNS(espaceSVG, balise);
      Object.entries(attributs).forEach(function ([attribut, valeur]) {
        forme.setAttribute(attribut, valeur);
      });
      svg.appendChild(forme);
    });
    return svg;
  }

  global.MPPIcons = Object.freeze({ creerIcone, nomPourAction });
})(window);
