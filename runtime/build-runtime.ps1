<#
.SYNOPSIS
  Builds the .NET WebAssembly runtime bundle into public\dotnet\.

.DESCRIPTION
  Requires a .NET SDK (9 or newer) and the matching wasm-tools workload:

      dotnet workload install wasm-tools

  Run from the repository root:

      npm run build:runtime:win
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'runtime\DotNetCoder.Runner\DotNetCoder.Runner.csproj'
$tests   = Join-Path $root 'runtime\DotNetCoder.Runner.Tests'
$binRoot = Join-Path $root 'runtime\DotNetCoder.Runner\bin\Release'
$out     = Join-Path $root 'public\dotnet'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'The .NET SDK is not on PATH. Install it from https://dotnet.microsoft.com/download'
}

$sdkVersion = (dotnet --version | Select-Object -First 1).Trim()
$sdkMajor = [int]($sdkVersion.Split('.')[0])
if ($sdkMajor -lt 9) {
    throw "The .NET SDK $sdkVersion is too old; version 9 or newer is required."
}

# Build for whatever SDK is installed rather than a pinned version. MSBuild
# picks environment variables up as properties, and runtime\Directory.Build.props
# only supplies its default when this is unset.
if (-not $env:DotNetCoderTargetFramework) {
    $env:DotNetCoderTargetFramework = "net$sdkMajor.0"
}

Write-Host "==> dotnet --version: $sdkVersion  (targeting $env:DotNetCoderTargetFramework)"

$workloads = dotnet workload list 2>$null | Out-String
if ($workloads -notmatch 'wasm-tools') {
    throw "The 'wasm-tools' workload is not installed. Run:  dotnet workload install wasm-tools"
}

Write-Host '==> Testing the compiler core on desktop .NET'
dotnet run --project $tests -c Release
if ($LASTEXITCODE -ne 0) { throw "Runner tests failed (exit $LASTEXITCODE)." }

Write-Host '==> Publishing the runner for browser-wasm'
dotnet publish $project -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)." }

# The SDK has moved this folder between releases (AppBundle, publish\wwwroot),
# so locate it by what it contains rather than by name.
Write-Host '==> Locating the published bundle'
$candidates = @(
    Get-ChildItem -Path $binRoot -Recurse -File -Filter 'dotnet.js' -ErrorAction SilentlyContinue |
        Where-Object { $_.Directory.Name -eq '_framework' } |
        ForEach-Object { $_.Directory.Parent.FullName } |
        Sort-Object -Unique
)

if ($candidates.Count -eq 0) {
    throw "No _framework\dotnet.js was produced under $binRoot. Check the publish output above for the real failure."
}

$bundle = $candidates | Where-Object { $_ -match 'AppBundle|publish' } | Select-Object -First 1
if (-not $bundle) { $bundle = $candidates[0] }

Write-Host "==> Copying $bundle -> $out"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out -Force | Out-Null
Copy-Item -Path (Join-Path $bundle '*') -Destination $out -Recurse -Force

if (-not (Test-Path (Join-Path $out '_framework\dotnet.js'))) {
    throw "The copy did not produce $out\_framework\dotnet.js. The published layout was not what this script expected; inspect $bundle."
}

Write-Host '==> Generating references.json'
node (Join-Path $root 'scripts\make-references.mjs') $out
if ($LASTEXITCODE -ne 0) { throw "make-references failed (exit $LASTEXITCODE)." }

Write-Host '==> Runtime bundle ready in public\dotnet\'
