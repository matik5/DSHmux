import * as vscode from "vscode";

const CONFIG_NAMESPACE = "dshmux";
const LEGACY_CONFIG_NAMESPACE = "deepseekHarness";

interface ConfigurationValues<T> {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;
}

function hasExplicitValue<T>(value: ConfigurationValues<T> | undefined): boolean {
  if (!value) return false;
  return [
    value.globalValue,
    value.workspaceValue,
    value.workspaceFolderValue,
    value.globalLanguageValue,
    value.workspaceLanguageValue,
    value.workspaceFolderLanguageValue,
  ].some((candidate) => candidate !== undefined);
}

/** Read the renamed setting, falling back to an explicitly configured legacy value. */
export function dshmuxConfiguration<T>(key: string, defaultValue: T): T {
  const current = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  if (hasExplicitValue(current.inspect<T>(key))) return current.get<T>(key, defaultValue);
  return vscode.workspace
    .getConfiguration(LEGACY_CONFIG_NAMESPACE)
    .get<T>(key, defaultValue);
}

/** Configured DSH executable, or undefined when automatic discovery is enabled. */
export function configuredDshBin(): string | undefined {
  const value = dshmuxConfiguration("dshPath", "").trim();
  return value || undefined;
}

/** Match both the current key and its pre-DSHmux compatibility key. */
export function affectsDshmuxConfiguration(
  event: vscode.ConfigurationChangeEvent,
  key: string
): boolean {
  return (
    event.affectsConfiguration(`${CONFIG_NAMESPACE}.${key}`) ||
    event.affectsConfiguration(`${LEGACY_CONFIG_NAMESPACE}.${key}`)
  );
}

/** The four sound settings: the master toggle plus one per sound kind. */
export interface SoundSettings {
  completionSound: boolean;
  soundStart: boolean;
  soundDone: boolean;
  soundAsk: boolean;
}

const SOUND_SETTING_KEYS = ["completionSound", "soundStart", "soundDone", "soundAsk"] as const;

/** Read all four sound settings (each defaults to on). */
export function soundSettings(): SoundSettings {
  return {
    completionSound: dshmuxConfiguration("completionSound", true),
    soundStart: dshmuxConfiguration("soundStart", true),
    soundDone: dshmuxConfiguration("soundDone", true),
    soundAsk: dshmuxConfiguration("soundAsk", true),
  };
}

/** True when the event touches any of the four sound settings. */
export function affectsAnySoundSetting(event: vscode.ConfigurationChangeEvent): boolean {
  return SOUND_SETTING_KEYS.some((key) => affectsDshmuxConfiguration(event, key));
}
