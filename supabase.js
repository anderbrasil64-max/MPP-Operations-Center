/* ==========================================================
   MPP OPERATIONS CENTER
   Couche Supabase
   Version Alpha 0.12.2 - Migration complète Supabase
   ========================================================== */

/*
  IMPORTANT
  - Cette clé est une clé publique "publishable", prévue pour être utilisée côté navigateur.
  - Ne jamais mettre de clé "secret" / "service_role" dans ce fichier.
*/

const SUPABASE_URL = "https://icguokxqrnqdjafqvzyz.supabase.co";
const SUPABASE_KEY = "sb_publishable_Twp9mcx7CQdS_weNNUPtTQ_8V1s_Z_R";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const sbCacheNomsCompetitions = {};
const SB_TYPE_RAPPEL_PRESENCES_SANS_REPONSE = "sans_reponse_17h";

/* ==========================================================
   OUTILS GÉNÉRAUX
   ========================================================== */

function sbTexte(valeur) {
  return String(valeur ?? "").trim();
}

function sbDiscordId(valeur) {
  const texte = sbTexte(valeur);
  if (!texte) return "";
  return /^\d+$/.test(texte) ? texte : null;
}

function sbHeureHHMM(valeur) {
  const match = sbTexte(valeur).match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? match[1] + ":" + match[2] : "";
}

function sbCleRappelJour(idCompetition, heure) {
  return Number(idCompetition) + "|" + sbHeureHHMM(heure);
}

