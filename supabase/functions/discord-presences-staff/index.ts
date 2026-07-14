import {
  clientService,
  creerDeadlineGlobale,
  dateHeureParis,
  envObligatoire,
  erreurSecurisee,
  estDansFenetreRetard,
  heureHHMM,
  json,
  logSecurise,
  secretCronValide,
  tempsRestant,
  verifierDeadline,
} from "../_shared/runtime.ts";
import { envoyerWebhookDiscord } from "../_shared/discord.ts";
import {
  creerSnapshotDiscord,
  metadataDepuisReservation,
  snapshotDepuisReservation,
  type SnapshotDiscord,
} from "../_shared/fragments.ts";
import { construireResumeStaff } from "../_shared/messages.ts";

const CLE_RESERVATION = "presence_staff";

type Competition = {
  id: number;
  nom: string;
  notification_presence_active: boolean;
  heure_notification_presence: string | null;
};

type Presence = {
  competition_id: number;
  joueur_id: number;
  statut: string;
};

type DonneesRappelsDiscord = {
  succes: boolean;
  dates: Array<{
    id: number;
    competition_id: number;
    date_competition: string;
  }>;
  competitions: Competition[];
  joueurs: Array<{
    id: number;
    pseudo: string;
    roles: string;
    discord_id: string | null;
  }>;
  presences: Presence[];
};

type EchecEnvoi = { code: string; incertain?: boolean; terminal?: boolean };

function finalisationConforme(
  finalisation: Record<string, unknown> | null,
  snapshot: SnapshotDiscord,
  statutAttendu: string,
): boolean {
  return finalisation?.succes === true &&
    finalisation.etat === statutAttendu &&
    finalisation.snapshotHash === snapshot.snapshotHash &&
    Number(finalisation.fragmentCount) === snapshot.fragmentCount;
}

function fragmentConforme(
  reservationFragment: Record<string, unknown>,
  contenuAttendu: string,
): boolean {
  return reservationFragment.contenu === contenuAttendu;
}

