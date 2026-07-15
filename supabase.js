/* ==========================================================
   MPP OPERATIONS CENTER
   Couche Supabase
   Version Alpha 0.13.0.2 - Security & Reliability
   ========================================================== */

/*
  IMPORTANT
  - Cette clé est une clé publique "publishable", prévue pour être utilisée côté navigateur.
  - Ne jamais mettre de clé "secret" / "service_role" dans ce fichier.
*/

const supabaseClient = supabase.createClient(
  MPP_CONFIG.supabaseUrl,
  MPP_CONFIG.supabasePublishableKey,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);
const sbCacheNomsCompetitions = {};
const SB_TYPE_RAPPEL_PRESENCES_SANS_REPONSE = "sans_reponse_17h";
const SB_ACTIONS_ADMIN_MUTANTES = new Set([
  "modifier_statut_competition",
  "creer_competition",
  "modifier_competition",
  "ajouter_date",
  "supprimer_date",
  "supprimer_competition",
  "ajouter_joueur",
  "modifier_joueur",
  "supprimer_joueur"
]);

function sbResultat(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function sbRpc(nom, parametres, messageErreur) {
  const controleur = new AbortController();
  const delai = setTimeout(function () { controleur.abort(); }, MPP_CONFIG.rpcTimeoutMs);
  try {
    const requete = supabaseClient.rpc(nom, parametres || {});
    const promesse = typeof requete?.abortSignal === "function"
      ? requete.abortSignal(controleur.signal)
      : requete;
    const { data, error } = await Promise.race([
      promesse,
      new Promise(function (_resoudre, rejeter) {
        controleur.signal.addEventListener("abort", function () {
          rejeter(new Error("RPC_TIMEOUT"));
        }, { once: true });
      })
    ]);
    if (error) {
      if (controleur.signal.aborted) {
        MPPLogger.avertissement("rpc_timeout_" + nom);
        return { ...sbErreur("Le service met plus de temps que prévu."), code: "RPC_TIMEOUT" };
      }
      MPPLogger.avertissement("rpc_echec_" + nom);
      return sbErreur(messageErreur || "Service temporairement indisponible.");
    }
    return sbResultat(data) || sbErreur(messageErreur || "Réponse serveur invalide.");
  } catch (erreur) {
    if (controleur.signal.aborted || erreur?.message === "RPC_TIMEOUT") {
      MPPLogger.avertissement("rpc_timeout_" + nom);
      return { ...sbErreur("Le service met plus de temps que prévu."), code: "RPC_TIMEOUT" };
    }
    MPPLogger.avertissement("rpc_indisponible_" + nom);
    return sbErreur(messageErreur || "Service temporairement indisponible.");
  } finally {
    clearTimeout(delai);
  }
}

async function sbApiJoueur(action, payload) {
  const token = MPPSession.lireSessionJoueur();
  if (!token) return { ...sbErreur("Session expirée. Reconnectez-vous."), code: "SESSION_EXPIREE", porteeSession: "joueur" };
  const resultat = await sbRpc("api_joueur_site", {
    p_session_token: token,
    p_action: action,
    p_payload: payload || {}
  }, "Action joueur indisponible.");
  if (resultat?.code === "SESSION_EXPIREE") {
    MPPSession.toutEffacer();
    resultat.porteeSession = "joueur";
  }
  return resultat;
}

async function sbApiAdmin(action, payload) {
  const token = MPPSession.lireSessionAdmin();
  if (!token) return { ...sbErreur("Session officier expirée. Validez de nouveau votre accès."), code: "SESSION_EXPIREE", porteeSession: "admin" };

  const mutation = SB_ACTIONS_ADMIN_MUTANTES.has(action);
  if (mutation && typeof globalThis.crypto?.randomUUID !== "function") {
    return { ...sbErreur("Cette action n’est pas disponible dans ce navigateur."), code: "CLIENT_INCOMPATIBLE" };
  }

  const operationId = mutation ? globalThis.crypto.randomUUID() : "";
  const payloadOperation = mutation
    ? { ...(payload || {}), operationId }
    : (payload || {});
  const parametres = {
    p_session_token: token,
    p_action: action,
    p_payload: payloadOperation
  };
  let resultat = await sbRpc("api_admin_site", parametres, "Action officier indisponible.");
  if (mutation && resultat?.code === "RPC_TIMEOUT") {
    resultat = await sbRpc("api_admin_site", parametres, "Action officier indisponible.");
    if (resultat?.code === "RPC_TIMEOUT") {
      resultat = {
        ...sbErreur("Le résultat de l’action n’a pas pu être confirmé. Actualisez l’écran et vérifiez son état avant toute nouvelle tentative."),
        code: "RESULTAT_INDETERMINE"
      };
    }
  }
  if (resultat?.code === "SESSION_EXPIREE") {
    MPPSession.effacerSessionAdmin();
    resultat.porteeSession = "admin";
  } else if (resultat?.succes) {
    MPPSession.notifierActiviteAdmin();
  }
  return resultat;
}

/* ==========================================================
   OUTILS GÉNÉRAUX
   ========================================================== */

function sbTexte(valeur) {
  return String(valeur ?? "").trim();
}

function sbDiscordId(valeur) {
  const texte = sbTexte(valeur);
  if (!texte) return "";
  return /^\d{17,20}$/.test(texte) ? texte : null;
}

function sbHeureHHMM(valeur) {
  const match = sbTexte(valeur).match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? match[1] + ":" + match[2] : "";
}

function sbCleRappelJour(idCompetition) {
  return String(Number(idCompetition));
}

function sbCle(valeur) {
  return sbTexte(valeur).toLowerCase();
}

function sbNormaliserStatut(statut) {
  return sbTexte(statut)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sbRolesArray(roles) {
  return sbTexte(roles)
    .split(",")
    .map(function (role) { return role.trim().toLowerCase(); })
    .filter(Boolean);
}

function sbEstOfficierJoueur(joueur) {
  if (!joueur) return false;
  const roles = sbRolesArray(joueur.roles);
  return roles.includes("officier") || roles.includes("superadmin");
}

function sbFormatDateFR(dateIso) {
  if (!dateIso) return "";
  const morceaux = String(dateIso).split("T")[0].split("-");
  if (morceaux.length !== 3) return String(dateIso);
  return morceaux[2] + "/" + morceaux[1] + "/" + morceaux[0];
}

function sbFormatDateISO(dateFrOuIso) {
  const texte = sbTexte(dateFrOuIso);

  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
    return texte;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texte)) {
    const morceaux = texte.split("/");
    return morceaux[2] + "-" + morceaux[1] + "-" + morceaux[0];
  }

  const date = new Date(texte);

  if (!isNaN(date.getTime())) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");
    return annee + "-" + mois + "-" + jour;
  }

  return texte;
}