function sbHeureRappelPresenceOuNull(rappelActif, heure) {
  if (!rappelActif) return null;
  return sbHeureHHMM(heure) || null;
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

function sbEstSuperAdminPseudo(pseudo) {
  return sbCle(pseudo) === "raiju153";
}

function sbEstOfficierJoueur(joueur) {
  if (!joueur) return false;
  if (sbEstSuperAdminPseudo(joueur.pseudo)) return true;
  return sbRolesArray(joueur.roles).includes("officier");
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
    discordId: joueur.discord_id || "",
    discordUsername: joueur.discord_username || "",
    discordLieA: joueur.discord_lie_a || "",
    dateAjout: joueur.date_ajout,
    derniereConnexion: joueur.derniere_connexion,
    derniereModification: joueur.derniere_modification
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

async function sbNomCompetitionDepuisId(idCompetition) {
  const idComp = Number(idCompetition);
  if (!idComp) return "Compétition inconnue";

  if (sbCacheNomsCompetitions[idComp]) {
    return sbCacheNomsCompetitions[idComp];
  }

  const { data, error } = await supabaseClient
    .from("competitions")
    .select("nom")
    .eq("id", idComp)
    .limit(1);

  if (error || !data || data.length === 0) {
    return "Compétition inconnue";
  }

  sbCacheNomsCompetitions[idComp] = data[0].nom || "Compétition inconnue";
  return sbCacheNomsCompetitions[idComp];
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

  const { data, error } = await supabaseClient
    .from("competitions")
    .select("id,nom")
    .in("id", idsACharger);

  if (error) {
    return;
  }

  (data || []).forEach(function (competition) {
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
  const discordId = sbTexte(joueur?.discord_id);
  const discordLieA = sbTexte(joueur?.discord_lie_a);
  return Boolean(discordId && discordLieA && /^\d+$/.test(discordId));
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

      if (statut === "Remplaçant") {
        stats.remplacants++;
        return;
      }

      const horairesDisponibles = sbTexte(dispo?.horairesDisponibles)
        .split(",")
        .map(function (h) { return h.trim(); })
        .filter(Boolean);

      if (horairesDisponibles.includes(horaire)) {
        stats.presents++;
      }
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

function sbHorairesJournal(horaires) {
  return sbTexte(horaires)
    .split(",")
    .map(function (horaire) { return horaire.trim(); })
    .filter(Boolean)
    .join(", ");
}

function sbLibelleChangementPresence(ancienStatut, nouveauStatut) {
  const cle = ancienStatut + " → " + nouveauStatut;
  const libelles = {
    "Présent → Absent": "Désistement",
    "Absent → Présent": "Disponibilité ajoutée",
    "Présent → Remplaçant": "Passage en remplaçant",
    "Remplaçant → Présent": "Passage en présent",
    "Absent → Remplaçant": "Passage en remplaçant",
    "Remplaçant → Absent": "Retrait de disponibilité",
    "Non renseigné → Présent": "Présence ajoutée",
    "Non renseigné → Absent": "Absence renseignée",
    "Non renseigné → Remplaçant": "Remplacement proposé",
    "Présent → Non renseigné": "Réponse supprimée",
    "Absent → Non renseigné": "Réponse supprimée",
    "Remplaçant → Non renseigné": "Réponse supprimée"
  };

  return libelles[cle] || "Réponse modifiée";
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

async function sbJournaliser(utilisateur, action, details) {
  await supabaseClient
    .from("journal_activite")
    .insert([{
      utilisateur: utilisateur || "Inconnu",
      action: action || "",
      details: details || ""
    }]);
}

/* ==========================================================
   API SUPABASE : ROUTEUR COMPATIBLE AVEC app.js
   ========================================================== */

async function apiSupabase(action, parametres) {
  switch (action) {
    case "identifierUtilisateur":
      return identifierUtilisateurSupabase(parametres.pseudo);

    case "chargerCompetitions":
      return chargerCompetitionsSupabase();

    case "chargerDatesCompetition":
      return chargerDatesCompetitionSupabase(parametres.idCompetition);

    case "chargerPresencesJoueur":
      return chargerPresencesJoueurSupabase(parametres.idCompetition, parametres.pseudo);

    case "chargerCompetitionComplete":
      return chargerCompetitionCompleteSupabase(parametres.idCompetition, parametres.pseudo);

    case "sauvegarderPresences":
      return sauvegarderPresencesSupabase(
        parametres.idCompetition,
        parametres.pseudo,
        JSON.parse(parametres.presences || "[]")
      );

    case "chargerDonneesOfficierInitiales":
      return chargerDonneesOfficierInitialesSupabase();

    case "chargerAujourdHuiOfficier":
      return chargerAujourdHuiOfficierSupabase(parametres.utilisateur);

    case "genererTableauPresences":
      return genererTableauPresencesSupabase(
        parametres.idCompetition,
        parametres.utilisateur
      );

    case "chargerJoueursSansReponse":
      return chargerJoueursSansReponseSupabase(parametres.idCompetition);

    case "modifierStatutCompetition":
      return modifierStatutCompetitionSupabase(
        parametres.idCompetition,
        parametres.nouveauStatut,
        parametres.utilisateur
      );

    case "creerCompetitionComplete":
      return creerCompetitionCompleteSupabase(
        JSON.parse(parametres.config || "{}"),
        parametres.utilisateur
      );

    case "modifierCompetitionComplete":
      return modifierCompetitionCompleteSupabase(
        JSON.parse(parametres.config || "{}"),
        parametres.utilisateur
      );

    case "chargerJoueurs":
      return chargerJoueursSupabase();

    case "ajouterJoueur":
      return ajouterJoueurSupabase(
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.utilisateur,
        parametres.discordId
      );

    case "modifierJoueur":
      return modifierJoueurSupabase(
        parametres.idJoueur,
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.utilisateur,
        parametres.discordId
      );

    case "genererCodeLiaisonDiscord":
      return genererCodeLiaisonDiscordSupabase(parametres.pseudo);

    case "chargerDemandesLiaisonDiscord":
      return chargerDemandesLiaisonDiscordSupabase(
        parametres.utilisateur,
        parametres.motDePasse
      );

    case "validerDemandeLiaisonDiscord":
      return validerDemandeLiaisonDiscordSupabase(
        parametres.idDemande,
        parametres.utilisateur,
        parametres.motDePasse
      );

    case "refuserDemandeLiaisonDiscord":
      return refuserDemandeLiaisonDiscordSupabase(
        parametres.idDemande,
        parametres.utilisateur,
        parametres.motDePasse,
        parametres.raison
      );

    case "supprimerJoueur":
      return supprimerJoueurSupabase(
        parametres.idJoueur,
        parametres.utilisateur,
        parametres.motDePasse
      );

    case "ajouterDateCompetition":
      return ajouterDateCompetitionSupabase(
        parametres.idCompetition,
        parametres.dateCompetition,
        parametres.utilisateur,
        parametres.horaires
      );

    case "supprimerDateCompetition":
      return supprimerDateCompetitionSupabase(
        parametres.idDate,
        parametres.utilisateur
      );

    case "supprimerCompetition":
      return supprimerCompetitionSupabase(
        parametres.idCompetition,
        parametres.utilisateur
      );

    case "chargerJournalActivite":
      return chargerJournalActiviteSupabase();

    default:
      return sbErreur("Action Supabase inconnue : " + action);
  }
}

function sbNormaliserReponseEdgeFunction(data, messageDefaut) {
  const reponse = { ...(data || {}) };

  if (reponse.succes === false || reponse.success === false) {
    return sbErreur(
      reponse.message || reponse.error || "Erreur Edge Function.",
      reponse.details || ""
    );
  }

  reponse.succes = true;
  if (!reponse.message && messageDefaut) {
    reponse.message = messageDefaut;
  }

  return reponse;
}

function sbListeDemandesDiscord(data) {
  return data?.demandes ||
    data?.demandesEnAttente ||
    data?.requests ||
    data?.data ||
    [];
}

async function genererCodeLiaisonDiscordSupabase(pseudo) {
  const { data, error } = await supabaseClient.functions.invoke(
    "discord-link-code",
    {
      body: {
        pseudo: sbTexte(pseudo)
      }
    }
  );

  if (error) return sbErreur(error.message);

  return sbNormaliserReponseEdgeFunction(data, "Code de liaison Discord généré.");
}

async function chargerDemandesLiaisonDiscordSupabase(utilisateur, motDePasse) {
  const { data, error } = await supabaseClient.functions.invoke(
    "discord-link-admin",
    {
      body: {
        action: "lister",
        utilisateur: sbTexte(utilisateur),
        motDePasse: sbTexte(motDePasse)
      }
    }
  );

  if (error) return sbErreur(error.message);

  const reponse = sbNormaliserReponseEdgeFunction(data, "Demandes chargées.");
  if (reponse.succes) {
    reponse.demandes = sbListeDemandesDiscord(data);
  }

  return reponse;
}

async function validerDemandeLiaisonDiscordSupabase(idDemande, utilisateur, motDePasse) {
  const { data, error } = await supabaseClient.functions.invoke(
    "discord-link-admin",
    {
      body: {
        action: "valider",
        idDemande: sbTexte(idDemande),
        utilisateur: sbTexte(utilisateur),
        motDePasse: sbTexte(motDePasse)
      }
    }
  );

  if (error) return sbErreur(error.message);

  return sbNormaliserReponseEdgeFunction(data, "Demande de liaison validée.");
}

async function refuserDemandeLiaisonDiscordSupabase(idDemande, utilisateur, motDePasse, raison) {
  const { data, error } = await supabaseClient.functions.invoke(
    "discord-link-admin",
    {
      body: {
        action: "refuser",
        idDemande: sbTexte(idDemande),
        utilisateur: sbTexte(utilisateur),
        motDePasse: sbTexte(motDePasse),
        raison: sbTexte(raison)
      }
    }
  );

  if (error) return sbErreur(error.message);

  return sbNormaliserReponseEdgeFunction(data, "Demande de liaison refusée.");
}

/* ==========================================================
   JOUEURS / CONNEXION
   ========================================================== */

async function identifierUtilisateurSupabase(pseudo) {
  const pseudoRecherche = sbTexte(pseudo);

  const { data, error } = await supabaseClient
    .from("joueurs")
    .select("*")
    .ilike("pseudo", pseudoRecherche)
    .limit(1);

  if (error) return sbErreur(error.message);

  if (!data || data.length === 0) {
    return sbErreur("Pseudo non autorisé. Merci de contacter un officier.");
  }

  const joueurBrut = data[0];

  if (sbCle(joueurBrut.statut) !== "actif") {
    return sbErreur("Ce joueur n'est pas actif.");
  }

  await supabaseClient
    .from("joueurs")
    .update({ derniere_connexion: new Date().toISOString() })
    .eq("id", joueurBrut.id);

  const joueur = sbJoueurObj({
    ...joueurBrut,
    derniere_connexion: new Date().toISOString()
  });

  const estOfficier = sbEstOfficierJoueur(joueur);

  return {
    succes: true,
    type: estOfficier ? "officier" : "joueur",
    joueur: joueur,
    officier: estOfficier
      ? { id: joueur.id, pseudo: joueur.pseudo, permissions: "OFFICIER" }
      : null
  };
}

async function chargerJoueursSupabase() {
  const { data, error } = await supabaseClient
    .from("joueurs")
    .select("*")
    .order("pseudo", { ascending: true });

  if (error) return sbErreur(error.message);

  return {
    succes: true,
    joueurs: (data || []).map(sbJoueurObj)
  };
}

async function ajouterJoueurSupabase(pseudo, roles, statut, utilisateur, discordId) {

  const utilisateurSuperAdmin = await sbUtilisateurEstSuperAdmin(utilisateur);

  if (
    !utilisateurSuperAdmin &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut ajouter un joueur."
    );
  }

  const rolesDemandes = sbTexte(roles);

  if (
    rolesDemandes.toLowerCase().includes("superadmin") &&
    !utilisateurSuperAdmin
  ) {
    return sbErreur(
      "Accès refusé : seul un Super Admin peut attribuer le rôle SuperAdmin."
    );
  }

  const discordIdNettoye = utilisateurSuperAdmin ? sbDiscordId(discordId) : "";

  if (discordIdNettoye === null) {
    return sbErreur("L’ID Discord doit contenir uniquement des chiffres.");
  }

  const donneesJoueur = {
    pseudo: sbTexte(pseudo),
    roles: rolesDemandes || "Soldat",
    statut: sbTexte(statut) || "Actif"
  };

  if (utilisateurSuperAdmin) {
    donneesJoueur.discord_id = discordIdNettoye || null;
  }

  const { data, error } = await supabaseClient
    .from("joueurs")
    .insert([donneesJoueur])
    .select()
    .single();

  if (error) return sbErreur(error.message);

  const detailsAjout = [
    "Joueur : " + sbTexte(pseudo),
    "Rôles : " + (rolesDemandes || "Soldat"),
    "Statut : " + (sbTexte(statut) || "Actif")
  ];

  if (discordIdNettoye) {
    detailsAjout.push("ID Discord : ajouté");
  }

  await sbJournaliser(
    utilisateur,
    "Joueur ajouté",
    detailsAjout.join("\n")
  );

  return {
    succes: true,
    message: "Joueur ajouté.",
    idJoueur: data.id
  };
}

async function modifierJoueurSupabase(
  idJoueur,
  pseudo,
  roles,
  statut,
  utilisateur,
  discordId
) {

  const utilisateurSuperAdmin = await sbUtilisateurEstSuperAdmin(utilisateur);

  if (
    !utilisateurSuperAdmin &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut modifier un joueur."
    );
  }

  const rolesDemandes = sbTexte(roles);

  if (
    rolesDemandes.toLowerCase().includes("superadmin") &&
    !utilisateurSuperAdmin
  ) {
    return sbErreur(
      "Accès refusé : seul un Super Admin peut attribuer le rôle SuperAdmin."
    );
  }

  const { data: joueursExistants, error: erreurJoueurExistant } = await supabaseClient
    .from("joueurs")
    .select("*")
    .eq("id", Number(idJoueur))
    .limit(1);

  if (erreurJoueurExistant) return sbErreur(erreurJoueurExistant.message);

  if (!joueursExistants || joueursExistants.length === 0) {
    return sbErreur("Joueur introuvable.");
  }

  const joueurExistant = joueursExistants[0];
  const nouveauPseudo = sbTexte(pseudo);
  const nouveauStatut = sbTexte(statut);
  const nouveauDiscordId = utilisateurSuperAdmin ? sbDiscordId(discordId) : "";

  if (nouveauDiscordId === null) {
    return sbErreur("L’ID Discord doit contenir uniquement des chiffres.");
  }

  const donneesModification = {
    pseudo: nouveauPseudo,
    roles: rolesDemandes,
    statut: nouveauStatut,
    derniere_modification: new Date().toISOString()
  };

  if (utilisateurSuperAdmin) {
    donneesModification.discord_id = nouveauDiscordId || null;
  }

  const { error } = await supabaseClient
    .from("joueurs")
    .update(donneesModification)
    .eq("id", Number(idJoueur));

  if (error) return sbErreur(error.message);

  const changements = [];

  if (sbTexte(joueurExistant.pseudo) !== nouveauPseudo) {
    changements.push("Pseudo : " + sbTexte(joueurExistant.pseudo) + " → " + nouveauPseudo);
  }

  if (sbTexte(joueurExistant.roles) !== rolesDemandes) {
    changements.push("Rôles : " + (sbTexte(joueurExistant.roles) || "-") + " → " + (rolesDemandes || "-"));
  }

  if (sbTexte(joueurExistant.statut) !== nouveauStatut) {
    changements.push("Statut : " + (sbTexte(joueurExistant.statut) || "-") + " → " + (nouveauStatut || "-"));
  }

  if (utilisateurSuperAdmin && sbTexte(joueurExistant.discord_id) !== nouveauDiscordId) {
    const ancienDiscordId = sbTexte(joueurExistant.discord_id);

    if (!ancienDiscordId && nouveauDiscordId) {
      changements.push("ID Discord : ajouté");
    } else if (ancienDiscordId && !nouveauDiscordId) {
      changements.push("ID Discord : supprimé");
    } else {
      changements.push("ID Discord : modifié");
    }
  }

  if (changements.length > 0) {
    await sbJournaliser(
      utilisateur,
      "Joueur modifié",
      "Joueur : " + (sbTexte(joueurExistant.pseudo) || nouveauPseudo) +
        "\n" +
        changements.join("\n")
    );
  }

  return {
    succes: true,
    message: "Joueur modifié."
  };
}

async function supprimerJoueurSupabase(idJoueur, utilisateur, motDePasse) {
  const utilisateurTexte = sbTexte(utilisateur);
  const motDePasseTexte = String(motDePasse || "");

  if (!(await sbUtilisateurEstSuperAdmin(utilisateurTexte))) {
    return sbErreur("Accès refusé : seul un SuperAdmin peut supprimer un joueur.");
  }

  if (!motDePasseTexte) {
    return sbErreur("Mot de passe SuperAdmin requis pour supprimer un joueur.");
  }

  const { data: joueurs, error: erreurJoueur } = await supabaseClient
    .from("joueurs")
    .select("*")
    .eq("id", Number(idJoueur))
    .limit(1);

  if (erreurJoueur) return sbErreur(erreurJoueur.message);

  if (!joueurs || joueurs.length === 0) {
    return sbErreur("Joueur introuvable.");
  }

  const joueur = joueurs[0];
  const pseudoJoueur = sbTexte(joueur.pseudo);

  if (!pseudoJoueur) {
    return sbErreur("Joueur invalide.");
  }

  if (sbEstSuperAdminPseudo(pseudoJoueur) || sbRolesArray(joueur.roles).includes("superadmin")) {
    return sbErreur("Impossible de supprimer un SuperAdmin.");
  }

  if (sbCle(pseudoJoueur) === sbCle(utilisateurTexte)) {
    return sbErreur("Impossible de supprimer votre propre compte.");
  }

  const { data: resultatRPC, error: erreurRPC } = await supabaseClient.rpc(
    "supprimer_joueur_site",
    {
      p_id_joueur: Number(idJoueur),
      p_utilisateur: utilisateurTexte,
      p_mot_de_passe: motDePasseTexte
    }
  );

  if (erreurRPC) {
    return sbErreur(
      "Suppression impossible côté base : " + erreurRPC.message +
        ". Vérifiez que la fonction SQL supprimer_joueur_site est installée dans Supabase."
    );
  }

  const resultat = Array.isArray(resultatRPC)
    ? resultatRPC[0]
    : resultatRPC;

  if (!resultat || resultat.succes !== true) {
    return sbErreur(
      resultat?.message ||
        "La suppression du joueur n'a pas pu être confirmée côté base."
    );
  }

  return {
    succes: true,
    message: resultat.message ||
      "Joueur supprimé. Présences supprimées : " +
        Number(resultat.nbPresencesSupprimees || 0) +
        ".",
    pseudo: resultat.pseudo || pseudoJoueur,
    nbPresencesSupprimees: Number(resultat.nbPresencesSupprimees || 0),
    nbDemandesDiscordSupprimees: Number(resultat.nbDemandesDiscordSupprimees || 0)
  };
}

async function sbUtilisateurEstSuperAdmin(pseudo) {
  if (sbEstSuperAdminPseudo(pseudo)) return true;

  const { data, error } = await supabaseClient
    .from("joueurs")
    .select("*")
    .ilike("pseudo", sbTexte(pseudo))
    .limit(1);

  if (error || !data || data.length === 0) return false;

  return sbCle(data[0].statut) === "actif" &&
    sbRolesArray(data[0].roles).includes("superadmin");
}

async function sbUtilisateurEstOfficier(pseudo) {
  const { data, error } = await supabaseClient
    .from("joueurs")
    .select("*")
    .ilike("pseudo", sbTexte(pseudo))
    .limit(1);

  if (error || !data || data.length === 0) return false;

  return sbEstOfficierJoueur(data[0]);
}

/* ==========================================================
   COMPÉTITIONS / DATES / PRÉSENCES
   ========================================================== */

async function chargerCompetitionsSupabase() {
  const { data, error } = await supabaseClient
    .from("competitions")
    .select("*")
    .order("id", { ascending: false });

  if (error) return sbErreur(error.message);

  return {
    succes: true,
    competitions: (data || []).map(sbCompetitionObj)
  };
}

async function chargerDatesCompetitionSupabase(idCompetition) {
  const { data, error } = await supabaseClient
    .from("dates_competition")
    .select("*")
    .eq("competition_id", Number(idCompetition))
    .order("date_competition", { ascending: true });

  if (error) return sbErreur(error.message);

  return {
    succes: true,
    dates: (data || []).map(sbDateObj)
  };
}

async function chargerPresencesJoueurSupabase(idCompetition, pseudo) {
  const { data, error } = await supabaseClient
    .from("presences")
    .select("*")
    .eq("competition_id", Number(idCompetition))
    .ilike("pseudo", sbTexte(pseudo));

  if (error) return sbErreur(error.message);

  return {
    succes: true,
    presences: (data || []).map(sbPresenceObj)
  };
}

async function chargerCompetitionCompleteSupabase(idCompetition, pseudo) {
  const dates = await chargerDatesCompetitionSupabase(idCompetition);
  if (!dates.succes) return dates;

  const presences = await chargerPresencesJoueurSupabase(idCompetition, pseudo);
  if (!presences.succes) return presences;

  return {
    succes: true,
    dates: dates.dates,
    presences: presences.presences
  };
}

async function sauvegarderPresencesSupabase(idCompetition, pseudo, presences) {
  const idComp = Number(idCompetition);
  const pseudoOfficiel = sbTexte(pseudo);

  const lignes = (presences || []).map(function (presence) {
    return {
      competition_id: idComp,
      pseudo: pseudoOfficiel,
      date_competition: sbFormatDateISO(presence.dateCompetition),
      statut: presence.statut || "Non renseigné",
      horaires_disponibles: presence.horairesDisponibles || "",
      derniere_modification: new Date().toISOString()
    };
  });

  const { data: existantes, error: erreurExistantes } = await supabaseClient
    .from("presences")
    .select("id,date_competition,statut,horaires_disponibles")
    .eq("competition_id", idComp)
    .ilike("pseudo", pseudoOfficiel);

  if (erreurExistantes) return sbErreur(erreurExistantes.message);

  const indexExistantes = {};

  (existantes || []).forEach(function (presenceExistante) {
    indexExistantes[sbFormatDateISO(presenceExistante.date_competition)] = presenceExistante;
  });

  let ajouts = 0;
  let modifications = 0;
  let suppressions = 0;
  let horairesModifies = 0;
  const detailsChangements = [];

  lignes.forEach(function (ligne) {
    const presenceExistante = indexExistantes[ligne.date_competition];
    const ancienStatut = sbStatutPresenceLisible(presenceExistante?.statut);
    const nouveauStatut = sbStatutPresenceLisible(ligne.statut);
    const ancienRenseigne = sbPresenceEstRenseignee(ancienStatut);
    const nouveauRenseigne = sbPresenceEstRenseignee(nouveauStatut);
    const anciensHoraires = sbHorairesJournal(presenceExistante?.horaires_disponibles || "");
    const nouveauxHoraires = sbHorairesJournal(ligne.horaires_disponibles || "");
    const dateAffichage = sbDateAffichage(ligne.date_competition);

    if (!ancienRenseigne && nouveauRenseigne) {
      ajouts++;
      detailsChangements.push(
        "- " +
          dateAffichage +
          " : " +
          ancienStatut +
          " → " +
          nouveauStatut +
          " — " +
          sbLibelleChangementPresence(ancienStatut, nouveauStatut)
      );
      return;
    }

    if (ancienRenseigne && !nouveauRenseigne) {
      suppressions++;
      detailsChangements.push(
        "- " +
          dateAffichage +
          " : " +
          ancienStatut +
          " → " +
          nouveauStatut +
          " — " +
          sbLibelleChangementPresence(ancienStatut, nouveauStatut)
      );
      return;
    }

    if (ancienRenseigne && nouveauRenseigne && ancienStatut !== nouveauStatut) {
      modifications++;
      detailsChangements.push(
        "- " +
          dateAffichage +
          " : " +
          ancienStatut +
          " → " +
          nouveauStatut +
          " — " +
          sbLibelleChangementPresence(ancienStatut, nouveauStatut)
      );
      return;
    }

    if (ancienRenseigne && nouveauRenseigne && anciensHoraires !== nouveauxHoraires) {
      horairesModifies++;
      detailsChangements.push(
        "- " +
          dateAffichage +
          " : horaires modifiés — " +
          (anciensHoraires || "Aucun horaire") +
          " → " +
          (nouveauxHoraires || "Aucun horaire")
      );
    }
  });

  const { error } = await supabaseClient
    .from("presences")
    .upsert(lignes, {
      onConflict: "competition_id,pseudo,date_competition"
    });

  if (error) return sbErreur(error.message);

  await supabaseClient
    .from("joueurs")
    .update({ derniere_modification: new Date().toISOString() })
    .ilike("pseudo", pseudoOfficiel);

  if (detailsChangements.length > 0) {
    const nomCompetition = await sbNomCompetitionDepuisId(idComp);

    await sbJournaliser(
      pseudoOfficiel,
      "Présences mises à jour",
      "Compétition : " +
        nomCompetition +
        "\nJoueur : " +
        pseudoOfficiel +
        "\n\nAjouts : " +
        ajouts +
        "\nModifications : " +
        modifications +
        "\nSuppressions : " +
        suppressions +
        "\nHoraires modifiés : " +
        horairesModifies +
        "\n\nDétail :\n" +
        detailsChangements.join("\n")
    );
  }

  return {
    succes: true,
    message: "Présences sauvegardées.",
    ajouts: ajouts,
    modifications: modifications,
    suppressions: suppressions,
    horairesModifies: horairesModifies
  };
}

async function creerCompetitionCompleteSupabase(config, utilisateur) {
  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut créer une compétition."
    );
  }

  const rappelPresenceActive = !!config.rappelPresenceActive;
  const heureRappelPresence = sbHeureRappelPresenceOuNull(
    rappelPresenceActive,
    config.heureRappelPresence
  );

  if (rappelPresenceActive && !heureRappelPresence) {
    return sbErreur("Merci de renseigner une heure de rappel Discord des présences.");
  }

  const { data: competition, error } = await supabaseClient
    .from("competitions")
    .insert([{
      nom: config.nom,
      statut: config.statut || "Brouillon",
      cree_par: utilisateur || "Inconnu",
      roles_autorises: config.rolesAutorises || "",
      description: config.description || "",

      fermeture_auto_active: !!config.fermetureAutoActive,
      heure_ouverture: config.heureOuvertureAuto || null,
      heure_fermeture: config.heureFermetureAuto || null,

      notification_presence_active: !!config.notificationPresenceActive,
      heure_notification_presence: config.heureNotificationPresence || null,

      rappel_presence_active: rappelPresenceActive,
      heure_rappel_presence: heureRappelPresence
    }])
    .select()
    .single();

  if (error) {
    return sbErreur(error.message);
  }

  const lignesDates = (config.dates || []).map(function(dateCompetition) {
    return {
      competition_id: competition.id,
      date_competition: sbFormatDateISO(dateCompetition),
      horaires: config.horaires || ""
    };
  });

  if (lignesDates.length > 0) {
    const { error: erreurDates } = await supabaseClient
      .from("dates_competition")
      .insert(lignesDates);

    if (erreurDates) {
      return sbErreur(erreurDates.message);
    }
  }

  await sbJournaliser(
    utilisateur,
    "Compétition créée",
    "Compétition : " +
      config.nom +
      "\nDates : " +
      lignesDates.length +
      "\nFermeture auto : " +
      (config.fermetureAutoActive ? "Oui" : "Non") +
      "\nNotification présences : " +
      (config.notificationPresenceActive ? "Oui" : "Non") +
      "\nRappel sans réponse : " +
      (rappelPresenceActive ? "Oui à " + heureRappelPresence : "Non")
  );

  return {
    succes: true,
    message: "Compétition créée.",
    idCompetition: competition.id,
    nbDates: lignesDates.length
  };
}

async function modifierStatutCompetitionSupabase(idCompetition, nouveauStatut, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur) && !(await sbUtilisateurEstOfficier(utilisateur))) {
    return sbErreur("Accès refusé : seul un officier peut modifier le statut.");
  }

  if (sbNormaliserStatut(nouveauStatut) === "archivee" && !sbEstSuperAdminPseudo(utilisateur)) {
    return sbErreur("Accès refusé : seul le Super Admin peut archiver.");
  }

  const { error } = await supabaseClient
    .from("competitions")
    .update({ statut: nouveauStatut })
    .eq("id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  const nomCompetition = await sbNomCompetitionDepuisId(idCompetition);

  await sbJournaliser(
    utilisateur,
    "Statut de compétition modifié",
    "Compétition : " + nomCompetition +
      "\nNouveau statut : " + nouveauStatut
  );

  return {
    succes: true,
    message: "Statut modifié."
  };
}

async function ajouterDateCompetitionSupabase(idCompetition, dateCompetition, utilisateur, horaires) {
  if (!sbEstSuperAdminPseudo(utilisateur) && !(await sbUtilisateurEstOfficier(utilisateur))) {
    return sbErreur("Accès refusé : seul un officier peut gérer les dates.");
  }

  const { data, error } = await supabaseClient
    .from("dates_competition")
    .insert([{
      competition_id: Number(idCompetition),
      date_competition: sbFormatDateISO(dateCompetition),
      horaires: horaires || ""
    }])
    .select()
    .single();

  if (error) return sbErreur(error.message);

  const nomCompetition = await sbNomCompetitionDepuisId(idCompetition);

  await sbJournaliser(
    utilisateur,
    "Date ajoutée",
    "Compétition : " + nomCompetition +
      "\nDate : " + sbDateAffichage(sbFormatDateISO(dateCompetition))
  );

  return {
    succes: true,
    message: "Date ajoutée.",
    idDate: data.id
  };
}

async function supprimerDateCompetitionSupabase(idDate, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur) && !(await sbUtilisateurEstOfficier(utilisateur))) {
    return sbErreur("Accès refusé : seul un officier peut gérer les dates.");
  }

  const { data: dates, error: erreurLectureDate } = await supabaseClient
    .from("dates_competition")
    .select("competition_id,date_competition")
    .eq("id", Number(idDate))
    .limit(1);

  if (erreurLectureDate) return sbErreur(erreurLectureDate.message);

  const dateSupprimee = dates && dates.length > 0 ? dates[0] : null;

  const { error } = await supabaseClient
    .from("dates_competition")
    .delete()
    .eq("id", Number(idDate));

  if (error) return sbErreur(error.message);

  const nomCompetition = dateSupprimee
    ? await sbNomCompetitionDepuisId(dateSupprimee.competition_id)
    : "Compétition inconnue";
  const dateAffichage = dateSupprimee
    ? sbDateAffichage(dateSupprimee.date_competition)
    : "Date inconnue";

  await sbJournaliser(
    utilisateur,
    "Date supprimée",
    "Compétition : " + nomCompetition +
      "\nDate : " + dateAffichage
  );

  return {
    succes: true,
    message: "Date supprimée."
  };
}

