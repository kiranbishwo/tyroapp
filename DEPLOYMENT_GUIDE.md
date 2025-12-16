# Deployment Guide - Tyrodesk Desktop App

## 📋 Complete Workflow to Update Live Desktop App

### Step 1: Make Your Code Changes
1. **Environment Configuration:** The app automatically detects production vs development mode
   - **Development:** Uses `http://tyrodesk.test:8000` (configured via `APP_ENV=development` in package.json)
   - **Production:** Uses `https://tyrodesk.com` (configured via `APP_ENV=production` or when packaged)
   - Environment is controlled in `package.json` scripts - **DO NOT** hardcode URLs in code
2. Test locally using:
   - `npm run electron:dev` - Test with development API
   - `npm run electron:prod` - Test with production API (local testing)

### Step 2: Update Version Number (IMPORTANT!)
**Before building, you MUST update the version in `package.json`:**

```json
"version": "1.0.6"  // Increment from 1.0.5 to 1.0.6
```

**Why?** The auto-updater only checks for updates if the new version is HIGHER than the current installed version.

### Step 3: Build the Application for Production

**⚠️ IMPORTANT:** The build process automatically uses production mode:
- `vite build` sets `import.meta.env.PROD = true`
- `electron-builder` sets `app.isPackaged = true`
- Both trigger production API URL (`https://tyrodesk.com`)

```bash
npm run build
```

This will:
- Build the React/Vite frontend with production mode (`npm run build:renderer`)
- Build the Electron app with production mode (`npm run build:electron`)
- Create files in the `release/` folder
- **Automatically uses production API:** `https://tyrodesk.com`

### Step 4: Push Code to GitHub
```bash
git add .
git commit -m "Update API route to new endpoint"
git push origin main
```

### Step 5: Create GitHub Release with Built Files

**For Production Release (Recommended):**
```bash
npm run build:renderer
npx electron-builder --win --publish=always
```

**What this does:**
- Builds renderer with production mode (uses `https://tyrodesk.com`)
- Creates a GitHub release automatically
- Uploads the installer (.exe) to GitHub Releases
- Sets up the release so auto-updater can find it
- **Uses production API URL automatically**

**OR manually:**
1. First build: `npm run build:renderer` (ensures production mode)
2. Go to GitHub → Your Repo → Releases → "Draft a new release"
3. Tag version: `v1.0.7` (must match package.json version)
4. Upload the installer from `release/` folder:
   - `Tyrodesk Tracker Setup 1.0.7.exe`

### Step 6: Users Get Updates Automatically

**How it works:**
- When users open the app, it checks GitHub Releases for a newer version
- If found, it downloads and installs automatically
- Users see a notification: "Update available" → "Update downloaded. App will restart now."

---

## 🔄 Quick Reference Workflow

```bash
# 1. Make code changes
# 2. Update version in package.json (e.g., 1.0.7 → 1.0.8)
# 3. Test locally (optional)
npm run electron:dev    # Test with dev API
npm run electron:prod   # Test with production API locally

# 4. Build for production (automatically uses production API)
npm run build:renderer

# 5. Create release and publish
npx electron-builder --win --publish=always

# 6. Push code to GitHub
git add .
git commit -m "Release v1.0.8"
git push
```

**Note:** The build process automatically uses production mode - no need to set environment variables manually!

---

## ⚠️ Important Notes

### Environment Configuration

**How it works:**
- **Development:** `npm run electron:dev` → Uses `http://tyrodesk.test:8000`
- **Production:** `npm run build` → Automatically uses `https://tyrodesk.com`
- Environment is controlled by `package.json` scripts - **never hardcode URLs**

**Configuration files:**
- `config/domainConfig.ts` - Frontend API URL (reads from `VITE_APP_ENV`)
- `electron/main.cjs` - Electron API URL (reads from `APP_ENV` or `NODE_ENV`)

**For production builds:**
- `vite build` automatically sets `import.meta.env.PROD = true`
- `electron-builder` automatically sets `app.isPackaged = true`
- Both trigger production mode automatically - **no manual configuration needed**

### Do You Need to Build Before Pushing?

**Short answer: NO, but it's recommended.**

- **Source code** (what you push to GitHub): You don't need to build this
- **Release files** (what users download): You MUST build this before creating a release

**Best Practice:**
1. Push source code first (so it's backed up)
2. Build locally with `npm run build:renderer`
3. Create release with `npx electron-builder --win --publish=always`

### Version Number is Critical!

The auto-updater compares versions:
- Current app: `1.0.5`
- New release: `1.0.6` ✅ (will update)
- New release: `1.0.5` ❌ (won't update - same version)
- New release: `1.0.4` ❌ (won't update - older version)

**Always increment the version in `package.json` before building!**

### Testing the Update

1. Install the current version (e.g., 1.0.5)
2. Create a new release with version 1.0.6
3. Open the app - it should check for updates automatically
4. You should see the update notification

---

## 🐛 Troubleshooting

### Users Not Getting Updates?

1. **Check version number** - Is it higher than current?
2. **Check GitHub release** - Is the .exe file uploaded?
3. **Check auto-updater logs** - Look in console for errors
4. **Check GitHub token** - `electron-builder` needs GitHub token for publishing

### Build Fails?

- Make sure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run build:renderer`
- Check Electron builder config in `package.json`

### Release Not Created?

- Make sure you have a GitHub token set up (set `GH_TOKEN` environment variable)
- Check `package.json` → `build.publish` configuration
- Verify version number is incremented
- Try manual release creation on GitHub

### Wrong API URL in Production Build?

- **Check:** `npm run build:renderer` sets production mode automatically
- **Verify:** Console logs show `[CONFIG] BASE_URL set to: https://tyrodesk.com`
- **Don't:** Manually set environment variables - let the build process handle it
- **If issue persists:** Check `config/domainConfig.ts` and `electron/main.cjs` logic

---

## 📝 Current Configuration

### Package.json Settings for Production

**Required settings in `package.json`:**
```json
{
  "version": "1.0.7",  // ⚠️ MUST increment before each release
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "kiranbishwo",
        "repo": "tyroapp"
      }
    ]
  }
}
```

**Environment Variables (set automatically by scripts):**
- `APP_ENV=production` - Set during build (Electron main process)
- `VITE_APP_ENV=production` - Set during build (Vite/frontend)
- `NODE_ENV=production` - Set during build

### Current Setup

- **GitHub Repo:** kiranbishwo/tyroapp
- **Auto-updater:** Enabled (checks on app start)
- **Release Provider:** GitHub Releases
- **Current Version:** Check `package.json` (currently 1.0.7)
- **Development API:** `http://tyrodesk.test:8000`
- **Production API:** `https://tyrodesk.com`

---

## 🚀 Next Steps After Release

1. **Monitor:** Check if users are getting updates
2. **Test:** Install the new version on a test machine
3. **Verify:** 
   - Confirm API route is using `https://tyrodesk.com` (check console logs)
   - Test authentication and API calls
   - Verify no connection to `tyrodesk.test` in production
4. **Document:** Update changelog if needed

## 🎯 Production Release Checklist

Before releasing, verify:

- [ ] Version number incremented in `package.json`
- [ ] Code tested locally with `npm run electron:prod`
- [ ] Build completed: `npm run build:renderer`
- [ ] Console shows production API URL: `https://tyrodesk.com`
- [ ] GitHub token configured (`GH_TOKEN` environment variable)
- [ ] Release created: `npx electron-builder --win --publish=always`
- [ ] Release visible on GitHub Releases page
- [ ] Installer file uploaded successfully

