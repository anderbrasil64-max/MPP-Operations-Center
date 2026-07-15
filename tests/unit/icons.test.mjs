import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

const libelles = [
  "Se connecter",
  "Consulter mes compétitions",
  "Lier mon compte Discord",
  "Modifier mon code d’accès",
  "Accéder à l’espace officier",
  "Se déconnecter",
  "Présences du jour",
  "Consulter les présences",
  "Gérer les compétitions",
  "Gérer les joueurs",
  "Journal d’activité",
  "Modifier mon mot de passe",
  "Demandes Discord",
  "Retour à l’accueil",
  "Ajouter un joueur",
  "Modifier",
  "Supprimer",
  "Enregistrer",
  "Annuler",
  "Créer une compétition",
  "Dates",
  "Ouvrir",
  "Fermer",
  "Archiver",
  "Voir les sans réponse",
  "Détails",
  "Générer un code de liaison",
  "Copier",
  "Valider",
  "Refuser",
  "OK",
  "Pseudo ↑"
];

test("les actions visibles utilisent des icones locales explicites", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/icons.js");
  for (const libelle of libelles) {
    const nom = dom.window.MPPIcons.nomPourAction(libelle);
    assert.notEqual(nom, "circle", `Icone generique interdite pour: ${libelle}`);
    const icone = dom.window.MPPIcons.creerIcone(nom);
    assert.equal(icone.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(icone.getAttribute("aria-hidden"), "true");
    assert.equal(icone.getAttribute("focusable"), "false");
    assert.equal(icone.querySelector("script"), null);
  }
});

test("UI.bouton conserve son texte accessible et masque son SVG", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/icons.js");
  await loadClassic(dom, "js/ui.js");
  const bouton = dom.window.MPPUI.bouton("Enregistrer", function () {});
  const icone = bouton.querySelector("svg.button-icon");
  assert.ok(icone);
  assert.equal(icone.getAttribute("aria-hidden"), "true");
  assert.equal(icone.getAttribute("focusable"), "false");
  assert.equal(bouton.querySelector(".button-label").textContent, "Enregistrer");
  assert.equal(bouton.textContent, "Enregistrer");
  assert.equal(bouton.getAttribute("aria-label"), null);
});