async function supprimerCompetitionSupabase(idCompetition, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur)) {
    return sbErreur("Accès refusé : seul le Super Admin peut supprimer une compétition.");
  }

  const nomCompetition = await sbNomCompetitionDepuisId(idCompetition);

  const { error } = await supabaseClient
    .from("competitions")
    .delete()
    .eq("id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  await sbJournaliser(
    utilisateur,
    "Compétition supprimée",
    "Compétition : " + nomCompetition
  );

  return {
    succes: true,
    message: "Compétition supprimée définitivement."
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

async function chargerToutesPresencesCompetitionSupabase(idCompetition) {
  const tailleLot = 1000;
  let debut = 0;
  let toutesLesPresences = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from("presences")
      .select("*")
      .eq("competition_id", Number(idCompetition))
      .order("id", { ascending: true })
      .range(debut, debut + tailleLot - 1);

    if (error) return sbErreur(error.message);

    const lot = data || [];
    toutesLesPresences = toutesLesPresences.concat(lot);

    if (lot.length < tailleLot) {
      break;
    }

    debut += tailleLot;
  }

  return {
    succes: true,
    presences: toutesLesPresences
  };
}

async function genererTableauPresencesSupabase(idCompetition, utilisateur) {
  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur("Accès refusé : seul un officier peut consulter ce tableau.");
  }

  const datesResultat = await chargerDatesCompetitionSupabase(idCompetition);
  if (!datesResultat.succes) return datesResultat;

  const joueursResultat = await chargerJoueursSupabase();
  if (!joueursResultat.succes) return joueursResultat;

  const presencesResultat = await chargerToutesPresencesCompetitionSupabase(idCompetition);
  if (!presencesResultat.succes) return presencesResultat;

  const presences = presencesResultat.presences || [];

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
  const joueursResultat = await chargerJoueursSupabase();
  if (!joueursResultat.succes) return joueursResultat;

  const { data, error } = await supabaseClient
    .from("presences")
    .select("pseudo,statut")
    .eq("competition_id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  const repondants = new Set(
    (data || [])
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

async function chargerAujourdHuiOfficierSupabase(utilisateur) {
  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur("Accès refusé : seul un officier peut consulter la page Présences du jour.");
  }

  const dateIso = sbDateIsoFranceAujourdhui();
  const dateInfoJour = {
    dateCompetition: sbFormatDateFR(dateIso),
    dateAffichage: sbDateAffichage(dateIso),
    jourCourt: sbJourCourt(dateIso),
    jourNumero: sbFormatDateFR(dateIso).slice(0, 2),
    moisCourt: sbMoisCourt(dateIso),
    horaires: ""
  };

  const { data: datesJour, error: erreurDates } = await supabaseClient
    .from("dates_competition")
    .select("id,competition_id,date_competition,horaires")
    .eq("date_competition", dateIso)
    .order("competition_id", { ascending: true });

  if (erreurDates) return sbErreur(erreurDates.message);

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

  const { data: competitionsBrutes, error: erreurCompetitions } = await supabaseClient
    .from("competitions")
    .select("id,nom,statut,roles_autorises,description,rappel_presence_active,heure_rappel_presence")
    .in("id", idsCompetitions);

  if (erreurCompetitions) return sbErreur(erreurCompetitions.message);

  const { data: joueursBruts, error: erreurJoueurs } = await supabaseClient
    .from("joueurs")
    .select("id,pseudo,roles,statut,discord_id,discord_username,discord_lie_a")
    .order("pseudo", { ascending: true });

  if (erreurJoueurs) return sbErreur(erreurJoueurs.message);

  const { data: presencesJour, error: erreurPresences } = await supabaseClient
    .from("presences")
    .select("id,competition_id,pseudo,statut,horaires_disponibles,date_competition,derniere_modification")
    .in("competition_id", idsCompetitions)
    .eq("date_competition", dateIso)
    .order("id", { ascending: true });

  if (erreurPresences) return sbErreur(erreurPresences.message);

  let rappelsJour = [];
  let lectureRappelsDisponible = true;

  const { data: rappelsData, error: erreurRappels } = await supabaseClient
    .from("rappels_presence_discord")
    .select("type_rappel,competition_id,date_competition,heure_programmee,statut,envoye_a,erreur,nb_joueurs,nb_mentions,nb_sans_discord,nb_messages,updated_at")
    .eq("type_rappel", SB_TYPE_RAPPEL_PRESENCES_SANS_REPONSE)
    .in("competition_id", idsCompetitions)
    .eq("date_competition", dateIso)
    .order("updated_at", { ascending: false });

  if (erreurRappels) {
    lectureRappelsDisponible = false;
  } else {
    rappelsJour = rappelsData || [];
  }

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
  const joueursResultat = await chargerJoueursSupabase();
  if (!joueursResultat.succes) return joueursResultat;

  const competitionsResultat = await chargerCompetitionsSupabase();
  if (!competitionsResultat.succes) return competitionsResultat;

  const joueurs = joueursResultat.joueurs;
  const competitions = competitionsResultat.competitions;

  let total = 0;
  let actifs = 0;
  let inactifs = 0;
  let suspendus = 0;
  let connectes7Jours = 0;
  let connectes30Jours = 0;
  let inactifs30Jours = 0;
  let jamaisConnectes = 0;

  const maintenant = new Date();

  joueurs.forEach(function (joueur) {
    total++;

    const statut = sbCle(joueur.statut);

    if (statut === "actif") actifs++;
    else if (statut === "inactif") inactifs++;
    else if (statut === "suspendu") suspendus++;

    if (!joueur.derniereConnexion) {
      jamaisConnectes++;
      return;
    }

    const dateConnexion = new Date(joueur.derniereConnexion);
    const differenceJours = Math.floor((maintenant - dateConnexion) / (1000 * 60 * 60 * 24));

    if (differenceJours <= 7) connectes7Jours++;
    if (differenceJours <= 30) connectes30Jours++;
    else inactifs30Jours++;
  });

  let ouvertes = 0;
  let brouillon = 0;
  let fermees = 0;
  let archivees = 0;

  competitions.forEach(function (competition) {
    const statut = sbNormaliserStatut(competition.statut);

    if (statut === "ouverte") ouvertes++;
    else if (statut === "brouillon") brouillon++;
    else if (statut === "fermee") fermees++;
    else if (statut === "archivee") archivees++;
  });

  return {
    succes: true,
    joueurs: {
      total: total,
      actifs: actifs,
      inactifs: inactifs,
      suspendus: suspendus,
      connectes7Jours: connectes7Jours,
      connectes30Jours: connectes30Jours,
      inactifs30Jours: inactifs30Jours,
      jamaisConnectes: jamaisConnectes
    },
    competitions: {
      ouvertes: ouvertes,
      brouillon: brouillon,
      fermees: fermees,
      archivees: archivees
    },
    competitionsListe: competitions
  };
}

