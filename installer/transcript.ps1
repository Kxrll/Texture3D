# The installation log is diagnostic only; failure to start transcription must
# not prevent verification, backup or a safe upgrade.
function Start-Texture3DTranscript {
    [CmdletBinding()]
    param(
        [string]$TempDirectory = $env:TEMP,
        [string]$FallbackDirectory = (Join-Path $env:LOCALAPPDATA 'Texture3D\Logs')
    )
    $seen = @{}
    foreach ($directory in @($TempDirectory, $FallbackDirectory)) {
        if ([string]::IsNullOrWhiteSpace($directory)) { continue }
        $resolved = [IO.Path]::GetFullPath($directory)
        if ($seen.ContainsKey($resolved)) { continue }
        $seen[$resolved] = $true
        $filename = 'Texture3D-installation-{0}.log' -f [guid]::NewGuid().ToString('N')
        $candidate = Join-Path $resolved $filename
        try {
            New-Item -ItemType Directory -Path $resolved -Force -ErrorAction Stop | Out-Null
            Start-Transcript -Path $candidate -ErrorAction Stop | Out-Null
            return $candidate
        } catch {
            Write-Warning ("Journal inaccessible dans {0} : {1}" -f $resolved, $_.Exception.Message)
        }
    }
    Write-Warning 'Installation sans transcription : aucun journal ne peut être ouvert.'
    return $null
}
