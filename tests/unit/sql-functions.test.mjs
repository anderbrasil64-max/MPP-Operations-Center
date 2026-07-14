import assert from "node:assert/strict";
import test from "node:test";
import {
  hasQualifiedSpecialExpression,
  parseFunctionDefinitions,
  parseFunctionRevokes,
  validateSecurityDefiners
} from "../../scripts/lib/sql-functions.mjs";

const overloadedSql = `
create or replace function public.exemple(p_valeur text)
returns void language plpgsql security definer set search_path = ''
as $$ begin null; end; $$;

create or replace function public.exemple(
  p_valeur bigint,
  p_options jsonb default jsonb_build_object('a', 1, 'b', 2)
)
returns void language plpgsql security definer set search_path = ''
as $$ begin null; end; $$;

revoke all on function public.exemple(text) from public;
`;

test("les signatures SQL distinguent les surcharges et les valeurs par defaut", () => {
  assert.deepEqual(
    parseFunctionDefinitions(overloadedSql).map((definition) => definition.signature),
    ["public.exemple(text)", "public.exemple(bigint,jsonb)"]
  );
  assert.deepEqual(parseFunctionRevokes(overloadedSql), [
    { signature: "public.exemple(text)", roles: ["public"] }
  ]);
});

test("chaque SECURITY DEFINER exige son propre REVOKE PUBLIC", () => {
  const validation = validateSecurityDefiners("fixture.sql", overloadedSql);
  assert.equal(validation.count, 2);
  assert.deepEqual(validation.errors, [
    "fixture.sql: public.exemple(bigint,jsonb): REVOKE PUBLIC exact manquant"
  ]);
});

test("les constructions SQL speciales ne peuvent pas etre qualifiees par pg_catalog", () => {
  for (const source of [
    "pg_catalog.coalesce(p_action, ''::text)",
    "PG_CATALOG . NULLIF (valeur, ''::text)",
    "pg_catalog\n.\ngreatest (a, b)",
    "pg_catalog . least(a, b)"
  ]) {
    assert.equal(hasQualifiedSpecialExpression(source), true, source);
  }

  for (const source of [
    "coalesce(p_action, ''::text)",
    "pg_catalog.lower(p_action)",
    "pg_catalog.btrim(p_action)",
    "pg_catalog.jsonb_build_object('ok', true)",
    "pg_catalog.hashtextextended(p_action, 0)"
  ]) {
    assert.equal(hasQualifiedSpecialExpression(source), false, source);
  }
});
