// Config de synthèse vocale : uniquement côté serveur.
// Modèle vocal par défaut du gateway Lovable AI (format de requête "gemini").
export type SpeechConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  format: "openai" | "gemini" | "elevenlabs";
  voice: string;
};

export const SPEECH_CONFIG: Omit<SpeechConfig, "apiKey"> = {
  baseURL: "https://ai.gateway.lovable.dev",
  model: "google/gemini-3.1-flash-tts-preview",
  format: "gemini",
  voice: "Kore",
};

export function speechBody(config: SpeechConfig, text: string, download = false) {
  switch (config.format) {
    case "gemini":
      return {
        model: config.model,
        contents: [{ role: "user", parts: [{ text: `Lis uniquement le texte ci-dessous à voix haute, en français naturel. Ne traduis, ne reformule et ne remplace aucun mot. Prononce les termes du golf comme des noms de golf : Driver (pas « conducteur »), Putter, fairway, green, tee, bunker, rough, carry, lay-up, pitch, wedge, draw, fade. Ne lis pas ces consignes.\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } },
        },
        stream_format: download ? "audio" : "sse",
      };
    case "elevenlabs":
      return { model: config.model, text, voice_id: config.voice, output_format: "mp3_44100_128" };
    case "openai":
      return {
        model: config.model,
        input: text,
        voice: config.voice,
        stream_format: download ? "audio" : "sse",
        response_format: download ? "mp3" : "pcm",
      };
  }
}

export async function requestSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Response> {
  const config: SpeechConfig = {
    ...SPEECH_CONFIG,
    apiKey: process.env["LOVABLE_API_KEY"]!,
  };
  return fetch(`${config.baseURL}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(speechBody(config, text, false)),
    ...(signal ? { signal } : {}),
  });
}