function sbObjetDateLocale(dateIso) {
  const iso = sbFormatDateISO(dateIso);
  const morceaux = iso.split("-").map(Number);
  return new Date(morceaux[0], morceaux[1] - 1, morceaux[2]);
}

function sbDateAffichage(dateIso) {
  const date = sbObjetDateLocale(dateIso);
  const jours = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const jour = jours[date.getDay()];
  const numero = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return jour + " " + numero + "/" + mois;
}

function sbJourCourt(dateIso) {
  const date = sbObjetDateLocale(dateIso);
  const jours = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return jours[date.getDay()];
}

function sbMoisCourt(dateIso) {
  const date = sbObjetDateLocale(dateIso);
  const mois = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  return mois[date.getMonth()];
}

function sbDateObj(date) {
  return {
    idDate: date.id,
    idCompetition: date.competition_id,
    dateCompetition: sbFormatDateFR(date.date_competition),
    dateAffichage: sbDateAffichage(date.date_competition),
    jourCourt: sbJourCourt(date.date_competition),
    jourNumero: sbFormatDateFR(date.date_competition).slice(0, 2),
    moisCourt: sbMoisCourt(date.date_competition),
    horaires: date.horaires || ""
  };
}

function sbCompetitionObj(competition) {
  return {
    id: competition.id,
    nom: competition.nom,
    statut: competition.statut,
    dateCreation: competition.date_creation,
    creePar: competition.cree_par,
    rolesAutorises: competition.roles_autorises,
    description: competition.description,

    fermetureAutoActive: competition.fermeture_auto_active || false,
    heureOuverture: competition.heure_ouverture || "",
    heureFermeture: competition.heure_fermeture || "",
    dernierTraitementAuto: competition.dernier_traitement_auto || "",

    notificationPresenceActive: competition.notification_presence_active || false,
    heureNotificationPresence: sbHeureHHMM(competition.heure_notification_presence),

    rappelPresenceActive: competition.rappel_presence_active || false,
    heureRappelPresence: sbHeureHHMM(competition.heure_rappel_presence)
  };
}

function sbJoueurObj(joueur) {
  return {
    id: joueur.id,
    pseudo: joueur.pseudo,
    roles: joueur.roles,
    statut: joueur.statut,
    discordId: joueur.discordId || joueur.discord_id || "",
    discordUsername: joueur.discordUsername || joueur.discord_username || "",
    discordLieA: joueur.discordLieA || joueur.discord_lie_a || "",
    discordLie: joueur.discordLie === true || Boolean(joueur.discord_id),
    dateAjout: joueur.dateAjout || joueur.date_ajout,
    derniereConnexion: joueur.derniereConnexion || joueur.derniere_connexion,
    derniereModification: joueur.derniereModification || joueur.derniere_modification,
    codeAccesConfigure: joueur.codeAccesConfigure === true,
    credentialAdminConfigure: joueur.credentialAdminConfigure === true
  };
}

function sbPresenceObj(presence) {
  return {
    idPresence: presence.id,
    idCompetition: presence.competition_id,
    pseudo: presence.pseudo,
    dateCompetition: sbFormatDateFR(presence.date_competition),
    statut: presence.statut || "Non renseigné",
    derniereModification: presence.derniere_modification,
    horairesDisponibles: presence.horaires_disponibles || ""
  };
}

function sbErreur(message, details) {
  return {
    succes: false,
    message: message || "Erreur Supabase.",
    details: details || ""
  };
}

function sbExtraireIdsCompetitionsJournal(lignesJournal) {
  const idsCompetition = new Set();

  (lignesJournal || []).forEach(function (ligne) {
    const details = sbTexte(ligne.details);

    for (const match of details.matchAll(/Compétition ID\s+(\d+)/gi)) {
      idsCompetition.add(Number(match[1]));
    }
  });

  return Array.from(idsCompetition).filter(Boolean);
}

async function sbChargerNomsCompetitionsJournal(idsCompetition) {
  const idsACharger = Array.from(new Set(
    (idsCompetition || [])
      .map(Number)
      .filter(Boolean)
      .filter(function (idCompetition) {
        return !sbCacheNomsCompetitions[idCompetition];
      })
  ));

  if (idsACharger.length === 0) {
    return;
  }

  const resultat = await sbApiAdmin("competitions", {});
  (resultat.competitions || []).forEach(function (competition) {
    sbCacheNomsCompetitions[Number(competition.id)] = competition.nom || "Compétition inconnue";
  });

  idsACharger.forEach(function (idCompetition) {
    if (!sbCacheNomsCompetitions[idCompetition]) {
      sbCacheNomsCompetitions[idCompetition] = "Compétition inconnue";
    }
  });
}

function sbStatutPresenceLisible(statut) {
  const statutNormalise = sbNormaliserStatut(statut);

  if (statutNormalise === "present") return "Présent";
  if (statutNormalise === "absent") return "Absent";
  if (statutNormalise === "remplacant") return "Remplaçant";

  return "Non renseigné";
}

function sbPresenceEstRenseignee(statut) {
  const statutLisible = sbStatutPresenceLisible(statut);
  return statutLisible === "Présent" ||
    statutLisible === "Absent" ||
    statutLisible === "Remplaçant";
}

function sbDateIsoFranceAujourdhui() {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const valeurs = {};

  parties.forEach(function (partie) {
    valeurs[partie.type] = partie.value;
  });

  return valeurs.year + "-" + valeurs.month + "-" + valeurs.day;
}

function sbRolesNormalises(roles) {
  return sbTexte(roles)
    .split(",")
    .map(function (role) { return sbNormaliserStatut(role); })
    .filter(Boolean);
}

function sbJoueurAutorisePourCompetition(joueur, competition) {
  const rolesAutorises = sbRolesNormalises(competition?.roles_autorises);
  if (rolesAutorises.length === 0) return true;

  const rolesJoueur = sbRolesNormalises(joueur?.roles);
  return rolesJoueur.some(function (role) {
    return rolesAutorises.includes(role);
  });
}

function sbJoueurDiscordLie(joueur) {
  if (joueur?.discordLie === true) return true;
  const discordId = sbTexte(joueur?.discord_id);
  const discordLieA = sbTexte(joueur?.discord_lie_a);
  return Boolean(discordId && discordLieA && /^\d+$/.test(discordId));
}

