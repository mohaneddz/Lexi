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

const GROUP_BATCH_SUGGESTION_SCHEMA = z.object({
  assignments: z.array(z.object({
    item: z.number().int(),
    group: z.string(),
  })),
});

const DISTRACTOR_DEFINITIONS_SCHEMA = z.object({
  distractors: z.array(z.string().min(8).max(260)).length(3),
  confidence: z.number().min(0).max(1),
});

const RELATED_TRANSLATIONS_SCHEMA = z.object({
  suggestions: z.array(z.object({
    sourceWord: z.string().min(1).max(80),
    targetWord: z.string().min(1).max(80),
    context: z.string().min(4).max(200),
  })).min(1).max(6),
  confidence: z.number().min(0).max(1),
});

const GROUP_WORD_SUGGESTIONS_SCHEMA = z.object({
  terms: z.array(z.string().min(1).max(60)).min(1).max(8),
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

export type GroupBatchItem = { label: string; definition: string };

/**
 * Sorts several items into groups in one request, so organizing a backlog
 * costs one call per batch instead of one per item. Groups are shown to the
 * model as short labels (G1, G2, ...) rather than their UUIDs, which keeps
 * the prompt small and the answers easy to get right.
 *
 * Returns one entry per item, in order: the chosen group id, or null when
 * the model picked none or skipped the item.
 */
export async function suggestGroupsBatch(
  items: GroupBatchItem[],
  availableGroups: Array<{ id: string; name: string; description?: string }>,
): Promise<AIResponse<Array<string | null>>> {
  if (items.length === 0) {
    return { success: true, data: [] };
  }
  if (availableGroups.length === 0) {
    return { success: false, data: [], error: "No groups available for suggestion." };
  }

  try {
    const labelToId = new Map(availableGroups.map((group, index) => [`G${index + 1}`, group.id]));
    const groupsList = availableGroups
      .map((group, index) => `G${index + 1}: ${group.name}${group.description ? ` (${group.description})` : ""}`)
      .join("\n");
    const itemsList = items
      .map((item, index) => `${index + 1}. ${item.label.trim()} :: ${item.definition.trim().slice(0, 200)}`)
      .join("\n");

    const object = await runStructuredPrompt({
      schema: GROUP_BATCH_SUGGESTION_SCHEMA,
      system:
        "You are a vocabulary categorization assistant. Sort each numbered item into the most fitting group. Return JSON only.",
      prompt: [
        "Groups:",
        groupsList,
        "",
        "Items (number. word :: meaning):",
        itemsList,
        "",
        `Return exactly one assignment for each of the ${items.length} items: its number and the group label (such as G1).`,
        "If an item does not clearly fit any group, use NONE as its group instead of forcing a match.",
      ].join("\n"),
      temperature: 0.1,
    });

    const result: Array<string | null> = items.map(() => null);
    for (const assignment of object.assignments) {
      const index = assignment.item - 1;
      if (index < 0 || index >= items.length) continue;
      result[index] = labelToId.get(assignment.group.trim().toUpperCase()) ?? null;
    }

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Batch group suggestion failed", error),
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

export async function suggestGroupIcon(
  groupName: string,
  groupDescription: string | undefined,
  availableIconNames: string[],
): Promise<AIResponse<string>> {
  const trimmedName = groupName.trim();
  if (!trimmedName) {
    return {
      success: false,
      data: "",
      error: "Group name is required for icon suggestion.",
    };
  }

  if (availableIconNames.length === 0) {
    return {
      success: false,
      data: "",
      error: "No icons available for suggestion.",
    };
  }

  // Lucide names are compared with case, spaces, dashes and underscores
  // stripped, so "book-open" or "Book Open" still finds BookOpen.
  const compact = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");
  const byCompactName = new Map(availableIconNames.map((name) => [compact(name), name]));

  // Plain text rather than structured output: the model already knows
  // Lucide's names, so there's no need to send the icon list (it's over a
  // thousand names), and a strict JSON schema here kept failing validation.
  const prompt = [
    `Group name: ${trimmedName}`,
    `Group description: ${groupDescription?.trim() || "None"}`,
    "",
    "Suggest the 5 best Lucide icon names for this group, most fitting first.",
    "Use exact Lucide component names in PascalCase, such as BookOpen, Plane or Briefcase.",
    "Reply with only the names, comma separated, nothing else.",
  ].join("\n");

  try {
    const config = await resolveAiConfig();
    const groq = createGroq({ apiKey: config.apiKey });
    const candidateModels = config.model !== DEFAULT_MODEL ? [config.model, DEFAULT_MODEL] : [config.model];

    let lastError: unknown = null;
    for (const model of candidateModels) {
      try {
        const result = await generateText({
          model: groq(model),
          system: "You pick Lucide icons for groups in a vocabulary app. Reply with icon names only.",
          prompt,
          temperature: 0.1,
        });

        const suggested = result.text
          .split(/[,\n]+/)
          .map((entry) => entry.replace(/[`"'*.]/g, "").replace(/^\s*\d+[).]?\s*/, "").trim())
          .filter(Boolean);
        const matched = suggested.map((entry) => byCompactName.get(compact(entry))).find(Boolean);
        if (matched) {
          return { success: true, data: matched };
        }
        lastError = new Error(`None of the suggested icons exist: ${suggested.slice(0, 5).join(", ") || "empty reply"}`);
      } catch (runError) {
        lastError = runError;
      }
    }

    return {
      success: false,
      data: "",
      error: toErrorMessage("Group icon suggestion failed", lastError),
    };
  } catch (error) {
    return {
      success: false,
      data: "",
      error: toErrorMessage("Group icon suggestion failed", error),
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

export type RelatedTranslationSuggestion = {
  sourceWord: string;
  targetWord: string;
  context: string;
};

export async function suggestRelatedTranslations(
  sourceWord: string,
  sourceLanguage: string,
  targetLanguage: string,
  context: string | undefined,
  excludeWords: string[],
): Promise<AIResponse<RelatedTranslationSuggestion[]>> {
  const trimmedWord = sourceWord.trim();

  if (!trimmedWord) {
    return {
      success: false,
      data: [],
      error: "No word provided for related translation suggestions.",
    };
  }

  try {
    const exclusionList = excludeWords.length > 0 ? excludeWords.join(", ") : "none";

    const object = await runStructuredPrompt({
      schema: RELATED_TRANSLATIONS_SCHEMA,
      system:
        "You suggest vocabulary translation pairs for language learners, related to a given word. Return strict JSON only.",
      prompt: [
        `Source word: ${trimmedWord}`,
        `Source language: ${sourceLanguage}`,
        `Target language: ${targetLanguage}`,
        context ? `Context/usage of the source word: ${context}` : "",
        "Suggest 4 other word pairs in the same source-to-target language direction that are similar to the source word in topic, context, and difficulty level.",
        "Do not repeat the source word itself, and do not repeat any of these already-known words:",
        exclusionList,
        "Each suggestion needs a short usage note or context sentence (under 15 words).",
      ].filter(Boolean).join("\n"),
      temperature: 0.4,
    });

    const excludeSet = new Set([trimmedWord.toLowerCase(), ...excludeWords.map((word) => word.toLowerCase())]);
    const seen = new Set<string>();

    const suggestions = object.suggestions
      .map((item) => ({
        sourceWord: item.sourceWord.trim(),
        targetWord: item.targetWord.trim(),
        context: item.context.trim(),
      }))
      .filter((item) => item.sourceWord && item.targetWord)
      .filter((item) => !excludeSet.has(item.sourceWord.toLowerCase()))
      .filter((item) => {
        const key = item.sourceWord.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

    if (suggestions.length === 0) {
      return {
        success: false,
        data: [],
        error: "AI returned no usable suggestions.",
      };
    }

    return {
      success: true,
      data: suggestions,
      confidence: object.confidence,
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Related translation suggestion failed", error),
    };
  }
}

export type GroupWordSuggestionRequest = {
  groupName: string;
  groupDescription?: string;
  language: string;
  /** Existing words in the group, used as few-shot examples of its theme. */
  exampleWords: string[];
  /** Words to avoid re-suggesting: already saved, already dismissed, already shown this session. */
  excludeWords: string[];
  count?: number;
};

/**
 * Suggests new candidate words for a themed group, using the group's own
 * existing words as few-shot examples so the result matches its actual
 * topic and difficulty rather than a generic guess from the group's name
 * alone. Returns bare terms, not definitions — the caller looks those up in
 * its own offline books so the definition stays grounded rather than
 * AI-invented wherever possible.
 */
export async function suggestGroupWords(
  request: GroupWordSuggestionRequest,
): Promise<AIResponse<string[]>> {
  const { groupName, groupDescription, language, exampleWords, excludeWords, count = 6 } = request;

  try {
    const exampleList = exampleWords.length > 0
      ? exampleWords.join(", ")
      : "(this group has no words yet — use the name and description to judge the theme)";
    const exclusionList = excludeWords.length > 0 ? excludeWords.slice(0, 60).join(", ") : "none";

    const object = await runStructuredPrompt({
      schema: GROUP_WORD_SUGGESTIONS_SCHEMA,
      system:
        "You suggest new vocabulary words that belong to a themed collection in a vocabulary learning app. Return strict JSON only.",
      prompt: [
        `Group name: ${groupName}`,
        groupDescription ? `Group description: ${groupDescription}` : "",
        `Language: ${language}`,
        `Existing words already in this group, as a reference for its exact topic and difficulty: ${exampleList}`,
        `Suggest ${count} new, single ${language} words or short terms that clearly belong in this same group.`,
        "Match the topic and difficulty level of the existing words as closely as possible.",
        "Do not repeat the group name itself, and do not repeat any of these already-known words:",
        exclusionList,
        "Return only the words themselves, one per array entry, not definitions or explanations.",
      ].filter(Boolean).join("\n"),
      temperature: 0.65,
    });

    const excludeSet = new Set(excludeWords.map((word) => word.trim().toLowerCase()));
    const seen = new Set<string>();

    const terms = object.terms
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
      .filter((term) => !excludeSet.has(term.toLowerCase()))
      .filter((term) => {
        const key = term.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (terms.length === 0) {
      return { success: false, data: [], error: "AI returned no usable terms." };
    }

    return { success: true, data: terms, confidence: object.confidence };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: toErrorMessage("Group word suggestion failed", error),
    };
  }
}
