const VERSION_SITE = "Alpha 0.2.0";

const API_URL =
  "https://script.google.com/macros/s/AKfycbx2_I5oyldxQdxRneO-s1m2WoCZmifII1DiJqeLpBZ0S0SRj8RC2PFq-aw-V9EjLU_jeA/exec";

let utilisateurConnecte = null;

/**
 * Affiche la page de connexion au chargement du site.
 */
window.onload = function () {
  afficherConnexion();
  afficherVersionSite();
};

/**
 * Affiche l'écran de connexion.
 */
function afficherConnexion() {
  definirModeCarte("normal");
  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <label for="pseudo">Pseudo World of Tanks</label>
      <input type="text" id="pseudo" placeholder="Ex : Raiju153">

      <button onclick="connexion()">ACCÈS OPÉRATIONNEL</button>

      <p id="message"></p>
    </div>
  `;
}

/**
 * Connexion par pseudo.
 */
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

  appelAPI("identifierUtilisateur", { pseudo: pseudo }, function (data) {
    if (!data.succes) {
      message.textContent = data.message;
      message.style.color = "#ff5555";
      return;
    }

    utilisateurConnecte = data;

    if (data.type === "officier") {
      afficherChoixOfficier();
    } else {
      afficherCompetitionsJoueur();
    }
  });
}

/**
 * Si le pseudo est officier, on propose deux choix.
 */
function afficherChoixOfficier() {
  definirModeCarte("normal");
  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Bonjour ${utilisateurConnecte.joueur.pseudo}</h2>
      <p>Que souhaites-tu faire ?</p>

      <button onclick="afficherCompetitionsJoueur()">Remplir mes présences</button>
      <button onclick="afficherEspaceOfficier()" class="secondary-button">Accéder à l’espace officier</button>

      <p class="small-link" onclick="deconnexion()">Déconnexion</p>
    </div>
  `;
}

/**
 * Charge et affiche les compétitions disponibles.
 */
function afficherCompetitionsJoueur() {
  definirModeCarte("normal");
  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Compétitions disponibles</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI("chargerCompetitions", {}, function (data) {
    if (!data.succes) {
      contenu.innerHTML = `<p class="error">${data.message}</p>`;
      return;
    }

    let html = `
        <div class="form-zone">
          <h2>Compétitions disponibles</h2>
      `;

    if (data.competitions.length === 0) {
      html += `<p>Aucune compétition disponible.</p>`;
    }

    data.competitions.forEach(function (competition) {
      html += `
          <div class="competition-card">
            <h3>${competition.nom}</h3>
            <p>Statut : ${competition.statut}</p>
            <p>${competition.description || ""}</p>
            <button onclick="ouvrirCompetition(${competition.id}, '${competition.nom.replace(/'/g, "\\'")}')">
              Ouvrir
            </button>
          </div>
        `;
    });

    html += `
          <p class="small-link" onclick="deconnexion()">Déconnexion</p>
        </div>
      `;

    contenu.innerHTML = html;
  });
}

/**
 * Pour le moment, on affiche juste la compétition choisie.
 * L'étape suivante chargera les dates.
 */
function ouvrirCompetition(idCompetition, nomCompetition) {
  const contenu = document.getElementById("contenu");
  const pseudo = utilisateurConnecte.joueur.pseudo;

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>${nomCompetition}</h2>
      <p>Chargement des dates...</p>
    </div>
  `;

  appelAPI(
    "chargerDatesCompetition",
    { idCompetition: idCompetition },
    function (resultatDates) {
      if (!resultatDates.succes) {
        contenu.innerHTML = `<p class="error">${resultatDates.message}</p>`;
        return;
      }

      appelAPI(
        "chargerPresencesJoueur",
        {
          idCompetition: idCompetition,
          pseudo: pseudo,
        },
        function (resultatPresences) {
          if (!resultatPresences.succes) {
            contenu.innerHTML = `<p class="error">${resultatPresences.message}</p>`;
            return;
          }

          afficherFormulairePresences(
            idCompetition,
            nomCompetition,
            resultatDates.dates,
            resultatPresences.presences,
          );
        },
      );
    },
  );
}

function afficherFormulairePresences(
  idCompetition,
  nomCompetition,
  dates,
  presencesExistantes,
) {
  definirModeCarte("normal");

  const contenu = document.getElementById("contenu");

  let html = `
    <div class="form-zone">
      <h2>${nomCompetition}</h2>
      <p>Pseudo : ${utilisateurConnecte.joueur.pseudo}</p>
  `;

  if (dates.length === 0) {
    html += `<p>Aucune date définie pour cette compétition.</p>`;
  }

  dates.forEach(function (date) {
    const dateTexte = String(date.dateCompetition).trim();
    const dateAffichage = date.dateAffichage || dateTexte;

    const horaires = String(date.horaires || "")
      .split(",")
      .map(function (h) {
        return h.trim();
      })
      .filter(function (h) {
        return h !== "";
      });

    let statutActuel = "Non renseigné";
    let horairesActuels = [];

    presencesExistantes.forEach(function (presence) {
      if (String(presence.dateCompetition).trim() === dateTexte) {
        statutActuel = presence.statut;

        horairesActuels = String(presence.horairesDisponibles || "")
          .split(",")
          .map(function (h) {
            return h.trim();
          })
          .filter(function (h) {
            return h !== "";
          });
      }
    });

    html += `
      <div class="date-card">
        <h3>${dateAffichage}</h3>

        <select class="select-statut" data-date="${dateTexte}" onchange="gererAffichageHoraires(this)">
          <option value="Non renseigné" ${statutActuel === "Non renseigné" ? "selected" : ""}>⚪ Non renseigné</option>
          <option value="Présent" ${statutActuel === "Présent" ? "selected" : ""}>🟢 Présent</option>
          <option value="Absent" ${statutActuel === "Absent" ? "selected" : ""}>🔴 Absent</option>
          <option value="Remplaçant" ${statutActuel === "Remplaçant" ? "selected" : ""}>🔵 Remplaçant</option>
        </select>

        <div class="horaires-zone" style="${statutActuel === "Présent" ? "" : "display:none;"}">
          <p>Créneaux disponibles :</p>

          <div class="horaires-selection">
    `;

    if (horaires.length === 0) {
      html += `<p>Aucun horaire défini pour cette date.</p>`;
    }

    horaires.forEach(function (horaire) {
      const checked = horairesActuels.includes(horaire) ? "checked" : "";

      html += `
        <label class="checkbox-role">
          <input type="checkbox" class="horaire-checkbox" value="${horaire}" ${checked}>
          ${horaire}
        </label>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;
  });

  html += `
      <button onclick="afficherRecapitulatif(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">
        Vérifier mes réponses
      </button>

      <button onclick="afficherCompetitionsJoueur()" class="secondary-button">
        Retour
      </button>
    </div>
  `;

  contenu.innerHTML = html;
}

