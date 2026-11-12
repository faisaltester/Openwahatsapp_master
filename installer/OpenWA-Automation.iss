; Build with Inno Setup 6: iscc installer\OpenWA-Automation.iss
; First create release\windows using scripts\prepare-windows-package.ps1.

#define AppName "OpenWA Automation"
#define AppVersion "0.23.4"
#define AppPublisher "OpenWA"
#define PackageRoot "..\release\windows"

[Setup]
AppId={{9A5E940D-0A87-43B4-A912-5D64C85D2AC5}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
; Per-user install: the app owns SQLite, media and WhatsApp session files, so it must be
; writable when launched from the ordinary desktop shortcut (without an admin prompt).
DefaultDirName={localappdata}\OpenWA Automation
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\release
OutputBaseFilename=OpenWA-Automation-Setup
; The bundled Node + Chromium runtime is already largely compressed. Avoid ultra compression here:
; it makes a one-gigabyte setup take many minutes to build for very little size reduction.
Compression=none
SolidCompression=no
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\OpenWA Automation.bat

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autodesktop}\OpenWA Automation"; Filename: "{app}\OpenWA Automation.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 135
Name: "{group}\OpenWA Automation"; Filename: "{app}\OpenWA Automation.bat"; WorkingDir: "{app}"
Name: "{group}\Stop OpenWA Automation"; Filename: "{app}\Stop OpenWA Automation.bat"; WorkingDir: "{app}"
Name: "{group}\Uninstall OpenWA Automation"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\OpenWA Automation.bat"; Description: "Launch OpenWA Automation"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Stop OpenWA Automation.bat"; Flags: runhidden waituntilterminated