Deno.serve(async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) {
    return json({ succes: false }, 405);
  }
  const deadlineMs = creerDeadlineGlobale();
  try {
    if (!secretCronValide(req, "CRON_SECRET_PRESENCES_STAFF")) {
      return json({ succes: false }, 401);
    }
    const supabase = clientService(deadlineMs);
    const webhook = envObligatoire("DISCORD_WEBHOOK_STAFF");
    const maintenant = dateHeureParis();
    verifierDeadline(deadlineMs, 12_000);
    const { data: donneesBrutes, error: erreurDonnees } = await supabase.rpc(
      "charger_donnees_rappels_discord_site",
      { p_date: maintenant.date },
    );
    const donnees = donneesBrutes as DonneesRappelsDiscord | null;
    if (
      erreurDonnees || donnees?.succes !== true ||
      !Array.isArray(donnees.dates) ||
      !Array.isArray(donnees.competitions) ||
      !Array.isArray(donnees.joueurs) ||
      !Array.isArray(donnees.presences)
    ) {
      throw new Error("LECTURE_SNAPSHOT_STAFF");
    }
    if (!donnees.dates.length) {
      return json({ succes: true, analysees: 0, envoyees: 0 });
    }

    const resultats: Array<Record<string, unknown>> = [];
    const competitionsTriees = [...donnees.competitions].sort((a, b) =>
      Number(a.id) - Number(b.id)
    );
    for (const competition of competitionsTriees) {
      if (tempsRestant(deadlineMs) <= 9_000) {
        resultats.push({ competitionId: competition.id, statut: "deadline" });
        continue;
      }
      try {
        const heure = heureHHMM(competition.heure_notification_presence);
        if (!competition.notification_presence_active) {
          resultats.push({ competitionId: competition.id, statut: "inactive" });
          continue;
        }
        if (!estDansFenetreRetard(maintenant.heure, heure, 120)) {
          resultats.push({
            competitionId: competition.id,
            statut: "hors_fenetre",
          });
          continue;
        }

        const lignes = donnees.presences.filter((presence) =>
          Number(presence.competition_id) === Number(competition.id)
        );
        const compte = (statut: string) =>
          lignes.filter((presence) =>
            String(presence.statut || "").toLocaleLowerCase("fr-FR") === statut
          ).length;
        const presents = compte("présent");
        const remplacants = compte("remplaçant");
        const absents = compte("absent");
        const repondants = new Set(
          lignes
            .filter((presence) =>
              ["présent", "remplaçant", "absent"].includes(
                String(presence.statut || "").toLocaleLowerCase("fr-FR"),
              )
            )
            .map((presence) => Number(presence.joueur_id)),
        ).size;
        const resume = construireResumeStaff(competition, maintenant.date, {
          presents,
          remplacants,
          absents,
          repondants,
        });
        const candidat = await creerSnapshotDiscord([resume]);

        verifierDeadline(deadlineMs, 8_000);
        const { data: reservation, error: erreurReservation } = await supabase
          .rpc("reserver_envoi_discord_site", {
            p_type_rappel: CLE_RESERVATION,
            p_competition_id: competition.id,
            p_date_competition: maintenant.date,
            p_heure_programmee: heure,
            p_lease_seconds: 180,
            p_fragments: candidat.fragments,
            p_snapshot_hash: candidat.snapshotHash,
            p_fragment_count: candidat.fragmentCount,
          });
        if (erreurReservation || !reservation?.succes) {
          throw new Error("RESERVATION_STAFF");
        }
        if (!["claimed", "retry_claimed"].includes(reservation.etat)) {
          resultats.push({
            competitionId: competition.id,
            statut: reservation.etat,
          });
          continue;
        }

        const snapshot = await snapshotDepuisReservation(reservation);
        const metadataReservation = metadataDepuisReservation(reservation);
        let echec: EchecEnvoi | null = null;
        let envoyes = 0;
        for (const fragmentSnapshot of snapshot.fragments) {
          verifierDeadline(deadlineMs, 1_000);
          const {
            data: reservationFragment,
            error: erreurReservationFragment,
          } = await supabase.rpc("reserver_fragment_discord_site", {
            p_rappel_id: metadataReservation.rappelId,
            p_execution_id: metadataReservation.executionId,
            p_sequence: fragmentSnapshot.sequence,
            p_snapshot_hash: snapshot.snapshotHash,
            p_fragment_count: snapshot.fragmentCount,
          });
          if (erreurReservationFragment || !reservationFragment?.succes) {
            echec = { code: "RESERVATION_FRAGMENT" };
            break;
          }
          if (
            !fragmentConforme(reservationFragment, fragmentSnapshot.contenu)
          ) {
            echec = {
              code: "FRAGMENT_SNAPSHOT_DIVERGENT",
              incertain: true,
            };
            break;
          }
          if (reservationFragment.etat === "already_sent") {
            envoyes += 1;
            continue;
          }
          if (reservationFragment.etat === "manual_review") {
            echec = { code: "FRAGMENT_ETAT_INCONNU", incertain: true };
            break;
          }
          if (
            !["claimed", "retry_claimed"].includes(reservationFragment.etat)
          ) {
            echec = { code: "FRAGMENT_ETAT_INCONNU", incertain: true };
            break;
          }

          const envoi = await envoyerWebhookDiscord(
            webhook,
            fragmentSnapshot.contenu,
            {
              deadlineMs,
              utilisateursAutorises: [],
            },
          );
          if (envoi.incertain) {
            echec = envoi;
            break;
          }
          const { data: fragment, error: erreurFragment } = await supabase.rpc(
            "enregistrer_fragment_discord_site",
            {
              p_rappel_id: metadataReservation.rappelId,
              p_execution_id: metadataReservation.executionId,
              p_sequence: fragmentSnapshot.sequence,
              p_snapshot_hash: snapshot.snapshotHash,
              p_fragment_count: snapshot.fragmentCount,
              p_statut: envoi.succes ? "envoye" : "echec",
              p_discord_message_id: envoi.messageId || null,
              p_erreur_code: envoi.succes ? null : envoi.code,
            },
          );
          if (erreurFragment || !fragment?.succes) {
            echec = { code: "FRAGMENT_NON_ENREGISTRE", incertain: true };
            break;
          }
          if (!envoi.succes) {
            echec = envoi;
            break;
          }
          envoyes += 1;
        }

        const statutFinal = echec?.incertain
          ? "echec_incertain"
          : echec?.terminal
          ? "echec_permanent"
          : echec
          ? "echec"
          : "envoye";
        const { data: finalisation, error: erreurFinalisation } = await supabase
          .rpc("finaliser_envoi_discord_site", {
            p_rappel_id: metadataReservation.rappelId,
            p_execution_id: metadataReservation.executionId,
            p_statut: statutFinal,
            p_snapshot_hash: snapshot.snapshotHash,
            p_fragment_count: snapshot.fragmentCount,
            p_nb_joueurs: repondants,
            p_nb_messages: envoyes,
            p_details: {
              version: "0.13.0",
              presents,
              remplacants,
              absents,
              tentativeReservation: metadataReservation.tentative,
              etatReservation: metadataReservation.etat,
            },
            p_erreur_code: echec?.code || null,
          });
        if (
          erreurFinalisation ||
          !finalisationConforme(finalisation, snapshot, statutFinal)
        ) throw new Error("FINALISATION_STAFF");
        resultats.push({
          competitionId: competition.id,
          statut: statutFinal,
          messages: envoyes,
        });
      } catch (erreurCompetition) {
        erreurSecurisee("discord_staff_competition_echec", erreurCompetition);
        resultats.push({
          competitionId: competition.id,
          statut: "echec_traitement",
        });
      }
    }
    logSecurise("discord_staff_termine", {
      fonction: "discord-presences-staff",
      date: maintenant.date,
      statut: "termine",
    });
    return json({
      succes: true,
      date: maintenant.date,
      heure: maintenant.heure,
      resultats,
    });
  } catch (erreur) {
    erreurSecurisee("discord_staff_echec", erreur);
    return json(
      { succes: false, message: "Notification staff indisponible." },
      500,
    );
  }
});
