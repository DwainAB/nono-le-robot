import WebSocket from "ws";
import { config } from "./config.js";

const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";
const OUTPUT_SAMPLE_RATE = 24000;

export function isCartesiaConfigured() {
  return Boolean(config.cartesiaApiKey);
}

function resolveVoiceId(language) {
  return config.cartesiaVoiceIds[language] || config.cartesiaVoiceIds.fr;
}

/**
 * Streams TTS audio for `text` from Cartesia, invoking `onAudioChunk` with each
 * raw PCM s16le buffer as soon as it arrives, and `onDone`/`onError` once the
 * generation finishes.
 */
export function streamCartesiaTts({ text, language, onAudioChunk, onDone, onError }) {
  const voiceId = resolveVoiceId(language);
  if (!voiceId) {
    onError(new Error(`Aucune voix Cartesia configuree pour la langue "${language}"`));
    return { cancel: () => {} };
  }

  const url = `${CARTESIA_WS_URL}?cartesia_version=${config.cartesiaVersion}&access_token=${config.cartesiaApiKey}`;
  const socket = new WebSocket(url);
  const contextId = `nono-${Date.now()}`;
  let settled = false;

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        model_id: config.cartesiaModelId,
        transcript: text,
        voice: { mode: "id", id: voiceId },
        language,
        context_id: contextId,
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: OUTPUT_SAMPLE_RATE
        },
        continue: false
      })
    );
  });

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "chunk" && message.data) {
      onAudioChunk(Buffer.from(message.data, "base64"));
    } else if (message.type === "error") {
      settled = true;
      onError(new Error(message.message || "Erreur Cartesia"));
      socket.close();
    } else if (message.type === "done" || message.done) {
      settled = true;
      onDone();
      socket.close();
    }
  });

  socket.on("error", (error) => {
    if (settled) return;
    settled = true;
    onError(error);
  });

  socket.on("close", () => {
    if (!settled) {
      settled = true;
      onError(new Error("Connexion Cartesia fermee avant la fin de la synthese"));
    }
  });

  return {
    cancel: () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ context_id: contextId, cancel: true }));
      }
      socket.close();
    }
  };
}

export const CARTESIA_OUTPUT_SAMPLE_RATE = OUTPUT_SAMPLE_RATE;
