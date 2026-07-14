import assert from "node:assert/strict";
import test from "node:test";
import { construireCorpsWebhook, validerIdsDiscord } from "../../supabase/functions/_shared/discord-payload.ts";

test("allowed_mentions provient uniquement de la liste validee", () => {
  const autorise = "123456789012345678";
  const injecte = "999999999999999999";
  const corps = construireCorpsWebhook(
    `<@${autorise}> <@${injecte}> @everyone <@&${injecte}> <#${injecte}>`,
    [autorise],
  );
  assert.deepEqual(corps.allowed_mentions, { parse: [], users: [autorise] });
  assert.match(corps.content, new RegExp(`<@${autorise}>`));
  assert.doesNotMatch(corps.content, new RegExp(`<@${injecte}>|@everyone|<@&|<#`));
});

test("les IDs Discord invalides sont refuses, pas extraits du contenu", () => {
  assert.throws(() => validerIdsDiscord(["123", "@everyone"]), /IDS_DISCORD_INVALIDES/);
  assert.throws(() => construireCorpsWebhook("<@999999999999999999>", ["<@999999999999999999>"]), /IDS_DISCORD_INVALIDES/);
});

test("le contenu Discord est limite en octets UTF-8", () => {
  assert.throws(
    () => construireCorpsWebhook("é".repeat(951)),
    /CONTENU_DISCORD_INVALIDE/,
  );
});
