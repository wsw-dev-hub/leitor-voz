import * as ort from "onnxruntime-web";
import createEphone, { roa } from "ephone";
const log = (m) => (document.getElementById("log").textContent += m + "\n");
const E2M = [["aɪ","I"],["aʊ","W"],["dz","ʣ"],["dʒ","ʤ"],["eɪ","A"],["oʊ","O"],["əʊ","Q"],["ts","ʦ"],["tʃ","ʧ"],["ɔɪ","Y"]];
window.resultado = (async () => {
  const r = { isolado: crossOriginIsolated, threads: 0 };
  ort.env.wasm.wasmPaths = "/node_modules/onnxruntime-web/dist/";
  ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency) : 1;
  r.threads = ort.env.wasm.numThreads;
  let t = performance.now();
  const ephone = await createEphone(roa); ephone.setVoice("pt-BR");
  const vocab = await (await fetch("/vocab.json")).json();
  r.ephone_ms = Math.round(performance.now() - t);
  t = performance.now();
  const sess = await ort.InferenceSession.create(await (await fetch("/kokoro-q8.onnx")).arrayBuffer(), { executionProviders: ["wasm"] });
  r.modelo_ms = Math.round(performance.now() - t);
  const voz = new Float32Array(await (await fetch("/voices/pm_alex.bin")).arrayBuffer());
  let f = ephone.textToIpa("Boa noite, turma! Hoje vamos revisar a sequência do segundo bloco, com atenção à transferência de peso.");
  for (const [a, b] of E2M) f = f.replaceAll(a, b);
  const ids = [...f.trim()].map((c) => vocab[c]).filter((x) => x !== undefined);
  t = performance.now();
  const out = await sess.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
    style: new ort.Tensor("float32", voz.slice(ids.length * 256, ids.length * 256 + 256), [1, 256]),
    speed: new ort.Tensor("float32", new Float32Array([1]), [1]),
  });
  const onda = Object.values(out)[0].data;
  r.gerar_ms = Math.round(performance.now() - t);
  r.audio_s = +(onda.length / 24000).toFixed(2);
  r.tempo_real = +(r.gerar_ms / 1000 / r.audio_s).toFixed(2);
  r.pico = +Math.max(...onda.slice(0, 48000).map(Math.abs)).toFixed(2);
  log(JSON.stringify(r, null, 1));
  return r;
})().catch((e) => ({ erro: String(e) }));
