$ErrorActionPreference = 'Stop'
try {
    $package = Join-Path $PSScriptRoot 'distribution\fr.texture3d.studio_PS.ccx'
    $installer = Join-Path ${env:CommonProgramFiles} 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
    if (-not (Test-Path -LiteralPath $package)) { throw 'Le fichier CCX est absent du dossier distribution.' }
    if (-not (Test-Path -LiteralPath $installer)) { throw 'Installe Adobe Creative Cloud Desktop pour disposer de l’installateur de plugins.' }
    & $installer /install $package
    if ($LASTEXITCODE -ne 0) { throw "Installation Adobe échouée (code $LASTEXITCODE)." }
    Write-Output 'Texture3D Studio installé. Redémarre Photoshop une fois. UXP Developer Tools n’est plus nécessaire.'
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
