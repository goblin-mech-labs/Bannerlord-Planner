# Decompiles the Bannerlord assemblies this planner extracts data from.
#
#   dotnet tool install -g ilspycmd
#   pwsh tools/decompile.ps1 [-GameDir "<path to Bannerlord>"]
#
# Output lands in tools/_decompiled (gitignored - it is derived TaleWorlds source).
# Re-run after a game patch, then: python tools/extract.py; python tools/extract_chargen.py;
# python tools/validate.py
param(
    [string]$GameDir = $(if ($env:BANNERLORD_DIR) { $env:BANNERLORD_DIR }
                         else { "C:\Program Files (x86)\Steam\steamapps\common\Mount & Blade II Bannerlord" })
)

$ErrorActionPreference = "Stop"
$out = Join-Path $PSScriptRoot "_decompiled"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$core   = Join-Path $GameDir "bin\Win64_Shipping_Client\TaleWorlds.Core.dll"
$campaign = Join-Path $GameDir "bin\Win64_Shipping_Client\TaleWorlds.CampaignSystem.dll"
$naval  = Join-Path $GameDir "Modules\NavalDLC\bin\Win64_Shipping_Client\NavalDLC.dll"

foreach ($dll in @($core, $campaign, $naval)) {
    if (-not (Test-Path $dll)) { throw "Assembly not found: $dll" }
}

$targets = @(
    @{ Dll = $campaign; Type = "TaleWorlds.CampaignSystem.CharacterDevelopment.DefaultPerks";                     File = "DefaultPerks.cs" },
    @{ Dll = $campaign; Type = "TaleWorlds.CampaignSystem.GameComponents.DefaultCharacterDevelopmentModel";       File = "DefaultCharacterDevelopmentModel.cs" },
    @{ Dll = $campaign; Type = "TaleWorlds.CampaignSystem.CharacterDevelopment.HeroDeveloper";                    File = "HeroDeveloper.cs" },
    @{ Dll = $campaign; Type = "TaleWorlds.CampaignSystem.CampaignBehaviors.CharacterCreationCampaignBehavior";   File = "CharacterCreationCampaignBehavior.cs" },
    @{ Dll = $core;     Type = "TaleWorlds.Core.DefaultSkills";                                                   File = "DefaultSkills.cs" },
    @{ Dll = $naval;    Type = "NavalDLC.CharacterDevelopment.NavalPerks";                                        File = "NavalPerks.cs" },
    @{ Dll = $naval;    Type = "NavalDLC.CharacterDevelopment.NavalSkills";                                       File = "NavalSkills.cs" },
    @{ Dll = $naval;    Type = "NavalDLC.CampaignBehaviors.NavalCharacterCreationCampaignBehavior";               File = "NavalCharacterCreationCampaignBehavior.cs" }
)

foreach ($t in $targets) {
    $dest = Join-Path $out $t.File
    Write-Host "decompiling $($t.Type)"
    ilspycmd $t.Dll -t $t.Type | Set-Content -Path $dest -Encoding utf8
    if ((Get-Item $dest).Length -eq 0) { throw "Empty output for $($t.Type)" }
}

Write-Host "done -> $out"