async function chargerJournalActiviteSupabase() {
  const { data, error } = await supabaseClient
    .from("journal_activite")
    .select("date_heure,utilisateur,action,details")
    .order("date_heure", { ascending: false })
    .limit(50);

  if (error) return sbErreur(error.message);

  const lignesJournal = data || [];
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
  const { data, error } = await supabaseClient
    .from("joueurs")
    .select("pseudo, roles, statut, mot_de_passe")
    .ilike("pseudo", sbTexte(pseudo))
    .limit(1);

  if (error) {
    return {
      succes: false,
      message: error.message
    };
  }

  if (!data || data.length === 0) {
    return {
      succes: false,
      message: "Joueur introuvable."
    };
  }

  const joueur = data[0];

  if (sbCle(joueur.statut) !== "actif") {
    return {
      succes: false,
      message: "Ce compte n'est pas actif."
    };
  }

  const roles = sbRolesArray(joueur.roles);

  let motDePasseAttendu = joueur.mot_de_passe;

  if (!motDePasseAttendu) {
    if (roles.includes("superadmin")) {
      motDePasseAttendu = "superAD";
    } else if (roles.includes("officier")) {
      motDePasseAttendu = "offMPP";
    }
  }

  if (String(mdp) !== String(motDePasseAttendu)) {
    return {
      succes: false,
      message: "Mot de passe incorrect."
    };
  }

  return {
    succes: true,
    message: "Mot de passe validé."
  };
}

