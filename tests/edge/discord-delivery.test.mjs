import assert from "node:assert/strict";
import test from "node:test";
import { envoyerWebhookDiscord } from "../../supabase/functions/_shared/discord.ts";

async function avecFetch(fauxFetch, scenario) {
  const original = globalThis.fetch;
  globalThis.fetch = fauxFetch;
  try {
    await scenario();
  } finally {
    globalThis.fetch = original;
  }
}

const options = () => ({ deadlineMs: Date.now() + 10_000, utilisateursAutorises: [] });

test("Discord 400 est terminal et sans retry", async () => {
  let appels = 0;
  await avecFetch(async () => {
    appels += 1;
    return new Response("bad request", { status: 400 });
  }, async () => {
    const resultat = await envoyerWebhookDiscord("https://example.test/webhook", "test", options());
    assert.equal(resultat.code, "DISCORD_HTTP_400");
    assert.equal(resultat.terminal, true);
    assert.equal(resultat.incertain, false);
  });
  assert.equal(appels, 1);
});

test("Discord 429 respecte Retry-After puis reessaie", async () => {
  let appels = 0;
  await avecFetch(async () => {
    appels += 1;
    if (appels === 1) return Response.json({ retry_after: 0 }, { status: 429 });
    return Response.json({ id: "123456789012345678" });
  }, async () => {
    const resultat = await envoyerWebhookDiscord("https://example.test/webhook", "test", options());
    assert.equal(resultat.succes, true);
    assert.equal(resultat.tentatives, 2);
  });
  assert.equal(appels, 2);
});

test("Discord 5xx est incertain et jamais rejoue", async () => {
  let appels = 0;
  await avecFetch(async () => {
    appels += 1;
    return new Response("unavailable", { status: 503 });
  }, async () => {
    const resultat = await envoyerWebhookDiscord("https://example.test/webhook", "test", options());
    assert.equal(resultat.code, "DISCORD_HTTP_503");
    assert.equal(resultat.tentatives, 1);
    assert.equal(resultat.incertain, true);
  });
  assert.equal(appels, 1);
});

test("Discord ne tronque pas Retry-After pour forcer un retry", async () => {
  let appels = 0;
  await avecFetch(async () => {
    appels += 1;
    return new Response(null, {
      status: 429,
      headers: { "retry-after": "60" },
    });
  }, async () => {
    const resultat = await envoyerWebhookDiscord("https://example.test/webhook", "test", {
      deadlineMs: Date.now() + 2_000,
    });
    assert.equal(resultat.code, "DISCORD_RETRY_APRES_BUDGET");
    assert.equal(resultat.tentatives, 1);
  });
  assert.equal(appels, 1);
});

test("une erreur reseau incertaine n'est jamais reessayee", async () => {
  let appels = 0;
  await avecFetch(async () => {
    appels += 1;
    throw new TypeError("network unavailable");
  }, async () => {
    const resultat = await envoyerWebhookDiscord("https://example.test/webhook", "test", options());
    assert.equal(resultat.code, "RESEAU_INCERTAIN");
    assert.equal(resultat.incertain, true);
    assert.equal(resultat.tentatives, 1);
  });
  assert.equal(appels, 1);
});
