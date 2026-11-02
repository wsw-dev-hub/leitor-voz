// Tipos compartilhados entre o frontend e o Worker.

export type EngineId = "openai" | "elevenlabs" | "gemini" | "browser";

export type Sexo = "feminino" | "masculino" | "neutro";
export type Idade = "crianca" | "jovem" | "adulto" | "maduro" | "idoso";
export type Entonacao =
  | "conversa"
  | "narrador"
  | "professor"
  | "locutor"
  | "acolhedor"
  | "dramatico"
  | "jornalistico"
  | "infantil";
/** 1 = bem lento … 3 = natural … 5 = rápido */
export type Ritmo = 1 | 2 | 3 | 4 | 5;
export type Energia = "baixa" | "media" | "alta";
/** Estabilidade da ElevenLabs: criativo = mais variação emocional, estavel = mais previsível. */
export type Estabilidade = "criativo" | "natural" | "estavel";

export interface Persona {
  id: string;
  nome: string;
  motor: EngineId;
  sexo: Sexo;
  idade: Idade;
  entonacao: Entonacao;
  ritmo: Ritmo;
  energia: Energia;
  /** true = o app escolhe a voz que combina com sexo e idade. */
  vozAuto: boolean;
  /** Nome/ID da voz no motor escolhido. */
  voz: string;
  /** Detalhes extras de personalidade, em linguagem natural (opcional). */
  personalidade: string;
  /** Idioma/sotaque, ex.: "português do Brasil, sotaque neutro". */
  sotaque: string;
  estabilidade: Estabilidade;
  /** Tags extras da ElevenLabs aplicadas nos trechos sem marcação (ex.: "[warm]"). */
  tagsBase: string;
}

/** Corpo enviado para POST /api/speak */
export interface SpeakRequest {
  engine: Exclude<EngineId, "browser">;
  text: string;
  persona: Persona;
}

export interface EnginesInfo {
  openai: boolean;
  elevenlabs: boolean;
  gemini: boolean;
  /** Qual IA faz a análise do texto (null = só a análise rápida, no navegador). */
  analise: "openai" | "gemini" | null;
  accessCodeRequired: boolean;
  models: { openai: string; elevenlabs: string; gemini: string };
}

export interface VoiceOption {
  id: string;
  label: string;
  sexo?: Sexo;
  idade?: Idade;
}

/** Sugestão produzida pela análise do texto. Campos null = manter o que está. */
export interface Analise {
  fonte: "openai" | "gemini" | "local";
  tipoTexto: string;
  resumo: string;
  sugestao: {
    sexo: Sexo | null;
    idade: Idade | null;
    entonacao: Entonacao;
    ritmo: Ritmo;
    energia: Energia;
    personalidade: string;
  };
  motivos: string[];
  /** Texto original com marcações sugeridas, ou null se não foi possível marcar com segurança. */
  textoMarcado: string | null;
  avisos: string[];
}
