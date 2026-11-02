// Editor com destaque das marcações + faixa de interpretação.
import { EVENTS, normalizeTag, plainText, RESET_TAG, STYLES, type Segment } from "../shared/markup";

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function tagClass(raw: string): string {
  const key = normalizeTag(raw);
  if (key === RESET_TAG) return "t-normal";
  if (key in EVENTS) return "t-evento";
  if (key in STYLES) return `t-${key}`;
  return "t-livre";
}

export function styleClass(seg: Segment): string {
  if (!seg.style) return "t-base";
  return seg.freeStyle ? "t-livre" : `t-${seg.style}`;
}

/** Desenha o fundo do editor com as tags pintadas (o texto real fica no textarea por cima). */
export function renderHighlight(target: HTMLElement, text: string, visivel = false) {
  target.classList.toggle("realce-visivel", visivel);
  const html = escapeHtml(text).replace(/\[([^\[\]\n]{1,60})\]/g, (m, inner: string) => {
    return `<mark class="${tagClass(inner)}">${m}</mark>`;
  });
  // Se o texto termina em quebra de linha, a div precisa de um caractere para "abrir" a linha vazia
  target.innerHTML = text.endsWith("\n") ? html + " " : html;
}

export function renderStrip(target: HTMLElement, segments: Segment[]) {
  target.innerHTML = "";
  if (!segments.length) {
    target.innerHTML = `<p class="faixa-vazia">Digite um texto para ver os trechos aqui.</p>`;
    return;
  }
  const total = segments.reduce((n, s) => n + Math.max(8, plainText([s]).length), 0);
  for (const seg of segments) {
    const len = Math.max(8, plainText([seg]).length);
    const el = document.createElement("div");
    const nome = seg.style ? (seg.freeStyle ? seg.style : STYLES[seg.style].label) : "Base da persona";
    const eventos = seg.pieces.filter((p) => p.kind === "event").map((p) => EVENTS[(p as { key: string }).key].label);
    el.className = `trecho ${styleClass(seg)}`;
    el.style.flexGrow = String(len / total);
    el.title = `${nome}${eventos.length ? ` · ${eventos.join(", ")}` : ""}\n${plainText([seg]).slice(0, 140)}`;
    el.innerHTML = `<span>${escapeHtml(nome)}</span>${eventos.length ? `<i aria-hidden="true">${"•".repeat(Math.min(eventos.length, 4))}</i>` : ""}`;
    target.append(el);
  }
}

/** Insere uma tag no cursor; se houver seleção e for estilo, envolve o trecho e fecha com [normal]. */
export function insertTag(ta: HTMLTextAreaElement, tag: string, kind: "estilo" | "evento" | "trecho", snippet?: string) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const before = value.slice(0, a);
  const sel = value.slice(a, b);
  const after = value.slice(b);
  const padL = before && !/\s$/.test(before) ? " " : "";
  // Espaço depois só se o que vem a seguir não for espaço nem pontuação
  const padR = after && !/^[\s.,;:!?…)]/.test(after) ? " " : "";
  let insert: string;

  if (kind === "trecho" && snippet) insert = `${padL}${snippet}${padR}`;
  else if (kind === "estilo" && sel.trim()) insert = `${padL}[${tag}] ${sel.trim()} [normal]${padR}`;
  else insert = `${padL}[${tag}]${after ? padR : " "}`;

  const caret = before.length + insert.length;
  ta.value = before + insert + after;
  ta.focus();
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
