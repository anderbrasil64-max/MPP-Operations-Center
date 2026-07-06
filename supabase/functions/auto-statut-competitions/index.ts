import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIMEZONE_FRANCE = "Europe/Paris";

type SupabaseClient = ReturnType<typeof createClient>;

type DateCompetition = {
  competition_id: number;
  date_competition: string;
};

type Competition = {
  id: number;
  nom: string | null;
  statut: string | null;
  fermeture_auto_active: boolean | null;
  heure_ouverture: string | null;
  heure_fermeture: string | null;
  dernier_traitement_auto: string | null;
};

type ResultatCompetition = {
  idCompetition: number;
  competition: string;
  statutInitial: string;
  statutCible: string | null;
  modifie: boolean;
  ignore: boolean;
  raison?: string;
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

function formatFrance(date: Date) {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE_FRANCE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const valeur = (type: string) =>
    parties.find((partie) => partie.type === type)?.value || "";

  return {
    dateIso: `${valeur("year")}-${valeur("month")}-${valeur("day")}`,
    heure: `${valeur("hour")}:${valeur("minute")}`,
  };
}

function heureHHMM(heure: unknown): string {
  const valeur = texte(heure);
  const match = valeur.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function statutPrisEnCharge(statut: unknown): boolean {
  const statutNormalise = normaliser(statut);
  return statutNormalise === "ouverte" || statutNormalise === "fermee";
}

function libelleStatutDepuisCle(statutNormalise: string): string | null {
  if (statutNormalise === "ouverte") return "Ouverte";
  if (statutNormalise === "fermee") return "Fermée";
  return null;
}

function calculerStatutCible(
  heureActuelle: string,
  heureOuverture: string,
  heureFermeture: string,
): string {
  let ouvert = false;

  if (heureOuverture < heureFermeture) {
    ouvert = heureActuelle >= heureOuverture && heureActuelle < heureFermeture;
  } else {
    ouvert = heureActuelle >= heureOuverture || heureActuelle < heureFermeture;
  }

  return ouvert ? "Ouverte" : "Fermée";
}

function detailsJournal(
  competition: Competition,
  statutInitial: string,
  statutCible: string,
  dateIso: string,
  heureActuelle: string,
  heureOuverture: string,
  heureFermeture: string,
) {
  return [
    `Compétition : ${competition.nom || "Compétition inconnue"}`,
    `Ancien statut : ${statutInitial}`,
    `Nouveau statut : ${statutCible}`,
    `Date France : ${dateIso}`,
    `Heure France : ${heureActuelle}`,
    `Plage horaire : ${heureOuverture} - ${heureFermeture}`,
  ].join("\n");
}

async function chargerDatesDuJour(
  supabase: SupabaseClient,
  dateIso: string,
): Promise<DateCompetition[]> {
  const { data, error } = await supabase
    .from("dates_competition")
    .select("competition_id,date_competition")
    .eq("date_competition", dateIso);

  if (error) {
    throw new Error(`Chargement des dates impossible: ${error.message}`);
  }

  return (data || []) as DateCompetition[];
}

async function chargerCompetitions(
  supabase: SupabaseClient,
  idsCompetitions: number[],
): Promise<Competition[]> {
  if (idsCompetitions.length === 0) return [];

  const { data, error } = await supabase
    .from("competitions")
    .select(
      "id,nom,statut,fermeture_auto_active,heure_ouverture,heure_fermeture,dernier_traitement_auto",
    )
    .in("id", idsCompetitions);

  if (error) {
    throw new Error(`Chargement des compétitions impossible: ${error.message}`);
  }

  return (data || []) as Competition[];
}

async function journaliserChangement(
  supabase: SupabaseClient,
  competition: Competition,
  statutInitial: string,
  statutCible: string,
  dateIso: string,
  heureActuelle: string,
  heureOuverture: string,
  heureFermeture: string,
) {
  const { error } = await supabase
    .from("journal_activite")
    .insert([{
      utilisateur: "Système automatique",
      action: "Statut compétition automatique",
      details: detailsJournal(
        competition,
        statutInitial,
        statutCible,
        dateIso,
        heureActuelle,
        heureOuverture,
        heureFermeture,
      ),
    }]);

  if (error) {
    console.error("Journalisation du statut automatique impossible:", {
      competition_id: competition.id,
      competition: competition.nom || "",
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }
}

async function traiterCompetition(
  supabase: SupabaseClient,
  competition: Competition,
  dateIso: string,
  heureActuelle: string,
): Promise<ResultatCompetition> {
  const statutInitial = texte(competition.statut);
  const nomCompetition = competition.nom || "Compétition inconnue";

  if (!competition.fermeture_auto_active) {
    return {
      idCompetition: competition.id,
      competition: nomCompetition,
      statutInitial,
      statutCible: null,
      modifie: false,
      ignore: true,
      raison: "fermeture automatique désactivée",
    };
  }

  if (!statutPrisEnCharge(statutInitial)) {
    return {
      idCompetition: competition.id,
      competition: nomCompetition,
      statutInitial,
      statutCible: null,
      modifie: false,
      ignore: true,
      raison: "statut non pris en charge",
    };
  }

  const heureOuverture = heureHHMM(competition.heure_ouverture);
  const heureFermeture = heureHHMM(competition.heure_fermeture);

  if (!heureOuverture || !heureFermeture) {
    return {
      idCompetition: competition.id,
      competition: nomCompetition,
      statutInitial,
      statutCible: null,
      modifie: false,
      ignore: true,
      raison: "horaires automatiques incomplets",
    };
  }

  const statutCible = calculerStatutCible(
    heureActuelle,
    heureOuverture,
    heureFermeture,
  );

  if (normaliser(statutInitial) === normaliser(statutCible)) {
    return {
      idCompetition: competition.id,
      competition: nomCompetition,
      statutInitial,
      statutCible,
      modifie: false,
      ignore: false,
      raison: "statut déjà à jour",
    };
  }

  const { data, error } = await supabase
    .from("competitions")
    .update({
      statut: statutCible,
      dernier_traitement_auto: dateIso,
    })
    .eq("id", competition.id)
    .eq("statut", statutInitial)
    .select("id");

  if (error) {
    throw new Error(
      `Mise à jour impossible pour la compétition ${competition.id}: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    return {
      idCompetition: competition.id,
      competition: nomCompetition,
      statutInitial,
      statutCible,
      modifie: false,
      ignore: true,
      raison: "statut déjà modifié par un autre traitement",
    };
  }

  await journaliserChangement(
    supabase,
    competition,
    statutInitial,
    statutCible,
    dateIso,
    heureActuelle,
    heureOuverture,
    heureFermeture,
  );

  return {
    idCompetition: competition.id,
    competition: nomCompetition,
    statutInitial,
    statutCible,
    modifie: true,
    ignore: false,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return reponseJson({ succes: false, erreur: "Méthode non autorisée" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET_AUTO_STATUT_COMPETITIONS");

  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return reponseJson({ succes: false, erreur: "Accès refusé" }, 401);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return reponseJson({
      succes: false,
      erreur: "Secrets Supabase manquants",
      requis: [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
    }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });

  const maintenant = new Date();
  const { dateIso, heure } = formatFrance(maintenant);

  try {
    const datesDuJour = await chargerDatesDuJour(supabase, dateIso);
    const idsCompetitions = Array.from(
      new Set(datesDuJour.map((date) => Number(date.competition_id))),
    ).filter((id) => Number.isFinite(id));
    const competitions = await chargerCompetitions(supabase, idsCompetitions);
    const competitionsParId = new Map(
      competitions.map((competition) => [competition.id, competition]),
    );

    const resultats: ResultatCompetition[] = [];

    for (const idCompetition of idsCompetitions) {
      const competition = competitionsParId.get(idCompetition);

      if (!competition) {
        resultats.push({
          idCompetition,
          competition: "Compétition inconnue",
          statutInitial: "",
          statutCible: null,
          modifie: false,
          ignore: true,
          raison: "compétition introuvable",
        });
        continue;
      }

      resultats.push(
        await traiterCompetition(supabase, competition, dateIso, heure),
      );
    }

    return reponseJson({
      succes: true,
      date: dateIso,
      heure,
      timezone: TIMEZONE_FRANCE,
      competitionsAnalysees: resultats.length,
      competitionsIgnorees: resultats.filter((resultat) => resultat.ignore)
        .length,
      competitionsModifiees: resultats.filter((resultat) => resultat.modifie)
        .length,
      resultats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Traitement auto-statut-competitions impossible:", {
      date: dateIso,
      heure,
      timezone: TIMEZONE_FRANCE,
      message,
    });

    return reponseJson({
      succes: false,
      erreur: "Traitement automatique des statuts impossible",
      message,
    }, 500);
  }
});
