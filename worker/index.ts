// Cloudflare Worker: API de síntese de voz + arquivos estáticos do frontend.
import { parseMarkup } from "../shared/markup";
import type { EnginesInfo, Persona, SpeakRequest } from "../shared/types";
import { pcmToWav } from "./audio";
import { analisarComIA, provedorAnalise } from "./engines/analise";
import { listElevenVoices, synthesizeEleven } from "./engines/elevenlabs";
import { synthesizeGemini } from "./engines/gemini";
import { synthesizeOpenAI } from "./engines/openai";
import { UpstreamError, type Env } from "./env";

const MAX_TEXT = 20000;
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 dias

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

const fail = (message: string, status = 400) => json({ error: message }, status);

function checkAccess(req: Request, env: Env): Response | null {
  if (!env.ACCESS_CODE) return null;
  return req.headers.get("x-access-code") === env.ACCESS_CODE ? null : fail("Código de acesso inválido.", 401);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function engineKey(env: Env, engine: SpeakRequest["engine"]): string | undefined {
  return { openai: env.OPENAI_API_KEY, elevenlabs: env.ELEVENLABS_API_KEY, gemini: env.GEMINI_API_KEY }[engine];
}

function engineModel(env: Env, engine: SpeakRequest["engine"]): string {
  return { openai: env.OPENAI_TTS_MODEL, elevenlabs: env.ELEVENLABS_MODEL, gemini: env.GEMINI_TTS_MODEL }[engine];
}

function validate(body: any): SpeakRequest | string {
  if (!body || typeof body !== "object") return "Corpo da requisição inválido.";
  if (!["openai", "elevenlabs", "gemini"].includes(body.engine)) return "Motor de voz inválido.";
  if (typeof body.text !== "string" || !body.text.trim()) return "Digite algum texto.";
  if (body.text.length > MAX_TEXT) return `Texto muito longo (máximo ${MAX_TEXT.toLocaleString("pt-BR")} caracteres).`;
  const p = body.persona as Persona;
  if (!p || typeof p !== "object" || typeof p.voz !== "string") return "Persona inválida.";
  return body as SpeakRequest;
}

async function handleSpeak(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const parsed = validate(await req.json().catch(() => null));
  if (typeof parsed === "string") return fail(parsed);
  const { engine, text, persona } = parsed;
  if (!engineKey(env, engine)) return fail(`O motor "${engine}" não está configurado no servidor (falta a chave da API).`, 503);

  const segments = parseMarkup(text);
  if (!segments.length) return fail("O texto só tem marcações, sem nada para ler.");

  // Cache: o mesmo texto com a mesma persona e o mesmo modelo não é pago duas vezes
  const { id: _id, nome: _nome, ...personaSemNome } = persona;
  const hash = await sha256(JSON.stringify({ engine, model: engineModel(env, engine), text, p: personaSemNome }));
  const cacheKey = new Request(`https://cache.leitor-voz.internal/${hash}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const h = new Headers(hit.headers);
    h.set("x-cache", "HIT");
    return new Response(hit.body, { headers: h });
  }

  const pcm =
    engine === "openai"
      ? await synthesizeOpenAI(env, persona, segments)
      : engine === "elevenlabs"
        ? await synthesizeEleven(env, persona, segments)
        : await synthesizeGemini(env, persona, segments);

  const wav = pcmToWav(pcm);
  const res = new Response(wav, {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
      "x-cache": "MISS",
      "x-segments": String(segments.length),
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handleAnalyze(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return fail("Digite algum texto para analisar.");
  if (text.length > MAX_TEXT) return fail(`Texto muito longo (máximo ${MAX_TEXT.toLocaleString("pt-BR")} caracteres).`);
  const provedor = provedorAnalise(env);
  if (!provedor) return fail("Nenhuma IA configurada para análise (falta a chave da OpenAI ou do Gemini).", 503);

  const cache = (caches as unknown as { default: Cache }).default;
  const modelo = provedor === "openai" ? env.OPENAI_ANALISE_MODEL : env.GEMINI_ANALISE_MODEL;
  const cacheKey = new Request(`https://cache.leitor-voz.internal/analise/${await sha256(`${provedor}:${modelo}:${text}`)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: hit.headers });

  const res = json(await analisarComIA(env, text));
  res.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handleApi(req: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  if (path === "/api/engines" && req.method === "GET") {
    const info: EnginesInfo = {
      openai: !!env.OPENAI_API_KEY,
      elevenlabs: !!env.ELEVENLABS_API_KEY,
      gemini: !!env.GEMINI_API_KEY,
      analise: provedorAnalise(env),
      accessCodeRequired: !!env.ACCESS_CODE,
      models: { openai: env.OPENAI_TTS_MODEL, elevenlabs: env.ELEVENLABS_MODEL, gemini: env.GEMINI_TTS_MODEL },
    };
    return json(info);
  }

  const denied = checkAccess(req, env);
  if (denied) return denied;

  if (path === "/api/voices" && req.method === "GET") {
    const engine = new URL(req.url).searchParams.get("engine");
    if (engine !== "elevenlabs") return fail("Só a ElevenLabs tem listagem dinâmica de vozes.");
    if (!env.ELEVENLABS_API_KEY) return fail("ElevenLabs não configurada.", 503);
    return json(await listElevenVoices(env));
  }

  if (path === "/api/speak" && req.method === "POST") return handleSpeak(req, env, ctx);

  if (path === "/api/analyze" && req.method === "POST") return handleAnalyze(req, env, ctx);

  return fail("Rota não encontrada.", 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await handleApi(req, env, ctx, path);
    } catch (err) {
      if (err instanceof UpstreamError) {
        const status = err.status === 401 || err.status === 403 ? 502 : err.status === 429 ? 429 : 502;
        return fail(err.message, status);
      }
      return fail(err instanceof Error ? err.message : "Erro inesperado.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
