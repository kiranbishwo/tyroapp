# Quick Start - Activity Tracking System

## Overview

The activity tracking system is now integrated into your app. It tracks active windows, categorizes activities, and provides productivity insights.

## Quick Usage

### 1. Process JSON Input (Main Use Case)

```typescript
import { processActivityJSON } from './services/activityAPI';

// Example input
const input = {
  "title": "YouTube - Chrome",
  "app": "Google Chrome",
  "url": "https://youtube.com",
  "timestamp": 1732989234
};

// Process and get response
const response = processActivityJSON(input);

console.log(response);
// {
//   "category": "Entertainment",
//   "description": "You're watching YouTube",
//   "suggestion": "Take a short break after 15 minutes"
// }
```

### 2. Use the React Hook (Auto-tracking)

```typescript
import { useActivityTracker } from './hooks/useActivityTracker';

function MyComponent() {
  const { currentActivity, processActivityInput } = useActivityTracker({
    enabled: true,
    interval: 2000, // Check every 2 seconds
    onActivityChange: (response) => {
      console.log('Activity:', response);
    }
  });

  // Manual processing
  const handleJsonInput = async () => {
    const json = {
      title: "VS Code",
      app: "Code",
      timestamp: Date.now()
    };
    const response = await processActivityInput(json);
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

### 3. Use the Component (UI)

```typescript
import { ActivityTracker } from './components/ActivityTracker';

function App() {
  return (
    <ActivityTracker
      onActivityChange={(response) => {
        // Handle activity change
        console.log(response);
      }}
    />
  );
}
```

## Integration Points

### Add to Your App

You can add the ActivityTracker component to any view in your app. For example, add it to the Dashboard:

```typescript
// In App.tsx
import { ActivityTracker } from './components/ActivityTracker';

// Add to dashboard view
{view === AppView.DASHBOARD && (
  <ActivityTracker />
)}
```

### Standalone Service

The service can also be used as a standalone API without React:

```typescript
// In any JavaScript/TypeScript file
import { processActivityJSON } from './services/activityAPI';

// Process any JSON input
const result = processActivityJSON({
  title: "Window Title",
  app: "Application Name",
  url: "https://example.com", // optional
  timestamp: Date.now() // optional
});
```

## Features

✅ **Automatic Categorization**: Apps are automatically categorized into Work, Entertainment, Communication, etc.

✅ **Time Tracking**: Tracks time spent on each app and category

✅ **Productivity Insights**: Generates productivity percentages and suggestions

✅ **Offline Processing**: All processing happens locally, no internet required

✅ **JSON API**: Simple JSON input/output format

## Example Responses

### YouTube
```json
{
  "category": "Entertainment",
  "description": "You're watching YouTube",
  "suggestion": "Take a short break after 15 minutes"
}
```

### VS Code
```json
{
  "category": "Work",
  "description": "You're coding in VS Code",
  "suggestion": "Great focus! Take a 5-minute break every 25 minutes"
}
```

### Discord
```json
{
  "category": "Communication",
  "description": "You're chatting on Discord",
  "suggestion": "Keep conversations focused and productive"
}
```

## Files Created

- `services/activityCategorizer.ts` - App categorization logic
- `services/activityAnalytics.ts` - Time tracking and analytics
- `services/activityProcessor.ts` - Main processing service
- `services/activityAPI.ts` - Simple JSON API wrapper
- `hooks/useActivityTracker.ts` - React hook for tracking
- `components/ActivityTracker.tsx` - UI component
- `examples/activityTrackingExample.ts` - Usage examples

## Next Steps

1. **Test the system**: Try processing some JSON inputs
2. **Integrate into your app**: Add the ActivityTracker component to a view
3. **Customize categories**: Edit `services/activityCategorizer.ts` to add more apps
4. **Add insights view**: Use `getInsights()` to show productivity metrics

## Documentation

See `ACTIVITY_TRACKING.md` for complete documentation.
