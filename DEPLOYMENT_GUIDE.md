# Deployment Guide - Tyrodesk Desktop App

## 📋 Complete Workflow to Update Live Desktop App

### Step 1: Make Your Code Changes
1. Update the API route in `config/domainConfig.ts` (and `electron/main.cjs` if needed)
2. Test locally using `npm run electron:dev`

### Step 2: Update Version Number (IMPORTANT!)
**Before building, you MUST update the version in `package.json`:**

```json
"version": "1.0.6"  // Increment from 1.0.5 to 1.0.6
```

**Why?** The auto-updater only checks for updates if the new version is HIGHER than the current installed version.

### Step 3: Build the Application
```bash
npm run build
```

This will:
- Build the React/Vite frontend (`npm run build:renderer`)
- Build the Electron app (`npm run build:electron`)
- Create files in the `release/` folder

### Step 4: Push Code to GitHub
```bash
git add .
git commit -m "Update API route to new endpoint"
git push origin main
```

### Step 5: Create GitHub Release with Built Files
```bash
npx electron-builder --win --publish=always
```

**What this does:**
- Creates a GitHub release automatically
- Uploads the installer (.exe) to GitHub Releases
- Sets up the release so auto-updater can find it

**OR manually:**
1. Go to GitHub → Your Repo → Releases → "Draft a new release"
2. Tag version: `v1.0.6` (must match package.json version)
3. Upload the installer from `release/` folder:
   - `Tyrodesk Tracker Setup 1.0.6.exe`

### Step 6: Users Get Updates Automatically

**How it works:**
- When users open the app, it checks GitHub Releases for a newer version
- If found, it downloads and installs automatically
- Users see a notification: "Update available" → "Update downloaded. App will restart now."

---

## 🔄 Quick Reference Workflow

```bash
# 1. Make code changes
# 2. Update version in package.json
# 3. Build
npm run build

# 4. Push to GitHub
git add .
git commit -m "Your changes"
git push

# 5. Publish release
npx electron-builder --win --publish=always
```

---

## ⚠️ Important Notes

### Do You Need to Build Before Pushing?

**Short answer: NO, but it's recommended.**

- **Source code** (what you push to GitHub): You don't need to build this
- **Release files** (what users download): You MUST build this before creating a release

**Best Practice:**
1. Push source code first (so it's backed up)
2. Build locally
3. Create release with built files

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

- Make sure you have a GitHub token set up
- Check `package.json` → `build.publish` configuration
- Try manual release creation on GitHub

---

## 📝 Current Configuration

- **GitHub Repo:** kiranbishwo/tyroapp
- **Auto-updater:** Enabled (checks on app start)
- **Release Provider:** GitHub Releases
- **Current Version:** Check `package.json`

---

## 🚀 Next Steps After Release

1. **Monitor:** Check if users are getting updates
2. **Test:** Install the new version on a test machine
3. **Verify:** Confirm API route changes are working
4. **Document:** Update changelog if needed

