/* ==========================================================
   MPP OPERATIONS CENTER
   Couche Supabase
   Version Alpha 0.4.0 - Migration complète Supabase
   ========================================================== */

/*
  IMPORTANT
  - Cette clé est une clé publique "publishable", prévue pour être utilisée côté navigateur.
  - Ne jamais mettre de clé "secret" / "service_role" dans ce fichier.
*/

const SUPABASE_URL = "https://icguokxqrnqdjafqvzyz.supabase.co";
const SUPABASE_KEY = "sb_publishable_Twp9mcx7CQdS_weNNUPtTQ_8V1s_Z_R";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ==========================================================
   OUTILS GÉNÉRAUX
   ========================================================== */

function sbTexte(valeur) {
  return String(valeur ?? "").trim();
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
    description: competition.description
  };
}

function sbJoueurObj(joueur) {
  return {
    id: joueur.id,
    pseudo: joueur.pseudo,
    roles: joueur.roles,
    statut: joueur.statut,
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

    case "genererTableauPresences":
      return genererTableauPresencesSupabase(parametres.idCompetition, parametres.utilisateur);

    case "genererExportCSV":
      return genererExportCSVSupabase(parametres.idCompetition, parametres.utilisateur);

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

    case "chargerJoueurs":
      return chargerJoueursSupabase();

    case "ajouterJoueur":
      return ajouterJoueurSupabase(
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.utilisateur
      );

    case "modifierJoueur":
      return modifierJoueurSupabase(
        parametres.idJoueur,
        parametres.pseudo,
        parametres.roles,
        parametres.statut,
        parametres.utilisateur
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

    case "verifierMotDePasseOfficier":
    case "verifierMotDePasseSuperAdmin":
      return { succes: true, message: "Accès autorisé par rôle Supabase." };

    default:
      return sbErreur("Action Supabase inconnue : " + action);
  }
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

async function ajouterJoueurSupabase(pseudo, roles, statut, utilisateur) {

  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut ajouter un joueur."
    );
  }

  const rolesDemandes = sbTexte(roles);

  if (
    rolesDemandes.toLowerCase().includes("superadmin") &&
    !sbEstSuperAdminPseudo(utilisateur)
  ) {
    return sbErreur(
      "Accès refusé : seul un Super Admin peut attribuer le rôle SuperAdmin."
    );
  }

  const { data, error } = await supabaseClient
    .from("joueurs")
    .insert([{
      pseudo: sbTexte(pseudo),
      roles: rolesDemandes || "Soldat",
      statut: sbTexte(statut) || "Actif"
    }])
    .select()
    .single();

  if (error) return sbErreur(error.message);

  await sbJournaliser(
    utilisateur,
    "Ajout joueur",
    "Pseudo : " + pseudo + " | Rôles : " + rolesDemandes
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
  utilisateur
) {

  if (
    !sbEstSuperAdminPseudo(utilisateur) &&
    !(await sbUtilisateurEstOfficier(utilisateur))
  ) {
    return sbErreur(
      "Accès refusé : seul un officier peut modifier un joueur."
    );
  }

  const rolesDemandes = sbTexte(roles);

  if (
    rolesDemandes.toLowerCase().includes("superadmin") &&
    !sbEstSuperAdminPseudo(utilisateur)
  ) {
    return sbErreur(
      "Accès refusé : seul un Super Admin peut attribuer le rôle SuperAdmin."
    );
  }

  const { error } = await supabaseClient
    .from("joueurs")
    .update({
      pseudo: sbTexte(pseudo),
      roles: rolesDemandes,
      statut: sbTexte(statut),
      derniere_modification: new Date().toISOString()
    })
    .eq("id", Number(idJoueur));

  if (error) return sbErreur(error.message);

  await sbJournaliser(
    utilisateur,
    "Modification joueur",
    "ID " + idJoueur + " | Nouveau pseudo : " + pseudo
  );

  return {
    succes: true,
    message: "Joueur modifié."
  };
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
    .select("id,date_competition")
    .eq("competition_id", idComp)
    .ilike("pseudo", pseudoOfficiel);

  if (erreurExistantes) return sbErreur(erreurExistantes.message);

  const indexExistantes = new Set(
    (existantes || []).map(function (p) {
      return sbFormatDateISO(p.date_competition);
    })
  );

  let ajouts = 0;
  let modifications = 0;

  lignes.forEach(function (ligne) {
    if (indexExistantes.has(ligne.date_competition)) {
      modifications++;
    } else {
      ajouts++;
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

  await sbJournaliser(
    pseudoOfficiel,
    "Sauvegarde présences",
    "Compétition ID " + idCompetition + " | Ajouts : " + ajouts + " | Modifications : " + modifications
  );

  return {
    succes: true,
    message: "Présences sauvegardées.",
    ajouts: ajouts,
    modifications: modifications
  };
}

async function creerCompetitionCompleteSupabase(config, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur) && !(await sbUtilisateurEstOfficier(utilisateur))) {
    return sbErreur("Accès refusé : seul un officier peut créer une compétition.");
  }

  const { data: competition, error } = await supabaseClient
    .from("competitions")
    .insert([{
      nom: config.nom,
      statut: config.statut || "Brouillon",
      cree_par: utilisateur || "Inconnu",
      roles_autorises: config.rolesAutorises || "",
      description: config.description || ""
    }])
    .select()
    .single();

  if (error) return sbErreur(error.message);

  const lignesDates = (config.dates || []).map(function (dateCompetition) {
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

    if (erreurDates) return sbErreur(erreurDates.message);
  }

  await sbJournaliser(
    utilisateur,
    "Création compétition complète",
    "ID " + competition.id + " | Nom : " + config.nom + " | Dates : " + lignesDates.length
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

  await sbJournaliser(
    utilisateur,
    "Modification statut compétition",
    "Compétition ID " + idCompetition + " | Nouveau : " + nouveauStatut
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

  await sbJournaliser(utilisateur, "Ajout date compétition", "Compétition ID " + idCompetition + " | Date : " + dateCompetition);

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

  const { error } = await supabaseClient
    .from("dates_competition")
    .delete()
    .eq("id", Number(idDate));

  if (error) return sbErreur(error.message);

  await sbJournaliser(utilisateur, "Suppression date compétition", "Date ID " + idDate);

  return {
    succes: true,
    message: "Date supprimée."
  };
}

async function supprimerCompetitionSupabase(idCompetition, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur)) {
    return sbErreur("Accès refusé : seul le Super Admin peut supprimer une compétition.");
  }

  const { error } = await supabaseClient
    .from("competitions")
    .delete()
    .eq("id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  await sbJournaliser(utilisateur, "Suppression compétition", "Compétition ID " + idCompetition);

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

async function genererTableauPresencesSupabase(idCompetition, utilisateur) {
  if (!sbEstSuperAdminPseudo(utilisateur) && !(await sbUtilisateurEstOfficier(utilisateur))) {
    return sbErreur("Accès refusé : seul un officier peut consulter ce tableau.");
  }

  const datesResultat = await chargerDatesCompetitionSupabase(idCompetition);
  if (!datesResultat.succes) return datesResultat;

  const joueursResultat = await chargerJoueursSupabase();
  if (!joueursResultat.succes) return joueursResultat;

  const { data: presences, error } = await supabaseClient
    .from("presences")
    .select("*")
    .eq("competition_id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  const indexPresences = {};

  (presences || []).forEach(function (presence) {
    const cle = sbCle(presence.pseudo) + "|" + sbFormatDateFR(presence.date_competition);
    indexPresences[cle] = {
      statut: presence.statut || "Non renseigné",
      horairesDisponibles: presence.horaires_disponibles || ""
    };
  });

  const joueursActifs = joueursResultat.joueurs.filter(function (joueur) {
    return sbCle(joueur.statut) === "actif";
  });

  const lignes = joueursActifs.map(function (joueur) {
    const disponibilites = datesResultat.dates.map(function (dateInfo) {
      const cle = sbCle(joueur.pseudo) + "|" + dateInfo.dateCompetition;
      const presence = indexPresences[cle] || {
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
    lignes: lignes
  };
}

async function genererExportCSVSupabase(idCompetition, utilisateur) {
  const resultat = await genererTableauPresencesSupabase(idCompetition, utilisateur);
  if (!resultat.succes) return resultat;

  let csv = "Joueur;Roles;Synthese;" + resultat.dates.map(function (d) {
    return d.dateAffichage;
  }).join(";") + "\n";

  resultat.lignes.forEach(function (ligne) {
    const statuts = ligne.disponibilites.map(function (d) {
      return d.statut;
    });

    csv += [ligne.pseudo, ligne.roles, ligne.synthese]
      .concat(statuts)
      .join(";") + "\n";
  });

  return {
    succes: true,
    csv: csv
  };
}

async function chargerJoueursSansReponseSupabase(idCompetition) {
  const joueursResultat = await chargerJoueursSupabase();
  if (!joueursResultat.succes) return joueursResultat;

  const { data, error } = await supabaseClient
    .from("presences")
    .select("pseudo")
    .eq("competition_id", Number(idCompetition));

  if (error) return sbErreur(error.message);

  const repondants = new Set(
    (data || []).map(function (presence) {
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
    .select("*")
    .order("date_heure", { ascending: false })
    .limit(50);

  if (error) return sbErreur(error.message);

  return {
    succes: true,
    journal: (data || []).map(function (ligne) {
      return {
        dateHeure: ligne.date_heure
          ? new Date(ligne.date_heure).toLocaleString("fr-FR")
          : "",
        utilisateur: ligne.utilisateur,
        action: ligne.action,
        details: ligne.details
      };
    })
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

async function changerMotDePasseSupabase(
  pseudo,
  ancienMdp,
  nouveauMdp
)