<#
.SYNOPSIS
    Run bun commands across multiple project directories.

.DESCRIPTION
    Executes bun commands (build, fix, format, install, docker:up, docker:down) across specified project directories.
    Defaults to every app registered in spernakit.psd1 (its ExpectedConfigs keys).

.PARAMETER Action
    The bun command(s) to run. Any valid package.json script name.
    Can be a single action or multiple comma-separated actions (e.g., "fix,format").
    - All actions map directly to 'bun run <action>'
    - Examples: build, fix, format, install, docker:up, docker:down, smoke:qc, qc, reset, test

.PARAMETER Dirs
    Array of directory names to process. Defaults to all apps registered in spernakit.psd1.
    Can be a single directory name or an array of directory names.

.PARAMETER Quiet
    Does absolutely nothing.

.PARAMETER ContinueOnFail
    Continue executing remaining actions even if some fail. By default, execution stops on first failure.

.EXAMPLE
    spk-run -Action format
    Runs 'bun run format' in all default directories with full output.

.EXAMPLE
    spk-run -Action fix -Dirs spernakit
    Runs 'bun run lint:fix' only in the spernakit directory.

.EXAMPLE
    spk-run -Action qc
    Runs quality check (lint, format, build) across all apps.

.EXAMPLE
    spk-run reset spernakit
    Runs full reset on spernakit only (positional parameters).

.EXAMPLE
    spk-run -Action fix,format -Dirs spernakit,myapp
    Runs both 'fix' and 'format' actions on spernakit and myapp directories.

.EXAMPLE
    spk-run -Action fix,format -Dirs spernakit,myapp -ContinueOnFail
    Runs both 'fix' and 'format' actions on spernakit and myapp directories, continuing even if some fail.
#>

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string[]]$Action,

	[Parameter(Position = 1)]
	[string[]]$Dirs = @(),

	[Parameter()]
	[switch]$Quiet,

	[Parameter()]
	[switch]$ContinueOnFail
)

# detect if running powershell 5
if ($PSVersionTable.PSVersion.Major -lt 7) {
	Write-Error 'This script requires PowerShell 7 or later. Run as `pwsh.exe run.ps1` instead of `powershell.exe run.ps1`.'
	exit 1
}

# Store the base directory
$baseDir = Split-Path -Parent $PSScriptRoot

# Validate base directory exists
if (-not (Test-Path $baseDir)) {
	Write-Error "Base directory not found: $baseDir"
	exit 1
}

# Load app list from spernakit.psd1
$spernakitConfigPath = Join-Path $PSScriptRoot 'spernakit.psd1'
if (-not (Test-Path $spernakitConfigPath)) {
	Write-Error "Configuration file not found: $spernakitConfigPath"
	exit 1
}

try {
	$spernakitConfig = Import-PowerShellDataFile -Path $spernakitConfigPath
	$expectedConfigs = $spernakitConfig.ExpectedConfigs
	if (-not $expectedConfigs) {
		Write-Error 'ExpectedConfigs not found in spernakit.psd1'
		exit 1
	}

	$defaultDirs = @($expectedConfigs.Keys | Sort-Object)
	if (-not $defaultDirs -or $defaultDirs.Count -eq 0) {
		Write-Error 'No apps found in spernakit.psd1 ExpectedConfigs'
		exit 1
	}
} catch {
	Write-Error "Failed to load spernakit.psd1: $_"
	exit 1
}

# Use default directories if none specified
if ($Dirs.Count -eq 0) {
	$Dirs = $defaultDirs
}

# Validate environment
Write-Host "`nValidating environment..." -ForegroundColor Gray

# Check if bun is installed
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
	Write-Error 'Bun is not installed or not in PATH'
	exit 1
}

# Validate all directories exist before starting
$missingDirs = $Dirs | Where-Object { -not (Test-Path (Join-Path $baseDir $_)) }
if ($missingDirs) {
	Write-Warning "Missing directories: $($missingDirs -join ', ')"
}

Write-Host 'Environment validation passed' -ForegroundColor Green

# Initialize overall tracking variables
$overallStartTime = Get-Date
$globalFailCount = 0

