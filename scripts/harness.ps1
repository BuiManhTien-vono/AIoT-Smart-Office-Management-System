[CmdletBinding()]
param(
    [ValidateSet('doctor', 'frontend', 'backend', 'ai', 'all')]
    [string]$Profile = 'doctor',
    [string]$PythonExecutable = 'python'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $repoRoot 'harness/checks.json') -Raw | ConvertFrom-Json
if ($config.schemaVersion -ne 1) { throw 'Unsupported harness schemaVersion.' }
$results = [System.Collections.Generic.List[object]]::new()
$started = [DateTimeOffset]::UtcNow
$pythonCommand = Get-Command $PythonExecutable -ErrorAction SilentlyContinue
if ($pythonCommand) { $PythonExecutable = $pythonCommand.Source }

function Add-Result($Name, $Status, $Detail) {
    $results.Add([pscustomobject]@{ name = $Name; status = $Status; detail = $Detail })
    Write-Host "[$Status] $Name - $Detail"
}

function Invoke-LocalCommand([string]$Tool, [string[]]$Arguments) {
    # Windows PowerShell treats native stderr as an ErrorRecord; judge by exit code.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& $Tool @Arguments 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
        [pscustomobject]@{ code = $code; output = ($output -join "`n") }
    }
    finally { $ErrorActionPreference = $previousPreference }
}

function Test-Runtime([string]$Name) {
    $tool = switch ($Name) { 'frontend' { 'node' }; 'backend' { 'dotnet' }; 'ai' { $PythonExecutable } }
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Add-Result "$Name runtime" 'BLOCKED' "Missing executable: $tool"
        return $false
    }
    $arguments = if ($Name -eq 'backend') { @('--list-sdks') } else { @('--version') }
    $probe = Invoke-LocalCommand $tool $arguments
    $valid = $false
    if ($probe.code -eq 0) {
        if ($Name -eq 'backend') {
            $valid = $probe.output -match "(?m)^$($config.minimums.dotnetMajor)\."
        }
        elseif ($probe.output -match '(\d+\.\d+\.\d+)') {
            $minimum = if ($Name -eq 'ai') { $config.minimums.python } else { $config.minimums.node }
            $valid = [version]$Matches[1] -ge [version]$minimum
        }
    }
    if (-not $valid) {
        Add-Result "$Name runtime" 'BLOCKED' "Version requirement not met. Found: $($probe.output). See harness/checks.json."
        return $false
    }
    Add-Result "$Name runtime" 'PASS' $probe.output
    if ($Name -eq 'frontend') {
        if (-not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue) -or
            -not (Test-Path -LiteralPath (Join-Path $repoRoot 'frontend/node_modules'))) {
            Add-Result 'Frontend dependencies' 'BLOCKED' 'npm.cmd or node_modules missing; prepare with npm ci in frontend.'
            return $false
        }
    }
    if ($Name -eq 'backend') {
        $missingAssets = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'backend') -Filter '*.csproj' -Recurse |
            Where-Object { -not (Test-Path -LiteralPath (Join-Path $_.DirectoryName 'obj/project.assets.json')) })
        if ($missingAssets.Count -gt 0) {
            Add-Result 'Backend dependencies' 'BLOCKED' 'Restore assets missing; prepare with dotnet restore backend/SmartOffice.slnx.'
            return $false
        }
    }
    return $true
}

$profiles = if ($Profile -in @('doctor', 'all')) { @('frontend', 'backend', 'ai') } else { @($Profile) }
foreach ($selected in $profiles) {
    if (-not (Test-Runtime $selected)) { continue }
    if ($Profile -eq 'doctor') { continue }
    foreach ($step in $config.profiles.$selected) {
        $workingPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $step.cwd))
        $rootPrefix = $repoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if ($workingPath -ne $repoRoot -and -not $workingPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Check working directory must stay inside the repository: $($step.cwd)"
        }
        $tool = switch ($step.tool) {
            'npm' { 'npm.cmd' }
            'dotnet' { 'dotnet' }
            'python' { $PythonExecutable }
            default { throw "Unsupported tool: $($step.tool)" }
        }
        Push-Location -LiteralPath $workingPath
        try {
            $run = Invoke-LocalCommand $tool ([string[]]$step.args)
            Write-Host $run.output
            $status = if ($run.output -match 'vstest\.console process failed to connect to testhost process') { 'BLOCKED' }
                elseif ($run.code -ne 0) { 'FAIL' }
                elseif ($run.output -match '(?i)skipped\s*[:=]\s*[1-9]') { 'PARTIAL' }
                else { 'PASS' }
            Add-Result $step.name $status "Exit code: $($run.code)"
            $results[$results.Count - 1] | Add-Member -NotePropertyName output -NotePropertyValue $run.output
            if ($status -ne 'PASS') { break }
        }
        finally { Pop-Location }
    }
}

$runDir = Join-Path $repoRoot 'harness/runs'
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$reportPath = Join-Path $runDir ("{0}-{1}-{2}.json" -f $started.ToString('yyyyMMddTHHmmssfffZ'), $Profile, $PID)
$report = [pscustomobject]@{
    profile = $Profile
    checksSha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'harness/checks.json') -Algorithm SHA256).Hash
    startedAtUtc = $started.ToString('o')
    finishedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    results = @($results.ToArray())
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "Report: $reportPath"
if (@($results | Where-Object status -eq 'FAIL').Count -gt 0) { exit 1 }
if (@($results | Where-Object status -in @('BLOCKED', 'PARTIAL')).Count -gt 0) { exit 2 }
exit 0
