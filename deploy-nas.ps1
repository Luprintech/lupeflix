param(
  [string]$RemoteUrl = "https://github.com/Luprintech/lupeflix.git",
  [string]$Branch = "main",
  [string]$NasUser = "lupe",
  [string]$NasHost = "192.168.1.91",
  [int]$NasPort = 91,
  [string]$NasPath = "/volume1/docker/lupeflix",
  [switch]$NoBuild
)

$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'update-nas.ps1'
$argsList = @(
  '-ExecutionPolicy', 'Bypass',
  '-File', $script,
  '-RemoteUrl', $RemoteUrl,
  '-Branch', $Branch,
  '-NasUser', $NasUser,
  '-NasHost', $NasHost,
  '-NasPort', $NasPort,
  '-NasPath', $NasPath
)
if ($NoBuild) { $argsList += '-NoBuild' }

& powershell @argsList
exit $LASTEXITCODE

