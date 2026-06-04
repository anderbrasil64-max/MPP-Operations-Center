const VERSION_SITE = "Alpha 0.1.0";

const API_URL = "https://script.google.com/macros/s/AKfycbx2_I5oyldxQdxRneO-s1m2WoCZmifII1DiJqeLpBZ0S0SRj8RC2PFq-aw-V9EjLU_jeA/exec";

let utilisateurConnecte = null;

/**
 * Affiche la page de connexion au chargement du site.
 */
window.onload = function() {
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

  appelAPI(
    "identifierUtilisateur",
    { pseudo: pseudo },
    function(data) {

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
    }
  );
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

  appelAPI(
    "chargerCompetitions",
    {},
    function(data) {

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

      data.competitions.forEach(function(competition) {

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
    }
  );
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
    function(resultatDates) {

      if (!resultatDates.succes) {
        contenu.innerHTML = `<p class="error">${resultatDates.message}</p>`;
        return;
      }

      appelAPI(
        "chargerPresencesJoueur",
        {
          idCompetition: idCompetition,
          pseudo: pseudo
        },
        function(resultatPresences) {

          if (!resultatPresences.succes) {
            contenu.innerHTML = `<p class="error">${resultatPresences.message}</p>`;
            return;
          }

          afficherFormulairePresences(
            idCompetition,
            nomCompetition,
            resultatDates.dates,
            resultatPresences.presences
          );
        }
      );
    }
  );
}

function afficherFormulairePresences(idCompetition, nomCompetition, dates, presencesExistantes) {

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

  dates.forEach(function(date) {

    const dateTexte = String(date.dateCompetition).trim();
	const dateAffichage = date.dateAffichage || dateTexte;
    let statutActuel = "Non renseigné";

    presencesExistantes.forEach(function(presence) {
      if (String(presence.dateCompetition).trim() === dateTexte) {
        statutActuel = presence.statut;
      }
    });

    html += `
      <div class="date-card">
        <h3>${dateAffichage}</h3>

        <select class="select-statut" data-date="${dateTexte}">
          <option value="Non renseigné" ${statutActuel === "Non renseigné" ? "selected" : ""}>⚪ Non renseigné</option>
          <option value="Présent" ${statutActuel === "Présent" ? "selected" : ""}>🟢 Présent</option>
          <option value="Absent" ${statutActuel === "Absent" ? "selected" : ""}>🔴 Absent</option>
          <option value="Présent mais en retard" ${statutActuel === "Présent mais en retard" ? "selected" : ""}>🟠 Présent mais en retard</option>
          <option value="Remplaçant" ${statutActuel === "Remplaçant" ? "selected" : ""}>🔵 Remplaçant</option>
        </select>
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
	
	definirModeCarte("normal");
  const selects = document.querySelectorAll(".select-statut");
  const presences = [];

  let nbPresent = 0;
  let nbAbsent = 0;
  let nbRetard = 0;
  let nbRemplacant = 0;
  let nbNonRenseigne = 0;

  selects.forEach(function(select) {

    const dateCompetition = select.dataset.date;
    const statut = select.value;

    presences.push({
      dateCompetition: dateCompetition,
      statut: statut
    });

    if (statut === "Présent") {
      nbPresent++;
    } else if (statut === "Absent") {
      nbAbsent++;
    } else if (statut === "Présent mais en retard") {
      nbRetard++;
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

  presences.forEach(function(presence) {
    html += `
      <p><strong>${presence.dateCompetition}</strong> → ${presence.statut}</p>
    `;
  });

  html += `
      </div>

      <div class="recap-box">
        <p>🟢 Présent : ${nbPresent}</p>
        <p>🔴 Absent : ${nbAbsent}</p>
        <p>🟠 Retard : ${nbRetard}</p>
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
      presences: JSON.stringify(presences)
    },
    function(data) {

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
    }
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
      <h2>Espace officier</h2>
      <p>Connecté en tant que : ${utilisateurConnecte.joueur.pseudo}</p>

      <button onclick="afficherSelectionCompetitionOfficier()">
        👥 Consulter les présences
      </button>

      <button class="secondary-button" onclick="afficherGestionCompetitions()">
		📅 Gérer les compétitions
		</button>

      <button class="secondary-button" onclick="alert('Statistiques avancées prévues dans une prochaine étape.')">
        📊 Statistiques
      </button>

      <button class="secondary-button" onclick="alert('Administration prévue dans une prochaine étape.')">
        ⚙️ Administration
      </button>

      <button onclick="afficherChoixOfficier()" class="secondary-button">
        Retour
      </button>
    </div>
  `;
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

  appelAPI(
    "chargerCompetitions",
    {},
    function(data) {

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

      data.competitions.forEach(function(competition) {
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
    }
  );
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
    {
      idCompetition: idCompetition
    },
    function(data) {

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

      let html = `
        <div class="form-zone">
          <h2>${nomCompetition}</h2>

          <div class="table-container">
            <table class="presence-table">
              <thead>
                <tr>
                  <th>Joueur</th>
      `;

      data.dates.forEach(function(date) {
        html += `<th>${date.dateAffichage}</th>`;
      });

      html += `
                  <th>Synthèse</th>
                </tr>
              </thead>
              <tbody>
      `;

      data.lignes.forEach(function(ligne) {

        html += `
          <tr>
            <td>${ligne.pseudo}</td>
        `;

        ligne.disponibilites.forEach(function(dispo) {

          let icone = "⚪";

          if (dispo.statut === "Présent") {
            icone = "🟢";
          } else if (dispo.statut === "Absent") {
            icone = "🔴";
          } else if (dispo.statut === "Présent mais en retard") {
            icone = "🟠";
          } else if (dispo.statut === "Remplaçant") {
            icone = "🔵";
          }

          html += `
            <td title="${dispo.statut}">
              ${icone}
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
            <p>🔴 Absents : ${stats.absents}</p>
            <p>🟠 Retards : ${stats.retards}</p>
            <p>🔵 Remplaçants : ${stats.remplacants}</p>
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
                    <th>🟠 Retards</th>
                    <th>🔵 Remplaçants</th>
                    <th>🔴 Absents</th>
                    <th>⚪ Sans réponse</th>
                  </tr>
                </thead>
                <tbody>
      `;

      statsParDate.forEach(function(statDate) {
        html += `
          <tr>
            <td>${statDate.dateAffichage}</td>
            <td>${statDate.presents}</td>
            <td>${statDate.retards}</td>
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

          <div class="table-actions">
            <button onclick="exporterCSV(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')">
              📥 Exporter CSV
            </button>

            <button onclick="chargerSansReponse(${idCompetition}, '${nomCompetition.replace(/'/g, "\\'")}')" class="secondary-button">
              Voir les sans réponse
            </button>

            <button onclick="afficherSelectionCompetitionOfficier()" class="secondary-button">
              Retour
            </button>
          </div>
        </div>
      `;

      contenu.innerHTML = html;
    }
  );
}

/**
 * Déconnexion simple.
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

  window[nomCallback] = function(reponse) {
    callback(reponse);
    delete window[nomCallback];
    script.remove();
  };

  let url = API_URL + "?action=" + encodeURIComponent(action);

  for (const cle in parametres) {
    url += "&" + encodeURIComponent(cle) + "=" + encodeURIComponent(parametres[cle]);
  }

  url += "&callback=" + nomCallback;

  const script = document.createElement("script");
  script.src = url;

  script.onerror = function() {
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
    function(data) {

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

      data.joueurs.forEach(function(joueur) {
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
    }
  );
}

function exporterCSV(idCompetition, nomCompetition) {

  appelAPI(
    "genererExportCSV",
    { idCompetition: idCompetition },
    function(data) {

      if (!data.succes) {
        alert(data.message);
        return;
      }

      const contenuCSV = "\uFEFF" + data.csv;

      const blob = new Blob([contenuCSV], {
        type: "text/csv;charset=utf-8;"
      });

      const lien = document.createElement("a");
      const url = URL.createObjectURL(blob);

      const nomFichier = "presences_" + nomCompetition
        .replaceAll(" ", "_")
        .replaceAll("/", "-")
        + ".csv";

      lien.href = url;
      lien.download = nomFichier;

      document.body.appendChild(lien);
      lien.click();

      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    }
  );
}

function calculerStatistiquesTableau(lignes) {

  let presents = 0;
  let absents = 0;
  let retards = 0;
  let remplacants = 0;
  let nonRenseignes = 0;
  let totalCases = 0;

  lignes.forEach(function(ligne) {

    ligne.disponibilites.forEach(function(dispo) {

      totalCases++;

      if (dispo.statut === "Présent") {
        presents++;
      } else if (dispo.statut === "Absent") {
        absents++;
      } else if (dispo.statut === "Présent mais en retard") {
        retards++;
      } else if (dispo.statut === "Remplaçant") {
        remplacants++;
      } else {
        nonRenseignes++;
      }

    });

  });

  const casesRenseignees = totalCases - nonRenseignes;

  const tauxReponse = totalCases === 0
    ? 0
    : Math.round((casesRenseignees / totalCases) * 100);

  return {
    presents: presents,
    absents: absents,
    retards: retards,
    remplacants: remplacants,
    nonRenseignes: nonRenseignes,
    tauxReponse: tauxReponse
  };
}

function calculerStatistiquesParDate(dates, lignes) {

  const statsParDate = [];

  dates.forEach(function(dateInfo) {

    const dateCompetition = dateInfo.dateCompetition;
    const dateAffichage = dateInfo.dateAffichage;

    let presents = 0;
    let absents = 0;
    let retards = 0;
    let remplacants = 0;
    let nonRenseignes = 0;

    lignes.forEach(function(ligne) {

      const dispo = ligne.disponibilites.find(function(item) {
        return item.dateCompetition === dateCompetition;
      });

      const statut = dispo ? dispo.statut : "Non renseigné";

      if (statut === "Présent") {
        presents++;
      } else if (statut === "Absent") {
        absents++;
      } else if (statut === "Présent mais en retard") {
        retards++;
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
      retards: retards,
      remplacants: remplacants,
      nonRenseignes: nonRenseignes
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

  appelAPI(
    "chargerCompetitions",
    {},
    function(data) {

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

      data.competitions.forEach(function(competition) {
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
    }
  );
}

function changerStatutCompetition(idCompetition, nouveauStatut) {

  afficherConfirmation(
    "Modifier le statut ?",
    "Confirmer le passage de cette compétition en statut : " + nouveauStatut + " ?",
    function() {

      appelAPI(
        "modifierStatutCompetition",
        {
          idCompetition: idCompetition,
          nouveauStatut: nouveauStatut,
          utilisateur: utilisateurConnecte.joueur.pseudo
        },
        function(data) {

          if (!data.succes) {
            afficherMessageModal("Erreur", data.message);
            return;
          }

          afficherMessageModal(
            "Statut modifié",
            "La compétition est maintenant en statut : " + nouveauStatut,
            function() {
              afficherGestionCompetitions();
            }
          );
        }
      );
    }
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

  document.getElementById("modal-confirm-button").onclick = function() {
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
      <p>${message}</p>

      <div class="modal-actions">
        <button id="modal-close-button">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("modal-close-button").onclick = function() {
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

      <button onclick="creerCompetitionDepuisSite()">
        Créer la compétition
      </button>

      <button onclick="afficherGestionCompetitions()" class="secondary-button">
        Annuler
      </button>
    </div>
  `;
}

function creerCompetitionDepuisSite() {

  const nom = document.getElementById("nomCompetition").value.trim();
  const description = document.getElementById("descriptionCompetition").value.trim();
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

const rolesAutorises = roles.join(",");

if (rolesAutorises === "") {
  afficherMessageModal("Erreur", "Merci de sélectionner au moins un rôle autorisé.");
  return;
}
  const statut = document.getElementById("statutCompetition").value;

  if (nom === "") {
    afficherMessageModal("Erreur", "Merci de saisir un nom de compétition.");
    return;
  }

  appelAPI(
    "creerCompetition",
    {
      nom: nom,
      statut: statut,
      creePar: utilisateurConnecte.joueur.pseudo,
      rolesAutorises: rolesAutorises,
      description: description
    },
    function(data) {

      if (!data.succes) {
        afficherMessageModal("Erreur", data.message);
        return;
      }

      afficherMessageModal(
        "Compétition créée",
        "La compétition a bien été créée.",
        function() {
          afficherGestionCompetitions();
        }
      );
    }
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
    function(data) {

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

      data.dates.forEach(function(date) {
        html += `<p>📅 ${date.dateAffichage} — ${date.dateCompetition}</p>`;
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
    }
  );
}

function afficherVersionSite() {

  const elementVersion =
    document.getElementById("version-site");

  if (elementVersion) {

    elementVersion.textContent =
      "Version " + VERSION_SITE;

  }
}