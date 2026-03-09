import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

export function createTranscriptionTool(api: OpenClawPluginApi) {
  const runtime = api.runtime;

  return {
    name: "secretary_transcribe",
    label: "Secretary Audio Transcription",
    description: "Transcribe audio files using OpenClaw's built-in speech-to-text (supports multiple providers via config).",
    
    parameters: Type.Object({
      filePath: Type.String({
        description: "Path to the audio file to transcribe (supports .wav, .mp3, .m4a, .ogg, etc.).",
      }),
      mimeType: Type.Optional(Type.String({
        description: "Optional MIME type of the audio file (auto-detected if not provided).",
      })),
    }),

    async execute(runId: string, params: Record<string, any>) {
      try {
        const { filePath, mimeType } = params;

        if (!filePath) {
          return {
            content: [{
              type: "text" as const,
              text: "⚠️ Se requiere un path de archivo de audio para transcribir."
            }],
          };
        }

        api.logger.info(`[transcription-tool] Starting transcription of: ${filePath}`);

        // Use core's STT functionality
        const result = await runtime.stt.transcribeAudioFile({
          filePath,
          cfg: api.config,
          agentDir: api.resolvePath(""),
          mime: mimeType,
        });

        if (!result.text) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ No se pudo transcribir el audio. Verifica que el archivo existe y el formato es compatible."
            }],
            details: { filePath, error: "No transcription result" },
          };
        }

        const transcription = result.text;
        api.logger.info(`[transcription-tool] Transcription completed for ${filePath}`);

        return {
          content: [{
            type: "text" as const,
            text: `🎤 **Transcripción completada:**\n\n${transcription}`
          }],
          details: { 
            filePath, 
            transcriptionLength: transcription.length,
            transcriptionPreview: transcription.substring(0, 100) + (transcription.length > 100 ? "..." : "")
          },
        };

      } catch (error: any) {
api.logger.error(`[transcription-tool] Error transcribing audio: ${error.message}`);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Error al transcribir audio: ${error.message}`
          }],
          details: { filePath: params.filePath, error: error.message },
        };
      }
    },
  };
}