function sbJson(valeur, valeurParDefaut) {
  if (valeur && typeof valeur === "object") return valeur;
  try {
    return JSON.parse(String(valeur || ""));
  } catch (_erreur) {
    return valeurParDefaut;
  }
}

function sbPresenceJourSansReponse(presences) {
  const lignes = presences || [];
  return lignes.length === 0 || lignes.every(function (presence) {
    return !sbPresenceEstRenseignee(presence.statut);
  });
}

function sbDisponibiliteDepuisPresencesJour(dateInfo, presences) {
  const lignes = presences || [];
  let presenceReference = null;

  for (let i = lignes.length - 1; i >= 0; i--) {
    if (sbPresenceEstRenseignee(lignes[i].statut)) {
      presenceReference = lignes[i];
      break;
    }
  }

  if (!presenceReference && lignes.length > 0) {
    presenceReference = lignes[lignes.length - 1];
  }

  return {
    dateCompetition: dateInfo.dateCompetition,
    dateAffichage: dateInfo.dateAffichage,
    horaires: dateInfo.horaires || "",
    statut: presenceReference
      ? sbStatutPresenceLisible(presenceReference.statut)
      : "Non renseigné",
    horairesDisponibles: presenceReference?.horaires_disponibles || ""
  };
}

function sbCalculerStatsJour(lignes) {
  const stats = {
    presents: 0,
    remplacants: 0,
    absents: 0,
    sansReponse: 0
  };

  (lignes || []).forEach(function (ligne) {
    const dispo = ligne.disponibilites && ligne.disponibilites[0];
    const statut = dispo ? sbStatutPresenceLisible(dispo.statut) : "Non renseigné";

    if (statut === "Présent") stats.presents++;
    else if (statut === "Remplaçant") stats.remplacants++;
    else if (statut === "Absent") stats.absents++;
    else stats.sansReponse++;
  });

  return stats;
}

function sbCalculerEffectifHoraireJour(dateInfo, lignes) {
  const horaires = sbTexte(dateInfo.horaires)
    .split(",")
    .map(function (horaire) { return horaire.trim(); })
    .filter(Boolean);

  return horaires.map(function (horaire) {
    const stats = {
      horaire: horaire,
      presents: 0,
      remplacants: 0,
      absents: 0,
      sansReponse: 0
    };

    (lignes || []).forEach(function (ligne) {
      const dispo = ligne.disponibilites && ligne.disponibilites[0];
      const statut = dispo ? sbStatutPresenceLisible(dispo.statut) : "Non renseigné";

      if (statut === "Non renseigné") {
        stats.sansReponse++;
        return;
      }

      if (statut === "Absent") {
        stats.absents++;
        return;
      }

      const horairesDisponibles = sbTexte(dispo?.horairesDisponibles)
        .split(",")
        .map(function (h) { return h.trim(); })
        .filter(Boolean);

      if (!horairesDisponibles.includes(horaire)) return;
      if (statut === "Remplaçant") stats.remplacants++;
      else if (statut === "Présent") stats.presents++;
    });

    return stats;
  });
}

function sbStatutRappelJour(competition, rappel, lectureRappelDisponible) {
  if (!competition?.rappel_presence_active) return "desactive";
  if (!competition?.heure_rappel_presence) return "desactive";
  if (!lectureRappelDisponible) return "indisponible";
  if (!rappel) return "pas_encore_envoye";

  if (sbTexte(rappel.erreur)) return "erreur";

  const statut = sbNormaliserStatut(rappel.statut);
  if (statut === "envoye") return "envoye";
  if (statut === "aucun_joueur") return "aucun_joueur";
  if (statut === "erreur") return "erreur";
  if (statut === "en_cours") return "en_cours";
  if (sbTexte(rappel.envoye_a)) return "envoye";

  return "pas_encore_envoye";
}

function sbActionJournalLisible(action) {
  const actionTexte = sbTexte(action);
  const actions = {
    "Sauvegarde présences": "Présences mises à jour",
    "Suppression joueur": "Joueur supprimé",
    "Modification joueur": "Joueur modifié",
    "Ajout joueur": "Joueur ajouté",
    "Création compétition": "Compétition créée",
    "Création compétition complète": "Compétition créée",
    "Modification compétition": "Compétition modifiée",
    "Modification statut compétition": "Statut de compétition modifié",
    "Suppression compétition": "Compétition supprimée",
    "Ajout date compétition": "Date ajoutée",
    "Suppression date compétition": "Date supprimée",
    "Ouverture/Fermeture automatique": "Statut modifié automatiquement",
    "Notification Discord présences": "Rappel Discord envoyé",
    "Changement mot de passe": "Mot de passe modifié"
  };

  return actions[actionTexte] || actionTexte;
}

function sbDetailsJournalLisibles(details) {
  let texte = sbTexte(details);
  if (!texte) return "";

  const matchNomCompetition = texte.match(/^ID\s+\d+\s+\|\s+Nom\s*:\s*([^|]+)/i);
  if (matchNomCompetition) {
    texte = texte.replace(
      /^ID\s+\d+\s+\|\s+Nom\s*:\s*[^|]+/i,
      "Compétition : " + sbTexte(matchNomCompetition[1])
    );
  }

  const idsCompetition = new Set();
  for (const match of texte.matchAll(/Compétition ID\s+(\d+)/gi)) {
    idsCompetition.add(match[1]);
  }

  for (const idCompetition of idsCompetition) {
    const nomCompetition = sbCacheNomsCompetitions[Number(idCompetition)] || "Compétition inconnue";
    texte = texte.replace(
      new RegExp("Compétition ID\\s+" + idCompetition, "gi"),
      "Compétition : " + nomCompetition
    );
  }

  return texte;
}

/* ==========================================================
   API SUPABASE : ROUTEUR COMPATIBLE AVEC app.js
   ========================================================== */

