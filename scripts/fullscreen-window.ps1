param([int]$AppProcessId, [switch]$Toggle, [switch]$Drag, [ValidateSet('Top', 'Bar', 'Content', 'Outside')][string]$Pointer, [ValidateSet('Maximize', 'Restore', 'Inspect', 'Place')][string]$WindowState, [long]$NativeWindowHandle, [int]$Left = 80, [int]$Top = 80, [int]$Width = 900, [int]$Height = 700)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class FullscreenWindow {
  public delegate bool EnumWindowCallback(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowCallback callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  public static IntPtr FindAppWindow(uint processId) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((window, parameter) => {
      uint owner;
      GetWindowThreadProcessId(window, out owner);
      Rect bounds;
      if (owner == processId && IsWindowVisible(window) && GetWindowRect(window, out bounds)
          && bounds.Right - bounds.Left > 100 && bounds.Bottom - bounds.Top > 100) {
        result = window;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
[FullscreenWindow]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$window = if ($NativeWindowHandle) { [IntPtr]::new($NativeWindowHandle) } else { [FullscreenWindow]::FindAppWindow($AppProcessId) }
if ($window -eq [IntPtr]::Zero) { throw 'Everglow window is missing' }
if ($WindowState) {
  if ($WindowState -eq 'Inspect') {
    $bounds = New-Object FullscreenWindow+Rect
    if (-not [FullscreenWindow]::GetWindowRect($window, [ref]$bounds)) { throw 'Cannot inspect window bounds' }
    $cursor = New-Object FullscreenWindow+Point
    [FullscreenWindow]::GetCursorPos([ref]$cursor) | Out-Null
    @{ minimized = [FullscreenWindow]::IsIconic($window); maximized = [FullscreenWindow]::IsZoomed($window); visible = [FullscreenWindow]::IsWindowVisible($window); focused = [FullscreenWindow]::GetForegroundWindow() -eq $window; handle = $window.ToInt64(); left = $bounds.Left; top = $bounds.Top; width = $bounds.Right - $bounds.Left; height = $bounds.Bottom - $bounds.Top; cursorX = $cursor.X; cursorY = $cursor.Y; pointerWindow = [FullscreenWindow]::GetAncestor([FullscreenWindow]::WindowFromPoint($cursor), 2).ToInt64() } | ConvertTo-Json -Compress
    return
  }
  if ($WindowState -eq 'Place') {
    [FullscreenWindow]::ShowWindow($window, 9) | Out-Null
    if (-not [FullscreenWindow]::SetWindowPos($window, [IntPtr]::Zero, $Left, $Top, $Width, $Height, 0x0040)) { throw 'Cannot place test window' }
    return
  }
  $command = if ($WindowState -eq 'Maximize') { 3 } else { 9 }
  [FullscreenWindow]::ShowWindow($window, $command) | Out-Null
  return
}
if ($Pointer -or $Drag) {
  $bounds = New-Object FullscreenWindow+Rect
  if (-not [FullscreenWindow]::GetWindowRect($window, [ref]$bounds)) { throw 'Cannot inspect window bounds' }
  [FullscreenWindow]::BringWindowToTop($window) | Out-Null
  [FullscreenWindow]::SetWindowPos($window, [IntPtr]::Zero, 0, 0, 0, 0, 0x0043) | Out-Null
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
  if ($Drag) { $y = $clientOrigin.Y + 20 }
  if (-not [FullscreenWindow]::SetCursorPos($x, $y)) { throw 'Cannot move test pointer' }
  if ($Drag) {
    Start-Sleep -Milliseconds 500
    [FullscreenWindow]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    try {
      Start-Sleep -Milliseconds 200
      for ($step = 1; $step -le 10; $step++) {
        [FullscreenWindow]::SetCursorPos($x - 6 * $step, $y + 4 * $step) | Out-Null
        Start-Sleep -Milliseconds 30
      }
    } finally {
      [FullscreenWindow]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
  }
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
