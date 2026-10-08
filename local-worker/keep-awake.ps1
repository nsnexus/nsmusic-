param(
    [int]$IntervalSeconds = 60
)

$definition = @'
using System;
using System.Runtime.InteropServices;

public static class SleepUtil {
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);

    public const uint ES_SYSTEM_REQUIRED  = 0x00000001;
    public const uint ES_DISPLAY_REQUIRED = 0x00000002;
    public const uint ES_CONTINUOUS       = 0x80000000;

    public static uint KeepAwake() {
        return SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
    }

    public static uint RestoreSleep() {
        return SetThreadExecutionState(ES_CONTINUOUS);
    }
}
'@

try {
    Add-Type -TypeDefinition $definition
} catch {
    Write-Host "[KeepAwake] Aviso ao compilar SleepUtil: $_"
}

Write-Host "[KeepAwake] Modo anti-suspensao ativado (impedindo desligamento da tela e hibernacao)."

# Configura WScript.Shell como reforço opcional (simula toque discreto na tecla F15 a cada ciclo)
$wshell = $null
try {
    $wshell = New-Object -ComObject WScript.Shell
} catch {
    $wshell = $null
}

try {
    while ($true) {
        try {
            [SleepUtil]::KeepAwake() | Out-Null
            if ($wshell) {
                # F15 é uma tecla virtual inofensiva que não afeta nenhum aplicativo, mas reseta o timer de ociosidade do Windows
                $wshell.SendKeys("{F15}")
            }
        } catch {
            # ignora erro momentaneo
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
} finally {
    try {
        [SleepUtil]::RestoreSleep() | Out-Null
        Write-Host "[KeepAwake] Modo anti-suspensao desativado."
    } catch {}
}
