function closingParenthesis(source, openIndex) {
  let depth = 0;
  let quote = "";

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error("Parenthese SQL non fermee.");
}

function splitArguments(source) {
  const argumentsList = [];
  let start = 0;
  let depth = 0;
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      argumentsList.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const last = source.slice(start).trim();
  if (last) argumentsList.push(last);
  return argumentsList;
}

function withoutDefault(argument) {
  let depth = 0;
  let quote = "";

  for (let index = 0; index < argument.length; index += 1) {
    const character = argument[index];
    const next = argument[index + 1];

    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (depth === 0 && character === "=") return argument.slice(0, index).trim();
    else if (depth === 0 && /^default\b/i.test(argument.slice(index))) return argument.slice(0, index).trim();
  }

  return argument.trim();
}

function normalizeType(type) {
  return type
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\[\s*\]/g, "[]");
}

function definitionType(argument) {
  const declaration = withoutDefault(argument).replace(/^(?:in|out|inout|variadic)\s+/i, "").trim();
  const match = declaration.match(/^(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\s+(.+)$/i);
  if (!match) throw new Error(`Parametre de fonction non reconnu: ${argument}`);
  return normalizeType(match[1]);
}

function signature(name, types) {
  return `${name.toLowerCase()}(${types.join(",")})`;
}

const qualifiedSpecialExpressionPattern = /pg_catalog\s*\.\s*(?:coalesce|nullif|greatest|least)\s*\(/i;

export function hasQualifiedSpecialExpression(source) {
  return qualifiedSpecialExpressionPattern.test(source);
}

export function parseFunctionDefinitions(sql) {
  const definitions = [];
  const pattern = /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?)\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = closingParenthesis(sql, openIndex);
    const afterArguments = sql.slice(closeIndex + 1);
    const bodyMarker = afterArguments.match(/\bas\s+\$[a-z0-9_]*\$/i);
    if (!bodyMarker || bodyMarker.index === undefined) {
      throw new Error(`Corps de fonction introuvable pour ${match[1]}.`);
    }
    const header = sql.slice(match.index, closeIndex + 1 + bodyMarker.index);
    const argumentsSource = sql.slice(openIndex + 1, closeIndex);
    const types = splitArguments(argumentsSource).map(definitionType);
    definitions.push({
      name: match[1].toLowerCase(),
      signature: signature(match[1], types),
      securityDefiner: /\bsecurity\s+definer\b/i.test(header),
      emptySearchPath: /\bset\s+search_path\s*=\s*''/i.test(header),
      legacySearchPath: /\bset\s+search_path\s+(?:=|to)\s+['"]?public['"]?\s*,\s*['"]?pg_temp['"]?/i.test(header)
    });
  }

  return definitions;
}

export function parseFunctionRevokes(sql) {
  const revokes = [];
  const pattern = /\brevoke\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+([a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?)\s*\(/gi;

  for (const match of sql.matchAll(pattern)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = closingParenthesis(sql, openIndex);
    const endIndex = sql.indexOf(";", closeIndex);
    if (endIndex === -1) throw new Error(`REVOKE non termine pour ${match[1]}.`);
    const tail = sql.slice(closeIndex + 1, endIndex);
    const rolesMatch = tail.match(/\bfrom\s+(.+)$/i);
    if (!rolesMatch) throw new Error(`Roles REVOKE absents pour ${match[1]}.`);
    const types = splitArguments(sql.slice(openIndex + 1, closeIndex)).map(normalizeType);
    const roles = rolesMatch[1].split(",").map((role) => role.trim().toLowerCase());
    revokes.push({ signature: signature(match[1], types), roles });
  }

  return revokes;
}

export function validateSecurityDefiners(file, sql, options = {}) {
  const errors = [];
  const definitions = parseFunctionDefinitions(sql).filter((definition) => definition.securityDefiner);
  const revokes = parseFunctionRevokes(sql);

  for (const definition of definitions) {
    const searchPathValid = definition.emptySearchPath
      || (options.allowLegacySearchPath === true && definition.legacySearchPath);
    if (!searchPathValid) errors.push(`${file}: ${definition.signature}: search_path controle manquant`);

    const publicRevoke = revokes.some((revoke) => (
      revoke.signature === definition.signature && revoke.roles.includes("public")
    ));
    if (!publicRevoke) errors.push(`${file}: ${definition.signature}: REVOKE PUBLIC exact manquant`);
  }

  return { count: definitions.length, errors };
}
