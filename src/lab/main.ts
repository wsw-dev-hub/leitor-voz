import { aplicarPredefinicao, PADRAO, PREDEFINICOES, TEXTOS_EXEMPLO, type Ajustes } from "./ajustes";
import { wav, type Metricas } from "./audio";
import { DOADORES, VOZES, vozPorId } from "./catalogo";
import { limparCache } from "./download";
import type { Pedido, Resposta } from "./motor.worker";
import MotorWorker from "./motor.worker?worker";

type Lado = "a" | "b";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const CHAVE = "lab-voz:v1";

// ------------------------------------------------------------------ estado
interface Resultado {
  url: string;
  metricas: Metricas;
  tempoMs: number;
  trechos: { texto: string; estilo: string; fonemas: string; vel: number; ganhoDb: number; detalhe: string }[];
  voz: string;
}
const salvo = ler();
const estado: { a: Ajustes; b: Ajustes; texto: string; resultado: Partial<Record<Lado, Resultado>> } = {
  a: { ...PADRAO, ...salvo?.a },
  b: { ...PADRAO, voz: "kokoro-alex", expressividade: 0.4, doador: "am_puck", ...salvo?.b },
  texto: salvo?.texto ?? TEXTOS_EXEMPLO[0].texto,
  resultado: {},
};

function ler(): { a?: Partial<Ajustes>; b?: Partial<Ajustes>; texto?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "null");
  } catch {
    return null;
  }
}
function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ a: estado.a, b: estado.b, texto: estado.texto }));
  } catch {
    /* sem armazenamento: segue em memória */
  }
}

// ------------------------------------------------------------------ worker
const worker: Worker = new MotorWorker();
const esperando = new Map<string, Lado>();
worker.onmessage = (ev: MessageEvent<Resposta>) => {
  const r = ev.data;
  if (r.tipo === "info") {
    $("estado").textContent = r.isolado
      ? `Motor local pronto, ${r.threads} ${r.threads === 1 ? "thread" : "threads"}`
      : "Motor local pronto, 1 thread (sem isolamento do navegador)";
    $("estado").dataset.ok = "1";
    return;
  }
  const lado = esperando.get(r.id);
  if (!lado) return;
  if (r.tipo === "etapa") return mostrarEtapa(lado, r.texto, r.fracao);
  esperando.delete(r.id);
  ocupado(lado, false);
  if (r.tipo === "erro") return mostrarEtapa(lado, r.mensagem, undefined, true);
  const antigo = estado.resultado[lado];
  if (antigo) URL.revokeObjectURL(antigo.url);
  const url = URL.createObjectURL(wav(r.audio, r.sampleRate));
  estado.resultado[lado] = { url, metricas: r.metricas, tempoMs: r.tempoMs, trechos: r.trechos as Resultado["trechos"], voz: vozPorId(estado[lado].voz).nome };
  const seg = r.metricas.duracaoS;
  mostrarEtapa(lado, `Pronto: ${seg.toFixed(1)} s de fala gerados em ${(r.tempoMs / 1000).toFixed(1)} s${r.carregarMs > 1500 ? `, mais ${(r.carregarMs / 1000).toFixed(0)} s para carregar a voz` : ""}.`);
  mostrarResultado(lado);
  void ($(`player-${lado}`) as HTMLAudioElement).play().catch(() => {});
};
worker.postMessage({ tipo: "info" } satisfies Pedido);

let contador = 0;
function gerar(lado: Lado) {
  if (!estado.texto.trim()) return mostrarEtapa(lado, "Digite um texto para gerar a fala.", undefined, true);
  const id = `${lado}-${++contador}`;
  esperando.set(id, lado);
  ocupado(lado, true);
  mostrarEtapa(lado, "Na fila…");
  worker.postMessage({ tipo: "gerar", id, texto: estado.texto, ajustes: { ...estado[lado] } } satisfies Pedido);
}

