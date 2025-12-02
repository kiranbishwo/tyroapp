# Fix iohook Native Module Build
Write-Host "=== Fixing iohook Native Module ===" -ForegroundColor Cyan
Write-Host ""

$iohookDir = "node_modules\@tkomde\iohook"
$expectedPath = "$iohookDir\builds\electron-v140-win32-x64\build\Release\iohook.node"

# Step 1: Check current state
Write-Host "Step 1: Checking current state..." -ForegroundColor Yellow
if (Test-Path $expectedPath) {
    Write-Host "  ✅ iohook.node already exists!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  ❌ iohook.node missing" -ForegroundColor Red
}

# Step 2: Check if build directory exists
Write-Host "Step 2: Checking build directory..." -ForegroundColor Yellow
$buildDir = "$iohookDir\build\Release"
if (Test-Path $buildDir) {
    Write-Host "  ✅ Build directory exists" -ForegroundColor Green
    $builtFiles = Get-ChildItem $buildDir -Filter "*.node"
    if ($builtFiles) {
        Write-Host "  ✅ Found built file: $($builtFiles[0].Name)" -ForegroundColor Green
        
        # Copy to expected location
        Write-Host "Step 3: Copying to expected location..." -ForegroundColor Yellow
        $targetDir = "$iohookDir\builds\electron-v140-win32-x64\build\Release"
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        Copy-Item $builtFiles[0].FullName "$targetDir\iohook.node" -Force
        Write-Host "  ✅ Copied to: $targetDir\iohook.node" -ForegroundColor Green
        exit 0
    }
} else {
    Write-Host "  ❌ Build directory doesn't exist" -ForegroundColor Red
}

# Step 3: Try to build
Write-Host "Step 3: Attempting to build..." -ForegroundColor Yellow
Push-Location $iohookDir
try {
    Write-Host "  Running: npx node-gyp rebuild --target=39.2.4 --arch=x64 --dist-url=https://www.electronjs.org/headers" -ForegroundColor Cyan
    $result = npx node-gyp rebuild --target=39.2.4 --arch=x64 --dist-url=https://www.electronjs.org/headers 2>&1
    $result | Write-Host
    
    # Check if build succeeded
    if (Test-Path "build\Release\*.node") {
        Write-Host "  ✅ Build succeeded!" -ForegroundColor Green
        
        # Copy to expected location
        $targetDir = "builds\electron-v140-win32-x64\build\Release"
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        $builtFile = Get-ChildItem "build\Release" -Filter "*.node" | Select-Object -First 1
        Copy-Item $builtFile.FullName "$targetDir\iohook.node" -Force
        Write-Host "  ✅ Copied to expected location" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Build failed - no .node file created" -ForegroundColor Red
        Write-Host "  Check error messages above" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Build error: $_" -ForegroundColor Red
} finally {
    Pop-Location
}

# Step 4: Final verification
Write-Host "Step 4: Final verification..." -ForegroundColor Yellow
if (Test-Path $expectedPath) {
    Write-Host "  ✅ SUCCESS! iohook.node is now available" -ForegroundColor Green
    Write-Host "  Location: $expectedPath" -ForegroundColor Cyan
} else {
    Write-Host "  ❌ Still missing - manual intervention needed" -ForegroundColor Red
    Write-Host "  Try running as Administrator" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
