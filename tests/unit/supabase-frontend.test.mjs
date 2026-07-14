import assert from "node:assert/strict";
import test from "node:test";
import { createDom, loadClassic } from "../helpers/browser-context.mjs";

async function creerContexte(options = {}) {
  const dom = createDom();
  const appels = [];
  const logs = [];
  const session = {
    joueur: options.sessionJoueur === undefined ? "session-joueur" : options.sessionJoueur,
    admin: options.sessionAdmin === undefined ? "session-admin" : options.sessionAdmin,
    activitesAdmin: 0,
    effacementsAdmin: 0,
    effacementsComplets: 0
  };
  dom.window.MPP_CONFIG = {
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "cle-publiable-test",
    rpcTimeoutMs: options.rpcTimeoutMs || 50,
    edgeTimeoutMs: options.edgeTimeoutMs || 50
  };
  dom.window.MPPLogger = {
    avertissement(evenement) { logs.push(String(evenement)); }
  };
  dom.window.MPPSession = {
    lireSessionJoueur() { return session.joueur; },
    lireSessionAdmin() { return session.admin; },
    notifierActiviteAdmin() { session.activitesAdmin++; },
    effacerSessionAdmin() {
      session.effacementsAdmin++;
      session.admin = "";
    },
    toutEffacer() {
      session.effacementsComplets++;
      session.joueur = "";
      session.admin = "";
    }
  };
  dom.window.supabase = {
    createClient() {
      return {
        rpc(nom, parametres) {
          appels.push({ type: "rpc", nom, parametres });
          return (options.rpc || (async function () {
            return { data: { succes: true }, error: null };
          }))(nom, parametres);
        },
        functions: {
          invoke(nom, requete) {
            appels.push({ type: "edge", nom, requete });
            return (options.invoke || (async function () {
              return { data: { succes: true }, error: null };
            }))(nom, requete);
          }
        }
      };
    }
  };
  await loadClassic(dom, "supabase.js");
  return { dom, appels, logs, session };
}

test("une erreur HTTP Edge propage SESSION_EXPIREE dans la bonne portee", async () => {
  const contexte = await creerContexte({
    invoke: async function () {
      return {
        data: null,
        error: {
          context: {
            async json() {
              return { succes: false, code: "SESSION_EXPIREE", message: "Session officier expiree." };
            }
          }
        }
      };
    }
  });
  const resultat = await contexte.dom.window.sbAppelerEdge("discord-link-admin", {}, { portee: "admin" });
  assert.equal(resultat.succes, false);
  assert.equal(resultat.code, "SESSION_EXPIREE");
  assert.equal(resultat.porteeSession, "admin");
  assert.equal(contexte.session.joueur, "session-joueur");
  assert.equal(contexte.session.admin, "");
  assert.equal(contexte.session.effacementsAdmin, 1);
  assert.equal(contexte.session.effacementsComplets, 0);
});

test("une expiration Edge joueur efface aussi toute elevation admin", async () => {
  const contexte = await creerContexte({
    invoke: async function () {
      return {
        data: { succes: false, code: "SESSION_EXPIREE", message: "Session joueur expiree." },
        error: null
      };
    }
  });
  const resultat = await contexte.dom.window.sbAppelerEdge("discord-link-code", {}, { portee: "joueur" });
  assert.equal(resultat.code, "SESSION_EXPIREE");
  assert.equal(resultat.porteeSession, "joueur");
  assert.equal(contexte.session.joueur, "");
  assert.equal(contexte.session.admin, "");
  assert.equal(contexte.session.effacementsAdmin, 0);
  assert.equal(contexte.session.effacementsComplets, 1);
});

test("le wrapper Edge exige un succes explicite et borne le delai", async () => {
  const reponses = [{ data: { message: "Sans indicateur" }, error: null }];
  let signalTimeout = null;
  const contexte = await creerContexte({
    edgeTimeoutMs: 10,
    invoke: function (_nom, requete) {
      if (reponses.length) return Promise.resolve(reponses.shift());
      signalTimeout = requete.signal;
      return new Promise(function () {});
    }
  });
  const sansSucces = await contexte.dom.window.sbAppelerEdge("edge-test", {}, { portee: "joueur" });
  assert.equal(sansSucces.succes, false);
  const timeout = await contexte.dom.window.sbAppelerEdge("edge-test", {}, { portee: "joueur" });
  assert.equal(timeout.succes, false);
  assert.equal(signalTimeout.aborted, true);
});

test("une session Edge absente expire localement sans invocation", async () => {
  const contexte = await creerContexte({ sessionJoueur: "" });
  const resultat = await contexte.dom.window.sbAppelerEdge("discord-link-code", {}, { portee: "joueur" });
  assert.equal(resultat.code, "SESSION_EXPIREE");
  assert.equal(resultat.porteeSession, "joueur");
  assert.equal(contexte.appels.filter(function (appel) { return appel.type === "edge"; }).length, 0);
});

test("le dashboard officier utilise une seule action RPC dediee", async () => {
  const contexte = await creerContexte({
    rpc: async function () {
      return {
        data: {
          succes: true,
          joueurs: { actifs: 2, connectes7Jours: 1 },
          competitions: { ouvertes: 1, fermees: 0 },
          competitionsListe: []
        },
        error: null
      };
    }
  });
  const resultat = await contexte.dom.window.chargerDonneesOfficierInitialesSupabase();
  assert.equal(resultat.succes, true);
  const appels = contexte.appels.filter(function (appel) { return appel.type === "rpc"; });
  assert.equal(appels.length, 1);
  assert.equal(appels[0].nom, "api_admin_site");
  assert.equal(appels[0].parametres.p_action, "dashboard");
  assert.equal("operationId" in appels[0].parametres.p_payload, false);
});

