Option Explicit
Dim shell, fs, projectDir, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
projectDir = fs.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /d /s /c ""cd /d """ & projectDir & """ && npm.cmd start"""
shell.Run command, 0, False
