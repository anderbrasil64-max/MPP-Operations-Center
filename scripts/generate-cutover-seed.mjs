import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function generateCutoverSeed() {
  return `begin;

update public.joueurs
set code_acces_hash = app_private.credential_hash(
      encode(extensions.gen_random_bytes(32), 'hex') || ':' || id::text
    ),
    auth_version = auth_version + 1,
    credential_modifie_a = now(),
    derniere_modification = now()
where lower(btrim(coalesce(statut, ''))) = 'actif'
  and code_acces_hash is null;

update public.joueurs
set mot_de_passe_hash = app_private.credential_hash(
      encode(extensions.gen_random_bytes(32), 'hex') || ':' || id::text
    ),
    auth_version = auth_version + 1,
    credential_modifie_a = now(),
    derniere_modification = now()
where lower(btrim(coalesce(statut, ''))) = 'actif'
  and mot_de_passe_hash is null
  and (
    app_private.role_present(roles, 'Officier')
    or app_private.role_present(roles, 'SuperAdmin')
  );

do $cutover_seed_check$
begin
  if exists (
    select 1 from public.joueurs
    where lower(btrim(coalesce(statut, ''))) = 'actif'
      and code_acces_hash is null
  ) then
    raise exception 'Synthetic access hash generation failed.';
  end if;
  if exists (
    select 1 from public.joueurs
    where lower(btrim(coalesce(statut, ''))) = 'actif'
      and mot_de_passe_hash is null
      and (
        app_private.role_present(roles, 'Officier')
        or app_private.role_present(roles, 'SuperAdmin')
      )
  ) then
    raise exception 'Synthetic administrative hash generation failed.';
  end if;
end;
$cutover_seed_check$;

commit;
`;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) process.stdout.write(generateCutoverSeed());

export const generatorPath = fileURLToPath(import.meta.url);
