# Logging is optional diagnostics: it must not block a safe installation.
function Start-Texture3DTranscript {
    [CmdletBinding()]
    param(
        [string]$TempDirectory = $env:TEMP,
        [string]$FallbackDirectory = (Join-Path $env:LOCALAPPDATA 'Texture3D\Logs'),
        [scriptblock]$Start = {
            param([string]$Path)
            Start-Transcript -Path $Path -ErrorAction Stop | Out-Null
        }
    )
    $seen = @{}
    foreach ($directory in @($TempDirectory, $FallbackDirectory)) {
        if ([string]::IsNullOrWhiteSpace($directory)) { continue }
        try {
            $resolved = [IO.Path]::GetFullPath($directory)
            if ($seen.ContainsKey($resolved)) { continue }
            $seen[$resolved] = $true
            $filename = 'Texture3D-installation-{0}.log' -f [guid]::NewGuid().ToString('N')
            $candidate = Join-Path $resolved $filename
            New-Item -ItemType Directory -Path $resolved -Force -ErrorAction Stop | Out-Null
            & $Start $candidate
            return $candidate
        } catch {
            Write-Warning ("Journal inaccessible dans {0} : {1}" -f $directory, $_.Exception.Message)
        }
    }
    Write-Warning 'Installation sans transcription : aucun journal ne peut être ouvert.'
    return $null
}
