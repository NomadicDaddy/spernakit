param(
	[Parameter(Mandatory=$true)]
	[string]$Application,

	[switch]$DryRun
)

$spernakitRoot = $PSScriptRoot
$workspaceRoot = Split-Path -Parent $spernakitRoot
$psdPath = Join-Path $spernakitRoot 'spernakit.psd1'
$config = Import-PowerShellDataFile -Path $psdPath

if (-not $config.ExpectedConfigs.ContainsKey($Application)) {
	Write-Error "Application '$Application' not found in configuration. Available apps: $($config.ExpectedConfigs.Keys -join ', ')"
	exit 1
}

$appConfig = $config.ExpectedConfigs[$Application]
$name = $appConfig.appName
$description = $appConfig.description
$frontendPort = $appConfig.frontendPort
$backendPort = $appConfig.backendPort
$version = $appConfig.version
$appPath = Join-Path $workspaceRoot $Application

if (-not (Test-Path -LiteralPath $appPath -PathType Container)) {
	Write-Error "Application directory not found: $appPath"
	exit 1
}

$escapedAppPath = $appPath -replace "'", "''"
$escapedName = $name -replace "'", "''"
$escapedDescription = $description -replace "'", "''"
$escapedVersion = $version -replace "'", "''"
$command = "Push-Location -LiteralPath '$escapedAppPath'; bun run setup --slug $Application --name '$escapedName' --description '$escapedDescription' --frontend-port $frontendPort --backend-port $backendPort --version '$escapedVersion'; Pop-Location"

if ($DryRun) {
	Write-Host $command
} else {
	Push-Location -LiteralPath $appPath
	try {
		bun run setup --slug $Application --name $name --description $description --frontend-port $frontendPort --backend-port $backendPort --version $version
	} finally {
		Pop-Location
	}
}