// ------------------------------------------------------------------ cartões das tomadas
interface Controle {
  campo: keyof Ajustes;
  rotulo: string;
  min: number;
  max: number;
  passo: number;
  grupo: "todas" | "kokoro" | "piper";
  formato: (v: number) => string;
  dica: string;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const CONTROLES: Controle[] = [
  { campo: "velocidade", rotulo: "Velocidade", min: 0.6, max: 1.4, passo: 0.01, grupo: "todas", formato: pct, dica: "100% é a velocidade original da voz." },
  { campo: "pausas", rotulo: "Pausas entre frases", min: 0.4, max: 2.5, passo: 0.05, grupo: "todas", formato: pct, dica: "Alonga ou encurta os silêncios depois de ponto, pergunta e exclamação." },
  { campo: "contraste", rotulo: "Contraste de volume", min: 0, max: 2, passo: 0.05, grupo: "todas", formato: pct, dica: "Quanto as emoções marcadas mudam o volume. 0% deixa tudo igual." },
  { campo: "bpm", rotulo: "Andamento da contagem", min: 60, max: 180, passo: 1, grupo: "todas", formato: (v) => `${v} BPM`, dica: "Usado nos trechos marcados com [contagem]." },
  { campo: "tom", rotulo: "Tom", min: 0.6, max: 1.8, passo: 0.02, grupo: "kokoro", formato: (v) => (v === 1 ? "original" : v < 1 ? `mais leve (${v.toFixed(2)})` : `mais grave (${v.toFixed(2)})`), dica: "Abaixo de 1 deixa a voz mais leve e jovem; acima, mais grave e madura." },
  { campo: "expressividade", rotulo: "Expressividade", min: 0, max: 0.7, passo: 0.01, grupo: "kokoro", formato: pct, dica: "Quanto da entonação vem da voz doadora escolhida abaixo. O timbre não muda." },
  { campo: "variacaoEntonacao", rotulo: "Variação de entonação", min: 0.2, max: 1.2, passo: 0.01, grupo: "piper", formato: (v) => v.toFixed(2), dica: "Valores maiores deixam a melodia da fala mais solta; menores, mais regular. Original: 0,67." },
  { campo: "variacaoRitmo", rotulo: "Variação de ritmo", min: 0.2, max: 1.4, passo: 0.01, grupo: "piper", formato: (v) => v.toFixed(2), dica: "Quanto a duração das sílabas varia. Original: 0,80." },
];

function montarTomada(lado: Lado) {
  const el = $(`tomada-${lado}`);
  const L = lado.toUpperCase();
  const outro = lado === "a" ? "B" : "A";
  const opcoesVoz = (motor: string, titulo: string) =>
    `<optgroup label="${titulo}">${VOZES.filter((v) => v.motor === motor).map((v) => `<option value="${v.id}">${v.nome}</option>`).join("")}</optgroup>`;
  el.innerHTML = `
    <div class="tomada-cab">
      <h2><span class="selo">${L}</span> Tomada ${L}</h2>
      <select class="predef" aria-label="Predefinição da tomada ${L}">
        <option value="">Aplicar predefinição…</option>
        ${PREDEFINICOES.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("")}
      </select>
    </div>
    <label class="campo">
      <span>Voz</span>
      <select class="voz">${opcoesVoz("piper", "Piper (português do Brasil)")}${opcoesVoz("kokoro", "Kokoro")}</select>
      <small class="voz-detalhe"></small>
    </label>
    <div class="controles">
      ${CONTROLES.map(
        (c) => `
        <div class="controle" data-grupo="${c.grupo}">
          <div class="controle-cab">
            <label for="${lado}-${c.campo}">${c.rotulo}</label>
            <output id="${lado}-${c.campo}-v"></output>
          </div>
          <input type="range" id="${lado}-${c.campo}" data-campo="${c.campo}" min="${c.min}" max="${c.max}" step="${c.passo}" />
          <small>${c.dica}</small>
        </div>`,
      ).join("")}
      <label class="campo" data-grupo="kokoro">
        <span>Voz doadora de entonação</span>
        <select class="doador">${DOADORES.map((d) => `<option value="${d.id}">${d.nome}</option>`).join("")}</select>
      </label>
    </div>
    <div class="acoes">
      <button type="button" class="btn-prim gerar">Gerar ${L}</button>
      <button type="button" class="btn-sec restaurar">Restaurar</button>
      <button type="button" class="btn-sec copiar">Copiar para ${outro}</button>
    </div>
    <div class="progresso" hidden><div class="barra"><i></i></div><p class="etapa" role="status" aria-live="polite"></p></div>
    <div class="resultado" hidden>
      <audio id="player-${lado}" controls></audio>
      <dl class="metricas"></dl>
      <div class="acoes-res">
        <a class="baixar" download>Baixar WAV</a>
        <button type="button" class="btn-link exportar">Copiar ajustes (JSON)</button>
      </div>
    </div>`;

  el.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((inp) =>
    inp.addEventListener("input", () => {
      (estado[lado] as unknown as Record<string, number>)[inp.dataset.campo!] = Number(inp.value);
      atualizarValores(lado);
      salvar();
    }),
  );
  sel(lado, "voz").addEventListener("change", (e) => {
    estado[lado].voz = (e.target as HTMLSelectElement).value;
    preencher(lado);
    salvar();
  });
  sel(lado, "doador").addEventListener("change", (e) => {
    estado[lado].doador = (e.target as HTMLSelectElement).value;
    salvar();
  });
  sel(lado, "predef").addEventListener("change", (e) => {
    const s = e.target as HTMLSelectElement;
    if (!s.value) return;
    estado[lado] = aplicarPredefinicao(estado[lado], s.value);
    s.value = "";
    preencher(lado);
    salvar();
  });
  el.querySelector(".gerar")!.addEventListener("click", () => gerar(lado));
  el.querySelector(".restaurar")!.addEventListener("click", () => {
    estado[lado] = { ...PADRAO, voz: estado[lado].voz };
    preencher(lado);
    salvar();
  });
  el.querySelector(".copiar")!.addEventListener("click", () => {
    const destino: Lado = lado === "a" ? "b" : "a";
    estado[destino] = { ...estado[lado] };
    preencher(destino);
    salvar();
  });
  el.querySelector(".exportar")!.addEventListener("click", async (e) => {
    const b = e.target as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(JSON.stringify(estado[lado], null, 2));
      b.textContent = "Ajustes copiados";
    } catch {
      b.textContent = "Não foi possível copiar";
    }
    setTimeout(() => (b.textContent = "Copiar ajustes (JSON)"), 2500);
  });
}

