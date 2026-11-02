// Análise narrativa por IA (OpenAI ou Gemini), com validação e reserva na análise local.
import { analisarLocal, extrairJson, MAX_ANALISE_IA, promptAnalise, sanitizarAnalise, stripTags } from "../../shared/analise";
import type { Analise } from "../../shared/types";
import { callProvider, type Env } from "../env";

export function provedorAnalise(env: Env): "openai" | "gemini" | null {
  const pref = env.ANALISE_PROVEDOR?.toLowerCase();
  if (pref === "gemini" && env.GEMINI_API_KEY) return "gemini";
  if (pref === "openai" && env.OPENAI_API_KEY) return "openai";
  if (env.OPENAI_API_KEY) return "openai";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

async function perguntarOpenAI(env: Env, sistema: string, usuario: string): Promise<string> {
  const res = await callProvider("OpenAI", "https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_ANALISE_MODEL,
      instructions: sistema,
      input: usuario,
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
    }),
  });
  const data: any = await res.json();
  if (typeof data?.output_text === "string") return data.output_text;
  const partes: string[] = [];
  for (const item of data?.output ?? []) for (const c of item?.content ?? []) if (c?.type === "output_text") partes.push(c.text);
  if (!partes.length) throw new Error("A OpenAI não devolveu texto na análise.");
  return partes.join("");
}

async function perguntarGemini(env: Env, sistema: string, usuario: string): Promise<string> {
  const res = await callProvider("Gemini", "https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.GEMINI_ANALISE_MODEL, input: `${sistema}\n\n${usuario}` }),
  });
  return textoGemini(await res.json());
}

/** Lê o texto da resposta do Gemini (formato Interactions; aceita também o formato antigo). */
export function textoGemini(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  const partes: string[] = [];
  for (const step of data?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const c of step.content ?? []) if (c?.type === "text" && c.text) partes.push(c.text);
  }
  if (!partes.length) {
    for (const p of data?.candidates?.[0]?.content?.parts ?? []) if (p?.text) partes.push(p.text);
  }
  if (!partes.length) throw new Error("O Gemini não devolveu texto na análise.");
  return partes.join("");
}

export async function analisarComIA(env: Env, textoBruto: string): Promise<Analise> {
  const provedor = provedorAnalise(env);
  if (!provedor) return analisarLocal(textoBruto);

  const texto = stripTags(textoBruto);
  const longo = texto.length > MAX_ANALISE_IA;
  const trecho = longo ? texto.slice(0, MAX_ANALISE_IA) : texto;
  const { sistema, usuario } = promptAnalise(trecho, !longo);
  const resposta = provedor === "openai" ? await perguntarOpenAI(env, sistema, usuario) : await perguntarGemini(env, sistema, usuario);
  const analise = sanitizarAnalise(extrairJson(resposta), texto, provedor);

  if (longo) {
    // Texto grande: a IA define o perfil pelo início; as marcações vêm da análise rápida.
    analise.textoMarcado = analisarLocal(texto).textoMarcado;
    analise.avisos.push(
      `O texto passa de ${MAX_ANALISE_IA.toLocaleString("pt-BR")} caracteres: a IA analisou o início para sugerir a voz, e as marcações vieram da análise rápida.`,
    );
  }
  return analise;
}