function afficherRecapitulatif(idCompetition, nomCompetition) {
  const selects = document.querySelectorAll(".select-statut");
  const presences = [];

  let nbPresent = 0;
  let nbAbsent = 0;
  let nbRemplacant = 0;
  let nbNonRenseigne = 0;

  selects.forEach(function (select) {
    const dateCard = select.closest(".date-card");

    const dateCompetition = select.dataset.date;
    const statut = select.value;

    let horairesDisponibles = [];

    if (statut === "Présent") {
      const casesHoraires = dateCard.querySelectorAll(".horaire-checkbox");

      casesHoraires.forEach(function (caseHoraire) {
        if (caseHoraire.checked) {
          horairesDisponibles.push(caseHoraire.value);
        }
      });
    }

    presences.push({
      dateCompetition: dateCompetition,
      statut: statut,
      horairesDisponibles: horairesDisponibles.join(","),
    });

    if (statut === "Présent") {
      nbPresent++;
    } else if (statut === "Absent") {
      nbAbsent++;
    } else if (statut === "Remplaçant") {
      nbRemplacant++;
    } else {
      nbNonRenseigne++;
    }
  });

  let html = `
    <div class="form-zone">
      <h2>Vérification</h2>
      <p>${nomCompetition}</p>

      <div class="recap-box">
  `;

  presences.forEach(function (presence) {
    let texteHoraires = "";

    if (presence.statut === "Présent") {
      texteHoraires = presence.horairesDisponibles
        ? ` — Horaires : ${presence.horairesDisponibles}`
        : " — Aucun horaire sélectionné";
    }

    html += `
      <p>
        <strong>${presence.dateCompetition}</strong>
        → ${presence.statut}${texteHoraires}
      </p>
    `;
  });

  html += `
      </div>

      <div class="recap-box">
        <p>🟢 Présent : ${nbPresent}</p>
        <p>🔴 Absent : ${nbAbsent}</p>
        <p>🔵 Remplaçant : ${nbRemplacant}</p>
        <p>⚪ Non renseigné : ${nbNonRenseigne}</p>
      </div>

      <button onclick='confirmerPresences(${idCompetition}, ${JSON.stringify(JSON.stringify(presences))})'>
        Confirmer
      </button>

      <button onclick="ouvrirCompetition(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')" class="secondary-button">
        Modifier
      </button>
    </div>
  `;

  document.getElementById("contenu").innerHTML = html;
}

function confirmerPresences(idCompetition, presencesJSON) {
  const presences = JSON.parse(presencesJSON);
  const pseudo = utilisateurConnecte.joueur.pseudo;

  document.getElementById("contenu").innerHTML = `
    <div class="form-zone">
      <h2>Sauvegarde en cours...</h2>
      <p>Merci de patienter.</p>
    </div>
  `;

  appelAPI(
    "sauvegarderPresences",
    {
      idCompetition: idCompetition,
      pseudo: pseudo,
      presences: JSON.stringify(presences),
    },
    function (data) {
      if (!data.succes) {
        document.getElementById("contenu").innerHTML = `
          <div class="form-zone">
            <h2>Erreur</h2>
            <p class="error">${data.message}</p>
            <button onclick="ouvrirCompetition(${idCompetition}, 'Compétition')">Retour</button>
          </div>
        `;
        return;
      }

      document.getElementById("contenu").innerHTML = `
        <div class="form-zone">
          <h2>Disponibilités enregistrées ✅</h2>
          <p>${data.message}</p>
          <p>Ajouts : ${data.ajouts}</p>
          <p>Modifications : ${data.modifications}</p>

          <button onclick="afficherCompetitionsJoueur()">Retour aux compétitions</button>
        </div>
      `;
    },
  );
}

/**
 * Affiche le menu principal de l'espace officier.
 *
 * Pour le moment, seul le bouton "Consulter les présences"
 * sera vraiment développé.
 */
function afficherEspaceOfficier() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Tableau de bord officier</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI("chargerTableauDeBord", {}, function (data) {
    if (!data.succes) {
      afficherMessageModal("Erreur", data.message);
      return;
    }

    contenu.innerHTML = `
        <div class="form-zone">
          <h2>Tableau de bord officier</h2>
          <p>Connecté en tant que : ${utilisateurConnecte.joueur.pseudo}</p>

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
      `;
  });
}

/**
 * Affiche la liste des compétitions côté officier.
 *
 * Contrairement à l'espace joueur, l'officier voit toutes les compétitions :
 * - Brouillon
 * - Ouverte
 * - Fermée
 * - Archivée
 */
