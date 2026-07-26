[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[ValidateNotNullOrEmpty()]
	[string]$Path
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

try {
	$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
	$manifest = Import-PowerShellDataFile -LiteralPath $resolvedPath
	$manifest | ConvertTo-Json -Compress -Depth 6
} catch {
	Write-Error "Unable to read fleet manifest '$Path': $($_.Exception.Message)"
	exit 1
}
