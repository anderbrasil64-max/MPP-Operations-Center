(function initialiserUIMPP(global) {
  "use strict";

  const contenu = document.getElementById("contenu");
  const zoneStatut = document.getElementById("app-status");
  const application = document.getElementById("app");

  function texte(valeur) {
    return document.createTextNode(String(valeur ?? ""));
  }

  function ajouter(parent, enfants) {
    const liste = Array.isArray(enfants) ? enfants : [enfants];
    liste.flat(Infinity).forEach(function (enfant) {
      if (enfant === null || enfant === undefined || enfant === false) return;
      parent.appendChild(enfant instanceof Node ? enfant : texte(enfant));
    });
  }

  function element(balise, attributs, enfants) {
    const noeud = document.createElement(balise);
    Object.entries(attributs || {}).forEach(function ([nom, valeur]) {
      if (valeur === null || valeur === undefined || valeur === false) return;
      if (nom === "className") noeud.className = String(valeur);
      else if (nom === "text") noeud.textContent = String(valeur);
      else if (nom === "on") {
        Object.entries(valeur).forEach(function ([evenement, gestionnaire]) {
          noeud.addEventListener(evenement, gestionnaire);
        });
      } else if (nom === "dataset") {
        Object.entries(valeur).forEach(function ([cle, donnee]) { noeud.dataset[cle] = String(donnee); });
      } else if (nom in noeud && !nom.startsWith("aria")) {
        try { noeud[nom] = valeur; } catch (_erreur) { noeud.setAttribute(nom, String(valeur)); }
      } else {
        noeud.setAttribute(nom.replace(/[A-Z]/g, function (lettre) { return "-" + lettre.toLowerCase(); }), String(valeur));
      }
    });
    ajouter(noeud, enfants || []);
    return noeud;
  }

  function bouton(libelle, action, options) {
    const opts = options || {};
    const controle = element("button", {
      type: opts.type || "button",
      className: opts.className || "",
      disabled: opts.disabled === true,
      title: opts.title || null,
      ariaLabel: opts.ariaLabel || null,
      on: action ? { click: action } : null
    });
    const nomIcone = opts.icon || global.MPPIcons?.nomPourAction(libelle);
    if (nomIcone && opts.icon !== false) controle.appendChild(global.MPPIcons.creerIcone(nomIcone));
    controle.appendChild(element("span", { className: "button-label" }, libelle));
    return controle;
  }

  function champ(options) {
    const opts = options || {};
    const id = opts.id;
    const controle = element(opts.multiline ? "textarea" : "input", {
      id,
      name: opts.name || id,
      type: opts.multiline ? null : (opts.type || "text"),
      value: opts.value ?? "",
      placeholder: opts.placeholder || null,
      autocomplete: opts.autocomplete || null,
      required: opts.required === true,
      minLength: opts.minLength || null,
      maxLength: opts.maxLength || null,
      inputMode: opts.inputMode || null,
      readOnly: opts.readOnly === true,
      ariaDescribedby: opts.aide ? id + "-aide" : null
    });
    const groupe = element("div", { className: "field-group" }, [
      element("label", { htmlFor: id }, opts.label || ""),
      controle
    ]);
    if (opts.aide) groupe.appendChild(element("p", { id: id + "-aide", className: "field-help" }, opts.aide));
    return { groupe, controle };
  }

  function select(options) {
    const opts = options || {};
    const controle = element("select", { id: opts.id, name: opts.name || opts.id, required: opts.required === true });
    (opts.options || []).forEach(function (option) {
      controle.appendChild(element("option", {
        value: option.value,
        selected: String(option.value) === String(opts.value)
      }, option.label));
    });
    return {
      groupe: element("div", { className: "field-group" }, [
        element("label", { htmlFor: opts.id }, opts.label || ""),
        controle
      ]),
      controle
    };
  }

  function caseACocher(id, libelle, cochee) {
    const controle = element("input", { id, name: id, type: "checkbox", checked: cochee === true });
    return {
      groupe: element("label", { className: "checkbox-row", htmlFor: id }, [controle, element("span", {}, libelle)]),
      controle
    };
  }

  function actions(boutons) {
    return element("div", { className: "button-group page-actions" }, boutons);
  }

  function panneau(titre, enfants, classe) {
    return element("section", { className: classe || "form-zone" }, [
      titre ? element("h2", {}, titre) : null,
      enfants
    ]);
  }

  function afficher(page, options) {
    if (application) {
      application.classList.remove("layout-compact", "layout-officer", "layout-wide");
      if (page.matches(".auth-form, .home-screen")) application.classList.add("layout-compact");
      else if (page.matches(".officer-dashboard")) application.classList.add("layout-officer");
      else application.classList.add("layout-wide");
    }
    contenu.replaceChildren(page);
    contenu.setAttribute("aria-busy", options?.busy === true ? "true" : "false");
    const titre = options?.focus || page.querySelector("h2, h1, [tabindex='-1']");
    if (titre instanceof HTMLElement) {
      if (!titre.hasAttribute("tabindex")) titre.tabIndex = -1;
      titre.focus({ preventScroll: true });
    }
  }

  function chargement(message) {
    afficher(element("section", { className: "loading-zone", role: "status" }, [
      element("div", { className: "loading-spinner", ariaHidden: "true" }),
      element("p", {}, message || "Chargement…")
    ]), { busy: true });
  }

  function statut(message, type) {
    if (!zoneStatut) return;
    zoneStatut.className = "app-status " + (type || "info");
    zoneStatut.textContent = String(message || "");
  }

  function effacerStatut() {
    if (!zoneStatut) return;
    zoneStatut.textContent = "";
    zoneStatut.className = "app-status";
  }

  function message(titre, contenuMessage) {
    return new Promise(function (resoudre) {
      let terminee = false;
      function terminer() {
        if (terminee) return;
        terminee = true;
        resoudre();
      }
      const dialogue = global.MPPDialog.creer(titre, {
        fermetureEchap: true,
        onClose: terminer
      });
      dialogue.contenu.appendChild(element("p", {}, contenuMessage));
      const fermer = bouton("OK", function () {
        dialogue.fermer();
        terminer();
      });
      dialogue.actions.appendChild(fermer);
      dialogue.focaliser(fermer);
    });
  }

  function confirmer(titre, contenuMessage, libelle, options) {
    return new Promise(function (resoudre) {
      const dialogue = global.MPPDialog.creer(titre, {
        fermetureEchap: true,
        type: options?.danger === true ? "alertdialog" : "dialog",
        onClose: function () { resoudre(false); }
      });
      dialogue.contenu.appendChild(element("p", {}, contenuMessage));
      const annuler = bouton("Annuler", function () { dialogue.fermer(); resoudre(false); }, { className: "secondary-button" });
      const valider = bouton(libelle || "Confirmer", function () { dialogue.fermer(); resoudre(true); }, {
        className: options?.danger === true ? "danger-button" : ""
      });
      dialogue.actions.append(annuler, valider);
      dialogue.focaliser(options?.danger === true ? annuler : valider);
    });
  }

  function demanderMotDePasse(titre, messageInstruction, pseudo) {
    return new Promise(function (resoudre) {
      const dialogue = global.MPPDialog.creer(titre, {
        fermetureEchap: true,
        onClose: function () { resoudre(""); }
      });
      const formulaire = element("form", { className: "dialog-form" });
      const username = element("input", {
        type: "text",
        name: "username",
        value: pseudo || "",
        autocomplete: "username",
        readOnly: true,
        className: "visually-hidden",
        tabIndex: -1,
        ariaHidden: "true"
      });
      const motDePasse = champ({
        id: "dialog-current-password",
        name: "password",
        type: "password",
        label: "Mot de passe administrateur",
        autocomplete: "current-password",
        required: true,
        maxLength: 256
      });
      formulaire.append(element("p", {}, messageInstruction), username, motDePasse.groupe);
      dialogue.contenu.appendChild(formulaire);
      const annuler = bouton("Annuler", function () { motDePasse.controle.value = ""; dialogue.fermer(); resoudre(""); }, { className: "secondary-button" });
      const valider = bouton("Valider", null, { type: "submit" });
      dialogue.actions.append(annuler, valider);
      formulaire.addEventListener("submit", function (evenement) {
        evenement.preventDefault();
        const valeur = motDePasse.controle.value;
        motDePasse.controle.value = "";
        dialogue.fermer();
        resoudre(valeur);
      });
      dialogue.actions.addEventListener("submit", function (evenement) { evenement.preventDefault(); });
      valider.addEventListener("click", function () { formulaire.requestSubmit(); });
      dialogue.focaliser(motDePasse.controle);
    });
  }

  function demanderTexte(titre, libelle, options) {
    return new Promise(function (resoudre) {
      const dialogue = global.MPPDialog.creer(titre, {
        fermetureEchap: true,
        onClose: function () { resoudre(null); }
      });
      const saisie = champ({
        id: "dialog-text-value",
        label: libelle,
        multiline: options?.multiline === true,
        maxLength: options?.maxLength || 500,
        required: options?.required === true
      });
      const formulaire = element("form", { className: "dialog-form" }, saisie.groupe);
      dialogue.contenu.appendChild(formulaire);
      const annuler = bouton("Annuler", function () { dialogue.fermer(); resoudre(null); }, { className: "secondary-button" });
      const valider = bouton("Continuer", function () { formulaire.requestSubmit(); });
      dialogue.actions.append(annuler, valider);
      formulaire.addEventListener("submit", function (evenement) {
        evenement.preventDefault();
        const valeur = saisie.controle.value.trim();
        saisie.controle.value = "";
        dialogue.fermer();
        resoudre(valeur);
      });
      dialogue.focaliser(saisie.controle);
    });
  }

  function tableau(entetes, lignes, options) {
    const table = element("table", { className: options?.className || "data-table" });
    if (options?.caption) table.appendChild(element("caption", {}, options.caption));
    const thead = element("thead");
    const trEntete = element("tr");
    entetes.forEach(function (entete) {
      const description = entete && typeof entete === "object" && !(entete instanceof Node)
        ? entete
        : { contenu: entete };
      trEntete.appendChild(element("th", { scope: "col", ...(description.attributs || {}) }, description.contenu));
    });
    thead.appendChild(trEntete);
    const tbody = element("tbody");
    lignes.forEach(function (cellules) {
      const tr = element("tr");
      cellules.forEach(function (cellule, index) {
        const entete = entetes[index];
        const description = entete && typeof entete === "object" && !(entete instanceof Node) ? entete : { contenu: entete };
        const libelle = description.libelle || (typeof description.contenu === "string" ? description.contenu : "");
        const balise = options?.rowHeaders === true && index === 0 ? "th" : "td";
        tr.appendChild(element(balise, {
          scope: balise === "th" ? "row" : null,
          dataset: libelle ? { label: libelle } : null
        }, cellule));
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    return element("div", { className: "table-wrapper", tabIndex: 0 }, table);
  }

  function formaterDate(valeur) {
    if (!valeur) return "Jamais";
    const date = new Date(valeur);
    return Number.isNaN(date.getTime()) ? String(valeur) : date.toLocaleString("fr-FR");
  }

  global.MPPUI = Object.freeze({
    texte, ajouter, element, bouton, champ, select, caseACocher, actions, panneau,
    afficher, chargement, statut, effacerStatut, message, confirmer, demanderMotDePasse,
    tableau, formaterDate, demanderTexte
  });
})(window);