test("un timeout RPC porte un code explicite sans exposer ses parametres", async () => {
  const contexte = await creerContexte({
    rpcTimeoutMs: 5,
    rpc: function () { return new Promise(function () {}); }
  });
  const resultat = await contexte.dom.window.sbRpc("rpc-test", { donnee: "privee-test" });
  assert.equal(resultat.succes, false);
  assert.equal(resultat.code, "RPC_TIMEOUT");
  assert.deepEqual(contexte.logs, ["rpc_timeout_rpc-test"]);
  assert.doesNotMatch(JSON.stringify(contexte.logs), /privee-test/);
});

test("une mutation admin est reconciliee avec le meme identifiant apres timeout", async () => {
  let tentative = 0;
  const contexte = await creerContexte({
    rpcTimeoutMs: 5,
    rpc: function () {
      tentative += 1;
      if (tentative === 1) return new Promise(function () {});
      return Promise.resolve({ data: { succes: true, message: "Action confirmee." }, error: null });
    }
  });
  const resultat = await contexte.dom.window.sbApiAdmin("ajouter_date", {
    idCompetition: 7,
    dateCompetition: "2027-01-01",
    horaires: "21:00",
    motDePasseAdminInitial: "donnee-sensible-test"
  });
  const appels = contexte.appels.filter(function (appel) { return appel.type === "rpc"; });
  assert.equal(resultat.succes, true);
  assert.equal(appels.length, 2);
  assert.equal(appels[0].parametres, appels[1].parametres);
  assert.match(appels[0].parametres.p_payload.operationId, /^[0-9a-f-]{36}$/i);
  assert.equal(
    appels[0].parametres.p_payload.operationId,
    appels[1].parametres.p_payload.operationId
  );
  const operationId = appels[0].parametres.p_payload.operationId;
  const valeursStockees = [contexte.dom.window.localStorage, contexte.dom.window.sessionStorage]
    .flatMap(function (stockage) {
      return Array.from({ length: stockage.length }, function (_valeur, index) {
        const cle = stockage.key(index);
        return `${cle || ""}:${cle ? stockage.getItem(cle) || "" : ""}`;
      });
    })
    .join("\n");
  assert.doesNotMatch(JSON.stringify(contexte.logs), /operationId|donnee-sensible-test/i);
  assert.equal(valeursStockees.includes(operationId), false);
  assert.doesNotMatch(valeursStockees, /donnee-sensible-test/i);
});

test("deux timeouts admin imposent une verification avant toute nouvelle tentative", async () => {
  const contexte = await creerContexte({
    rpcTimeoutMs: 5,
    rpc: function () { return new Promise(function () {}); }
  });
  const resultat = await contexte.dom.window.sbApiAdmin("supprimer_date", { idDate: 12 });
  const appels = contexte.appels.filter(function (appel) { return appel.type === "rpc"; });
  assert.equal(appels.length, 2);
  assert.equal(resultat.succes, false);
  assert.equal(resultat.code, "RESULTAT_INDETERMINE");
  assert.equal(
    appels[0].parametres.p_payload.operationId,
    appels[1].parametres.p_payload.operationId
  );
});

test("la generation Discord rejoue une fois avec le meme operationId", async () => {
  let tentative = 0;
  const contexte = await creerContexte({
    edgeTimeoutMs: 5,
    invoke: function () {
      tentative += 1;
      if (tentative === 1) return new Promise(function () {});
      return Promise.resolve({
        data: { succes: true, code: "CODE2345", expireA: "2030-01-01T00:10:00Z" },
        error: null
      });
    }
  });
  const resultat = await contexte.dom.window.genererCodeLiaisonDiscordSupabase();
  const appels = contexte.appels.filter(function (appel) { return appel.type === "edge"; });
  assert.equal(resultat.succes, true);
  assert.equal(appels.length, 2);
  assert.equal(appels[0].requete.body, appels[1].requete.body);
  assert.equal(appels[0].requete.body.operationId, appels[1].requete.body.operationId);
  assert.match(appels[0].requete.body.operationId, /^[0-9a-f-]{36}$/i);
  assert.equal(appels[0].requete.body.sessionToken, "session-joueur");
  assert.doesNotMatch(JSON.stringify(contexte.logs), /operationId|session-joueur|CODE2345/i);
});

test("deux timeouts Discord restent indetermines sans troisieme envoi", async () => {
  const contexte = await creerContexte({
    edgeTimeoutMs: 5,
    invoke: function () { return new Promise(function () {}); }
  });
  const resultat = await contexte.dom.window.genererCodeLiaisonDiscordSupabase();
  const appels = contexte.appels.filter(function (appel) { return appel.type === "edge"; });
  assert.equal(appels.length, 2);
  assert.equal(resultat.succes, false);
  assert.equal(resultat.code, "RESULTAT_INDETERMINE");
  assert.equal(appels[0].requete.body.operationId, appels[1].requete.body.operationId);
  assert.match(resultat.message, /Patientez une minute/);
});

test("un remplacant compte uniquement dans ses horaires disponibles", async () => {
  const contexte = await creerContexte();
  const effectifs = contexte.dom.window.sbCalculerEffectifHoraireJour(
    { horaires: "21:00,21:15" },
    [{ disponibilites: [{ statut: "Remplaçant", horairesDisponibles: "21:15" }] }]
  );
  assert.deepEqual(JSON.parse(JSON.stringify(effectifs)), [
    { horaire: "21:00", presents: 0, remplacants: 0, absents: 0, sansReponse: 0 },
    { horaire: "21:15", presents: 0, remplacants: 1, absents: 0, sansReponse: 0 }
  ]);
});