async function apiSupabase(action, parametres) {
  parametres = parametres || {};
  switch (action) {
    case "identifierUtilisateur":
      return identifierUtilisateurSupabase(parametres.pseudo, parametres.codeAcces);

    case "restaurerSession":
      return restaurerSessionSupabase();

    case "fermerSession":
      return fermerSessionSupabase();

    case "chargerCompetitions":
      return chargerCompetitionsSupabase(parametres.portee);

    case "chargerDatesCompetition":
      return chargerDatesCompetitionSupabase(parametres.idCompetition, parametres.portee);

    case "chargerPresencesJoueur":
      return chargerPresencesJoueurSupabase(parametres.idCompetition);

    case "chargerCompetitionComplete":
      return chargerCompetitionCompleteSupabase(parametres.idCompetition);

    case "sauvegarderPresences":
      return sauvegarderPresencesSupabase(
        parametres.idCompetition,
        sbJson(parametres.presences, [])
      );

    case "chargerDonneesOfficierInitiales":
      return chargerDonneesOfficierInitialesSupabase();

    case "chargerAujourdHuiOfficier":
      return chargerAujourdHuiOfficierSupabase();

    case "genererTableauPresences":
      return genererTableauPresencesSupabase(
        parametres.idCompetition
      );

    case "chargerJoueursSansReponse":
      return chargerJoueursSansReponseSupabase(parametres.idCompetition);

    case "modifierStatutCompetition":
      return modifierStatutCompetitionSupabase(
        parametres.idCompetition,
        parametres.nouveauStatut
      );

    case "creerCompetitionComplete":
      return creerCompetitionCompleteSupabase(
        sbJson(parametres.config, {})
      );

    case "modifierCompetitionComplete":
      return modifierCompetitionCompleteSupabase(
        sbJson(parametres.config, {})
      );

    case "chargerJoueurs":
      return chargerJoueursSupabase();

    case "ajouterJoueur":
      return ajouterJoueurSupabase(
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.discordId,
        parametres.codeAcces,
        parametres.motDePasseAdminInitial
      );

    case "modifierJoueur":
      return modifierJoueurSupabase(
        parametres.idJoueur,
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.discordId,
        parametres.codeAcces,
        parametres.motDePasseAdminInitial
      );

    case "genererCodeLiaisonDiscord":
      return genererCodeLiaisonDiscordSupabase();

    case "chargerDemandesLiaisonDiscord":
      return chargerDemandesLiaisonDiscordSupabase();

    case "validerDemandeLiaisonDiscord":
      return validerDemandeLiaisonDiscordSupabase(parametres.idDemande);

    case "refuserDemandeLiaisonDiscord":
      return refuserDemandeLiaisonDiscordSupabase(
        parametres.idDemande,
        parametres.raison
      );

    case "supprimerJoueur":
      return supprimerJoueurSupabase(parametres.idJoueur);

    case "ajouterDateCompetition":
      return ajouterDateCompetitionSupabase(
        parametres.idCompetition,
        parametres.dateCompetition,
        parametres.horaires
      );

    case "supprimerDateCompetition":
      return supprimerDateCompetitionSupabase(parametres.idDate);

    case "supprimerCompetition":
      return supprimerCompetitionSupabase(parametres.idCompetition);

    case "chargerJournalActivite":
      return chargerJournalActiviteSupabase();

    case "changerCodeAcces":
      return changerCodeAccesSupabase(
        parametres.codeActuel,
        parametres.nouveauCode
      );

    case "verifierMotDePasse":
      return verifierMotDePasseSupabase(
        parametres.pseudo,
        parametres.motDePasse
      );

    case "changerMotDePasse":
      return changerMotDePasseSupabase(
        parametres.pseudo,
        parametres.nouveauMdp
      );

    default:
      return sbErreur("Action Supabase inconnue : " + action);
  }
}

function sbNormaliserReponseEdgeFunction(data, messageDefaut) {
  if (!data || typeof data !== "object") {
    return sbErreur("Réponse serveur invalide.");
  }
  const reponse = { ...data };

  if (reponse.succes !== true && reponse.success !== true) {
    const erreur = sbErreur(
      reponse.message || reponse.error || "Erreur Edge Function.",
      ""
    );
    if (sbTexte(reponse.code)) erreur.code = sbTexte(reponse.code);
    return erreur;
  }

  reponse.succes = true;
  if (!reponse.message && messageDefaut) {
    reponse.message = messageDefaut;
  }

  return reponse;
}

async function sbLireCorpsErreurEdge(error) {
  const contexte = error?.context;
  if (!contexte) return null;
  if (typeof contexte.json !== "function") {
    return typeof contexte === "object" ? contexte : null;
  }
  try {
    const reponse = typeof contexte.clone === "function" ? contexte.clone() : contexte;
    return await reponse.json();
  } catch (_erreur) {
    return null;
  }
}

function sbExpirationSession(portee) {
  if (portee === "admin") {
    MPPSession.effacerSessionAdmin();
    return {
      ...sbErreur("Session officier expirée. Validez de nouveau votre accès."),
      code: "SESSION_EXPIREE",
      porteeSession: "admin"
    };
  }
  MPPSession.toutEffacer();
  return {
    ...sbErreur("Session expirée. Reconnectez-vous."),
    code: "SESSION_EXPIREE",
    porteeSession: "joueur"
  };
}

async function sbAppelerEdge(nomFonction, body, options) {
  const portee = options?.portee === "admin" ? "admin" : "joueur";
  const session = portee === "admin"
    ? MPPSession.lireSessionAdmin()
    : MPPSession.lireSessionJoueur();
  if (!session) return sbExpirationSession(portee);
  const controleur = new AbortController();
  const delai = setTimeout(function () { controleur.abort(); }, MPP_CONFIG.edgeTimeoutMs);
  try {
    const invocation = supabaseClient.functions.invoke(nomFonction, {
      body: body || {},
      signal: controleur.signal
    });
    const { data, error } = await Promise.race([
      invocation,
      new Promise(function (_resoudre, rejeter) {
        controleur.signal.addEventListener("abort", function () {
          rejeter(new Error("EDGE_TIMEOUT"));
        }, { once: true });
      })
    ]);
    let reponse = data;
    if (error) {
      if (controleur.signal.aborted) {
        MPPLogger.avertissement("edge_timeout_" + nomFonction);
        return {
          ...sbErreur("Le service met plus de temps que prévu."),
          code: "EDGE_TIMEOUT"
        };
      }
      MPPLogger.avertissement("edge_echec_" + nomFonction);
      const corpsErreur = await sbLireCorpsErreurEdge(error);
      if (!corpsErreur) {
        return sbErreur(options?.messageErreur || "Service temporairement indisponible.");
      }
      reponse = { ...corpsErreur, succes: false, success: false };
    }
    const resultat = sbNormaliserReponseEdgeFunction(reponse, options?.messageSucces);
    if (resultat?.code === "SESSION_EXPIREE") {
      return { ...sbExpirationSession(portee), message: resultat.message };
    } else if (resultat?.succes && portee === "admin") {
      MPPSession.notifierActiviteAdmin();
    }
    return resultat;
  } catch (erreur) {
    if (controleur.signal.aborted || erreur?.message === "EDGE_TIMEOUT") {
      MPPLogger.avertissement("edge_timeout_" + nomFonction);
      return {
        ...sbErreur("Le service met plus de temps que prévu."),
        code: "EDGE_TIMEOUT"
      };
    }
    MPPLogger.avertissement("edge_indisponible_" + nomFonction);
    return sbErreur(options?.messageErreur || "Service temporairement indisponible.");
  } finally {
    clearTimeout(delai);
  }
}

