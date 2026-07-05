import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://mpp-clan.fr";
const TIMEZONE_FRANCE = "Europe/Paris";
const TYPE_RAPPEL = "sans_reponse_17h";
const LIMITE_DISCORD = 1900;

type SupabaseClient = ReturnType<typeof createClient>;

type Joueur = {
  id: number;
  pseudo: string;
  statut: string | null;
  discord_id: string | null;
  discord_username?: string | null;
  discord_lie_a: string | null;
};

type DateCompetition = {
  id?: number;
  competition_id: number;
  date_competition: string;
};

type Competition = {
  id: number;
  nom: string | null;
  statut?: string | null;
  rappel_presence_active?: boolean | null;
  heure_rappel_presence?: string | null;
};

type Presence = {
  pseudo: string | null;
  statut: string | null;
};

type JoueurRelance = {
  pseudo: string;
  discordId: string;
};

type ReservationRappel = {
  tableDisponible: boolean;
  reservee: boolean;
  id?: number;
  dejaEnvoye?: boolean;
  erreur?: string;
};

function reponseJson(donnees: Record<string, unknown>, statut = 200) {
  return new Response(JSON.stringify(donnees, null, 2), {
    status: statut,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function texte(valeur: unknown): string {
  return String(valeur || "").trim();
}

function normaliser(valeur: unknown): string {
  return texte(valeur)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clePseudo(pseudo: unknown): string {
  return normaliser(pseudo);
}

function dateFranceISO(date = new Date()): string {
  const morceaux = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE_FRANCE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const annee = morceaux.find((morceau) => morceau.type === "year")?.value || "";
  const mois = morceaux.find((morceau) => morceau.type === "month")?.value || "";
  const jour = morceaux.find((morceau) => morceau.type === "day")?.value || "";

  return `${annee}-${mois}-${jour}`;
}

function heureFranceHHMM(date = new Date()): string {
  const morceaux = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE_FRANCE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const heure = morceaux.find((morceau) => morceau.type === "hour")?.value || "00";
  const minute = morceaux.find((morceau) => morceau.type === "minute")?.value || "00";

  return `${heure}:${minute}`;
}

function formatDateFr(dateIso: string): string {
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
}

function normaliserHeure(valeur: unknown): string {
  const match = texte(valeur).match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function minutesDepuisHeure(heure: string): number {
  const heureNormalisee = normaliserHeure(heure);
  if (!heureNormalisee) return -1;

  const [heures, minutes] = heureNormalisee.split(":").map(Number);
  return heures * 60 + minutes;
}

function heureProgrammeAtteinte(heureActuelle: string, heureProgrammee: string): boolean {
  const minutesActuelles = minutesDepuisHeure(heureActuelle);
  const minutesProgrammees = minutesDepuisHeure(heureProgrammee);

  return minutesActuelles >= 0 &&
    minutesProgrammees >= 0 &&
    minutesActuelles >= minutesProgrammees;
}

function estJoueurActif(joueur: Joueur): boolean {
  return normaliser(joueur.statut) === "actif";
}

function competitionOuverte(competition: Competition | undefined): boolean {
  return normaliser(competition?.statut) === "ouverte";
}

function statutSansReponse(statut: unknown): boolean {
  const valeur = normaliser(statut);
  return !valeur || valeur === "non renseigne";
}

function erreurTableIntrouvable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = normaliser(error.message);
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function erreurConflitUnique(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23505" || normaliser(error.message).includes("duplicate key");
}

async function journaliser(
  supabase: SupabaseClient,
  action: string,
  details: string,
) {
  const { error } = await supabase
    .from("journal_activite")
    .insert([{
      utilisateur: "Système automatique",
      action,
      details,
    }]);

  if (error) {
    console.error("Journalisation impossible:", error.message);
  }
}

async function chargerDatesDuJour(supabase: SupabaseClient, dateIso: string) {
  const { data, error } = await supabase
    .from("dates_competition")
    .select("id,competition_id,date_competition")
    .eq("date_competition", dateIso);

  if (error) throw new Error(`Chargement des dates impossible: ${error.message}`);
  return (data || []) as DateCompetition[];
}

async function chargerCompetitions(
  supabase: SupabaseClient,
  idsCompetitions: number[],
) {
  if (idsCompetitions.length === 0) return new Map<number, Competition>();

  const { data, error } = await supabase
    .from("competitions")
    .select("id,nom,statut,rappel_presence_active,heure_rappel_presence")
    .in("id", idsCompetitions);

  if (error) throw new Error(`Chargement des competitions impossible: ${error.message}`);

  const competitions = new Map<number, Competition>();
  for (const competition of (data || []) as Competition[]) {
    competitions.set(Number(competition.id), competition);
  }

  return competitions;
}

async function chargerJoueursActifs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("joueurs")
    .select("id,pseudo,statut,discord_id,discord_username,discord_lie_a");

  if (error) throw new Error(`Chargement des joueurs impossible: ${error.message}`);

  return ((data || []) as Joueur[])
    .filter(estJoueurActif)
    .filter((joueur) => Boolean(texte(joueur.pseudo)));
}

async function chargerPresencesDuJour(
  supabase: SupabaseClient,
  idCompetition: number,
  dateIso: string,
) {
  const { data, error } = await supabase
    .from("presences")
    .select("pseudo,statut")
    .eq("competition_id", idCompetition)
    .eq("date_competition", dateIso);

  if (error) throw new Error(`Chargement des presences impossible: ${error.message}`);
  return (data || []) as Presence[];
}

function joueursSansReponse(joueursActifs: Joueur[], presences: Presence[]) {
  const statutsParPseudo = new Map<string, string[]>();

  for (const presence of presences) {
    const cle = clePseudo(presence.pseudo);
    if (!cle) continue;

    if (!statutsParPseudo.has(cle)) {
      statutsParPseudo.set(cle, []);
    }

    statutsParPseudo.get(cle)?.push(texte(presence.statut));
  }

  return joueursActifs.filter((joueur) => {
    const statuts = statutsParPseudo.get(clePseudo(joueur.pseudo)) || [];
    return statuts.length === 0 || statuts.every(statutSansReponse);
  });
}

function separerJoueursDiscord(joueurs: Joueur[]) {
  const avecDiscord: JoueurRelance[] = [];
  const sansDiscord: string[] = [];

  for (const joueur of joueurs) {
    const pseudo = texte(joueur.pseudo);
    const discordId = texte(joueur.discord_id);
    const discordLieA = texte(joueur.discord_lie_a);

    if (discordId && discordLieA && /^\d+$/.test(discordId)) {
      avecDiscord.push({ pseudo, discordId });
    } else {
      sansDiscord.push(pseudo);
    }
  }

  return { avecDiscord, sansDiscord };
}

function introDiscord(nomCompetition: string, dateFr: string, suite = false) {
  return [
    `⏰ Rappel présences — MPP${suite ? " (suite)" : ""}`,
    "",
    `🏆 Compétition : ${nomCompetition}`,
    `📅 Aujourd'hui : ${dateFr}`,
    "",
    "Les joueurs suivants n'ont pas encore renseigné leurs présences pour ce soir.",
    "",
    "Merci de remplir vos disponibilités avant 19h00 :",
    SITE_URL,
    "",
  ].join("\n");
}

function idsMentionnes(contenu: string) {
  return Array.from(contenu.matchAll(/<@(\d+)>/g))
    .map((match) => match[1])
    .filter(Boolean);
}

function construireMessagesDiscord(
  nomCompetition: string,
  dateFr: string,
  avecDiscord: JoueurRelance[],
  sansDiscord: string[],
) {
  const lignes: string[] = [];

  if (avecDiscord.length > 0) {
    lignes.push("Joueurs à relancer :");
    for (const joueur of avecDiscord) {
      lignes.push(`<@${joueur.discordId}>`);
    }
  }

  if (sansDiscord.length > 0) {
    if (lignes.length > 0) lignes.push("");
    lignes.push("Joueurs sans Discord lié :");
    for (const pseudo of sansDiscord) {
      lignes.push(`- ${pseudo}`);
    }
  }

  const messages: Array<{ contenu: string; usersAutorises: string[] }> = [];
  let contenu = introDiscord(nomCompetition, dateFr);
  let lignesDansMessage = 0;

  for (const ligne of lignes) {
    const separateur = contenu.endsWith("\n") ? "" : "\n";
    const candidat = `${contenu}${separateur}${ligne}`;

    if (lignesDansMessage > 0 && candidat.length > LIMITE_DISCORD) {
      const contenuFinal = contenu.trimEnd();
      messages.push({
        contenu: contenuFinal,
        usersAutorises: idsMentionnes(contenuFinal),
      });

      contenu = `${introDiscord(nomCompetition, dateFr, true)}${ligne}`;
      lignesDansMessage = 1;
    } else {
      contenu = candidat;
      lignesDansMessage += 1;
    }
  }

  const contenuFinal = contenu.trimEnd();
  if (contenuFinal) {
    messages.push({
      contenu: contenuFinal,
      usersAutorises: idsMentionnes(contenuFinal),
    });
  }

  return messages;
}

async function envoyerMessageDiscord(
  webhookDiscord: string,
  contenu: string,
  usersAutorises: string[],
) {
  const reponse = await fetch(webhookDiscord, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: contenu,
      allowed_mentions: {
        parse: [],
        users: usersAutorises,
      },
    }),
  });

  if (!reponse.ok) {
    const details = await reponse.text();
    throw new Error(`Envoi Discord impossible (${reponse.status}): ${details}`);
  }
}

async function reserverRappel(
  supabase: SupabaseClient,
  idCompetition: number,
  dateIso: string,
  nbJoueurs: number,
  heureProgrammee: string,
): Promise<ReservationRappel> {
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from("rappels_presence_discord")
    .insert([{
      type_rappel: TYPE_RAPPEL,
      competition_id: idCompetition,
      date_competition: dateIso,
      heure_programmee: heureProgrammee,
      statut: "en_cours",
      nb_joueurs: nbJoueurs,
      created_at: maintenant,
      updated_at: maintenant,
    }])
    .select("id")
    .single();

  if (!error) {
    return {
      tableDisponible: true,
      reservee: true,
      id: Number(data?.id),
    };
  }

  if (erreurTableIntrouvable(error)) {
    console.warn("Table rappels_presence_discord introuvable:", error.message);
    return {
      tableDisponible: false,
      reservee: true,
      erreur: error.message,
    };
  }

  if (erreurConflitUnique(error)) {
    return {
      tableDisponible: true,
      reservee: false,
      dejaEnvoye: true,
      erreur: error.message,
    };
  }

  throw new Error(`Reservation anti-doublon impossible: ${error.message}`);
}

async function finaliserRappel(
  supabase: SupabaseClient,
  reservation: ReservationRappel,
  donnees: {
    nbJoueurs: number;
    nbMentions: number;
    nbSansDiscord: number;
    nbMessages: number;
    competition: string;
    dateIso: string;
    heureProgrammee: string;
    statut?: string;
  },
) {
  if (!reservation.tableDisponible || !reservation.id) return;

  const { error } = await supabase
    .from("rappels_presence_discord")
    .update({
      statut: donnees.statut || "envoye",
      envoye_a: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      nb_joueurs: donnees.nbJoueurs,
      nb_mentions: donnees.nbMentions,
      nb_sans_discord: donnees.nbSansDiscord,
      nb_messages: donnees.nbMessages,
      heure_programmee: donnees.heureProgrammee,
      details: {
        competition: donnees.competition,
        date: donnees.dateIso,
        heureProgrammee: donnees.heureProgrammee,
      },
      erreur: null,
    })
    .eq("id", reservation.id);

  if (error) {
    console.error("Finalisation anti-doublon impossible:", error.message);
  }
}

async function marquerRappelEnErreur(
  supabase: SupabaseClient,
  reservation: ReservationRappel,
  erreur: string,
) {
  if (!reservation.tableDisponible || !reservation.id) return;

  const { error } = await supabase
    .from("rappels_presence_discord")
    .update({
      statut: "erreur",
      updated_at: new Date().toISOString(),
      erreur,
    })
    .eq("id", reservation.id);

  if (error) {
    console.error("Marquage erreur anti-doublon impossible:", error.message);
  }
}

async function traiterCompetition(
  supabase: SupabaseClient,
  webhookDiscord: string,
  dateCompetition: DateCompetition,
  competition: Competition | undefined,
  joueursActifs: Joueur[],
  dateIso: string,
  dateFr: string,
  heureActuelle: string,
) {
  const idCompetition = Number(dateCompetition.competition_id);
  const nomCompetition = texte(competition?.nom) || "Compétition inconnue";
  const heureRappelPresence = normaliserHeure(competition?.heure_rappel_presence);

  if (!competition) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "competition_introuvable",
    };
  }

  if (!competitionOuverte(competition)) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "competition_non_ouverte",
    };
  }

  if (competition.rappel_presence_active !== true) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "rappel_desactive",
    };
  }

  if (!heureRappelPresence) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "heure_rappel_absente",
    };
  }

  if (!heureProgrammeAtteinte(heureActuelle, heureRappelPresence)) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "heure_non_atteinte",
      heureActuelle,
      heureProgrammee: heureRappelPresence,
    };
  }

  const presences = await chargerPresencesDuJour(supabase, idCompetition, dateIso);
  const joueursARelancer = joueursSansReponse(joueursActifs, presences);

  const reservation = await reserverRappel(
    supabase,
    idCompetition,
    dateIso,
    joueursARelancer.length,
    heureRappelPresence,
  );

  if (!reservation.reservee && reservation.dejaEnvoye) {
    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: joueursARelancer.length,
      messagesEnvoyes: 0,
      ignore: true,
      raison: "rappel_deja_envoye",
      heureProgrammee: heureRappelPresence,
    };
  }

  if (joueursARelancer.length === 0) {
    await finaliserRappel(supabase, reservation, {
      nbJoueurs: 0,
      nbMentions: 0,
      nbSansDiscord: 0,
      nbMessages: 0,
      competition: nomCompetition,
      dateIso,
      heureProgrammee: heureRappelPresence,
      statut: "aucun_joueur",
    });

    await journaliser(
      supabase,
      "Rappel Discord présences",
      [
        `Compétition : ${nomCompetition}`,
        `Date : ${dateFr}`,
        `Heure programmée : ${heureRappelPresence}`,
        "Aucun joueur à relancer.",
      ].join("\n"),
    );

    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: 0,
      messagesEnvoyes: 0,
      ignore: false,
      raison: "aucun_joueur_a_relancer",
      heureProgrammee: heureRappelPresence,
    };
  }

  const { avecDiscord, sansDiscord } = separerJoueursDiscord(joueursARelancer);
  const messages = construireMessagesDiscord(
    nomCompetition,
    dateFr,
    avecDiscord,
    sansDiscord,
  );

  try {
    for (const message of messages) {
      await envoyerMessageDiscord(
        webhookDiscord,
        message.contenu,
        message.usersAutorises,
      );
    }

    await finaliserRappel(supabase, reservation, {
      nbJoueurs: joueursARelancer.length,
      nbMentions: avecDiscord.length,
      nbSansDiscord: sansDiscord.length,
      nbMessages: messages.length,
      competition: nomCompetition,
      dateIso,
      heureProgrammee: heureRappelPresence,
    });

    await journaliser(
      supabase,
      "Rappel Discord présences",
      [
        `Compétition : ${nomCompetition}`,
        `Date : ${dateFr}`,
        `Heure programmée : ${heureRappelPresence}`,
        `Joueurs relancés : ${joueursARelancer.length}`,
        `Mentions Discord : ${avecDiscord.length}`,
        `Sans Discord lié : ${sansDiscord.length}`,
        `Messages envoyés : ${messages.length}`,
        reservation.tableDisponible
          ? "Anti-doublon : enregistré"
          : "Anti-doublon : table rappels_presence_discord absente",
      ].join("\n"),
    );

    return {
      idCompetition,
      competition: nomCompetition,
      joueursRelances: joueursARelancer.length,
      mentionsDiscord: avecDiscord.length,
      sansDiscord: sansDiscord.length,
      messagesEnvoyes: messages.length,
      ignore: false,
      heureProgrammee: heureRappelPresence,
      antiDoublonDisponible: reservation.tableDisponible,
    };
  } catch (error) {
    await marquerRappelEnErreur(supabase, reservation, String(error));
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return reponseJson({ succes: false, erreur: "Méthode non autorisée" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookDiscord = Deno.env.get("DISCORD_WEBHOOK_RAPPEL_PRESENCES");
  const cronSecret = Deno.env.get("CRON_SECRET_RAPPEL_PRESENCES");

  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return reponseJson({ succes: false, erreur: "Accès refusé" }, 401);
  }

  if (!supabaseUrl || !serviceRoleKey || !webhookDiscord) {
    return reponseJson({
      succes: false,
      erreur: "Secrets Supabase manquants",
      requis: [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "DISCORD_WEBHOOK_RAPPEL_PRESENCES",
      ],
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const maintenant = new Date();
  const dateIso = dateFranceISO(maintenant);
  const dateFr = formatDateFr(dateIso);
  const heureActuelle = heureFranceHHMM(maintenant);

  try {
    const datesDuJour = await chargerDatesDuJour(supabase, dateIso);

    if (datesDuJour.length === 0) {
      return reponseJson({
        succes: true,
        date: dateIso,
        heureActuelle,
        competitionsAvecDate: 0,
        messagesEnvoyes: 0,
      });
    }

    const idsCompetitions = Array.from(
      new Set(datesDuJour.map((date) => Number(date.competition_id)).filter(Boolean)),
    );
    const competitions = await chargerCompetitions(supabase, idsCompetitions);
    const joueursActifs = await chargerJoueursActifs(supabase);

    const resultats = [];

    for (const dateCompetition of datesDuJour) {
      const idCompetition = Number(dateCompetition.competition_id);
      resultats.push(await traiterCompetition(
        supabase,
        webhookDiscord,
        dateCompetition,
        competitions.get(idCompetition),
        joueursActifs,
        dateIso,
        dateFr,
        heureActuelle,
      ));
    }

    const messagesEnvoyes = resultats.reduce(
      (total, resultat) => total + Number(resultat.messagesEnvoyes || 0),
      0,
    );

    return reponseJson({
      succes: true,
      date: dateIso,
      heureActuelle,
      timezone: TIMEZONE_FRANCE,
      competitionsAvecDate: datesDuJour.length,
      joueursActifs: joueursActifs.length,
      messagesEnvoyes,
      resultats,
    });
  } catch (error) {
    console.error(error);
    await journaliser(
      supabase,
      "Rappel Discord présences",
      [
        `Date : ${dateFr}`,
        "Erreur pendant le rappel automatique.",
        `Détail : ${String(error)}`,
      ].join("\n"),
    );

    return reponseJson({
      succes: false,
      erreur: String(error),
    }, 500);
  }
});
