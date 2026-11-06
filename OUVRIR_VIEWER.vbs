Set fs = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
node = folder & "\runtime\node.exe"
If Not fs.FileExists(node) Then node = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If Not fs.FileExists(node) Then
  MsgBox "Node.js est nécessaire pour ouvrir la fenêtre séparée.", 48, "Texture 3D"
Else
  sh.Run Chr(34) & node & Chr(34) & " " & Chr(34) & folder & "\companion.cjs" & Chr(34) & " --open", 0, False
End If