function sbListeDemandesDiscord(data) {
  return data?.demandes ||
    data?.demandesEnAttente ||
    data?.requests ||
    data?.data ||
    [];
}

async function genererCodeLiaisonDiscordSupabase() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    return {
      ...sbErreur("Cette action n'est pas disponible dans ce navigateur."),
      code: "CLIENT_INCOMPATIBLE"
    };
  }
  const parametres = {
    sessionToken: MPPSession.lireSessionJoueur(),
    operationId: globalThis.crypto.randomUUID()
  };
  const options = {
    portee: "joueur",
    messageErreur: "Impossible de générer le code de liaison.",
    messageSucces: "Code de liaison Discord généré."
  };
  let resultat = await sbAppelerEdge("discord-link-code", parametres, options);
  if (resultat?.code === "EDGE_TIMEOUT") {
    resultat = await sbAppelerEdge("discord-link-code", parametres, options);
    if (resultat?.code === "EDGE_TIMEOUT") {
      return {
        ...sbErreur("Le résultat n'a pas pu être confirmé. Patientez une minute, puis vérifiez avant de générer un nouveau code."),
        code: "RESULTAT_INDETERMINE"
      };
    }
  }
  return resultat;
}

async function chargerDemandesLiaisonDiscordSupabase() {
  const reponse = await sbAppelerEdge("discord-link-admin", {
    action: "lister",
    sessionToken: MPPSession.lireSessionAdmin()
  }, {
    portee: "admin",
    messageErreur: "Impossible de charger les demandes Discord.",
    messageSucces: "Demandes chargées."
  });
  if (reponse.succes) {
    reponse.demandes = sbListeDemandesDiscord(reponse);
  }

  return reponse;
}

async function validerDemandeLiaisonDiscordSupabase(idDemande) {
  return sbAppelerEdge("discord-link-admin", {
    action: "valider",
    idDemande: sbTexte(idDemande),
    sessionToken: MPPSession.lireSessionAdmin()
  }, {
    portee: "admin",
    messageErreur: "Impossible de valider la demande Discord.",
    messageSucces: "Demande de liaison validée."
  });
}

async function refuserDemandeLiaisonDiscordSupabase(idDemande, raison) {
  return sbAppelerEdge("discord-link-admin", {
    action: "refuser",
    idDemande: sbTexte(idDemande),
    sessionToken: MPPSession.lireSessionAdmin(),
    raison: sbTexte(raison)
  }, {
    portee: "admin",
    messageErreur: "Impossible de refuser la demande Discord.",
    messageSucces: "Demande de liaison refusée."
  });
}

/* ==========================================================
   JOUEURS / CONNEXION
   ========================================================== */

async function identifierUtilisateurSupabase(pseudo, codeAcces) {
  const resultat = await sbRpc("ouvrir_session_joueur_site", {
    p_pseudo: sbTexte(pseudo),
    p_code_acces: String(codeAcces || "")
  }, "Identification impossible.");

  if (!resultat?.succes || !resultat.sessionToken || !resultat.joueur) {
    return sbErreur(resultat?.message || "Identification impossible.");
  }

  MPPSession.definirSessionJoueur(resultat.sessionToken);
  const joueur = sbJoueurObj(resultat.joueur);
  const estOfficier = sbEstOfficierJoueur(joueur);
  return {
    succes: true,
    type: estOfficier ? "officier" : "joueur",
    joueur,
    officier: estOfficier ? { id: joueur.id, pseudo: joueur.pseudo, permissions: "OFFICIER" } : null
  };
}

async function restaurerSessionSupabase() {
  const token = MPPSession.lireSessionJoueur();
  if (!token) return sbErreur("Aucune session à restaurer.");
  const resultat = await sbRpc("restaurer_session_site", { p_session_token: token }, "Session expirée.");
  if (!resultat?.succes || !resultat.joueur) {
    MPPSession.toutEffacer();
    return { ...sbErreur(resultat?.message || "Session expirée."), code: "SESSION_EXPIREE", porteeSession: "joueur" };
  }
  const joueur = sbJoueurObj(resultat.joueur);
  const estOfficier = sbEstOfficierJoueur(joueur);
  return { succes: true, type: estOfficier ? "officier" : "joueur", joueur, officier: estOfficier ? { id: joueur.id, pseudo: joueur.pseudo, permissions: "OFFICIER" } : null };
}

async function fermerSessionSupabase() {
  const tokens = [MPPSession.lireSessionAdmin(), MPPSession.lireSessionJoueur()].filter(Boolean);
  await Promise.all(tokens.map(function (token) {
    return sbRpc("fermer_session_site", { p_session_token: token }, "Session fermée localement.");
  }));
  MPPSession.toutEffacer();
  return { succes: true };
}

async function chargerJoueursSupabase() {
  const resultat = await sbApiAdmin("joueurs", {});
  if (!resultat?.succes) return resultat;
  return { succes: true, joueurs: (resultat.joueurs || []).map(sbJoueurObj) };
}

async function ajouterJoueurSupabase(pseudo, roles, statut, discordId, codeAcces, motDePasseAdminInitial) {
  const discordIdNettoye = sbDiscordId(discordId);

  if (discordIdNettoye === null) {
    return sbErreur("L’ID Discord doit contenir entre 17 et 20 chiffres.");
  }

  const resultat = await sbApiAdmin("ajouter_joueur", {
    pseudo: sbTexte(pseudo),
    roles: sbTexte(roles) || "Soldat",
    statut: sbTexte(statut) || "Actif",
    discordId: discordIdNettoye || null,
    codeAcces: String(codeAcces || ""),
    motDePasseAdminInitial: String(motDePasseAdminInitial || "")
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "Le joueur n'a pas pu être ajouté.");
  }

  return {
    succes: true,
    message: resultat.message || "Joueur ajouté.",
    idJoueur: resultat.idJoueur || resultat.id_joueur || resultat.id || null
  };
}

