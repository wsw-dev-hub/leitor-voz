import { ENERGIAS, ENTONACOES, IDADES, RITMOS, SEXOS } from "./perfil";
import type { Estabilidade, Persona, Ritmo } from "./types";

export const ESTABILIDADE_VALOR: Record<Estabilidade, number> = { criativo: 0, natural: 0.5, estavel: 1 };

/** Instrução de voz usada por OpenAI e Gemini. */
export function personaInstruction(p: Persona, estiloTrecho?: string | null): string {
  const extra = p.personalidade.trim().replace(/\.$/, "");
  const linhas = [
    `Fale com ${SEXOS[p.sexo].instrucao}, ${IDADES[p.idade].instrucao}.`,
    `Entonação ${ENTONACOES[p.entonacao].instrucao}.`,
    extra && `Personalidade: ${extra}.`,
    `${cap(RITMOS[p.ritmo].instrucao)}; ${ENERGIAS[p.energia].instrucao}.`,
    `Idioma e sotaque: ${p.sotaque.trim().replace(/\.$/, "") || "português do Brasil, sotaque neutro"}.`,
    estiloTrecho && `Neste trecho, fale ${estiloTrecho}.`,
    "Leia exatamente o texto fornecido, sem acrescentar nem omitir palavras.",
  ];
  return linhas.filter(Boolean).join(" ");
}

/** Tags da ElevenLabs para trechos sem marcação: entonação + tags extras da persona. */
export function elevenBaseTags(p: Persona): string {
  return `${ENTONACOES[p.entonacao].eleven}${p.tagsBase.trim()}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const BASE: Omit<Persona, "id" | "nome"> = {
  motor: "browser",
  sexo: "feminino",
  idade: "adulto",
  entonacao: "conversa",
  ritmo: 3,
  energia: "media",
  vozAuto: true,
  voz: "",
  personalidade: "",
  sotaque: "português do Brasil, sotaque neutro",
  estabilidade: "natural",
  tagsBase: "",
};

export function novaPersona(dados: Partial<Persona> = {}): Persona {
  return { ...BASE, id: newId(), nome: "Nova persona", ...dados };
}

/** Atualiza personas salvas em versões anteriores do app (ritmo em texto, campos novos). */
export function migrarPersona(raw: any): Persona {
  const ritmoAntigo: Record<string, Ritmo> = { lento: 2, normal: 3, rapido: 4 };
  const ritmo =
    typeof raw?.ritmo === "number" && raw.ritmo >= 1 && raw.ritmo <= 5
      ? (Math.round(raw.ritmo) as Ritmo)
      : ritmoAntigo[raw?.ritmo] ?? 3;
  const p = { ...BASE, ...raw, ritmo } as Persona;
  if (!(p.sexo in SEXOS)) p.sexo = BASE.sexo;
  if (!(p.idade in IDADES)) p.idade = BASE.idade;
  if (!(p.entonacao in ENTONACOES)) p.entonacao = BASE.entonacao;
  if (!(p.energia in ENERGIAS)) p.energia = BASE.energia;
  if (typeof p.vozAuto !== "boolean") p.vozAuto = !p.voz;
  p.id ||= newId();
  p.nome ||= "Persona";
  return p;
}

export const PERSONAS_PADRAO: Persona[] = [
  {
    ...BASE,
    id: "professor-danca",
    nome: "Professor de dança",
    sexo: "masculino",
    entonacao: "professor",
    ritmo: 4,
    energia: "alta",
    personalidade: "carismático e motivador, conduz a turma com segurança e marca bem as contagens",
    tagsBase: "[warm]",
  },
  {
    ...BASE,
    id: "contadora-historias",
    nome: "Contadora de histórias",
    sexo: "feminino",
    idade: "maduro",
    entonacao: "narrador",
    ritmo: 2,
    energia: "media",
    personalidade: "afetuosa, dá vida aos personagens e faz suspense nas horas certas",
  },
  {
    ...BASE,
    id: "locutor-radio",
    nome: "Locutor de rádio",
    sexo: "masculino",
    entonacao: "locutor",
    ritmo: 4,
    energia: "alta",
    estabilidade: "criativo",
    personalidade: "voz grave e sorridente, fala direto com o ouvinte",
  },
];
