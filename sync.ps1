[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
	[Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
	[string[]]$Paths
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Resolve-SpernakitPath {
	param(
		[Parameter(Mandatory = $true)]
		[string]$InputPath,
		[Parameter(Mandatory = $true)]
		[string]$SpernakitRoot
	)

	$resolvedPath = $null
	if ([System.IO.Path]::IsPathRooted($InputPath)) {
		$resolvedPath = (Resolve-Path -LiteralPath $InputPath).Path
	} else {
		$resolvedPath = (Resolve-Path -LiteralPath (Join-Path $SpernakitRoot $InputPath)).Path
	}

	$resolvedSpernakitRoot = (Resolve-Path -LiteralPath $SpernakitRoot).Path

	if (-not ($resolvedPath.ToLowerInvariant().StartsWith($resolvedSpernakitRoot.ToLowerInvariant()))) {
		throw "Path must be within Spernakit root: '$resolvedSpernakitRoot'. Got: '$resolvedPath'"
	}

	$relativePath = [System.IO.Path]::GetRelativePath($resolvedSpernakitRoot, $resolvedPath)
	return [PSCustomObject]@{
		ResolvedPath = $resolvedPath
		RelativePath = $relativePath
	}
}

$spernakitRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $spernakitRoot
$localOnlyTemplateFiles = @(
	'changes.ps1',
	'init.ps1',
	'reset.ps1',
	'run.ps1',
	'spernakit.psd1',
	'sync.ps1'
)

$psd1Path = Join-Path $spernakitRoot 'spernakit.psd1'
if (-not (Test-Path -LiteralPath $psd1Path)) {
	throw "Missing spernakit.psd1 at: $psd1Path"
}

$config = Import-PowerShellDataFile -LiteralPath $psd1Path
if (-not $config.ContainsKey('ExpectedConfigs')) {
	throw 'spernakit.psd1 missing ExpectedConfigs'
}

$derivedApps = @($config.ExpectedConfigs.Keys | Where-Object { $_ -ne 'spernakit' } | Sort-Object)
if ($derivedApps.Count -lt 1) {
	throw 'No derived applications found in spernakit/spernakit.psd1'
}

$resolvedSources = foreach ($inputPath in $Paths) {
	Resolve-SpernakitPath -InputPath $inputPath -SpernakitRoot $spernakitRoot
}

foreach ($source in $resolvedSources) {
	if ($localOnlyTemplateFiles -contains $source.RelativePath) {
		throw "Refusing to sync local Spernakit tooling file: $($source.RelativePath)"
	}

	if (-not (Test-Path -LiteralPath $source.ResolvedPath -PathType Leaf)) {
		throw "Source file not found (or not a file): $($source.ResolvedPath)"
	}

	foreach ($appSlug in $derivedApps) {
		$destRepoRoot = Join-Path $repoRoot $appSlug
		if (-not (Test-Path -LiteralPath $destRepoRoot -PathType Container)) {
			Write-Warning "Skipping missing derived repo folder: $destRepoRoot"
			continue
		}

		$destPath = Join-Path $destRepoRoot $source.RelativePath
		$destDir = Split-Path -Parent $destPath

		if (-not (Test-Path -LiteralPath $destDir -PathType Container)) {
			if ($PSCmdlet.ShouldProcess($destDir, 'Create directory')) {
				New-Item -ItemType Directory -Path $destDir -Force | Out-Null
			}
		}

		if ($PSCmdlet.ShouldProcess($destPath, "Copy '$($source.RelativePath)' to $appSlug")) {
			Copy-Item -LiteralPath $source.ResolvedPath -Destination $destPath -Force
		}
	}
}