async function modifierJoueurSupabase(
  idJoueur,
  pseudo,
  roles,
  statut,
  discordId,
  codeAcces,
  motDePasseAdminInitial
) {
  const nouveauDiscordId = sbDiscordId(discordId);

  if (nouveauDiscordId === null) {
    return sbErreur("L’ID Discord doit contenir entre 17 et 20 chiffres.");
  }

  const resultat = await sbApiAdmin("modifier_joueur", {
    idJoueur: Number(idJoueur),
    pseudo: sbTexte(pseudo),
    roles: sbTexte(roles),
    statut: sbTexte(statut),
    discordId: nouveauDiscordId || null,
    codeAcces: String(codeAcces || ""),
    motDePasseAdminInitial: String(motDePasseAdminInitial || "")
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "Le joueur n'a pas pu être modifié.");
  }

  return {
    succes: true,
    message: resultat.message || "Joueur modifié."
  };
}

async function supprimerJoueurSupabase(idJoueur) {
  return sbApiAdmin("supprimer_joueur", { idJoueur: Number(idJoueur) });
}

/* ==========================================================
   COMPÉTITIONS / DATES / PRÉSENCES
   ========================================================== */

async function chargerCompetitionsSupabase(portee) {
  const resultat = portee === "admin"
    ? await sbApiAdmin("competitions", {})
    : await sbApiJoueur("competitions", {});
  if (!resultat?.succes) return resultat;
  return {
    succes: true,
    competitions: (resultat.competitions || []).map(sbCompetitionObj)
  };
}

async function chargerDatesCompetitionSupabase(idCompetition, portee) {
  const resultat = portee === "admin"
    ? await sbApiAdmin("dates_competition", { idCompetition: Number(idCompetition) })
    : await sbApiJoueur("dates_competition", { idCompetition: Number(idCompetition) });
  if (!resultat?.succes) return resultat;
  return {
    succes: true,
    dates: (resultat.dates || []).map(sbDateObj)
  };
}

async function chargerPresencesJoueurSupabase(idCompetition) {
  const resultat = await sbApiJoueur("competition_complete", { idCompetition: Number(idCompetition) });
  if (!resultat?.succes) return resultat;
  return {
    succes: true,
    presences: (resultat.presences || []).map(sbPresenceObj)
  };
}

async function chargerCompetitionCompleteSupabase(idCompetition) {
  const resultat = await sbApiJoueur("competition_complete", { idCompetition: Number(idCompetition) });
  if (!resultat?.succes) return resultat;
  return {
    succes: true,
    dates: (resultat.dates || []).map(sbDateObj),
    presences: (resultat.presences || []).map(sbPresenceObj),
    peutRemplir: resultat.competition?.statut === "Ouverte"
  };
}

async function sauvegarderPresencesSupabase(idCompetition, presences) {
  const resultat = await sbApiJoueur("sauvegarder_presences", {
    idCompetition: Number(idCompetition),
    presences: presences || []
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "Les présences n'ont pas pu être sauvegardées.");
  }

  return {
    succes: true,
    message: resultat.message || "Présences sauvegardées.",
    ajouts: Number(resultat.ajouts || 0),
    modifications: Number(resultat.modifications || 0),
    suppressions: Number(resultat.suppressions || 0),
    horairesModifies: Number(resultat.horairesModifies || resultat.horaires_modifies || 0)
  };
}

async function changerCodeAccesSupabase(codeActuel, nouveauCode) {
  const resultat = await sbApiJoueur("changer_code_acces", {
    codeActuel: String(codeActuel || ""),
    nouveauCode: String(nouveauCode || "")
  });
  if (resultat?.succes) MPPSession.toutEffacer();
  return resultat;
}

async function creerCompetitionCompleteSupabase(config) {
  const resultat = await sbApiAdmin("creer_competition", { config: config || {} });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "La compétition n'a pas pu être créée.");
  }

  return {
    succes: true,
    message: resultat.message || "Compétition créée.",
    idCompetition: resultat.idCompetition || resultat.id_competition || null,
    nbDates: Number(resultat.nbDates || resultat.nb_dates || 0)
  };
}

async function modifierStatutCompetitionSupabase(idCompetition, nouveauStatut) {
  const resultat = await sbApiAdmin("modifier_statut_competition", {
    idCompetition: Number(idCompetition),
    statut: sbTexte(nouveauStatut)
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(
      resultat?.message ||
        "Le statut n'a pas pu être modifié."
    );
  }

  return {
    succes: true,
    message: resultat.message || "Statut modifié.",
    idCompetition: resultat.idCompetition || resultat.id_competition || Number(idCompetition),
    ancienStatut: resultat.ancienStatut || resultat.ancien_statut || "",
    nouveauStatut: resultat.nouveauStatut || resultat.nouveau_statut || nouveauStatut
  };
}

async function ajouterDateCompetitionSupabase(idCompetition, dateCompetition, horaires) {
  const resultat = await sbApiAdmin("ajouter_date", {
    idCompetition: Number(idCompetition),
    dateCompetition: sbFormatDateISO(dateCompetition),
    horaires: horaires || ""
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "La date n'a pas pu être ajoutée.");
  }

  return {
    succes: true,
    message: resultat.message || "Date ajoutée.",
    idDate: resultat.idDate || resultat.id_date || null
  };
}

async function supprimerDateCompetitionSupabase(idDate) {
  const resultat = await sbApiAdmin("supprimer_date", { idDate: Number(idDate) });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "La date n'a pas pu être supprimée.");
  }

  return {
    succes: true,
    message: resultat.message || "Date supprimée."
  };
}

async function supprimerCompetitionSupabase(idCompetition) {
  const resultat = await sbApiAdmin("supprimer_competition", {
    idCompetition: Number(idCompetition)
  });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "La compétition n'a pas pu être supprimée.");
  }

  return {
    succes: true,
    message: resultat.message || "Compétition supprimée définitivement."
  };
}

/* ==========================================================
   TABLEAUX / EXPORTS / JOURNAL
   ========================================================== */

function sbCalculerSyntheseJoueur(disponibilites) {
  const total = disponibilites.length;
  let presents = 0;
  let absents = 0;
  let nonRenseignes = 0;

  disponibilites.forEach(function (item) {
    const statut = sbCle(item.statut);
    if (statut === "présent") presents++;
    else if (statut === "absent") absents++;
    else if (statut === "non renseigné") nonRenseignes++;
  });

  if (total === 0) return "Aucune date";
  if (nonRenseignes === total) return "⚪ Pas répondu";
  if (absents === total) return "🔴 Indisponible";
  if (presents === total) return "🟢 100%";
  return "🟠 Partiel";
}

