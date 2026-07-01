<#
.SYNOPSIS
	Initialize a new application from the spernakit template.

.DESCRIPTION
	Creates a new application directory from the spernakit template,
	configures it with app-specific settings, installs dependencies,
	and initializes a git repository.

.PARAMETER Application
	The application slug.

.PARAMETER Force
	Add a missing application to spernakit/spernakit.psd1 before initialization.

.PARAMETER Description
	Description for the application. Required when using -Force.

.EXAMPLE
	.\spernakit\init.ps1 -Application 'myapp' -Force -Description 'My awesome app'

#>

[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$Application,
	[string]$Description,
	[switch]$Force
)

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
$ScriptDir = $PSScriptRoot
$WorkspaceDir = Split-Path -Parent $ScriptDir
$ConfigFile = Join-Path $ScriptDir 'spernakit.psd1'
$ConfigExampleFile = Join-Path $ScriptDir 'spernakit.psd1.example'
$TemplateDir = $ScriptDir
$TargetDir = Join-Path $WorkspaceDir $Application

# Tracks whether this run added a registry entry via -Force, so a later failure
# can roll it back instead of leaving an orphan in spernakit/spernakit.psd1.
$RegistryEntryAdded = $false

# Exclusions for robocopy
$ExcludeDirs = @(
	'.aidd'
	'.claude'
	'.git'
	'.windsurf'
	'data'
	'dist'
	'internal'
	'logs'
	'node_modules'
	'screenshots'
	'spernakit-browser'
	'testing'
	'upgrade-review'
)

$ExcludeFiles = @(
	'smoke-cache.json'
	'*.db-journal'
	'*.db-wal'
	'*.db'
	'backups'
	'bun.lock'
	'bun.lockb'
	'changes.ps1'
	'init.ps1'
	'reset.ps1'
	'run.ps1'
	'sb.ts'
	'spernakit.psd1'
	'spernakit.json'
	'sync.ps1'
)

# -----------------------------------------------------------------------------
# Functions
# -----------------------------------------------------------------------------

