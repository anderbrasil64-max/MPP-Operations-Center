import assert from "node:assert/strict";
import test from "node:test";
import { ErreurRequete, lireJsonBorne } from "../../supabase/functions/_shared/http.ts";
import { fetchAvecDeadline } from "../../supabase/functions/_shared/runtime.ts";

test("la lecture JSON streamée accepte un objet borne", async () => {
  const req = new Request("https://example.test", { method: "POST", body: '{"ok":true}' });
  assert.deepEqual(await lireJsonBorne(req, 64, Date.now() + 1_000), { ok: true });
});

test("la lecture JSON streamée renvoie des erreurs 400 et 413", async () => {
  const invalide = new Request("https://example.test", { method: "POST", body: "[1,2]" });
  await assert.rejects(() => lireJsonBorne(invalide, 64, Date.now() + 1_000), (erreur) => erreur instanceof ErreurRequete && erreur.statut === 400);

  const flux = new ReadableStream({
    start(controleur) {
      controleur.enqueue(new TextEncoder().encode('{"data":"'));
      controleur.enqueue(new TextEncoder().encode("x".repeat(100)));
      controleur.close();
    },
  });
  const tropGrand = new Request("https://example.test", { method: "POST", body: flux, duplex: "half" });
  await assert.rejects(() => lireJsonBorne(tropGrand, 32, Date.now() + 1_000), (erreur) => erreur instanceof ErreurRequete && erreur.statut === 413);
});

test("la lecture du corps entrant expire", async () => {
  const corps = new ReadableStream({ start() {} });
  const requete = new Request("https://example.test", {
    method: "POST",
    body: corps,
    duplex: "half",
  });
  await assert.rejects(
    () => lireJsonBorne(requete, 1_024, Date.now() + 20),
    (erreur) => erreur instanceof ErreurRequete && erreur.statut === 408,
  );
});

test("le fetch Supabase borne aussi le corps de reponse", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({ start() {} }));
  try {
    const fetchBorne = fetchAvecDeadline(Date.now() + 100, 30);
    await assert.rejects(
      () => fetchBorne("https://example.test"),
      /LECTURE_REPONSE_TIMEOUT|FETCH_TIMEOUT/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
