/* ==========================================================
   MPP OPERATIONS CENTER
   Frontend JavaScript optimisé
   Version Alpha 0.6.3 - Supabase
   ========================================================== */

const VERSION_SITE = "Alpha 0.6.3 - Supabase";
let utilisateurConnecte = null;
let accesOfficierValide = false;
let cacheFrontend = {
  competitions: null,
  competitionComplete: {},
  tableauPresences: {},
  donneesOfficierInitiales: null,
  timestamp: {}
};

const DUREE_CACHE_FRONT_MS = 5 * 60 * 1000;

window.onload = async function () {
  await appliquerOuverturesFermeturesAutomatiquesSupabase();
  afficherConnexion();
  afficherVersionSite();
};

function estCacheValide(cle) {
  return cacheFrontend.timestamp[cle] && Date.now() - cacheFrontend.timestamp[cle] < DUREE_CACHE_FRONT_MS;
}

function mettreEnCache(cle, valeur) {
  cacheFrontend[cle] = valeur;
  cacheFrontend.timestamp[cle] = Date.now();
}

function viderCacheFrontend() {
  cacheFrontend = {
    competitions: null,
    competitionComplete: {},
    tableauPresences: {},
    donneesOfficierInitiales: null,
    timestamp: {}
  };
}

function escapeHTML(valeur) {
  return String(valeur ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jsString(valeur) {
  return String(valeur ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function definirModeCarte(mode) {
  const app = document.getElementById("app");
  if (!app) return;
  app.classList.remove("mode-large");
  if (mode === "large") app.classList.add("mode-large");
}

function setContenu(html) {
  document.getElementById("contenu").innerHTML = html;
}

function afficherChargement(titre, texte = "Chargement...") {
  setContenu(`<div class="form-zone"><h2>${escapeHTML(titre)}</h2><p>${escapeHTML(texte)}</p></div>`);
}

function afficherErreur(message, boutonRetourHTML = "") {
  setContenu(`<div class="form-zone"><h2>Erreur</h2><p class="error">${escapeHTML(message)}</p>${boutonRetourHTML}</div>`);
}

function afficherVersionSite() {
  const elementVersion = document.getElementById("version-site");
  if (elementVersion) elementVersion.textContent = "Version " + VERSION_SITE;
}

function afficherConnexion() {
  definirModeCarte("normal");
  setContenu(`
    <div class="form-zone">
      <label for="pseudo">Pseudo World of Tanks</label>
      <input type="text" id="pseudo" placeholder="Ex : Raiju153" onkeydown="if(event.key==='Enter'){connexion();}">
      <button onclick="connexion()">ACCÈS OPÉRATIONNEL</button>
      <p id="message"></p>
    </div>
  `);
}

async function connexion() {
  const pseudo = document.getElementById("pseudo").value.trim();
  const message = document.getElementById("message");

  if (pseudo === "") {
    message.textContent = "Merci de saisir un pseudo.";
    message.style.color = "#ff5555";
    return;
  }

  message.textContent = "Connexion en cours...";
  message.style.color = "#CFCFCF";

  try {
    const data = await identifierUtilisateurSupabase(pseudo);

    if (!data.succes) {
      message.textContent = data.message;
      message.style.color = "#ff5555";
      return;
    }

    utilisateurConnecte = data;
    accesOfficierValide = false;

    if (estOfficierConnecte() || estSuperAdminConnecte()) {
      afficherDemandeMotDePasseOfficier();
    } else {
      afficherCompetitionsJoueur();
    }

  } catch (erreur) {
    console.error("Erreur connexion :", erreur);

    message.textContent = "Erreur lors de la connexion.";
    message.style.color = "#ff5555";
  }
}


function deconnexion() {
  utilisateurConnecte = null;
  accesOfficierValide = false;
  viderCacheFrontend();
  afficherConnexion();
}

function afficherChoixOfficier() {
  definirModeCarte("normal");
  setContenu(`
    <div class="form-zone">
      <h2>Bonjour ${escapeHTML(utilisateurConnecte.joueur.pseudo)}</h2>
      <p>Que souhaites-tu faire ?</p>
      <button onclick="afficherCompetitionsJoueur()">Remplir mes présences</button>
      <button onclick="afficherEspaceOfficier()" class="secondary-button">Accéder à l’espace officier</button>
	  <button onclick="afficherChangerMotDePasse()"
class="secondary-button">
🔑 Changer mon mot de passe
</button>
      <p class="small-link" onclick="deconnexion()">Déconnexion</p>
    </div>
  `);
}


function afficherCompetitionsJoueur() {
  definirModeCarte("normal");
  afficherChargement("Compétitions disponibles");

  chargerCompetitionsAvecCache(function (data) {
    if (!data.succes) {
      return afficherErreur(data.message);
    }

    let html = `<div class="form-zone"><h2>Compétitions disponibles</h2>`;
    let nbVisibles = 0;

    data.competitions.forEach(function (competition) {
      if (!peutVoirCompetition(competition)) {
        return;
      }

      nbVisibles++;

      html += `
        <div class="competition-card">
          <h3>${escapeHTML(competition.nom)}</h3>
          <p>Statut : ${escapeHTML(competition.statut)}</p>
          <p>${escapeHTML(competition.description || "")}</p>

          ${
            peutRemplirCompetition(competition)
              ? `
                <button onclick="ouvrirCompetition(${Number(competition.id)}, '${jsString(competition.nom)}', true)">
                  Ouvrir
                </button>
              `
              : `
                <button onclick="ouvrirCompetition(${Number(competition.id)}, '${jsString(competition.nom)}', false)" class="secondary-button">
                  Consulter
                </button>
              `
          }
        </div>
      `;
    });

    if (nbVisibles === 0) {
      html += `<p>Aucune compétition disponible.</p>`;
    }

    html += `<p class="small-link" onclick="deconnexion()">Déconnexion</p></div>`;
    setContenu(html);
  });
}

function chargerCompetitionsAvecCache(callback) {
  if (cacheFrontend.competitions && estCacheValide("competitions")) {
    callback(cacheFrontend.competitions);
    return;
  }
  appelAPI("chargerCompetitions", {}, function (data) {
    mettreEnCache("competitions", data);
    callback(data);
  });
}

function ouvrirCompetition(idCompetition, nomCompetition, peutModifier = true) {
  definirModeCarte("normal");
  afficherChargement(nomCompetition, "Chargement des dates et de tes réponses...");

  const pseudo = utilisateurConnecte.joueur.pseudo;
  const cleCache = "competitionComplete_" + idCompetition + "_" + pseudo.toLowerCase();

  if (cacheFrontend.competitionComplete[cleCache] && estCacheValide(cleCache)) {
    const dataCache = cacheFrontend.competitionComplete[cleCache];
    afficherFormulairePresences(
      idCompetition,
      nomCompetition,
      dataCache.dates,
      dataCache.presences,
      peutModifier && dataCache.peutRemplir !== false
    );
    return;
  }

  appelAPI("chargerCompetitionComplete", { idCompetition, pseudo }, function (data) {
    if (!data.succes) {
      return afficherErreur(data.message);
    }

    cacheFrontend.competitionComplete[cleCache] = data;
    cacheFrontend.timestamp[cleCache] = Date.now();

    afficherFormulairePresences(
      idCompetition,
      nomCompetition,
      data.dates,
      data.presences,
      peutModifier && data.peutRemplir !== false
    );
  });
}



function afficherFormulairePresences(idCompetition, nomCompetition, dates, presencesExistantes, peutModifier = true) {
  definirModeCarte("normal");

  let html = `
    <div class="form-zone">
      <h2>${escapeHTML(nomCompetition)}</h2>
      <p>Pseudo : ${escapeHTML(utilisateurConnecte.joueur.pseudo)}</p>
  `;

  if (!peutModifier) {
    html += `
      <div class="recap-box">
        <p>Consultation uniquement : cette compétition n'est pas ouverte à la modification.</p>
      </div>
    `;
  }

  if (dates.length === 0) {
    html += `<p>Aucune date définie pour cette compétition.</p>`;
  }

  const indexPresences = {};
  presencesExistantes.forEach(function (presence) {
    indexPresences[String(presence.dateCompetition).trim()] = presence;
  });

  dates.forEach(function (date) {
    const dateTexte = String(date.dateCompetition).trim();
    const presence = indexPresences[dateTexte] || {};
    const statutActuel = presence.statut || "Non renseigné";
    const horairesActuels = String(presence.horairesDisponibles || "")
      .split(",")
      .map(h => h.trim())
      .filter(Boolean);
    const horaires = String(date.horaires || "")
      .split(",")
      .map(h => h.trim())
      .filter(Boolean);

    const disabled = peutModifier ? "" : "disabled";

    html += `
      <div class="date-card">
        <h3>${escapeHTML(date.dateAffichage || dateTexte)}</h3>

        <select class="select-statut" data-date="${escapeHTML(dateTexte)}" onchange="gererAffichageHoraires(this)" ${disabled}>
          <option value="Non renseigné" ${statutActuel === "Non renseigné" ? "selected" : ""}>⚪ Non renseigné</option>
          <option value="Présent" ${statutActuel === "Présent" ? "selected" : ""}>🟢 Présent</option>
          <option value="Absent" ${statutActuel === "Absent" ? "selected" : ""}>🔴 Absent</option>
          <option value="Remplaçant" ${statutActuel === "Remplaçant" ? "selected" : ""}>🔵 Remplaçant</option>
        </select>

        <div class="horaires-zone" style="${statutActuel === "Présent" || statutActuel === "Remplaçant" ? "" : "display:none;"}">
          <p>Créneaux disponibles :</p>
          <div class="horaires-selection">
    `;

    if (horaires.length === 0) {
      html += `<p>Aucun horaire défini pour cette date.</p>`;
    }

    horaires.forEach(function (horaire) {
      html += `
        <label class="checkbox-role">
          <input type="checkbox" class="horaire-checkbox" value="${escapeHTML(horaire)}" ${horairesActuels.includes(horaire) ? "checked" : ""} ${disabled}>
          ${escapeHTML(horaire)}
        </label>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  if (peutModifier) {
    html += `
      <button onclick="afficherRecapitulatif(${idCompetition}, '${jsString(nomCompetition)}')">
        Vérifier mes réponses
      </button>
    `;
  }

  html += `
      <button onclick="afficherCompetitionsJoueur()" class="secondary-button">
        Retour
      </button>
    </div>
  `;

  setContenu(html);
}



function gererAffichageHoraires(selectElement) {
  const dateCard = selectElement.closest(".date-card");
  const horairesZone = dateCard.querySelector(".horaires-zone");
  if (!horairesZone) return;
  if (selectElement.value === "Présent" || selectElement.value === "Remplaçant") {
	horairesZone.style.display = "";
  }
  else {
    horairesZone.style.display = "none";
    horairesZone.querySelectorAll(".horaire-checkbox").forEach(c => c.checked = false);
  }
}

function afficherRecapitulatif(idCompetition, nomCompetition) {
  const selects = document.querySelectorAll(".select-statut");
  const presences = [];
  let nbPresent = 0, nbAbsent = 0, nbRemplacant = 0, nbNonRenseigne = 0;

  selects.forEach(function (select) {
    const dateCard = select.closest(".date-card");
    const dateCompetition = select.dataset.date;
    const statut = select.value;
    let horairesDisponibles = [];
    if (statut === "Présent" || statut === "Remplaçant") {
      dateCard.querySelectorAll(".horaire-checkbox").forEach(function (caseHoraire) {
        if (caseHoraire.checked) horairesDisponibles.push(caseHoraire.value);
      });
    }
    presences.push({ dateCompetition, statut, horairesDisponibles: horairesDisponibles.join(",") });
    if (statut === "Présent") nbPresent++;
    else if (statut === "Absent") nbAbsent++;
    else if (statut === "Remplaçant") nbRemplacant++;
    else nbNonRenseigne++;
  });

  let html = `<div class="form-zone"><h2>Vérification</h2><p>${escapeHTML(nomCompetition)}</p><div class="recap-box">`;
  presences.forEach(function (presence) {
    let texteHoraires = "";
    if (presence.statut === "Présent" || presence.statut === "Remplaçant") texteHoraires = presence.horairesDisponibles ? ` — Horaires : ${escapeHTML(presence.horairesDisponibles)}` : " — Aucun horaire sélectionné";
    html += `<p><strong>${escapeHTML(presence.dateCompetition)}</strong> → ${escapeHTML(presence.statut)}${texteHoraires}</p>`;
  });
  html += `</div><div class="recap-box"><p>🟢 Présent : ${nbPresent}</p><p>🔴 Absent : ${nbAbsent}</p><p>🔵 Remplaçant : ${nbRemplacant}</p><p>⚪ Non renseigné : ${nbNonRenseigne}</p></div>
    <button onclick='confirmerPresences(${idCompetition}, ${JSON.stringify(JSON.stringify(presences))})'>Confirmer</button>
    <button onclick="ouvrirCompetition(${idCompetition}, '${jsString(nomCompetition)}', true)" class="secondary-button">Modifier</button></div>`;
  setContenu(html);
}

function confirmerPresences(idCompetition, presencesJSON) {
  const presences = JSON.parse(presencesJSON);
  const pseudo = utilisateurConnecte.joueur.pseudo;
  afficherChargement("Sauvegarde en cours...", "Merci de patienter.");
  appelAPI("sauvegarderPresences", { idCompetition, pseudo, presences: JSON.stringify(presences) }, function (data) {
    if (!data.succes) return afficherErreur(data.message, `<button onclick="ouvrirCompetition(${idCompetition}, 'Compétition', true)">Retour</button>`);
    viderCacheFrontend();
    setContenu(`<div class="form-zone"><h2>Disponibilités enregistrées ✅</h2><p>${escapeHTML(data.message)}</p><p>Ajouts : ${data.ajouts}</p><p>Modifications : ${data.modifications}</p><button onclick="afficherCompetitionsJoueur()">Retour aux compétitions</button></div>`);
  });
}

function verifierAccesOfficier() {
  const message = document.getElementById("message");
  const champMotDePasse = document.getElementById("mdpOfficier");
  const motDePasse = champMotDePasse ? champMotDePasse.value : "";

  if (!estOfficierConnecte() && !estSuperAdminConnecte()) {
    afficherMessageModal(
      "Accès refusé",
      "Ton compte n'a pas le rôle Officier."
    );
    return;
  }

  if (!motDePasse) {
    if (message) {
      message.textContent = "Merci de saisir le mot de passe.";
      message.style.color = "#ff5555";
    }
    return;
  }

  if (message) {
    message.textContent = "Vérification du mot de passe...";
    message.style.color = "#CFCFCF";
  }

  verifierMotDePasseSupabase(
    utilisateurConnecte.joueur.pseudo,
    motDePasse
  )
    .then(function (data) {
      if (!data.succes) {
        if (message) {
          message.textContent = data.message;
          message.style.color = "#ff5555";
        }
        return;
      }

      accesOfficierValide = true;
      afficherChoixOfficier();
    })
    .catch(function (erreur) {
      if (message) {
        message.textContent = "Impossible de vérifier le mot de passe.";
        message.style.color = "#ff5555";
      }

      console.error("Erreur vérification mot de passe", erreur);
    });
}

function afficherEspaceOfficier() {
  definirModeCarte("large");

  if (!accesOfficierValide) {
    afficherDemandeMotDePasseOfficier();
    return;
  }

  if (
    cacheFrontend.donneesOfficierInitiales &&
    estCacheValide("donneesOfficierInitiales")
  ) {
    console.log("📦 Tableau de bord chargé depuis le cache");
    construireTableauDeBordOfficier(cacheFrontend.donneesOfficierInitiales);
    return;
  }

  afficherChargement("Tableau de bord officier");

  appelAPI(
    "chargerDonneesOfficierInitiales",
    {},
    function (data) {
      if (!data.succes) {
        afficherMessageModal(
          "Erreur",
          data.message || "Impossible de charger le tableau de bord."
        );
        return;
      }

      mettreEnCache("donneesOfficierInitiales", data);
      construireTableauDeBordOfficier(data);
    }
  );
}

function construireTableauDeBordOfficier(data) {
  definirModeCarte("large");

  const boutonsSuperAdmin = estSuperAdminConnecte()
    ? `
        <button class="secondary-button" onclick="afficherGestionJoueurs()">
          👥 Gérer les joueurs
        </button>

        <button class="secondary-button" onclick="afficherJournalActivite()">
          📜 Journal d'activité
        </button>
      `
    : "";

  setContenu(`
    <div class="form-zone">
      <h2>Tableau de bord officier</h2>

      <p>
        Connecté en tant que :
        ${escapeHTML(utilisateurConnecte.joueur.pseudo)}
      </p>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <h3>👥 Joueurs</h3>
          <p>Total : ${data.joueurs.total}</p>
          <p>🟢 Actifs : ${data.joueurs.actifs}</p>
          <p>⚪ Inactifs : ${data.joueurs.inactifs}</p>
          <p>🔴 Suspendus : ${data.joueurs.suspendus}</p>
        </div>

        <div class="dashboard-card">
          <h3>📡 Activité</h3>
          <p>Connectés ≤ 7 jours : ${data.joueurs.connectes7Jours}</p>
          <p>Connectés ≤ 30 jours : ${data.joueurs.connectes30Jours}</p>
          <p>Inactifs > 30 jours : ${data.joueurs.inactifs30Jours}</p>
          <p>Jamais connectés : ${data.joueurs.jamaisConnectes}</p>
        </div>

        <div class="dashboard-card">
          <h3>🏆 Compétitions</h3>
          <p>🟢 Ouvertes : ${data.competitions.ouvertes}</p>
          <p>🟠 Brouillons : ${data.competitions.brouillon}</p>
          <p>🔒 Fermées : ${data.competitions.fermees}</p>
          <p>📦 Archivées : ${data.competitions.archivees}</p>
        </div>
      </div>

      <div class="table-actions">
        <button onclick="afficherSelectionCompetitionOfficier()">
          👥 Consulter les présences
        </button>

        <button class="secondary-button" onclick="afficherGestionCompetitions()">
          📅 Gérer les compétitions
        </button>

        ${boutonsSuperAdmin}
      </div>

      <button onclick="afficherChoixOfficier()" class="secondary-button">
        Retour
      </button>
    </div>
  `);
}

function afficherSelectionCompetitionOfficier() {
  definirModeCarte("large");
  afficherChargement("Choisir une compétition", "Chargement des compétitions...");

  chargerCompetitionsAvecCache(function (data) {
    if (!data.succes) {
      return afficherErreur(data.message, `<button onclick="afficherEspaceOfficier()">Retour</button>`);
    }

    let html = `<div class="form-zone"><h2>Choisir une compétition</h2>`;
    let nbVisibles = 0;

    data.competitions.forEach(function (competition) {
      if (!peutVoirCompetition(competition)) {
        return;
      }

      nbVisibles++;
      const descriptionCompetition = competition.description
        ? `<p class="competition-description">${escapeHTML(competition.description)}</p>`
        : "";

      html += `
        <div class="competition-card">
          <div class="competition-card-header">
            <h3>${escapeHTML(competition.nom)}</h3>
            <div class="competition-status-line">
              ${badgeStatutCompetitionHTML(competition.statut)}
            </div>
          </div>
          ${descriptionCompetition}
          <button onclick="afficherTableauPresencesOfficier(${Number(competition.id)}, '${jsString(competition.nom)}')">
            Voir les présences
          </button>
        </div>
      `;
    });

    if (nbVisibles === 0) {
      html += `<p>Aucune compétition visible.</p>`;
    }

    html += `<button onclick="afficherEspaceOfficier()" class="secondary-button">Retour</button></div>`;
    setContenu(html);
  });
}



function afficherTableauPresencesOfficier(idCompetition, nomCompetition) {
  definirModeCarte("large");
  afficherChargement(nomCompetition, "Chargement du tableau...");

  appelAPI(
    "genererTableauPresences",
    {
      idCompetition,
      utilisateur: utilisateurConnecte.joueur.pseudo
    },
    function (data) {
      if (!data.succes) {
        return afficherErreur(data.message);
      }

      construireTableauPresencesOfficier(
        idCompetition,
        nomCompetition,
        data
      );
    }
  );
}

function construireTableauPresencesOfficier(idCompetition, nomCompetition, data) {
  function convertirDateFRVersDate(dateTexte) {
    const texte = String(dateTexte || "").trim();

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(texte)) {
      const morceaux = texte.split("/");
      return new Date(
        Number(morceaux[2]),
        Number(morceaux[1]) - 1,
        Number(morceaux[0])
      );
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) {
      const morceaux = texte.split("-");
      return new Date(
        Number(morceaux[0]),
        Number(morceaux[1]) - 1,
        Number(morceaux[2])
      );
    }

    return new Date(texte);
  }

  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0);

  const dateLimiteEffectifHoraire = new Date(aujourdHui);
  dateLimiteEffectifHoraire.setDate(dateLimiteEffectifHoraire.getDate() + 3);

  const datesVisibles = data.dates.filter(function (dateInfo) {
    const dateCompetition = convertirDateFRVersDate(dateInfo.dateCompetition);
    dateCompetition.setHours(0, 0, 0, 0);

    return dateCompetition >= aujourdHui;
  });

  const lignesVisibles = data.lignes.map(function (ligne) {
    return {
      ...ligne,
      disponibilites: ligne.disponibilites.filter(function (dispo) {
        return datesVisibles.some(function (dateInfo) {
          return dateInfo.dateCompetition === dispo.dateCompetition;
        });
      })
    };
  });

  const stats = calculerStatistiquesTableau(lignesVisibles);
  const statsParDate = calculerStatistiquesParDate(datesVisibles, lignesVisibles);
  const effectifParHoraire = calculerEffectifParHoraire(datesVisibles, lignesVisibles);

  const afficherEffectifParHoraire = datesVisibles.some(function (date) {
    return String(date.horaires || "")
      .split(",")
      .map(h => h.trim())
      .filter(Boolean).length > 1;
  });

  const nbDatesFuturesLointaines = effectifParHoraire.filter(function (dateInfo) {
    const dateCompetition = convertirDateFRVersDate(dateInfo.dateCompetition);
    dateCompetition.setHours(0, 0, 0, 0);

    return dateCompetition > dateLimiteEffectifHoraire;
  }).length;

  const nbDatesFuturesLointainesEffectifDate = statsParDate.filter(function (dateInfo) {
    const dateCompetition = convertirDateFRVersDate(dateInfo.dateCompetition);
    dateCompetition.setHours(0, 0, 0, 0);

    return dateCompetition > dateLimiteEffectifHoraire;
  }).length;

  let html = `
    <div class="form-zone">
      <h2>Visualisation des présences</h2>
      <p class="table-subtitle">${escapeHTML(nomCompetition || "Compétition")}</p>

      <div class="stats-box">
        <h3>Statistiques générales</h3>
        <p>🟢 Présents : ${stats.presents}</p>
        <p>🔵 Remplaçants : ${stats.remplacants}</p>
        <p>🔴 Absents : ${stats.absents}</p>
        <p>⚪ Non renseignés : ${stats.nonRenseignes}</p>
        <p><strong>Taux de réponse : ${stats.tauxReponse}%</strong></p>
      </div>
  `;

  if (afficherEffectifParHoraire) {
    html += `
      <div class="stats-box">
        <h3>📊 Effectif par horaire</h3>
    `;

    effectifParHoraire.forEach(function (dateInfo) {
      const dateCompetition = convertirDateFRVersDate(dateInfo.dateCompetition);
      dateCompetition.setHours(0, 0, 0, 0);

      const estDateLointaine = dateCompetition > dateLimiteEffectifHoraire;

      html += `
        <div
          class="horaire-date-block ${estDateLointaine ? "effectif-horaire-lointain" : ""}"
          style="${estDateLointaine ? "display:none;" : ""}"
        >
          <h4>${escapeHTML(dateInfo.dateAffichage)}</h4>
          <div class="table-container">
            <table class="presence-table horaire-table">
              <thead>
                <tr>
                  <th>Horaire</th>
                  <th>🟢 Présents</th>
                  <th>🔵 Remplaçants</th>
                  <th>🔴 Absents</th>
                  <th>⚪ Sans réponse</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (dateInfo.horaires.length === 0) {
        html += `<tr><td colspan="5">Aucun horaire défini pour cette date.</td></tr>`;
      }

      dateInfo.horaires.forEach(function (h) {
        html += `
          <tr>
            <td>${escapeHTML(h.horaire)}</td>
            <td>${h.presents}</td>
            <td>${h.remplacants}</td>
            <td>${h.absents}</td>
            <td>${h.nonRenseignes}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    if (nbDatesFuturesLointaines > 0) {
      html += `
        <button
          id="boutonAfficherAutresDatesEffectifHoraire"
          onclick="afficherAutresDatesEffectifHoraire()"
          class="secondary-button"
        >
          Afficher les autres dates (${nbDatesFuturesLointaines})
        </button>
      `;
    }

    html += `</div>`;
  }

  html += `
    <div class="stats-box">
      <h3>Effectif par date</h3>

      <div class="table-container">
        <table class="presence-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>🟢 Présents</th>
              <th>🔵 Remplaçants</th>
              <th>🔴 Absents</th>
              <th>⚪ Sans réponse</th>
            </tr>
          </thead>
          <tbody>
  `;

  statsParDate.forEach(function (s) {
    const dateCompetition = convertirDateFRVersDate(s.dateCompetition);
    dateCompetition.setHours(0, 0, 0, 0);

    const estDateLointaine = dateCompetition > dateLimiteEffectifHoraire;

    html += `
      <tr
        class="${estDateLointaine ? "effectif-date-lointain" : ""}"
        style="${estDateLointaine ? "display:none;" : ""}"
      >
        <td>${escapeHTML(s.dateAffichage)}</td>
        <td>${s.presents}</td>
        <td>${s.remplacants}</td>
        <td>${s.absents}</td>
        <td>${s.nonRenseignes}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
  `;

  if (nbDatesFuturesLointainesEffectifDate > 0) {
    html += `
      <button
        id="boutonAfficherAutresDatesEffectifDate"
        onclick="afficherAutresDatesEffectifDate()"
        class="secondary-button"
      >
        Afficher les autres dates (${nbDatesFuturesLointainesEffectifDate})
      </button>
    `;
  }

  html += `
    </div>

    <div class="table-container">
      <table class="presence-table">
        <thead>
          <tr>
            <th>Joueur</th>
  `;

  datesVisibles.forEach(function (date) {
    html += `
      <th class="date-header" title="${escapeHTML(date.dateCompetition)}">
        <div class="date-jour">${escapeHTML(date.jourCourt || "")}</div>
        <div class="date-numero">${escapeHTML(date.jourNumero || date.dateCompetition)}</div>
        <div class="date-mois">${escapeHTML(date.moisCourt || "")}</div>
      </th>
    `;
  });

  html += `
            <th>Synthèse</th>
          </tr>
        </thead>
        <tbody>
  `;

  lignesVisibles.forEach(function (ligne) {
    html += `<tr><td>${escapeHTML(ligne.pseudo)}</td>`;

    ligne.disponibilites.forEach(function (dispo) {
      html += `
        <td onclick='afficherDetailPresence(${JSON.stringify(JSON.stringify(ligne.pseudo))}, ${JSON.stringify(JSON.stringify(dispo))})'>
          ${formaterAffichagePresence(dispo)}
        </td>
      `;
    });

    html += `<td>${escapeHTML(ligne.synthese)}</td></tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>

    <div class="table-actions">
      <button onclick="chargerSansReponse(${idCompetition}, '${jsString(nomCompetition)}')" class="secondary-button">
        Voir les sans réponse
      </button>

      <button onclick="afficherSelectionCompetitionOfficier()" class="secondary-button">
        Retour
      </button>
    </div>
  </div>
  `;

  setContenu(html);
}

function afficherAutresDatesEffectifHoraire() {
  const blocs = document.querySelectorAll(".effectif-horaire-lointain");
  const bouton = document.getElementById("boutonAfficherAutresDatesEffectifHoraire");

  let auMoinsUnBlocMasque = false;

  blocs.forEach(function (bloc) {
    if (bloc.style.display === "none") {
      auMoinsUnBlocMasque = true;
    }
  });

  blocs.forEach(function (bloc) {
    bloc.style.display = auMoinsUnBlocMasque ? "" : "none";
  });

  if (bouton) {
    bouton.textContent = auMoinsUnBlocMasque
      ? "Masquer les autres dates"
      : "Afficher les autres dates (" + blocs.length + ")";
  }
}

function afficherAutresDatesEffectifDate() {

  const lignes =
    document.querySelectorAll(".effectif-date-lointain");

  const bouton =
    document.getElementById(
      "boutonAfficherAutresDatesEffectifDate"
    );

  let auMoinsUneLigneMasquee = false;

  lignes.forEach(function (ligne) {
    if (ligne.style.display === "none") {
      auMoinsUneLigneMasquee = true;
    }
  });

  lignes.forEach(function (ligne) {
    ligne.style.display =
      auMoinsUneLigneMasquee ? "" : "none";
  });

  if (bouton) {
    bouton.textContent =
      auMoinsUneLigneMasquee
        ? "Masquer les autres dates"
        : "Afficher les autres dates (" +
          lignes.length +
          ")";
  }
}

function afficherGestionCompetitions() {
  definirModeCarte("large");
  afficherChargement("Gestion des compétitions");

  chargerCompetitionsAvecCache(function (data) {
    if (!data.succes) {
      return afficherErreur(
        data.message,
        `<button onclick="afficherEspaceOfficier()">Retour</button>`
      );
    }

    let html = `
      <div class="form-zone">
        <h2>Gestion des compétitions</h2>

        <button onclick="afficherFormulaireCreationCompetition()">
          ➕ Créer une compétition
        </button>
    `;

    data.competitions.forEach(function (competition) {
      if (!peutVoirCompetition(competition)) {
        return;
      }

      const statut = normaliserStatutCompetitionFrontend(competition.statut);

      html += `
        <div class="competition-card">
          <h3>${escapeHTML(competition.nom)}</h3>

          <p>Statut : ${escapeHTML(competition.statut)}</p>
          <p>Rôles autorisés : ${escapeHTML(competition.rolesAutorises || "Tous")}</p>
          <p>${escapeHTML(competition.description || "")}</p>

          <button
            onclick='afficherFormulaireModificationCompetition(${JSON.stringify(JSON.stringify(competition))})'
            class="secondary-button">
            ✏️ Modifier
          </button>
      `;

      if (statut !== "archivee" && peutModifierCompetition(competition)) {
        html += `
          <button
            onclick="afficherGestionDatesCompetition(${Number(competition.id)}, '${jsString(competition.nom)}')"
            class="secondary-button">
            📅 Gérer les dates
          </button>
        `;
      }

      if (estOfficierConnecte() || estSuperAdminConnecte()) {
        if (statut === "brouillon" || statut === "fermee") {
          html += `
            <button
              onclick="changerStatutCompetition(${Number(competition.id)}, 'Ouverte')"
              class="secondary-button">
              🟢 Ouvrir
            </button>
          `;
        }

        if (statut === "ouverte" || statut === "brouillon") {
          html += `
            <button
              onclick="changerStatutCompetition(${Number(competition.id)}, 'Fermée')"
              class="secondary-button">
              🔒 Fermer
            </button>
          `;
        }
      }

      if (estSuperAdminConnecte()) {
        if (statut !== "archivee") {
          html += `
            <button
              onclick="changerStatutCompetition(${Number(competition.id)}, 'Archivée')"
              class="secondary-button">
              📦 Archiver
            </button>
          `;
        }

        if (statut === "archivee") {
          html += `
            <button
              onclick="confirmerSuppressionCompetition(${Number(competition.id)}, '${jsString(competition.nom)}')"
              class="danger-button">
              🗑️ Supprimer définitivement
            </button>
          `;
        }
      }

      html += `</div>`;
    });

    html += `
        <button onclick="afficherEspaceOfficier()" class="secondary-button">
          Retour
        </button>
      </div>
    `;

    setContenu(html);
  });
}

function confirmerSuppressionCompetition(idCompetition, nomCompetition) {
  afficherConfirmation(
    "Supprimer définitivement ?",
    "Cette action supprimera la compétition archivée, ses dates et ses présences. Confirmer la suppression définitive de : " + nomCompetition + " ?",
    function () {
      supprimerCompetitionDepuisSite(idCompetition);
    }
  );
}




function supprimerCompetitionDepuisSite(idCompetition) {
  appelAPI(
    "supprimerCompetition",
    {
      idCompetition,
      utilisateur: utilisateurConnecte.joueur.pseudo
    },
    function (data) {
      if (!data.succes) {
        return afficherMessageModal("Erreur", data.message);
      }

      viderCacheFrontend();
      afficherMessageModal("Compétition supprimée", data.message, afficherGestionCompetitions);
    }
  );
}

function changerStatutCompetition(idCompetition, nouveauStatut) {
  afficherConfirmation("Modifier le statut ?", "Confirmer le passage de cette compétition en statut : " + nouveauStatut + " ?", function () {
    appelAPI("modifierStatutCompetition", { idCompetition, nouveauStatut, utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
      if (!data.succes) return afficherMessageModal("Erreur", data.message);
      viderCacheFrontend();
      afficherMessageModal("Statut modifié", "La compétition est maintenant en statut : " + nouveauStatut, afficherGestionCompetitions);
    });
  });
}

function afficherFormulaireCreationCompetition() {
  definirModeCarte("large");

  setContenu(`
    <div class="form-zone">
      <h2>Créer une compétition</h2>

      <div class="stats-box">
        <h3>1. Informations générales</h3>

        <label for="nomCompetition">Nom de la compétition</label>
        <input
          type="text"
          id="nomCompetition"
          placeholder="Ex : Campagne Juin 2026"
        >

        <label for="descriptionCompetition">Description</label>
        <input
          type="text"
          id="descriptionCompetition"
          placeholder="Ex : Campagne principale du clan MPP"
        >

        <label>Rôles autorisés</label>
        <div class="roles-selection">
          <label class="checkbox-role">
            <input type="checkbox" id="roleOfficier" checked>
            Officier
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="roleStrateur" checked>
            Strateur
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="roleSoldat" checked>
            Soldat
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="roleReserviste">
            Réserviste
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="roleRecrue">
            Recrue
          </label>
        </div>

        <label for="statutCompetition">Statut initial</label>
        <select id="statutCompetition">
          <option value="Brouillon">Brouillon</option>
          <option value="Ouverte">Ouverte</option>
          <option value="Fermée">Fermée</option>
          <option value="Archivée">Archivée</option>
        </select>
      </div>

      <div class="stats-box">
        <h3>2. Calendrier</h3>

        <label for="dateDebutCompetition">Date de début</label>
        <input type="date" id="dateDebutCompetition">

        <label for="dateFinCompetition">Date de fin</label>
        <input type="date" id="dateFinCompetition">

        <label>Jours concernés</label>
        <div class="roles-selection">
          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="1" checked>
            Lundi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="2" checked>
            Mardi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="3" checked>
            Mercredi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="4" checked>
            Jeudi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="5" checked>
            Vendredi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="6">
            Samedi
          </label>

          <label class="checkbox-role">
            <input type="checkbox" class="jour-checkbox" value="0">
            Dimanche
          </label>
        </div>

        <label for="horairesCompetition">Horaires de jeu proposés</label>
        <input
          type="text"
          id="horairesCompetition"
          value="21:00,21:15,21:30"
        >

        <p>Format attendu : 21:00,21:15,21:30</p>
      </div>

      <div class="stats-box">
        <h3>3. Ouverture / fermeture automatique</h3>

        <label for="modeFermetureAuto">Mode</label>
        <select id="modeFermetureAuto" onchange="gererAffichageFermetureAuto()">
          <option value="non">Pas de fermeture automatique</option>
          <option value="oui">Horaires de fermeture</option>
        </select>

        <div id="zoneFermetureAuto" style="display:none;">
          <label for="heureOuvertureAuto">Heure d'ouverture automatique</label>
          <input type="time" id="heureOuvertureAuto" value="08:00">

          <label for="heureFermetureAuto">Heure de fermeture automatique</label>
          <input type="time" id="heureFermetureAuto" value="20:00">

          <p>
            La règle sera active uniquement entre la première et la dernière date de la compétition.
          </p>
        </div>
      </div>

      <div class="stats-box">
        <h3>4. Notification Discord des présences</h3>

        <label for="modeNotificationPresence">Mode</label>
        <select id="modeNotificationPresence" onchange="gererAffichageNotificationPresence()">
          <option value="non">Pas de notification</option>
          <option value="oui">Notification automatique</option>
        </select>

        <div id="zoneNotificationPresence" style="display:none;">
          <label for="heureNotificationPresence">Heure de notification</label>
          <input type="time" id="heureNotificationPresence" value="20:00">

          <p>
            À l'heure choisie, un message sera envoyé dans le salon staff Discord avec le nombre de présents et remplaçants du jour.
            Si plusieurs horaires existent, le détail sera précisé par horaire.
          </p>
        </div>
      </div>

      <button onclick="previsualiserCreationCompetition()">
        Prévisualiser la création
      </button>

      <button onclick="afficherGestionCompetitions()" class="secondary-button">
        Annuler
      </button>
    </div>
  `);
}

function previsualiserCreationCompetition() {
  const nom = document.getElementById("nomCompetition").value.trim();
  const description = document.getElementById("descriptionCompetition").value.trim();
  const statut = document.getElementById("statutCompetition").value;
  const dateDebut = document.getElementById("dateDebutCompetition").value;
  const dateFin = document.getElementById("dateFinCompetition").value;
  const horaires = document.getElementById("horairesCompetition").value.trim();

  const modeFermetureAuto =
    document.getElementById("modeFermetureAuto")?.value || "non";

  const fermetureAutoActive =
    modeFermetureAuto === "oui";

  const heureOuvertureAuto =
    document.getElementById("heureOuvertureAuto")?.value || "";

  const heureFermetureAuto =
    document.getElementById("heureFermetureAuto")?.value || "";

  const modeNotificationPresence =
    document.getElementById("modeNotificationPresence")?.value || "non";

  const notificationPresenceActive =
    modeNotificationPresence === "oui";

  const heureNotificationPresence =
    document.getElementById("heureNotificationPresence")?.value || "";

  const roles = recupererRolesCreationCompetition();
  const joursSelectionnes = recupererJoursSelectionnes();

  if (!nom) {
    return afficherMessageModal(
      "Erreur",
      "Merci de saisir un nom de compétition."
    );
  }

  if (roles.length === 0) {
    return afficherMessageModal(
      "Erreur",
      "Merci de sélectionner au moins un rôle autorisé."
    );
  }

  if (!dateDebut || !dateFin) {
    return afficherMessageModal(
      "Erreur",
      "Merci de sélectionner une date de début et une date de fin."
    );
  }

  if (new Date(dateFin) < new Date(dateDebut)) {
    return afficherMessageModal(
      "Erreur",
      "La date de fin doit être après la date de début."
    );
  }

  if (joursSelectionnes.length === 0) {
    return afficherMessageModal(
      "Erreur",
      "Merci de sélectionner au moins un jour concerné."
    );
  }

  if (!horaires) {
    return afficherMessageModal(
      "Erreur",
      "Merci de saisir au moins un horaire."
    );
  }

  if (
    fermetureAutoActive &&
    (!heureOuvertureAuto || !heureFermetureAuto)
  ) {
    return afficherMessageModal(
      "Erreur",
      "Merci de renseigner une heure d'ouverture et une heure de fermeture automatique."
    );
  }

  if (
    notificationPresenceActive &&
    !heureNotificationPresence
  ) {
    return afficherMessageModal(
      "Erreur",
      "Merci de renseigner une heure de notification des présences."
    );
  }

  const datesGenerees =
    genererDatesDepuisPeriode(
      dateDebut,
      dateFin,
      joursSelectionnes
    );

  if (datesGenerees.length === 0) {
    return afficherMessageModal(
      "Erreur",
      "Aucune date générée avec ces paramètres."
    );
  }

  afficherRecapCreationCompetition({
    nom: nom,
    description: description,
    statut: statut,
    rolesAutorises: roles.join(","),
    dates: datesGenerees,
    horaires: horaires,
    fermetureAutoActive: fermetureAutoActive,
    heureOuvertureAuto: heureOuvertureAuto,
    heureFermetureAuto: heureFermetureAuto,
    notificationPresenceActive: notificationPresenceActive,
    heureNotificationPresence: heureNotificationPresence
  });
}

function recupererRolesCreationCompetition() {
  const roles = [];
  if (document.getElementById("roleOfficier").checked) roles.push("Officier");
  if (document.getElementById("roleStrateur").checked) roles.push("Strateur");
  if (document.getElementById("roleSoldat").checked) roles.push("Soldat");
  if (document.getElementById("roleReserviste").checked) roles.push("Réserviste");
  if (document.getElementById("roleRecrue").checked) roles.push("Recrue");
  return roles;
}

function recupererJoursSelectionnes() {
  const jours = [];
  document.querySelectorAll(".jour-checkbox").forEach(c => { if (c.checked) jours.push(Number(c.value)); });
  return jours;
}

function genererDatesDepuisPeriode(dateDebut, dateFin, joursSelectionnes) {
  const dates = [];
  const [aD, mD, jD] = dateDebut.split("-").map(Number);
  const [aF, mF, jF] = dateFin.split("-").map(Number);
  const dateCourante = new Date(aD, mD - 1, jD);
  const dateLimite = new Date(aF, mF - 1, jF);
  while (dateCourante <= dateLimite) {
    if (joursSelectionnes.includes(dateCourante.getDay())) {
      dates.push(dateCourante.getFullYear() + "-" + String(dateCourante.getMonth() + 1).padStart(2, "0") + "-" + String(dateCourante.getDate()).padStart(2, "0"));
    }
    dateCourante.setDate(dateCourante.getDate() + 1);
  }
  return dates;
}

function afficherRecapCreationCompetition(config) {
  definirModeCarte("large");

  const htmlDates = config.dates
    .map(function(date) {
      return `<p>📅 ${escapeHTML(date)}</p>`;
    })
    .join("");

  const texteFermetureAuto = config.fermetureAutoActive
    ? "Oui — ouverture " +
      escapeHTML(config.heureOuvertureAuto) +
      " / fermeture " +
      escapeHTML(config.heureFermetureAuto)
    : "Non";

  const texteNotificationPresence = config.notificationPresenceActive
    ? "Oui — notification à " +
      escapeHTML(config.heureNotificationPresence)
    : "Non";

  setContenu(`
    <div class="form-zone">
      <h2>Prévisualisation</h2>

      <div class="stats-box">
        <h3>${escapeHTML(config.nom)}</h3>

        <p>${escapeHTML(config.description)}</p>

        <p>Statut : ${escapeHTML(config.statut)}</p>

        <p>Rôles autorisés : ${escapeHTML(config.rolesAutorises)}</p>

        <p>Horaires de jeu : ${escapeHTML(config.horaires)}</p>

        <p>Fermeture automatique : ${texteFermetureAuto}</p>

        <p>Notification Discord des présences : ${texteNotificationPresence}</p>

        <p>Nombre de dates générées : ${config.dates.length}</p>
      </div>

      <div class="stats-box">
        <h3>Dates générées</h3>
        ${htmlDates}
      </div>

      <button onclick='confirmerCreationCompetitionComplete(${JSON.stringify(JSON.stringify(config))})'>
        Confirmer la création
      </button>

      <button onclick="afficherFormulaireCreationCompetition()" class="secondary-button">
        Modifier
      </button>
    </div>
  `);
}

function confirmerCreationCompetitionComplete(configJSON) {
  const config = JSON.parse(configJSON);
  afficherChargement("Création en cours...", "La compétition et les dates sont enregistrées en une seule opération.");
  appelAPI("creerCompetitionComplete", { config: JSON.stringify(config), utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    viderCacheFrontend();
    afficherMessageModal("Compétition créée", "La compétition et ses dates ont bien été créées.", afficherGestionCompetitions);
  });
}

function afficherGestionDatesCompetition(idCompetition, nomCompetition) {
  definirModeCarte("large");
  afficherChargement("Gestion des dates");
  appelAPI("chargerDatesCompetition", { idCompetition }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    let html = `<div class="form-zone"><h2>Gestion des dates</h2><p>Compétition : ${escapeHTML(nomCompetition)}</p><div class="stats-box"><h3>Dates existantes</h3>`;
    if (data.dates.length === 0) html += `<p>Aucune date définie.</p>`;
    data.dates.forEach(function (date) {
      html += `<div class="date-admin-row"><span>📅 ${escapeHTML(date.dateAffichage)} — ${escapeHTML(date.dateCompetition)}</span><button class="danger-button" onclick="confirmerSuppressionDate(${Number(date.idDate)}, ${idCompetition}, '${jsString(nomCompetition)}')">🗑️ Supprimer</button></div>`;
    });
    html += `</div><button onclick="afficherFormulaireAjoutDate(${idCompetition}, '${jsString(nomCompetition)}')">➕ Ajouter une date</button><button onclick="afficherGestionCompetitions()" class="secondary-button">Retour</button></div>`;
    setContenu(html);
  });
}

function afficherFormulaireAjoutDate(idCompetition, nomCompetition) {
  definirModeCarte("large");
  setContenu(`<div class="form-zone"><h2>Ajouter une date</h2><p>Compétition : ${escapeHTML(nomCompetition)}</p><label for="nouvelleDateCompetition">Date</label><input type="date" id="nouvelleDateCompetition"><label for="nouveauxHorairesCompetition">Horaires</label><input type="text" id="nouveauxHorairesCompetition" value="21:00,21:15,21:30"><button onclick="ajouterDateDepuisSite(${idCompetition}, '${jsString(nomCompetition)}')">Ajouter la date</button><button onclick="afficherGestionDatesCompetition(${idCompetition}, '${jsString(nomCompetition)}')" class="secondary-button">Annuler</button></div>`);
}

function ajouterDateDepuisSite(idCompetition, nomCompetition) {
  const dateChoisie = document.getElementById("nouvelleDateCompetition").value;
  const horaires = document.getElementById("nouveauxHorairesCompetition").value.trim();
  if (!dateChoisie) return afficherMessageModal("Erreur", "Merci de sélectionner une date.");
  appelAPI("ajouterDateCompetition", { idCompetition, dateCompetition: dateChoisie, horaires, utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    viderCacheFrontend();
    afficherMessageModal("Date ajoutée", "La date a bien été ajoutée à la compétition.", () => afficherGestionDatesCompetition(idCompetition, nomCompetition));
  });
}

function confirmerSuppressionDate(idDate, idCompetition, nomCompetition) {
  afficherConfirmation("Supprimer la date ?", "Cette action supprimera la date de la compétition. Confirmer ?", function () { supprimerDateDepuisSite(idDate, idCompetition, nomCompetition); });
}

function supprimerDateDepuisSite(idDate, idCompetition, nomCompetition) {
  appelAPI("supprimerDateCompetition", { idDate, utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    viderCacheFrontend();
    afficherMessageModal("Date supprimée", "La date a bien été supprimée.", () => afficherGestionDatesCompetition(idCompetition, nomCompetition));
  });
}

let joueursGestionCache = [];

function afficherGestionJoueurs() {
  definirModeCarte("large");
  afficherChargement("Gestion des joueurs");

  appelAPI("chargerJoueurs", {}, function (data) {
    if (!data.succes) {
      return afficherMessageModal("Erreur", data.message);
    }

    joueursGestionCache = data.joueurs || [];

    let html = `
      <div class="form-zone">
        <h2>Gestion des joueurs</h2>

        <button onclick="afficherFormulaireAjoutJoueur()">
          ➕ Ajouter un joueur
        </button>

        <div class="stats-box">
          <h3>Filtres et tri</h3>

          <label for="rechercheJoueur">Rechercher un pseudo</label>
          <input
            type="text"
            id="rechercheJoueur"
            placeholder="Ex : ap"
            oninput="appliquerFiltresGestionJoueurs()"
          >

          <label for="triJoueurs">Trier par</label>
          <select id="triJoueurs" onchange="appliquerFiltresGestionJoueurs()">
            <option value="pseudo">Ordre alphabétique</option>
            <option value="grade">Grade</option>
            <option value="statut">Statut</option>
          </select>
        </div>

        <div id="zoneTableauJoueurs"></div>

        <button onclick="afficherEspaceOfficier()" class="secondary-button">
          Retour
        </button>
      </div>
    `;

    setContenu(html);
    appliquerFiltresGestionJoueurs();
  });
}

function afficherFormulaireAjoutJoueur() {
  definirModeCarte("large");

  const optionSuperAdmin = estSuperAdminConnecte()
    ? `
      <label class="checkbox-role">
        <input type="checkbox" id="joueurRoleSuperAdmin">
        SuperAdmin
      </label>
    `
    : "";

  setContenu(`
    <div class="form-zone">
      <h2>Ajouter un joueur</h2>

      <label for="nouveauPseudoJoueur">Pseudo WoT</label>
      <input
        type="text"
        id="nouveauPseudoJoueur"
        placeholder="Ex : NouveauJoueur"
      >

      <label>Grades</label>
      <div class="roles-selection">
        ${optionSuperAdmin}

        <label class="checkbox-role">
          <input type="checkbox" id="joueurRoleOfficier">
          Officier
        </label>

        <label class="checkbox-role">
          <input type="checkbox" id="joueurRoleStrateur">
          Strateur
        </label>

        <label class="checkbox-role">
          <input type="checkbox" id="joueurRoleSoldat" checked>
          Soldat
        </label>

        <label class="checkbox-role">
          <input type="checkbox" id="joueurRoleReserviste">
          Réserviste
        </label>

        <label class="checkbox-role">
          <input type="checkbox" id="joueurRoleRecrue">
          Recrue
        </label>
      </div>

      <label for="nouveauStatutJoueur">Statut</label>
      <select id="nouveauStatutJoueur">
        <option value="Actif">Actif</option>
        <option value="Inactif">Inactif</option>
        <option value="Suspendu">Suspendu</option>
      </select>

      <button onclick="ajouterJoueurDepuisSite()">
        Créer le joueur
      </button>

      <button onclick="afficherGestionJoueurs()" class="secondary-button">
        Annuler
      </button>
    </div>
  `);
}

function recupererRolesJoueur(prefixe) {
  const roles = [];

  if (
    estSuperAdminConnecte() &&
    document.getElementById(prefixe + "RoleSuperAdmin") &&
    document.getElementById(prefixe + "RoleSuperAdmin").checked
  ) {
    roles.push("SuperAdmin");
  }

  if (document.getElementById(prefixe + "RoleOfficier").checked) roles.push("Officier");
  if (document.getElementById(prefixe + "RoleStrateur").checked) roles.push("Strateur");
  if (document.getElementById(prefixe + "RoleSoldat").checked) roles.push("Soldat");
  if (document.getElementById(prefixe + "RoleReserviste").checked) roles.push("Réserviste");
  if (document.getElementById(prefixe + "RoleRecrue").checked) roles.push("Recrue");

  return roles;
}

function ajouterJoueurDepuisSite() {
  const pseudo = document.getElementById("nouveauPseudoJoueur").value.trim();
  const statut = document.getElementById("nouveauStatutJoueur").value;
  const roles = recupererRolesJoueur("joueur");
  if (!pseudo) return afficherMessageModal("Erreur", "Merci de saisir un pseudo.");
  if (roles.length === 0) return afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle.");
  appelAPI("ajouterJoueur", { pseudo, roles: roles.join(","), statut, utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    viderCacheFrontend();
    afficherMessageModal("Joueur ajouté", "Le joueur a bien été ajouté.", afficherGestionJoueurs);
  });
}

function afficherFormulaireModificationJoueur(joueur) {
  definirModeCarte("large");

  const rolesActuels = String(joueur.roles || "");

  const optionSuperAdmin = estSuperAdminConnecte()
    ? `
      <label class="checkbox-role">
        <input
          type="checkbox"
          id="modifierRoleSuperAdmin"
          ${rolesActuels.includes("SuperAdmin") ? "checked" : ""}
        >
        SuperAdmin
      </label>
    `
    : "";

  setContenu(`
    <div class="form-zone">
      <h2>Modifier un joueur</h2>

      <label for="modifierPseudoJoueur">Pseudo WoT</label>
      <input
        type="text"
        id="modifierPseudoJoueur"
        value="${escapeHTML(joueur.pseudo)}"
      >

      <label>Grades</label>
      <div class="roles-selection">
        ${optionSuperAdmin}

        <label class="checkbox-role">
          <input
            type="checkbox"
            id="modifierRoleOfficier"
            ${rolesActuels.includes("Officier") ? "checked" : ""}
          >
          Officier
        </label>

        <label class="checkbox-role">
          <input
            type="checkbox"
            id="modifierRoleStrateur"
            ${rolesActuels.includes("Strateur") ? "checked" : ""}
          >
          Strateur
        </label>

        <label class="checkbox-role">
          <input
            type="checkbox"
            id="modifierRoleSoldat"
            ${rolesActuels.includes("Soldat") ? "checked" : ""}
          >
          Soldat
        </label>

        <label class="checkbox-role">
          <input
            type="checkbox"
            id="modifierRoleReserviste"
            ${rolesActuels.includes("Réserviste") ? "checked" : ""}
          >
          Réserviste
        </label>

        <label class="checkbox-role">
          <input
            type="checkbox"
            id="modifierRoleRecrue"
            ${rolesActuels.includes("Recrue") ? "checked" : ""}
          >
          Recrue
        </label>
      </div>

      <label for="modifierStatutJoueur">Statut</label>
      <select id="modifierStatutJoueur">
        <option value="Actif" ${joueur.statut === "Actif" ? "selected" : ""}>
          Actif
        </option>

        <option value="Inactif" ${joueur.statut === "Inactif" ? "selected" : ""}>
          Inactif
        </option>

        <option value="Suspendu" ${joueur.statut === "Suspendu" ? "selected" : ""}>
          Suspendu
        </option>
      </select>

      <button onclick="modifierJoueurDepuisSite(${Number(joueur.id)})">
        Enregistrer les modifications
      </button>

      <button onclick="afficherGestionJoueurs()" class="secondary-button">
        Annuler
      </button>
    </div>
  `);
}

function modifierJoueurDepuisSite(idJoueur) {
  const pseudo = document.getElementById("modifierPseudoJoueur").value.trim();
  const statut = document.getElementById("modifierStatutJoueur").value;
  const roles = recupererRolesJoueur("modifier");
  if (!pseudo) return afficherMessageModal("Erreur", "Merci de saisir un pseudo.");
  if (roles.length === 0) return afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle.");
  appelAPI("modifierJoueur", { idJoueur, pseudo, roles: roles.join(","), statut, utilisateur: utilisateurConnecte.joueur.pseudo }, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    viderCacheFrontend();
    afficherMessageModal("Joueur modifié", "Les informations du joueur ont bien été mises à jour.", afficherGestionJoueurs);
  });
}

function confirmerSuppressionJoueur(idJoueur) {
  const joueur = joueursGestionCache.find(function (item) {
    return Number(item.id) === Number(idJoueur);
  });

  if (!joueur) {
    return afficherMessageModal("Erreur", "Joueur introuvable dans la liste affichée.");
  }

  const pseudo = String(joueur.pseudo || "").trim();
  const roles = String(joueur.roles || "").toLowerCase();
  const pseudoConnecte = String(utilisateurConnecte?.joueur?.pseudo || "").trim().toLowerCase();

  if (!estSuperAdminConnecte()) {
    return afficherMessageModal("Accès refusé", "Seul un SuperAdmin peut supprimer un joueur.");
  }

  if (!pseudo) {
    return afficherMessageModal("Erreur", "Joueur invalide.");
  }

  if (roles.includes("superadmin")) {
    return afficherMessageModal("Action impossible", "Impossible de supprimer un SuperAdmin.");
  }

  if (pseudo.toLowerCase() === pseudoConnecte) {
    return afficherMessageModal("Action impossible", "Impossible de supprimer votre propre compte.");
  }

  fermerModal();

  const modal = document.createElement("div");
  modal.id = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box modal-danger">
      <h2>Supprimer le joueur</h2>
      <p class="modal-danger-pseudo">${escapeHTML(pseudo)}</p>
      <div class="modal-message">
        <p>Cette action est définitive.</p>
        <p>Le joueur sera supprimé du clan et toutes ses présences seront aussi supprimées.</p>
      </div>
      <label for="confirmationSuppressionJoueur" class="modal-confirm-label">
        Tapez SUPPRIMER pour confirmer
      </label>
      <input
        type="text"
        id="confirmationSuppressionJoueur"
        class="modal-confirm-input"
        autocomplete="off"
      >
      <div class="modal-actions">
        <button class="secondary-button" id="annulerSuppressionJoueur">Annuler</button>
        <button class="danger-button" id="confirmerSuppressionJoueur" disabled>
          Supprimer définitivement
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const champConfirmation = document.getElementById("confirmationSuppressionJoueur");
  const boutonConfirmer = document.getElementById("confirmerSuppressionJoueur");

  document.getElementById("annulerSuppressionJoueur").onclick = fermerModal;

  champConfirmation.oninput = function () {
    boutonConfirmer.disabled = champConfirmation.value !== "SUPPRIMER";
  };

  champConfirmation.onkeydown = function (event) {
    if (event.key === "Enter" && champConfirmation.value === "SUPPRIMER") {
      fermerModal();
      supprimerJoueurDepuisSite(Number(idJoueur));
    }
  };

  boutonConfirmer.onclick = function () {
    if (champConfirmation.value !== "SUPPRIMER") return;
    fermerModal();
    supprimerJoueurDepuisSite(Number(idJoueur));
  };

  champConfirmation.focus();
}

function supprimerJoueurDepuisSite(idJoueur) {
  if (!estSuperAdminConnecte()) {
    return afficherMessageModal("Accès refusé", "Seul un SuperAdmin peut supprimer un joueur.");
  }

  afficherChargement("Suppression du joueur", "Suppression du joueur et de ses présences...");

  appelAPI(
    "supprimerJoueur",
    {
      idJoueur,
      utilisateur: utilisateurConnecte.joueur.pseudo
    },
    function (data) {
      if (!data.succes) {
        return afficherMessageModal("Erreur", data.message);
      }

      viderCacheFrontend();
      joueursGestionCache = [];

      afficherMessageModal(
        "Joueur supprimé",
        escapeHTML(data.message),
        afficherGestionJoueurs
      );
    }
  );
}

function chargerSansReponse(idCompetition, nomCompetition) {
  definirModeCarte("large");
  afficherChargement("Joueurs sans réponse");
  appelAPI("chargerJoueursSansReponse", { idCompetition }, function (data) {
    if (!data.succes) return afficherErreur(data.message, `<button onclick="afficherTableauPresencesOfficier(${idCompetition}, '${jsString(nomCompetition)}')">Retour</button>`);
    let html = `<div class="form-zone"><h2>Joueurs sans réponse</h2><p>Compétition : ${escapeHTML(nomCompetition)}</p><p>Total : ${data.nombre}</p><div class="table-container"><table class="presence-table"><thead><tr><th>Joueur</th><th>Rôles</th></tr></thead><tbody>`;
    if (data.joueurs.length === 0) html += `<tr><td colspan="2">Tous les joueurs actifs ont répondu.</td></tr>`;
    data.joueurs.forEach(j => html += `<tr><td>${escapeHTML(j.pseudo)}</td><td>${escapeHTML(j.roles)}</td></tr>`);
    html += `</tbody></table></div><button onclick="afficherTableauPresencesOfficier(${idCompetition}, '${jsString(nomCompetition)}')" class="secondary-button">Retour au tableau</button></div>`;
    setContenu(html);
  });
}

function afficherJournalActivite() {
  definirModeCarte("large");
  afficherChargement("Journal d'activité", "Chargement des 50 dernières actions...");
  appelAPI("chargerJournalActivite", {}, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    let html = `<div class="form-zone"><h2>Journal d'activité</h2><p>50 dernières actions enregistrées.</p><div class="table-container"><table class="presence-table"><thead><tr><th>Date / Heure</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead><tbody>`;
    if (data.journal.length === 0) html += `<tr><td colspan="4">Aucune action enregistrée.</td></tr>`;
    data.journal.forEach(e => html += `<tr><td>${escapeHTML(e.dateHeure)}</td><td>${escapeHTML(e.utilisateur)}</td><td>${escapeHTML(e.action)}</td><td>${escapeHTML(e.details)}</td></tr>`);
    html += `</tbody></table></div><button onclick="afficherEspaceOfficier()" class="secondary-button">Retour</button></div>`;
    setContenu(html);
  });
}

function formaterAffichagePresence(dispo) {

  const horaires = String(dispo.horairesDisponibles || "")
    .split(",")
    .map(h => h.trim())
    .filter(Boolean);

  if (dispo.statut === "Présent") {

  if (horaires.length > 0) {
    return `
      <div class="presence-cell">
        <div>🟢</div>
        <div class="nb-horaires">(${horaires.length})</div>
      </div>
    `;
  }

  return "🟢";
}

if (dispo.statut === "Remplaçant") {

  if (horaires.length > 0) {
    return `
      <div class="presence-cell">
        <div>🔵</div>
        <div class="nb-horaires">(${horaires.length})</div>
      </div>
    `;
  }

  return "🔵";
}

  if (dispo.statut === "Absent") {
    return "🔴";
  }

  return "⚪";
}

function afficherDetailPresence(pseudoJSON, dispoJSON) {
  const pseudo = JSON.parse(pseudoJSON);
  const dispo = JSON.parse(dispoJSON);
  const horairesSelectionnes = String(dispo.horairesDisponibles || "").split(",").map(h => h.trim()).filter(Boolean);
  let horairesHTML = "";
  if (
  (dispo.statut === "Présent" || dispo.statut === "Remplaçant") &&
  horairesSelectionnes.length > 0
) horairesHTML = horairesSelectionnes.map(h => `<span class="horaire-badge">✅ ${escapeHTML(h)}</span>`).join("");
  else horairesHTML = `<p>Aucun horaire disponible.</p>`;
  afficherMessageModal(escapeHTML(pseudo) + " — " + escapeHTML(dispo.dateAffichage), `<p>Statut : <strong>${escapeHTML(dispo.statut)}</strong></p><div class="horaires-modal">${horairesHTML}</div>`);
}

function calculerStatistiquesTableau(lignes) {
  let presents = 0, absents = 0, remplacants = 0, nonRenseignes = 0, totalCases = 0;
  lignes.forEach(l => l.disponibilites.forEach(d => { totalCases++; if (d.statut === "Présent") presents++; else if (d.statut === "Absent") absents++; else if (d.statut === "Remplaçant") remplacants++; else nonRenseignes++; }));
  const casesRenseignees = totalCases - nonRenseignes;
  return { presents, absents, remplacants, nonRenseignes, tauxReponse: totalCases === 0 ? 0 : Math.round((casesRenseignees / totalCases) * 100) };
}

function calculerStatistiquesParDate(dates, lignes) {
  return dates.map(function (dateInfo) {
    let presents = 0, absents = 0, remplacants = 0, nonRenseignes = 0;
    lignes.forEach(function (ligne) {
      const dispo = ligne.disponibilites.find(item => item.dateCompetition === dateInfo.dateCompetition);
      const statut = dispo ? dispo.statut : "Non renseigné";
      if (statut === "Présent") presents++; else if (statut === "Absent") absents++; else if (statut === "Remplaçant") remplacants++; else nonRenseignes++;
    });
    return { dateAffichage: dateInfo.dateAffichage, dateCompetition: dateInfo.dateCompetition, presents, absents, remplacants, nonRenseignes };
  });
}

function calculerEffectifParHoraire(dates, lignes) {
  return dates.map(function (dateInfo) {
    const horairesDate = String(dateInfo.horaires || "").split(",").map(h => h.trim()).filter(Boolean);
    const statsHoraires = horairesDate.map(function (horaire) {
      let presents = 0, remplacants = 0, absents = 0, nonRenseignes = 0;
      lignes.forEach(function (ligne) {
        const dispo = ligne.disponibilites.find(item => item.dateCompetition === dateInfo.dateCompetition);
        if (!dispo || dispo.statut === "Non renseigné") return nonRenseignes++;
        if (dispo.statut === "Absent") return absents++;
        if (dispo.statut === "Remplaçant") return remplacants++;
        if (dispo.statut === "Présent") {
          const horairesDispo = String(dispo.horairesDisponibles || "").split(",").map(h => h.trim()).filter(Boolean);
          if (horairesDispo.includes(horaire)) presents++;
        }
      });
      return { horaire, presents, remplacants, absents, nonRenseignes };
    });
    return { dateAffichage: dateInfo.dateAffichage, dateCompetition: dateInfo.dateCompetition, horaires: statsHoraires };
  });
}

function afficherConfirmation(titre, message, actionConfirmer) {
  fermerModal();
  const modal = document.createElement("div");
  modal.id = "modal-overlay";
  modal.innerHTML = `<div class="modal-box"><h2>${escapeHTML(titre)}</h2><p>${escapeHTML(message)}</p><div class="modal-actions"><button class="secondary-button" onclick="fermerModal()">Annuler</button><button id="modal-confirm-button">Confirmer</button></div></div>`;
  document.body.appendChild(modal);
  document.getElementById("modal-confirm-button").onclick = function () { fermerModal(); actionConfirmer(); };
}

function afficherMessageModal(titre, message, actionFermer) {
  fermerModal();
  const modal = document.createElement("div");
  modal.id = "modal-overlay";
  modal.innerHTML = `<div class="modal-box"><h2>${titre}</h2><div class="modal-message">${message}</div><div class="modal-actions"><button id="modal-close-button">OK</button></div></div>`;
  document.body.appendChild(modal);
  document.getElementById("modal-close-button").onclick = function () { fermerModal(); if (actionFermer) actionFermer(); };
}

function fermerModal() {
  const ancienneModal = document.getElementById("modal-overlay");
  if (ancienneModal) ancienneModal.remove();
}

function appelAPI(action, parametres, callback) {
  const debut = performance.now();

  console.log("SUPABASE ▶️", action, parametres);

  apiSupabase(action, parametres || {})
    .then(function (reponse) {
      const duree = Math.round(performance.now() - debut);
      console.log("SUPABASE ✅", action, duree + " ms", reponse);
      callback(reponse);
    })
    .catch(function (erreur) {
      console.error("SUPABASE ❌", action, erreur);

      callback({
        succes: false,
        message: "Erreur Supabase.",
        details: erreur.message || String(erreur)
      });
    });
}



function normaliserStatutCompetitionFrontend(statut) {
  return String(statut || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function badgeStatutCompetitionHTML(statut) {
  const statutNormalise = normaliserStatutCompetitionFrontend(statut);
  const badges = {
    ouverte: { classe: "status-open", texte: "🟢 Ouverte" },
    brouillon: { classe: "status-draft", texte: "🟠 Brouillon" },
    fermee: { classe: "status-closed", texte: "🔴 Fermée" },
    archivee: { classe: "status-archived", texte: "⚫ Archivée" }
  };

  const badge = badges[statutNormalise] || {
    classe: "status-unknown",
    texte: statut || "Statut inconnu"
  };

  return `<span class="status-badge ${badge.classe}">${escapeHTML(badge.texte)}</span>`;
}

function getRolesUtilisateur() {
  return String(utilisateurConnecte?.joueur?.roles || "")
    .split(",")
    .map(role => role.trim().toLowerCase())
    .filter(Boolean);
}

function estOfficierConnecte() {
  return getRolesUtilisateur().includes("officier");
}

function estSuperAdminConnecte() {
  return getRolesUtilisateur().includes("superadmin");
}

function peutVoirCompetition(competition) {

  const statut = normaliserStatutCompetitionFrontend(competition.statut);

  if (statut === "archivee") {
    return estSuperAdminConnecte();
  }

  if (statut === "brouillon") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  return true;
}

function peutRemplirCompetition(competition) {

  const statut = normaliserStatutCompetitionFrontend(competition.statut);

  if (statut === "ouverte") {
    return true;
  }

  if (statut === "brouillon") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  return false;
}

function peutModifierCompetition(competition) {

  const statut = normaliserStatutCompetitionFrontend(competition.statut);

  if (statut === "brouillon") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  if (statut === "ouverte") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  return false;
}

function peutSupprimerCompetition(competition) {
  return estSuperAdminConnecte();
}

function afficherDemandeMotDePasseOfficier() {
  definirModeCarte("normal");

  const estSuperAdmin = estSuperAdminConnecte();

  setContenu(`
    <div class="form-zone">
      <h2>${estSuperAdmin ? "Accès Super Admin" : "Accès Officier"}</h2>

      <p>Connecté : ${escapeHTML(utilisateurConnecte.joueur.pseudo)}</p>

      <label for="mdpOfficier">
        ${estSuperAdmin ? "Mot de passe Super Admin" : "Mot de passe Officier"}
      </label>

      <input
        type="password"
        id="mdpOfficier"
        placeholder="${estSuperAdmin ? "Mot de passe Super Admin" : "Mot de passe Officier"}"
        onkeydown="if(event.key==='Enter'){verifierAccesOfficier();}"
      >

      <button onclick="verifierAccesOfficier()">Valider</button>

      <button onclick="deconnexion()" class="secondary-button">
        Retour
      </button>

      <p id="message"></p>
    </div>
  `);
}

function afficherChangerMotDePasse() {

  setContenu(`
    <div class="form-zone">

      <h2>Changer mon mot de passe</h2>

      <input
        type="password"
        id="ancienMdp"
        placeholder="Mot de passe actuel">

      <input
        type="password"
        id="nouveauMdp"
        placeholder="Nouveau mot de passe">

      <input
        type="password"
        id="confirmationMdp"
        placeholder="Confirmation">

      <button onclick="changerMotDePasse()">
        Enregistrer
      </button>

    </div>
  `);
}

function changerMotDePasse() {
  const ancienMdp = document.getElementById("ancienMdp").value;
  const nouveauMdp = document.getElementById("nouveauMdp").value;
  const confirmationMdp = document.getElementById("confirmationMdp").value;

  let message = document.getElementById("message");

  if (!message) {
    message = document.createElement("p");
    message.id = "message";
    document.querySelector(".form-zone").appendChild(message);
  }

  if (!ancienMdp || !nouveauMdp || !confirmationMdp) {
    message.textContent = "Merci de remplir tous les champs.";
    message.style.color = "#ff5555";
    return;
  }

  if (nouveauMdp !== confirmationMdp) {
    message.textContent = "Les deux nouveaux mots de passe ne correspondent pas.";
    message.style.color = "#ff5555";
    return;
  }

  message.textContent = "Modification en cours...";
  message.style.color = "#CFCFCF";

  changerMotDePasseSupabase(
    utilisateurConnecte.joueur.pseudo,
    ancienMdp,
    nouveauMdp
  )
    .then(function (data) {
      if (!data.succes) {
        message.textContent = data.message;
        message.style.color = "#ff5555";
        return;
      }

      message.textContent = data.message;
      message.style.color = "#8dff8d";

      setTimeout(function () {
        afficherChoixOfficier();
      }, 1000);
    })
    .catch(function (erreur) {
      console.error("Erreur changement mot de passe :", erreur);
      message.textContent = "Erreur lors du changement de mot de passe.";
      message.style.color = "#ff5555";
    });
}

function gererAffichageFermetureAuto() {
  const modeFermetureAuto = document.getElementById("modeFermetureAuto");
  const zoneFermetureAuto = document.getElementById("zoneFermetureAuto");

  if (!modeFermetureAuto || !zoneFermetureAuto) {
    return;
  }

  if (modeFermetureAuto.value === "oui") {
    zoneFermetureAuto.style.display = "";
  } else {
    zoneFermetureAuto.style.display = "none";
  }
}

function afficherFormulaireModificationCompetition(competitionJSON) {
  definirModeCarte("large");

  const competition = JSON.parse(competitionJSON);

  const rolesActuels = String(competition.rolesAutorises || "");

  const fermetureAutoActive =
    competition.fermetureAutoActive === true ||
    competition.fermetureAutoActive === "true";

  const notificationPresenceActive =
    competition.notificationPresenceActive === true ||
    competition.notificationPresenceActive === "true";

  setContenu(`
    <div class="form-zone">
      <h2>Modifier une compétition</h2>

      <div class="stats-box">
        <h3>1. Informations générales</h3>

        <label for="modifierNomCompetition">Nom de la compétition</label>
        <input
          type="text"
          id="modifierNomCompetition"
          value="${escapeHTML(competition.nom)}"
        >

        <label for="modifierDescriptionCompetition">Description</label>
        <input
          type="text"
          id="modifierDescriptionCompetition"
          value="${escapeHTML(competition.description || "")}"
        >

        <label>Rôles autorisés</label>
        <div class="roles-selection">
          <label class="checkbox-role">
            <input type="checkbox" id="modifierRoleOfficier" ${rolesActuels.includes("Officier") ? "checked" : ""}>
            Officier
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="modifierRoleStrateur" ${rolesActuels.includes("Strateur") ? "checked" : ""}>
            Strateur
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="modifierRoleSoldat" ${rolesActuels.includes("Soldat") ? "checked" : ""}>
            Soldat
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="modifierRoleReserviste" ${rolesActuels.includes("Réserviste") ? "checked" : ""}>
            Réserviste
          </label>

          <label class="checkbox-role">
            <input type="checkbox" id="modifierRoleRecrue" ${rolesActuels.includes("Recrue") ? "checked" : ""}>
            Recrue
          </label>
        </div>

        <label for="modifierStatutCompetition">Statut</label>
        <select id="modifierStatutCompetition">
          <option value="Brouillon" ${competition.statut === "Brouillon" ? "selected" : ""}>Brouillon</option>
          <option value="Ouverte" ${competition.statut === "Ouverte" ? "selected" : ""}>Ouverte</option>
          <option value="Fermée" ${competition.statut === "Fermée" ? "selected" : ""}>Fermée</option>
          <option value="Archivée" ${competition.statut === "Archivée" ? "selected" : ""}>Archivée</option>
        </select>
      </div>

      <div class="stats-box">
        <h3>2. Dates</h3>
        <p>
          Les dates sont gérées séparément pour éviter de supprimer ou recréer accidentellement les présences déjà enregistrées.
        </p>

        <button
          onclick="afficherGestionDatesCompetition(${Number(competition.id)}, '${jsString(competition.nom)}')"
          class="secondary-button">
          📅 Gérer les dates
        </button>
      </div>

      <div class="stats-box">
        <h3>3. Ouverture / fermeture automatique</h3>

        <label for="modifierModeFermetureAuto">Mode</label>
        <select id="modifierModeFermetureAuto" onchange="gererAffichageModificationFermetureAuto()">
          <option value="non" ${!fermetureAutoActive ? "selected" : ""}>
            Pas de fermeture automatique
          </option>
          <option value="oui" ${fermetureAutoActive ? "selected" : ""}>
            Horaires de fermeture
          </option>
        </select>

        <div id="modifierZoneFermetureAuto" style="${fermetureAutoActive ? "" : "display:none;"}">
          <label for="modifierHeureOuvertureAuto">Heure d'ouverture automatique</label>
          <input
            type="time"
            id="modifierHeureOuvertureAuto"
            value="${escapeHTML(competition.heureOuverture || "08:00")}"
          >

          <label for="modifierHeureFermetureAuto">Heure de fermeture automatique</label>
          <input
            type="time"
            id="modifierHeureFermetureAuto"
            value="${escapeHTML(competition.heureFermeture || "20:00")}"
          >

          <p>
            La règle sera active uniquement entre la première et la dernière date de la compétition.
          </p>
        </div>
      </div>

      <div class="stats-box">
        <h3>4. Notification Discord des présences</h3>

        <label for="modifierModeNotificationPresence">Mode</label>
        <select id="modifierModeNotificationPresence" onchange="gererAffichageModificationNotificationPresence()">
          <option value="non" ${!notificationPresenceActive ? "selected" : ""}>
            Pas de notification
          </option>
          <option value="oui" ${notificationPresenceActive ? "selected" : ""}>
            Notification automatique
          </option>
        </select>

        <div id="modifierZoneNotificationPresence" style="${notificationPresenceActive ? "" : "display:none;"}">
          <label for="modifierHeureNotificationPresence">Heure de notification</label>
          <input
            type="time"
            id="modifierHeureNotificationPresence"
            value="${escapeHTML(competition.heureNotificationPresence || "20:00")}"
          >

          <p>
            À l'heure choisie, un message sera envoyé dans le salon staff Discord avec le nombre de présents et remplaçants du jour.
            Si plusieurs horaires existent, le détail sera précisé par horaire.
          </p>
        </div>
      </div>

      <button onclick="previsualiserModificationCompetition(${Number(competition.id)})">
        Prévisualiser les modifications
      </button>

      <button onclick="afficherGestionCompetitions()" class="secondary-button">
        Annuler
      </button>
    </div>
  `);
}

function gererAffichageModificationFermetureAuto() {
  const modeFermetureAuto = document.getElementById("modifierModeFermetureAuto");
  const zoneFermetureAuto = document.getElementById("modifierZoneFermetureAuto");

  if (!modeFermetureAuto || !zoneFermetureAuto) {
    return;
  }

  if (modeFermetureAuto.value === "oui") {
    zoneFermetureAuto.style.display = "";
  } else {
    zoneFermetureAuto.style.display = "none";
  }
}

function recupererRolesModificationCompetition() {
  const roles = [];

  if (document.getElementById("modifierRoleOfficier").checked) roles.push("Officier");
  if (document.getElementById("modifierRoleStrateur").checked) roles.push("Strateur");
  if (document.getElementById("modifierRoleSoldat").checked) roles.push("Soldat");
  if (document.getElementById("modifierRoleReserviste").checked) roles.push("Réserviste");
  if (document.getElementById("modifierRoleRecrue").checked) roles.push("Recrue");

  return roles;
}

function previsualiserModificationCompetition(idCompetition) {
  const nom = document.getElementById("modifierNomCompetition").value.trim();
  const description = document.getElementById("modifierDescriptionCompetition").value.trim();
  const statut = document.getElementById("modifierStatutCompetition").value;

  const modeFermetureAuto =
    document.getElementById("modifierModeFermetureAuto")?.value || "non";

  const fermetureAutoActive =
    modeFermetureAuto === "oui";

  const heureOuvertureAuto =
    document.getElementById("modifierHeureOuvertureAuto")?.value || "";

  const heureFermetureAuto =
    document.getElementById("modifierHeureFermetureAuto")?.value || "";

  const modeNotificationPresence =
    document.getElementById("modifierModeNotificationPresence")?.value || "non";

  const notificationPresenceActive =
    modeNotificationPresence === "oui";

  const heureNotificationPresence =
    document.getElementById("modifierHeureNotificationPresence")?.value || "";

  const roles = recupererRolesModificationCompetition();

  if (!nom) {
    return afficherMessageModal(
      "Erreur",
      "Merci de saisir un nom de compétition."
    );
  }

  if (roles.length === 0) {
    return afficherMessageModal(
      "Erreur",
      "Merci de sélectionner au moins un rôle autorisé."
    );
  }

  if (
    fermetureAutoActive &&
    (!heureOuvertureAuto || !heureFermetureAuto)
  ) {
    return afficherMessageModal(
      "Erreur",
      "Merci de renseigner une heure d'ouverture et une heure de fermeture automatique."
    );
  }

  if (
    notificationPresenceActive &&
    !heureNotificationPresence
  ) {
    return afficherMessageModal(
      "Erreur",
      "Merci de renseigner une heure de notification des présences."
    );
  }

  afficherRecapModificationCompetition({
    idCompetition: idCompetition,
    nom: nom,
    description: description,
    statut: statut,
    rolesAutorises: roles.join(","),
    fermetureAutoActive: fermetureAutoActive,
    heureOuvertureAuto: heureOuvertureAuto,
    heureFermetureAuto: heureFermetureAuto,
    notificationPresenceActive: notificationPresenceActive,
    heureNotificationPresence: heureNotificationPresence
  });
}

function afficherRecapModificationCompetition(config) {
  definirModeCarte("large");

  const texteFermetureAuto = config.fermetureAutoActive
    ? "Oui — ouverture " +
      escapeHTML(config.heureOuvertureAuto) +
      " / fermeture " +
      escapeHTML(config.heureFermetureAuto)
    : "Non";

  const texteNotificationPresence = config.notificationPresenceActive
    ? "Oui — notification à " +
      escapeHTML(config.heureNotificationPresence)
    : "Non";

  setContenu(`
    <div class="form-zone">
      <h2>Prévisualisation des modifications</h2>

      <div class="stats-box">
        <h3>${escapeHTML(config.nom)}</h3>

        <p>${escapeHTML(config.description)}</p>

        <p>Statut : ${escapeHTML(config.statut)}</p>

        <p>Rôles autorisés : ${escapeHTML(config.rolesAutorises)}</p>

        <p>Fermeture automatique : ${texteFermetureAuto}</p>

        <p>Notification Discord des présences : ${texteNotificationPresence}</p>
      </div>

      <button onclick='confirmerModificationCompetition(${JSON.stringify(JSON.stringify(config))})'>
        Confirmer les modifications
      </button>

      <button onclick="afficherGestionCompetitions()" class="secondary-button">
        Annuler
      </button>
    </div>
  `);
}

function confirmerModificationCompetition(configJSON) {
  const config = JSON.parse(configJSON);

  afficherChargement(
    "Modification en cours...",
    "La compétition est mise à jour."
  );

  appelAPI(
    "modifierCompetitionComplete",
    {
      config: JSON.stringify(config),
      utilisateur: utilisateurConnecte.joueur.pseudo
    },
    function(data) {
      if (!data.succes) {
        return afficherMessageModal("Erreur", data.message);
      }

      viderCacheFrontend();

      afficherMessageModal(
        "Compétition modifiée",
        "La compétition a bien été mise à jour.",
        afficherGestionCompetitions
      );
    }
  );
}

function appliquerFiltresGestionJoueurs() {
  const recherche = String(document.getElementById("rechercheJoueur")?.value || "")
    .trim()
    .toLowerCase();

  const tri = document.getElementById("triJoueurs")?.value || "pseudo";

  let joueursFiltres = joueursGestionCache.filter(function (joueur) {
    return String(joueur.pseudo || "")
      .toLowerCase()
      .includes(recherche);
  });

  joueursFiltres.sort(function (a, b) {
    if (tri === "grade") {
      return calculerPrioriteGrade(a.roles) - calculerPrioriteGrade(b.roles)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""));
    }

    if (tri === "statut") {
      return calculerPrioriteStatut(a.statut) - calculerPrioriteStatut(b.statut)
        || String(a.pseudo || "").localeCompare(String(b.pseudo || ""));
    }

    return String(a.pseudo || "").localeCompare(String(b.pseudo || ""));
  });

  afficherTableauGestionJoueurs(joueursFiltres);
}

function calculerPrioriteGrade(roles) {
  const texteRoles = String(roles || "").toLowerCase();

  if (texteRoles.includes("superadmin")) return 1;
  if (texteRoles.includes("officier")) return 2;
  if (texteRoles.includes("strateur")) return 3;
  if (texteRoles.includes("soldat")) return 4;
  if (texteRoles.includes("réserviste") || texteRoles.includes("reserviste")) return 5;
  if (texteRoles.includes("recrue")) return 6;

  return 99;
}

function calculerPrioriteStatut(statut) {
  const texteStatut = String(statut || "").toLowerCase();

  if (texteStatut === "actif") return 1;
  if (texteStatut === "inactif") return 2;
  if (texteStatut === "suspendu") return 3;

  return 99;
}

function afficherTableauGestionJoueurs(joueurs) {
  const zone = document.getElementById("zoneTableauJoueurs");

  if (!zone) return;

  let html = `
    <div class="table-container">
      <table class="presence-table">
        <thead>
          <tr>
            <th>Pseudo</th>
            <th>Grade</th>
            <th>Statut</th>
            <th>Dernière modification</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (joueurs.length === 0) {
    html += `
      <tr>
        <td colspan="5">Aucun joueur trouvé.</td>
      </tr>
    `;
  }

  joueurs.forEach(function (joueur) {
    const rolesJoueur = String(joueur.roles || "");
    const estJoueurSuperAdmin = rolesJoueur.toLowerCase().includes("superadmin");
    const estJoueurConnecte =
      String(joueur.pseudo || "").trim().toLowerCase() ===
      String(utilisateurConnecte?.joueur?.pseudo || "").trim().toLowerCase();
    const boutonSuppression =
      estSuperAdminConnecte() && !estJoueurSuperAdmin && !estJoueurConnecte
        ? `
          <button
            class="danger-button"
            onclick="confirmerSuppressionJoueur(${Number(joueur.id)})">
            🗑️ Supprimer
          </button>
        `
        : "";

    html += `
      <tr>
        <td>${escapeHTML(joueur.pseudo)}</td>
        <td>${escapeHTML(joueur.roles || "-")}</td>
        <td>${escapeHTML(joueur.statut || "-")}</td>
        <td>${escapeHTML(joueur.derniereModification || "-")}</td>
        <td>
          <button
            class="secondary-button"
            onclick='afficherFormulaireModificationJoueur(${JSON.stringify(joueur)})'>
            ✏️ Modifier
          </button>
          ${boutonSuppression}
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  zone.innerHTML = html;
}

function gererAffichageNotificationPresence() {
  const modeNotificationPresence = document.getElementById("modeNotificationPresence");
  const zoneNotificationPresence = document.getElementById("zoneNotificationPresence");

  if (!modeNotificationPresence || !zoneNotificationPresence) {
    return;
  }

  if (modeNotificationPresence.value === "oui") {
    zoneNotificationPresence.style.display = "";
  } else {
    zoneNotificationPresence.style.display = "none";
  }
}

function gererAffichageModificationNotificationPresence() {
  const modeNotificationPresence = document.getElementById("modifierModeNotificationPresence");
  const zoneNotificationPresence = document.getElementById("modifierZoneNotificationPresence");

  if (!modeNotificationPresence || !zoneNotificationPresence) {
    return;
  }

  if (modeNotificationPresence.value === "oui") {
    zoneNotificationPresence.style.display = "";
  } else {
    zoneNotificationPresence.style.display = "none";
  }
}
