// Vozes masculinas em português do Brasil que rodam no navegador, e onde baixar cada uma.
// Os arquivos são baixados pelo navegador de quem usa e ficam guardados (Cache Storage).

const JSD = "https://cdn.jsdelivr.net/npm";
const HF = "https://huggingface.co";

export type MotorId = "kokoro" | "piper";

export interface VozCatalogo {
  id: string;
  motor: MotorId;
  nome: string;
  detalhe: string;
  /** Kokoro: nome do arquivo de voz. Piper: URL do modelo (.onnx) — a configuração é o mesmo endereço + ".json". */
  arquivo: string;
  tamanhoMb: number;
}

export const VOZES: VozCatalogo[] = [
  {
    id: "piper-faber", motor: "piper", nome: "Faber", tamanhoMb: 63,
    detalhe: "Piper, qualidade média, 22 kHz. Gravações de um locutor brasileiro.",
    arquivo: `${HF}/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx`,
  },
  {
    id: "piper-miro", motor: "piper", nome: "Miro", tamanhoMb: 64,
    detalhe: "Piper (OpenVoiceOS), dados sintéticos; adaptada de uma voz de Portugal.",
    arquivo: `${HF}/OpenVoiceOS/pipertts_pt-BR_miro/resolve/main/miro_pt-BR.onnx`,
  },
  {
    id: "piper-edresson", motor: "piper", nome: "Edresson", tamanhoMb: 63,
    detalhe: "Piper, qualidade baixa, 16 kHz.",
    arquivo: `${HF}/rhasspy/piper-voices/resolve/main/pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx`,
  },
  {
    id: "kokoro-alex", motor: "kokoro", nome: "Alex", tamanhoMb: 92,
    detalhe: "Kokoro, 24 kHz. Aceita controle de tom e de expressividade.",
    arquivo: "pm_alex",
  },
  {
    id: "kokoro-santa", motor: "kokoro", nome: "Santa", tamanhoMb: 92,
    detalhe: "Kokoro, 24 kHz. Timbre mais grave e caloroso.",
    arquivo: "pm_santa",
  },
];

/** Vozes masculinas usadas como "doadoras" de expressividade no Kokoro (só a entonação, não o timbre). */
export const DOADORES = [
  { id: "am_puck", nome: "Puck (inglês, enérgico)" },
  { id: "am_fenrir", nome: "Fenrir (inglês, vibrante)" },
  { id: "em_santa", nome: "Santa (espanhol, próximo do português)" },
  { id: "em_alex", nome: "Alex (espanhol)" },
  { id: "im_nicola", nome: "Nicola (italiano)" },
  { id: "am_michael", nome: "Michael (inglês, contido)" },
];

export const KOKORO_MODELO = Array.from({ length: 6 }, (_, i) => `${JSD}/kokoro-q8-shards@1.0.0/kokoro-q8.part${i}.bin`);
export const KOKORO_MODELO_MB = 92;
export const kokoroVozUrl = (nome: string) => `${JSD}/kokoro-js@1.2.1/voices/${nome}.bin`;

export const vozPorId = (id: string) => VOZES.find((v) => v.id === id) ?? VOZES[0];