function afficherSelectionCompetitionOfficier() {
  definirModeCarte("large");
  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Choisir une compétition</h2>
      <p>Chargement des compétitions...</p>
    </div>
  `;

  appelAPI("chargerCompetitions", {}, function (data) {
    if (!data.succes) {
      contenu.innerHTML = `
          <div class="form-zone">
            <h2>Erreur</h2>
            <p class="error">${data.message}</p>
            <button onclick="afficherEspaceOfficier()">Retour</button>
          </div>
        `;
      return;
    }

    let html = `
        <div class="form-zone">
          <h2>Choisir une compétition</h2>
      `;

    data.competitions.forEach(function (competition) {
      html += `
          <div class="competition-card">
            <h3>${competition.nom}</h3>
            <p>Statut : ${competition.statut}</p>
            <p>${competition.description || ""}</p>

            <button onclick="afficherTableauPresencesOfficier(${competition.id}, '${competition.nom.replace(/'/g, "\\'")}')">
              Voir les présences
            </button>
          </div>
        `;
    });

    html += `
          <button onclick="afficherEspaceOfficier()" class="secondary-button">
            Retour
          </button>
        </div>
      `;

    contenu.innerHTML = html;
  });
}

function afficherTableauPresencesOfficier(idCompetition, nomCompetition) {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>${nomCompetition}</h2>
      <p>Chargement du tableau...</p>
    </div>
  `;

  appelAPI(
    "genererTableauPresences",
    { idCompetition: idCompetition },
    function (data) {
      if (!data.succes) {
        contenu.innerHTML = `
          <div class="form-zone">
            <h2>Erreur</h2>
            <p class="error">${data.message}</p>
          </div>
        `;
        return;
      }

      const stats = calculerStatistiquesTableau(data.lignes);
      const statsParDate = calculerStatistiquesParDate(data.dates, data.lignes);
      const effectifParHoraire = calculerEffectifParHoraire(
        data.dates,
        data.lignes,
      );

      let html = `
        <div class="form-zone">
          <h2>${nomCompetition}</h2>

          <div class="table-container">
            <table class="presence-table">
              <thead>
                <tr>
                  <th>Joueur</th>
      `;

      data.dates.forEach(function (date) {
        html += `
          <th class="date-header" title="${date.dateCompetition}">
            <div class="date-jour">${date.jourCourt || ""}</div>
            <div class="date-numero">${date.jourNumero || date.dateCompetition}</div>
            <div class="date-mois">${date.moisCourt || ""}</div>
          </th>
        `;
      });

      html += `
                  <th>Synthèse</th>
                </tr>
              </thead>
              <tbody>
      `;

      data.lignes.forEach(function (ligne) {
        html += `
          <tr>
            <td>${ligne.pseudo}</td>
        `;

        ligne.disponibilites.forEach(function (dispo) {
          html += `
            <td onclick='afficherDetailPresence(${JSON.stringify(JSON.stringify(ligne.pseudo))}, ${JSON.stringify(JSON.stringify(dispo))})'>
              ${formaterAffichagePresence(dispo)}
            </td>
          `;
        });

        html += `
            <td>${ligne.synthese}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>

          <div class="stats-box">
            <h3>Statistiques générales</h3>
            <p>🟢 Présents : ${stats.presents}</p>
            <p>🔵 Remplaçants : ${stats.remplacants}</p>
            <p>🔴 Absents : ${stats.absents}</p>
            <p>⚪ Non renseignés : ${stats.nonRenseignes}</p>
            <p><strong>Taux de réponse : ${stats.tauxReponse}%</strong></p>
          </div>

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

      statsParDate.forEach(function (statDate) {
        html += `
          <tr>
            <td>${statDate.dateAffichage}</td>
            <td>${statDate.presents}</td>
            <td>${statDate.remplacants}</td>
            <td>${statDate.absents}</td>
            <td>${statDate.nonRenseignes}</td>
          </tr>
        `;
      });

      html += `
                </tbody>
              </table>
            </div>
          </div>

          <div class="stats-box">
            <h3>📊 Effectif par horaire</h3>
      `;

      effectifParHoraire.forEach(function (dateInfo) {
        html += `
          <div class="horaire-date-block">
            <h4>${dateInfo.dateAffichage}</h4>
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
          html += `
            <tr>
              <td colspan="5">Aucun horaire défini pour cette date.</td>
            </tr>
          `;
        }

        dateInfo.horaires.forEach(function (horaire) {
          html += `
            <tr>
              <td>${horaire.horaire}</td>
              <td>${horaire.presents}</td>
              <td>${horaire.remplacants}</td>
              <td>${horaire.absents}</td>
              <td>${horaire.nonRenseignes}</td>
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

      html += `
          </div>

          <div class="table-actions">
            <button onclick="exporterCSV(${idCompetition}, '${nomCompetition.replace(/'/g, "\'")}')">
              📥 Exporter CSV
            </button>

            <button onclick="chargerSansReponse(${idCompetition}, '${nomCompetition.replace(/'/g, "\'")}')" class="secondary-button">
              Voir les sans réponse
            </button>

            <button onclick="afficherSelectionCompetitionOfficier()" class="secondary-button">
              Retour
            </button>
          </div>
        </div>
      `;

      contenu.innerHTML = html;
    },
  );
}

/**
 * Déconnexion simple\.
 */
function deconnexion() {
  utilisateurConnecte = null;
  afficherConnexion();
}

/**
 * Appelle l'API Apps Script avec JSONP.
 */
function appelAPI(action, parametres, callback) {
  const nomCallback = "callback_" + Date.now();

  window[nomCallback] = function (reponse) {
    callback(reponse);
    delete window[nomCallback];
    script.remove();
  };

  let url = API_URL + "?action=" + encodeURIComponent(action);

  for (const cle in parametres) {
    url +=
      "&" + encodeURIComponent(cle) + "=" + encodeURIComponent(parametres[cle]);
  }

  url += "&callback=" + nomCallback;

  const script = document.createElement("script");
  script.src = url;

  script.onerror = function () {
    alert("Erreur de connexion à l'API.");
  };

  document.body.appendChild(script);
}

function definirModeCarte(mode) {
  const app = document.getElementById("app");

  if (!app) {
    console.error("Élément #app introuvable");
    return;
  }

  app.classList.remove("mode-large");

  if (mode === "large") {
    app.classList.add("mode-large");
  }
}

function chargerSansReponse(idCompetition, nomCompetition) {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Joueurs sans réponse</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI(
    "chargerJoueursSansReponse",
    { idCompetition: idCompetition },
    function (data) {
      if (!data.succes) {
        contenu.innerHTML = `
          <div class="form-zone">
            <h2>Erreur</h2>
            <p class="error">${data.message}</p>
            <button onclick="afficherTableauPresencesOfficier(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">Retour</button>
          </div>
        `;
        return;
      }

      let html = `
        <div class="form-zone">
          <h2>Joueurs sans réponse</h2>
          <p>Compétition : ${nomCompetition}</p>
          <p>Total : ${data.nombre}</p>

          <div class="table-container">
            <table class="presence-table">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Rôles</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (data.joueurs.length === 0) {
        html += `
          <tr>
            <td colspan="2">Tous les joueurs actifs ont répondu.</td>
          </tr>
        `;
      }

      data.joueurs.forEach(function (joueur) {
        html += `
          <tr>
            <td>${joueur.pseudo}</td>
            <td>${joueur.roles}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>

          <button onclick="afficherTableauPresencesOfficier(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')" class="secondary-button">
            Retour au tableau
          </button>
        </div>
      `;

      contenu.innerHTML = html;
    },
  );
}

function exporterCSV(idCompetition, nomCompetition) {
  appelAPI(
    "genererExportCSV",
    { idCompetition: idCompetition },
    function (data) {
      if (!data.succes) {
        alert(data.message);
        return;
      }

      const contenuCSV = "\uFEFF" + data.csv;

      const blob = new Blob([contenuCSV], {
        type: "text/csv;charset=utf-8;",
      });

      const lien = document.createElement("a");
      const url = URL.createObjectURL(blob);

      const nomFichier =
        "presences_" +
        nomCompetition.replaceAll(" ", "_").replaceAll("/", "-") +
        ".csv";

      lien.href = url;
      lien.download = nomFichier;

      document.body.appendChild(lien);
      lien.click();

      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    },
  );
}

function calculerStatistiquesTableau(lignes) {
  let presents = 0;
  let absents = 0;
  let remplacants = 0;
  let nonRenseignes = 0;
  let totalCases = 0;

  lignes.forEach(function (ligne) {
    ligne.disponibilites.forEach(function (dispo) {
      totalCases++;

      if (dispo.statut === "Présent") {
        presents++;
      } else if (dispo.statut === "Absent") {
        absents++;
      } else if (dispo.statut === "Remplaçant") {
        remplacants++;
      } else {
        nonRenseignes++;
      }
    });
  });

  const casesRenseignees = totalCases - nonRenseignes;
  const tauxReponse =
    totalCases === 0 ? 0 : Math.round((casesRenseignees / totalCases) * 100);

  return {
    presents: presents,
    absents: absents,
    remplacants: remplacants,
    nonRenseignes: nonRenseignes,
    tauxReponse: tauxReponse,
  };
}

function calculerStatistiquesParDate(dates, lignes) {
  const statsParDate = [];

  dates.forEach(function (dateInfo) {
    const dateCompetition = dateInfo.dateCompetition;
    const dateAffichage = dateInfo.dateAffichage;

    let presents = 0;
    let absents = 0;
    let remplacants = 0;
    let nonRenseignes = 0;

    lignes.forEach(function (ligne) {
      const dispo = ligne.disponibilites.find(function (item) {
        return item.dateCompetition === dateCompetition;
      });

      const statut = dispo ? dispo.statut : "Non renseigné";

      if (statut === "Présent") {
        presents++;
      } else if (statut === "Absent") {
        absents++;
      } else if (statut === "Remplaçant") {
        remplacants++;
      } else {
        nonRenseignes++;
      }
    });

    statsParDate.push({
      dateAffichage: dateAffichage,
      presents: presents,
      absents: absents,
      remplacants: remplacants,
      nonRenseignes: nonRenseignes,
    });
  });

  return statsParDate;
}

function afficherGestionCompetitions() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Gestion des compétitions</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI("chargerCompetitions", {}, function (data) {
    if (!data.succes) {
      contenu.innerHTML = `
          <div class="form-zone">
            <h2>Erreur</h2>
            <p class="error">${data.message}</p>
            <button onclick="afficherEspaceOfficier()">Retour</button>
          </div>
        `;
      return;
    }

    let html = `
        <div class="form-zone">
          <h2>Gestion des compétitions</h2>

          <button onclick="afficherFormulaireCreationCompetition()">
            ➕ Créer une compétition
          </button>
      `;

    data.competitions.forEach(function (competition) {
      html += `
          <div class="competition-card">
            <h3>${competition.nom}</h3>
            <p>Statut : ${competition.statut}</p>
            <p>Rôles autorisés : ${competition.rolesAutorises || "Tous"}</p>
            <p>${competition.description || ""}</p>

            <button onclick="afficherGestionDatesCompetition(${competition.id}, '${competition.nom.replace(/'/g, "\\'")}')" class="secondary-button">
              📅 Gérer les dates
            </button>

            <button onclick="changerStatutCompetition(${competition.id}, 'Ouverte')" class="secondary-button">
              🟢 Ouvrir
            </button>

            <button onclick="changerStatutCompetition(${competition.id}, 'Fermée')" class="secondary-button">
              🔒 Fermer
            </button>

            <button onclick="changerStatutCompetition(${competition.id}, 'Archivée')" class="secondary-button">
              📦 Archiver
            </button>
          </div>
        `;
    });

    html += `
          <button onclick="afficherEspaceOfficier()" class="secondary-button">
            Retour
          </button>
        </div>
      `;

    contenu.innerHTML = html;
  });
}

function changerStatutCompetition(idCompetition, nouveauStatut) {
  afficherConfirmation(
    "Modifier le statut ?",
    "Confirmer le passage de cette compétition en statut : " +
      nouveauStatut +
      " ?",
    function () {
      appelAPI(
        "modifierStatutCompetition",
        {
          idCompetition: idCompetition,
          nouveauStatut: nouveauStatut,
          utilisateur: utilisateurConnecte.joueur.pseudo,
        },
        function (data) {
          if (!data.succes) {
            afficherMessageModal("Erreur", data.message);
            return;
          }

          afficherMessageModal(
            "Statut modifié",
            "La compétition est maintenant en statut : " + nouveauStatut,
            function () {
              afficherGestionCompetitions();
            },
          );
        },
      );
    },
  );
}

function afficherConfirmation(titre, message, actionConfirmer) {
  fermerModal();

  const modal = document.createElement("div");
  modal.id = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box">
      <h2>${titre}</h2>
      <p>${message}</p>

      <div class="modal-actions">
        <button class="secondary-button" onclick="fermerModal()">Annuler</button>
        <button id="modal-confirm-button">Confirmer</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("modal-confirm-button").onclick = function () {
    fermerModal();
    actionConfirmer();
  };
}

function afficherMessageModal(titre, message, actionFermer) {
  fermerModal();

  const modal = document.createElement("div");
  modal.id = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box">
      <h2>${titre}</h2>
      <div class="modal-message">${message}</div>

      <div class="modal-actions">
        <button id="modal-close-button">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("modal-close-button").onclick = function () {
    fermerModal();

    if (actionFermer) {
      actionFermer();
    }
  };
}

function fermerModal() {
  const ancienneModal = document.getElementById("modal-overlay");

  if (ancienneModal) {
    ancienneModal.remove();
  }
}

function afficherFormulaireCreationCompetition() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Créer une compétition</h2>

      <div class="stats-box">
        <h3>1. Informations générales</h3>

        <label for="nomCompetition">Nom de la compétition</label>
        <input type="text" id="nomCompetition" placeholder="Ex : Campagne Juin 2026">

        <label for="descriptionCompetition">Description</label>
        <input type="text" id="descriptionCompetition" placeholder="Ex : Campagne principale du clan MPP">

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
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="1" checked> Lundi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="2" checked> Mardi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="3" checked> Mercredi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="4" checked> Jeudi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="5" checked> Vendredi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="6"> Samedi</label>
          <label class="checkbox-role"><input type="checkbox" class="jour-checkbox" value="0"> Dimanche</label>
        </div>

        <label for="horairesCompetition">Horaires</label>
        <input type="text" id="horairesCompetition" value="21:00,21:15,21:30">
        <p>Format attendu : 21:00,21:15,21:30</p>
      </div>

      <button onclick="previsualiserCreationCompetition()">
        Prévisualiser la création
      </button>

      <button onclick="afficherGestionCompetitions()" class="secondary-button">
        Annuler
      </button>
    </div>
  `;
}

function confirmerCreationCompetitionComplete(configJSON) {
  const config = JSON.parse(configJSON);

  appelAPI(
    "creerCompetition",
    {
      nom: config.nom,
      statut: config.statut,
      creePar: utilisateurConnecte.joueur.pseudo,
      rolesAutorises: config.rolesAutorises,
      description: config.description,
    },
    function (dataCompetition) {
      if (!dataCompetition.succes) {
        afficherMessageModal("Erreur", dataCompetition.message);
        return;
      }

      appelAPI(
        "ajouterDatesMultiplesCompetition",
        {
          idCompetition: dataCompetition.idCompetition,
          dates: JSON.stringify(config.dates),
          horaires: config.horaires,
          utilisateur: utilisateurConnecte.joueur.pseudo,
        },
        function (dataDates) {
          if (!dataDates.succes) {
            afficherMessageModal("Erreur", dataDates.message);
            return;
          }

          afficherMessageModal(
            "Compétition créée",
            "La compétition et ses dates ont bien été créées.",
            function () {
              afficherGestionCompetitions();
            },
          );
        },
      );
    },
  );
}

function afficherGestionDatesCompetition(idCompetition, nomCompetition) {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Gestion des dates</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI(
    "chargerDatesCompetition",
    { idCompetition: idCompetition },
    function (data) {
      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      let html = `
        <div class="form-zone">
          <h2>Gestion des dates</h2>
          <p>Compétition : ${nomCompetition}</p>

          <div class="stats-box">
            <h3>Dates existantes</h3>
      `;

      if (data.dates.length === 0) {
        html += `<p>Aucune date définie.</p>`;
      }

      data.dates.forEach(function (date) {
        html += `
  <div class="date-admin-row">
    <span>📅 ${date.dateAffichage} — ${date.dateCompetition}</span>

    <button class="danger-button" onclick="confirmerSuppressionDate(${date.idDate}, ${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">
      🗑️ Supprimer
    </button>
  </div>
`;
      });

      html += `
          </div>

          <button onclick="afficherFormulaireAjoutDate(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">
            ➕ Ajouter une date
          </button>

          <button onclick="afficherGestionCompetitions()" class="secondary-button">
            Retour
          </button>
        </div>
      `;

      contenu.innerHTML = html;
    },
  );
}

function afficherVersionSite() {
  const elementVersion = document.getElementById("version-site");

  if (elementVersion) {
    elementVersion.textContent = "Version " + VERSION_SITE;
  }
}

function afficherFormulaireAjoutDate(idCompetition, nomCompetition) {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Ajouter une date</h2>
      <p>Compétition : ${nomCompetition}</p>

      <label for="nouvelleDateCompetition">Date</label>
      <input type="date" id="nouvelleDateCompetition">

      <button onclick="ajouterDateDepuisSite(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">
        Ajouter la date
      </button>

      <button onclick="afficherGestionDatesCompetition(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')" class="secondary-button">
        Annuler
      </button>
    </div>
  `;
}

