<#
.SYNOPSIS
	Initialize a new application from the spernakit template (thin wrapper around scripts/init.ts).

.DESCRIPTION
	Delegates to the cross-platform generator at scripts/init.ts. This wrapper exists only for
	backward compatibility with the historical CLI and the sibling-directory convention (the app is
	created as a sibling of the spernakit/ folder). The generator itself is pure Bun/Node and runs on
	any OS — new work should call `bun scripts/init.ts --application <slug> --target <dir>` directly.

	Registration in spernakit.psd1 and port assignment are now handled by init.ts automatically; the
	-Force switch maps to init.ts's --force (replace a non-empty target).

.PARAMETER Application
	The application slug.

.PARAMETER Description
	Description for the application.

.PARAMETER Force
	Replace the target directory if it already exists and is not empty.

.EXAMPLE
	.\spernakit\init.ps1 -Application 'myapp' -Description 'My awesome app'
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$Application,
	[string]$Description,
	[switch]$Force
)

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$WorkspaceDir = Split-Path -Parent $ScriptDir
$TargetDir = Join-Path $WorkspaceDir $Application

$initArgs = @(
	(Join-Path $ScriptDir 'scripts/init.ts')
	'--application', $Application
	'--target', $TargetDir
)
if ($Description) { $initArgs += @('--description', $Description) }
if ($Force) { $initArgs += '--force' }

& bun @initArgs
exit $LASTEXITCODE
