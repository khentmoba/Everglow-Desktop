param([int]$AppProcessId, [switch]$Toggle, [ValidateSet('Top', 'Bar', 'Content', 'Outside')][string]$Pointer, [ValidateSet('Maximize', 'Restore', 'Inspect')][string]$WindowState, [long]$NativeWindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class FullscreenWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
[FullscreenWindow]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$window = if ($NativeWindowHandle) { [IntPtr]::new($NativeWindowHandle) } else { (Get-Process -Id $AppProcessId).MainWindowHandle }
if ($window -eq [IntPtr]::Zero) { throw 'Everglow window is missing' }
if ($WindowState) {
  if ($WindowState -eq 'Inspect') {
    @{ minimized = [FullscreenWindow]::IsIconic($window); maximized = [FullscreenWindow]::IsZoomed($window); handle = $window.ToInt64() } | ConvertTo-Json -Compress
    return
  }
  $command = if ($WindowState -eq 'Maximize') { 3 } else { 9 }
  [FullscreenWindow]::ShowWindow($window, $command) | Out-Null
  return
}
if ($Pointer) {
  $bounds = New-Object FullscreenWindow+Rect
  if (-not [FullscreenWindow]::GetWindowRect($window, [ref]$bounds)) { throw 'Cannot inspect window bounds' }
  [FullscreenWindow]::SetForegroundWindow($window) | Out-Null
  $x = [int](($bounds.Left + $bounds.Right) / 2)
  $clientOrigin = New-Object FullscreenWindow+Point
  [FullscreenWindow]::ClientToScreen($window, [ref]$clientOrigin) | Out-Null
  $y = switch ($Pointer) {
    'Top' { $clientOrigin.Y + 1 }
    'Bar' { $clientOrigin.Y + 20 }
    'Content' { $bounds.Top + 250 }
    'Outside' { $x = $bounds.Left - 10; $bounds.Top + 100 }
  }
  if (-not [FullscreenWindow]::SetCursorPos($x, $y)) { throw 'Cannot move test pointer' }
  return
}
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
$state = @{
  menuVisible = [FullscreenWindow]::GetMenu($window) -ne [IntPtr]::Zero
  fillsMonitor = ($client.Right - $client.Left -eq $monitor.Monitor.Right - $monitor.Monitor.Left) -and ($client.Bottom - $client.Top -eq $monitor.Monitor.Bottom - $monitor.Monitor.Top)
}
$state | ConvertTo-Json -Compress