const sel = (lado: Lado, cls: string) => $(`tomada-${lado}`).querySelector<HTMLSelectElement>(`select.${cls}`)!;

function preencher(lado: Lado) {
  const a = estado[lado];
  const voz = vozPorId(a.voz);
  sel(lado, "voz").value = voz.id;
  sel(lado, "doador").value = a.doador;
  const el = $(`tomada-${lado}`);
  el.dataset.motor = voz.motor;
  el.querySelector(".voz-detalhe")!.textContent = `${voz.detalhe} Download de ${voz.tamanhoMb} MB na primeira vez.`;
  for (const c of CONTROLES) ($(`${lado}-${c.campo}`) as HTMLInputElement).value = String(a[c.campo]);
  atualizarValores(lado);
}

function atualizarValores(lado: Lado) {
  for (const c of CONTROLES) $(`${lado}-${c.campo}-v`).textContent = c.formato(estado[lado][c.campo] as number);
}

function ocupado(lado: Lado, sim: boolean) {
  const el = $(`tomada-${lado}`);
  const b = el.querySelector<HTMLButtonElement>(".gerar")!;
  b.disabled = sim;
  b.textContent = sim ? "Gerando…" : `Gerar ${lado.toUpperCase()}`;
  el.querySelector<HTMLElement>(".progresso")!.hidden = false;
}

function mostrarEtapa(lado: Lado, texto: string, fracao?: number, erro = false) {
  const el = $(`tomada-${lado}`);
  const p = el.querySelector<HTMLElement>(".progresso")!;
  p.hidden = false;
  p.dataset.erro = erro ? "1" : "";
  p.querySelector(".etapa")!.textContent = texto;
  const barra = p.querySelector<HTMLElement>(".barra")!;
  barra.hidden = fracao === undefined;
  if (fracao !== undefined) barra.querySelector<HTMLElement>("i")!.style.width = `${Math.round(Math.min(1, fracao) * 100)}%`;
}

const fmt = {
  s: (v: number) => `${v.toFixed(1)} s`,
  hz: (v: number) => (v ? `${Math.round(v)} Hz` : "—"),
  st: (v: number) => `${v.toFixed(1)} st`,
  ms: (v: number) => `${Math.round(v)} ms`,
};

