// Vocabulário do perfil de voz: o que cada opção significa para cada motor.
import type { Energia, Entonacao, Idade, Ritmo, Sexo } from "./types";

interface Ajuste {
  rate?: number;
  pitch?: number;
}

export const SEXOS: Record<Sexo, { label: string; simbolo: string; instrucao: string; pitch: number }> = {
  feminino: { label: "Feminina", simbolo: "♀", instrucao: "voz feminina", pitch: 1.08 },
  masculino: { label: "Masculina", simbolo: "♂", instrucao: "voz masculina", pitch: 0.92 },
  neutro: { label: "Neutra", simbolo: "○", instrucao: "voz de timbre neutro", pitch: 1 },
};

export const IDADES: Record<Idade, { label: [string, string]; faixa: string; instrucao: string; ajuste: Ajuste }> = {
  crianca: { label: ["Criança", "Criança"], faixa: "até 12", instrucao: "de criança, por volta de 9 anos, aguda e espontânea", ajuste: { pitch: 1.3, rate: 1.05 } },
  jovem: { label: ["Jovem", "Jovem"], faixa: "13 a 25", instrucao: "jovem, entre 18 e 25 anos, leve e descontraída", ajuste: { pitch: 1.08, rate: 1.03 } },
  adulto: { label: ["Adulta", "Adulto"], faixa: "26 a 45", instrucao: "adulta, entre 30 e 45 anos", ajuste: {} },
  maduro: { label: ["Madura", "Maduro"], faixa: "46 a 65", instrucao: "madura, entre 50 e 60 anos, timbre mais encorpado e seguro", ajuste: { pitch: 0.93 } },
  idoso: { label: ["Idosa", "Idoso"], faixa: "65 ou mais", instrucao: "idosa, acima de 70 anos, timbre envelhecido e fala pausada", ajuste: { pitch: 0.86, rate: 0.9 } },
};

export interface EntonacaoDef {
  label: string;
  descricao: string;
  instrucao: string;
  /** Tags da ElevenLabs que expressam esta entonação. */
  eleven: string;
  /** Estilo de trecho que já está contido nesta entonação (a análise não repete). */
  estiloEquivalente: string | null;
  cor: string;
  ajuste: Ajuste;
}

export const ENTONACOES: Record<Entonacao, EntonacaoDef> = {
  conversa: {
    label: "Conversa", descricao: "Natural, como quem fala com um amigo",
    instrucao: "conversacional e natural, como quem fala com um amigo", eleven: "[casual]",
    estiloEquivalente: null, cor: "#0b7285", ajuste: {},
  },
  narrador: {
    label: "Narração", descricao: "Envolvente, conta uma história",
    instrucao: "de contador de histórias, envolvente, criando imagens com a voz", eleven: "[storytelling]",
    estiloEquivalente: null, cor: "#5f3dc4", ajuste: { rate: 0.96 },
  },
  professor: {
    label: "Didática", descricao: "Clara e firme, destaca o essencial",
    instrucao: "didática, clara e firme, enfatizando as palavras-chave como um bom professor", eleven: "[confident][clear]",
    estiloEquivalente: null, cor: "#364fc7", ajuste: {},
  },
  locutor: {
    label: "Locução", descricao: "Projetada, de rádio ou comercial",
    instrucao: "de locutor profissional, voz projetada, sorridente e cheia de presença", eleven: "[excited][confident]",
    estiloEquivalente: "animado", cor: "#d9480f", ajuste: { rate: 1.05, pitch: 1.05 },
  },
  acolhedor: {
    label: "Acolhedora", descricao: "Suave, calma e empática",
    instrucao: "acolhedora, suave e empática, transmitindo calma", eleven: "[calm][warm]",
    estiloEquivalente: "calmo", cor: "#2b8a3e", ajuste: { rate: 0.92, pitch: 0.97 },
  },
  dramatico: {
    label: "Dramática", descricao: "Teatral, com contrastes fortes",
    instrucao: "dramática e teatral, com contrastes fortes de intensidade e pausas expressivas", eleven: "[dramatic]",
    estiloEquivalente: null, cor: "#a61e4d", ajuste: { rate: 0.95 },
  },
  jornalistico: {
    label: "Jornalística", descricao: "Neutra, objetiva e segura",
    instrucao: "jornalística, neutra, objetiva e segura, como âncora de telejornal", eleven: "[serious]",
    estiloEquivalente: "serio", cor: "#495057", ajuste: {},
  },
  infantil: {
    label: "Lúdica", descricao: "Brincalhona, para crianças",
    instrucao: "lúdica e brincalhona, muito expressiva, como quem conta histórias para crianças", eleven: "[playful]",
    estiloEquivalente: null, cor: "#c2255c", ajuste: { pitch: 1.1 },
  },
};

export const RITMOS: Record<Ritmo, { label: string; velocidade: number; instrucao: string }> = {
  1: { label: "Bem lento", velocidade: 0.8, instrucao: "ritmo bem lento, com pausas longas entre as frases" },
  2: { label: "Lento", velocidade: 0.9, instrucao: "ritmo calmo, com pausas generosas" },
  3: { label: "Natural", velocidade: 1, instrucao: "ritmo natural de fala" },
  4: { label: "Ágil", velocidade: 1.1, instrucao: "ritmo ágil e dinâmico, sem atropelar as palavras" },
  5: { label: "Rápido", velocidade: 1.2, instrucao: "ritmo rápido e enérgico, mantendo a clareza" },
};

export const ENERGIAS: Record<Energia, { label: string; instrucao: string; pitch: number }> = {
  baixa: { label: "Contida", instrucao: "intensidade baixa, voz contida", pitch: 0.95 },
  media: { label: "Moderada", instrucao: "intensidade moderada e expressiva", pitch: 1 },
  alta: { label: "Vibrante", instrucao: "intensidade alta, entusiasmada e vibrante", pitch: 1.08 },
};

const i = (sexo: Sexo) => (sexo === "feminino" ? 0 : 1);

export function idadeLabel(idade: Idade, sexo: Sexo): string {
  return IDADES[idade].label[i(sexo)];
}

/** "Mulher adulta", "Menino", "Senhor idoso"... */
export function sujeito(sexo: Sexo, idade: Idade): string {
  const tabela: Record<Idade, [string, string, string]> = {
    crianca: ["Menina", "Menino", "Criança"],
    jovem: ["Moça jovem", "Rapaz jovem", "Pessoa jovem"],
    adulto: ["Mulher adulta", "Homem adulto", "Pessoa adulta"],
    maduro: ["Mulher madura", "Homem maduro", "Pessoa madura"],
    idoso: ["Senhora idosa", "Senhor idoso", "Pessoa idosa"],
  };
  const col = sexo === "feminino" ? 0 : sexo === "masculino" ? 1 : 2;
  return tabela[idade][col];
}

/** Frase-resumo do perfil: "Mulher adulta, narração envolvente, ritmo natural." */
export function resumoPerfil(p: { sexo: Sexo; idade: Idade; entonacao: Entonacao; ritmo: Ritmo }): string {
  return `${sujeito(p.sexo, p.idade)}, ${ENTONACOES[p.entonacao].label.toLowerCase()}, ritmo ${RITMOS[p.ritmo].label.toLowerCase()}.`;
}
