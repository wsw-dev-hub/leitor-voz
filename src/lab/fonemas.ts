// Texto em português → fonemas IPA (espeak-ng compilado para WebAssembly, pacote "ephone", GPL-3.0).
import createEphone, { roa, type ephoneModule } from "ephone";

let ephone: ephoneModule | null = null;

export async function iniciarFonemas(): Promise<void> {
  if (ephone) return;
  ephone = await createEphone(roa);
  const pt = ephone.getVoices().find((v) => v.name.toLowerCase() === "pt-br");
  ephone.setVoice(pt?.name ?? "pt-BR");
}

/** IPA com acentuação e pontuação. O ephone troca ";" e ":" por "," e ".": fonemizamos por partes. */
export function ipa(texto: string): string {
  if (!ephone) throw new Error("Fonemas não iniciados.");
  const partes = texto.split(/([;:])/);
  let f = "";
  for (let i = 0; i < partes.length; i += 2) {
    let p = ephone.textToIpa(partes[i]).trim();
    if (partes[i + 1]) p = p.replace(/[,.]$/, "") + partes[i + 1];
    f += (f ? " " : "") + p;
  }
  return f.replace(/\s+/g, " ").trim();
}

// Fusões usadas no treino do Kokoro (misaki): ditongos e africadas viram um só símbolo.
const E2M: [string, string][] = [
  ["aɪ", "I"], ["aʊ", "W"], ["dz", "ʣ"], ["dʒ", "ʤ"], ["eɪ", "A"], ["oʊ", "O"],
  ["əʊ", "Q"], ["ts", "ʦ"], ["tʃ", "ʧ"], ["ɔɪ", "Y"],
];

export function fonemasKokoro(texto: string): string {
  let f = ipa(texto);
  for (const [a, b] of E2M) f = f.replaceAll(a, b);
  return f.replaceAll("-", "");
}

export function idsKokoro(fonemas: string, vocab: Record<string, number>): number[] {
  return [...fonemas].map((c) => vocab[c]).filter((x): x is number => x !== undefined).slice(0, 510);
}

/** IDs no formato da Piper: ^ _ f1 _ f2 _ … $ (um ID por caractere Unicode, com "pad" entre eles). */
export function idsPiper(fonemas: string, mapa: Record<string, number[]>): { ids: number[]; ignorados: string } {
  const pad = mapa["_"]?.[0] ?? 0;
  const ids: number[] = [...(mapa["^"] ?? [1]), pad];
  let ignorados = "";
  for (const c of [...fonemas.normalize("NFD")]) {
    const id = mapa[c];
    if (!id) {
      if (!ignorados.includes(c)) ignorados += c;
      continue;
    }
    ids.push(...id, pad);
  }
  ids.push(...(mapa["$"] ?? [2]));
  return { ids, ignorados };
}