# Process each action
foreach ($currentAction in $Action) {
	# Direct 1:1 mapping - action name becomes bun run command
	$bunCommand = "bun run $currentAction"


	# Display header
	Write-Host "`n========================================" -ForegroundColor Cyan
	Write-Host "Running: $bunCommand" -ForegroundColor Cyan
	Write-Host "Directories: $($Dirs -join ', ')" -ForegroundColor Cyan
	Write-Host "========================================`n" -ForegroundColor Cyan

	# Track results and timing
	$results = @()
	$successCount = 0
	$failCount = 0
	$startTime = Get-Date

	# Process each directory
	foreach ($dir in $Dirs) {
		$dirPath = Join-Path $baseDir $dir

		# Check if directory exists
		if (-not (Test-Path $dirPath)) {
			Write-Warning "Directory not found: $dir (skipping)"
			$results += [PSCustomObject]@{
				Directory = $dir
				Status    = 'SKIPPED'
				Message   = 'Directory not found'
			}
			continue
		}

		# Resolve junction/symlink to actual target path
		$item = Get-Item $dirPath
		if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
			$dirPath = $item.Target
			Write-Host "`n--- Processing: $dir (resolved to $dirPath) ---" -ForegroundColor Yellow
		} else {
			Write-Host "`n--- Processing: $dir ---" -ForegroundColor Yellow
		}

		try {
			# Change to directory
			Push-Location $dirPath

			# Execute bun command
			Write-Host "Executing: $bunCommand" -ForegroundColor Gray
			Write-Host '' # Blank line before output

			# Every action is `bun run <script>`, so invoke bun directly. The old split that sent
			# smoke:*/qc/reset/test through Invoke-Expression existed only while those scripts were
			# PowerShell; they are Bun TypeScript now, and the cmd shim the other branch used buys
			# nothing but an extra process.
			& bun run $currentAction
			$exitCode = $LASTEXITCODE

			if ($exitCode -eq 0) {
				Write-Host "Success: $dir" -ForegroundColor Green
				$results += [PSCustomObject]@{
					Directory = $dir
					Status    = 'SUCCESS'
					Message   = 'Command completed successfully'
				}
				$successCount++
			} else {
				Write-Host "Failed: $dir (exit code: $exitCode)" -ForegroundColor Red
				$results += [PSCustomObject]@{
					Directory = $dir
					Status    = 'FAILED'
					Message   = "Exit code: $exitCode"
				}
				$failCount++
			}
		} catch {
			Write-Host "Error: $dir - $_" -ForegroundColor Red
			$results += [PSCustomObject]@{
				Directory = $dir
				Status    = 'ERROR'
				Message   = $_.Exception.Message
			}
			$failCount++
		} finally {
			# Return to base directory
			Pop-Location
		}
	}

	# Calculate execution time
	$duration = (Get-Date) - $startTime

	# Display summary
	Write-Host "`n========================================" -ForegroundColor Cyan
	Write-Host 'Summary' -ForegroundColor Cyan
	Write-Host '======================================== ' -ForegroundColor Cyan
	Write-Host "Total directories: $($Dirs.Count)" -ForegroundColor White
	Write-Host "Successful: $successCount" -ForegroundColor Green
	Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { 'Red' } else { 'White' })
	Write-Host "Execution time: $($duration.ToString('mm\:ss'))" -ForegroundColor Cyan

	# Display detailed results
	Write-Host "`nDetailed Results:" -ForegroundColor Cyan
	$results | Format-Table -AutoSize

	# Update global fail count
	if ($failCount -gt 0) {
		$globalFailCount += $failCount
	}

	# Stop on failure unless ContinueOnFail is specified
	if ($failCount -gt 0 -and -not $ContinueOnFail) {
		Write-Host "`nStopping execution due to failures. Use -ContinueOnFail to continue despite failures." -ForegroundColor Yellow
		break
	}
}

# Calculate overall execution time
$overallDuration = (Get-Date) - $overallStartTime

# Display overall summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host 'Overall Summary' -ForegroundColor Cyan
Write-Host '======================================== ' -ForegroundColor Cyan
Write-Host "Total actions executed: $($Action.Count)" -ForegroundColor White
Write-Host "Overall execution time: $($overallDuration.ToString('mm\:ss'))" -ForegroundColor Cyan

# Exit with appropriate code
if ($globalFailCount -gt 0) {
	Write-Host "`nSome operations failed!" -ForegroundColor Red
	exit 1
} else {
	Write-Host "`nAll operations completed successfully!" -ForegroundColor Green
	exit 0
}
