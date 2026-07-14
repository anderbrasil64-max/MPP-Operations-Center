import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

test("seul le jeton joueur est limite a sessionStorage", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/config.js");
  await loadClassic(dom, "js/logger.js");
  await loadClassic(dom, "js/session-store.js");
  const joueur = "a".repeat(64);
  const admin = "b".repeat(64);
  dom.window.MPPSession.definirSessionJoueur(joueur);
  dom.window.MPPSession.definirSessionAdmin(admin, new Date(Date.now() + 60_000).toISOString());
  assert.equal(dom.window.sessionStorage.getItem("mpp_player_session_v1"), joueur);
  assert.equal(dom.window.MPPSession.lireSessionAdmin(), admin);
  assert.doesNotMatch(JSON.stringify({ ...dom.window.sessionStorage }), new RegExp(admin));
  assert.equal(dom.window.localStorage.length, 0);
  dom.window.MPPSession.toutEffacer();
  assert.equal(dom.window.sessionStorage.length, 0);
  assert.equal(dom.window.MPPSession.lireSessionAdmin(), "");
});
