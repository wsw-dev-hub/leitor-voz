import type { Idade, Sexo, VoiceOption } from "./types";

// Vozes fixas dos motores que não têm endpoint de listagem simples, com o perfil
// aproximado de cada uma (usado pela escolha automática de voz).
// As vozes da ElevenLabs vêm da sua conta via /api/voices, já com sexo e idade.

type V = [id: string, sexo: Sexo, idade: Idade, tom: string];

const OPENAI: V[] = [
  ["coral", "feminino", "adulto", "calorosa"], ["nova", "feminino", "jovem", "animada"],
  ["shimmer", "feminino", "adulto", "clara"], ["sage", "feminino", "adulto", "serena"],
  ["marin", "feminino", "adulto", "natural"], ["ash", "masculino", "adulto", "firme"],
  ["ballad", "masculino", "jovem", "expressiva"], ["echo", "masculino", "adulto", "equilibrada"],
  ["verse", "masculino", "adulto", "versátil"], ["cedar", "masculino", "adulto", "natural"],
  ["onyx", "masculino", "maduro", "grave"], ["fable", "masculino", "adulto", "narrativa"],
  ["alloy", "neutro", "adulto", "neutra"],
];

const GEMINI: V[] = [
  ["Kore", "feminino", "adulto", "firme"], ["Zephyr", "feminino", "adulto", "clara"],
  ["Leda", "feminino", "jovem", "jovial"], ["Aoede", "feminino", "adulto", "leve"],
  ["Callirrhoe", "feminino", "adulto", "tranquila"], ["Autonoe", "feminino", "adulto", "clara"],
  ["Despina", "feminino", "adulto", "suave"], ["Erinome", "feminino", "adulto", "clara"],
  ["Laomedeia", "feminino", "jovem", "animada"], ["Achernar", "feminino", "adulto", "macia"],
  ["Gacrux", "feminino", "maduro", "madura"], ["Pulcherrima", "feminino", "adulto", "direta"],
  ["Vindemiatrix", "feminino", "maduro", "gentil"], ["Sulafat", "feminino", "adulto", "calorosa"],
  ["Puck", "masculino", "jovem", "animada"], ["Charon", "masculino", "adulto", "informativa"],
  ["Fenrir", "masculino", "jovem", "empolgada"], ["Orus", "masculino", "adulto", "firme"],
  ["Enceladus", "masculino", "adulto", "sussurrada"], ["Iapetus", "masculino", "adulto", "nítida"],
  ["Umbriel", "masculino", "adulto", "tranquila"], ["Algieba", "masculino", "adulto", "suave"],
  ["Algenib", "masculino", "maduro", "rouca"], ["Rasalgethi", "masculino", "adulto", "informativa"],
  ["Alnilam", "masculino", "adulto", "firme"], ["Schedar", "masculino", "adulto", "equilibrada"],
  ["Achird", "masculino", "adulto", "amigável"], ["Zubenelgenubi", "masculino", "adulto", "casual"],
  ["Sadachbia", "masculino", "jovem", "vivaz"], ["Sadaltager", "masculino", "maduro", "experiente"],
];

const SIMB: Record<Sexo, string> = { feminino: "♀", masculino: "♂", neutro: "○" };
const toOption = ([id, sexo, idade, tom]: V): VoiceOption => ({
  id,
  label: `${id[0].toUpperCase()}${id.slice(1)} ${SIMB[sexo]} ${tom}`,
  sexo,
  idade,
});

export const OPENAI_VOICES: VoiceOption[] = OPENAI.map(toOption);
export const GEMINI_VOICES: VoiceOption[] = GEMINI.map(toOption);

const ORDEM_IDADE: Idade[] = ["crianca", "jovem", "adulto", "maduro", "idoso"];

/** Escolhe a voz que melhor combina com o sexo e a idade pedidos (empate: a primeira da lista). */
export function escolherVoz(vozes: VoiceOption[], sexo: Sexo, idade: Idade): VoiceOption | undefined {
  let melhor: VoiceOption | undefined;
  let melhorPontos = -Infinity;
  for (const v of vozes) {
    let pts = 0;
    if (v.sexo === sexo) pts += 4;
    else if (!v.sexo) pts += 1;
    else if (sexo === "neutro") pts += 1;
    else if (v.sexo === "neutro") pts += 2;
    if (v.idade) {
      const d = Math.abs(ORDEM_IDADE.indexOf(v.idade) - ORDEM_IDADE.indexOf(idade));
      pts += d === 0 ? 3 : d === 1 ? 1.5 : 0;
      // Criança: TTS raramente tem vozes infantis; vozes jovens femininas são a aproximação mais comum
      if (idade === "crianca" && v.idade === "jovem" && v.sexo === "feminino") pts += 1;
    }
    if (pts > melhorPontos) {
      melhor = v;
      melhorPontos = pts;
    }
  }
  return melhor;
}

/** Mapeia os rótulos da ElevenLabs (gender/age) para o perfil do app. */
export function perfilEleven(labels: Record<string, string> | undefined): { sexo?: Sexo; idade?: Idade } {
  const g = labels?.gender?.toLowerCase() ?? "";
  const a = labels?.age?.toLowerCase().replace(/[-\s]/g, "_") ?? "";
  const sexo: Sexo | undefined = g.startsWith("f") ? "feminino" : g.startsWith("m") ? "masculino" : g ? "neutro" : undefined;
  const idade: Idade | undefined =
    a.includes("child") || a.includes("kid") ? "crianca"
    : a.includes("young") ? "jovem"
    : a.includes("middle") ? "maduro"
    : a.includes("old") || a.includes("senior") || a.includes("elder") ? "idoso"
    : a ? "adulto" : undefined;
  return { sexo, idade };
}

/** Vozes do sistema: deduz o sexo pelo nome (lista dos nomes mais comuns em PT/EN). */
const FEM = /francisca|luciana|maria|thalita|brenda|giovanna|leila|let[ií]cia|manuela|yara|elza|joana|catarina|fernanda|raquel|helena|vit[oó]ria|camila|in[eê]s|google portugu[eê]s|samantha|karen|victoria|zira|sandy|shelley|flo|grandma|amelie|monica|paulina/i;
const MASC = /daniel|felipe|antonio|ant[oó]nio|f[aá]bio|humberto|j[uú]lio|nicolau|val[eé]rio|donato|duarte|ricardo|luciano|reed|eddy|rocko|grandpa|david|mark|alex|fred|thomas|jorge|diego/i;

export function perfilPeloNome(nome: string): { sexo?: Sexo; idade?: Idade } {
  const idade: Idade | undefined = /grandpa|grandma/i.test(nome) ? "idoso" : undefined;
  if (FEM.test(nome)) return { sexo: "feminino", idade };
  if (MASC.test(nome)) return { sexo: "masculino", idade };
  return { idade };
}
