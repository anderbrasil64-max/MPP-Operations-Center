import {
  clientService,
  creerDeadlineGlobale,
  dateHeureParis,
  erreurSecurisee,
  json,
  logSecurise,
  secretCronValide,
} from "../_shared/runtime.ts";

Deno.serve(async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) {
    return json({ succes: false }, 405);
  }
  const deadlineMs = creerDeadlineGlobale(30_000);
  try {
    if (!secretCronValide(req, "CRON_SECRET_AUTO_STATUT_COMPETITIONS")) {
      return json({ succes: false }, 401);
    }
    const maintenant = dateHeureParis();
    const { data, error } = await clientService(deadlineMs).rpc(
      "traiter_auto_statut_competitions_site",
      { p_date: maintenant.date, p_heure: maintenant.heure },
    );
    if (error || !data?.succes) throw new Error("TRAITEMENT_AUTO_STATUT");
    logSecurise("auto_statut_termine", {
      fonction: "auto-statut-competitions",
      date: maintenant.date,
      heure: maintenant.heure,
      statut: "termine",
    });
    return json({
      ...data,
      date: maintenant.date,
      heure: maintenant.heure,
      timezone: "Europe/Paris",
    });
  } catch (erreur) {
    erreurSecurisee("auto_statut_echec", erreur);
    return json({
      succes: false,
      message: "Traitement automatique indisponible.",
    }, 500);
  }
});
