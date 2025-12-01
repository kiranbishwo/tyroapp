# Activity Tracking System

A comprehensive activity tracking system that monitors active windows, categorizes applications, and provides productivity insights. Works entirely offline using open-source tools.

## Features

- ✅ **Active Window Tracking**: Uses `active-win` (Node.js) to track which window the user is actively using
- ✅ **Browser URL Tracking**: Captures URLs from browser windows when available
- ✅ **App Categorization**: Automatically categorizes apps into:
  - **Work**: VS Code, Chrome DevTools, GitHub Desktop, etc.
  - **Entertainment**: YouTube, Netflix, Games, etc.
  - **Communication**: WhatsApp Desktop, Discord, Slack, etc.
  - **Productivity**: Calendar, Todo apps, etc.
  - **Other**: Unclassified apps
- ✅ **Time Tracking**: Monitors app switching patterns and tracks time spent
- ✅ **Productivity Insights**: Generates summaries, time usage statistics, and suggestions
- ✅ **Offline Processing**: All processing happens locally, no internet required
- ✅ **JSON API**: Simple JSON input/output format

## Usage

### Basic Usage - Process JSON Input

The system accepts JSON input in this format:

```json
{
  "title": "YouTube - Chrome",
  "app": "Google Chrome",
  "url": "https://youtube.com",
  "timestamp": 1732989234
}
```

And returns a categorized response:

```json
{
  "category": "Entertainment",
  "description": "You're watching YouTube",
  "suggestion": "Take a short break after 15 minutes"
}
```

### Using the Service Directly

```typescript
import { processActivityJSON } from './services/activityAPI';

const input = {
  title: "VS Code",
  app: "Code",
  url: undefined,
  timestamp: Date.now()
};

const response = processActivityJSON(input);
console.log(response);
// {
//   category: "Work",
//   description: "You're coding in VS Code",
//   suggestion: "Great focus! Take a 5-minute break every 25 minutes"
// }
```

### Using the React Hook

```typescript
import { useActivityTracker } from './hooks/useActivityTracker';

function MyComponent() {
  const { currentActivity, processActivityInput } = useActivityTracker({
    enabled: true,
    interval: 2000, // Check every 2 seconds
    onActivityChange: (response) => {
      console.log('Activity changed:', response);
    }
  });

  // Process manual JSON input
  const handleInput = async () => {
    const response = await processActivityInput({
      title: "YouTube - Chrome",
      app: "Google Chrome",
      url: "https://youtube.com",
      timestamp: Date.now()
    });
    console.log(response);
  };

  return (
    <div>
      {currentActivity && (
        <div>
          <p>{currentActivity.description}</p>
          <p>Category: {currentActivity.category}</p>
          <p>Suggestion: {currentActivity.suggestion}</p>
        </div>
      )}
    </div>
  );
}
```

### Using the Component

```typescript
import { ActivityTracker } from './components/ActivityTracker';

function App() {
  return (
    <ActivityTracker
      onActivityChange={(response) => {
        console.log('Activity:', response);
      }}
    />
  );
}
```

## API Reference

### `processActivityJSON(input)`

Processes an activity input and returns a categorized response.

**Parameters:**
- `input.title` (string, required): Window title
- `input.app` (string, required): Application name
- `input.url` (string, optional): Current URL if browser window
- `input.timestamp` (number, optional): Unix timestamp

**Returns:**
```typescript
{
  category: "Work" | "Entertainment" | "Communication" | "Productivity" | "Other";
  description: string;
  suggestion: string;
}
```

### `getInsights(timeWindow?)`

Gets productivity insights for a time period.

**Parameters:**
- `timeWindow` (optional): `{ start: number, end: number }` - Unix timestamps

**Returns:**
```typescript
{
  totalTime: number; // seconds
  workTime: number;
  entertainmentTime: number;
  communicationTime: number;
  productivityPercentage: number; // 0-100
  topApps: Array<{ app: string; seconds: number; percentage: number }>;
  categoryBreakdown: Array<{ category: string; seconds: number; percentage: number }>;
  suggestions: string[];
}
```

