// Diálogo que mostra a análise do texto e deixa escolher o que aplicar.
import { ENERGIAS, ENTONACOES, idadeLabel, RITMOS, SEXOS } from "../shared/perfil";
import type { Analise, Persona } from "../shared/types";
import { renderHighlight } from "./editor";

export type Campo = "sexo" | "idade" | "entonacao" | "ritmo" | "energia" | "personalidade";

export interface Escolha {
  acao: "aplicar" | "nova" | "cancelar";
  campos: Set<Campo>;
  aplicarMarcas: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const FONTE: Record<Analise["fonte"], string> = {
  openai: "Analisado por IA (OpenAI)",
  gemini: "Analisado por IA (Google Gemini)",
  local: "Análise rápida, feita no navegador e sem IA",
};

function valorLabel(campo: Campo, p: { sexo: Persona["sexo"] } & Partial<Persona>, v: unknown): string {
  switch (campo) {
    case "sexo": return SEXOS[v as Persona["sexo"]].label;
    case "idade": return idadeLabel(v as Persona["idade"], p.sexo);
    case "entonacao": return ENTONACOES[v as Persona["entonacao"]].label;
    case "ritmo": return RITMOS[v as Persona["ritmo"]].label;
    case "energia": return ENERGIAS[v as Persona["energia"]].label;
    default: return String(v);
  }
}

const NOMES: Record<Campo, string> = {
  sexo: "Sexo da voz", idade: "Idade", entonacao: "Entonação", ritmo: "Ritmo", energia: "Intensidade", personalidade: "Personalidade",
};

export function abrirSugestao(a: Analise, persona: Persona): Promise<Escolha> {
  const dlg = $<HTMLDialogElement>("sugestao");
  $("sug-fonte").textContent = FONTE[a.fonte];
  $("sug-fonte").dataset.fonte = a.fonte;
  $("sug-tipo").textContent = `${a.tipoTexto}.`;
  $("sug-resumo").textContent = a.resumo;

  const sexoFinal = a.sugestao.sexo ?? persona.sexo;
  const ul = $("sug-criterios");
  ul.innerHTML = "";
  (Object.keys(NOMES) as Campo[]).forEach((campo) => {
    const sugerido = a.sugestao[campo];
    const atual = persona[campo];
    const li = document.createElement("li");
    const vazio = sugerido === null || sugerido === "";
    const igual = !vazio && sugerido === atual;
    li.className = `criterio${vazio || igual ? " neutro" : ""}`;

    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.name = "campo";
    cb.value = campo;
    cb.checked = !vazio && !igual;
    cb.disabled = vazio || igual;
    const nome = document.createElement("span");
    nome.className = "c-nome";
    nome.textContent = NOMES[campo];
    const det = document.createElement("span");
    det.className = "c-det";

    if (campo === "personalidade") {
      det.textContent = vazio ? "sem sugestão" : `“${sugerido}”`;
    } else if (vazio) {
      det.textContent = `sem pista no texto, mantém ${valorLabel(campo, persona, atual)}`;
    } else if (igual) {
      det.textContent = `${valorLabel(campo, { sexo: sexoFinal }, atual)}, já está assim`;
    } else {
      det.innerHTML = `<s></s><span class="seta" aria-hidden="true">→</span><b></b>`;
      det.querySelector("s")!.textContent = valorLabel(campo, persona, atual);
      det.querySelector("b")!.textContent = valorLabel(campo, { sexo: sexoFinal }, sugerido);
    }
    label.append(cb, nome, det);
    li.append(label);
    if (campo === "entonacao" && !vazio) li.style.setProperty("--c", ENTONACOES[a.sugestao.entonacao].cor);
    ul.append(li);
  });

  const lista = (id: string, itens: string[]) => {
    const el = $(id);
    el.innerHTML = "";
    for (const t of itens) {
      const li = document.createElement("li");
      li.textContent = t;
      el.append(li);
    }
    el.hidden = !itens.length;
  };
  lista("sug-motivos", a.motivos);
  lista("sug-avisos", a.avisos);

  const marcasWrap = $("sug-marcas-wrap");
  const cbMarcas = $<HTMLInputElement>("sug-aplicar-marcas");
  marcasWrap.hidden = !a.textoMarcado;
  cbMarcas.checked = !!a.textoMarcado;
  if (a.textoMarcado) renderHighlight($("sug-previa"), a.textoMarcado, true);

  dlg.returnValue = "";
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => {
        const campos = new Set<Campo>();
        dlg.querySelectorAll<HTMLInputElement>('input[name="campo"]:checked').forEach((c) => campos.add(c.value as Campo));
        const acao = (dlg.returnValue || "cancelar") as Escolha["acao"];
        resolve({ acao, campos, aplicarMarcas: !!a.textoMarcado && cbMarcas.checked });
      },
      { once: true },
    );
  });
}
