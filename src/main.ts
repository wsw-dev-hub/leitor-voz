import { analisarLocal } from "../shared/analise";
import { EVENTS, parseMarkup, plainText, STYLES } from "../shared/markup";
import { ENERGIAS, ENTONACOES, IDADES, idadeLabel, resumoPerfil, RITMOS, SEXOS } from "../shared/perfil";
import { novaPersona, personaInstruction } from "../shared/persona";
import type { Analise, EngineId, EnginesInfo, Persona, Ritmo, VoiceOption } from "../shared/types";
import { escolherVoz, GEMINI_VOICES, OPENAI_VOICES } from "../shared/voices";
import { analyze, getElevenVoices, getEngines, setAccessCode, speak } from "./api";
import { browserTtsAvailable, browserVoices, speakBrowser, stopBrowser } from "./browserTts";
import { insertTag, renderHighlight, renderStrip } from "./editor";
import * as store from "./store";
import { abrirSugestao, type Campo } from "./sugestao";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TEXTO_EXEMPLO = `[animado] Boa noite, turma! Que alegria ver vocês aqui de novo. [risada]
[calmo] Antes de começar, respirem fundo e soltem os ombros. [pausa longa]
[sério] Hoje vamos revisar a sequência do segundo bloco, com atenção à transferência de peso.
[contagem] Cinco, seis, sete, oito! [normal]
[sussurrando] E quem acertar tudo ganha uma surpresa no fim da aula.`;

const MOTORES: { id: EngineId; nome: string }[] = [
  { id: "browser", nome: "Navegador (grátis, para testes)" },
  { id: "openai", nome: "OpenAI" },
  { id: "elevenlabs", nome: "ElevenLabs" },
  { id: "gemini", nome: "Google Gemini" },
];
const nomeMotor = (id: EngineId) => (id === "browser" ? "Voz do navegador" : MOTORES.find((m) => m.id === id)!.nome);

// ---------- estado ----------
let personas = store.loadPersonas();
let ativa = personas.find((p) => p.id === store.loadActive()) ?? personas[0];
let engines: EnginesInfo | null = null;
let elevenVoices: VoiceOption[] | null = null;
let vozesAtuais: VoiceOption[] = [];
let vozesParaAuto: VoiceOption[] = [];
let falandoNoNavegador = false;
let pedidoAtual: AbortController | null = null;
const amostraAudio = new Audio();

// ---------- elementos ----------
const ta = $<HTMLTextAreaElement>("texto");
const fundo = $("fundo");
const form = $<HTMLFormElement>("form-persona");
const selPersonas = $<HTMLSelectElement>("lista-personas");
const selMotor = $<HTMLSelectElement>("motor");
const selVoz = $<HTMLSelectElement>("voz");
const vozAuto = $<HTMLInputElement>("voz-auto");
const ritmo = $<HTMLInputElement>("ritmo");
const btnGerar = $<HTMLButtonElement>("gerar");
const btnSugerir = $<HTMLButtonElement>("sugerir");
const btnAmostra = $<HTMLButtonElement>("amostra");
const player = $<HTMLAudioElement>("player");
const baixar = $<HTMLAnchorElement>("baixar");
const cartao = $("cartao");

// =====================================================================
// Editor
// =====================================================================
function atualizarEditor() {
  const segs = parseMarkup(ta.value);
  renderHighlight(fundo, ta.value);
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
  renderStrip($("faixa"), segs);
  const chars = plainText(segs).length;
  $("contador").textContent = `${chars.toLocaleString("pt-BR")} caracteres, ${segs.length} ${segs.length === 1 ? "trecho" : "trechos"}`;
  store.saveText(ta.value);
}