async function changerMotDePasseSupabase(pseudo, ancienMdp, nouveauMdp) {
  const verification = await verifierMotDePasseSupabase(pseudo, ancienMdp);

  if (!verification.succes) {
    return verification;
  }

  const { error } = await supabaseClient
    .from("joueurs")
    .update({
      mot_de_passe: String(nouveauMdp),
      mot_de_passe_modifie: true,
      derniere_modification: new Date().toISOString()
    })
    .ilike("pseudo", sbTexte(pseudo));

  if (error) {
    return {
      succes: false,
      message: error.message
    };
  }

  await sbJournaliser(
    pseudo,
    "Mot de passe modifié",
    "Mot de passe personnel modifié."
  );

  return {
    succes: true,
    message: "Mot de passe modifié avec succès."
  };
}

async function appliquerOuverturesFermeturesAutomatiquesSupabase() {
  const maintenant = new Date();

  const heureActuelle =
    String(maintenant.getHours()).padStart(2, "0") +
    ":" +
    String(maintenant.getMinutes()).padStart(2, "0");

  const dateAujourdHui =
    maintenant.getFullYear() +
    "-" +
    String(maintenant.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(maintenant.getDate()).padStart(2, "0");

  const { data: competitions, error } = await supabaseClient
    .from("competitions")
    .select(`
      *,
      dates_competition (
        date_competition
      )
    `)
    .eq("fermeture_auto_active", true);

  if (error) {
    return sbErreur(error.message);
  }

  for (const competition of competitions || []) {
    const dates = competition.dates_competition || [];

    if (dates.length === 0) {
      continue;
    }

    const datesISO = dates
      .map(function (date) {
        return sbFormatDateISO(date.date_competition);
      })
      .sort();

    const premiereDate = datesISO[0];
    const derniereDate = datesISO[datesISO.length - 1];

    if (dateAujourdHui < premiereDate || dateAujourdHui > derniereDate) {
      continue;
    }

    const heureOuverture = competition.heure_ouverture;
    const heureFermeture = competition.heure_fermeture;

    if (!heureOuverture || !heureFermeture) {
      continue;
    }

    const statutActuel = sbNormaliserStatut(competition.statut);

    let nouveauStatut = competition.statut;

    if (heureOuverture < heureFermeture) {
      if (heureActuelle >= heureOuverture && heureActuelle < heureFermeture) {
        nouveauStatut = "Ouverte";
      } else {
        nouveauStatut = "Fermée";
      }
    } else {
      if (heureActuelle >= heureOuverture || heureActuelle < heureFermeture) {
        nouveauStatut = "Ouverte";
      } else {
        nouveauStatut = "Fermée";
      }
    }

    if (sbNormaliserStatut(nouveauStatut) === statutActuel) {
      continue;
    }

    await supabaseClient
      .from("competitions")
      .update({
        statut: nouveauStatut,
        dernier_traitement_auto: dateAujourdHui
      })
      .eq("id", competition.id);

    await sbJournaliser(
      "Système automatique",
      "Statut modifié automatiquement",
      "Compétition : " + (competition.nom || "Compétition inconnue") +
        "\nNouveau statut : " + nouveauStatut
    );
  }

  return {
    succes: true,
    message: "Ouvertures/fermetures automatiques vérifiées."
  };
}

async function modifierCompetitionCompleteSupabase(config, utilisateur) {
  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut modifier une compétition."
    );
  }

  if (
    sbNormaliserStatut(config.statut) === "archivee" &&
    !sbEstSuperAdminPseudo(utilisateur)
  ) {
    return sbErreur(
      "Accès refusé : seul le Super Admin peut archiver une compétition."
    );
  }

  const rappelPresenceActive = !!config.rappelPresenceActive;
  const heureRappelPresence = sbHeureRappelPresenceOuNull(
    rappelPresenceActive,
    config.heureRappelPresence
  );

  if (rappelPresenceActive && !heureRappelPresence) {
    return sbErreur("Merci de renseigner une heure de rappel Discord des présences.");
  }

  const { error } = await supabaseClient
    .from("competitions")
    .update({
      nom: config.nom,
      statut: config.statut || "Brouillon",
      roles_autorises: config.rolesAutorises || "",
      description: config.description || "",

      fermeture_auto_active: !!config.fermetureAutoActive,
      heure_ouverture: config.heureOuvertureAuto || null,
      heure_fermeture: config.heureFermetureAuto || null,

      notification_presence_active: !!config.notificationPresenceActive,
      heure_notification_presence: config.heureNotificationPresence || null,

      rappel_presence_active: rappelPresenceActive,
      heure_rappel_presence: heureRappelPresence
    })
    .eq("id", Number(config.idCompetition));

  if (error) {
    return sbErreur(error.message);
  }

  await sbJournaliser(
    utilisateur,
    "Compétition modifiée",
    "Compétition : " +
      config.nom +
      "\nStatut : " +
      config.statut +
      "\nFermeture auto : " +
      (config.fermetureAutoActive ? "Oui" : "Non") +
      "\nNotification présences : " +
      (config.notificationPresenceActive ? "Oui" : "Non") +
      "\nRappel sans réponse : " +
      (rappelPresenceActive ? "Oui à " + heureRappelPresence : "Non")
  );

  return {
    succes: true,
    message: "Compétition modifiée."
  };
}