### `getTimeUsage()`

Gets time usage statistics.

**Returns:**
```typescript
{
  byApp: Array<{
    app: string;
    time: string; // Human-readable (e.g., "1h 32m")
    seconds: number;
    percentage: number;
    category: string;
  }>;
  byCategory: Array<{
    category: string;
    time: string;
    seconds: number;
    percentage: number;
  }>;
}
```

### `getSummaries()`

Gets human-readable summaries.

**Returns:**
```typescript
string[] // Array of summary strings like:
// [
//   "Total tracked time: 2h 15m",
//   "Most time spent on Chrome: 1h 32m",
//   "Your productivity was 68%",
//   "Work: 1h 20m (59%)",
//   "Entertainment: 45m (33%)"
// ]
```

## App Categories

### Work Apps
- Code editors: VS Code, Sublime, Atom, WebStorm, IntelliJ
- Version control: GitHub Desktop, Git, SourceTree
- Development tools: Chrome DevTools, Postman, Docker
- Collaboration: Slack, Microsoft Teams, Jira, Trello, Asana
- Design: Figma, Sketch, Adobe XD, Photoshop

### Entertainment Apps
- Video: YouTube, Netflix, Hulu, Twitch, Vimeo
- Music: Spotify, SoundCloud
- Social: Instagram, TikTok, Facebook, Twitter, Reddit
- Games: Steam, Epic Games, Battle.net, and game titles

### Communication Apps
- Messaging: WhatsApp, Telegram, Signal, Messenger
- Voice/Video: Discord, Slack, Teams, Zoom, WebEx, Google Meet

### Productivity Apps
- Task management: Todoist, Habitica, Reminder apps
- Time tracking: Toggl, Clockify, RescueTime
- Focus: Pomodoro apps, Focus apps

## Examples

### Example 1: YouTube Activity

**Input:**
```json
{
  "title": "YouTube - Chrome",
  "app": "Google Chrome",
  "url": "https://youtube.com",
  "timestamp": 1732989234
}
```

**Output:**
```json
{
  "category": "Entertainment",
  "description": "You're watching YouTube",
  "suggestion": "Take a short break after 15 minutes"
}
```

### Example 2: VS Code Activity

**Input:**
```json
{
  "title": "App.tsx - Visual Studio Code",
  "app": "Code",
  "timestamp": 1732989234
}
```

**Output:**
```json
{
  "category": "Work",
  "description": "You're coding in VS Code",
  "suggestion": "Great focus! Take a 5-minute break every 25 minutes"
}
```

### Example 3: Discord Activity

**Input:**
```json
{
  "title": "Discord",
  "app": "Discord",
  "timestamp": 1732989234
}
```

**Output:**
```json
{
  "category": "Communication",
  "description": "You're chatting on Discord",
  "suggestion": "Keep conversations focused and productive"
}
```

## Architecture

The system consists of several modules:

1. **activityCategorizer.ts**: Categorizes apps and URLs into categories
2. **activityAnalytics.ts**: Tracks time usage and generates insights
3. **activityProcessor.ts**: Main processing service that combines categorization and analytics
4. **activityAPI.ts**: Simple API wrapper for JSON input/output
5. **useActivityTracker.ts**: React hook for real-time tracking
6. **ActivityTracker.tsx**: React component with UI

## Constraints

- ✅ Uses ONLY open-source tools (`active-win` for window tracking)
- ✅ All processing is done locally with JavaScript (offline)
- ✅ Never accesses anything outside the user's device
- ✅ Never sends user data to the internet without explicit permission
- ✅ Works entirely offline

## Integration with Electron

The system integrates with Electron for system-level window tracking:

- Uses `active-win` package in the main process
- Falls back to PowerShell on Windows if `active-win` fails
- Exposes IPC handlers for window tracking
- Processes categorization in the renderer process

## Future Enhancements

- Add more app categories
- Improve URL pattern matching
- Add machine learning for better categorization
- Add export functionality for time logs
- Add productivity goals and alerts
