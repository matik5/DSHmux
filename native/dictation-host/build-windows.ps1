$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$WhisperDir = if ($env:WHISPER_CPP_DIR) { $env:WHISPER_CPP_DIR } else { Join-Path $HOME "proj\whisper.cpp" }
$BuildDir = if ($env:DICTATION_BUILD_DIR) { $env:DICTATION_BUILD_DIR } else { Join-Path $ScriptDir "build-windows" }
$RuntimeDir = Join-Path $RepoRoot "runtime\win32-x64"

$ConfigureArgs = @(
    "-S", $ScriptDir,
    "-B", $BuildDir,
    "-A", "x64",
    "-DWHISPER_CPP_DIR=$WhisperDir"
)
if ($env:SDL2_DIR) {
    $ConfigureArgs += "-DSDL2_DIR=$env:SDL2_DIR"
}

cmake @ConfigureArgs
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed with exit code $LASTEXITCODE" }
cmake --build $BuildDir --config Release --target dsh-dictation-host --parallel
if ($LASTEXITCODE -ne 0) { throw "CMake build failed with exit code $LASTEXITCODE" }

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Copy-Item (Join-Path $BuildDir "Release\dsh-dictation-host.exe") $RuntimeDir -Force

$SdlDll = Get-ChildItem -Path $BuildDir -Filter "SDL2.dll" -Recurse | Select-Object -First 1
if (-not $SdlDll -and $env:SDL2_DIR) {
    $SdlConfigParent = Split-Path -Parent $env:SDL2_DIR
    $SdlCandidates = @(
        (Join-Path $SdlConfigParent "lib\x64\SDL2.dll"),
        (Join-Path (Split-Path -Parent $SdlConfigParent) "bin\SDL2.dll")
    )
    $SdlDll = $SdlCandidates |
        ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue } |
        Select-Object -First 1
}
if ($SdlDll) {
    Copy-Item $SdlDll.FullName $RuntimeDir -Force
}

Write-Host "Built $(Join-Path $RuntimeDir 'dsh-dictation-host.exe')"
