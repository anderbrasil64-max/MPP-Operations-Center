import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

test("les domaines joueurs filtrent sans modifier la source", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/joueurs.js");
  const joueurs = [{ pseudo: "Zulu", roles: "Soldat", statut: "Actif" }, { pseudo: "Alpha", roles: "Officier", statut: "Actif" }];
  const filtres = dom.window.MPPJoueurs.filtrerEtTrier(joueurs, "officier", "Actif", true);
  assert.deepEqual(Array.from(filtres, (joueur) => joueur.pseudo), ["Alpha"]);
  assert.equal(joueurs[0].pseudo, "Zulu");
});

test("les dates invalides sont exclues et les horaires normalises", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/competitions.js");
  await loadClassic(dom, "js/presences.js");
  assert.deepEqual(Array.from(dom.window.MPPCompetitions.datesIso("2026-07-14, 2026-02-31, texte")), ["2026-07-14"]);
  assert.deepEqual(Array.from(dom.window.MPPPresences.horaires("21:00, 21:15, ")), ["21:00", "21:15"]);
});

test("les horaires de competition refusent formats invalides et doublons", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/competitions.js");
  const analyse = dom.window.MPPCompetitions.analyserHoraires("21:00, 25:15, 21:00, 09:05");
  assert.deepEqual(Array.from(analyse.horaires), ["21:00", "09:05"]);
  assert.deepEqual(Array.from(analyse.invalides), ["25:15"]);
  assert.deepEqual(Array.from(analyse.doublons), ["21:00"]);
});
