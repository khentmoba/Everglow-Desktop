param([int]$AppProcessId)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DesktopMenu {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr menu, int position);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu, int position);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string className, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetMenuString(IntPtr menu, uint item, System.Text.StringBuilder text, int count, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMenuItemRect(IntPtr window, IntPtr menu, uint position, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
'@
[DesktopMenu]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$window = (Get-Process -Id $AppProcessId).MainWindowHandle
$menu = [DesktopMenu]::GetSubMenu([DesktopMenu]::GetMenu($window), 0)
if ($menu -eq [IntPtr]::Zero) {
  $popup = [DesktopMenu]::FindWindow('#32768', $null)
  if ($popup -ne [IntPtr]::Zero) {
    $menu = [DesktopMenu]::SendMessage($popup, 0x1E1, [IntPtr]::Zero, [IntPtr]::Zero)
  }
}
if ($popup -and $popup -ne [IntPtr]::Zero -and $menu -ne [IntPtr]::Zero) {
  $id = [DesktopMenu]::GetMenuItemID($menu, 4)
  $label = New-Object System.Text.StringBuilder 256
  [DesktopMenu]::GetMenuString($menu, 4, $label, 256, 0x400) | Out-Null
  if (-not $label.ToString().StartsWith('Block ads and trackers')) { throw "Unexpected menu item: $label" }
  if ($id -eq 4294967295) { throw 'Native adblock menu item is missing' }
  $bounds = New-Object DesktopMenu+Rect
  if (-not [DesktopMenu]::GetMenuItemRect([IntPtr]::Zero, $menu, 4, [ref]$bounds)) { throw 'Cannot inspect adblock menu bounds' }
  [DesktopMenu]::SetCursorPos([int](($bounds.Left + $bounds.Right) / 2), [int](($bounds.Top + $bounds.Bottom) / 2)) | Out-Null
  [DesktopMenu]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [DesktopMenu]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  return
}
if ($menu -ne [IntPtr]::Zero) {
  $id = [DesktopMenu]::GetMenuItemID($menu, 4)
  if ($id -ne 4294967295) {
    [DesktopMenu]::SendMessage($window, 0x111, [IntPtr]::new($id), [IntPtr]::Zero) | Out-Null
    return
  }
}
$origin = New-Object DesktopMenu+Point
[DesktopMenu]::ClientToScreen($window, [ref]$origin) | Out-Null
$clickX = $origin.X + 88
$clickY = $origin.Y + 165
[DesktopMenu]::SetCursorPos($clickX, $clickY) | Out-Null
[DesktopMenu]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
[DesktopMenu]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
