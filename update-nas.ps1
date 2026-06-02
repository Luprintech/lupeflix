param(
  [string]$RemoteUrl = "https://github.com/Luprintech/lupeflix.git",
  [string]$Branch = "main",
  [string]$NasUser = "lupe",
  [string]$NasHost = "192.168.1.91",
  [int]$NasPort = 91,
  [string]$NasPath = "/volume1/docker/lupeflix",
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

function Ensure-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Ensure-Command ssh
Ensure-Command scp

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "LupeFlix NAS update" -ForegroundColor Green
Write-Host "Remote:  $RemoteUrl"
Write-Host "Branch:  $Branch"
Write-Host "NAS:     $NasUser@$NasHost`:$NasPort"
Write-Host "Path:    $NasPath"

$sshTarget = "$NasUser@$NasHost"
$composeCommand = if ($NoBuild) { "docker compose up -d" } else { "docker compose up -d --build" }

# First ensure the application folder exists on the NAS and contains the Git repo.
$prepareScript = @"
set -e
REMOTE_URL='$RemoteUrl'
BRANCH='$Branch'
APP_PATH='$NasPath'

if [ ! -d "`$APP_PATH/.git" ]; then
  if [ -d "`$APP_PATH" ]; then
    backup_path="`$APP_PATH.backup.`$(date +%Y%m%d%H%M%S)"
    mv "`$APP_PATH" "`$backup_path"
    echo "Existing non-git folder moved to: `$backup_path"
  fi
  git clone "`$REMOTE_URL" "`$APP_PATH"
fi
"@

Write-Host "`n> Preparing repository folder on NAS" -ForegroundColor Cyan
$prepareScript | & ssh -p $NasPort $sshTarget "cat > /tmp/lupeflix-prepare.sh && sh /tmp/lupeflix-prepare.sh"
if ($LASTEXITCODE -ne 0) { throw "NAS repository preparation failed" }

# Keep secrets out of GitHub. Copy the local .env to the NAS after the folder exists.
if (Test-Path (Join-Path $ProjectRoot ".env")) {
  Write-Host "`n> Copying .env to NAS" -ForegroundColor Cyan
  & scp -P $NasPort "$ProjectRoot\.env" "${sshTarget}:$NasPath/.env"
  if ($LASTEXITCODE -ne 0) { throw "Failed to copy .env to NAS" }
} else {
  Write-Host "WARNING: local .env not found. NAS must already have $NasPath/.env" -ForegroundColor Yellow
}

$deployScript = @"
set -e
BRANCH='$Branch'
APP_PATH='$NasPath'

cd "`$APP_PATH"
git fetch origin "`$BRANCH"
git reset --hard "origin/`$BRANCH"

$composeCommand

echo
echo "LupeFlix status:"
docker compose ps

echo
echo "Healthcheck:"
if command -v curl >/dev/null 2>&1; then
  curl -fsS http://127.0.0.1:3030/api/health || true
else
  wget -qO- http://127.0.0.1:3030/api/health || true
fi
echo
"@

Write-Host "`n> Pulling latest code and redeploying on NAS" -ForegroundColor Cyan
$deployScript | & ssh -p $NasPort $sshTarget "cat > /tmp/lupeflix-deploy.sh && sh /tmp/lupeflix-deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "NAS update/redeploy failed" }

Write-Host "`nNAS update completed: http://$NasHost`:3030" -ForegroundColor Green

