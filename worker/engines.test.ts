import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMarkup } from "../shared/markup";
import { PERSONAS_PADRAO } from "../shared/persona";
import type { Persona } from "../shared/types";
import { pcmToWav, stripWavHeader } from "./audio";
import { buildElevenChunks } from "./engines/elevenlabs";
import { extractGeminiAudio } from "./engines/gemini";
import worker from "./index";
import type { Env } from "./env";

const persona: Persona = { ...PERSONAS_PADRAO[0], voz: "voz-teste" };
const env: Env = {
  ASSETS: { fetch: async () => new Response("index") } as unknown as Fetcher,
  OPENAI_API_KEY: "sk-test",
  ELEVENLABS_API_KEY: "el-test",
  GEMINI_API_KEY: "gm-test",
  OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
  ELEVENLABS_MODEL: "eleven_v4",
  GEMINI_TTS_MODEL: "gemini-3.8-flash-tts",
  OPENAI_ANALISE_MODEL: "gpt-5.4-mini",
  GEMINI_ANALISE_MODEL: "gemini-3.8-flash",
};
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const TEXT = "[animado] Bem-vindos! [risada] Cinco, seis, sete, oito. [sussurrando] Segredo. [normal] Fim.";

let calls: { url: string; init: RequestInit }[] = [];
const ORIGINAL = "Boa noite, turma! Cinco, seis, sete, oito!";
const RESPOSTA_IA = {
  tipo_texto: "Aula de dança", resumo: "Aula animada.", sexo: null, idade: "adulto", entonacao: "professor",
  ritmo: 4, intensidade: "alta", personalidade: "motivador", motivos: ["Contagem musical."],
  texto_marcado: "[animado] Boa noite, turma! [contagem] Cinco, seis, sete, oito!",
};
const analisar = (e: Env = env) =>
  worker.fetch(new Request("https://app/api/analyze", { method: "POST", body: JSON.stringify({ text: ORIGINAL }) }), e, ctx);
const pcm = (n: number) => new Uint8Array(n).fill(1);

beforeEach(() => {
  calls = [];
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res),
    },
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/responses")) {
      return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(RESPOSTA_IA) }] }] });
    }
    if (url.includes("generativelanguage") && !String(init.body).includes("tts")) {
      return Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: "```json\n" + JSON.stringify(RESPOSTA_IA) + "\n```" }] }] });
    }
    if (url.includes("generativelanguage")) {
      const wav = pcmToWav([pcm(480)]);
      const b64 = btoa(String.fromCharCode(...wav));
      return Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: b64 }] }] });
    }
    return new Response(pcm(480));
  });
});
afterEach(() => vi.unstubAllGlobals());

const speak = (engine: string, p = persona) =>
  worker.fetch(
    new Request("https://app/api/speak", { method: "POST", body: JSON.stringify({ engine, text: TEXT, persona: p }) }),
    env,
    ctx,
  );