async function genererTableauPresencesSupabase(idCompetition) {
  const resultat = await sbApiAdmin("tableau_presences", {
    idCompetition: Number(idCompetition)
  });
  if (!resultat?.succes) return resultat;

  const datesResultat = { dates: (resultat.dates || []).map(sbDateObj) };
  const joueursResultat = { joueurs: (resultat.joueurs || []).map(sbJoueurObj) };
  const presences = resultat.presences || [];

  const joueursActifs = joueursResultat.joueurs.filter(function (joueur) {
    return sbCle(joueur.statut) === "actif";
  });

  const datesValides = new Set(
    datesResultat.dates.map(function (dateInfo) {
      return sbFormatDateISO(dateInfo.dateCompetition);
    })
  );

  const pseudosJoueursActifs = new Set(
    joueursActifs.map(function (joueur) {
      return sbCle(joueur.pseudo);
    })
  );

  const indexPresences = {};
  const presencesOrphelines = [];

  (presences || []).forEach(function (presence) {
    const pseudoCle = sbCle(presence.pseudo);
    const dateCle = sbFormatDateISO(presence.date_competition);
    const dateExiste = datesValides.has(dateCle);
    const joueurActifExiste = pseudosJoueursActifs.has(pseudoCle);
    const causes = [];

    if (!dateExiste) {
      causes.push("date absente de la compétition");
    }

    if (!joueurActifExiste) {
      causes.push("joueur inactif ou supprimé");
    }

    if (causes.length > 0) {
      presencesOrphelines.push({
        pseudo: presence.pseudo || "",
        dateCompetition: dateCle,
        statut: presence.statut || "Non renseigné",
        cause: causes.join(" + ")
      });
      return;
    }

    indexPresences[pseudoCle + "|" + dateCle] = {
      statut: presence.statut || "Non renseigné",
      horairesDisponibles: presence.horaires_disponibles || ""
    };
  });

  const lignes = joueursActifs.map(function (joueur) {
    const disponibilites = datesResultat.dates.map(function (dateInfo) {
      const pseudoCle = sbCle(joueur.pseudo);
      const dateCle = sbFormatDateISO(dateInfo.dateCompetition);

      const presence = indexPresences[pseudoCle + "|" + dateCle] || {
        statut: "Non renseigné",
        horairesDisponibles: ""
      };

      return {
        dateCompetition: dateInfo.dateCompetition,
        dateAffichage: dateInfo.dateAffichage,
        horaires: dateInfo.horaires || "",
        statut: presence.statut,
        horairesDisponibles: presence.horairesDisponibles
      };
    });

    return {
      pseudo: joueur.pseudo,
      roles: joueur.roles,
      synthese: sbCalculerSyntheseJoueur(disponibilites),
      disponibilites: disponibilites
    };
  });

  return {
    succes: true,
    dates: datesResultat.dates,
    lignes: lignes,
    presencesOrphelines: presencesOrphelines,
    nbPresencesChargees: presences.length
  };
}

async function chargerJoueursSansReponseSupabase(idCompetition) {
  const resultat = await sbApiAdmin("sans_reponse", {
    idCompetition: Number(idCompetition)
  });
  if (!resultat?.succes) return resultat;
  const joueursResultat = { joueurs: (resultat.joueurs || []).map(sbJoueurObj) };

  const repondants = new Set(
    (resultat.presences || [])
      .filter(function (presence) {
        return sbPresenceEstRenseignee(presence.statut);
      })
      .map(function (presence) {
        return sbCle(presence.pseudo);
      })
  );

  const joueursSansReponse = joueursResultat.joueurs
    .filter(function (joueur) {
      return sbCle(joueur.statut) === "actif" &&
        !repondants.has(sbCle(joueur.pseudo));
    })
    .map(function (joueur) {
      return {
        pseudo: joueur.pseudo,
        roles: joueur.roles
      };
    });

  return {
    succes: true,
    nombre: joueursSansReponse.length,
    joueurs: joueursSansReponse
  };
}

