[CmdletBinding()]
param(
    [string]$VaultPath = "C:\Users\josef\Documents\2nd brain v7",
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resolvedVault = (Resolve-Path -LiteralPath $VaultPath -ErrorAction Stop).Path
$obsidianDir = Join-Path $resolvedVault '.obsidian'

if (-not (Test-Path -LiteralPath $obsidianDir -PathType Container)) {
    throw "The supplied path is not an initialized Obsidian vault: $resolvedVault"
}

if (-not $SkipBuild) {
    Push-Location -LiteralPath $repoRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Production build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$pluginDir = Join-Path $obsidianDir 'plugins\gtd-matrix-tasks'
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

$artifacts = @('main.js', 'manifest.json', 'styles.css')
foreach ($artifact in $artifacts) {
    $source = Join-Path $repoRoot $artifact
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required plugin artifact is missing: $source"
    }

    Copy-Item -LiteralPath $source -Destination (Join-Path $pluginDir $artifact) -Force
}

Write-Output "Successfully deployed GTD Matrix Tasks to $pluginDir"
