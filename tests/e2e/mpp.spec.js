import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function installerSupabaseSimule(page, options = {}) {
  const role = options.role || "Soldat";
  const status = options.status || "Actif";
  const discordLie = options.discordLie === true;
  const adminExpired = options.adminExpired === true;
  await page.addInitScript(({ roleValue, statusValue, discordLieValue, adminExpiredValue }) => {
    const playerToken = "a".repeat(64);
    const adminToken = "b".repeat(64);
    const competition = {
      id: 7, nom: "Compétition test", statut: "Ouverte", roles_autorises: "Soldat,Officier,SuperAdmin",
      description: "Fixture sans donnée réelle", fermeture_auto_active: false,
      notification_presence_active: true, heure_notification_presence: "19:00:00",
      rappel_presence_active: true, heure_rappel_presence: "17:00:00"
    };
    const dates = [{ id: 101, competition_id: 7, date_competition: "2026-07-15", horaires: "21:00,21:15" }];
    const joueurs = [
      { id: 1, pseudo: "Officier Test", roles: roleValue, statut: "Actif", discordId: roleValue === "SuperAdmin" ? "100000000000000001" : null, discordUsername: "CompteTest", discordLie: true, derniereConnexion: "2026-07-14T12:00:00Z", codeAccesConfigure: true, credentialAdminConfigure: true },
      { id: 2, pseudo: "Joueur Fixture", roles: "Soldat", statut: "Actif", discordId: null, discordUsername: "", discordLie: false, derniereConnexion: null, codeAccesConfigure: true }
    ];
    const presences = [{ id: 1, competition_id: 7, joueur_id: 1, pseudo: "Officier Test", date_competition: "2026-07-15", statut: "Présent", horaires_disponibles: "21:00" }];
    window.__mppCalls = [];
    window.supabase = {
      createClient() {
        return {
          async rpc(name, params) {
            window.__mppCalls.push({
              name,
              action: params?.p_action || "",
              keys: Object.keys(params || {}),
              payloadKeys: Object.keys(params?.p_payload || {}),
              payloadRoles: params?.p_payload?.roles || "",
              configRoles: params?.p_payload?.config?.rolesAutorises || ""
            });
            if (name === "ouvrir_session_joueur_site") {
              if (params.p_code_acces === "mauvais-code" || statusValue !== "Actif") return { data: { succes: false, message: "Identification impossible." }, error: null };
              return { data: { succes: true, sessionToken: playerToken, expireA: new Date(Date.now() + 3600000).toISOString(), joueur: { id: 1, pseudo: params.p_pseudo, roles: roleValue, statut: statusValue, discordLie: discordLieValue } }, error: null };
            }
            if (name === "restaurer_session_site") return { data: { succes: true, joueur: { id: 1, pseudo: "Testeur", roles: roleValue, statut: statusValue, discordLie: discordLieValue } }, error: null };
            if (name === "ouvrir_session_admin_site") {
              if (params.p_mot_de_passe === "mot-de-passe-refuse") return { data: { succes: false, message: "Authentification impossible." }, error: null };
              return { data: { succes: true, sessionToken: adminToken, expireA: new Date(Date.now() + 900000).toISOString(), estOfficier: true, estSuperAdmin: roleValue === "SuperAdmin" }, error: null };
            }
            if (name === "fermer_session_site") return { data: { succes: true }, error: null };
            if (name === "api_joueur_site") {
              if (params.p_action === "competitions") return { data: { succes: true, competitions: [competition] }, error: null };
              if (params.p_action === "competition_complete") return { data: { succes: true, competition, dates, presences }, error: null };
              if (params.p_action === "dates_competition") return { data: { succes: true, dates }, error: null };
              if (params.p_action === "sauvegarder_presences") return { data: { succes: true, message: "Présences sauvegardées.", modifications: 1 }, error: null };
              if (params.p_action === "changer_code_acces") return { data: { succes: true, message: "Code d’accès modifié." }, error: null };
              return { data: { succes: true }, error: null };
            }
            if (name === "api_admin_site") {
              if (adminExpiredValue) return { data: { succes: false, code: "SESSION_EXPIREE", message: "Session officier expirée." }, error: null };
              if (params.p_action === "dashboard") return { data: {
                succes: true,
                joueurs: { total: 2, actifs: 2, connectes7Jours: 1 },
                competitions: { ouvertes: 1, fermees: 0 },
                competitionsListe: [competition]
              }, error: null };
              if (params.p_action === "joueurs") return { data: { succes: true, joueurs }, error: null };
              if (params.p_action === "competitions") return { data: { succes: true, competitions: [competition] }, error: null };
              if (params.p_action === "dates_competition") return { data: { succes: true, dates }, error: null };
              if (["tableau_presences", "sans_reponse"].includes(params.p_action)) return { data: { succes: true, joueurs, dates, presences }, error: null };
              if (params.p_action === "aujourdhui") {
                const date = params.p_payload.date;
                return { data: {
                  succes: true,
                  dates: [{ ...dates[0], date_competition: date }],
                  competitions: [competition],
                  joueurs,
                  presences: [{ ...presences[0], date_competition: date }],
                  rappels: [{ type_rappel: "sans_reponse_17h", competition_id: 7, date_competition: date, heure_programmee: "17:00:00", statut: "envoye", updated_at: new Date().toISOString() }]
                }, error: null };
              }
              if (params.p_action === "journal") return { data: { succes: true, journal: [{ date_heure: "2026-07-14T12:00:00Z", utilisateur: "Fixture", action: "Joueur modifié", details: "Donnée fictive" }] }, error: null };
              const messages = {
                ajouter_joueur: "Joueur ajouté.", modifier_joueur: "Joueur modifié.", supprimer_joueur: "Joueur supprimé.",
                creer_competition: "Compétition créée.", modifier_competition: "Compétition modifiée.",
                modifier_statut_competition: "Statut modifié.", ajouter_date: "Date ajoutée.",
                supprimer_date: "Date supprimée.", supprimer_competition: "Compétition supprimée."
              };
              return { data: { succes: true, message: messages[params.p_action] || "Action simulée terminée." }, error: null };
            }
            return { data: { succes: false, message: "Action simulee absente." }, error: null };
          },
          functions: {
            async invoke(name, request) {
              window.__mppCalls.push({
                name: `edge:${name}`,
                keys: Object.keys(request?.body || {}),
                operationId: request?.body?.operationId || ""
              });
              if (name === "discord-link-code") return { data: { succes: true, code: "ABCD2345" }, error: null };
              if (name === "discord-link-admin" && request?.body?.action === "lister") return { data: { succes: true, demandes: [{ id: "00000000-0000-4000-8000-000000000001", pseudo: "Joueur Fixture", discordUsername: "CompteFixture", createdAt: "2026-07-14T12:00:00Z" }] }, error: null };
              return { data: { succes: true, message: "Demande traitée." }, error: null };
            }
          }
        };
      }
    };
  }, { roleValue: role, statusValue: status, discordLieValue: discordLie, adminExpiredValue: adminExpired });
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const sansClientSupabase = html.replace(
      /<script\s+defer\s+src="vendor\/supabase-js-2\.95\.0\.min\.js"><\/script>/s,
      ""
    );
    await route.fulfill({ response, body: sansClientSupabase });
  });
}

