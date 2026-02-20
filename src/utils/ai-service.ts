import { createGroq } from "@ai-sdk/groq";
import { generateObject, generateText } from "ai";
import { z } from "zod";

import type { AIResponse } from "@/types";
import { getSettings } from "@/utils/storage";

export const DEFAULT_MODEL = "openai/gpt-oss-20b";
export const GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "deepseek-r1-distill-llama-70b",
] as const;

const LANGUAGE_DETECTION_SCHEMA = z.object({
  language: z.string().min(2).max(40),
  confidence: z.number().min(0).max(1),
});

const WORD_DEFINITION_SCHEMA = z.object({
  definition: z.string().min(10).max(450),
  confidence: z.number().min(0).max(1),
});

const TRANSLATION_SCHEMA = z.object({
  translation: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
});

const TAG_SUGGESTION_SCHEMA = z.object({
  tags: z.array(z.string().min(2).max(30)).min(3).max(8),
  confidence: z.number().min(0).max(1),
});

const EXAMPLE_SCHEMA = z.object({
  examples: z.array(z.string().min(12).max(280)).min(3).max(5),
  confidence: z.number().min(0).max(1),
});

const GROUP_SUGGESTION_SCHEMA = z.object({
  groupId: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const DISTRACTOR_DEFINITIONS_SCHEMA = z.object({
  distractors: z.array(z.string().min(8).max(260)).length(3),
  confidence: z.number().min(0).max(1),
});

function resolveEnvApiKey(): string {
  return (
    import.meta.env.GROQ_API_KEY?.trim() ||
    import.meta.env.GROQ_API?.trim() ||
    import.meta.env.VITE_GROQ_API_KEY?.trim() ||
    import.meta.env.VITE_GROQ_API?.trim() ||
    ""
  );
}

type AiConfigOverrides = {
  apiKey?: string;
  model?: string;
};

async function resolveAiConfig(overrides?: AiConfigOverrides) {
  const settings = await getSettings();

  const apiKey = overrides?.apiKey?.trim() || settings.groqApiKey.trim() || resolveEnvApiKey();
  const model = overrides?.model?.trim() || settings.groqModel.trim() || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error(
      "Missing GROQ API key. Set GROQ_API_KEY in src/.env (or GROQ_API / VITE_GROQ_API).",
    );
  }

  return { apiKey, model };
}

function toErrorMessage(prefix: string, error: unknown): string {
  const suffix = formatGroqError(error);
  return `${prefix}: ${suffix}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedString(
  value: Record<string, unknown>,
  path: string[],
): string | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!isObject(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return typeof current === "string" ? current : undefined;
}

function getNestedNumber(
  value: Record<string, unknown>,
  path: string[],
): number | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!isObject(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return typeof current === "number" ? current : undefined;
}

function formatGroqError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }

  const details: string[] = [error.message];

  if (isObject(error)) {
    const statusCode = getNestedNumber(error, ["statusCode"]);
    const requestId =
      getNestedString(error, ["responseHeaders", "x-request-id"]) ||
      getNestedString(error, ["responseHeaders", "X-Request-Id"]);
    const apiMessage = getNestedString(error, ["data", "error", "message"]);

    if (typeof statusCode === "number") {
      details.push(`status=${statusCode}`);
    }

    if (apiMessage && apiMessage !== error.message) {
      details.push(`api=${apiMessage}`);
    }

    if (requestId) {
      details.push(`request_id=${requestId}`);
    }
  }

  return details.join(" | ");
}

function isUnsupportedJsonSchemaModelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("does not support response format") &&
    message.includes("json_schema")
  ) {
    return true;
  }

  if (!isObject(error)) {
    return false;
  }

  const apiMessage =
    getNestedString(error, ["data", "error", "message"])?.toLowerCase() ?? "";

  return (
    apiMessage.includes("does not support response format") &&
    apiMessage.includes("json_schema")
  );
}

function titleCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function runStructuredPrompt<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
  config?: AiConfigOverrides;
}): Promise<T> {
  const config = await resolveAiConfig(options.config);
  const groq = createGroq({
    apiKey: config.apiKey,
  });

  const configuredModel = config.model;
  const attempt = async (model: string) =>
    generateObject({
      model: groq(model),
      schema: options.schema,
      system: options.system,
      prompt: options.prompt,
      temperature: options.temperature ?? 0.2,
      providerOptions: {
        groq: {
          structuredOutputs: true,
          strictJsonSchema: true,
        },
      },
    });

  let result;

  try {
    result = await attempt(configuredModel);
  } catch (error) {
    if (
      configuredModel !== DEFAULT_MODEL &&
      isUnsupportedJsonSchemaModelError(error)
    ) {
      result = await attempt(DEFAULT_MODEL);
    } else {
      throw error;
    }
  }

  return result.object;
}

export async function testAiConnection(): Promise<AIResponse<string>> {
  return testAiConnectionWithConfig({});
}

export async function testAiConnectionWithConfig(config: AiConfigOverrides): Promise<AIResponse<string>> {
  try {
    const object = await runStructuredPrompt({
      schema: LANGUAGE_DETECTION_SCHEMA,
      system:
        "You detect the language of user-provided text. Return only a valid JSON object matching the schema.",
      prompt: 'Detect language of this text: "hello world"',
      temperature: 0,
      config,
    });

    return {
      success: true,
      data: titleCase(object.language),
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: toErrorMessage("Connection test failed", error),
    };
  }
}

export async function detectLanguage(text: string): Promise<AIResponse<string>> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {
      success: false,
      data: "",
      error: "No text provided for language detection.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: LANGUAGE_DETECTION_SCHEMA,
      system:
        "You detect the language of user-provided text. Return only a valid JSON object matching the schema.",
      prompt: [
        "Detect the primary language of this text.",
        'Return language as an English name like "English", "French", "Arabic", "Japanese".',
        `Text: ${trimmedText}`,
      ].join("\n"),
      temperature: 0,
    });

    return {
      success: true,
      data: titleCase(object.language),
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: toErrorMessage("Language detection failed", error),
    };
  }
}

export async function defineWord(
  word: string,
  language: string,
): Promise<AIResponse<string>> {
  const trimmedWord = word.trim();

  if (!trimmedWord) {
    return {
      success: false,
      data: "",
      error: "No word provided for definition.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: WORD_DEFINITION_SCHEMA,
      system:
        "You are a lexicography assistant. Return concise, accurate dictionary-style definitions and valid JSON only.",
      prompt: [
        `Define the word "${trimmedWord}" in ${language}.`,
        "Provide one concise definition (1-2 sentences).",
        "Do not include markdown, bullet points, or phonetics in the definition field.",
      ].join("\n"),
      temperature: 0.15,
    });

    return {
      success: true,
      data: object.definition.trim(),
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: toErrorMessage("Definition generation failed", error),
    };
  }
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<AIResponse<string>> {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return {
      success: false,
      data: "",
      error: "No text provided for translation.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: TRANSLATION_SCHEMA,
      system:
        "You are a precise translation assistant. Return only valid JSON matching the schema.",
      prompt: [
        `Translate this text from ${sourceLang} to ${targetLang}.`,
        "Preserve tone, punctuation, and intent.",
        `Text: ${trimmedText}`,
      ].join("\n"),
      temperature: 0,
    });

    return {
      success: true,
      data: object.translation.trim(),
      confidence: object.confidence,
    };
  } catch (error) {
    // Fallback path when structured JSON output fails schema validation.
    try {
      const config = await resolveAiConfig();
      const groq = createGroq({ apiKey: config.apiKey });
      const candidateModels =
        config.model !== DEFAULT_MODEL ? [config.model, DEFAULT_MODEL] : [config.model];
      let translated = "";
      let fallbackError: unknown = null;

      for (const model of candidateModels) {
        try {
          const result = await generateText({
            model: groq(model),
            system:
              "You are a precise translation assistant. Return only the translated text, with no JSON, markdown, or explanation.",
            prompt: [
              `Translate this text from ${sourceLang} to ${targetLang}.`,
              "Preserve tone, punctuation, and intent.",
              `Text: ${trimmedText}`,
            ].join("\n"),
            temperature: 0,
          });

          translated = result.text.trim().replace(/^["'`]+|["'`]+$/g, "");
          if (translated) {
            break;
          }
        } catch (fallbackRunError) {
          fallbackError = fallbackRunError;
        }
      }

      if (translated) {
        return {
          success: true,
          data: translated,
        };
      }

      return {
        success: false,
        data: "",
        error: toErrorMessage("Translation failed", fallbackError ?? error),
      };
    } catch (fallbackOuterError) {
      const primary = toErrorMessage("Translation failed", error);
      const secondary = toErrorMessage("Fallback translation failed", fallbackOuterError);
      return {
        success: false,
        data: "",
        error: `${primary} | ${secondary}`,
      };
    }
  }
}

