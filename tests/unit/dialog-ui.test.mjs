import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

test("les textes non fiables restent du texte dans le DOM", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/dialog.js");
  await loadClassic(dom, "js/ui.js");
  const payload = "<img src=x onerror='globalThis.__xss=1'>";
  const node = dom.window.MPPUI.element("p", {}, payload);
  assert.equal(node.textContent, payload);
  assert.equal(node.querySelector("img"), null);
  dom.window.MPPUI.message(payload, payload);
  assert.equal(dom.window.document.querySelector("#modal-title").textContent, payload);
  assert.equal(dom.window.document.querySelector("#modal-overlay img"), null);
  assert.equal(dom.window.__xss, undefined);
});

test("une modale restaure le focus et nettoie les mots de passe", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/dialog.js");
  const before = dom.window.document.getElementById("before");
  before.focus();
  const dialogue = dom.window.MPPDialog.creer("Test", {});
  const password = dom.window.document.createElement("input");
  password.type = "password";
  password.value = "VALEUR_EPHEMERE";
  dialogue.contenu.appendChild(password);
  dom.window.MPPDialog.fermer();
  assert.equal(dom.window.document.getElementById("modal-overlay"), null);
  assert.equal(password.value, "");
  assert.equal(dom.window.document.activeElement, before);
});

test("une modale expose son nom et boucle le focus au clavier", async () => {
  const dom = createDom();
  await loadClassic(dom, "js/dialog.js");
  const dialogue = dom.window.MPPDialog.creer("Confirmation", {});
  const premier = dom.window.document.createElement("button");
  const dernier = dom.window.document.createElement("button");
  premier.textContent = "Premier";
  dernier.textContent = "Dernier";
  Object.defineProperty(premier, "offsetParent", { get: () => dialogue.boite });
  Object.defineProperty(dernier, "offsetParent", { get: () => dialogue.boite });
  dialogue.actions.append(premier, dernier);

  assert.equal(dialogue.overlay.getAttribute("role"), "dialog");
  assert.equal(dialogue.overlay.getAttribute("aria-modal"), "true");
  assert.equal(dialogue.overlay.getAttribute("aria-labelledby"), "modal-title");
  assert.equal(dialogue.overlay.getAttribute("aria-describedby"), "modal-description");
  assert.equal(dom.window.document.getElementById("app").hasAttribute("inert"), true);

  premier.focus();
  premier.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    key: "Tab", shiftKey: true, bubbles: true, cancelable: true
  }));
  assert.equal(dom.window.document.activeElement, dernier);

  dernier.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    key: "Tab", bubbles: true, cancelable: true
  }));
  assert.equal(dom.window.document.activeElement, premier);
  dialogue.fermer();
  assert.equal(dom.window.document.getElementById("app").hasAttribute("inert"), false);
});

test("un focus differe ne cible jamais une modale deja fermee", async () => {
  const dom = createDom();
  const callbacks = [];
  dom.window.requestAnimationFrame = function (callback) {
    callbacks.push(callback);
    return callbacks.length;
  };
  await loadClassic(dom, "js/dialog.js");
  const dialogue = dom.window.MPPDialog.creer("Test asynchrone", {});
  const bouton = dom.window.document.createElement("button");
  let appelsFocus = 0;
  bouton.focus = function () { appelsFocus++; };
  dialogue.actions.appendChild(bouton);
  dialogue.focaliser(bouton);
  dialogue.fermer();
  callbacks.shift()(0);
  assert.equal(appelsFocus, 0);
});