function ajouterDateDepuisSite(idCompetition, nomCompetition) {
  const dateChoisie = document.getElementById("nouvelleDateCompetition").value;

  if (dateChoisie === "") {
    afficherMessageModal("Erreur", "Merci de sélectionner une date.");
    return;
  }

  appelAPI(
    "ajouterDateCompetition",
    {
      idCompetition: idCompetition,
      dateCompetition: dateChoisie,
      utilisateur: utilisateurConnecte.joueur.pseudo,
    },
    function (data) {
      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      afficherMessageModal(
        "Date ajoutée",
        "La date a bien été ajoutée à la compétition.",
        function () {
          afficherGestionDatesCompetition(idCompetition, nomCompetition);
        },
      );
    },
  );
}

function confirmerSuppressionDate(idDate, idCompetition, nomCompetition) {
  afficherConfirmation(
    "Supprimer la date ?",
    "Cette action supprimera la date de la compétition. Confirmer ?",
    function () {
      supprimerDateDepuisSite(idDate, idCompetition, nomCompetition);
    },
  );
}

function supprimerDateDepuisSite(idDate, idCompetition, nomCompetition) {
  appelAPI(
    "supprimerDateCompetition",
    {
      idDate: idDate,
      utilisateur: utilisateurConnecte.joueur.pseudo,
    },
    function (data) {
      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      afficherMessageModal(
        "Date supprimée",
        "La date a bien été supprimée.",
        function () {
          afficherGestionDatesCompetition(idCompetition, nomCompetition);
        },
      );
    },
  );
}

