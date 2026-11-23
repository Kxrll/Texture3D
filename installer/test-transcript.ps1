$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transcript.ps1')
$root = Join-Path $env:TEMP ('Texture3D-transcript-test-' + [guid]::NewGuid().ToString('N'))
$preferred = Join-Path $root 'temp'
$fallback = Join-Path $root 'fallback'
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    # Inject a deterministic failure: do not shadow native Start-Transcript.
    $script:attempts = @()
    $script:failure = 'first'
    $starter = {
        param([string]$Path)
        $script:attempts += $Path
        if ($script:failure -eq 'all' -or
            ($script:failure -eq 'first' -and $script:attempts.Count -eq 1)) {
            throw 'Simulated transcription error'
        }
    }
    $log = Start-Texture3DTranscript -TempDirectory $preferred -FallbackDirectory $fallback -Start $starter
    Assert (![string]::IsNullOrWhiteSpace($log)) 'Fallback did not return a journal'
    Assert ($log.StartsWith($fallback, [StringComparison]::OrdinalIgnoreCase)) 'Fallback directory was not used'
    Assert ($script:attempts.Count -eq 2) 'Expected two transcription attempts'
    $script:failure = 'all'
    $script:attempts = @()
    $log = Start-Texture3DTranscript -TempDirectory $preferred -FallbackDirectory $fallback -Start $starter
    Assert ([string]::IsNullOrEmpty($log)) 'Complete transcription failure must not stop installation'
    Assert ($script:attempts.Count -eq 2) 'Both log destinations must be attempted'
    $script:failure = 'none'
    $first = Start-Texture3DTranscript -TempDirectory $preferred -FallbackDirectory $fallback -Start $starter
    $second = Start-Texture3DTranscript -TempDirectory $preferred -FallbackDirectory $fallback -Start $starter
    Assert ($first -ne $second) 'Log names must be unique for every attempt'
    # Real Windows PowerShell cmdlet, not a simulation.
    $real = Start-Texture3DTranscript -TempDirectory $preferred -FallbackDirectory $fallback
    Assert (![string]::IsNullOrWhiteSpace($real)) 'Native Start-Transcript did not start'
    Write-Output 'Native transcript log created'
    Stop-Transcript | Out-Null
    Assert (Test-Path -LiteralPath $real -PathType Leaf) 'Native transcript file missing'
    Write-Output 'PASS: unique journals, fallback after lock, both locations unavailable and real transcription.'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