export async function suggestTags(
  word: string,
  definition: string,
): Promise<AIResponse<string[]>> {
  const trimmedWord = word.trim();
  const trimmedDefinition = definition.trim();

  if (!trimmedWord || !trimmedDefinition) {
    return {
      success: false,
      data: [],
      error: "Both word and definition are required for tag suggestions.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: TAG_SUGGESTION_SCHEMA,
      system:
        "You create compact learning tags for vocabulary entries. Return JSON only and keep tags short.",
      prompt: [
        `Word: ${trimmedWord}`,
        `Definition: ${trimmedDefinition}`,
        "Return 3 to 8 tags.",
        "Use lowercase words or short phrases only. No punctuation.",
      ].join("\n"),
      temperature: 0.2,
    });

    const tags = Array.from(
      new Set(
        object.tags
          .map(normalizeTag)
          .filter((tag) => tag.length >= 2 && tag.length <= 30),
      ),
    ).slice(0, 8);

    return {
      success: true,
      data: tags,
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Tag suggestion failed", error),
    };
  }
}

export async function getExamples(
  word: string,
  language: string,
): Promise<AIResponse<string[]>> {
  const trimmedWord = word.trim();

  if (!trimmedWord) {
    return {
      success: false,
      data: [],
      error: "No word provided for example generation.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: EXAMPLE_SCHEMA,
      system:
        "You generate natural, practical vocabulary examples. Return JSON only in the exact schema.",
      prompt: [
        `Generate 3 to 5 example sentences in ${language}.`,
        `Every sentence must naturally use the word: ${trimmedWord}`,
        "Make the examples varied and useful for learners.",
      ].join("\n"),
      temperature: 0.35,
    });

    return {
      success: true,
      data: object.examples.map((example) => example.trim()),
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Example generation failed", error),
    };
  }
}

