"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

const values = { dshmux: {}, deepseekHarness: {} };
const fakeVscode = {
  workspace: {
    getConfiguration(namespace) {
      return {
        inspect(key) {
          const value = values[namespace]?.[key];
          return value === undefined ? undefined : { key: `${namespace}.${key}`, globalValue: value };
        },
        get(key, defaultValue) {
          return values[namespace]?.[key] ?? defaultValue;
        },
      };
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, _parent, _isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.apply(this, arguments);
};

const {
  affectsDshmuxConfiguration,
  affectsAnySoundSetting,
  affectsLocalDictationSetting,
  configuredDshBin,
  dshmuxConfiguration,
  localDictationSettings,
  soundSettings,
} = require("../out/configuration.js");

test.after(() => {
  Module._load = originalLoad;
});

test.beforeEach(() => {
  values.dshmux = {};
  values.deepseekHarness = {};
});

test("renamed configuration falls back to an explicit legacy value", () => {
  values.deepseekHarness.completionSound = false;
  assert.equal(dshmuxConfiguration("completionSound", true), false);
});

test("an explicit DSHmux value wins over the legacy value", () => {
  values.dshmux.completionSound = true;
  values.deepseekHarness.completionSound = false;
  assert.equal(dshmuxConfiguration("completionSound", false), true);
});

test("configured DSH binary trims the setting and enables discovery when blank", () => {
  assert.equal(configuredDshBin(), undefined);
  values.dshmux.dshPath = "  /custom/bin/dsh  ";
  assert.equal(configuredDshBin(), "/custom/bin/dsh");
});

test("configuration change matching accepts current and legacy keys", () => {
  const current = { affectsConfiguration: (key) => key === "dshmux.completionSound" };
  const legacy = { affectsConfiguration: (key) => key === "deepseekHarness.completionSound" };
  assert.equal(affectsDshmuxConfiguration(current, "completionSound"), true);
  assert.equal(affectsDshmuxConfiguration(legacy, "completionSound"), true);
});

test("soundSettings reads all four toggles, defaulting to on", () => {
  assert.deepEqual(soundSettings(), {
    completionSound: true,
    soundStart: true,
    soundDone: true,
    soundAsk: true,
  });
  values.dshmux.completionSound = false;
  values.dshmux.soundStart = false;
  assert.deepEqual(soundSettings(), {
    completionSound: false,
    soundStart: false,
    soundDone: true,
    soundAsk: true,
  });
});

test("soundSettings falls back to legacy keys", () => {
  values.deepseekHarness.soundDone = false;
  assert.equal(soundSettings().soundDone, false);
});

test("affectsAnySoundSetting matches any of the four sound keys", () => {
  const ask = { affectsConfiguration: (key) => key === "dshmux.soundAsk" };
  const master = { affectsConfiguration: (key) => key === "dshmux.completionSound" };
  const other = { affectsConfiguration: (key) => key === "dshmux.frameFontScale" };
  assert.equal(affectsAnySoundSetting(ask), true);
  assert.equal(affectsAnySoundSetting(master), true);
  assert.equal(affectsAnySoundSetting(other), false);
});

test("local dictation is disabled and local-only by default", () => {
  assert.deepEqual(localDictationSettings(), {
    enabled: false,
    language: "en-US",
    ffmpegPath: "",
    whisperPath: "",
    modelPath: "",
    audioDevice: "",
  });
});

test("local dictation settings trim paths and constrain the language", () => {
  values.dshmux["experimental.localDictation.enabled"] = true;
  values.dshmux["experimental.localDictation.language"] = "et-EE";
  values.dshmux["experimental.localDictation.ffmpegPath"] = "  /opt/ffmpeg  ";
  values.dshmux["experimental.localDictation.whisperPath"] = "  /opt/whisper-cli  ";
  values.dshmux["experimental.localDictation.modelPath"] = "  /models/turbo.bin  ";
  values.dshmux["experimental.localDictation.audioDevice"] = "  Mic  ";
  assert.deepEqual(localDictationSettings(), {
    enabled: true,
    language: "et-EE",
    ffmpegPath: "/opt/ffmpeg",
    whisperPath: "/opt/whisper-cli",
    modelPath: "/models/turbo.bin",
    audioDevice: "Mic",
  });
  values.dshmux["experimental.localDictation.language"] = "unsupported";
  assert.equal(localDictationSettings().language, "en-US");
});

test("local dictation setting changes are matched as one prefix", () => {
  const matching = {
    affectsConfiguration: (key) => key === "dshmux.experimental.localDictation",
  };
  const other = { affectsConfiguration: () => false };
  assert.equal(affectsLocalDictationSetting(matching), true);
  assert.equal(affectsLocalDictationSetting(other), false);
});
