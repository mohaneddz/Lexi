import { type ComponentType, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  FileJson,
  Keyboard,
  KeyRound,
  MoonStar,
  RefreshCcw,
  Sparkles,
  Sun,
  SunMoon,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImportBookDialog } from "@/components/ImportBookDialog";
import { useAI } from "@/hooks/useAI";
import { useBooks } from "@/hooks/useBooks";
import { useTheme } from "@/hooks/useTheme";
import type { AppSettings, RevisionMode, Theme } from "@/types";
import { GROQ_MODELS } from "@/utils/ai-service";
import { clearAllData, getSettings, updateSettings } from "@/utils/storage";
import { validateGroqApiKey, validateGroqModel } from "@/utils/validators";

const LANGUAGE_OPTIONS = [
  "English",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
  "Japanese",
  "Korean",
  "Chinese",
];

const THEMES: Array<{ div: string; value: Theme; icon: ComponentType<{ className?: string }> }> = [
  { div: "Dark", value: "dark", icon: MoonStar },
  { div: "Light", value: "light", icon: Sun },
  { div: "System", value: "system", icon: SunMoon },
];

const REVISION_MODES: Array<{ div: string; value: RevisionMode }> = [
  { div: "Flashcards", value: "flashcard" },
  { div: "Multiple Choice", value: "multiple-choice" },
  { div: "Typing", value: "typing" },
];

const PRIMARY_MODIFIER_div = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";