export async function suggestGroup(
  word: string,
  definition: string,
  availableGroups: Array<{ id: string; name: string; description?: string }>,
): Promise<AIResponse<string>> {
  const trimmedWord = word.trim();
  const trimmedDefinition = definition.trim();

  if (!trimmedWord || !trimmedDefinition) {
    return {
      success: false,
      data: "",
      error: "Both word and definition are required for group suggestion.",
    };
  }

  if (availableGroups.length === 0) {
    return {
      success: false,
      data: "",
      error: "No groups available for suggestion.",
    };
  }

  try {
    const groupsList = availableGroups
      .map((g) => `- ID: ${g.id}, Name: ${g.name}${g.description ? `, Description: ${g.description}` : ""}`)
      .join("\n");

    const object = await runStructuredPrompt({
      schema: GROUP_SUGGESTION_SCHEMA,
      system:
        "You are a vocabulary categorization assistant. Analyze words and their definitions to suggest the most appropriate group from the available options. Return JSON only.",
      prompt: [
        `Word: ${trimmedWord}`,
        `Definition: ${trimmedDefinition}`,
        "",
        "Available groups:",
        groupsList,
        "",
        "Select the most appropriate group ID from the list above that best categorizes this word.",
        "Return the exact group ID as it appears in the list.",
      ].join("\n"),
      temperature: 0.1,
    });

    // Validate that the returned groupId exists in availableGroups
    const selectedGroup = availableGroups.find((g) => g.id === object.groupId);
    if (!selectedGroup) {
      // Fallback to first group if AI returns invalid ID
      return {
        success: true,
        data: availableGroups[0].id,
        confidence: 0.5,
      };
    }

    return {
      success: true,
      data: object.groupId,
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: toErrorMessage("Group suggestion failed", error),
    };
  }
}

export async function suggestDistractorDefinitions(
  word: string,
  definition: string,
  language: string,
): Promise<AIResponse<string[]>> {
  const trimmedWord = word.trim();
  const trimmedDefinition = definition.trim();

  if (!trimmedWord || !trimmedDefinition) {
    return {
      success: false,
      data: [],
      error: "Word and definition are required for distractor generation.",
    };
  }

  try {
    const object = await runStructuredPrompt({
      schema: DISTRACTOR_DEFINITIONS_SCHEMA,
      system:
        "You create plausible-but-wrong multiple-choice distractors for vocabulary learning. Return strict JSON only.",
      prompt: [
        `Word: ${trimmedWord}`,
        `Language: ${language}`,
        `Correct definition: ${trimmedDefinition}`,
        "Generate exactly 3 fake definitions that are close in tone/domain but incorrect.",
        "Avoid reusing the exact wording of the correct definition.",
        "Do not mention that these are fake definitions.",
      ].join("\n"),
      temperature: 0.45,
    });

    const distractors = Array.from(
      new Set(
        object.distractors
          .map((item) => item.trim())
          .filter((item) => item && item.toLowerCase() !== trimmedDefinition.toLowerCase()),
      ),
    ).slice(0, 3);

    if (distractors.length < 3) {
      return {
        success: false,
        data: [],
        error: "AI returned insufficient distractors.",
      };
    }

    return {
      success: true,
      data: distractors,
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Distractor generation failed", error),
    };
  }
}
