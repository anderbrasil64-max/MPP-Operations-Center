import assert from "node:assert/strict";
import test from "node:test";
import {
  creerSnapshotDiscord, metadataDepuisReservation, snapshotDepuisReservation,
} from "../../supabase/functions/_shared/fragments.ts";

test("le snapshot Discord est deterministe et profondement fige", async () => {
  const fragments = [{ contenu: "Bonjour <@123456789012345678>", mentionsAutorisees: ["123456789012345678"] }];
  const premier = await creerSnapshotDiscord(fragments);
  const second = await creerSnapshotDiscord(fragments);
  assert.equal(premier.snapshotHash, second.snapshotHash);
  assert.equal(premier.fragmentCount, 1);
  assert.ok(Object.isFrozen(premier.fragments));
  assert.ok(Object.isFrozen(premier.fragments[0].mentionsAutorisees));
});

test("la reprise refuse un snapshot SQL modifie ou une mention non autorisee", async () => {
  const snapshot = await creerSnapshotDiscord([{ contenu: "Texte stable", mentionsAutorisees: [] }]);
  await assert.rejects(() => snapshotDepuisReservation({
    fragments: [{ ...snapshot.fragments[0], contenu: "Texte modifie" }],
    snapshotHash: snapshot.snapshotHash,
    fragmentCount: snapshot.fragmentCount,
  }), /SNAPSHOT_HASH_INVALIDE/);
  await assert.rejects(() => creerSnapshotDiscord([{ contenu: "<@123456789012345678>", mentionsAutorisees: [] }]), /MENTION_NON_AUTORISEE/);
  await assert.rejects(() => creerSnapshotDiscord([{ contenu: "é".repeat(951), mentionsAutorisees: [] }]), /SNAPSHOT_FRAGMENT_INVALIDE/);
});

test("les metadonnees de reservation sont validees", () => {
  const reservation = {
    rappelId: 42,
    executionId: "123e4567-e89b-42d3-a456-426614174000",
    tentative: 2,
    etat: "retry_claimed",
  };
  assert.deepEqual(metadataDepuisReservation(reservation), reservation);
  assert.throws(
    () => metadataDepuisReservation({ ...reservation, executionId: "pas-un-uuid" }),
    /RESERVATION_METADATA_INVALIDE/,
  );
});