const SHORTCUTS = [
  { keys: `${PRIMARY_MODIFIER_div}+K`, action: "Focus page search" },
  { keys: `${PRIMARY_MODIFIER_div}+N`, action: "Capture item on active page" },
  { keys: `${PRIMARY_MODIFIER_div}+Shift+T`, action: "Open translations and add pair" },
  { keys: `${PRIMARY_MODIFIER_div}+Shift+R`, action: "Jump to review workspace" },
  { keys: "Ctrl+Shift+<", action: "Toggle tray hide/show" },
  { keys: `${PRIMARY_MODIFIER_div}+Shift+;`, action: "Global quick define popup toggle" },
  { keys: `${PRIMARY_MODIFIER_div}+Shift+'`, action: "Global quick translate popup toggle" },
  { keys: "Alt+1..9", action: "Navigate top tabs" },
  { keys: "J / K", action: "Move selection in lists" },
  { keys: "1 / 2 / 3", action: "Set status New/Learning/Mastered" },
  { keys: "Enter (Capture)", action: "Run AI define/translate from source term field" },
  { keys: "Space", action: "Reveal/advance flashcards" },
  { keys: "1..4 (Review)", action: "Pick multiple-choice answer" },
];

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { testConnection, loading: testingConnection } = useAI();
  const { importCustomSourceFromFile } = useBooks();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [importBookOpen, setImportBookOpen] = useState(false);

  const [apiDraft, setApiDraft] = useState("");
  const [modelDraft, setModelDraft] = useState<string>(GROQ_MODELS[0]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(async (loaded) => {
      let launchAtStartup = loaded.launchAtStartup;
      try {
        launchAtStartup = await isAutostartEnabled();
      } catch {
        // Ignore in unsupported contexts.
      }

      const next = {
        ...loaded,
        launchAtStartup,
        startMinimized: launchAtStartup ? loaded.startMinimized : false,
      };

      setSettings(next);
      setApiDraft(next.groqApiKey);
      setModelDraft(next.groqModel || GROQ_MODELS[0]);

      if (next.launchAtStartup !== loaded.launchAtStartup || next.startMinimized !== loaded.startMinimized) {
        await updateSettings({
          launchAtStartup: next.launchAtStartup,
          startMinimized: next.startMinimized,
        });
      }
    });
  }, []);

  const patchSettings = async (updates: Partial<AppSettings>) => {
    setSaving(true);
    try {
      await updateSettings(updates);
      if (typeof updates.hideToTray === "boolean") {
        await invoke("set_hide_to_tray", { enabled: updates.hideToTray });
      }
      setSettings((current) => {
        if (!current) {
          return current;
        }

        const next = { ...current, ...updates };
        window.dispatchEvent(new CustomEvent("lexi:settings-updated", { detail: next }));
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (nextTheme: Theme) => {
    await setTheme(nextTheme);
    setSettings((current) => (current ? { ...current, theme: nextTheme } : current));
  };

  const handleSaveAiSettings = async () => {
    const keyValidation = validateGroqApiKey(apiDraft);
    const modelValidation = validateGroqModel(modelDraft);

    if (!keyValidation.valid) {
      setApiError(keyValidation.error ?? "Invalid API key");
      setApiSuccess(null);
      return;
    }

    if (!modelValidation.valid) {
      setApiError(modelValidation.error ?? "Invalid model");
      setApiSuccess(null);
      return;
    }

    setApiError(null);
    setApiSuccess(null);

    const tested = await testConnection(apiDraft, modelDraft);
    if (!tested.success) {
      setApiError(tested.error ?? "Could not connect to GROQ with these settings.");
      return;
    }

    await patchSettings({
      groqApiKey: apiDraft.trim(),
      groqModel: modelDraft,
    });

    setApiSuccess("Connection successful. AI settings saved.");
  };

  const handleResetData = async () => {
    const accepted = window.confirm(
      "This will remove all saved words, translations, and preferences. Continue?",
    );

    if (!accepted) {
      return;
    }

    setResetting(true);
    try {
      await clearAllData();
      const defaults = await getSettings();
      setSettings(defaults);
      setApiDraft(defaults.groqApiKey);
      setModelDraft(defaults.groqModel || GROQ_MODELS[0]);
      setApiError(null);
      setApiSuccess(null);
    } finally {
      setResetting(false);
    }
  };

  const handleLaunchAtStartupChange = async (enabled: boolean) => {
    setStartupError(null);

    try {
      if (enabled) {
        await enableAutostart();
        await patchSettings({ launchAtStartup: true });
        return;
      }

      await disableAutostart();
      await patchSettings({ launchAtStartup: false, startMinimized: false });
    } catch {
      setStartupError("Could not update startup registration.");
    }
  };

  const handleStartMinimizedChange = async (enabled: boolean) => {
    setStartupError(null);
    await patchSettings({ startMinimized: enabled });
  };

  if (!settings) {
    return (
      <div className="frost-panel flex h-full items-center justify-center">
        <p className="subtle-caption">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-full grid-cols-1 gap-3 xl:h-full xl:grid-cols-[1.15fr_0.95fr]">
      <section className="frost-panel custom-scrollbar min-h-[22rem] xl:min-h-0 overflow-y-auto p-5 md:p-6 animate-slide-in-up">
        <div className="space-y-6">
          <header>
            <h2 className="section-title">Settings</h2>
            <p className="subtle-caption mt-2">
              Configure AI behavior, workflow defaults, and productivity controls.
            </p>
          </header>

          <div className="frost-panel-soft space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Theme</p>
                <p className="subtle-caption mt-1">Choose how Lexi renders across all pages.</p>
              </div>
              <MoonStar className="size-4 text-muted-foreground" />
            </div>

            <div className="flex flex-wrap gap-2">
              {THEMES.map((entry) => {
                const EntryIcon = entry.icon;

                return (
                  <button
                    key={entry.value}
                    type="button"
                    className="lexi-toggle"
                    aria-pressed={theme === entry.value}
                    onClick={() => handleThemeChange(entry.value)}
                    disabled={saving}
                  >
                    <EntryIcon className="size-3.5" />
                    {entry.div}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="frost-panel-soft space-y-4 p-4">
            <div>
              <p className="font-medium">Language Defaults</p>
              <p className="subtle-caption mt-1">Set separate favorites for definition and translation flows.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <span className="subtle-caption">Global fallback</span>
                <select
                  value={settings.defaultLanguage}
                  onChange={(event) => patchSettings({ defaultLanguage: event.target.value })}
                  className="frost-input"
                  disabled={saving}
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="subtle-caption">Definition default</span>
                <select
                  value={settings.defaultDefinitionLanguage}
                  onChange={(event) => patchSettings({ defaultDefinitionLanguage: event.target.value })}
                  className="frost-input"
                  disabled={saving}
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="subtle-caption">Translation source default</span>
                <select
                  value={settings.defaultTranslationSourceLanguage}
                  onChange={(event) => patchSettings({ defaultTranslationSourceLanguage: event.target.value })}
                  className="frost-input"
                  disabled={saving}
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="subtle-caption">Translation target default</span>
                <select
                  value={settings.defaultTranslationTargetLanguage}
                  onChange={(event) => patchSettings({ defaultTranslationTargetLanguage: event.target.value })}
                  className="frost-input"
                  disabled={saving}
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="frost-panel-soft space-y-3 p-4">
            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">AI Assistant</p>
                <p className="subtle-caption mt-1">Enable AI define/translate helpers.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.aiEnabled}
                onChange={(event) => patchSettings({ aiEnabled: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Auto-detect Language</p>
                <p className="subtle-caption mt-1">Use detection when AI capture is explicitly triggered.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoDetectLanguage}
                onChange={(event) => patchSettings({ autoDetectLanguage: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving || !settings.aiEnabled}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">"Others" Group</p>
                <p className="subtle-caption mt-1">A built-in group for anything that doesn't fit elsewhere. Auto-assign falls back to it, and it gets its own section on Home. Turning it off hides it everywhere without deleting what's in it.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.othersGroupEnabled}
                onChange={(event) => patchSettings({ othersGroupEnabled: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>
          </div>

          <div className="frost-panel-soft space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">GROQ Provider</p>
                <p className="subtle-caption mt-1">
                  Set API key and model for AI features. If key is empty, Lexi uses your <code className="key-cap">.env</code> value.
                </p>
              </div>
              <KeyRound className="size-4 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <span className="subtle-caption">GROQ API Key</span>
              <input
                type="text"
                value={apiDraft}
                onChange={(event) => {
                  setApiDraft(event.target.value);
                  setApiError(null);
                  setApiSuccess(null);
                }}
                className="frost-input"
                placeholder="gsk_... (leave empty to use .env)"
                disabled={saving || testingConnection}
              />
            </div>

            <div className="space-y-1">
              <span className="subtle-caption">Model</span>
              <select
                value={modelDraft}
                onChange={(event) => {
                  setModelDraft(event.target.value);
                  setApiError(null);
                  setApiSuccess(null);
                }}
                className="frost-input"
                disabled={saving || testingConnection}
              >
                {GROQ_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {apiError ? <p className="subtle-caption text-red-300">{apiError}</p> : null}
            {apiSuccess ? <p className="subtle-caption text-emerald-300">{apiSuccess}</p> : null}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={saving || testingConnection}
                className="border-white/15 bg-white/6 hover:bg-white/14"
                onClick={() => void handleSaveAiSettings()}
              >
                {testingConnection ? "Testing..." : "Test and Save AI Settings"}
              </Button>
            </div>
          </div>

          <div className="frost-panel-soft space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Productivity</p>
                <p className="subtle-caption mt-1">Shortcuts + revision defaults.</p>
              </div>
              <Target className="size-4 text-muted-foreground" />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Enable Keyboard Shortcuts</p>
                <p className="subtle-caption mt-1">Global shortcuts for search, capture, and navigation.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.shortcutsEnabled}
                onChange={(event) => patchSettings({ shortcutsEnabled: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Delete Confirmation Dialog</p>
                <p className="subtle-caption mt-1">Show warning dialog before deleting words and translations.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.showDeleteConfirmation}
                onChange={(event) => patchSettings({ showDeleteConfirmation: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Hide To Tray On Close</p>
                <p className="subtle-caption mt-1">Closing the titlebar will hide Lexi instead of exiting.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.hideToTray}
                onChange={(event) => patchSettings({ hideToTray: event.target.checked })}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Launch At Startup</p>
                <p className="subtle-caption mt-1">Run Lexi automatically when you sign in.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.launchAtStartup}
                onChange={(event) => void handleLaunchAtStartupChange(event.target.checked)}
                className="size-4 accent-white"
                disabled={saving}
              />
            </div>

            <div className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">Start Minimized</p>
                <p className="subtle-caption mt-1">When launched at startup, open minimized instead of focused.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.startMinimized}
                onChange={(event) => void handleStartMinimizedChange(event.target.checked)}
                className="size-4 accent-white"
                disabled={saving || !settings.launchAtStartup}
              />
            </div>

            {startupError ? <p className="subtle-caption text-red-300">{startupError}</p> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="subtle-caption">Daily review goal</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  step={5}
                  value={settings.dailyReviewGoal}
                  onChange={(event) => patchSettings({ dailyReviewGoal: Number(event.target.value) || 20 })}
                  className="frost-input"
                  disabled={saving}
                />
              </div>

              <div className="space-y-1">
                <span className="subtle-caption">Default revision mode</span>
                <select
                  value={settings.defaultRevisionMode}
                  onChange={(event) => patchSettings({ defaultRevisionMode: event.target.value as RevisionMode })}
                  className="frost-input"
                  disabled={saving}
                >
                  {REVISION_MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.div}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="frost-panel-soft space-y-3 p-4">
            <div>
              <p className="font-medium">Books</p>
              <p className="subtle-caption mt-1">
                Add your own dictionary or translation book from a JSON file. It appears in the books catalog
                alongside the bundled ones.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/6 hover:bg-white/14"
              onClick={() => setImportBookOpen(true)}
            >
              <FileJson className="mr-2 size-4" />
              Import book file
            </Button>
          </div>

          <div className="frost-panel-soft space-y-3 p-4">
            <div>
              <p className="font-medium text-red-200">Danger Zone</p>
              <p className="subtle-caption mt-1">Completely reset all saved vocabulary and preferences.</p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={resetting}
              className="border-red-300/30 bg-red-900/20 text-red-100 hover:bg-red-900/35"
              onClick={handleResetData}
            >
              <RefreshCcw className="mr-2 size-4" />
              {resetting ? "Resetting..." : "Reset App Data"}
            </Button>
          </div>
        </div>
      </section>

      <section className="frost-panel flex min-h-[22rem] xl:min-h-0 flex-col overflow-hidden animate-slide-in-up">
        <div className="border-b border-white/10 p-5">
          <h2 className="section-title">System State</h2>
          <p className="subtle-caption mt-2">Runtime configuration and shortcut map.</p>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 space-y-2.5">
          <article className="frost-panel-soft p-3">
            <p className="subtle-caption">Theme</p>
            <p className="mt-1 font-medium capitalize">{theme}</p>
          </article>

          <article className="frost-panel-soft p-3">
            <p className="subtle-caption">AI Model</p>
            <p className="mt-1 font-medium">{settings.groqModel || GROQ_MODELS[0]}</p>
          </article>

          <article className="frost-panel-soft p-3">
            <p className="subtle-caption">Revision Defaults</p>
            <p className="mt-1 font-medium">{settings.defaultRevisionMode} • goal {settings.dailyReviewGoal}/day</p>
          </article>

          <article className="frost-panel-soft p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-medium">Keyboard Shortcuts</p>
              <Keyboard className="size-4 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-start justify-between gap-3 text-sm">
                  <code className="rounded bg-white/7 px-1.5 py-0.5 text-[0.78rem]">{shortcut.keys}</code>
                  <span className="subtle-caption text-right">{shortcut.action}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="frost-panel-soft p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Capture Ready</p>
              <Sparkles className="size-4 text-muted-foreground" />
            </div>
            <p className="subtle-caption mt-2">
              Settings are synchronized and applied to capture, review, and navigation workflows.
            </p>
          </article>
        </div>

        <div className="flex items-center justify-end border-t border-white/10 p-2">
          <span className="sync-pill">{saving ? "Saving..." : "All changes saved"}</span>
        </div>
      </section>

      <ImportBookDialog
        open={importBookOpen}
        onOpenChange={setImportBookOpen}
        onImport={importCustomSourceFromFile}
      />
    </div>
  );
}
