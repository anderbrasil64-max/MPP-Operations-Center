import {
  clientService,
  creerDeadlineGlobale,
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
    if (!secretCronValide(req, "CRON_SECRET_MAINTENANCE_SECURITE")) {
      return json({ succes: false }, 401);
    }
    const { data, error } = await clientService(deadlineMs).rpc(
      "nettoyer_donnees_securite_site",
    );
    if (error || !data?.succes) throw new Error("MAINTENANCE_SECURITE");
    logSecurise("maintenance_securite_terminee", {
      fonction: "maintenance-securite",
      statut: "termine",
    });
    return json(data);
  } catch (erreur) {
    erreurSecurisee("maintenance_securite_echec", erreur);
    return json({
      succes: false,
      message: "Maintenance temporairement indisponible.",
    }, 500);
  }
});