function afficherGestionJoueurs() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Gestion des joueurs</h2>
      <p>Chargement...</p>
    </div>
  `;

  appelAPI("chargerJoueurs", {}, function (data) {
    if (!data.succes) {
      afficherMessageModal("Erreur", data.message);
      return;
    }

    let html = `
        <div class="form-zone">
          <h2>Gestion des joueurs</h2>

          <button onclick="afficherFormulaireAjoutJoueur()">
  ➕ Ajouter un joueur
</button>

          <div class="table-container">
            <table class="presence-table">
              <thead>
                <tr>
                  <th>Pseudo</th>
                  <th>Rôles</th>
                  <th>Statut</th>
                  <th>Dernière modification</th>
					<th>Actions</th>
                </tr>
              </thead>
              <tbody>
      `;

    data.joueurs.forEach(function (joueur) {
      html += `
          <tr>
            <td>${joueur.pseudo}</td>
            <td>${joueur.roles}</td>
            <td>${joueur.statut}</td>
            <td>${joueur.derniereModification || "-"}</td>
			<td>
			<button class="secondary-button" onclick='afficherFormulaireModificationJoueur(${JSON.stringify(joueur)})'>
				✏️ Modifier
			</button>
</td>
          </tr>
        `;
    });

    html += `
              </tbody>
            </table>
          </div>

          <button onclick="afficherEspaceOfficier()" class="secondary-button">
            Retour
          </button>
        </div>
      `;

    contenu.innerHTML = html;
  });
}

function afficherFormulaireAjoutJoueur() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Ajouter un joueur</h2>

      <label for="nouveauPseudoJoueur">Pseudo WoT</label>
      <input type="text" id="nouveauPseudoJoueur" placeholder="Ex : NouveauJoueur">

      <label>Rôles</label>

      <div class="roles-selection">
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
  `;
}

