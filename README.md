<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Tempo - AI Time & Attendance Tracker

A modern workforce management application with AI-powered productivity insights, face recognition attendance, and real-time activity monitoring.

## 🚀 Features

- **Face Recognition Attendance**: Check in/out using facial recognition
- **Time Tracking**: Track work time with project categorization
- **Screen Monitoring**: Automatic activity logging with screenshots
- **AI Productivity Insights**: Get AI-generated summaries of your workday using Google Gemini
- **Real-time Activity Logs**: Monitor keyboard/mouse activity and active windows
- **Modern UI**: Beautiful, responsive dark-themed interface

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 16 or higher recommended)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Google Gemini API Key** (for AI features)
  - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🛠️ Setup Instructions

### Step 1: Install Dependencies

Open your terminal in the project directory and run:

```bash
npm install
```

This will install all required packages:
- React 19.2.0
- Vite 6.2.0
- TypeScript 5.8.2
- @google/genai (Google Gemini AI SDK)
- And other development dependencies

### Step 2: Configure Environment Variables

1. Create a `.env.local` file in the root directory of the project:

```bash
# Windows (PowerShell)
New-Item .env.local

# Windows (CMD)
type nul > .env.local

# Mac/Linux
touch .env.local
```

2. Add your Gemini API key to the `.env.local` file:

```
GEMINI_API_KEY=your_api_key_here
```

**Important Notes:**
- Replace `your_api_key_here` with your actual Gemini API key
- The `.env.local` file is already in `.gitignore`, so it won't be committed to version control
- Never share your API key publicly

### Step 3: Verify Setup

Check that your project structure looks correct:
- `package.json` exists
- `vite.config.ts` exists
- `.env.local` exists with your API key
- `node_modules` folder exists (created after `npm install`)

## ▶️ Running the Application

### Development Mode

Start the development server:

```bash
npm run dev
```

The application will start on:
- **Local**: http://localhost:3000
- **Network**: http://0.0.0.0:3000 (accessible from other devices on your network)

### Build for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` folder.

### Preview Production Build

To preview the production build locally:

```bash
npm run preview
```

## 📱 Using the Application

1. **Login**: 
   - Enter any email (default: `alex@company.com`)
   - Enter any password (default: `password`)
   - Click "Log In"

2. **Check In**:
   - Grant camera permissions when prompted
   - Your face will be captured for attendance
   - You'll be redirected to the dashboard

3. **Start Tracking**:
   - Enter a description of what you're working on
   - Select a project from the dropdown
   - Click "START" to begin time tracking
   - Grant screen sharing permissions when prompted (required for monitoring)

4. **View Insights**:
   - Click the chart icon in the header to view activity logs
   - Click "Analyze" in the AI Insights section to get productivity summaries

5. **Check Out**:
   - Click the power icon in the header
   - Confirm with face recognition
   - You'll be logged out

## 🔧 Project Structure

```
tyro-app/
├── components/          # React components
│   ├── FaceAttendance.tsx
│   ├── InsightsDashboard.tsx
│   └── ScreenLogger.tsx
├── hooks/              # Custom React hooks
│   └── useSurveillance.ts
├── services/           # API services
│   └── gemini.ts      # Google Gemini AI integration
├── App.tsx            # Main application component
├── index.tsx          # Application entry point
├── index.html         # HTML template
├── types.ts           # TypeScript type definitions
├── vite.config.ts     # Vite configuration
├── tsconfig.json      # TypeScript configuration
├── package.json       # Dependencies and scripts
└── .env.local         # Environment variables (create this)
```

## 🐛 Troubleshooting

### Port Already in Use
If port 3000 is already in use, you can change it in `vite.config.ts`:
```typescript
server: {
  port: 3001, // Change to any available port
}
```

### API Key Not Working
- Verify your API key is correct in `.env.local`
- Ensure the file is named exactly `.env.local` (not `.env` or `.env.local.txt`)
- Restart the development server after adding/changing the API key
- Check that your Gemini API key has proper permissions

### Camera/Screen Permissions
- The app requires camera access for face recognition
- Screen sharing permission is required for activity monitoring
- Make sure your browser allows these permissions
- Try refreshing the page if permissions are denied

### Module Not Found Errors
If you see module errors:
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

### TypeScript Errors
If you see TypeScript compilation errors:
```bash
# Clear TypeScript cache and restart
npm run dev
```

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🔐 Security Notes

- Never commit `.env.local` to version control
- Keep your API keys secure
- The app uses local storage and browser APIs - no data is sent to external servers except for Gemini API calls
- Screen sharing and camera access are only active when explicitly enabled by the user

## 🌐 Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari (may have limited screen sharing support)

## 📝 License

This project is private and proprietary.

## 🆘 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Ensure your API key is valid
4. Check browser console for error messages

---

**View your app in AI Studio**: https://ai.studio/apps/temp/1