async function connecterJoueur(page, pseudo = "Testeur", code = "code-joueur-test") {
  await page.goto("/");
  await page.getByLabel("Pseudo", { exact: true }).fill(pseudo);
  await page.getByLabel("Code d’accès", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

async function ouvrirEspaceAdmin(page, motDePasse = "mot-de-passe-test") {
  await page.getByRole("button", { name: "Accéder à l’espace officier" }).click();
  await page.getByLabel("Mot de passe administrateur").fill(motDePasse);
  await page.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
}

async function auditerAxeEtDebordement(page, nomVue) {
  await test.step(`${nomVue}: axe et debordement`, async () => {
    const audit = await page.evaluate(async () => {
      if (!window.axe) throw new Error("axe-core absent de la page");
      const resultats = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }
      });
      const violations = resultats.violations
        .filter((violation) => ["critical", "serious"].includes(violation.impact))
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          targets: violation.nodes.slice(0, 3).flatMap((node) => node.target)
        }));

      const overflows = [];
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const viewportWidth = document.documentElement.clientWidth;
      if (documentWidth - viewportWidth > 1) {
        const offenders = [...document.body.querySelectorAll("*")]
          .filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const tableWrapper = element.closest(".table-wrapper");
            if (tableWrapper && tableWrapper !== element) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0
              && rect.height > 0
              && (rect.left < -1 || rect.right - viewportWidth > 1);
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join("");
            return {
              element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${classes}`,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              outside: Math.round(Math.max(0, -rect.left, rect.right - viewportWidth))
            };
          })
          .sort((a, b) => b.outside - a.outside)
          .slice(0, 8);
        overflows.push({ zone: "document", overflow: documentWidth - viewportWidth, offenders });
      }

      document.querySelectorAll("[role='dialog'] .modal-box, [role='alertdialog'] .modal-box")
        .forEach((box, index) => {
          const rect = box.getBoundingClientRect();
          const horizontal = box.scrollWidth - box.clientWidth;
          const outside = Math.max(0, -rect.left, rect.right - window.innerWidth);
          if (horizontal > 1 || outside > 1) {
            overflows.push({ zone: `modal-${index + 1}`, overflow: horizontal, outside });
          }
        });

      return { violations, overflows };
    });

    expect(audit.violations, `${nomVue}: ${JSON.stringify(audit.violations)}`).toEqual([]);
    expect(audit.overflows, `${nomVue}: ${JSON.stringify(audit.overflows)}`).toEqual([]);
  });
}

test("connexion, protection XSS et absence de credential persiste", async ({ page }) => {
  await installerSupabaseSimule(page);
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByText("Alpha 0.13.0 - Security & Reliability")).toBeVisible();
  const payload = "<img src=x onerror='globalThis.__xss=1'>";
  await page.getByLabel("Pseudo", { exact: true }).fill(payload);
  await page.getByLabel("Code d’accès", { exact: true }).fill("code-test-valide");
  await page.getByLabel("Se souvenir de mon pseudo", { exact: true }).check();
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(`Connecté : ${payload}`)).toBeVisible();
  expect(await page.locator("img[src='x']").count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  const stockage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(stockage)).not.toContain("code-test-valide");
  expect(JSON.stringify(stockage)).toContain("mpp_saved_pseudo");
  expect(consoleErrors).toEqual([]);
});

test("mauvais code refuse sans erreur technique", async ({ page }) => {
  await installerSupabaseSimule(page);
  await page.goto("/");
  await page.getByLabel("Pseudo", { exact: true }).fill("Testeur");
  await page.getByLabel("Code d’accès", { exact: true }).fill("mauvais-code");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("Identification impossible");
  await expect(page.getByLabel("Pseudo", { exact: true })).toHaveValue("Testeur");
  await expect(page.getByLabel("Code d’accès", { exact: true })).toHaveValue("");
});

test("session admin reste uniquement en memoire et la modale accepte Echap", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await page.goto("/");
  await page.getByLabel("Pseudo", { exact: true }).fill("Officier Test");
  await page.getByLabel("Code d’accès", { exact: true }).fill("code-joueur-test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  const bouton = page.getByRole("button", { name: "Accéder à l’espace officier" });
  await bouton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(bouton).toBeFocused();
  await bouton.click();
  await page.getByLabel("Mot de passe administrateur").fill("mot-de-passe-test");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("heading", { name: "Espace officier" })).toBeVisible();
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("mot-de-passe-test");
  expect(stockage).not.toContain("b".repeat(64));
});

test("le dashboard officier repose sur l action RPC agregee", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await expect(page.getByRole("heading", { name: "Espace officier" })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Joueurs actifs" })).toContainText("2");
  const actions = await page.evaluate(() => window.__mppCalls
    .filter((item) => item.name === "api_admin_site")
    .map((item) => item.action));
  expect(actions).toEqual(["dashboard"]);
});

test("accessibilite critique et largeur mobile", async ({ page }, testInfo) => {
  await installerSupabaseSimule(page);
  await page.addInitScript({ path: require.resolve("axe-core/axe.min.js") });
  await page.goto("/");
  await auditerAxeEtDebordement(page, "identification");
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
});

test("axe et overflow couvrent les ecrans joueur et la modale de presence", async ({ page }) => {
  await installerSupabaseSimule(page);
  await page.addInitScript({ path: require.resolve("axe-core/axe.min.js") });
  await connecterJoueur(page);
  await auditerAxeEtDebordement(page, "accueil joueur");

  await page.getByRole("button", { name: "Consulter mes compétitions" }).click();
  await expect(page.getByRole("heading", { name: "Mes compétitions" })).toBeVisible();
  await auditerAxeEtDebordement(page, "liste competitions joueur");

  await page.getByRole("article").getByRole("button", { name: "Ouvrir" }).click();
  await expect(page.locator("#presence-status-101")).toBeVisible();
  await auditerAxeEtDebordement(page, "saisie presences joueur");

  await page.locator("#presence-status-101").selectOption({ label: "Remplaçant" });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await auditerAxeEtDebordement(page, "confirmation presences joueur");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("axe et overflow couvrent les ecrans SuperAdmin et leurs modales", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "SuperAdmin", discordLie: true });
  await page.addInitScript({ path: require.resolve("axe-core/axe.min.js") });
  await connecterJoueur(page, "Officier Test");

  await page.getByRole("button", { name: "Accéder à l’espace officier" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await auditerAxeEtDebordement(page, "elevation officier");
  await page.getByLabel("Mot de passe administrateur").fill("mot-de-passe-test");
  await page.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("heading", { name: "Espace officier" })).toBeVisible();
  await auditerAxeEtDebordement(page, "tableau de bord SuperAdmin");

  await page.getByRole("button", { name: "Gestion des joueurs" }).click();
  await expect(page.getByRole("heading", { name: "Gestion des joueurs" })).toBeVisible();
  await auditerAxeEtDebordement(page, "gestion joueurs");
  await page.getByRole("button", { name: "Ajouter un joueur" }).click();
  await expect(page.getByRole("heading", { name: "Ajouter un joueur" })).toBeVisible();
  await auditerAxeEtDebordement(page, "formulaire joueur");
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Supprimer" }).first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await auditerAxeEtDebordement(page, "suppression joueur");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Retour", exact: true }).click();

  await page.getByRole("button", { name: "Gestion des compétitions" }).click();
  await expect(page.getByRole("heading", { name: "Gestion des compétitions" })).toBeVisible();
  await auditerAxeEtDebordement(page, "gestion competitions");
  await page.getByRole("button", { name: "Créer une compétition" }).click();
  await expect(page.getByRole("heading", { name: "Créer une compétition" })).toBeVisible();
  await auditerAxeEtDebordement(page, "formulaire competition");
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Retour", exact: true }).click();

  await page.getByRole("button", { name: "Présences du jour" }).click();
  await expect(page.getByRole("heading", { name: "Présences du jour" })).toBeVisible();
  await auditerAxeEtDebordement(page, "presences du jour");
  await page.getByRole("button", { name: "Consulter les présences" }).click();
  await expect(page.getByText("Tableau complet des présences")).toBeVisible();
  await auditerAxeEtDebordement(page, "tableau complet presences");
  await page.getByRole("button", { name: "Détails" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await auditerAxeEtDebordement(page, "details presences");
});

test("le joueur enregistre ses presences avec son identite de session", async ({ page }) => {
  await installerSupabaseSimule(page);
  await connecterJoueur(page);
  await page.getByRole("button", { name: "Consulter mes compétitions" }).click();
  await page.getByRole("article").getByRole("button", { name: "Ouvrir" }).click();
  await page.locator("#presence-status-101").selectOption("Présent");
  await page.getByLabel("21:15", { exact: true }).check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  const acquitter = page.getByRole("dialog").getByRole("button", { name: "OK" });
  await expect(acquitter).toBeFocused();
  await acquitter.click();
  await expect(page.getByRole("heading", { name: "Mes compétitions" })).toBeVisible();
  const appel = await page.evaluate(() => window.__mppCalls.find((item) => item.name === "api_joueur_site" && item.action === "sauvegarder_presences"));
  expect(appel).toBeTruthy();
  expect(appel.payloadKeys.sort()).toEqual(["idCompetition", "presences"]);
  expect(appel.payloadKeys).not.toContain("pseudo");
});

test("les horaires sont neutralises pour une absence et les sauvegardes vides sont evitees", async ({ page }) => {
  await installerSupabaseSimule(page);
  await connecterJoueur(page);
  await page.getByRole("button", { name: "Consulter mes compétitions" }).click();
  await page.getByRole("article").getByRole("button", { name: "Ouvrir" }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toContainText("Aucune modification");
  expect(await page.evaluate(() => window.__mppCalls.filter((item) => item.action === "sauvegarder_presences").length)).toBe(0);
  await page.locator("#presence-status-101").selectOption("Absent");
  await expect(page.getByLabel("21:00", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("21:00", { exact: true })).not.toBeChecked();
});

test("la session joueur se restaure au refresh puis se revoque a la deconnexion", async ({ page }) => {
  await installerSupabaseSimule(page);
  await connecterJoueur(page);
  await page.reload();
  await expect(page.getByText("Connecté : Testeur")).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { name: "Identification" })).toBeVisible();
  const session = await page.evaluate(() => ({ ...sessionStorage }));
  expect(JSON.stringify(session)).not.toContain("a".repeat(64));
});

for (const statutCompte of ["Inactif", "Suspendu"]) {
  test(`un compte ${statutCompte.toLowerCase()} est refuse`, async ({ page }) => {
    await installerSupabaseSimule(page, { status: statutCompte });
    await connecterJoueur(page);
    await expect(page.getByRole("alert")).toContainText("Identification impossible");
  });
}

test("les etats Discord public restent minimaux et la liaison genere un code", async ({ page }) => {
  await installerSupabaseSimule(page, { discordLie: false });
  await connecterJoueur(page);
  await expect(page.getByText("Discord non lié", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lier mon compte Discord" }).click();
  await page.getByRole("button", { name: "Générer un code de liaison" }).click();
  await expect(page.locator("code.discord-link-code")).toHaveText("ABCD2345");
  const appel = await page.evaluate(() => window.__mppCalls.find((item) => item.name === "edge:discord-link-code"));
  expect([...appel.keys].sort()).toEqual(["operationId", "sessionToken"].sort());
  expect(appel.operationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test("un compte Discord deja lie ne propose pas une nouvelle liaison", async ({ page }) => {
  await installerSupabaseSimule(page, { discordLie: true });
  await connecterJoueur(page);
  await expect(page.getByText("Discord lié", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lier mon compte Discord" })).toHaveCount(0);
});

test("un mauvais mot de passe administrateur est refuse sans persistance", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page, "mot-de-passe-refuse");
  await expect(page.getByRole("dialog")).toContainText("Authentification impossible");
  const stockage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stockage).not.toContain("mot-de-passe-refuse");
});

test("les droits Officier masquent les actions SuperAdmin", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Gestion des joueurs" }).click();
  await expect(page.getByRole("heading", { name: "Gestion des joueurs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ajouter un joueur" }).click();
  await expect(page.getByLabel("ID Discord (facultatif)")).toHaveCount(0);
  await expect(page.getByLabel("SuperAdmin", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Modifier" }).first().click();
  await expect(page.getByLabel(/Nouveau code d’accès/)).toHaveCount(0);
});

test("un Officier preserve le role SuperAdmin masque d une competition", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Gestion des compétitions" }).click();
  await page.getByRole("article").getByRole("button", { name: "Modifier" }).click();
  await expect(page.getByLabel("SuperAdmin", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "OK" }).click();
  const appel = await page.evaluate(() => window.__mppCalls.find((item) =>
    item.name === "api_admin_site" && item.action === "modifier_competition"));
  expect(appel.configRoles.split(",")).toContain("SuperAdmin");
});

test("le SuperAdmin dispose des controles reserves et des demandes Discord", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "SuperAdmin", discordLie: true });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Gestion des joueurs" }).click();
  await expect(page.getByRole("button", { name: "Supprimer" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un joueur" }).click();
  await expect(page.getByLabel("ID Discord (facultatif)")).toBeVisible();
  await expect(page.getByLabel("SuperAdmin", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mot de passe administrateur initial (si rôle privilégié)")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Retour" }).click();
  await page.getByRole("button", { name: "Demandes Discord" }).click();
  await expect(page.getByRole("heading", { name: "Demandes de liaison Discord" })).toBeVisible();
  await expect(page.getByText("Compte Discord : CompteFixture")).toBeVisible();
});

test("la creation de competition refuse dates et horaires invalides avant RPC", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "SuperAdmin", discordLie: true });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Gestion des compétitions" }).click();
  await page.getByRole("button", { name: "Créer une compétition" }).click();
  await page.getByLabel("Nom").fill("Compétition validation");
  await page.getByLabel(/Dates/).fill("2026-02-30, 2026-02-30");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("dates sont invalides");
  expect(await page.evaluate(() => window.__mppCalls.filter((item) => item.action === "creer_competition").length)).toBe(0);
  await page.getByLabel(/Dates/).fill("2026-07-20");
  await page.getByLabel("Horaires").fill("21:00,25:15");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("horaires sont invalides");
  expect(await page.evaluate(() => window.__mppCalls.filter((item) => item.action === "creer_competition").length)).toBe(0);
  await expect(page.getByLabel("Officier", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Strateur", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Soldat", { exact: true })).toBeChecked();
});

test("la rotation admin repose sur la session et ne redemande pas l ancien secret", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Modifier mon mot de passe" }).click();
  await expect(page.getByLabel("Mot de passe actuel")).toHaveCount(0);
  await expect(page.getByLabel("Nouveau mot de passe")).toBeVisible();
  await expect(page.getByLabel("Confirmer")).toBeVisible();
});

test("les vues officier aujourd hui tableau et sans reponse restent navigables", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Présences du jour" }).click();
  await expect(page.getByText(/Activé à 17:00 — Rappel envoyé/)).toBeVisible();
  await page.getByRole("button", { name: "Consulter les présences" }).press("Enter");
  await expect(page.getByText("Tableau complet des présences")).toBeVisible();
  await page.getByRole("button", { name: "Présences du jour" }).click();
  await page.getByRole("button", { name: "Voir les sans réponse" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Joueurs sans réponse" })).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("heading", { name: "Tableaux de présences" })).toBeVisible();
});

test("le statut du rappel joueur canonique reste visible dans les presences du jour", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier" });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await page.getByRole("button", { name: "Présences du jour" }).click();
  await expect(page.getByText("Activé à 17:00 — Rappel envoyé", { exact: true })).toBeVisible();
});

test("une expiration admin efface le token memoire", async ({ page }) => {
  await installerSupabaseSimule(page, { role: "Officier", adminExpired: true });
  await connecterJoueur(page, "Officier Test");
  await ouvrirEspaceAdmin(page);
  await expect(page.getByRole("alert")).toContainText("Session officier expirée");
  const token = await page.evaluate(() => window.MPPSession.lireSessionAdmin());
  expect(token).toBe("");
});
