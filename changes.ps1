param(
    [string[]]$Apps
)

$workspaceRoot = Split-Path -Parent $PSScriptRoot

if (-not $Apps -or $Apps.Count -eq 0) {
    $configDataPath = Join-Path $PSScriptRoot 'spernakit.psd1'
    if (-not (Test-Path $configDataPath)) {
        Write-Error "Cannot find config data file: $configDataPath"
        exit 1
    }

    try {
        $configData = Import-PowerShellDataFile -Path $configDataPath
    } catch {
        Write-Error "Failed to load $configDataPath"
        Write-Error $_.Exception.Message
        exit 1
    }

    if (-not ($configData -is [hashtable]) -or -not $configData.ContainsKey('ExpectedConfigs')) {
        Write-Error "$configDataPath must export a hashtable with key 'ExpectedConfigs'"
        exit 1
    }

    $expectedConfigs = $configData.ExpectedConfigs
    if (-not ($expectedConfigs -is [hashtable])) {
        Write-Error "$configDataPath ExpectedConfigs must be a hashtable"
        exit 1
    }

    $Apps = @($expectedConfigs.Keys | Sort-Object)
}

# Handle the case where apps might be passed as a single comma-separated string
if ($Apps.Count -eq 1 -and $Apps[0].Contains(',')) {
    $Apps = $Apps[0].Split(',')
}

# Initialize an array to store all changed files
$allChangedFiles = @()

Write-Host "Checking git status for apps: $($Apps -join ', ')" -ForegroundColor Green

foreach ($app in $Apps) {
    $appPath = Join-Path $workspaceRoot $app

    # Check if the app directory exists
    if (-not (Test-Path $appPath)) {
        Write-Warning "App directory not found: $appPath"
        continue
    }

    # Check if it's a git repository
    $gitDir = Join-Path $appPath '.git'
    if (-not (Test-Path $gitDir)) {
        Write-Warning "Not a git repository: $appPath"
        continue
    }

    Write-Host "Checking $app..." -ForegroundColor Cyan

    # Run git status and capture output
    Push-Location $appPath
    try {
        # Get git status output in short format, including staged and unstaged changes
        $gitStatus = git status --porcelain

        if ($gitStatus) {
            # Parse the output to extract file paths
            # Git status --porcelain format: XY filename (2-char status + space + path)
            $files = $gitStatus | ForEach-Object {
                if ($_ -match '^.{2}\s+(.+)$') {
                    $matches[1]
                }
            }

            $allChangedFiles += $files

            Write-Host "  Found $($files.Count) changed files in $app" -ForegroundColor Yellow
        } else {
            Write-Host "  No changes found in $app" -ForegroundColor Gray
        }
    } catch {
        Write-Error "Error running git status in $appPath`: $_"
    } finally {
        Pop-Location
    }
}

# Sort and de-duplicate the results
if ($allChangedFiles.Count -gt 0) {
    # Get unique sorted files
    $uniqueFiles = $allChangedFiles | Sort-Object -Unique

    Write-Host "`nCombined sorted and de-duplicated changes:" -ForegroundColor Green
    $uniqueFiles | ForEach-Object {
        Write-Host $_
    }

    Write-Host "`nTotal unique changed files: $($uniqueFiles.Count)" -ForegroundColor Green

    # Copy the raw file list to clipboard
    $fileList = $uniqueFiles -join "`r`n"
    try {
        $fileList | Set-Clipboard
        Write-Host 'File list copied to clipboard.' -ForegroundColor Green
    } catch {
        Write-Warning "Could not copy to clipboard: $_"
    }
} else {
    Write-Host 'No changes found in any of the specified apps.' -ForegroundColor Green
}
