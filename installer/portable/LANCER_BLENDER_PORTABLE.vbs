Set fs = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File " & Chr(34) & folder & "\LANCER_BLENDER_PORTABLE.ps1" & Chr(34), 0, False
