// Análise narrativa do texto: sugere perfil de voz e marcações de interpretação.
//
// - analisarLocal(): regras simples, roda no navegador, sem custo e sem chave.
// - promptAnalise() + sanitizarAnalise(): usados pelo Worker para pedir a análise a uma IA
//   e validar a resposta (inclusive conferindo que nenhuma palavra do texto foi alterada).
import { ENERGIAS, ENTONACOES, IDADES, SEXOS } from "./perfil";
import { EVENTS, STYLES } from "./markup";
import type { Analise, Energia, Entonacao, Idade, Ritmo, Sexo } from "./types";

export const MAX_ANALISE_IA = 8000;

const TAG_RE = /\[[^\[\]\n]{1,60}\]/g;

/** Remove as marcações, mantendo quebras de linha. */
export function stripTags(text: string): string {
  return text.replace(TAG_RE, "").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
}

const norm = (t: string) => stripTags(t).replace(/\s+/g, " ").trim();

/** true se o texto marcado tem exatamente as mesmas palavras do original. */
export function mesmoTexto(original: string, marcado: string): boolean {
  return norm(original) === norm(marcado);
}

// ---------------------------------------------------------------------------
// Análise local (heurística)
// ---------------------------------------------------------------------------

/** Palavra inteira com acentos (\b do JS não entende acentos). */
const w = (src: string, flags = "iu") => new RegExp(`(?<![\\p{L}])(?:${src})(?![\\p{L}])`, flags);
const count = (re: RegExp, t: string) => (t.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;

const NUM = "um|dois|tr[eê]s|quatro|cinco|seis|sete|oito";

const ESTILO_FRASE: [estilo: string, teste: (f: string) => boolean][] = [
  ["contagem", (f) => count(w(NUM), f) >= 3 || /\b[1-8]\s*[,e]\s*[1-8]\s*[,e]\s*[1-8]/.test(f)],
  ["gritando", (f) => /!\s*["”’)]*\s*$/.test(f) && (/(?<![\p{L}])\p{Lu}{4,}(?![\p{L}])/u.test(f) || w("socorro").test(f))],
  ["sussurrando", (f) => w("segredo|baixinho|sussurr\\p{L}*|shh+|psiu|cochich\\p{L}*|ningu[eé]m pode saber").test(f)],
  ["triste", (f) => w("trist\\p{L}*|saudade\\p{L}*|chor\\p{L}*|l[aá]grima\\p{L}*|sozinh\\p{L}*|perdeu|perdi|morreu|morte|luto|despedi\\p{L}*").test(f)],
  ["misterioso", (f) => w("de repente|sombra\\p{L}*|escurid[aã]o|escuro|sil[eê]ncio|mist[eé]ri\\p{L}*|estranh\\p{L}*|ningu[eé]m sabia|arrepi\\p{L}*").test(f)],
  ["calmo", (f) => w("respir\\p{L}*|relax\\p{L}*|calma|devagar|tranquil\\p{L}*|suave\\p{L}*|inspir\\p{L}*|expir\\p{L}*|seren[oa]").test(f)],
  ["serio", (f) => w("aten[cç][aã]o|importante|cuidado|nunca|proibid\\p{L}*|obrigat[oó]ri\\p{L}*|regras?|aviso").test(f)],
  ["curioso", (f) => /\?\s*["”’)]*\s*$/.test(f) || w("ser[aá] que|como ser[aá]|imagine").test(f)],
  ["animado", (f) => /!\s*["”’)]*\s*$/.test(f) || w("incr[ií]vel|maravilh\\p{L}*|parab[eé]ns|vamos l[aá]|uhu+|eba|alegria|feliz|demais|[oó]timo|sensacional").test(f)],
];

const EVENTO_RE: [evento: string, re: RegExp][] = [
  ["risada", w("(?:ha){2,}|(?:he){2,}|kk+|(?:rs){2,}|(?:hi){2,}", "giu")],
  ["suspiro", w("ai,? ai|aff+|suspir\\p{L}*", "giu")],
];

interface Tipo {
  id: string;
  nome: string;
  entonacao: Entonacao;
  ritmo: Ritmo;
  energia: Energia;
  personalidade: string;
  pontos: (t: string, linhas: string[], frases: string[]) => number;
}

const TIPOS: Tipo[] = [
  {
    id: "aula", nome: "Aula ou instrução", entonacao: "professor", ritmo: 4, energia: "alta",
    personalidade: "professor motivador, firme e próximo da turma",
    pontos: (t) => count(w("turma|aula|passos?|coreografia|ensaio|alongamento|postura|bra[cç]os?|quadril|ombros?|joelhos?|exerc[ií]cio\\p{L}*|repitam|repita|vamos"), t) + 3 * count(w(`(?:${NUM})(?:[ ,]+(?:${NUM})){2,}`), t),
  },
  {
    id: "relax", nome: "Relaxamento ou meditação guiada", entonacao: "acolhedor", ritmo: 1, energia: "baixa",
    personalidade: "guia sereno e acolhedor, que transmite segurança",
    pontos: (t) => 1.5 * count(w("respir\\p{L}*|relax\\p{L}*|inspir\\p{L}*|expir\\p{L}*|solte|soltem|sinta|sintam|calma|tranquil\\p{L}*|medita\\p{L}*"), t),
  },
  {
    id: "infantil", nome: "História infantil", entonacao: "infantil", ritmo: 3, energia: "alta",
    personalidade: "contador de histórias brincalhão, que dá uma voz para cada personagem",
    pontos: (t) => 3 * count(w("era uma vez"), t) + 1.5 * count(w("princes\\p{L}*|pr[ií]ncipe|drag[aã]o|fada\\p{L}*|castelo|bruxa|lobo|reino|coelh\\p{L}*|duende|unic[oó]rnio|floresta encantada"), t),
  },
  {
    id: "noticia", nome: "Notícia ou texto informativo", entonacao: "jornalistico", ritmo: 3, energia: "media",
    personalidade: "apresentador objetivo e confiável",
    pontos: (t) => count(w("segundo|de acordo com|informou|afirmou|anunciou|divulgou|governo|prefeitura|pesquisa|levantamento|minist[eé]rio"), t) + count(/R\$\s?\d|\d+(?:,\d+)?\s?%/g, t),
  },
  {
    id: "anuncio", nome: "Anúncio ou texto publicitário", entonacao: "locutor", ritmo: 4, energia: "alta",
    personalidade: "locutor carismático e convincente, sorriso na voz",
    pontos: (t) => 1.5 * count(w("promo[cç][aã]o|aproveite|compre|oferta\\p{L}*|desconto\\p{L}*|gr[aá]tis|s[oó] hoje|garanta|imperd[ií]vel|frete|corra|parcel\\p{L}*"), t),
  },
  {
    id: "poema", nome: "Poema ou letra", entonacao: "dramatico", ritmo: 2, energia: "media",
    personalidade: "intérprete sensível, que respeita as pausas de cada verso",
    pontos: (_t, linhas) => {
      const versos = linhas.filter((l) => l.trim());
      if (versos.length < 4) return 0;
      const media = versos.reduce((n, l) => n + l.length, 0) / versos.length;
      const semPonto = versos.filter((l) => !/[.!?]$/.test(l.trim())).length / versos.length;
      return media < 50 && semPonto > 0.5 ? 6 : 0;
    },
  },
  {
    id: "narrativa", nome: "Narrativa", entonacao: "narrador", ritmo: 3, energia: "media",
    personalidade: "narrador envolvente, que conduz o ouvinte pela história",
    pontos: (t, _l, frases) => {
      const passado = count(w("\\p{L}{2,}(?:ou|eu|iu|ava|ia|aram|eram|iram)|era|estava|havia|foi|tinha"), t);
      const dialogo = count(/^\s*[—–-]\s|“[^”]+”|"[^"]+"/gm, t);
      return (passado / Math.max(frases.length, 1)) * 2 + dialogo;
    },
  },
];

function dividirFrases(texto: string): { inicio: number; texto: string }[] {
  const out: { inicio: number; texto: string }[] = [];
  for (const m of texto.matchAll(/[^.!?…\n]+(?:[.!?…]+["”’)]*)?/g)) {
    if (m[0].trim()) out.push({ inicio: m.index ?? 0, texto: m[0] });
  }
  return out;
}

function sexoDoNarrador(t: string): { sexo: Sexo | null; pista: string | null } {
  const ADJ = "obrigad|cansad|preocupad|animad|sozinh|pront|apaixonad|encantad|emocionad|nervos|orgulhos|grat|ansios|acostumad|assustad|cheia|cheio";
  const re = new RegExp(
    `(?<![\\p{L}])(?:(?:eu\\s+)?(?:estou|sou|fiquei|estava|me sinto|me senti|t[oô])\\s+(?:muito\\s+|t[aã]o\\s+|bem\\s+)?|muito\\s+)?((?:${ADJ})(a|o))(?![\\p{L}])`,
    "giu",
  );
  let fem = 0, masc = 0;
  let pista: string | null = null;
  for (const m of t.matchAll(re)) {
    const contexto = m[0].toLowerCase();
    const autoReferencia = /estou|sou|fiquei|estava|sinto|senti|t[oô]/.test(contexto) || /obrigad/.test(contexto);
    if (!autoReferencia) continue;
    const fim = m[2].toLowerCase();
    if (fim === "a" || m[1].toLowerCase() === "cheia") { fem++; pista ??= m[0].trim(); }
    else { masc++; pista ??= m[0].trim(); }
  }
  if (fem > masc) return { sexo: "feminino", pista };
  if (masc > fem) return { sexo: "masculino", pista };
  return { sexo: null, pista: null };
}

function idadeDoNarrador(t: string): { idade: Idade | null; pista: string | null } {
  const testes: [Idade, RegExp][] = [
    ["idoso", w("meus netos|minha netinha|meu netinho|no meu tempo|na minha juventude|quando eu era jovem|aposentad\\p{L}*")],
    ["crianca", w("minha m[aã]e deixou|meu dever de casa|quando eu crescer|no recreio|minha professora da escola|tenho (?:sete|oito|nove|dez) anos")],
    ["jovem", w("mano|v[eé]i|tipo assim|tlgd|rol[eê]|balada|faculdade|crush|top demais")],
  ];
  for (const [idade, re] of testes) {
    const m = t.match(re);
    if (m) return { idade, pista: m[0] };
  }
  return { idade: null, pista: null };
}

export function analisarLocal(textoOriginal: string): Analise {
  const texto = stripTags(textoOriginal);
  const linhas = texto.split("\n");
  const frases = dividirFrases(texto);
  const avisos: string[] = [];
  const motivos: string[] = [];

  // 1. Tipo de texto
  const pontuados = TIPOS.map((t) => ({ t, p: t.pontos(texto, linhas, frases.map((f) => f.texto)) })).sort((a, b) => b.p - a.p);
  const tipo: Tipo =
    pontuados[0].p >= 2
      ? pontuados[0].t
      : { id: "conversa", nome: "Texto conversacional", entonacao: "conversa", ritmo: 3, energia: "media", personalidade: "", pontos: () => 0 };
  if (tipo.id !== "conversa") motivos.push(`O vocabulário e a estrutura indicam ${tipo.nome.toLowerCase()}, então a entonação ${ENTONACOES[tipo.entonacao].label.toLowerCase()} combina melhor.`);

  // 2. Ritmo e intensidade
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  const mediaPalavras = palavras / Math.max(frases.length, 1);
  const exclamacoes = frases.filter((f) => /!/.test(f.texto)).length / Math.max(frases.length, 1);
  let ritmo = tipo.ritmo as number;
  if (mediaPalavras > 24) { ritmo -= 1; motivos.push("As frases são longas: um ritmo mais lento ajuda o ouvinte a acompanhar."); }
  else if (mediaPalavras < 8 && exclamacoes > 0.3 && ritmo < 5) { ritmo += 1; motivos.push("Frases curtas e exclamativas pedem um ritmo mais ágil."); }
  ritmo = Math.min(5, Math.max(1, ritmo));
  let energia: Energia = tipo.energia;
  if (exclamacoes > 0.35 && energia !== "alta" && tipo.id !== "relax") { energia = "alta"; motivos.push("Muitas exclamações: a leitura pede mais energia."); }
  else if (exclamacoes === 0 && energia === "alta" && tipo.id !== "aula") energia = "media";

  // 3. Quem narra (só com pistas no próprio texto; sem pista, mantém a escolha atual)
  const { sexo, pista: pistaSexo } = sexoDoNarrador(texto);
  if (sexo && pistaSexo) motivos.push(`Quem narra fala de si no ${sexo === "feminino" ? "feminino" : "masculino"} (“${pistaSexo}”).`);
  const { idade, pista: pistaIdade } = idadeDoNarrador(texto);
  if (idade && pistaIdade) motivos.push(`A expressão “${pistaIdade}” sugere uma voz ${IDADES[idade].label[sexo === "feminino" ? 0 : 1].toLowerCase()}.`);
  if (!sexo && !idade) avisos.push("O texto não dá pistas de quem narra, então o sexo e a idade atuais foram mantidos.");

  // 4. Marcações por frase
  const equivalente = ENTONACOES[tipo.entonacao].estiloEquivalente;
  const inserts: { pos: number; tag: string }[] = [];
  let atual: string | null = null;
  let marcadas = 0;
  for (const f of frases) {
    let estilo = ESTILO_FRASE.find(([, teste]) => teste(f.texto))?.[0] ?? null;
    if (estilo === equivalente) estilo = null;
    const lead = f.texto.match(/^\s*/)![0].length;
    if (estilo !== atual) {
      inserts.push({ pos: f.inicio + lead, tag: estilo ? `[${estilo}] ` : "[normal] " });
      if (estilo) marcadas++;
      atual = estilo;
    }
    for (const [evento, re] of EVENTO_RE) {
      for (const m of f.texto.matchAll(re)) inserts.push({ pos: f.inicio + (m.index ?? 0), tag: `[${evento}] ` });
    }
  }
  // Remove um [normal] inicial (não muda nada) e aplica de trás para frente
  // (na mesma posição, o que foi gerado depois entra primeiro, para o estilo ficar antes do evento)
  const validos = inserts.map((x, i) => ({ ...x, i })).filter((x) => !(x.i === 0 && x.tag === "[normal] "));
  let marcado = texto;
  for (const { pos, tag } of validos.sort((a, b) => b.pos - a.pos || b.i - a.i)) marcado = marcado.slice(0, pos) + tag + marcado.slice(pos);
  if (marcadas) motivos.push(`${marcadas} ${marcadas === 1 ? "trecho mudou" : "trechos mudam"} de emoção ao longo do texto e ${marcadas === 1 ? "recebeu marcação" : "receberam marcações"}.`);
  else avisos.push("Nenhuma mudança clara de emoção entre as frases; o texto foi mantido sem marcações.");

  return {
    fonte: "local",
    tipoTexto: tipo.nome,
    resumo: `${frases.length} ${frases.length === 1 ? "frase" : "frases"}, com média de ${Math.round(mediaPalavras)} palavras${exclamacoes > 0.35 ? " e muitas exclamações" : ""}.`,
    sugestao: { sexo, idade, entonacao: tipo.entonacao, ritmo: ritmo as Ritmo, energia, personalidade: tipo.personalidade },
    motivos,
    textoMarcado: mesmoTexto(texto, marcado) ? marcado : null,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Análise por IA
// ---------------------------------------------------------------------------

export function promptAnalise(texto: string, marcar: boolean): { sistema: string; usuario: string } {
  const lista = <T extends string>(r: Record<T, { label: string } | { label: [string, string] }>) =>
    Object.entries(r).map(([k, v]) => `${k} (${Array.isArray((v as any).label) ? (v as any).label[1] : (v as any).label})`).join(", ");
  const estilos = Object.entries(STYLES).map(([k, v]) => `[${k}] = ${v.instrucao}`).join("\n");
  const eventos = Object.keys(EVENTS).map((k) => `[${k}]`).join(" ");
  const sistema = `Você é diretor de locução. Analisa textos em português e define como devem ser lidos em voz alta por uma voz sintética.
Responda APENAS com um objeto JSON válido, sem comentários, com estas chaves:
{
  "tipo_texto": string curta (ex.: "Aula de dança", "História infantil", "Notícia"),
  "resumo": uma frase sobre o tom geral e o público,
  "sexo": um de [${Object.keys(SEXOS).join(", ")}] ou null,
  "idade": um de [${Object.keys(IDADES).join(", ")}] ou null,
  "entonacao": um de [${Object.keys(ENTONACOES).join(", ")}],
  "ritmo": inteiro de 1 (bem lento) a 5 (rápido), 3 = natural,
  "intensidade": um de [${Object.keys(ENERGIAS).join(", ")}],
  "personalidade": até 20 palavras descrevendo o jeito ideal de falar,
  "motivos": lista de 2 a 4 frases curtas justificando as escolhas, citando trechos do texto,
  "texto_marcado": ${marcar ? "o texto ORIGINAL com marcações inseridas" : "null"}
}

Opções de entonação: ${lista(ENTONACOES)}.
Idades: ${lista(IDADES)}.

Regras para sexo e idade: use SOMENTE pistas do próprio texto sobre QUEM NARRA (concordância como "estou cansada", "obrigado", referências a netos, escola, etc.). Não deduza pelo assunto nem por estereótipos. Sem pista clara, use null.
${marcar ? `
Regras para "texto_marcado":
- Não altere, acrescente, remova nem reordene nenhuma palavra ou pontuação. Apenas insira marcações entre colchetes.
- Marque só onde a intenção muda de forma clara; um estilo vale até a próxima marcação de estilo ou até [normal].
- Não marque o tom que já é a entonação geral escolhida.
- Estilos permitidos:
${estilos}
- Efeitos pontuais permitidos (use pouco): ${eventos}` : ""}`;
  const usuario = `Texto para analisar:\n<<<\n${texto}\n>>>`;
  return { sistema, usuario };
}

/** Extrai o primeiro objeto JSON de uma resposta de IA (com ou sem ```json). */
export function extrairJson(resposta: string): unknown {
  const ini = resposta.indexOf("{");
  const fim = resposta.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("A IA não devolveu JSON.");
  return JSON.parse(resposta.slice(ini, fim + 1));
}

const pick = <T extends string>(valor: unknown, opcoes: Record<T, unknown>): T | null =>
  typeof valor === "string" && valor in opcoes ? (valor as T) : null;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valida e normaliza a resposta da IA. Descarta marcações que alterem o texto. */
export function sanitizarAnalise(raw: any, original: string, fonte: Analise["fonte"]): Analise {
  const base = analisarLocal(original); // valores de reserva se a IA errar algum campo
  const avisos: string[] = [];
  const ritmoNum = Math.round(Number(raw?.ritmo));
  const marcado = typeof raw?.texto_marcado === "string" ? raw.texto_marcado.trim() : null;
  let textoMarcado: string | null = null;
  if (marcado) {
    if (mesmoTexto(original, marcado)) textoMarcado = marcado;
    else avisos.push("A IA alterou palavras do texto ao marcar, então essas marcações foram descartadas.");
  }
  const motivos = Array.isArray(raw?.motivos) ? raw.motivos.map((m: unknown) => txt(m, 240)).filter(Boolean).slice(0, 5) : [];
  return {
    fonte,
    tipoTexto: txt(raw?.tipo_texto, 60) || base.tipoTexto,
    resumo: txt(raw?.resumo, 240) || base.resumo,
    sugestao: {
      sexo: pick(raw?.sexo, SEXOS),
      idade: pick(raw?.idade, IDADES),
      entonacao: pick(raw?.entonacao, ENTONACOES) ?? base.sugestao.entonacao,
      ritmo: (ritmoNum >= 1 && ritmoNum <= 5 ? ritmoNum : base.sugestao.ritmo) as Ritmo,
      energia: pick(raw?.intensidade, ENERGIAS) ?? base.sugestao.energia,
      personalidade: txt(raw?.personalidade, 200),
    },
    motivos: motivos.length ? motivos : base.motivos,
    textoMarcado,
    avisos,
  };
}