function ajouterJoueurDepuisSite() {
  const pseudo = document.getElementById("nouveauPseudoJoueur").value.trim();
  const statut = document.getElementById("nouveauStatutJoueur").value;

  const roles = [];

  if (document.getElementById("joueurRoleOfficier").checked) {
    roles.push("Officier");
  }

  if (document.getElementById("joueurRoleStrateur").checked) {
    roles.push("Strateur");
  }

  if (document.getElementById("joueurRoleSoldat").checked) {
    roles.push("Soldat");
  }

  if (document.getElementById("joueurRoleReserviste").checked) {
    roles.push("Réserviste");
  }

  if (document.getElementById("joueurRoleRecrue").checked) {
    roles.push("Recrue");
  }

  if (pseudo === "") {
    afficherMessageModal("Erreur", "Merci de saisir un pseudo.");
    return;
  }

  if (roles.length === 0) {
    afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle.");
    return;
  }

  appelAPI(
    "ajouterJoueur",
    {
      pseudo: pseudo,
      roles: roles.join(","),
      statut: statut,
      utilisateur: utilisateurConnecte.joueur.pseudo,
    },
    function (data) {
      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      afficherMessageModal(
        "Joueur ajouté",
        "Le joueur a bien été ajouté.",
        function () {
          afficherGestionJoueurs();
        },
      );
    },
  );
}

