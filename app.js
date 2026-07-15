/* ==========================================================
   MPP OPERATIONS CENTER
   Orchestrateur frontend
   Version Alpha 0.13.0.2 - Security & Reliability
   ========================================================== */

(function initialiserMPP(global) {
  "use strict";

  const UI = global.MPPUI;
  const State = global.MPPState;
  const Logger = global.MPPLogger;
  const Joueurs = global.MPPJoueurs;
  const Presences = global.MPPPresences;
  const Competitions = global.MPPCompetitions;
  const Discord = global.MPPDiscord;
  const Journal = global.MPPJournal;
  const VERSION_SITE = global.MPP_CONFIG.version;
  const CLE_PSEUDO = global.MPP_CONFIG.savedPseudoKey;

  function resultatErreur(message) {
    return { succes: false, message: message || "Une erreur est survenue." };
  }

  async function appelAPI(action, parametres) {
    const debut = performance.now();
    Logger.information("api_debut", { action });
    try {
      const resultat = await global.apiSupabase(action, parametres || {});
      Logger.information("api_fin", {
        action,
        statut: resultat?.succes ? "succes" : "refus",
        dureeMs: Math.round(performance.now() - debut)
      });
      if (resultat?.code === "SESSION_EXPIREE") {
        if (resultat.porteeSession === "joueur") {
          global.MPPSession.toutEffacer();
          State.effacer();
        } else {
          global.MPPSession.effacerSessionAdmin();
          State.etat.accesAdmin = false;
          State.etat.estSuperAdmin = false;
        }
      }
      return resultat || resultatErreur("Réponse serveur invalide.");
    } catch (_erreur) {
      Logger.erreur("api_exception", {
        action,
        statut: "erreur",
        dureeMs: Math.round(performance.now() - debut)
      });
      return resultatErreur("Service temporairement indisponible.");
    }
  }

  const appelAPISensible = appelAPI;

  function estSucces(resultat) {
    return resultat?.succes === true || resultat?.success === true;
  }

  function estSuperAdminConnecte() {
    return State.etat.accesAdmin && State.etat.estSuperAdmin;
  }

  function memoriserPseudo(pseudo, actif) {
    try {
      if (actif) localStorage.setItem(CLE_PSEUDO, pseudo);
      else localStorage.removeItem(CLE_PSEUDO);
    } catch (_erreur) {
      Logger.avertissement("stockage_pseudo_indisponible");
    }
  }

  function lirePseudoMemorise() {
    try { return String(localStorage.getItem(CLE_PSEUDO) || ""); }
    catch (_erreur) { return ""; }
  }

  function afficherVersionSite() {
    const element = document.getElementById("version-site");
    if (element) element.textContent = VERSION_SITE;
  }

  function titrePage(titre, sousTitre) {
    return [
      UI.element("h2", {}, titre),
      sousTitre ? UI.element("p", { className: "page-subtitle" }, sousTitre) : null
    ];
  }

  async function deconnexion() {
    const fermetureDistante = global.apiSupabase("fermerSession", {});
    global.MPPSession.toutEffacer();
    State.effacer();
    afficherConnexion();
    try { await fermetureDistante; }
    catch (_erreur) { Logger.avertissement("fermeture_session_distante_indisponible"); }
  }

  function afficherConnexion(message) {
    State.etat.vue = "connexion";
    const pseudoSauve = lirePseudoMemorise();
    const pseudo = UI.champ({
      id: "login-pseudo",
      name: "username",
      label: "Pseudo",
      value: pseudoSauve,
      autocomplete: "username",
      required: true,
      maxLength: 80
    });
    const code = UI.champ({
      id: "login-access-code",
      name: "password",
      type: "password",
      label: "Code d’accès",
      autocomplete: "current-password",
      required: true,
      minLength: 10,
      maxLength: 256
    });
    const souvenir = UI.caseACocher("remember-pseudo", "Se souvenir de mon pseudo", Boolean(pseudoSauve));
    const erreur = UI.element("p", { className: "error", role: "alert", hidden: !message }, message || "");
    const boutonConnexion = UI.bouton("Se connecter", null, { type: "submit" });
    const formulaire = UI.element("form", { className: "form-zone auth-form", noValidate: true }, [
      ...titrePage("Identification", "Accédez à vos compétitions et à vos présences."),
      pseudo.groupe,
      code.groupe,
      souvenir.groupe,
      erreur,
      UI.actions([boutonConnexion])
    ]);
    formulaire.addEventListener("submit", async function (evenement) {
      evenement.preventDefault();
      erreur.hidden = true;
      const pseudoValeur = pseudo.controle.value.trim();
      let codeValeur = code?.controle.value || "";
      if (!pseudoValeur || codeValeur.length < 10) {
        erreur.textContent = "Saisissez votre pseudo et votre code d’accès.";
        erreur.hidden = false;
        return;
      }
      boutonConnexion.disabled = true;
      UI.statut("Identification en cours…", "info");
      const resultat = await appelAPISensible("identifierUtilisateur", {
        pseudo: pseudoValeur,
        codeAcces: codeValeur
      });
      codeValeur = "";
      if (code) code.controle.value = "";
      boutonConnexion.disabled = false;
      UI.effacerStatut();
      if (!estSucces(resultat)) {
        erreur.textContent = resultat.message || "Identification impossible.";
        erreur.hidden = false;
        code.controle.focus();
        return;
      }
      memoriserPseudo(pseudoValeur, souvenir.controle.checked);
      State.definirUtilisateur(resultat);
      afficherAccueilConnecte();
    });
    UI.afficher(formulaire, { focus: pseudo.controle });
  }

  async function restaurerSession() {
    if (!global.MPPSession.lireSessionJoueur()) return false;
    const resultat = await appelAPI("restaurerSession");
    if (!estSucces(resultat)) {
      global.MPPSession.toutEffacer();
      return false;
    }
    State.definirUtilisateur(resultat);
    afficherAccueilConnecte();
    return true;
  }

  function afficherAccueilConnecte() {
    const joueur = State.etat.utilisateur;
    if (!joueur) return afficherConnexion();
    State.etat.vue = "accueil";
    const discordEtat = Discord.presentation(joueur);
    const discord = UI.element("p", {
      className: discordEtat.lie ? "discord-linked-state" : "discord-unlinked-state"
    }, discordEtat.libelle);
    const boutons = [UI.bouton("Consulter mes compétitions", afficherCompetitionsJoueur)];
    if (!discordEtat.lie) {
      boutons.push(UI.bouton("Lier mon compte Discord", afficherLiaisonDiscord, { className: "secondary-button" }));
    }
    boutons.push(UI.bouton("Modifier mon code d’accès", afficherChangerCodeAcces, { className: "secondary-button" }));
    if (State.estOfficier()) {
      boutons.push(UI.bouton("Accéder à l’espace officier", demanderAccesOfficier, { className: "secondary-button" }));
    }
    boutons.push(UI.bouton("Se déconnecter", deconnexion, { className: "secondary-button" }));
    const actionsAccueil = UI.actions(boutons);
    actionsAccueil.classList.add("home-actions");
    UI.afficher(UI.panneau("Accueil", [
      UI.element("p", { className: "connected-user" }, "Connecté : " + joueur.pseudo),
      UI.element("p", {}, "Rôles : " + (joueur.roles || "Aucun")),
      discord,
      actionsAccueil
    ], "form-zone home-screen"));
  }

  function formulaireCredential(options) {
    return new Promise(function (resoudre) {
      const dialogue = global.MPPDialog.creer(options.titre, {
        fermetureEchap: true,
        onClose: function () { resoudre(null); }
      });
      const form = UI.element("form", { className: "dialog-form" });
      const username = UI.element("input", {
        type: "text",
        name: "username",
        value: State.etat.utilisateur?.pseudo || "",
        autocomplete: "username",
        readOnly: true,
        tabIndex: -1,
        ariaHidden: "true",
        className: "visually-hidden"
      });
      const actuel = options.demanderActuel === false ? null : UI.champ({ id: "credential-current", name: "current-password", type: "password", label: options.libelleActuel, autocomplete: "current-password", required: true, maxLength: 256 });
      const longueurMinimale = Number(options.longueurMinimale || 10);
      const nouveau = UI.champ({ id: "credential-new", name: "new-password", type: "password", label: options.libelleNouveau, autocomplete: "new-password", required: true, minLength: longueurMinimale, maxLength: 256 });
      const confirmation = UI.champ({ id: "credential-confirm", name: "new-password-confirmation", type: "password", label: "Confirmer", autocomplete: "new-password", required: true, minLength: longueurMinimale, maxLength: 256 });
      const erreur = UI.element("p", { className: "error", role: "alert", hidden: true });
      form.append(username);
      if (actuel) form.appendChild(actuel.groupe);
      form.append(nouveau.groupe, confirmation.groupe, erreur);
      dialogue.contenu.appendChild(form);
      const annuler = UI.bouton("Annuler", function () { nettoyer(); dialogue.fermer(); resoudre(null); }, { className: "secondary-button" });
      const valider = UI.bouton("Modifier", function () { form.requestSubmit(); });
      dialogue.actions.append(annuler, valider);
      function nettoyer() {
        if (actuel) actuel.controle.value = "";
        nouveau.controle.value = "";
        confirmation.controle.value = "";
      }
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (nouveau.controle.value.length < longueurMinimale) {
          erreur.textContent = options.messageTropCourt || "La nouvelle valeur doit contenir au moins 10 caractères.";
          erreur.hidden = false;
          return;
        }
        if (nouveau.controle.value !== confirmation.controle.value) {
          erreur.textContent = "La confirmation ne correspond pas.";
          erreur.hidden = false;
          return;
        }
        const valeurs = { actuel: actuel?.controle.value || "", nouveau: nouveau.controle.value };
        nettoyer();
        dialogue.fermer();
        resoudre(valeurs);
      });
      dialogue.focaliser(actuel?.controle || nouveau.controle);
    });
  }

  async function afficherChangerCodeAcces() {
    const valeurs = await formulaireCredential({
      titre: "Modifier le code d’accès",
      libelleActuel: "Code d’accès actuel",
      libelleNouveau: "Nouveau code d’accès",
      messageTropCourt: "Le nouveau code d’accès doit contenir au moins 10 caractères."
    });
    if (!valeurs) return;
    let codeActuel = valeurs.actuel;
    let nouveauCode = valeurs.nouveau;
    valeurs.actuel = "";
    valeurs.nouveau = "";
    UI.chargement("Modification du code d’accès…");
    const resultat = await appelAPISensible("changerCodeAcces", { codeActuel, nouveauCode });
    codeActuel = "";
    nouveauCode = "";
    if (!estSucces(resultat)) {
      await UI.message("Modification refusée", resultat.message || "Le code d’accès n’a pas été modifié.");
      afficherAccueilConnecte();
      return;
    }
    State.effacer();
    await UI.message("Code d’accès modifié", resultat.message || "Reconnectez-vous avec votre nouveau code.");
    afficherConnexion();
  }

  async function afficherCompetitionsJoueur() {
    UI.chargement("Chargement des compétitions…");
    const resultat = await appelAPI("chargerCompetitions", { portee: "joueur" });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherAccueilConnecte);
    const liste = UI.element("div", { className: "competition-list" });
    (resultat.competitions || []).forEach(function (competition) {
      liste.appendChild(UI.element("article", { className: "competition-card" }, [
        UI.element("h3", {}, competition.nom || "Compétition"),
        UI.element("p", {}, "Statut : " + (competition.statut || "-")),
        UI.element("p", {}, competition.description || ""),
        UI.actions([UI.bouton("Ouvrir", function () { afficherPresenceCompetition(competition); })])
      ]));
    });
    if (!liste.children.length) liste.appendChild(UI.element("p", {}, "Aucune compétition disponible."));
    UI.afficher(UI.panneau("Mes compétitions", [liste, UI.actions([
      UI.bouton("Retour", afficherAccueilConnecte, { className: "secondary-button" })
    ])]));
  }

  async function afficherPresenceCompetition(competition) {
    UI.chargement("Chargement de vos présences…");
    const resultat = await appelAPI("chargerCompetitionComplete", { idCompetition: competition.id });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherCompetitionsJoueur);
    const index = new Map((resultat.presences || []).map(function (presence) {
      return [presence.dateCompetition, presence];
    }));
    const formulaire = UI.element("form", { className: "presence-form" });
    const controles = [];
    (resultat.dates || []).forEach(function (date) {
      const presence = index.get(date.dateCompetition) || { statut: "Non renseigné", horairesDisponibles: "" };
      const statut = UI.select({
        id: "presence-status-" + date.idDate,
        label: date.dateAffichage,
        value: presence.statut,
        options: Presences.statuts.map(function (valeur) { return { value: valeur, label: valeur }; })
      });
      const horairesChoisis = new Set(Presences.horaires(presence.horairesDisponibles));
      const horaires = Presences.horaires(date.horaires);
      const zoneHoraires = UI.element("fieldset", { className: "schedule-options" }, UI.element("legend", {}, "Horaires disponibles"));
      const cases = [];
      horaires.forEach(function (horaire, position) {
        const caseHoraire = UI.caseACocher("horaire-" + date.idDate + "-" + position, horaire, horairesChoisis.has(horaire));
        cases.push({ horaire, controle: caseHoraire.controle });
        zoneHoraires.appendChild(caseHoraire.groupe);
      });
      if (!horaires.length) zoneHoraires.appendChild(UI.element("p", {}, "Aucun horaire spécifique."));
      const initiale = Presences.valeurControle({ date, statut: statut.controle, cases });
      const controle = { date, statut: statut.controle, cases, initiale };
      function synchroniserHoraires() {
        const autorises = Presences.autoriseHoraires(statut.controle.value) && resultat.peutRemplir !== false;
        cases.forEach(function (item) {
          item.controle.disabled = !autorises;
          if (!autorises) item.controle.checked = false;
        });
        zoneHoraires.classList.toggle("schedule-options-disabled", !autorises);
      }
      statut.controle.disabled = resultat.peutRemplir === false;
      statut.controle.addEventListener("change", synchroniserHoraires);
      synchroniserHoraires();
      controles.push(controle);
      formulaire.appendChild(UI.element("section", { className: "presence-date-row" }, [statut.groupe, zoneHoraires]));
    });
    const erreur = UI.element("p", { className: "error", role: "alert", hidden: true });
    formulaire.append(erreur, UI.actions([
      UI.bouton("Enregistrer", null, { type: "submit", disabled: resultat.peutRemplir === false }),
      UI.bouton("Retour", afficherCompetitionsJoueur, { className: "secondary-button" })
    ]));
    formulaire.addEventListener("submit", async function (event) {
      event.preventDefault();
      const presences = Presences.construirePayload(controles);
      const disponibiliteIncomplete = controles.some(function (controle) {
        return Presences.autoriseHoraires(controle.statut.value) &&
          controle.cases.length > 0 &&
          !controle.cases.some(function (item) { return item.controle.checked; });
      });
      if (disponibiliteIncomplete) {
        erreur.textContent = "Sélectionnez au moins un horaire pour chaque présence ou remplacement.";
        erreur.hidden = false;
        return;
      }
      if (!presences.length) {
        UI.statut("Aucune modification à enregistrer.", "info");
        return;
      }
      const confirme = await UI.confirmer(
        "Confirmer les présences",
        "Enregistrer " + presences.length + " modification" + (presences.length > 1 ? "s" : "") + " pour cette compétition ?",
        "Enregistrer"
      );
      if (!confirme) return;
      UI.chargement("Enregistrement des présences…");
      const sauvegarde = await appelAPI("sauvegarderPresences", { idCompetition: competition.id, presences: JSON.stringify(presences) });
      if (!estSucces(sauvegarde)) return afficherErreurPage(sauvegarde.message, function () { afficherPresenceCompetition(competition); });
      await UI.message("Présences enregistrées", sauvegarde.message || "Vos disponibilités sont à jour.");
      afficherCompetitionsJoueur();
    });
    UI.afficher(UI.panneau(competition.nom || "Présences", [
      UI.element("p", {}, resultat.peutRemplir === false ? "Cette compétition est fermée à la saisie." : "Renseignez vos disponibilités."),
      formulaire
    ]));
  }

  async function afficherLiaisonDiscord() {
    const zone = UI.element("div", { className: "discord-link-zone" });
    const generer = UI.bouton("Générer un code de liaison", async function () {
      generer.disabled = true;
      zone.replaceChildren(UI.element("p", { role: "status" }, "Génération du code…"));
      const resultat = await appelAPI("genererCodeLiaisonDiscord");
      generer.disabled = false;
      if (!estSucces(resultat)) {
        zone.replaceChildren(UI.element("p", { className: "error", role: "alert" }, resultat.message || "Code indisponible."));
        return;
      }
      const code = String(resultat.code || resultat.linkingCode || "");
      if (!code) {
        zone.replaceChildren(UI.element("p", { className: "error" }, "Le serveur n’a pas retourné de code."));
        return;
      }
      const codeElement = UI.element("code", { className: "discord-link-code" }, code);
      const copier = UI.bouton("Copier", async function () {
        try { await navigator.clipboard.writeText(code); UI.statut("Code copié.", "success"); }
        catch (_erreur) { UI.statut("Copie impossible. Sélectionnez le code.", "error"); }
      }, { className: "secondary-button" });
      zone.replaceChildren(UI.element("p", {}, "Utilisez ce code avec la commande Discord /lier."), codeElement, copier);
    });
    UI.afficher(UI.panneau("Liaison Discord", [zone, UI.actions([
      generer,
      UI.bouton("Retour", afficherAccueilConnecte, { className: "secondary-button" })
    ])]));
  }

  async function demanderAccesOfficier() {
    if (!State.estOfficier()) return UI.message("Accès refusé", "Ce compte n’a pas de rôle officier.");
    let motDePasse = await UI.demanderMotDePasse(
      "Accès officier",
      "Validez votre accès pour ouvrir une session administrative courte.",
      State.etat.utilisateur?.pseudo
    );
    if (!motDePasse) return;
    UI.chargement("Validation de l’accès officier…");
    const resultat = await appelAPISensible("verifierMotDePasse", {
      pseudo: State.etat.utilisateur?.pseudo,
      motDePasse
    });
    motDePasse = "";
    if (!estSucces(resultat)) {
      await UI.message("Accès refusé", resultat.message || "Authentification impossible.");
      afficherAccueilConnecte();
      return;
    }
    State.definirAccesAdmin(resultat);
    afficherEspaceOfficier();
  }

  async function afficherEspaceOfficier() {
    if (!State.etat.accesAdmin) return demanderAccesOfficier();
    UI.chargement("Chargement du tableau de bord…");
    const resultat = await appelAPI("chargerDonneesOfficierInitiales");
    if (!estSucces(resultat)) return gererErreurAdmin(resultat, afficherAccueilConnecte);
    const stats = UI.element("div", { className: "dashboard-grid" }, [
      carteTableauDeBord("👥 Joueurs", [
        ["Total", resultat.joueurs?.total || 0],
        ["🟢 Actifs", resultat.joueurs?.actifs || 0],
        ["⚪ Inactifs", resultat.joueurs?.inactifs || 0],
        ["🔴 Suspendus", resultat.joueurs?.suspendus || 0]
      ]),
      carteTableauDeBord("🕊️ Activité", [
        ["Connectés ≤ 7 jours", resultat.joueurs?.connectes7Jours || 0],
        ["Connectés ≤ 30 jours", resultat.joueurs?.connectes30Jours || 0],
        ["Inactifs > 30 jours", resultat.joueurs?.inactifs30Jours || 0],
        ["Jamais connectés", resultat.joueurs?.jamaisConnectes || 0]
      ]),
      carteTableauDeBord("🏆 Compétitions", [
        ["🟢 Ouvertes", resultat.competitions?.ouvertes || 0],
        ["🟠 Brouillons", resultat.competitions?.brouillon || 0],
        ["🔒 Fermées", resultat.competitions?.fermees || 0],
        ["📦 Archivées", resultat.competitions?.archivees || 0]
      ])
    ]);
    const actionsPrincipales = UI.actions([
      UI.bouton("Présences du jour", afficherAujourdHuiOfficier),
      UI.bouton("Consulter les présences", afficherSelectionCompetitionOfficier),
      UI.bouton("Gérer les compétitions", afficherGestionCompetitions, { className: "secondary-button" }),
      UI.bouton("Gérer les joueurs", afficherGestionJoueurs, { className: "secondary-button" }),
      UI.bouton("Journal d’activité", afficherJournalActivite, { className: "secondary-button" })
    ]);
    actionsPrincipales.classList.add("officer-primary-actions");
    const actionsSecondaires = [
      UI.bouton("Modifier mon mot de passe", afficherChangerMotDePasseAdmin, { className: "secondary-button" })
    ];
    if (estSuperAdminConnecte()) actionsSecondaires.push(UI.bouton("Demandes Discord", afficherDemandesLiaisonDiscord, { className: "secondary-button" }));
    const zoneSecondaire = UI.actions(actionsSecondaires);
    zoneSecondaire.classList.add("officer-secondary-actions");
    const retour = UI.actions([
      UI.bouton("Retour à l’accueil", afficherAccueilConnecte, { className: "secondary-button" })
    ]);
    retour.classList.add("officer-return-actions");
    UI.afficher(UI.panneau("Tableau de bord officier", [
      UI.element("p", { className: "officer-connected-user" }, "Connecté en tant que : " + (State.etat.utilisateur?.pseudo || "-")),
      stats,
      actionsPrincipales,
      zoneSecondaire,
      retour
    ], "form-zone officer-dashboard"));
  }

  function carteTableauDeBord(titre, lignes) {
    return UI.element("article", { className: "dashboard-card" }, [
      UI.element("h3", {}, titre),
      lignes.map(function ([libelle, valeur]) {
        return UI.element("p", { className: "dashboard-metric" }, [
          UI.element("span", {}, libelle + " :"),
          UI.element("strong", {}, String(valeur))
        ]);
      })
    ]);
  }

  function carteStat(libelle, valeur) {
    return UI.element("article", { className: "stat-card" }, [
      UI.element("strong", { className: "stat-value" }, String(valeur)),
      UI.element("span", { className: "stat-label" }, libelle)
    ]);
  }

  function libelleStatutRappel(statut) {
    const libelles = {
      envoye: "Rappel envoyé",
      aucun_joueur: "Aucun joueur à relancer",
      erreur: "Erreur d’envoi",
      en_cours: "Envoi en cours",
      pas_encore_envoye: "En attente de l’heure programmée",
      indisponible: "Statut indisponible"
    };
    return libelles[String(statut || "").toLowerCase()] || "En attente de l’heure programmée";
  }

  function gererErreurAdmin(resultat, retour) {
    if (resultat?.code === "SESSION_EXPIREE" || resultat?.porteeSession === "admin") {
      State.etat.accesAdmin = false;
      State.etat.estSuperAdmin = false;
      global.MPPSession.effacerSessionAdmin();
    }
    afficherErreurPage(resultat?.message || "Action officier indisponible.", retour || afficherAccueilConnecte);
  }

  function afficherErreurPage(message, retour) {
    const actionRetour = State.etat.utilisateur ? (retour || afficherAccueilConnecte) : afficherConnexion;
    UI.afficher(UI.panneau("Une action n’a pas abouti", [
      UI.element("p", { className: "error", role: "alert" }, message || "Erreur inattendue."),
      UI.actions([UI.bouton("Retour", actionRetour, { className: "secondary-button" })])
    ]));
  }

  async function afficherGestionJoueurs() {
    if (!State.etat.accesAdmin) return demanderAccesOfficier();
    UI.chargement("Chargement des joueurs…");
    const resultat = await appelAPI("chargerJoueurs");
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const joueurs = resultat.joueurs || [];
    const recherche = UI.champ({ id: "players-search", label: "Rechercher", placeholder: "Pseudo ou rôle" });
    const statut = UI.select({ id: "players-status", label: "Statut", value: "Tous", options: ["Tous", ...Joueurs.statuts].map(function (v) { return { value: v, label: v }; }) });
    const zone = UI.element("div");
    let triAscendant = true;
    function rendre() {
      const filtreStatut = statut.controle.value;
      const filtres = Joueurs.filtrerEtTrier(joueurs, recherche.controle.value, filtreStatut, triAscendant);
      const lignes = filtres.map(function (joueur) {
        const pseudo = UI.element("span", { className: "player-name-layout" }, [
          UI.element("span", {}, joueur.pseudo),
          joueur.discordLie ? UI.element("span", { className: "discord-badge", title: Discord.presentation(joueur).titreBadge, ariaLabel: "Discord lié" }, "D") : null
        ]);
        const actions = [UI.bouton("Modifier", function () { afficherFormulaireJoueur(joueur); }, { className: "secondary-button" })];
        if (estSuperAdminConnecte()) actions.push(UI.bouton("Supprimer", function () { supprimerJoueur(joueur); }, { className: "danger-button" }));
        return [pseudo, joueur.roles || "", joueur.statut || "", UI.formaterDate(joueur.derniereConnexion), UI.actions(actions)];
      });
      zone.replaceChildren(UI.tableau([{
        contenu: UI.bouton("Pseudo " + (triAscendant ? "↑" : "↓"), function () { triAscendant = !triAscendant; rendre(); }, {
          className: "table-sort-button",
          ariaLabel: "Trier les joueurs par pseudo, ordre " + (triAscendant ? "décroissant" : "croissant")
        }),
        libelle: "Pseudo",
        attributs: { ariaSort: triAscendant ? "ascending" : "descending" }
      },
        "Rôles", "Statut", "Dernière connexion", "Actions"
      ], lignes, { caption: "Liste des joueurs" }));
    }
    recherche.controle.addEventListener("input", rendre);
    statut.controle.addEventListener("change", rendre);
    rendre();
    UI.afficher(UI.panneau("Gestion des joueurs", [
      UI.element("div", { className: "filters-row" }, [recherche.groupe, statut.groupe]),
      zone,
      UI.actions([
        UI.bouton("Ajouter un joueur", function () { afficherFormulaireJoueur(null); }),
        UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
      ])
    ]));
  }

  function controlesRoles(rolesActuels, options) {
    const actifs = new Set(Joueurs.listeRoles(rolesActuels).map(Joueurs.normaliser));
    const controles = [];
    const rolesMasques = [];
    const fieldset = UI.element("fieldset", { className: "role-options" }, UI.element("legend", {}, "Rôles"));
    Joueurs.roles.forEach(function (role, index) {
      if (role === "SuperAdmin" && !estSuperAdminConnecte()) {
        if (options?.preserverRolesMasques === true && actifs.has(Joueurs.normaliser(role))) rolesMasques.push(role);
        return;
      }
      const item = UI.caseACocher("role-" + index, role, actifs.has(Joueurs.normaliser(role)));
      controles.push({ role, controle: item.controle });
      fieldset.appendChild(item.groupe);
    });
    return { fieldset, controles, rolesMasques };
  }

  function valeurRoles(controles) {
    return [
      Joueurs.rolesSelectionnes(controles.controles),
      ...(controles.rolesMasques || [])
    ].filter(Boolean).join(",");
  }

  function afficherFormulaireJoueur(joueur) {
    const edition = Boolean(joueur);
    const pseudo = UI.champ({ id: "player-pseudo", label: "Pseudo", value: joueur?.pseudo || "", required: true, maxLength: 80 });
    const roles = controlesRoles(joueur?.roles || "Soldat", {
      preserverRolesMasques: edition
    });
    const statut = UI.select({ id: "player-status", label: "Statut", value: joueur?.statut || "Actif", options: Joueurs.statuts.map(function (v) { return { value: v, label: v }; }) });
    const code = (!edition || estSuperAdminConnecte()) ? UI.champ({
      id: "player-access-code",
      name: "new-password",
      type: "password",
      label: edition ? "Nouveau code d’accès (facultatif)" : "Code d’accès initial",
      autocomplete: "new-password",
      required: !edition,
      minLength: 10,
      maxLength: 256,
      aide: "10 caractères minimum. Le code n’est jamais affiché après enregistrement."
    }) : null;
    const credentialAdmin = estSuperAdminConnecte() ? UI.champ({
      id: "player-admin-credential",
      name: "new-password",
      type: "password",
      label: edition ? "Nouveau mot de passe administrateur (facultatif)" : "Mot de passe administrateur initial (si rôle privilégié)",
      autocomplete: "new-password",
      minLength: 12,
      maxLength: 256,
      aide: "Requis pour un nouveau compte Officier ou SuperAdmin. 12 caractères minimum."
    }) : null;
    const discord = estSuperAdminConnecte() ? UI.champ({
      id: "player-discord-id",
      label: "ID Discord (facultatif)",
      value: joueur?.discordId || "",
      inputMode: "numeric",
      maxLength: 20,
      aide: "17 à 20 chiffres. Laissez vide pour retirer la liaison administrative."
    }) : null;
    const erreur = UI.element("p", { className: "error", role: "alert", hidden: true });
    const formulaire = UI.element("form", { className: "form-zone" }, [
      ...titrePage(edition ? "Modifier un joueur" : "Ajouter un joueur"),
      pseudo.groupe,
      roles.fieldset,
      statut.groupe,
      discord?.groupe,
      code?.groupe,
      credentialAdmin?.groupe,
      erreur,
      UI.actions([
        UI.bouton(edition ? "Enregistrer" : "Ajouter", null, { type: "submit" }),
        UI.bouton("Annuler", afficherGestionJoueurs, { className: "secondary-button" })
      ])
    ]);
    formulaire.addEventListener("submit", async function (event) {
      event.preventDefault();
      const rolesValeur = valeurRoles(roles);
      let codeValeur = code?.controle.value || "";
      let credentialAdminValeur = credentialAdmin?.controle.value || "";
      if (!rolesValeur) {
        erreur.textContent = "Sélectionnez au moins un rôle.";
        erreur.hidden = false;
        return;
      }
      if ((!edition || codeValeur) && codeValeur.length < 10) {
        erreur.textContent = "Le code d’accès doit contenir au moins 10 caractères.";
        erreur.hidden = false;
        return;
      }
      const rolePrivilegie = Joueurs.rolePresent(rolesValeur, "Officier") || Joueurs.rolePresent(rolesValeur, "SuperAdmin");
      const dejaPrivilegie = Joueurs.rolePresent(joueur?.roles, "Officier") || Joueurs.rolePresent(joueur?.roles, "SuperAdmin");
      if (credentialAdminValeur && credentialAdminValeur.length < 12) {
        erreur.textContent = "Le mot de passe administrateur doit contenir au moins 12 caractères.";
        erreur.hidden = false;
        return;
      }
      const discordValeur = discord?.controle.value.trim() || "";
      if (discordValeur && !/^[0-9]{17,20}$/.test(discordValeur)) {
        erreur.textContent = "L’identifiant Discord doit contenir entre 17 et 20 chiffres.";
        erreur.hidden = false;
        return;
      }
      if (rolePrivilegie && (!edition || !dejaPrivilegie || joueur?.credentialAdminConfigure !== true) && !credentialAdminValeur) {
        erreur.textContent = "Configurez un mot de passe administrateur pour ce rôle privilégié.";
        erreur.hidden = false;
        return;
      }
      UI.chargement(edition ? "Modification du joueur…" : "Ajout du joueur…");
      const resultat = await appelAPISensible(edition ? "modifierJoueur" : "ajouterJoueur", {
        idJoueur: joueur?.id,
        pseudo: pseudo.controle.value.trim(),
        roles: rolesValeur,
        statut: statut.controle.value,
        discordId: discordValeur,
        codeAcces: codeValeur,
        motDePasseAdminInitial: credentialAdminValeur
      });
      codeValeur = "";
      credentialAdminValeur = "";
      if (code) code.controle.value = "";
      if (credentialAdmin) credentialAdmin.controle.value = "";
      if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherGestionJoueurs);
      await UI.message("Gestion des joueurs", resultat.message || "Joueur enregistré.");
      afficherGestionJoueurs();
    });
    UI.afficher(formulaire, { focus: pseudo.controle });
  }

  async function supprimerJoueur(joueur) {
    const confirme = await UI.confirmer("Supprimer le joueur", "Supprimer définitivement ce joueur et ses présences ?", "Supprimer", { danger: true });
    if (!confirme) return;
    UI.chargement("Suppression du joueur…");
    const resultat = await appelAPISensible("supprimerJoueur", { idJoueur: joueur.id });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherGestionJoueurs);
    await UI.message("Joueur supprimé", resultat.message || "Le joueur a été supprimé.");
    afficherGestionJoueurs();
  }

  async function afficherGestionCompetitions() {
    if (!State.etat.accesAdmin) return demanderAccesOfficier();
    UI.chargement("Chargement des compétitions…");
    const resultat = await appelAPI("chargerCompetitions", { portee: "admin" });
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const liste = UI.element("div", { className: "competition-list" });
    (resultat.competitions || []).forEach(function (competition) {
      const actions = [
        UI.bouton("Modifier", function () { afficherFormulaireCompetition(competition); }, { className: "secondary-button" }),
        UI.bouton("Dates", function () { afficherGestionDatesCompetition(competition); }, { className: "secondary-button" })
      ];
      if (competition.statut !== "Ouverte") actions.push(UI.bouton("Ouvrir", function () { changerStatutCompetition(competition, "Ouverte"); }));
      if (competition.statut !== "Fermée") actions.push(UI.bouton("Fermer", function () { changerStatutCompetition(competition, "Fermée"); }, { className: "secondary-button" }));
      if (estSuperAdminConnecte() && competition.statut !== "Archivée") actions.push(UI.bouton("Archiver", function () { changerStatutCompetition(competition, "Archivée"); }, { className: "secondary-button" }));
      if (estSuperAdminConnecte()) actions.push(UI.bouton("Supprimer", function () { supprimerCompetition(competition); }, { className: "danger-button" }));
      liste.appendChild(UI.element("article", { className: "competition-card" }, [
        UI.element("h3", {}, competition.nom || "Compétition"),
        UI.element("p", {}, "Statut : " + competition.statut),
        UI.element("p", {}, competition.description || ""),
        UI.actions(actions)
      ]));
    });
    if (!liste.children.length) liste.appendChild(UI.element("p", {}, "Aucune compétition."));
    UI.afficher(UI.panneau("Gestion des compétitions", [liste, UI.actions([
      UI.bouton("Créer une compétition", function () { afficherFormulaireCompetition(null); }),
      UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
    ])]));
  }

  function afficherFormulaireCompetition(competition) {
    const edition = Boolean(competition);
    const nom = UI.champ({ id: "competition-name", label: "Nom", value: competition?.nom || "", required: true, maxLength: 120 });
    const description = UI.champ({ id: "competition-description", label: "Description", value: competition?.description || "", multiline: true, maxLength: 2000 });
    const statut = UI.select({ id: "competition-status", label: "Statut", value: competition?.statut || "Brouillon", options: Competitions.statuts.filter(function (v) { return v !== "Archivée" || estSuperAdminConnecte(); }).map(function (v) { return { value: v, label: v }; }) });
    const roles = controlesRoles(competition?.rolesAutorises || "Officier,Strateur,Soldat", {
      preserverRolesMasques: edition
    });
    const dates = !edition ? UI.champ({ id: "competition-dates", label: "Dates (AAAA-MM-JJ, séparées par des virgules)", required: true, placeholder: "2026-07-15, 2026-07-16" }) : null;
    const horaires = !edition ? UI.champ({ id: "competition-schedules", label: "Horaires", value: "21:00,21:15,21:30" }) : null;
    const auto = UI.caseACocher("competition-auto", "Ouverture et fermeture automatiques", competition?.fermetureAutoActive === true);
    const heureOuverture = UI.champ({ id: "competition-open-time", label: "Heure d’ouverture", type: "time", value: competition?.heureOuverture || "" });
    const heureFermeture = UI.champ({ id: "competition-close-time", label: "Heure de fermeture", type: "time", value: competition?.heureFermeture || "" });
    const notification = UI.caseACocher("competition-staff-notification", "Notification staff", competition?.notificationPresenceActive === true);
    const heureNotification = UI.champ({ id: "competition-staff-time", label: "Heure de notification staff", type: "time", value: competition?.heureNotificationPresence || "19:00" });
    const rappel = UI.caseACocher("competition-player-reminder", "Rappel joueurs", competition?.rappelPresenceActive === true);
    const heureRappel = UI.champ({ id: "competition-reminder-time", label: "Heure du rappel joueurs", type: "time", value: competition?.heureRappelPresence || "17:00" });
    const erreur = UI.element("p", { className: "error", role: "alert", hidden: true });
    const formulaire = UI.element("form", { className: "form-zone competition-form" }, [
      ...titrePage(edition ? "Modifier la compétition" : "Créer une compétition"),
      nom.groupe, description.groupe, statut.groupe, roles.fieldset,
      dates?.groupe, horaires?.groupe,
      auto.groupe, heureOuverture.groupe, heureFermeture.groupe,
      notification.groupe, heureNotification.groupe,
      rappel.groupe, heureRappel.groupe,
      erreur,
      UI.actions([
        UI.bouton(edition ? "Enregistrer" : "Créer", null, { type: "submit" }),
        UI.bouton("Annuler", afficherGestionCompetitions, { className: "secondary-button" })
      ])
    ]);
    formulaire.addEventListener("submit", async function (event) {
      event.preventDefault();
      const rolesValeur = valeurRoles(roles);
      const analyseDates = dates ? Competitions.analyserDates(dates.controle.value) : { dates: [], invalides: [], doublons: [] };
      const datesValeur = analyseDates.dates;
      if (analyseDates.invalides.length || analyseDates.doublons.length) {
        erreur.textContent = analyseDates.invalides.length
          ? "Une ou plusieurs dates sont invalides. Utilisez le format AAAA-MM-JJ."
          : "Une même date ne peut pas être ajoutée plusieurs fois.";
        erreur.hidden = false;
        return;
      }
      const analyseHoraires = horaires
        ? Competitions.analyserHoraires(horaires.controle.value)
        : { horaires: [], invalides: [], doublons: [] };
      if (analyseHoraires.invalides.length || analyseHoraires.doublons.length) {
        erreur.textContent = analyseHoraires.invalides.length
          ? "Un ou plusieurs horaires sont invalides. Utilisez le format HH:MM."
          : "Un même horaire ne peut pas être ajouté plusieurs fois.";
        erreur.hidden = false;
        horaires.controle.focus();
        return;
      }
      if (!nom.controle.value.trim() || !rolesValeur || (!edition && !datesValeur.length)) {
        erreur.textContent = "Complétez le nom, les rôles et au moins une date.";
        erreur.hidden = false;
        return;
      }
      if (auto.controle.checked && (!heureOuverture.controle.value || !heureFermeture.controle.value)) {
        erreur.textContent = "Renseignez les deux horaires automatiques.";
        erreur.hidden = false;
        return;
      }
      const config = {
        idCompetition: competition?.id,
        nom: nom.controle.value.trim(),
        description: description.controle.value.trim(),
        statut: statut.controle.value,
        rolesAutorises: rolesValeur,
        dates: datesValeur,
        horaires: analyseHoraires.horaires.join(","),
        fermetureAutoActive: auto.controle.checked,
        heureOuvertureAuto: heureOuverture.controle.value,
        heureFermetureAuto: heureFermeture.controle.value,
        notificationPresenceActive: notification.controle.checked,
        heureNotificationPresence: heureNotification.controle.value,
        rappelPresenceActive: rappel.controle.checked,
        heureRappelPresence: heureRappel.controle.value
      };
      const confirme = await UI.confirmer(edition ? "Modifier la compétition" : "Créer la compétition", "Confirmer cette configuration ?", edition ? "Enregistrer" : "Créer");
      if (!confirme) return;
      UI.chargement(edition ? "Modification de la compétition…" : "Création de la compétition…");
      const resultat = await appelAPISensible(edition ? "modifierCompetitionComplete" : "creerCompetitionComplete", { config: JSON.stringify(config) });
      if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherGestionCompetitions);
      await UI.message("Gestion des compétitions", resultat.message || "Compétition enregistrée.");
      afficherGestionCompetitions();
    });
    UI.afficher(formulaire, { focus: nom.controle });
  }

  async function changerStatutCompetition(competition, nouveauStatut) {
    const confirme = await UI.confirmer("Changer le statut", "Passer la compétition au statut « " + nouveauStatut + " » ?", "Confirmer");
    if (!confirme) return;
    UI.chargement("Modification du statut…");
    const resultat = await appelAPISensible("modifierStatutCompetition", { idCompetition: competition.id, nouveauStatut });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherGestionCompetitions);
    await UI.message("Statut modifié", resultat.message || "Le statut a été mis à jour.");
    afficherGestionCompetitions();
  }

  async function supprimerCompetition(competition) {
    const confirme = await UI.confirmer("Supprimer la compétition", "Cette suppression retire aussi les dates et les présences associées. Continuer ?", "Supprimer", { danger: true });
    if (!confirme) return;
    UI.chargement("Suppression de la compétition…");
    const resultat = await appelAPISensible("supprimerCompetition", { idCompetition: competition.id });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherGestionCompetitions);
    await UI.message("Compétition supprimée", resultat.message || "La compétition a été supprimée.");
    afficherGestionCompetitions();
  }

  async function afficherGestionDatesCompetition(competition) {
    UI.chargement("Chargement des dates…");
    const resultat = await appelAPI("chargerDatesCompetition", { idCompetition: competition.id, portee: "admin" });
    if (!estSucces(resultat)) return gererErreurAdmin(resultat, afficherGestionCompetitions);
    const liste = UI.element("div", { className: "date-admin-list" });
    (resultat.dates || []).forEach(function (date) {
      liste.appendChild(UI.element("div", { className: "date-admin-row" }, [
        UI.element("span", {}, date.dateAffichage + " — " + (date.horaires || "Sans horaire")),
        UI.bouton("Supprimer", async function () {
          const confirme = await UI.confirmer("Supprimer la date", "Supprimer cette date et ses présences ?", "Supprimer", { danger: true });
          if (!confirme) return;
          UI.chargement("Suppression de la date…");
          const suppression = await appelAPISensible("supprimerDateCompetition", { idDate: date.idDate });
          if (!estSucces(suppression)) return afficherErreurPage(suppression.message, function () { afficherGestionDatesCompetition(competition); });
          afficherGestionDatesCompetition(competition);
        }, { className: "danger-button" })
      ]));
    });
    const date = UI.champ({ id: "new-competition-date", label: "Nouvelle date", type: "date" });
    const horaires = UI.champ({ id: "new-competition-schedules", label: "Horaires", value: "21:00,21:15,21:30" });
    const formulaire = UI.element("form", { className: "inline-form" }, [date.groupe, horaires.groupe, UI.bouton("Ajouter", null, { type: "submit" })]);
    formulaire.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!Competitions.dateIsoValide(date.controle.value)) return UI.statut("Sélectionnez une date valide.", "error");
      const analyseHoraires = Competitions.analyserHoraires(horaires.controle.value);
      if (analyseHoraires.invalides.length || analyseHoraires.doublons.length) {
        UI.statut(
          analyseHoraires.invalides.length
            ? "Utilisez uniquement des horaires HH:MM valides."
            : "Un même horaire ne peut pas être ajouté plusieurs fois.",
          "error"
        );
        horaires.controle.focus();
        return;
      }
      UI.chargement("Ajout de la date…");
      const ajout = await appelAPISensible("ajouterDateCompetition", {
        idCompetition: competition.id,
        dateCompetition: date.controle.value,
        horaires: analyseHoraires.horaires.join(",")
      });
      if (!estSucces(ajout)) return afficherErreurPage(ajout.message, function () { afficherGestionDatesCompetition(competition); });
      afficherGestionDatesCompetition(competition);
    });
    UI.afficher(UI.panneau("Dates — " + competition.nom, [liste, formulaire, UI.actions([
      UI.bouton("Retour", afficherGestionCompetitions, { className: "secondary-button" })
    ])]));
  }

  async function afficherSelectionCompetitionOfficier() {
    UI.chargement("Chargement des compétitions…");
    const resultat = await appelAPI("chargerCompetitions", { portee: "admin" });
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const liste = UI.element("div", { className: "competition-list" });
    (resultat.competitions || []).forEach(function (competition) {
      liste.appendChild(UI.element("article", { className: "competition-card" }, [
        UI.element("h3", {}, competition.nom),
        UI.element("p", {}, "Statut : " + competition.statut),
        UI.actions([
          UI.bouton("Consulter les présences", function () { afficherTableauPresencesOfficier(competition); }),
          UI.bouton("Voir les sans réponse", function () { afficherSansReponse(competition); }, { className: "secondary-button" })
        ])
      ]));
    });
    UI.afficher(UI.panneau("Tableaux de présences", [liste, UI.actions([
      UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
    ])]));
  }

  async function afficherTableauPresencesOfficier(competition) {
    UI.chargement("Chargement du tableau complet…");
    const resultat = await appelAPI("genererTableauPresences", { idCompetition: competition.id });
    if (!estSucces(resultat)) return gererErreurAdmin(resultat, afficherSelectionCompetitionOfficier);
    const entetes = ["Pseudo", "Synthèse", ...(resultat.dates || []).map(function (date) { return date.dateAffichage; }), "Détails"];
    const lignes = (resultat.lignes || []).map(function (ligne) {
      const disponibilites = ligne.disponibilites || [];
      return [ligne.pseudo, ligne.synthese, ...disponibilites.map(function (dispo) {
        const horaires = dispo.horairesDisponibles ? " — " + dispo.horairesDisponibles : "";
        return (dispo.statut || "Non renseigné") + horaires;
      }), UI.bouton("Détails", function () {
        const dialogue = global.MPPDialog.creer("Présences de " + ligne.pseudo, { fermetureEchap: true });
        const details = disponibilites.map(function (dispo) {
          return [dispo.dateAffichage || dispo.dateCompetition, dispo.statut || "Non renseigné", dispo.horairesDisponibles || "-"];
        });
        dialogue.contenu.appendChild(UI.tableau(["Date", "Statut", "Horaires"], details, { caption: "Détail des disponibilités", rowHeaders: true }));
        const fermer = UI.bouton("Fermer", dialogue.fermer);
        dialogue.actions.appendChild(fermer);
        requestAnimationFrame(function () { fermer.focus(); });
      }, { className: "secondary-button" })];
    });
    const statistiquesDates = (resultat.dates || []).map(function (date, index) {
      const stats = { presents: 0, remplacants: 0, absents: 0, sansReponse: 0 };
      (resultat.lignes || []).forEach(function (ligne) {
        const statut = String(ligne.disponibilites?.[index]?.statut || "Non renseigné");
        if (statut === "Présent") stats.presents++;
        else if (statut === "Remplaçant") stats.remplacants++;
        else if (statut === "Absent") stats.absents++;
        else stats.sansReponse++;
      });
      return [date.dateAffichage, stats.presents, stats.remplacants, stats.absents, stats.sansReponse];
    });
    const effectifsHoraires = [];
    (resultat.dates || []).forEach(function (date, index) {
      Presences.horaires(date.horaires).forEach(function (horaire) {
        let presents = 0;
        let remplacants = 0;
        (resultat.lignes || []).forEach(function (ligne) {
          const dispo = ligne.disponibilites?.[index] || {};
          const disponible = Presences.horaires(dispo.horairesDisponibles).includes(horaire);
          if (dispo.statut === "Présent" && disponible) presents++;
          if (dispo.statut === "Remplaçant" && disponible) remplacants++;
        });
        effectifsHoraires.push([date.dateAffichage, horaire, presents, remplacants]);
      });
    });
    UI.afficher(UI.panneau("Présences — " + competition.nom, [
      UI.tableau(entetes, lignes, { caption: "Tableau complet des présences", rowHeaders: true }),
      UI.element("h3", {}, "Statistiques par date"),
      UI.tableau(["Date", "Présents", "Remplaçants", "Absents", "Sans réponse"], statistiquesDates, { caption: "Statistiques des présences par date", rowHeaders: true }),
      effectifsHoraires.length ? UI.element("div", {}, [
        UI.element("h3", {}, "Effectif par horaire"),
        UI.tableau(["Date", "Horaire", "Présents", "Remplaçants"], effectifsHoraires, { caption: "Effectif disponible par horaire", rowHeaders: true })
      ]) : null,
      UI.actions([
        UI.bouton("Présences du jour", afficherAujourdHuiOfficier),
        UI.bouton("Voir les sans réponse", function () { afficherSansReponse(competition); }, { className: "secondary-button" }),
        UI.bouton("Retour", afficherSelectionCompetitionOfficier, { className: "secondary-button" })
      ])
    ]));
  }

  async function afficherSansReponse(competition) {
    UI.chargement("Chargement des joueurs sans réponse…");
    const resultat = await appelAPI("chargerJoueursSansReponse", { idCompetition: competition.id });
    if (!estSucces(resultat)) return gererErreurAdmin(resultat, afficherSelectionCompetitionOfficier);
    const liste = UI.element("ul", { className: "simple-list" }, (resultat.joueurs || []).map(function (joueur) {
      return UI.element("li", {}, joueur.pseudo + (joueur.roles ? " — " + joueur.roles : ""));
    }));
    if (!liste.children.length) liste.appendChild(UI.element("li", {}, "Tous les joueurs ont répondu."));
    UI.afficher(UI.panneau("Joueurs sans réponse", [liste, UI.actions([
      UI.bouton("Présences du jour", afficherAujourdHuiOfficier),
      UI.bouton("Consulter les présences", function () { afficherTableauPresencesOfficier(competition); }),
      UI.bouton("Retour", afficherSelectionCompetitionOfficier, { className: "secondary-button" })
    ])]));
  }

  async function afficherAujourdHuiOfficier() {
    UI.chargement("Chargement des présences du jour…");
    const resultat = await appelAPI("chargerAujourdHuiOfficier");
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const contenu = UI.element("div", { className: "today-list" });
    const resume = resultat.resume || {};
    contenu.appendChild(UI.element("div", { className: "stats-row", ariaLabel: "Résumé des présences du jour" }, [
      carteStat("Compétitions", resume.competitions || 0),
      carteStat("Présents", resume.presents || 0),
      carteStat("Remplaçants", resume.remplacants || 0),
      carteStat("Absents", resume.absents || 0),
      carteStat("Sans réponse", resume.sansReponse || 0)
    ]));
    (resultat.competitions || []).forEach(function (competition) {
      const statutRappel = competition.rappel?.actif
        ? "Activé à " + (competition.rappel.heureProgrammee || "-") + " — " + libelleStatutRappel(competition.rappel.statutJour)
        : "Rappel désactivé";
      const joueurs = (competition.lignes || []).map(function (ligne) {
        const dispo = ligne.disponibilites?.[0] || {};
        return [ligne.pseudo, dispo.statut || "Non renseigné", dispo.horairesDisponibles || "-"];
      });
      const effectifs = (competition.effectifParHoraire || []).map(function (horaire) {
        return [horaire.horaire, horaire.presents, horaire.remplacants, horaire.absents, horaire.sansReponse];
      });
      const sansReponse = competition.joueursSansReponse || { avecDiscord: [], sansDiscord: [] };
      const listesSansReponse = UI.element("div", { className: "today-missing-list" });
      if (sansReponse.avecDiscord?.length) {
        listesSansReponse.append(
          UI.element("h4", {}, "Discord lié"),
          UI.element("ul", {}, sansReponse.avecDiscord.map(function (joueur) {
            return UI.element("li", {}, joueur.pseudo + (joueur.discordUsername ? " — " + joueur.discordUsername : ""));
          }))
        );
      }
      if (sansReponse.sansDiscord?.length) {
        listesSansReponse.append(
          UI.element("h4", {}, "Sans Discord lié"),
          UI.element("ul", {}, sansReponse.sansDiscord.map(function (joueur) { return UI.element("li", {}, joueur.pseudo); }))
        );
      }
      if (!listesSansReponse.children.length) listesSansReponse.appendChild(UI.element("p", {}, "Tous les joueurs ont répondu."));
      contenu.appendChild(UI.element("article", { className: "today-competition" }, [
        UI.element("h3", {}, competition.nom),
        UI.element("p", {}, competition.date?.dateAffichage || resultat.dateAffichage || ""),
        UI.element("p", { className: "reminder-status" }, statutRappel),
        UI.element("div", { className: "stats-row" }, [
          carteStat("Présents", competition.stats?.presents || 0),
          carteStat("Remplaçants", competition.stats?.remplacants || 0),
          carteStat("Absents", competition.stats?.absents || 0),
          carteStat("Sans réponse", competition.stats?.sansReponse || 0)
        ]),
        UI.tableau(["Joueur", "Statut", "Horaires"], joueurs, { caption: "Présences du jour", rowHeaders: true }),
        effectifs.length ? UI.tableau(["Horaire", "Présents", "Remplaçants", "Absents", "Sans réponse"], effectifs, { caption: "Effectif du jour par horaire", rowHeaders: true }) : null,
        listesSansReponse,
        UI.actions([
          UI.bouton("Consulter les présences", function () { afficherTableauPresencesOfficier(competition); }),
          UI.bouton("Voir les sans réponse", function () { afficherSansReponse(competition); }, { className: "secondary-button" })
        ])
      ]));
    });
    if (!contenu.children.length) contenu.appendChild(UI.element("p", {}, "Aucune compétition aujourd’hui."));
    UI.afficher(UI.panneau("Présences du jour", [contenu, UI.actions([
      UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
    ])]));
  }

  async function afficherJournalActivite() {
    UI.chargement("Chargement du journal…");
    const resultat = await appelAPI("chargerJournalActivite");
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const recherche = UI.champ({ id: "journal-search", label: "Filtrer le journal", placeholder: "Utilisateur ou action" });
    const zone = UI.element("div");
    function rendre() {
      const lignes = Journal.filtrer(resultat.journal, recherche.controle.value).map(function (entree) {
        return [entree.dateHeure, entree.utilisateur || "", entree.action || "", UI.element("span", { className: "journal-details" }, entree.details || "")];
      });
      zone.replaceChildren(UI.tableau(["Date", "Utilisateur", "Action", "Détails"], lignes, { caption: "Journal d’activité" }));
    }
    recherche.controle.addEventListener("input", rendre);
    rendre();
    UI.afficher(UI.panneau("Journal d’activité", [recherche.groupe, zone, UI.actions([
      UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
    ])]));
  }

  async function afficherDemandesLiaisonDiscord() {
    if (!estSuperAdminConnecte()) return UI.message("Accès refusé", "Action réservée au SuperAdmin.");
    UI.chargement("Chargement des demandes Discord…");
    const resultat = await appelAPI("chargerDemandesLiaisonDiscord");
    if (!estSucces(resultat)) return gererErreurAdmin(resultat);
    const liste = UI.element("div", { className: "discord-requests" });
    (resultat.demandes || []).forEach(function (demande) {
      liste.appendChild(UI.element("article", { className: "discord-request-card" }, [
        UI.element("h3", {}, demande.pseudo || "Joueur"),
        UI.element("p", {}, demande.discordUsername ? "Compte Discord : " + demande.discordUsername : "Compte Discord reçu"),
        UI.element("p", {}, "Créée : " + UI.formaterDate(demande.createdAt || demande.created_at)),
        UI.actions([
          UI.bouton("Valider", async function () { await traiterDemandeDiscord(demande, "valider"); }),
          UI.bouton("Refuser", async function () { await traiterDemandeDiscord(demande, "refuser"); }, { className: "danger-button" })
        ])
      ]));
    });
    if (!liste.children.length) liste.appendChild(UI.element("p", {}, "Aucune demande en attente."));
    UI.afficher(UI.panneau("Demandes de liaison Discord", [liste, UI.actions([
      UI.bouton("Retour", afficherEspaceOfficier, { className: "secondary-button" })
    ])]));
  }

  async function traiterDemandeDiscord(demande, action) {
    let raison = "";
    if (action === "refuser") {
      raison = await UI.demanderTexte("Refuser la liaison", "Motif du refus (facultatif)", { multiline: true, maxLength: 500 });
      if (raison === null) return;
    }
    const confirme = await UI.confirmer(action === "valider" ? "Valider la liaison" : "Refuser la liaison", "Confirmer cette décision ?", "Confirmer");
    if (!confirme) return;
    UI.chargement("Traitement de la demande…");
    const resultat = await appelAPISensible(action === "valider" ? "validerDemandeLiaisonDiscord" : "refuserDemandeLiaisonDiscord", {
      idDemande: demande.id,
      raison
    });
    if (!estSucces(resultat)) return afficherErreurPage(resultat.message, afficherDemandesLiaisonDiscord);
    await UI.message("Demande Discord", resultat.message || "Demande traitée.");
    afficherDemandesLiaisonDiscord();
  }

  async function afficherChangerMotDePasseAdmin() {
    const valeurs = await formulaireCredential({
      titre: "Modifier le mot de passe administrateur",
      libelleNouveau: "Nouveau mot de passe",
      messageTropCourt: "Le nouveau mot de passe doit contenir au moins 12 caractères.",
      demanderActuel: false,
      longueurMinimale: 12
    });
    if (!valeurs) return;
    let nouveauMdp = valeurs.nouveau;
    valeurs.actuel = "";
    valeurs.nouveau = "";
    UI.chargement("Modification du mot de passe…");
    const resultat = await appelAPISensible("changerMotDePasse", {
      pseudo: State.etat.utilisateur?.pseudo,
      nouveauMdp
    });
    nouveauMdp = "";
    if (!estSucces(resultat)) {
      await UI.message("Modification refusée", resultat.message || "Le mot de passe n’a pas été modifié.");
      afficherEspaceOfficier();
      return;
    }
    State.effacer();
    await UI.message("Mot de passe modifié", resultat.message || "Reconnectez-vous.");
    afficherConnexion();
  }

  async function demarrer() {
    afficherVersionSite();
    UI.effacerStatut();
    UI.chargement("Initialisation…");
    const restauree = await restaurerSession();
    if (!restauree) afficherConnexion();
  }

  global.addEventListener("mpp:admin-session-warning", function () {
    UI.statut("Votre session officier va bientôt expirer en l’absence d’activité.", "warning");
  });

  global.addEventListener("mpp:admin-session-expired", function () {
    State.etat.accesAdmin = false;
    State.etat.estSuperAdmin = false;
    UI.statut("Session officier expirée. Validez de nouveau votre accès.", "error");
    if (State.etat.utilisateur) afficherAccueilConnecte();
    else afficherConnexion();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer, { once: true });
  else demarrer();
})(window);
