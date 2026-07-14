import assert from "node:assert/strict";
import test from "node:test";
import {
  assemblerBlocsDiscord, construireRappelPresences, construireResumeStaff,
  neutraliserTexteDiscord,
} from "../../supabase/functions/_shared/messages.ts";
import { longueurUtf8 } from "../../supabase/functions/_shared/utf8.ts";

const competition = { nom: "Competition test" };
const lie = { pseudo: "Alpha", discord_id: "123456789012345678" };
const nonLie = { pseudo: "Bravo", discord_id: null };

function contenu(fragments) {
  return fragments.map((fragment) => fragment.contenu).join("\n\n");
}

test("rappel Discord: joueurs lies et non lies", () => {
  const fragments = construireRappelPresences(competition, "2026-07-14", [lie], [nonLie]);
  const message = contenu(fragments);
  assert.match(message, /Merci de remplir vos disponibilités/);
  assert.match(message, /19h00 :\n\nhttps:\/\/mpp-clan\.fr\/\n\n/);
  assert.match(message, /présences :\n\n<@123456789012345678>\n\nJoueurs sans Discord lié :\n\n• Bravo/);
  assert.deepEqual(fragments.flatMap((fragment) => fragment.mentionsAutorisees), ["123456789012345678"]);
});

test("rappel Discord: sections vides masquees", () => {
  const sansDiscord = contenu(construireRappelPresences(competition, "2026-07-14", [], [nonLie]));
  assert.doesNotMatch(sansDiscord, /Liste des joueurs/);
  assert.match(sansDiscord, /Joueurs sans Discord lié :\n\n• Bravo/);
  const avecDiscord = contenu(construireRappelPresences(competition, "2026-07-14", [lie], []));
  assert.doesNotMatch(avecDiscord, /Joueurs sans Discord lié/);
  assert.match(avecDiscord, /<@123456789012345678>/);
});

test("les messages restent sous la limite Discord sans troncature", () => {
  const source = Array.from({ length: 300 }, (_, i) => `Ligne ${i}`).join("\n");
  const fragments = assemblerBlocsDiscord(["Intro", source], 200);
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every((fragment) => longueurUtf8(fragment.contenu) <= 200));
  assert.match(contenu(fragments), /Ligne 299/);
});

test("les limites Discord portent sur les octets UTF-8", () => {
  assert.equal(longueurUtf8("é"), 2);
  const texte = "😀".repeat(600);
  const fragments = assemblerBlocsDiscord([texte]);
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every((fragment) => longueurUtf8(fragment.contenu) <= 1_900));
  assert.equal(fragments.map((fragment) => fragment.contenu).join(""), texte);
});

test("noms et pseudos malveillants ne conservent aucune syntaxe Discord", () => {
  const cibleLegitime = "123456789012345678";
  const cibleInjectee = "999999999999999999";
  const fragments = construireRappelPresences(
    { nom: `Cup @everyone <@&${cibleInjectee}> **finale**` },
    "2026-07-14",
    [{ pseudo: "Lie", discord_id: cibleLegitime }],
    [{ pseudo: `@here <@${cibleInjectee}>`, discord_id: null }],
  );
  const message = contenu(fragments);
  assert.match(message, new RegExp(`<@${cibleLegitime}>`));
  assert.doesNotMatch(message, /@everyone|@here|<@&|<@999999999999999999>|\*\*/i);
  assert.deepEqual(fragments.flatMap((fragment) => fragment.mentionsAutorisees), [cibleLegitime]);
});

test("resume staff sans mention", () => {
  const fragment = construireResumeStaff({ nom: "Staff @everyone <@123456789012345678>" }, "2026-07-14", {
    presents: 3, remplacants: 1, absents: 2, repondants: 6,
  });
  assert.match(fragment.contenu, /Présents : 3/);
  assert.match(fragment.contenu, /Réponses enregistrées : 6/);
  assert.doesNotMatch(fragment.contenu, /@everyone|<@/);
  assert.deepEqual(fragment.mentionsAutorisees, []);
  assert.equal(neutraliserTexteDiscord("A\nB"), "A B");
});
