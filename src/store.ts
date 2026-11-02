// Personas salvas no navegador (localStorage), com proteção para quando o armazenamento falha.
import { migrarPersona, PERSONAS_PADRAO } from "../shared/persona";
import type { Persona } from "../shared/types";

const KEY = "leitor-voz:personas:v1";
const ACTIVE = "leitor-voz:ativa";
const TEXT = "leitor-voz:texto";
const CODE = "leitor-voz:acesso";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado ou cota cheia: segue só em memória */
  }
}

export const loadPersonas = (): Persona[] => {
  const list = read<unknown[]>(KEY, []);
  return Array.isArray(list) && list.length ? list.map(migrarPersona) : structuredClone(PERSONAS_PADRAO);
};
export const savePersonas = (list: Persona[]) => write(KEY, list);
export const loadActive = () => read<string>(ACTIVE, "");
export const saveActive = (id: string) => write(ACTIVE, id);
export const loadText = () => read<string | null>(TEXT, null);
export const saveText = (t: string) => write(TEXT, t);
export const loadCode = () => read<string>(CODE, "");
export const saveCode = (c: string) => write(CODE, c);