function Write-Step {
	param([string]$Message)
	Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
	param([string]$Message)
	Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Failure {
	param([string]$Message)
	Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Invoke-Command-Checked {
	param(
		[string]$WorkingDir,
		[string]$Executable,
		[string[]]$Arguments,
		[string]$Description,
		[switch]$AllowFailure
	)

	Write-Host "  Running: $Description" -ForegroundColor Gray

	Push-Location $WorkingDir
	try {
		$output = & $Executable @Arguments 2>&1
		if ($LASTEXITCODE -ne 0) {
			if ($AllowFailure) {
				Write-Host "[WARN] $Description failed (exit code $LASTEXITCODE) - continuing anyway" -ForegroundColor Yellow
			}
			else {
				Write-Failure "Command failed with exit code $LASTEXITCODE"
				Write-Host $output -ForegroundColor Yellow
				throw "Command failed: $Executable $($Arguments -join ' ')"
			}
		}
		else {
			Write-Success $Description
		}
	}
	finally {
		Pop-Location
	}
}

function ConvertTo-DefaultAppName {
	param([string]$Slug)

	return (($Slug -split '[-_]') | Where-Object { $_ } | ForEach-Object {
		if ($_.Length -le 1) {
			$_.ToUpperInvariant()
		}
		else {
			$_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1)
		}
	}) -join ' '
}

function Get-NextAppPortPair {
	param([hashtable]$ExpectedConfigs)

	$usedPorts = [System.Collections.Generic.HashSet[int]]::new()
	foreach ($key in $ExpectedConfigs.Keys) {
		$app = $ExpectedConfigs[$key]
		if ($app.frontendPort) { [void]$usedPorts.Add([int]$app.frontendPort) }
		if ($app.backendPort) { [void]$usedPorts.Add([int]$app.backendPort) }
	}

	for ($frontendPort = 3340; $frontendPort -lt 9000; $frontendPort += 10) {
		$backendPort = $frontendPort + 1
		if (-not $usedPorts.Contains($frontendPort) -and -not $usedPorts.Contains($backendPort)) {
			return @{
				frontendPort = $frontendPort
				backendPort  = $backendPort
			}
		}
	}

	throw 'No free Spernakit port pair found between 3340 and 8991'
}

function Add-SpernakitRegistryEntry {
	param(
		[string]$FilePath,
		[hashtable]$Config,
		[string]$Slug,
		[Parameter(Mandatory = $true)]
		[string]$Description
	)

	$ports = Get-NextAppPortPair -ExpectedConfigs $Config.ExpectedConfigs
	$templateVersion = $Config.ExpectedConfigs['spernakit'].version
	if (-not $templateVersion) {
		$templateVersion = 'latest'
	}

	$appName = ConvertTo-DefaultAppName -Slug $Slug
	$entry = @"
		'$Slug'        = @{
			frontendPort      = $($ports.frontendPort)
			backendPort       = $($ports.backendPort)
			appName           = '$($appName -replace "'", "''")'
			description       = '$($Description -replace "'", "''")'
			version           = '0.1.0'
			spernakit_version = '$templateVersion'
		}
"@

	$content = Get-Content -Path $FilePath -Raw
	$pattern = "(?s)(\r?\n\t}\r?\n})\s*$"
	if (-not [regex]::IsMatch($content, $pattern)) {
		throw "Unable to find ExpectedConfigs closing block in $FilePath"
	}

	$newContent = [regex]::Replace($content, $pattern, "`r`n$entry`$1", 1)
	Set-Content -Path $FilePath -Value $newContent -NoNewline

	return @{
		appName           = $appName
		description       = $Description
		version           = '0.1.0'
		frontendPort      = $ports.frontendPort
		backendPort       = $ports.backendPort
		spernakit_version = $templateVersion
	}
}

function Remove-SpernakitRegistryEntry {
	param(
		[string]$FilePath,
		[string]$Slug
	)

	$content = Get-Content -Path $FilePath -Raw
	$escaped = [regex]::Escape($Slug)
	# Match the whole entry block: leading newline + 2-tab '<slug>' = @{ ... } closing brace.
	$pattern = "(?s)\r?\n\t\t'$escaped'\s*=\s*@\{.*?\r?\n\t\t}"
	if (-not [regex]::IsMatch($content, $pattern)) {
		return $false
	}

	$newContent = [regex]::Replace($content, $pattern, '', 1)
	Set-Content -Path $FilePath -Value $newContent -NoNewline
	return $true
}

function Invoke-RegistryRollback {
	param(
		[bool]$Added,
		[string]$FilePath,
		[string]$Slug
	)

	if (-not $Added) {
		return
	}

	Write-Host "  Rolling back registry entry for '$Slug'..." -ForegroundColor Yellow
	if (Remove-SpernakitRegistryEntry -FilePath $FilePath -Slug $Slug) {
		Write-Success "Removed registry entry for '$Slug'"
	}
	else {
		Write-Failure "Could not find registry entry for '$Slug' to roll back (remove it manually from $FilePath)"
	}
}

# -----------------------------------------------------------------------------
# Failure handling
# -----------------------------------------------------------------------------

# Any terminating error past this point rolls back a -Force registry add before
# exiting, so a failed init never leaves an orphan entry in spernakit/spernakit.psd1.
trap {
	Write-Failure $_.Exception.Message
	Invoke-RegistryRollback -Added $RegistryEntryAdded -FilePath $ConfigFile -Slug $Application
	exit 1
}

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------

Write-Host "`n=====================================================" -ForegroundColor White
Write-Host "   Spernakit Application Initializer" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor White

# Check config file exists. On a fresh clone only the tracked example ships
# (the real spernakit.psd1 is gitignored), so seed it from the example.
if (-not (Test-Path $ConfigFile)) {
	if (Test-Path $ConfigExampleFile) {
		Write-Step "No spernakit.psd1 found; creating one from spernakit.psd1.example"
		Copy-Item -LiteralPath $ConfigExampleFile -Destination $ConfigFile
		Write-Success "Created spernakit/spernakit.psd1 from the example manifest"
		Write-Host "  Edit spernakit/spernakit.psd1 to register your apps." -ForegroundColor Gray
	}
	else {
		Write-Failure "Config file not found: $ConfigFile (and no spernakit.psd1.example to seed it)"
		exit 1
	}
}

# Load config
Write-Step "Loading configuration from spernakit/spernakit.psd1"
$Config = Import-PowerShellDataFile $ConfigFile

# Check application exists in config
if (-not $Config.ExpectedConfigs.ContainsKey($Application)) {
	if ($Force) {
		if (-not $Description) {
			Write-Failure "-Description is required when using -Force to add a new application"
			Write-Host "  Usage: .\spernakit\init.ps1 -Application '$Application' -Force -Description 'Your app description'" -ForegroundColor Yellow
			exit 1
		}
		Write-Step "Adding '$Application' to spernakit/spernakit.psd1"
		$AppConfig = Add-SpernakitRegistryEntry -FilePath $ConfigFile -Config $Config -Slug $Application -Description $Description
		$RegistryEntryAdded = $true
		$Config = Import-PowerShellDataFile $ConfigFile
		Write-Success "Added registry entry for '$Application'"
	}
	else {
	Write-Failure "Application '$Application' not found in spernakit/spernakit.psd1"
	Write-Host "`nAvailable applications:" -ForegroundColor Yellow
	$Config.ExpectedConfigs.Keys | Sort-Object | ForEach-Object {
		Write-Host "  - $_" -ForegroundColor Gray
	}
	exit 1
	}
}

$AppConfig = $Config.ExpectedConfigs[$Application]
Write-Success "Found configuration for '$Application'"
Write-Host "  Name:         $($AppConfig.appName)" -ForegroundColor Gray
Write-Host "  Description:  $($AppConfig.description)" -ForegroundColor Gray
Write-Host "  Version:      $($AppConfig.version)" -ForegroundColor Gray
Write-Host "  Frontend:     $($AppConfig.frontendPort)" -ForegroundColor Gray
Write-Host "  Backend:      $($AppConfig.backendPort)" -ForegroundColor Gray

# Check template exists
if (-not (Test-Path $TemplateDir)) {
	throw "Template directory not found: $TemplateDir"
}

# -----------------------------------------------------------------------------
# Directory Setup
# -----------------------------------------------------------------------------

Write-Step "Setting up target directory: $TargetDir"

if (Test-Path $TargetDir) {
	Write-Host "  Directory already exists: $TargetDir" -ForegroundColor Yellow
	$confirmation = Read-Host "  Delete and recreate? (y/N)"

	if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
		Write-Host "  Aborted by user" -ForegroundColor Yellow
		Invoke-RegistryRollback -Added $RegistryEntryAdded -FilePath $ConfigFile -Slug $Application
		exit 0
	}

	Write-Host "  Removing existing directory..." -ForegroundColor Gray
	Remove-Item -Path $TargetDir -Recurse -Force
}

