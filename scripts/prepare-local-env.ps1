$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectFullPath = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$oneDriveRoot = $env:OneDrive
$isInOneDrive = $false
if ($oneDriveRoot) {
  $oneDriveFullPath = [System.IO.Path]::GetFullPath($oneDriveRoot).TrimEnd('\')
  $isInOneDrive = $projectFullPath.StartsWith($oneDriveFullPath + '\', [System.StringComparison]::OrdinalIgnoreCase)
}
if ($isInOneDrive) {
  $projectEnvPath = Join-Path $projectRoot '.env'
  if (Test-Path -LiteralPath $projectEnvPath) {
    throw 'Ya existe .env dentro de OneDrive. No se modificó; trasladá los secretos a una carpeta local protegida antes de continuar.'
  }
  $secretDirectory = Join-Path $env:LOCALAPPDATA 'Kinima'
  $envPath = Join-Path $secretDirectory 'kinima.env'
  $deviceDbPath = Join-Path $secretDirectory 'kinima-device.sqlite'
  New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
} else {
  $envPath = Join-Path $projectRoot '.env'
  $deviceDbPath = './data/kinima-device.sqlite'
}
function Protect-PrivatePath {
  param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$Directory
  )
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($existingRule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existingRule) }
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  if ($Directory) {
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  }
  $principals = @(
    [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value),
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  )
  foreach ($principal in $principals) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $principal,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}
if ($isInOneDrive) {
  Protect-PrivatePath -Path $secretDirectory -Directory
  foreach ($privateFile in @($envPath, $deviceDbPath)) {
    if (Test-Path -LiteralPath $privateFile) { Protect-PrivatePath -Path $privateFile }
  }
} else {
  if (Test-Path -LiteralPath $envPath) { Protect-PrivatePath -Path $envPath }
  $dataDirectory = Join-Path $projectRoot 'data'
  if (Test-Path -LiteralPath $dataDirectory) { Protect-PrivatePath -Path $dataDirectory -Directory }
}
if (Test-Path -LiteralPath $envPath) {
  throw "El archivo de entorno ya existe y no se reemplazó: $envPath"
}
if (-not $isInOneDrive) {
  $dataDirectory = Join-Path $projectRoot 'data'
  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  Protect-PrivatePath -Path $dataDirectory -Directory
}
function New-Secret {
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function New-DataKey {
  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
$lines = @(
  'DATABASE_URL=',
  'API_HOST=127.0.0.1',
  'API_PORT=4174',
  "JWT_SECRET=$(New-Secret)",
  "BOOTSTRAP_TOKEN=$(New-Secret)",
  "BACKUP_DATA_KEY=$(New-DataKey)",
  'NODE_ENV=development',
  'KINIMA_API_BASE_URL=http://127.0.0.1:4174',
  'KINIMA_DEVICE_ID=',
  'KINIMA_DEVICE_TOKEN=',
  "DEVICE_DATA_KEY=$(New-DataKey)",
  'DEVICE_PORT=4173',
  "DEVICE_DB_PATH=$deviceDbPath"
)
[System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
Protect-PrivatePath -Path $envPath
Write-Host "Se creó el entorno local: $envPath"
if ($isInOneDrive) { Write-Host 'Los secretos y la base SQLite quedaron fuera de OneDrive.' }
Write-Host 'No compartas ese archivo. Guardá copias protegidas de DEVICE_DATA_KEY y BACKUP_DATA_KEY fuera de este equipo: son necesarias para descifrar los datos locales y restaurar los respaldos.'
Write-Host 'BOOTSTRAP_TOKEN se ingresa una sola vez al crear la primera cuenta administradora.'
