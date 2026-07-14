import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

test("le logger ignore les valeurs du contexte", async () => {
  const dom = createDom();
  const sorties = [];
  dom.window.console.info = (message) => sorties.push(String(message));
  await loadClassic(dom, "js/logger.js");
  dom.window.MPPLogger.information("appel", {
    action: "ouvrir_session",
    statut: "succes",
    motDePasse: "VALEUR_TEST_INTERDITE",
    token: "JETON_TEST_INTERDIT"
  });
  assert.equal(sorties.length, 1);
  assert.match(sorties[0], /action=ouvrir_session/);
  assert.doesNotMatch(sorties[0], /VALEUR_TEST_INTERDITE|JETON_TEST_INTERDIT/);
});