function mostrarResultado(lado: Lado) {
  const r = estado.resultado[lado]!;
  const el = $(`tomada-${lado}`);
  el.querySelector<HTMLElement>(".resultado")!.hidden = false;
  ($(`player-${lado}`) as HTMLAudioElement).src = r.url;
  const baixar = el.querySelector<HTMLAnchorElement>(".baixar")!;
  baixar.href = r.url;
  baixar.download = `tomada-${lado}-${r.voz.toLowerCase()}.wav`;
  const m = r.metricas;
  el.querySelector(".metricas")!.innerHTML = [
    ["Duração", fmt.s(m.duracaoS)],
    ["Tom médio", fmt.hz(m.tomMedioHz)],
    ["Variação do tom", fmt.st(m.variacaoTomSt)],
    ["Pausas", `${m.pausas}, média de ${fmt.ms(m.pausaMediaMs)}`],
    ["Faixa de volume", `${(m.volumeMaxDb - m.volumeMinDb).toFixed(1)} dB`],
    ["Tempo para gerar", fmt.s(r.tempoMs / 1000)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  const ol = $(`trechos-${lado}`);
  ol.innerHTML = "";
  for (const t of r.trechos) {
    const li = document.createElement("li");
    li.innerHTML = `<p class="t-texto"></p><p class="t-meta"></p><p class="t-fon"></p>`;
    li.querySelector(".t-texto")!.textContent = t.texto;
    li.querySelector(".t-meta")!.textContent = `${t.estilo}, velocidade ${pct(t.vel)}, volume ${t.ganhoDb >= 0 ? "+" : ""}${t.ganhoDb.toFixed(1)} dB, ${t.detalhe}`;
    li.querySelector(".t-fon")!.textContent = t.fonemas;
    ol.append(li);
  }
  atualizarComparacao();
}

function atualizarComparacao() {
  const { a, b } = estado.resultado;
  $("comparacao").hidden = !(a && b);
  if (!a || !b) return;
  const linhas: [string, number, number, (v: number) => string][] = [
    ["Duração", a.metricas.duracaoS, b.metricas.duracaoS, fmt.s],
    ["Tom médio", a.metricas.tomMedioHz, b.metricas.tomMedioHz, fmt.hz],
    ["Variação do tom", a.metricas.variacaoTomSt, b.metricas.variacaoTomSt, fmt.st],
    ["Pausa média", a.metricas.pausaMediaMs, b.metricas.pausaMediaMs, fmt.ms],
    ["Faixa de volume", a.metricas.volumeMaxDb - a.metricas.volumeMinDb, b.metricas.volumeMaxDb - b.metricas.volumeMinDb, (v) => `${v.toFixed(1)} dB`],
    ["Tempo para gerar", a.tempoMs / 1000, b.tempoMs / 1000, fmt.s],
  ];
  $("comp-corpo").innerHTML =
    `<tr><th scope="row">Voz</th><td>${a.voz}</td><td>${b.voz}</td><td></td></tr>` +
    linhas
      .map(([k, va, vb, f]) => {
        const dif = va ? ((vb - va) / Math.abs(va)) * 100 : 0;
        return `<tr><th scope="row">${k}</th><td>${f(va)}</td><td>${f(vb)}</td><td>${va ? `${dif >= 0 ? "+" : ""}${dif.toFixed(0)}%` : "—"}</td></tr>`;
      })
      .join("");
}

// ------------------------------------------------------------------ texto e início
const ta = $<HTMLTextAreaElement>("texto");
const exemplo = $<HTMLSelectElement>("exemplo");
exemplo.innerHTML = `<option value="">Escolher…</option>${TEXTOS_EXEMPLO.map((t) => `<option value="${t.id}">${t.nome}</option>`).join("")}`;
exemplo.addEventListener("change", () => {
  const t = TEXTOS_EXEMPLO.find((x) => x.id === exemplo.value);
  if (t) {
    ta.value = estado.texto = t.texto;
    salvar();
  }
  exemplo.value = "";
});
ta.value = estado.texto;
ta.addEventListener("input", () => {
  estado.texto = ta.value;
  salvar();
});
const usar = $<HTMLInputElement>("usar-marcacoes");
usar.checked = estado.a.usarMarcacoes;
usar.addEventListener("change", () => {
  estado.a.usarMarcacoes = estado.b.usarMarcacoes = usar.checked;
  salvar();
});
$("gerar-ambas").addEventListener("click", () => {
  gerar("a");
  gerar("b");
});
$("limpar").addEventListener("click", async () => {
  await limparCache();
  $("limpar").textContent = "Vozes apagadas. Serão baixadas de novo no próximo uso.";
});

montarTomada("a");
montarTomada("b");
preencher("a");
preencher("b");
