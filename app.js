/* ==========================================================
   MPP OPERATIONS CENTER
   Frontend JavaScript optimisé
   Version Alpha 0.3.0
   ========================================================== */

const VERSION_SITE = "Alpha 0.3.5";
const API_URL = "https://script.google.com/macros/s/AKfycbx2_I5oyldxQdxRneO-s1m2WoCZmifII1DiJqeLpBZ0S0SRj8RC2PFq-aw-V9EjLU_jeA/exec";

let utilisateurConnecte = null;
let cacheFrontend = {
  competitions: null,
  competitionComplete: {},
  tableauPresences: {},
  donneesOfficierInitiales: null,
  timestamp: {}
};

const DUREE_CACHE_FRONT_MS = 5 * 60 * 1000;

window.onload = function () {
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

function connexion() {
  const pseudo = document.getElementById("pseudo").value.trim();
  const message = document.getElementById("message");
  if (pseudo === "") {
    message.textContent = "Merci de saisir un pseudo.";
    message.style.color = "#ff5555";
    return;
  }
  message.textContent = "Connexion en cours...";
  message.style.color = "#CFCFCF";
  appelAPI("identifierUtilisateur", { pseudo }, function (data) {
    if (!data.succes) {
      message.textContent = data.message;
      message.style.color = "#ff5555";
      return;
    }
    utilisateurConnecte = data;
    if (data.type === "officier") afficherChoixOfficier();
    else afficherCompetitionsJoueur();
  });
}

function deconnexion() {
  utilisateurConnecte = null;
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
      <button onclick="afficherConnexionOfficier()" class="secondary-button">Accéder à l’espace officier</button>
      <p class="small-link" onclick="deconnexion()">Déconnexion</p>
    </div>
  `);
}

data.competitions.forEach(function (competition) {

  if (!peutVoirCompetition(competition)) {
    return;
  }

  html += `
    <div class="competition-card">
      <h3>${escapeHTML(competition.nom)}</h3>

      <p>Statut : ${escapeHTML(competition.statut)}</p>

      <p>${escapeHTML(competition.description || "")}</p>

      ${
        peutRemplirCompetition(competition)
          ? `
            <button
              onclick="ouvrirCompetition(
                ${Number(competition.id)},
                '${jsString(competition.nom)}'
              )">
              Ouvrir
            </button>
          `
          : `
            <button
              class="secondary-button"
              disabled>
              Consultation uniquement
            </button>
          `
      }
    </div>
  `;
});

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

function ouvrirCompetition(idCompetition, nomCompetition) {
  definirModeCarte("normal");
  afficherChargement(nomCompetition, "Chargement des dates et de tes réponses...");
  const pseudo = utilisateurConnecte.joueur.pseudo;
  const cleCache = "competitionComplete_" + idCompetition + "_" + pseudo.toLowerCase();
  if (cacheFrontend.competitionComplete[cleCache] && estCacheValide(cleCache)) {
    const dataCache = cacheFrontend.competitionComplete[cleCache];
    afficherFormulairePresences(idCompetition, nomCompetition, dataCache.dates, dataCache.presences);
    return;
  }
  appelAPI("chargerCompetitionComplete", { idCompetition, pseudo }, function (data) {
    if (!data.succes) return afficherErreur(data.message);
    cacheFrontend.competitionComplete[cleCache] = data;
    cacheFrontend.timestamp[cleCache] = Date.now();
    afficherFormulairePresences(idCompetition, nomCompetition, data.dates, data.presences);
  });
}

function afficherFormulairePresences(idCompetition, nomCompetition, dates, presencesExistantes) {
  definirModeCarte("normal");
  let html = `<div class="form-zone"><h2>${escapeHTML(nomCompetition)}</h2><p>Pseudo : ${escapeHTML(utilisateurConnecte.joueur.pseudo)}</p>`;
  if (dates.length === 0) html += `<p>Aucune date définie pour cette compétition.</p>`;

  const indexPresences = {};
  presencesExistantes.forEach(function (p) {
    indexPresences[String(p.dateCompetition).trim()] = p;
  });

  dates.forEach(function (date) {
    const dateTexte = String(date.dateCompetition).trim();
    const presence = indexPresences[dateTexte] || {};
    const statutActuel = presence.statut || "Non renseigné";
    const horairesActuels = String(presence.horairesDisponibles || "").split(",").map(h => h.trim()).filter(Boolean);
    const horaires = String(date.horaires || "").split(",").map(h => h.trim()).filter(Boolean);

    html += `
      <div class="date-card">
        <h3>${escapeHTML(date.dateAffichage || dateTexte)}</h3>
        <select class="select-statut" data-date="${escapeHTML(dateTexte)}" onchange="gererAffichageHoraires(this)">
          <option value="Non renseigné" ${statutActuel === "Non renseigné" ? "selected" : ""}>⚪ Non renseigné</option>
          <option value="Présent" ${statutActuel === "Présent" ? "selected" : ""}>🟢 Présent</option>
          <option value="Absent" ${statutActuel === "Absent" ? "selected" : ""}>🔴 Absent</option>
          <option value="Remplaçant" ${statutActuel === "Remplaçant" ? "selected" : ""}>🔵 Remplaçant</option>
        </select>
        <div class="horaires-zone" style="${statutActuel === "Présent" ? "" : "display:none;"}">
          <p>Créneaux disponibles :</p>
          <div class="horaires-selection">`;

    if (horaires.length === 0) html += `<p>Aucun horaire défini pour cette date.</p>`;
    horaires.forEach(function (horaire) {
      html += `<label class="checkbox-role"><input type="checkbox" class="horaire-checkbox" value="${escapeHTML(horaire)}" ${horairesActuels.includes(horaire) ? "checked" : ""}>${escapeHTML(horaire)}</label>`;
    });
    html += `</div></div></div>`;
  });

  html += `
      <button onclick="afficherRecapitulatif(${idCompetition}, '${jsString(nomCompetition)}')">Vérifier mes réponses</button>
      <button onclick="afficherCompetitionsJoueur()" class="secondary-button">Retour</button>
    </div>`;
  setContenu(html);
}

function gererAffichageHoraires(selectElement) {
  const dateCard = selectElement.closest(".date-card");
  const horairesZone = dateCard.querySelector(".horaires-zone");
  if (!horairesZone) return;
  if (selectElement.value === "Présent") horairesZone.style.display = "";
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
    if (statut === "Présent") {
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
    if (presence.statut === "Présent") texteHoraires = presence.horairesDisponibles ? ` — Horaires : ${escapeHTML(presence.horairesDisponibles)}` : " — Aucun horaire sélectionné";
    html += `<p><strong>${escapeHTML(presence.dateCompetition)}</strong> → ${escapeHTML(presence.statut)}${texteHoraires}</p>`;
  });
  html += `</div><div class="recap-box"><p>🟢 Présent : ${nbPresent}</p><p>🔴 Absent : ${nbAbsent}</p><p>🔵 Remplaçant : ${nbRemplacant}</p><p>⚪ Non renseigné : ${nbNonRenseigne}</p></div>
    <button onclick='confirmerPresences(${idCompetition}, ${JSON.stringify(JSON.stringify(presences))})'>Confirmer</button>
    <button onclick="ouvrirCompetition(${idCompetition}, '${jsString(nomCompetition)}')" class="secondary-button">Modifier</button></div>`;
  setContenu(html);
}

function confirmerPresences(idCompetition, presencesJSON) {
  const presences = JSON.parse(presencesJSON);
  const pseudo = utilisateurConnecte.joueur.pseudo;
  afficherChargement("Sauvegarde en cours...", "Merci de patienter.");
  appelAPI("sauvegarderPresences", { idCompetition, pseudo, presences: JSON.stringify(presences) }, function (data) {
    if (!data.succes) return afficherErreur(data.message, `<button onclick="ouvrirCompetition(${idCompetition}, 'Compétition')">Retour</button>`);
    viderCacheFrontend();
    setContenu(`<div class="form-zone"><h2>Disponibilités enregistrées ✅</h2><p>${escapeHTML(data.message)}</p><p>Ajouts : ${data.ajouts}</p><p>Modifications : ${data.modifications}</p><button onclick="afficherCompetitionsJoueur()">Retour aux compétitions</button></div>`);
  });
}

function afficherConnexionOfficier() {
  definirModeCarte("normal");
  const estSuperAdmin = utilisateurConnecte.joueur.pseudo.toLowerCase() === "raiju153";
  setContenu(`
    <div class="form-zone">
      <h2>Accès officier</h2>
      <p>Connecté : ${escapeHTML(utilisateurConnecte.joueur.pseudo)}</p>
      <label for="mdpOfficier">${estSuperAdmin ? "Mot de passe Super Admin" : "Mot de passe Officier"}</label>
      <input type="password" id="mdpOfficier" placeholder="${estSuperAdmin ? "Mot de passe Super Admin" : "Mot de passe Officier"}" onkeydown="if(event.key==='Enter'){verifierAccesOfficier();}">
      <button onclick="verifierAccesOfficier()">Valider</button>
      <button onclick="afficherChoixOfficier()" class="secondary-button">Retour</button>
      <p id="message"></p>
    </div>`);
}

function verifierAccesOfficier() {
  const motDePasse = document.getElementById("mdpOfficier").value;
  const message = document.getElementById("message");
  if (motDePasse === "") {
    message.textContent = "Merci de saisir le mot de passe.";
    message.style.color = "#ff5555";
    return;
  }
  message.textContent = "Vérification...";
  message.style.color = "#CFCFCF";
  const estSuperAdmin = utilisateurConnecte.joueur.pseudo.toLowerCase() === "raiju153";
  const actionAPI = estSuperAdmin ? "verifierMotDePasseSuperAdmin" : "verifierMotDePasseOfficier";
  appelAPI(actionAPI, { pseudo: utilisateurConnecte.joueur.pseudo, motDePasse }, function(data) {
    if (!data.succes) {
      message.textContent = data.message;
      message.style.color = "#ff5555";
      return;
    }
    afficherEspaceOfficier();
  });
}

function afficherEspaceOfficier() {

  definirModeCarte("large");

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
    function(data) {

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

        <button class="secondary-button" onclick="afficherGestionJoueurs()">
          👥 Gérer les joueurs
        </button>

        <button class="secondary-button" onclick="afficherJournalActivite()">
          📜 Journal d'activité
        </button>
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
    if (!data.succes) return afficherErreur(data.message, `<button onclick="afficherEspaceOfficier()">Retour</button>`);
    let html = `<div class="form-zone"><h2>Choisir une compétition</h2>`;
    data.competitions.forEach(function (competition) {
      html += `<div class="competition-card"><h3>${escapeHTML(competition.nom)}</h3><p>Statut : ${escapeHTML(competition.statut)}</p><p>${escapeHTML(competition.description || "")}</p><button onclick="afficherTableauPresencesOfficier(${Number(competition.id)}, '${jsString(competition.nom)}')">Voir les présences</button></div>`;
    });
    html += `<button onclick="afficherEspaceOfficier()" class="secondary-button">Retour</button></div>`;
    setContenu(html);
  });
}

function afficherTableauPresencesOfficier(idCompetition, nomCompetition) {
  definirModeCarte("large");
  afficherChargement(nomCompetition, "Chargement du tableau...");
  const cleCache = "tableau_" + idCompetition;
  if (cacheFrontend.tableauPresences[cleCache] && estCacheValide(cleCache)) {
    construireTableauPresencesOfficier(idCompetition, nomCompetition, cacheFrontend.tableauPresences[cleCache]);
    return;
  }
  appelAPI("genererTableauPresences", { idCompetition }, function (data) {
    if (!data.succes) return afficherErreur(data.message);
    cacheFrontend.tableauPresences[cleCache] = data;
    cacheFrontend.timestamp[cleCache] = Date.now();
    construireTableauPresencesOfficier(idCompetition, nomCompetition, data);
  });
}

function construireTableauPresencesOfficier(idCompetition, nomCompetition, data) {
  const stats = calculerStatistiquesTableau(data.lignes);
  const statsParDate = calculerStatistiquesParDate(data.dates, data.lignes);
  const effectifParHoraire = calculerEffectifParHoraire(data.dates, data.lignes);
  let html = `<div class="form-zone"><h2>${escapeHTML(nomCompetition)}</h2><div class="table-container"><table class="presence-table"><thead><tr><th>Joueur</th>`;
  data.dates.forEach(function (date) {
    html += `<th class="date-header" title="${escapeHTML(date.dateCompetition)}"><div class="date-jour">${escapeHTML(date.jourCourt || "")}</div><div class="date-numero">${escapeHTML(date.jourNumero || date.dateCompetition)}</div><div class="date-mois">${escapeHTML(date.moisCourt || "")}</div></th>`;
  });
  html += `<th>Synthèse</th></tr></thead><tbody>`;
  data.lignes.forEach(function (ligne) {
    html += `<tr><td>${escapeHTML(ligne.pseudo)}</td>`;
    ligne.disponibilites.forEach(function (dispo) {
      html += `<td onclick='afficherDetailPresence(${JSON.stringify(JSON.stringify(ligne.pseudo))}, ${JSON.stringify(JSON.stringify(dispo))})'>${formaterAffichagePresence(dispo)}</td>`;
    });
    html += `<td>${escapeHTML(ligne.synthese)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="stats-box"><h3>Statistiques générales</h3><p>🟢 Présents : ${stats.presents}</p><p>🔵 Remplaçants : ${stats.remplacants}</p><p>🔴 Absents : ${stats.absents}</p><p>⚪ Non renseignés : ${stats.nonRenseignes}</p><p><strong>Taux de réponse : ${stats.tauxReponse}%</strong></p></div>`;
  html += `<div class="stats-box"><h3>Effectif par date</h3><div class="table-container"><table class="presence-table"><thead><tr><th>Date</th><th>🟢 Présents</th><th>🔵 Remplaçants</th><th>🔴 Absents</th><th>⚪ Sans réponse</th></tr></thead><tbody>`;
  statsParDate.forEach(function (s) { html += `<tr><td>${escapeHTML(s.dateAffichage)}</td><td>${s.presents}</td><td>${s.remplacants}</td><td>${s.absents}</td><td>${s.nonRenseignes}</td></tr>`; });
  html += `</tbody></table></div></div>`;
  html += `<div class="stats-box"><h3>📊 Effectif par horaire</h3>`;
  effectifParHoraire.forEach(function (dateInfo) {
    html += `<div class="horaire-date-block"><h4>${escapeHTML(dateInfo.dateAffichage)}</h4><div class="table-container"><table class="presence-table horaire-table"><thead><tr><th>Horaire</th><th>🟢 Présents</th><th>🔵 Remplaçants</th><th>🔴 Absents</th><th>⚪ Sans réponse</th></tr></thead><tbody>`;
    if (dateInfo.horaires.length === 0) html += `<tr><td colspan="5">Aucun horaire défini pour cette date.</td></tr>`;
    dateInfo.horaires.forEach(function (h) { html += `<tr><td>${escapeHTML(h.horaire)}</td><td>${h.presents}</td><td>${h.remplacants}</td><td>${h.absents}</td><td>${h.nonRenseignes}</td></tr>`; });
    html += `</tbody></table></div></div>`;
  });
  html += `</div><div class="table-actions"><button onclick="exporterCSV(${idCompetition}, '${jsString(nomCompetition)}')">📥 Exporter CSV</button><button onclick="chargerSansReponse(${idCompetition}, '${jsString(nomCompetition)}')" class="secondary-button">Voir les sans réponse</button><button onclick="afficherSelectionCompetitionOfficier()" class="secondary-button">Retour</button></div></div>`;
  setContenu(html);
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

      const statut = String(competition.statut || "").toLowerCase();

      html += `
        <div class="competition-card">
          <h3>${escapeHTML(competition.nom)}</h3>

          <p>Statut : ${escapeHTML(competition.statut)}</p>

          <p>Rôles autorisés : ${escapeHTML(competition.rolesAutorises || "Tous")}</p>

          <p>${escapeHTML(competition.description || "")}</p>
      `;

      if (statut !== "archivée") {

        html += `
          <button
            onclick="afficherGestionDatesCompetition(${Number(competition.id)}, '${jsString(competition.nom)}')"
            class="secondary-button">
            📅 Gérer les dates
          </button>
        `;
      }

      if (estOfficierConnecte() || estSuperAdminConnecte()) {

        if (statut === "brouillon" || statut === "fermée") {
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

        if (statut !== "archivée") {
          html += `
            <button
              onclick="changerStatutCompetition(${Number(competition.id)}, 'Archivée')"
              class="secondary-button">
              📦 Archiver
            </button>
          `;
        }

        if (statut === "archivée") {
          html += `
            <button
              onclick="confirmerSuppressionCompetition(${Number(competition.id)}, '${jsString(competition.nom)}')"
              class="danger-button">
              🗑️ Supprimer définitivement
            </button>
          `;
        }
      }

      html += `
        </div>
      `;
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
  afficherMessageModal(
    "Suppression non active",
    "La suppression définitive sera ajoutée à l'étape suivante pour : " + escapeHTML(nomCompetition)
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
    <div class="form-zone"><h2>Créer une compétition</h2>
      <div class="stats-box"><h3>1. Informations générales</h3><label for="nomCompetition">Nom de la compétition</label><input type="text" id="nomCompetition" placeholder="Ex : Campagne Juin 2026"><label for="descriptionCompetition">Description</label><input type="text" id="descriptionCompetition" placeholder="Ex : Campagne principale du clan MPP"><label>Rôles autorisés</label><div class="roles-selection">
        <label class="checkbox-role"><input type="checkbox" id="roleOfficier" checked>Officier</label><label class="checkbox-role"><input type="checkbox" id="roleStrateur" checked>Strateur</label><label class="checkbox-role"><input type="checkbox" id="roleSoldat" checked>Soldat</label><label class="checkbox-role"><input type="checkbox" id="roleReserviste">Réserviste</label><label class="checkbox-role"><input type="checkbox" id="roleRecrue">Recrue</label></div><label for="statutCompetition">Statut initial</label><select id="statutCompetition"><option value="Brouillon">Brouillon</option><option value="Ouverte">Ouverte</option><option value="Fermée">Fermée</option><option value="Archivée">Archivée</option></select></div>
      <div class="stats-box"><h3>2. Calendrier</h3><label for="dateDebutCompetition">Date de début</label><input type="date" id="dateDebutCompetition"><label for="dateFinCompetition">Date de fin</label><input type="date" id="dateFinCompetition"><label>Jours concernés</label><div class="roles-selection"><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="1" checked>Lundi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="2" checked>Mardi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="3" checked>Mercredi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="4" checked>Jeudi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="5" checked>Vendredi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="6">Samedi</label><label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="0">Dimanche</label></div><label for="horairesCompetition">Horaires</label><input type="text" id="horairesCompetition" value="21:00,21:15,21:30"><p>Format attendu : 21:00,21:15,21:30</p></div>
      <button onclick="previsualiserCreationCompetition()">Prévisualiser la création</button><button onclick="afficherGestionCompetitions()" class="secondary-button">Annuler</button>
    </div>`);
}

function previsualiserCreationCompetition() {
  const nom = document.getElementById("nomCompetition").value.trim();
  const description = document.getElementById("descriptionCompetition").value.trim();
  const statut = document.getElementById("statutCompetition").value;
  const dateDebut = document.getElementById("dateDebutCompetition").value;
  const dateFin = document.getElementById("dateFinCompetition").value;
  const horaires = document.getElementById("horairesCompetition").value.trim();
  const roles = recupererRolesCreationCompetition();
  const joursSelectionnes = recupererJoursSelectionnes();
  if (!nom) return afficherMessageModal("Erreur", "Merci de saisir un nom de compétition.");
  if (roles.length === 0) return afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle autorisé.");
  if (!dateDebut || !dateFin) return afficherMessageModal("Erreur", "Merci de sélectionner une date de début et une date de fin.");
  if (new Date(dateFin) < new Date(dateDebut)) return afficherMessageModal("Erreur", "La date de fin doit être après la date de début.");
  if (joursSelectionnes.length === 0) return afficherMessageModal("Erreur", "Merci de sélectionner au moins un jour concerné.");
  if (!horaires) return afficherMessageModal("Erreur", "Merci de saisir au moins un horaire.");
  const datesGenerees = genererDatesDepuisPeriode(dateDebut, dateFin, joursSelectionnes);
  if (datesGenerees.length === 0) return afficherMessageModal("Erreur", "Aucune date générée avec ces paramètres.");
  afficherRecapCreationCompetition({ nom, description, statut, rolesAutorises: roles.join(","), dates: datesGenerees, horaires });
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
  let htmlDates = config.dates.map(d => `<p>📅 ${escapeHTML(d)}</p>`).join("");
  setContenu(`<div class="form-zone"><h2>Prévisualisation</h2><div class="stats-box"><h3>${escapeHTML(config.nom)}</h3><p>${escapeHTML(config.description)}</p><p>Statut : ${escapeHTML(config.statut)}</p><p>Rôles autorisés : ${escapeHTML(config.rolesAutorises)}</p><p>Horaires : ${escapeHTML(config.horaires)}</p><p>Nombre de dates générées : ${config.dates.length}</p></div><div class="stats-box"><h3>Dates générées</h3>${htmlDates}</div><button onclick='confirmerCreationCompetitionComplete(${JSON.stringify(JSON.stringify(config))})'>Confirmer la création</button><button onclick="afficherFormulaireCreationCompetition()" class="secondary-button">Modifier</button></div>`);
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

function afficherGestionJoueurs() {
  definirModeCarte("large");
  afficherChargement("Gestion des joueurs");
  appelAPI("chargerJoueurs", {}, function (data) {
    if (!data.succes) return afficherMessageModal("Erreur", data.message);
    let html = `<div class="form-zone"><h2>Gestion des joueurs</h2><button onclick="afficherFormulaireAjoutJoueur()">➕ Ajouter un joueur</button><div class="table-container"><table class="presence-table"><thead><tr><th>Pseudo</th><th>Rôles</th><th>Statut</th><th>Dernière modification</th><th>Actions</th></tr></thead><tbody>`;
    data.joueurs.forEach(function (joueur) {
      html += `<tr><td>${escapeHTML(joueur.pseudo)}</td><td>${escapeHTML(joueur.roles)}</td><td>${escapeHTML(joueur.statut)}</td><td>${escapeHTML(joueur.derniereModification || "-")}</td><td><button class="secondary-button" onclick='afficherFormulaireModificationJoueur(${JSON.stringify(joueur)})'>✏️ Modifier</button></td></tr>`;
    });
    html += `</tbody></table></div><button onclick="afficherEspaceOfficier()" class="secondary-button">Retour</button></div>`;
    setContenu(html);
  });
}

function afficherFormulaireAjoutJoueur() {
  definirModeCarte("large");
  setContenu(`<div class="form-zone"><h2>Ajouter un joueur</h2><label for="nouveauPseudoJoueur">Pseudo WoT</label><input type="text" id="nouveauPseudoJoueur" placeholder="Ex : NouveauJoueur"><label>Rôles</label><div class="roles-selection"><label class="checkbox-role"><input type="checkbox" id="joueurRoleOfficier">Officier</label><label class="checkbox-role"><input type="checkbox" id="joueurRoleStrateur">Strateur</label><label class="checkbox-role"><input type="checkbox" id="joueurRoleSoldat" checked>Soldat</label><label class="checkbox-role"><input type="checkbox" id="joueurRoleReserviste">Réserviste</label><label class="checkbox-role"><input type="checkbox" id="joueurRoleRecrue">Recrue</label></div><label for="nouveauStatutJoueur">Statut</label><select id="nouveauStatutJoueur"><option value="Actif">Actif</option><option value="Inactif">Inactif</option><option value="Suspendu">Suspendu</option></select><button onclick="ajouterJoueurDepuisSite()">Créer le joueur</button><button onclick="afficherGestionJoueurs()" class="secondary-button">Annuler</button></div>`);
}

function recupererRolesJoueur(prefixe) {
  const roles = [];
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
  setContenu(`<div class="form-zone"><h2>Modifier un joueur</h2><label for="modifierPseudoJoueur">Pseudo WoT</label><input type="text" id="modifierPseudoJoueur" value="${escapeHTML(joueur.pseudo)}"><label>Rôles</label><div class="roles-selection"><label class="checkbox-role"><input type="checkbox" id="modifierRoleOfficier" ${rolesActuels.includes("Officier") ? "checked" : ""}>Officier</label><label class="checkbox-role"><input type="checkbox" id="modifierRoleStrateur" ${rolesActuels.includes("Strateur") ? "checked" : ""}>Strateur</label><label class="checkbox-role"><input type="checkbox" id="modifierRoleSoldat" ${rolesActuels.includes("Soldat") ? "checked" : ""}>Soldat</label><label class="checkbox-role"><input type="checkbox" id="modifierRoleReserviste" ${rolesActuels.includes("Réserviste") ? "checked" : ""}>Réserviste</label><label class="checkbox-role"><input type="checkbox" id="modifierRoleRecrue" ${rolesActuels.includes("Recrue") ? "checked" : ""}>Recrue</label></div><label for="modifierStatutJoueur">Statut</label><select id="modifierStatutJoueur"><option value="Actif" ${joueur.statut === "Actif" ? "selected" : ""}>Actif</option><option value="Inactif" ${joueur.statut === "Inactif" ? "selected" : ""}>Inactif</option><option value="Suspendu" ${joueur.statut === "Suspendu" ? "selected" : ""}>Suspendu</option></select><button onclick="modifierJoueurDepuisSite(${Number(joueur.id)})">Enregistrer les modifications</button><button onclick="afficherGestionJoueurs()" class="secondary-button">Annuler</button></div>`);
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

function exporterCSV(idCompetition, nomCompetition) {
  appelAPI("genererExportCSV", { idCompetition }, function (data) {
    if (!data.succes) return alert(data.message);
    const blob = new Blob(["\uFEFF" + data.csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    const url = URL.createObjectURL(blob);
    lien.href = url;
    lien.download = "presences_" + nomCompetition.replaceAll(" ", "_").replaceAll("/", "-") + ".csv";
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(url);
  });
}

function formaterAffichagePresence(dispo) {
  if (dispo.statut === "Présent") {
    const horaires = String(dispo.horairesDisponibles || "").split(",").map(h => h.trim()).filter(Boolean);
    return horaires.length > 0 ? "🟢(" + horaires.length + ")" : "🟢";
  }
  if (dispo.statut === "Absent") return "🔴";
  if (dispo.statut === "Remplaçant") return "🔵";
  return "⚪";
}

function afficherDetailPresence(pseudoJSON, dispoJSON) {
  const pseudo = JSON.parse(pseudoJSON);
  const dispo = JSON.parse(dispoJSON);
  const horairesSelectionnes = String(dispo.horairesDisponibles || "").split(",").map(h => h.trim()).filter(Boolean);
  let horairesHTML = "";
  if (dispo.statut === "Présent" && horairesSelectionnes.length > 0) horairesHTML = horairesSelectionnes.map(h => `<span class="horaire-badge">✅ ${escapeHTML(h)}</span>`).join("");
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
    return { dateAffichage: dateInfo.dateAffichage, presents, absents, remplacants, nonRenseignes };
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
  const nomCallback = "callback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

  let script = document.createElement("script");
  let timeout;

  console.log("API ▶️", action, parametres);

  window[nomCallback] = function (reponse) {
    clearTimeout(timeout);

    const duree = Math.round(performance.now() - debut);
    console.log("API ✅", action, duree + " ms", reponse);

    try {
      callback(reponse);
    } finally {
      delete window[nomCallback];

      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }
  };

  let url = API_URL + "?action=" + encodeURIComponent(action);

  for (const cle in parametres) {
    url += "&" + encodeURIComponent(cle) + "=" + encodeURIComponent(parametres[cle]);
  }

  url += "&callback=" + encodeURIComponent(nomCallback);
  url += "&t=" + Date.now();

  script.src = url;

  script.onerror = function () {
    clearTimeout(timeout);
    delete window[nomCallback];

    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }

    afficherMessageModal("Erreur", "Erreur de connexion à l'API.");
  };

  timeout = setTimeout(function () {
    delete window[nomCallback];

    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }

    afficherMessageModal(
      "Temps d'attente dépassé",
      "Le serveur met trop de temps à répondre. Réessaie dans quelques secondes."
    );
  }, 30000);

  document.body.appendChild(script);
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
  return utilisateurConnecte?.joueur?.pseudo?.toLowerCase() === "raiju153";
}

function peutVoirCompetition(competition) {

  const statut = String(competition.statut || "").toLowerCase();

  if (statut === "archivée") {
    return estSuperAdminConnecte();
  }

  if (statut === "brouillon") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  return true;
}

function peutRemplirCompetition(competition) {

  const statut = String(competition.statut || "").toLowerCase();

  if (statut === "ouverte") {
    return true;
  }

  if (statut === "brouillon") {
    return estOfficierConnecte() || estSuperAdminConnecte();
  }

  return false;
}

function peutModifierCompetition(competition) {

  const statut = String(competition.statut || "").toLowerCase();

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