# -----------------------------------------------------------------------------
# Copy Template
# -----------------------------------------------------------------------------

Write-Step "Copying spernakit template to $Application"

# Build robocopy exclusion arguments
$excludeDirArgs = $ExcludeDirs | ForEach-Object { "/XD", $_ }
$excludeFileArgs = $ExcludeFiles | ForEach-Object { "/XF", $_ }

# Use robocopy for efficient copying with exclusions
$robocopyArgs = @(
	$TemplateDir
	$TargetDir
	'/E'           # Copy subdirectories including empty ones
	'/NFL'         # No file list
	'/NDL'         # No directory list
	'/NJH'         # No job header
	'/NJS'         # No job summary
	'/NC'          # No class
	'/NS'          # No size
	'/NP'          # No progress
) + $excludeDirArgs + $excludeFileArgs

# Capture robocopy's own output so a failure is self-diagnosing. The suppression
# flags above silence routine progress, but robocopy still emits ERROR lines
# (access denied, path-too-long, locked files) that explain a >=8 exit.
$robocopyOutput = & robocopy @robocopyArgs 2>&1

# Robocopy exit codes: 0-7 are success, 8+ are errors
if ($LASTEXITCODE -ge 8) {
	Write-Failure "Robocopy failed with exit code $LASTEXITCODE"
	if ($robocopyOutput) {
		Write-Host "  --- robocopy output ---" -ForegroundColor Yellow
		Write-Host (($robocopyOutput | Out-String).TrimEnd()) -ForegroundColor Yellow
		Write-Host "  -----------------------" -ForegroundColor Yellow
	}
	throw "Robocopy failed with exit code $LASTEXITCODE"
}

Write-Success "Template copied successfully"

# -----------------------------------------------------------------------------
# Install Dependencies
# -----------------------------------------------------------------------------

Write-Step "Installing dependencies (pre-setup)"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('i') -Description 'bun install'

# -----------------------------------------------------------------------------
# Run Setup Script
# -----------------------------------------------------------------------------

Write-Step "Configuring application"

# Arguments passed as a discrete array — & invokes with native argv passing, so
# quotes/metacharacters in slug/name/description are inert (no injection, no escaping).
$setupArgs = @(
	'run', 'setup'
	'--slug', $Application
	'--name', $AppConfig.appName
	'--description', $AppConfig.description
	'--frontend-port', $AppConfig.frontendPort
	'--backend-port', $AppConfig.backendPort
	'--version', $AppConfig.version
)

# Setup may return non-zero even when successful (due to check-application exit codes)
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments $setupArgs -Description 'bun run setup' -AllowFailure

# -----------------------------------------------------------------------------
# Initialize Database
# -----------------------------------------------------------------------------

Write-Step "Initializing database (migrate + seed)"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('run', 'db:migrate') -Description 'db:migrate'
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('run', '--cwd', 'backend', 'db:seed') -Description 'db:seed'

# -----------------------------------------------------------------------------
# Update Dependencies & Quality Check
# -----------------------------------------------------------------------------

Write-Step "Updating dependencies"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('update', '-r', '-f', '--latest', '--minimum-release-age=4321') -Description 'bun update -r -f --latest --minimum-release-age=4321'

Write-Step "Formatting"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('run', 'format') -Description 'bun run format'

Write-Step "Running quality checks"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'bun' -Arguments @('run', 'smoke:qc') -Description 'bun run smoke:qc'

# -----------------------------------------------------------------------------
# Initialize Git Repository
# -----------------------------------------------------------------------------

Write-Step "Initializing git repository"
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'git' -Arguments @('init') -Description 'git init'
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'git' -Arguments @('add', '-A') -Description 'git add -A'
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'git' -Arguments @('commit', '-m', 'init') -Description 'git commit'
Invoke-Command-Checked -WorkingDir $TargetDir -Executable 'git' -Arguments @('branch', '-M', 'main') -Description 'git branch -M main'

# -----------------------------------------------------------------------------
# Complete
# -----------------------------------------------------------------------------

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host "   Application '$Application' initialized successfully!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor White
Write-Host "  cd $Application" -ForegroundColor Gray
Write-Host "  bun run dev                   # Start development server" -ForegroundColor Gray
Write-Host ""
