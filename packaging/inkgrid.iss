; Inkgrid installer (Inno Setup 6). Built by .github/workflows/windows-installer.yml.
; Local build: powershell -File packaging\build.ps1   (stages files, then runs ISCC)
;
; ISCC /DAppVersion=1.2.3 /DFileVersion=1.2.3.0 /DStageDir=..\packaging\stage packaging\inkgrid.iss

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
#ifndef FileVersion
  #define FileVersion "0.0.0.0"
#endif
#ifndef StageDir
  #define StageDir "stage"
#endif
#define AppName "Inkgrid"
#define AppExe "Inkgrid.exe"

[Setup]
; Never change AppId: it is how a newer Setup.exe finds and upgrades this install.
AppId={{711D6B85-BFF1-4623-AF5E-C3913A91802F}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Jordan (personal build)
AppComments=Image and video to ASCII art. Everything runs on this PC.
VersionInfoVersion={#FileVersion}
VersionInfoProductVersion={#FileVersion}
; Per-user, no admin: {autopf} resolves to %LOCALAPPDATA%\Programs
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
WizardStyle=modern
SetupIconFile=inkgrid.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
OutputDir=..\out
OutputBaseFilename={#AppName}-Setup
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Types]
Name: "full"; Description: "Full installation"
Name: "compact"; Description: "App only"
Name: "custom"; Description: "Custom"; Flags: iscustom

[Components]
Name: "main"; Description: "Inkgrid app"; Types: full compact custom; Flags: fixed
Name: "netserver"; Description: "Home-network server: open Inkgrid from your phone or other PCs (bundles Node.js, adds about 85 MB)"; Types: full

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[InstallDelete]
; Updates replace program folders whole, so nothing stale survives an upgrade.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\server"

[Files]
Source: "{#StageDir}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion; Components: main
Source: "{#StageDir}\README.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme; Components: main
Source: "{#StageDir}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs; Components: main
Source: "{#StageDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs; Components: netserver

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Comment: "Turn pictures and video into ASCII art"
Name: "{autoprograms}\{#AppName} network server"; Filename: "{app}\server\start-network.cmd"; WorkingDir: "{app}\server"; IconFilename: "{app}\{#AppExe}"; Comment: "Serve Inkgrid to other devices on your home network"; Components: netserver
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
const
  NetFx472 = 461808;

var
  CheckPage: TOutputMsgMemoWizardPage;
  CheckText: String;
  EdgeFound: Boolean;

function EdgePath(): String;
var
  P: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe', '', P) and FileExists(P) then
    Result := P
  else if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe', '', P) and FileExists(P) then
    Result := P
  else if FileExists(ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe')) then
    Result := ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe')
  else if FileExists(ExpandConstant('{commonpf64}\Microsoft\Edge\Application\msedge.exe')) then
    Result := ExpandConstant('{commonpf64}\Microsoft\Edge\Application\msedge.exe');
end;

function NetFxRelease(): Cardinal;
begin
  if not RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Result) then
    Result := 0;
end;

function InitializeSetup(): Boolean;
var
  Edge: String;
  Rel: Cardinal;
begin
  Result := True;
  Rel := NetFxRelease();
  Edge := EdgePath();
  EdgeFound := Edge <> '';
  CheckText := '';

  if Rel >= NetFx472 then
    CheckText := CheckText + '[OK]  .NET Framework 4.7.2 or newer (release ' + IntToStr(Rel) + ')' + #13#10
  else
  begin
    Log('PREREQ FAIL: .NET Framework 4.7.2+ missing (release ' + IntToStr(Rel) + ')');
    SuppressibleMsgBox('Inkgrid needs the .NET Framework 4.7.2 or newer, which this PC does not have.' + #13#10#13#10 +
      'It is built into Windows 10 (version 1809 and later) and Windows 11. Run Windows Update, or install it from:' + #13#10 +
      'https://dotnet.microsoft.com/download/dotnet-framework/net48' + #13#10#13#10 + 'Setup will now close.',
      mbCriticalError, MB_OK, IDOK);
    Result := False;
    exit;
  end;

  if EdgeFound then
    CheckText := CheckText + '[OK]  Microsoft Edge: ' + Edge + #13#10 +
      '      Inkgrid opens in its own Edge app window.' + #13#10
  else
    CheckText := CheckText + '[!!]  Microsoft Edge was NOT found.' + #13#10 +
      '      Inkgrid will still work, but opens in your default browser instead of its own window.' + #13#10 +
      '      Get Edge at https://www.microsoft.com/edge to fix this.' + #13#10;

  CheckText := CheckText + '[OK]  Graphics: Inkgrid draws with the browser canvas. No NVIDIA driver, CUDA or GPU runtime is needed.' + #13#10;
  CheckText := CheckText + '[OK]  Visual C++ runtime: not needed (nothing in Inkgrid links against it).' + #13#10;
  Log('Prerequisite check:' + #13#10 + CheckText);
end;

procedure InitializeWizard();
begin
  CheckPage := CreateOutputMsgMemoPage(wpSelectComponents,
    'System check', 'What Inkgrid needs on this PC',
    'Everything required is present. Items marked [!!] are optional but recommended.', CheckText);
  if not EdgeFound then
    CheckPage.SubCaptionLabel.Caption := 'Inkgrid can be installed. One recommended item is missing:';
end;

// Uninstall keeps settings (%LOCALAPPDATA%\Inkgrid) unless you opt in.
// Silent uninstall: pass /PURGE to also delete them.
function CmdLineHas(const S: String): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
    if CompareText(ParamStr(I), S) = 0 then
      Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
  Purge: Boolean;
begin
  if CurUninstallStep <> usPostUninstall then
    exit;
  DataDir := ExpandConstant('{localappdata}\Inkgrid');
  if not DirExists(DataDir) then
    exit;
  if UninstallSilent then
    Purge := CmdLineHas('/PURGE')
  else
    Purge := MsgBox('Also delete your Inkgrid settings and saved looks?' + #13#10#13#10 +
      DataDir + #13#10#13#10 + 'Choose No to keep them for a future install.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  if Purge then
  begin
    Log('Deleting user data: ' + DataDir);
    DelTree(DataDir, True, True, True);
  end
  else
    Log('Keeping user data: ' + DataDir);
end;
