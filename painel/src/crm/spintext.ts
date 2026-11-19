/**
 * SpinText Processing Engine
 *
 * Parses SpinText templates like:
 *   "{Atenção|Olá} {{customer_name}} seu login {irá vencer|expira} em {{customer_duedate_sh}}."
 *
 * Processing order:
 *   1. Replace {{variables}} first
 *   2. Resolve {a|b|c} spin groups (with nesting support)
 *
 * - Picks one random option from each {a|b|c} block
 * - Preserves {{dynamic_tags}} during spin resolution (step 1 replaces them)
 * - Validates: balanced braces, 2+ options per group
 * - Returns clean, humanized text ready for WhatsApp
 */

export interface SpinTextValidationResult {
  valid: boolean;
  errors: string[];
}

/** Replace {{variable}} tags with their values before resolving spin groups. */
export function replaceVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return variables[key] ?? match;
  });
}

/** Extract unique {{variable}} names from a template. */
export function extractVariables(text: string): string[] {
  const re = /\{\{(\w+)\}\}/g;
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

/**
 * Resolve spin groups from the inside out. Handles nesting like:
 *   {Olá|{Oi|E aí}} {{name}} {tudo bem|como vai}
 *
 * Repeatedly resolves the innermost brace groups (those with no nested braces)
 * until no more brace groups remain. Double-brace {{variables}} are preserved
 * if replaceVariables hasn't been called yet — the regex skips content starting
 * with "{" to avoid matching the inner part of {{...}}.
 */
const VAR_RE = /\{\{\w+\}\}/g;

/** Troca cada {{variavel}} por um marcador sem chaves (e devolve como voltar), para os grupos {a|b} nao a confundirem. */
function maskVariables(text: string): { masked: string; restore: (s: string) => string } {
  const vars: string[] = [];
  const masked = text.replace(VAR_RE, (m) => {
    vars.push(m);
    return `\u0001${vars.length - 1}\u0001`;
  });
  const restore = (s: string) => s.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => vars[Number(i)] ?? "");
  return { masked, restore };
}

export function parseSpinText(text: string): string {
  const { masked, restore } = maskVariables(text);
  let result = masked;
  let safety = 0;
  const MAX_ITERATIONS = 50;

  // Resolve innermost groups first (supports nesting)
  const innerRe = /\{([^{}]+)\}/g;
  while (safety < MAX_ITERATIONS) {
    let changed = false;
    result = result.replace(innerRe, (match, content: string) => {
      // Skip {{variable}} tags — they start with "{" after the outer "{" is captured
      if (content.startsWith("{")) return match;
      const options = content.split("|").map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) return match;
      changed = true;
      return options[Math.floor(Math.random() * options.length)];
    });
    if (!changed) break;
    safety++;
  }

  // Final pass: clean up any single-option or empty groups that remain
  result = result.replace(/\{([^{}]+)\}/g, (match, content: string) => {
    if (content.startsWith("{")) return match;
    const options = content.split("|").map((o) => o.trim()).filter(Boolean);
    if (options.length === 1) return options[0];
    if (options.length === 0) return "";
    return match;
  });

  return restore(result);
}

/**
 * Full template processing: replace variables first, then resolve spin groups.
 */
export function processTemplate(
  template: string,
  variables: Record<string, string> = {},
): string {
  const withVars = replaceVariables(template, variables);
  return parseSpinText(withVars);
}

/**
 * Validate a SpinText template:
 * - Braces must be balanced (every { has a matching })
 * - Each spin group {a|b|c} must have 2+ non-empty options
 * - {{variable}} tags are not counted as spin groups
 *
 * Returns a list of human-readable errors (empty = valid).
 */
export function validateSpinText(text: string): SpinTextValidationResult {
  const errors: string[] = [];
  // variaveis {{x}} nao sao grupos: tira antes de conferir
  text = text.replace(VAR_RE, "");

  // 1. Check brace balance
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      if (depth > 0) {
        depth--;
      } else {
        errors.push("Há uma chave } sem abertura correspondente.");
      }
    }
  }
  if (depth > 0) {
    errors.push(`Há ${depth} chave(s) { sem fechamento correspondente.`);
  }

  // 2. Check each spin group has 2+ options
  // Use a regex that matches {content} where content has no braces
  const groupRe = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  let groupIdx = 0;
  while ((m = groupRe.exec(text)) !== null) {
    const content = m[1];
    groupIdx++;
    const options = content.split("|").map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      errors.push(
        `Grupo ${groupIdx} ("${m[0].slice(0, 30)}${m[0].length > 30 ? "..." : ""}") precisa de pelo menos 2 opções separadas por |.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
