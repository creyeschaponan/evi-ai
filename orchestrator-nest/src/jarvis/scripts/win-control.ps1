param(
    [string]$Action,
    [float]$Value = 0,
    [string]$App = "",
    [string]$Query = ""
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int f(); int g(); int h(); int i();
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int j();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int k(); int l(); int m(); int n();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
    int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int f();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public class WinAudio {
    private static IAudioEndpointVolume GetEndpoint() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev = null;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        IAudioEndpointVolume epv = null;
        var epvid = typeof(IAudioEndpointVolume).GUID;
        dev.Activate(ref epvid, 23, 0, out epv);
        return epv;
    }

    public static float GetVolume() {
        var epv = GetEndpoint();
        float level = 0;
        epv.GetMasterVolumeLevelScalar(out level);
        return level * 100f;
    }

    public static void SetVolume(float levelPercent) {
        var epv = GetEndpoint();
        float scalar = Math.Max(0f, Math.Min(100f, levelPercent)) / 100f;
        epv.SetMasterVolumeLevelScalar(scalar, System.Guid.Empty);
    }

    public static void SetMute(bool mute) {
        var epv = GetEndpoint();
        epv.SetMute(mute, System.Guid.Empty);
    }
}

public class WinMedia {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    
    public const byte VK_MEDIA_NEXT_TRACK = 0xB0;
    public const byte VK_MEDIA_PREV_TRACK = 0xB1;
    public const byte VK_MEDIA_STOP = 0xB2;
    public const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void PlayPause() {
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }

    public static void Next() {
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }

    public static void Previous() {
        keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }

    public static void Stop() {
        keybd_event(VK_MEDIA_STOP, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_STOP, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
}
"@ -ErrorAction SilentlyContinue

switch ($Action.ToLower()) {
    # ------------------ Audio Master ------------------
    "get_volume" {
        $v = [WinAudio]::GetVolume()
        Write-Output "VOLUME:$([math]::Round($v))"
    }
    "set_volume" {
        [WinAudio]::SetVolume($Value)
        $v = [WinAudio]::GetVolume()
        Write-Output "VOLUME_SET:$([math]::Round($v))"
    }
    "volume_up" {
        $current = [WinAudio]::GetVolume()
        $newVal = [math]::Min(100, $current + 10)
        [WinAudio]::SetVolume($newVal)
        Write-Output "VOLUME_SET:$([math]::Round($newVal))"
    }
    "volume_down" {
        $current = [WinAudio]::GetVolume()
        $newVal = [math]::Max(0, $current - 10)
        [WinAudio]::SetVolume($newVal)
        Write-Output "VOLUME_SET:$([math]::Round($newVal))"
    }
    "mute" {
        [WinAudio]::SetMute($true)
        Write-Output "MUTED"
    }
    "unmute" {
        [WinAudio]::SetMute($false)
        Write-Output "UNMUTED"
    }

    # ------------------ Multimedia (YouTube / Spotify / Universal) ------------------
    "media_play_pause" {
        [WinMedia]::PlayPause()
        Write-Output "MEDIA:PLAY_PAUSE"
    }
    "media_next" {
        [WinMedia]::Next()
        Write-Output "MEDIA:NEXT_TRACK"
    }
    "media_prev" {
        [WinMedia]::Previous()
        Write-Output "MEDIA:PREV_TRACK"
    }
    "media_stop" {
        [WinMedia]::Stop()
        Write-Output "MEDIA:STOP"
    }
    "play_youtube" {
        if ($Query) {
            $encoded = [Uri]::EscapeDataString($Query)
            $url = "https://www.youtube.com/results?search_query=$encoded"
            Start-Process $url
            Write-Output "YOUTUBE_OPENED:$Query"
        } else {
            Start-Process "https://www.youtube.com"
            Write-Output "YOUTUBE_OPENED:HOME"
        }
    }
    "play_spotify" {
        if ($Query) {
            $encoded = [Uri]::EscapeDataString($Query)
            # Intenta abrir en la app de Spotify o en la web
            try {
                Start-Process "spotify:search:$Query" -ErrorAction Stop
                Write-Output "SPOTIFY_APP_SEARCHED:$Query"
            } catch {
                Start-Process "https://open.spotify.com/search/$encoded"
                Write-Output "SPOTIFY_WEB_SEARCHED:$Query"
            }
        } else {
            try {
                Start-Process "spotify:" -ErrorAction Stop
                Write-Output "SPOTIFY_APP_OPENED"
            } catch {
                Start-Process "https://open.spotify.com"
                Write-Output "SPOTIFY_WEB_OPENED"
            }
        }
    }

    # ------------------ Apps & System ------------------
    "open_app" {
        if ($App) {
            if ($App -eq "spotify") {
                try {
                    Start-Process "spotify:" -ErrorAction Stop
                    Write-Output "OPENED:spotify"
                } catch {
                    Start-Process "https://open.spotify.com"
                    Write-Output "OPENED:spotify_web"
                }
            } else {
                Start-Process $App -ErrorAction SilentlyContinue
                Write-Output "OPENED:$App"
            }
        }
    }
    "close_app" {
        if ($App) {
            if ($App -eq "spotify") {
                Stop-Process -Name "Spotify*" -Force -ErrorAction SilentlyContinue
                Write-Output "CLOSED:spotify"
            } else {
                Stop-Process -Name $App -Force -ErrorAction SilentlyContinue
                Write-Output "CLOSED:$App"
            }
        }
    }
    "minimize_all" {
        (New-Object -ComObject Shell.Application).MinimizeAll()
        Write-Output "MINIMIZED_ALL"
    }
    "lock_workstation" {
        rundll32.exe user32.dll,LockWorkStation
        Write-Output "LOCKED"
    }
    "get_system_info" {
        $os = Get-CimInstance Win32_OperatingSystem
        $freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $usedRamGB = [math]::Round($totalRamGB - $freeRamGB, 2)
        
        $gpuInfo = "N/A"
        try {
            $gpuRaw = & "C:\Windows\System32\nvidia-smi.exe" --query-gpu=memory.used,memory.total,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>$null
            if ($gpuRaw) {
                $p = $gpuRaw.Split(',')
                $gpuUsed = [math]::Round([float]$p[0].Trim() / 1024, 2)
                $gpuTotal = [math]::Round([float]$p[1].Trim() / 1024, 2)
                $gpuTemp = $p[2].Trim()
                $gpuLoad = $p[3].Trim()
                $gpuInfo = "RTX 3060 ($gpuUsed GB / $gpuTotal GB VRAM, ${gpuTemp}°C, ${gpuLoad}% carga)"
            }
        } catch {}

        Write-Output "RAM_USADA:${usedRamGB}GB / ${totalRamGB}GB (Libre: ${freeRamGB}GB) | GPU:$gpuInfo"
    }
    "get_time" {
        $now = Get-Date -Format "dddd, dd 'de' MMMM 'de' yyyy, HH:mm"
        Write-Output "CURRENT_TIME:$now"
    }
    "screenshot" {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $desktop = [Environment]::GetFolderPath("Desktop")
        $filePath = Join-Path $desktop "EVI_Captura_$(Get-Date -Format 'yyyyMMdd_HHmmss').png"
        $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()
        Write-Output "SCREENSHOT_SAVED:$filePath"
    }
    default {
        Write-Output "UNKNOWN_ACTION"
    }
}
