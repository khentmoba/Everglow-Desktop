param([int]$AppProcessId, [switch]$Toggle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class FullscreenWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$window = (Get-Process -Id $AppProcessId).MainWindowHandle
if ($window -eq [IntPtr]::Zero) { throw 'Everglow window is missing' }
if ($Toggle) {
  # Route F11 through the native event loop, including when the menu is hidden.
  [FullscreenWindow]::PostMessage($window, 0x100, [IntPtr]::new(0x7A), [IntPtr]::new(0x00570001)) | Out-Null
  [FullscreenWindow]::PostMessage($window, 0x101, [IntPtr]::new(0x7A), [IntPtr]::new(0xC0570001L)) | Out-Null
  return
}
$client = New-Object FullscreenWindow+Rect
$monitor = New-Object FullscreenWindow+MonitorInfo
$monitor.Size = [Runtime.InteropServices.Marshal]::SizeOf($monitor)
if (-not [FullscreenWindow]::GetClientRect($window, [ref]$client)) { throw 'Cannot inspect client bounds' }
if (-not [FullscreenWindow]::GetMonitorInfo([FullscreenWindow]::MonitorFromWindow($window, 2), [ref]$monitor)) { throw 'Cannot inspect monitor bounds' }
@{
  menuVisible = [FullscreenWindow]::GetMenu($window) -ne [IntPtr]::Zero
  fillsMonitor = ($client.Right - $client.Left -eq $monitor.Monitor.Right - $monitor.Monitor.Left) -and ($client.Bottom - $client.Top -eq $monitor.Monitor.Bottom - $monitor.Monitor.Top)
} | ConvertTo-Json -Compress
