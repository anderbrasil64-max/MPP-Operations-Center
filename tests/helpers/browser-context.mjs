import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";

export function createDom() {
  return new JSDOM("<!doctype html><html><body><button id='before'>Avant</button><main id='app'><div id='app-status'></div><div id='contenu'></div></main></body></html>", {
    runScripts: "outside-only",
    url: "https://mpp-clan.fr/",
    pretendToBeVisual: true
  });
}

export async function loadClassic(dom, file) {
  const source = await readFile(file, "utf8");
  const script = new vm.Script(source, { filename: file });
  script.runInContext(dom.getInternalVMContext());
}
