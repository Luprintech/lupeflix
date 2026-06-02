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

function Invoke-NasScript($ScriptContent, $RemoteTmpPath) {
  $ScriptContent | & ssh -p $NasPort $sshTarget "tr -d '\r' > '$RemoteTmpPath' && sh '$RemoteTmpPath'"
  return $LASTEXITCODE
}

Ensure-Command git
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
$usedLocalPackage = $false

$prepareScript = @"
set -e
REMOTE_URL='$RemoteUrl'
BRANCH='$Branch'
APP_PATH='$NasPath'
TMP_PATH="/tmp/lupeflix-clone-`$(date +%Y%m%d%H%M%S)"

if [ -d "`$APP_PATH/.git" ]; then
  cd "`$APP_PATH"
  git fetch origin "`$BRANCH"
  git reset --hard "origin/`$BRANCH"
else
  rm -rf "`$TMP_PATH"
  git clone --branch "`$BRANCH" "`$REMOTE_URL" "`$TMP_PATH"
  if [ -d "`$APP_PATH" ]; then
    backup_path="`$APP_PATH.backup.`$(date +%Y%m%d%H%M%S)"
    mv "`$APP_PATH" "`$backup_path"
    echo "Existing non-git folder moved to: `$backup_path"
  fi
  mv "`$TMP_PATH" "`$APP_PATH"
fi
"@

Write-Host "`n> Trying to update NAS directly from GitHub" -ForegroundColor Cyan
$prepareExit = Invoke-NasScript $prepareScript "/tmp/lupeflix-prepare.sh"

if ($prepareExit -ne 0) {
  Write-Host "`nGitHub update from NAS failed. Falling back to local package upload." -ForegroundColor Yellow
  Write-Host "Reason usually: the GitHub repo is private and the NAS has no GitHub credentials." -ForegroundColor Yellow

  $archivePath = Join-Path $env:TEMP "lupeflix-release.tar.gz"
  if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

  Write-Host "`n> Creating local Git archive" -ForegroundColor Cyan
  git rev-parse --is-inside-work-tree | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "This folder is not a Git repository" }

  git archive --format=tar.gz -o "$archivePath" HEAD
  if ($LASTEXITCODE -ne 0) { throw "Failed to create local Git archive" }

  Write-Host "`n> Uploading package to NAS" -ForegroundColor Cyan
  & scp -P $NasPort "$archivePath" "${sshTarget}:/tmp/lupeflix-release.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw "Failed to upload local package to NAS" }

  $extractScript = @"
set -e
APP_PATH='$NasPath'
ARCHIVE='/tmp/lupeflix-release.tar.gz'
TMP_PATH="/tmp/lupeflix-release-`$(date +%Y%m%d%H%M%S)"

rm -rf "`$TMP_PATH"
mkdir -p "`$TMP_PATH"
tar -xzf "`$ARCHIVE" -C "`$TMP_PATH"

if [ -d "`$APP_PATH" ]; then
  backup_path="`$APP_PATH.backup.`$(date +%Y%m%d%H%M%S)"
  mv "`$APP_PATH" "`$backup_path"
  echo "Existing app folder moved to: `$backup_path"
fi

mv "`$TMP_PATH" "`$APP_PATH"
"@

  Write-Host "`n> Extracting package on NAS" -ForegroundColor Cyan
  $extractExit = Invoke-NasScript $extractScript "/tmp/lupeflix-extract.sh"
  if ($extractExit -ne 0) { throw "NAS local package extraction failed" }
  $usedLocalPackage = $true
}

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
APP_PATH='$NasPath'
BRANCH='$Branch'
cd "`$APP_PATH"

if [ -d .git ]; then
  git fetch origin "`$BRANCH"
  git reset --hard "origin/`$BRANCH"
else
  echo "Package deployment detected; skipping git reset."
fi

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

Write-Host "`n> Redeploying Docker Compose on NAS" -ForegroundColor Cyan
$deployExit = Invoke-NasScript $deployScript "/tmp/lupeflix-deploy.sh"
if ($deployExit -ne 0) { throw "NAS Docker redeploy failed" }

if ($usedLocalPackage) {
  Write-Host "`nNAS update completed using local package fallback: http://$NasHost`:3030" -ForegroundColor Green
} else {
  Write-Host "`nNAS update completed from GitHub: http://$NasHost`:3030" -ForegroundColor Green
}