function afficherFormulaireModificationJoueur(joueur) {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  const rolesActuels = String(joueur.roles || "");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Modifier un joueur</h2>

      <label for="modifierPseudoJoueur">Pseudo WoT</label>
      <input type="text" id="modifierPseudoJoueur" value="${joueur.pseudo}">

      <label>Rôles</label>

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

      <label for="modifierStatutJoueur">Statut</label>
      <select id="modifierStatutJoueur">
        <option value="Actif" ${joueur.statut === "Actif" ? "selected" : ""}>Actif</option>
        <option value="Inactif" ${joueur.statut === "Inactif" ? "selected" : ""}>Inactif</option>
        <option value="Suspendu" ${joueur.statut === "Suspendu" ? "selected" : ""}>Suspendu</option>
      </select>

      <button onclick="modifierJoueurDepuisSite(${joueur.id})">
        Enregistrer les modifications
      </button>

      <button onclick="afficherGestionJoueurs()" class="secondary-button">
        Annuler
      </button>
    </div>
  `;
}

function modifierJoueurDepuisSite(idJoueur) {
  const pseudo = document.getElementById("modifierPseudoJoueur").value.trim();
  const statut = document.getElementById("modifierStatutJoueur").value;

  const roles = [];

  if (document.getElementById("modifierRoleOfficier").checked) {
    roles.push("Officier");
  }

  if (document.getElementById("modifierRoleStrateur").checked) {
    roles.push("Strateur");
  }

  if (document.getElementById("modifierRoleSoldat").checked) {
    roles.push("Soldat");
  }

  if (document.getElementById("modifierRoleReserviste").checked) {
    roles.push("Réserviste");
  }

  if (document.getElementById("modifierRoleRecrue").checked) {
    roles.push("Recrue");
  }

  if (pseudo === "") {
    afficherMessageModal("Erreur", "Merci de saisir un pseudo.");
    return;
  }

  if (roles.length === 0) {
    afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle.");
    return;
  }

  appelAPI(
    "modifierJoueur",
    {
      idJoueur: idJoueur,
      pseudo: pseudo,
      roles: roles.join(","),
      statut: statut,
      utilisateur: utilisateurConnecte.joueur.pseudo,
    },
    function (data) {
      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      afficherMessageModal(
        "Joueur modifié",
        "Les informations du joueur ont bien été mises à jour.",
        function () {
          afficherGestionJoueurs();
        },
      );
    },
  );
}

function afficherJournalActivite() {
  definirModeCarte("large");

  const contenu = document.getElementById("contenu");

  contenu.innerHTML = `
    <div class="form-zone">
      <h2>Journal d'activité</h2>
      <p>Chargement des 50 dernières actions...</p>
    </div>
  `;

  appelAPI("chargerJournalActivite", {}, function (data) {
    if (!data.succes) {
      afficherMessageModal("Erreur", data.message);
      return;
    }

    let html = `
        <div class="form-zone">
          <h2>Journal d'activité</h2>
          <p>50 dernières actions enregistrées.</p>

          <div class="table-container">
            <table class="presence-table">
              <thead>
                <tr>
                  <th>Date / Heure</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
      `;

    if (data.journal.length === 0) {
      html += `
          <tr>
            <td colspan="4">Aucune action enregistrée.</td>
          </tr>
        `;
    }

    data.journal.forEach(function (entree) {
      html += `
          <tr>
            <td>${entree.dateHeure}</td>
            <td>${entree.utilisateur}</td>
            <td>${entree.action}</td>
            <td>${entree.details}</td>
          </tr>
        `;
    });

    html += `
              </tbody>
            </table>
          </div>

          <button onclick="afficherEspaceOfficier()" class="secondary-button">
            Retour
          </button>
        </div>
      `;

    contenu.innerHTML = html;
  });
}

function gererAffichageHoraires(selectElement) {
  const dateCard = selectElement.closest(".date-card");
  const horairesZone = dateCard.querySelector(".horaires-zone");

  if (!horairesZone) {
    return;
  }

  if (selectElement.value === "Présent") {
    horairesZone.style.display = "";
  } else {
    horairesZone.style.display = "none";

    const cases = horairesZone.querySelectorAll(".horaire-checkbox");

    cases.forEach(function (caseHoraire) {
      caseHoraire.checked = false;
    });
  }
}

function previsualiserCreationCompetition() {
  const nom = document.getElementById("nomCompetition").value.trim();
  const description = document
    .getElementById("descriptionCompetition")
    .value.trim();
  const statut = document.getElementById("statutCompetition").value;

  const dateDebut = document.getElementById("dateDebutCompetition").value;
  const dateFin = document.getElementById("dateFinCompetition").value;
  const horaires = document.getElementById("horairesCompetition").value.trim();

  const roles = recupererRolesCreationCompetition();
  const joursSelectionnes = recupererJoursSelectionnes();

  if (nom === "") {
    afficherMessageModal("Erreur", "Merci de saisir un nom de compétition.");
    return;
  }

  if (roles.length === 0) {
    afficherMessageModal(
      "Erreur",
      "Merci de sélectionner au moins un rôle autorisé.",
    );
    return;
  }

  if (dateDebut === "" || dateFin === "") {
    afficherMessageModal(
      "Erreur",
      "Merci de sélectionner une date de début et une date de fin.",
    );
    return;
  }

  if (new Date(dateFin) < new Date(dateDebut)) {
    afficherMessageModal(
      "Erreur",
      "La date de fin doit être après la date de début.",
    );
    return;
  }

  if (joursSelectionnes.length === 0) {
    afficherMessageModal(
      "Erreur",
      "Merci de sélectionner au moins un jour concerné.",
    );
    return;
  }

  if (horaires === "") {
    afficherMessageModal("Erreur", "Merci de saisir au moins un horaire.");
    return;
  }

  const datesGenerees = genererDatesDepuisPeriode(
    dateDebut,
    dateFin,
    joursSelectionnes,
  );

  if (datesGenerees.length === 0) {
    afficherMessageModal("Erreur", "Aucune date générée avec ces paramètres.");
    return;
  }

  afficherRecapCreationCompetition({
    nom: nom,
    description: description,
    statut: statut,
    rolesAutorises: roles.join(","),
    dates: datesGenerees,
    horaires: horaires,
  });
}

function recupererRolesCreationCompetition() {
  const roles = [];

  if (document.getElementById("roleOfficier").checked) {
    roles.push("Officier");
  }

  if (document.getElementById("roleStrateur").checked) {
    roles.push("Strateur");
  }

  if (document.getElementById("roleSoldat").checked) {
    roles.push("Soldat");
  }

  if (document.getElementById("roleReserviste").checked) {
    roles.push("Réserviste");
  }

  if (document.getElementById("roleRecrue").checked) {
    roles.push("Recrue");
  }

  return roles;
}

function recupererJoursSelectionnes() {
  const cases = document.querySelectorAll(".jour-checkbox");
  const jours = [];

  cases.forEach(function (caseJour) {
    if (caseJour.checked) {
      jours.push(Number(caseJour.value));
    }
  });

  return jours;
}

function genererDatesDepuisPeriode(dateDebut, dateFin, joursSelectionnes) {
  const dates = [];

  const debutParts = dateDebut.split("-");
  const finParts = dateFin.split("-");

  const dateCourante = new Date(
    Number(debutParts[0]),
    Number(debutParts[1]) - 1,
    Number(debutParts[2]),
  );

  const dateLimite = new Date(
    Number(finParts[0]),
    Number(finParts[1]) - 1,
    Number(finParts[2]),
  );

  while (dateCourante <= dateLimite) {
    const jourSemaine = dateCourante.getDay();

    if (joursSelectionnes.includes(jourSemaine)) {
      const annee = dateCourante.getFullYear();
      const mois = String(dateCourante.getMonth() + 1).padStart(2, "0");
      const jour = String(dateCourante.getDate()).padStart(2, "0");

      dates.push(annee + "-" + mois + "-" + jour);
    }

    dateCourante.setDate(dateCourante.getDate() + 1);
  }

  return dates;
}

function afficherRecapCreationCompetition(config) {
  definirModeCarte("large");

  let htmlDates = "";

  config.dates.forEach(function (date) {
    htmlDates += `<p>📅 ${date}</p>`;
  });

  document.getElementById("contenu").innerHTML = `
    <div class="form-zone">
      <h2>Prévisualisation</h2>

      <div class="stats-box">
        <h3>${config.nom}</h3>
        <p>${config.description}</p>
        <p>Statut : ${config.statut}</p>
        <p>Rôles autorisés : ${config.rolesAutorises}</p>
        <p>Horaires : ${config.horaires}</p>
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
  `;
}

function formaterAffichagePresence(dispo) {
  if (dispo.statut === "Présent") {
    const horaires = String(dispo.horairesDisponibles || "")
      .split(",")
      .map(function (h) {
        return h.trim();
      })
      .filter(function (h) {
        return h !== "";
      });

    if (horaires.length > 0) {
      return "🟢(" + horaires.length + ")";
    }

    return "🟢";
  }

  if (dispo.statut === "Absent") {
    return "🔴";
  }

  if (dispo.statut === "Remplaçant") {
    return "🔵";
  }

  return "⚪";
}

function afficherDetailPresence(pseudoJSON, dispoJSON) {
  const pseudo = JSON.parse(pseudoJSON);
  const dispo = JSON.parse(dispoJSON);

  let horairesHTML = "";

  const horairesSelectionnes = String(dispo.horairesDisponibles || "")
    .split(",")
    .map(function (h) {
      return h.trim();
    })
    .filter(function (h) {
      return h !== "";
    });

  if (dispo.statut === "Présent" && horairesSelectionnes.length > 0) {
    horairesSelectionnes.forEach(function (horaire) {
      horairesHTML += `<span class="horaire-badge">✅ ${horaire}</span>`;
    });
  } else {
    horairesHTML = `<p>Aucun horaire disponible.</p>`;
  }

  afficherMessageModal(
    pseudo + " — " + dispo.dateAffichage,
    `
      <p>Statut : <strong>${dispo.statut}</strong></p>
      <div class="horaires-modal">
        ${horairesHTML}
      </div>
    `,
  );
}

function calculerEffectifParHoraire(dates, lignes) {
  const resultats = [];

  dates.forEach(function (dateInfo) {
    const horairesDate = String(dateInfo.horaires || "")
      .split(",")
      .map(function (h) {
        return h.trim();
      })
      .filter(function (h) {
        return h !== "";
      });

    const statsHoraires = [];

    horairesDate.forEach(function (horaire) {
      let presents = 0;
      let remplacants = 0;
      let absents = 0;
      let nonRenseignes = 0;

      lignes.forEach(function (ligne) {
        const dispo = ligne.disponibilites.find(function (item) {
          return item.dateCompetition === dateInfo.dateCompetition;
        });

        if (!dispo || dispo.statut === "Non renseigné") {
          nonRenseignes++;
          return;
        }

        if (dispo.statut === "Absent") {
          absents++;
          return;
        }

        if (dispo.statut === "Remplaçant") {
          remplacants++;
          return;
        }

        if (dispo.statut === "Présent") {
          const horairesDispo = String(dispo.horairesDisponibles || "")
            .split(",")
            .map(function (h) {
              return h.trim();
            })
            .filter(function (h) {
              return h !== "";
            });

          if (horairesDispo.includes(horaire)) {
            presents++;
          }
        }
      });

      statsHoraires.push({
        horaire: horaire,
        presents: presents,
        remplacants: remplacants,
        absents: absents,
        nonRenseignes: nonRenseignes,
      });
    });

    resultats.push({
      dateAffichage: dateInfo.dateAffichage,
      dateCompetition: dateInfo.dateCompetition,
      horaires: statsHoraires,
    });
  });

  return resultats;
}