describe("rotas", () => {
  it("OpenAI: um pedido por trecho, instruções com personalidade e estilo, PCM", async () => {
    const res = await speak("openai");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(calls).toHaveLength(3);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ model: "gpt-4o-mini-tts", voice: "voz-teste", response_format: "pcm" });
    expect(body.instructions).toContain("voz masculina, adulta");
    expect(body.instructions).toContain("didática");
    expect(body.instructions).toMatch(/ritmo ágil/i);
    expect(body.instructions).toContain("empolgação");
    expect(body.input).not.toContain("[");
  });

  it("ElevenLabs: texto único com tags em inglês e PCM 24 kHz", async () => {
    const res = await speak("elevenlabs");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/text-to-speech/voz-teste?output_format=pcm_24000");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model_id).toBe("eleven_v4");
    expect(body.text).toBe("[excited] Bem-vindos! [laughs] Cinco, seis, sete, oito. [whispers] Segredo. [confident][clear][warm] Fim.");
    expect(body.voice_settings.stability).toBe(0.5);
  });

  it("Gemini: partes com speech_metadata, áudio WAV/PCM desembrulhado", async () => {
    const res = await speak("gemini");
    expect(res.status).toBe(200);
    const body = JSON.parse(calls[0].init.body as string);
    const parts = body.input[0].content;
    expect(parts).toHaveLength(3);
    expect(parts[0].text).toContain("<laugh>");
    expect(parts[0].annotations[0].type).toBe("speech_metadata");
    expect(body.response_format.mime_type).toBe("audio/l16");
    const wav = new Uint8Array(await res.arrayBuffer());
    expect(wav.length).toBe(44 + 480); // cabeçalho do Gemini removido, só PCM
  });

  it("cache: segunda chamada idêntica não chama o motor", async () => {
    await speak("openai");
    const n = calls.length;
    const res = await speak("openai");
    expect(res.headers.get("x-cache")).toBe("HIT");
    expect(calls.length).toBe(n);
  });

  it("código de acesso bloqueia sem header", async () => {
    const res = await worker.fetch(
      new Request("https://app/api/speak", { method: "POST", body: "{}" }),
      { ...env, ACCESS_CODE: "1234" },
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("motor sem chave devolve 503 com mensagem clara", async () => {
    const res = await worker.fetch(
      new Request("https://app/api/speak", { method: "POST", body: JSON.stringify({ engine: "gemini", text: "oi", persona }) }),
      { ...env, GEMINI_API_KEY: undefined },
      ctx,
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("chave");
  });

  it("erro do provedor vira mensagem legível", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "Invalid API key" } }, { status: 401 }));
    const res = await speak("openai", { ...persona, personalidade: "outra" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Invalid API key");
  });
});

describe("análise por IA", () => {
  it("OpenAI (Responses API) com JSON validado", async () => {
    const res = await analisar();
    const a = await res.json();
    expect(a.fonte).toBe("openai");
    expect(a.sugestao).toMatchObject({ entonacao: "professor", ritmo: 4, energia: "alta", sexo: null, idade: "adulto" });
    expect(a.textoMarcado).toBe(RESPOSTA_IA.texto_marcado);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ model: "gpt-5.4-mini", text: { format: { type: "json_object" } } });
    expect(body.input).toContain(ORIGINAL);
  });

  it("Gemini quando é o único com chave (JSON dentro de bloco de código)", async () => {
    const res = await analisar({ ...env, OPENAI_API_KEY: undefined });
    const a = await res.json();
    expect(a.fonte).toBe("gemini");
    expect(a.textoMarcado).toBe(RESPOSTA_IA.texto_marcado);
    expect(JSON.parse(calls[0].init.body as string).model).toBe("gemini-3.8-flash");
  });

  it("sem chave de IA devolve 503 e /api/engines informa analise=null", async () => {
    const semIA = { ...env, OPENAI_API_KEY: undefined, GEMINI_API_KEY: undefined };
    expect((await analisar(semIA)).status).toBe(503);
    const info = await (await worker.fetch(new Request("https://app/api/engines"), semIA, ctx)).json();
    expect(info.analise).toBeNull();
  });
});

describe("falhas de rede", () => {
  it("falha de conexão vira mensagem legível", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const res = await speak("gemini", { ...persona, personalidade: "rede" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(
      "Gemini: não foi possível conectar ao serviço. Verifique a conexão do servidor e tente de novo.",
    );
  });
});

describe("utilidades", () => {
  it("blocos da ElevenLabs repetem a tag quando o trecho é cortado", () => {
    const longo = "[sussurrando] " + "Frase curta aqui. ".repeat(20);
    const chunks = buildElevenChunks(parseMarkup(longo), "", 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.startsWith("[whispers]") && c.length <= 80)).toBe(true);
  });

  it("extractGeminiAudio aceita formato antigo", () => {
    expect(extractGeminiAudio({ candidates: [{ content: { parts: [{ inlineData: { data: "QUJD" } }] } }] })).toBe("QUJD");
  });

  it("WAV: cabeçalho correto e strip devolve o PCM", () => {
    const wav = pcmToWav([pcm(100), pcm(51)]);
    const v = new DataView(wav.buffer);
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint32(40, true)).toBe(150); // byte ímpar descartado
    expect(stripWavHeader(wav).length).toBe(150);
  });
});
