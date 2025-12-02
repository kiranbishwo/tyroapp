# Tracking Fix Script for Windows
# This script helps verify and fix tracking issues

Write-Host "=== Tracking Fix Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Visual Studio C++ Tools
Write-Host "Step 1: Checking Visual Studio C++ Tools..." -ForegroundColor Yellow
$vsPaths = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Community"
)

$vcToolsFound = $false
foreach ($vsPath in $vsPaths) {
    $vcToolsPath = Join-Path $vsPath "VC\Tools\MSVC"
    if (Test-Path $vcToolsPath) {
        Write-Host "  ✅ Found Visual Studio C++ tools at: $vsPath" -ForegroundColor Green
        $vcToolsFound = $true
        break
    }
}

if (-not $vcToolsFound) {
    Write-Host "  ❌ Visual Studio C++ tools not found!" -ForegroundColor Red
    Write-Host "  Please install 'Desktop development with C++' workload" -ForegroundColor Yellow
    Write-Host ""
}

# Step 2: Check Native Modules
Write-Host "Step 2: Checking Native Modules..." -ForegroundColor Yellow

$iohookPath = "node_modules\@tkomde\iohook\builds\electron-v140-win32-x64\build\Release\iohook.node"
if (Test-Path $iohookPath) {
    Write-Host "  ✅ iohook.node found!" -ForegroundColor Green
} else {
    Write-Host "  ❌ iohook.node missing - needs rebuild" -ForegroundColor Red
}

$activeWinPath = "node_modules\active-win\build\Release"
if (Test-Path $activeWinPath) {
    Write-Host "  ✅ active-win build directory found!" -ForegroundColor Green
} else {
    Write-Host "  ❌ active-win build directory missing - needs rebuild" -ForegroundColor Red
}

Write-Host ""

# Step 3: Rebuild Instructions
Write-Host "Step 3: Rebuild Instructions" -ForegroundColor Yellow
Write-Host "  Run these commands:" -ForegroundColor Cyan
Write-Host "    npm run postinstall:force" -ForegroundColor White
Write-Host "  Or:" -ForegroundColor Cyan
Write-Host "    npx electron-rebuild" -ForegroundColor White
Write-Host ""

# Step 4: Test Instructions
Write-Host "Step 4: Testing" -ForegroundColor Yellow
Write-Host "  1. Run: npm run electron:dev" -ForegroundColor Cyan
Write-Host "  2. Start timer in app" -ForegroundColor Cyan
Write-Host "  3. Open another app (Chrome, Notepad)" -ForegroundColor Cyan
Write-Host "  4. Type and click in that app" -ForegroundColor Cyan
Write-Host "  5. Check console for:" -ForegroundColor Cyan
Write-Host "     ✅ System-wide keyboard tracking initialized" -ForegroundColor Green
Write-Host "     ✅ System-wide mouse tracking initialized" -ForegroundColor Green
Write-Host "     [KEY] Pressed keycode: ..." -ForegroundColor Green
Write-Host "     [MOUSE] Left click detected" -ForegroundColor Green
Write-Host ""

Write-Host "=== Script Complete ===" -ForegroundColor Cyan
