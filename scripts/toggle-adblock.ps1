param([int]$AppProcessId)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DesktopMenu {
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr menu, int position);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr menu, int position);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$window = (Get-Process -Id $AppProcessId).MainWindowHandle
$menu = [DesktopMenu]::GetSubMenu([DesktopMenu]::GetMenu($window), 0)
if ($menu -eq [IntPtr]::Zero) { throw 'Native Everglow menu is missing' }
$id = [DesktopMenu]::GetMenuItemID($menu, 4)
if ($id -eq 4294967295) { throw 'Native adblock menu item is missing' }
[DesktopMenu]::SendMessage($window, 0x111, [IntPtr]::new($id), [IntPtr]::Zero) | Out-Null
