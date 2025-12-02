/**
 * Smart rebuild check - only rebuilds if Visual Studio C++ tools are available
 * Falls back gracefully if not available (app will use PowerShell fallback)
 */

const { execSync } = require('child_process');
const os = require('os');

function checkVisualStudio() {
  if (os.platform() !== 'win32') {
    // On non-Windows, try rebuild (may need Xcode on macOS, build-essential on Linux)
    return true;
  }

  try {
    // Check if Visual Studio C++ tools are available
    // Try to find vswhere or check for MSBuild with C++ support
    const { execSync } = require('child_process');
    
    // Check for vswhere (Visual Studio Installer tool)
    try {
      const vswherePath = process.env.ProgramFiles + '\\Microsoft Visual Studio\\Installer\\vswhere.exe';
      const result = execSync(`"${vswherePath}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`, 
        { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
      if (result && result.trim()) {
        console.log('✅ Visual Studio C++ tools found - rebuilding native modules...');
        return true;
      }
    } catch (e) {
      // vswhere not found or no C++ tools
    }

    // Alternative: Check for MSBuild with C++ support
    try {
      const msbuildPaths = [
        process.env['ProgramFiles(x86)'] + '\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe',
        process.env.ProgramFiles + '\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe',
        process.env['ProgramFiles(x86)'] + '\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe'
      ];

      for (const msbuildPath of msbuildPaths) {
        try {
          require('fs').accessSync(msbuildPath);
          // Check if C++ tools are installed by looking for VC++ directory
          const vcToolsPath = require('path').join(require('path').dirname(msbuildPath), '..', '..', 'VC', 'Tools', 'MSVC');
          if (require('fs').existsSync(vcToolsPath)) {
            console.log('✅ Visual Studio C++ tools found - rebuilding native modules...');
            return true;
          }
        } catch (e) {
          // Path doesn't exist
        }
      }
    } catch (e) {
      // Check failed
    }

    console.log('⚠️  Visual Studio C++ tools not found - skipping native rebuild');
    console.log('   The app will use PowerShell fallback methods (this is OK!)');
    console.log('   To enable native modules, install "Desktop development with C++" workload in Visual Studio');
    return false;
  } catch (error) {
    console.log('⚠️  Could not check Visual Studio - skipping native rebuild');
    return false;
  }
}

// Main execution
try {
  if (checkVisualStudio()) {
    // Try to rebuild
    try {
      execSync('electron-rebuild', { stdio: 'inherit' });
      console.log('✅ Native modules rebuilt successfully');
      process.exit(0);
    } catch (rebuildError) {
      console.log('⚠️  Rebuild failed - app will use fallback methods');
      process.exit(0); // Exit with success - fallback is OK
    }
  } else {
    // Skip rebuild - fallback will be used
    process.exit(0);
  }
} catch (error) {
  console.log('⚠️  Rebuild check failed - skipping (app will use fallback)');
  process.exit(0); // Always exit with success - fallback is fine
}