async function chargerAujourdHuiOfficierSupabase() {
  const dateIso = sbDateIsoFranceAujourdhui();
  const dateInfoJour = {
    dateCompetition: sbFormatDateFR(dateIso),
    dateAffichage: sbDateAffichage(dateIso),
    jourCourt: sbJourCourt(dateIso),
    jourNumero: sbFormatDateFR(dateIso).slice(0, 2),
    moisCourt: sbMoisCourt(dateIso),
    horaires: ""
  };

  const resultat = await sbApiAdmin("aujourdhui", { date: dateIso });
  if (!resultat?.succes) return resultat;
  const datesJour = resultat.dates || [];

  const idsCompetitions = Array.from(new Set(
    (datesJour || []).map(function (date) {
      return Number(date.competition_id);
    }).filter(Boolean)
  ));

  if (idsCompetitions.length === 0) {
    return {
      succes: true,
      dateIso: dateIso,
      dateAffichage: dateInfoJour.dateAffichage,
      competitions: [],
      resume: {
        competitions: 0,
        presents: 0,
        remplacants: 0,
        absents: 0,
        sansReponse: 0
      }
    };
  }

  const competitionsBrutes = resultat.competitions || [];
  const joueursBruts = (resultat.joueurs || []).map(function (joueur) {
    return {
      ...joueur,
      discord_username: joueur.discordUsername || "",
      discordLie: joueur.discordLie === true
    };
  });
  const presencesJour = resultat.presences || [];
  const rappelsJour = (resultat.rappels || []).filter(function (rappel) {
    return rappel.type_rappel === SB_TYPE_RAPPEL_PRESENCES_SANS_REPONSE;
  });
  const lectureRappelsDisponible = true;

  const competitionsParId = {};
  (competitionsBrutes || []).forEach(function (competition) {
    competitionsParId[Number(competition.id)] = competition;
  });

  const rappelsParCompetitionHeure = {};
  (rappelsJour || []).forEach(function (rappel) {
    const cleRappel = sbCleRappelJour(rappel.competition_id, rappel.heure_programmee);
    if (!rappelsParCompetitionHeure[cleRappel]) {
      rappelsParCompetitionHeure[cleRappel] = rappel;
    }
  });

  const presencesParCompetitionPseudo = {};
  (presencesJour || []).forEach(function (presence) {
    const cle = Number(presence.competition_id) + "|" + sbCle(presence.pseudo);
    if (!presencesParCompetitionPseudo[cle]) {
      presencesParCompetitionPseudo[cle] = [];
    }
    presencesParCompetitionPseudo[cle].push(presence);
  });

  const joueursActifs = (joueursBruts || []).filter(function (joueur) {
    return sbCle(joueur.statut) === "actif" && Boolean(sbTexte(joueur.pseudo));
  });

  const resume = {
    competitions: 0,
    presents: 0,
    remplacants: 0,
    absents: 0,
    sansReponse: 0
  };

  const competitions = (datesJour || []).map(function (dateBrute) {
    const idCompetition = Number(dateBrute.competition_id);
    const competitionBrute = competitionsParId[idCompetition] || {};
    const competition = sbCompetitionObj(competitionBrute);
    const dateInfo = sbDateObj(dateBrute);
    const rappel = rappelsParCompetitionHeure[
      sbCleRappelJour(idCompetition, competition.heureRappelPresence)
    ] || null;
    const rappelActif = competition.rappelPresenceActive === true &&
      Boolean(competition.heureRappelPresence);

    const joueursConcernes = joueursActifs.filter(function (joueur) {
      return sbJoueurAutorisePourCompetition(joueur, competitionBrute);
    });

    const sansReponseAvecDiscord = [];
    const sansReponseSansDiscord = [];

    const lignes = joueursConcernes.map(function (joueur) {
      const clePresence = idCompetition + "|" + sbCle(joueur.pseudo);
      const presencesJoueur = presencesParCompetitionPseudo[clePresence] || [];
      const disponibilite = sbDisponibiliteDepuisPresencesJour(dateInfo, presencesJoueur);

      if (sbPresenceJourSansReponse(presencesJoueur)) {
        const joueurSansReponse = {
          pseudo: joueur.pseudo,
          roles: joueur.roles || "",
          discordUsername: joueur.discord_username || ""
        };

        if (sbJoueurDiscordLie(joueur)) {
          sansReponseAvecDiscord.push(joueurSansReponse);
        } else {
          sansReponseSansDiscord.push(joueurSansReponse);
        }
      }

      return {
        pseudo: joueur.pseudo,
        roles: joueur.roles || "",
        discordUsername: joueur.discord_username || "",
        discordLie: sbJoueurDiscordLie(joueur),
        disponibilites: [disponibilite]
      };
    });

    const stats = sbCalculerStatsJour(lignes);
    const effectifParHoraire = sbCalculerEffectifHoraireJour(dateInfo, lignes);

    resume.competitions++;
    resume.presents += stats.presents;
    resume.remplacants += stats.remplacants;
    resume.absents += stats.absents;
    resume.sansReponse += stats.sansReponse;

    return {
      id: idCompetition,
      nom: competition.nom || "Compétition inconnue",
      statut: competition.statut || "",
      rolesAutorises: competition.rolesAutorises || "",
      description: competition.description || "",
      date: dateInfo,
      rappel: {
        actif: rappelActif,
        heureProgrammee: competition.heureRappelPresence || "",
        statutJour: sbStatutRappelJour(competitionBrute, rappel, lectureRappelsDisponible),
        statut: rappel?.statut || "",
        envoyeA: rappel?.envoye_a || "",
        erreur: rappel?.erreur || "",
        nbJoueurs: Number(rappel?.nb_joueurs || 0),
        nbMentions: Number(rappel?.nb_mentions || 0),
        nbSansDiscord: Number(rappel?.nb_sans_discord || 0),
        nbMessages: Number(rappel?.nb_messages || 0),
        lectureDisponible: lectureRappelsDisponible
      },
      stats: stats,
      effectifParHoraire: effectifParHoraire,
      joueursSansReponse: {
        total: sansReponseAvecDiscord.length + sansReponseSansDiscord.length,
        avecDiscord: sansReponseAvecDiscord,
        sansDiscord: sansReponseSansDiscord
      },
      lignes: lignes
    };
  });

  return {
    succes: true,
    dateIso: dateIso,
    dateAffichage: dateInfoJour.dateAffichage,
    competitions: competitions,
    resume: resume
  };
}

async function chargerDonneesOfficierInitialesSupabase() {
  const resultat = await sbApiAdmin("dashboard", {});
  if (!resultat?.succes) return resultat;
  return {
    succes: true,
    joueurs: resultat.joueurs || {},
    competitions: resultat.competitions || {},
    competitionsListe: (resultat.competitionsListe || []).map(sbCompetitionObj)
  };
}

async function chargerJournalActiviteSupabase() {
  const resultat = await sbApiAdmin("journal", { limite: 50 });
  if (!resultat?.succes) return resultat;
  const lignesJournal = resultat.journal || [];
  const idsCompetition = sbExtraireIdsCompetitionsJournal(lignesJournal);
  await sbChargerNomsCompetitionsJournal(idsCompetition);

  const journal = lignesJournal.map(function (ligne) {
    return {
      dateHeure: ligne.date_heure
        ? new Date(ligne.date_heure).toLocaleString("fr-FR")
        : "",
      utilisateur: ligne.utilisateur,
      action: sbActionJournalLisible(ligne.action),
      details: sbDetailsJournalLisibles(ligne.details)
    };
  });

  return {
    succes: true,
    journal: journal
  };
}

async function verifierMotDePasseSupabase(pseudo, mdp) {
  void pseudo;
  const resultat = await sbRpc("ouvrir_session_admin_site", {
    p_session_joueur: MPPSession.lireSessionJoueur(),
    p_mot_de_passe: String(mdp || "")
  }, "Authentification impossible.");

  if (!resultat?.succes || !resultat.sessionToken) {
    return {
      succes: false,
      message: resultat?.message || "Authentification impossible."
    };
  }
  MPPSession.definirSessionAdmin(resultat.sessionToken, resultat.expireA);
  return {
    succes: true,
    message: resultat.message || "Accès officier validé.",
    estOfficier: resultat.estOfficier === true,
    estSuperAdmin: resultat.estSuperAdmin === true
  };
}

async function changerMotDePasseSupabase(pseudo, nouveauMdp) {
  void pseudo;
  const resultat = await sbRpc("changer_credential_session_site", {
    p_session_admin: MPPSession.lireSessionAdmin(),
    p_nouveau_mot_de_passe: String(nouveauMdp || "")
  }, "Impossible de modifier le mot de passe.");

  if (!resultat || resultat.succes !== true) {
    return {
      succes: false,
      message: resultat?.message || "Impossible de modifier le mot de passe."
    };
  }

  MPPSession.toutEffacer();
  return resultat;
}

async function modifierCompetitionCompleteSupabase(config) {
  const resultat = await sbApiAdmin("modifier_competition", { config: config || {} });
  const succesRPC = resultat?.succes === true || resultat?.success === true;

  if (!resultat || !succesRPC) {
    return sbErreur(resultat?.message || "La compétition n'a pas pu être modifiée.");
  }

  return {
    succes: true,
    message: resultat.message || "Compétition modifiée."
  };
}
