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