function montarFerramentas() {
  const estilos = $("estilos");
  for (const [key, def] of Object.entries(STYLES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip t-${key}`;
    b.textContent = def.label;
    b.title = `[${key}]: ${def.instrucao}`;
    b.addEventListener("click", () =>
      key === "contagem"
        ? insertTag(ta, key, "trecho", "[contagem] Cinco, seis, sete, oito! [normal]")
        : insertTag(ta, key, "estilo"),
    );
    estilos.append(b);
  }
  const normal = document.createElement("button");
  normal.type = "button";
  normal.className = "chip t-normal";
  normal.textContent = "Normal";
  normal.title = "[normal]: volta para a voz base da persona";
  normal.addEventListener("click", () => insertTag(ta, "normal", "evento"));
  estilos.append(normal);

  const eventos = $("eventos");
  for (const [key, def] of Object.entries(EVENTS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip t-evento";
    b.textContent = def.label;
    b.title = `[${key}]`;
    b.addEventListener("click", () => insertTag(ta, key, "evento"));
    eventos.append(b);
  }
}

ta.addEventListener("input", atualizarEditor);
window.addEventListener("resize", atualizarEditor);

// =====================================================================
// Controles visuais do perfil de voz
// =====================================================================
function radio(name: string, value: string, conteudo: string, extra = ""): HTMLLabelElement {
  const l = document.createElement("label");
  l.className = `opcao ${extra}`.trim();
  l.innerHTML = `<input type="radio" name="${name}" value="${value}" /><span class="opcao-corpo">${conteudo}</span>`;
  return l;
}

function montarOpcoes() {
  const sexo = $("op-sexo");
  for (const [k, v] of Object.entries(SEXOS)) {
    sexo.append(radio("sexo", k, `<span class="simbolo" aria-hidden="true">${v.simbolo}</span><span>${v.label}</span>`));
  }
  const ent = $("op-entonacao");
  for (const [k, v] of Object.entries(ENTONACOES)) {
    const l = radio("entonacao", k, `<strong>${v.label}</strong><small>${v.descricao}</small>`);
    l.style.setProperty("--c", v.cor);
    ent.append(l);
  }
  const en = $("op-energia");
  for (const [k, v] of Object.entries(ENERGIAS)) en.append(radio("energia", k, `<span>${v.label}</span>`));
  renderIdades();
}

/** Os rótulos de idade concordam com o sexo escolhido (Adulta/Adulto). */
function renderIdades() {
  const box = $("op-idade");
  box.innerHTML = "";
  for (const [k, v] of Object.entries(IDADES)) {
    box.append(radio("idade", k, `<span>${idadeLabel(k as Persona["idade"], ativa.sexo)}</span><small>${v.faixa}</small>`));
  }
  const r = form.querySelector<HTMLInputElement>(`input[name="idade"][value="${ativa.idade}"]`);
  if (r) r.checked = true;
}

function marcarRadio(name: string, value: string) {
  const r = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (r) r.checked = true;
}

// =====================================================================
// Motores e vozes
// =====================================================================
function motorDisponivel(id: EngineId): boolean {
  if (id === "browser") return browserTtsAvailable();
  return !!engines?.[id];
}

function renderMotores() {
  const ul = $("motores");
  ul.innerHTML = "";
  for (const m of MOTORES) {
    const li = document.createElement("li");
    const ok = motorDisponivel(m.id);
    li.className = ok ? "ok" : "off";
    li.textContent = m.id === "browser" ? "Navegador" : m.nome;
    li.title = ok ? "Pronto para usar" : m.id === "browser" ? "Este navegador não tem voz embutida" : "Falta a chave da API no servidor";
    ul.append(li);
  }
  if (engines?.analise) {
    const li = document.createElement("li");
    li.className = "ok ia";
    li.textContent = "Análise por IA";
    li.title = `Sugestões feitas por ${engines.analise === "openai" ? "OpenAI" : "Google Gemini"}`;
    ul.append(li);
  }
  $("acesso-wrap").hidden = !engines?.accessCodeRequired;

  selMotor.innerHTML = "";
  for (const m of MOTORES) {
    const o = new Option(motorDisponivel(m.id) ? m.nome : `${m.nome} (sem chave configurada)`, m.id);
    o.disabled = !motorDisponivel(m.id);
    selMotor.append(o);
  }
}

async function vozesDoMotor(motor: EngineId): Promise<{ vozes: VoiceOption[]; auto: VoiceOption[]; nota: string }> {
  if (motor === "openai") return { vozes: OPENAI_VOICES, auto: OPENAI_VOICES, nota: "A personalidade, a idade e a entonação vão como instrução para a voz." };
  if (motor === "gemini") return { vozes: GEMINI_VOICES, auto: GEMINI_VOICES, nota: "O idioma é detectado pelo texto; a persona vai como estilo de cada trecho." };
  if (motor === "browser") {
    const { todas, portugues } = await browserVoices();
    return {
      vozes: todas,
      auto: portugues.length ? portugues : todas,
      nota: todas.length
        ? "Usa as vozes instaladas no seu aparelho. Serve para testar; soa artificial e não gera arquivo."
        : "Nenhuma voz encontrada neste navegador.",
    };
  }
  if (!engines?.elevenlabs) return { vozes: [], auto: [], nota: "ElevenLabs não configurada no servidor." };
  try {
    elevenVoices ??= await getElevenVoices();
    return { vozes: elevenVoices, auto: elevenVoices, nota: "Vozes da sua conta ElevenLabs. Idade e sexo vêm da voz escolhida." };
  } catch (e) {
    return { vozes: [], auto: [], nota: `Não foi possível listar as vozes: ${(e as Error).message}` };
  }
}

async function renderVozes() {
  const motor = ativa.motor;
  selVoz.disabled = true;
  selVoz.innerHTML = `<option>Carregando vozes…</option>`;
  const { vozes, auto, nota } = await vozesDoMotor(motor);
  if (motor !== ativa.motor) return; // trocou de motor no meio
  vozesAtuais = vozes;
  vozesParaAuto = auto;
  selVoz.innerHTML = "";
  for (const v of vozes) selVoz.append(new Option(v.label, v.id));
  $("voz-nota").textContent = nota;
  aplicarVozAuto();
  if (vozes.length && !vozes.some((v) => v.id === ativa.voz)) ativa.voz = vozes[0].id;
  selVoz.value = ativa.voz;
  selVoz.disabled = !vozes.length || ativa.vozAuto;
  salvar();
  atualizarCartao();
}

function aplicarVozAuto() {
  if (!ativa.vozAuto) return;
  const v = escolherVoz(vozesParaAuto, ativa.sexo, ativa.idade);
  if (v) {
    ativa.voz = v.id;
    selVoz.value = v.id;
  }
}

// =====================================================================
// Persona
// =====================================================================
function salvar() {
  store.savePersonas(personas);
  store.saveActive(ativa.id);
}

function renderListaPersonas() {
  selPersonas.innerHTML = "";
  for (const p of personas) selPersonas.append(new Option(p.nome || "Sem nome", p.id));
  selPersonas.value = ativa.id;
  $<HTMLButtonElement>("excluir").disabled = personas.length <= 1;
}

function preencherForm() {
  const f = form.elements as unknown as Record<string, HTMLInputElement & RadioNodeList>;
  f.nome.value = ativa.nome;
  f.personalidade.value = ativa.personalidade;
  f.sotaque.value = ativa.sotaque;
  f.tagsBase.value = ativa.tagsBase;
  f.estabilidade.value = ativa.estabilidade;
  marcarRadio("sexo", ativa.sexo);
  renderIdades();
  marcarRadio("entonacao", ativa.entonacao);
  marcarRadio("energia", ativa.energia);
  ritmo.value = String(ativa.ritmo);
  vozAuto.checked = ativa.vozAuto;
  if (!motorDisponivel(ativa.motor)) ativa.motor = "browser";
  selMotor.value = ativa.motor;
  $("so-eleven").hidden = ativa.motor !== "elevenlabs";
  atualizarCartao();
  void renderVozes();
}

function atualizarCartao() {
  cartao.style.setProperty("--c", ENTONACOES[ativa.entonacao].cor);
  $("resumo").textContent = resumoPerfil(ativa);
  const voz = vozesAtuais.find((v) => v.id === ativa.voz);
  const nomeVoz = voz ? voz.label.replace(/\s*\(.*\)$/, "") : "";
  $("cartao-voz").textContent = `${nomeMotor(ativa.motor)}${nomeVoz ? `, voz ${nomeVoz}` : ""}${ativa.vozAuto ? " (automática)" : ""}`;
  $("ritmo-valor").textContent = RITMOS[ativa.ritmo].label;
  $("console-persona").innerHTML = `<span>Quem lê</span> <strong></strong>`;
  $("console-persona").querySelector("strong")!.textContent = ativa.nome;

  const previa = $("previa");
  previa.textContent =
    ativa.motor === "openai" || ativa.motor === "gemini"
      ? `Instrução enviada à voz: “${personaInstruction(ativa)}”`
      : ativa.motor === "elevenlabs"
        ? "Na ElevenLabs, sexo e idade vêm da voz escolhida; a entonação vira tags de áudio no texto."
        : "A voz do navegador só ajusta velocidade, tom e volume. Para ouvir a personalidade de verdade, use um dos outros motores.";
}

form.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.name || el.name === "voz" || el.name === "motor") return;
  const p = ativa as unknown as Record<string, unknown>;
  p[el.name] = el.name === "ritmo" ? (Number(el.value) as Ritmo) : el.value;
  if (el.name === "nome") renderListaPersonas();
  if (el.name === "sexo") renderIdades();
  if (el.name === "sexo" || el.name === "idade") aplicarVozAuto();
  salvar();
  atualizarCartao();
});
form.addEventListener("submit", (ev) => ev.preventDefault());

selMotor.addEventListener("change", () => {
  ativa.motor = selMotor.value as EngineId;
  ativa.voz = "";
  $("so-eleven").hidden = ativa.motor !== "elevenlabs";
  salvar();
  atualizarCartao();
  void renderVozes();
});
selVoz.addEventListener("change", () => {
  ativa.voz = selVoz.value;
  salvar();
  atualizarCartao();
});
vozAuto.addEventListener("change", () => {
  ativa.vozAuto = vozAuto.checked;
  selVoz.disabled = ativa.vozAuto || !vozesAtuais.length;
  aplicarVozAuto();
  salvar();
  atualizarCartao();
});
selPersonas.addEventListener("change", () => {
  ativa = personas.find((p) => p.id === selPersonas.value) ?? personas[0];
  salvar();
  preencherForm();
});

function adicionarPersona(p: Persona) {
  personas.push(p);
  ativa = p;
  salvar();
  renderListaPersonas();
  preencherForm();
}

$("nova").addEventListener("click", () => {
  adicionarPersona(novaPersona({ motor: ativa.motor }));
  const det = form.querySelector("details")!;
  det.open = true;
  (form.elements.namedItem("nome") as HTMLInputElement).select();
});
$("duplicar").addEventListener("click", () => adicionarPersona({ ...structuredClone(ativa), id: novaPersona().id, nome: `${ativa.nome} (cópia)` }));
$("excluir").addEventListener("click", () => {
  if (personas.length <= 1) return;
  const removida = ativa;
  personas = personas.filter((p) => p.id !== removida.id);
  ativa = personas[0];
  salvar();
  renderListaPersonas();
  preencherForm();
  toast(`Persona “${removida.nome}” excluída.`, () => adicionarPersona(removida));
});

// =====================================================================
// Avisos, status e animação do cartão
// =====================================================================
let toastTimer = 0;
function toast(msg: string, desfazer?: () => void) {
  const el = $("toast");
  const btn = $<HTMLButtonElement>("toast-acao");
  $("toast-msg").textContent = msg;
  btn.hidden = !desfazer;
  btn.onclick = () => {
    desfazer?.();
    el.hidden = true;
  };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 7000);
}

function setStatus(msg: string, tipo: "info" | "erro" | "ok" = "info") {
  const s = $("status");
  s.textContent = msg;
  s.dataset.tipo = tipo;
}

function tocando(on: boolean) {
  cartao.classList.toggle("tocando", on);
}
for (const a of [player, amostraAudio]) {
  a.addEventListener("play", () => tocando(true));
  a.addEventListener("pause", () => tocando(false));
  a.addEventListener("ended", () => tocando(false));
}

// =====================================================================
// Abas (celular)
// =====================================================================
document.querySelectorAll<HTMLButtonElement>(".aba").forEach((b) =>
  b.addEventListener("click", () => {
    $("grade").dataset.aba = b.dataset.aba!;
    document.querySelectorAll(".aba").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    window.scrollTo({ top: 0 });
  }),
);

// =====================================================================
// Gerar voz
// =====================================================================
function estadoBotao(ocupado: boolean, rotulo?: string) {
  btnGerar.textContent = rotulo ?? (ocupado ? "Cancelar" : "Gerar voz");
  btnGerar.classList.toggle("ocupado", ocupado);
}

function adicionarHistorico(url: string, persona: Persona, chars: number, cache: boolean) {
  $("historico-wrap").hidden = false;
  const li = document.createElement("li");
  const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  li.innerHTML = `<button type="button">Ouvir</button><span><strong></strong> ${nomeMotor(persona.motor)}, ${chars.toLocaleString("pt-BR")} caracteres, ${hora}${cache ? " (do cache, sem custo)" : ""}</span><a download="leitura-${hora.replace(":", "h")}.wav" href="${url}">Baixar</a>`;
  li.querySelector("strong")!.textContent = persona.nome;
  li.querySelector("button")!.addEventListener("click", () => {
    player.hidden = false;
    player.src = url;
    void player.play();
  });
  $("historico").prepend(li);
}

btnGerar.addEventListener("click", async () => {
  if (falandoNoNavegador) {
    stopBrowser();
    falandoNoNavegador = false;
    tocando(false);
    estadoBotao(false);
    setStatus("Leitura interrompida.");
    return;
  }
  if (pedidoAtual) {
    pedidoAtual.abort();
    return;
  }

  const segs = parseMarkup(ta.value);
  if (!segs.length) return setStatus("Digite um texto para ler.", "erro");
  if (!motorDisponivel(ativa.motor)) return setStatus("Este motor não está configurado. Escolha outro em Quem lê.", "erro");
  const chars = plainText(segs).length;

  if (ativa.motor === "browser") {
    falandoNoNavegador = true;
    tocando(true);
    estadoBotao(true, "Parar leitura");
    setStatus(`Lendo com a voz do navegador (${segs.length} ${segs.length === 1 ? "trecho" : "trechos"}).`);
    speakBrowser(ativa, segs, () => {
      falandoNoNavegador = false;
      tocando(false);
      estadoBotao(false);
      setStatus("Leitura concluída.", "ok");
    });
    return;
  }

  pedidoAtual = new AbortController();
  estadoBotao(true);
  setStatus(`Gerando a voz de ${chars.toLocaleString("pt-BR")} caracteres…`);
  const persona = structuredClone(ativa);
  try {
    const { blob, fromCache } = await speak(
      { engine: persona.motor as Exclude<EngineId, "browser">, text: ta.value, persona },
      pedidoAtual.signal,
    );
    const url = URL.createObjectURL(blob);
    player.hidden = false;
    player.src = url;
    baixar.hidden = false;
    baixar.href = url;
    baixar.download = `${persona.nome.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.wav`;
    adicionarHistorico(url, persona, chars, fromCache);
    setStatus(fromCache ? "Pronto. Este áudio veio do cache, sem novo custo." : "Pronto.", "ok");
    void player.play().catch(() => {});
  } catch (e) {
    setStatus((e as Error).name === "AbortError" ? "Geração cancelada." : (e as Error).message, (e as Error).name === "AbortError" ? "info" : "erro");
  } finally {
    pedidoAtual = null;
    estadoBotao(false);
  }
});

// ---------- amostra da voz ----------
btnAmostra.addEventListener("click", async () => {
  const texto = `Olá! Eu sou ${ativa.nome}. É assim que eu vou ler o seu texto.`;
  if (ativa.motor === "browser") {
    tocando(true);
    speakBrowser(ativa, parseMarkup(texto), () => tocando(false));
    return;
  }
  if (!motorDisponivel(ativa.motor)) return setStatus("Este motor não está configurado.", "erro");
  btnAmostra.disabled = true;
  btnAmostra.textContent = "Preparando…";
  try {
    const { blob } = await speak({ engine: ativa.motor as Exclude<EngineId, "browser">, text: texto, persona: structuredClone(ativa) });
    amostraAudio.src = URL.createObjectURL(blob);
    await amostraAudio.play();
  } catch (e) {
    setStatus((e as Error).message, "erro");
  } finally {
    btnAmostra.disabled = false;
    btnAmostra.textContent = "Ouvir amostra";
  }
});

// =====================================================================
// Sugestão por análise do texto
// =====================================================================
btnSugerir.addEventListener("click", async () => {
  if (!ta.value.trim()) return setStatus("Digite ou cole um texto para analisar.", "erro");
  btnSugerir.disabled = true;
  btnSugerir.classList.add("ocupado");
  btnSugerir.querySelector("span")!.textContent = "Analisando o texto…";
  let analise: Analise;
  try {
    if (engines?.analise) {
      try {
        analise = await analyze(ta.value);
      } catch (e) {
        analise = analisarLocal(ta.value);
        analise.avisos.unshift(`A IA não respondeu (${(e as Error).message}). Esta é a análise rápida, sem IA.`);
      }
    } else {
      analise = analisarLocal(ta.value);
    }
  } finally {
    btnSugerir.disabled = false;
    btnSugerir.classList.remove("ocupado");
    btnSugerir.querySelector("span")!.textContent = "Sugerir voz e marcações";
  }

  const escolha = await abrirSugestao(analise, ativa);
  if (escolha.acao === "cancelar") return;

  const aplicarEm = (p: Persona) => {
    for (const campo of escolha.campos) {
      const v = analise.sugestao[campo as Campo];
      if (v !== null && v !== "") (p as unknown as Record<string, unknown>)[campo] = v;
    }
  };
  if (escolha.acao === "nova") {
    const p = { ...structuredClone(ativa), id: novaPersona().id, nome: analise.tipoTexto.slice(0, 40) };
    aplicarEm(p);
    adicionarPersona(p);
  } else if (escolha.campos.size) {
    aplicarEm(ativa);
    salvar();
    preencherForm();
  }

  const partes: string[] = [];
  if (escolha.campos.size || escolha.acao === "nova") partes.push(`Voz: ${resumoPerfil(ativa)}`);
  let desfazer: (() => void) | undefined;
  if (escolha.aplicarMarcas && analise.textoMarcado) {
    const anterior = ta.value;
    ta.value = analise.textoMarcado;
    atualizarEditor();
    partes.push("Marcações aplicadas no texto.");
    desfazer = () => {
      ta.value = anterior;
      atualizarEditor();
    };
  }
  if (partes.length) toast(partes.join(" "), desfazer);
});

// =====================================================================
// Código de acesso e início
// =====================================================================
const inputAcesso = $<HTMLInputElement>("acesso");
inputAcesso.value = store.loadCode();
setAccessCode(inputAcesso.value);
inputAcesso.addEventListener("input", () => {
  setAccessCode(inputAcesso.value);
  store.saveCode(inputAcesso.value);
  elevenVoices = null;
});

async function iniciar() {
  montarFerramentas();
  montarOpcoes();
  ta.value = store.loadText() ?? TEXTO_EXEMPLO;
  atualizarEditor();
  engines = await getEngines();
  if (!engines) setStatus("Servidor fora do ar: só a voz do navegador e a análise rápida estão disponíveis.", "erro");
  renderMotores();
  renderListaPersonas();
  preencherForm();
}

void iniciar();
