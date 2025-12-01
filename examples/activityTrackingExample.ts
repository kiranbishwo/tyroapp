/**
 * Activity Tracking Example
 * Demonstrates how to use the activity tracking system
 */

import { processActivityJSON } from '../services/activityAPI';
import { getInsights, getTimeUsage, getSummaries } from '../services/activityProcessor';

// Example 1: Process a single activity
console.log('=== Example 1: Process YouTube Activity ===');
const youtubeInput = {
    title: "YouTube - Chrome",
    app: "Google Chrome",
    url: "https://youtube.com",
    timestamp: Math.floor(Date.now() / 1000)
};

const youtubeResponse = processActivityJSON(youtubeInput);
console.log('Input:', JSON.stringify(youtubeInput, null, 2));
console.log('Response:', JSON.stringify(youtubeResponse, null, 2));
console.log('');

// Example 2: Process VS Code activity
console.log('=== Example 2: Process VS Code Activity ===');
const vscodeInput = {
    title: "App.tsx - Visual Studio Code",
    app: "Code",
    timestamp: Math.floor(Date.now() / 1000)
};

const vscodeResponse = processActivityJSON(vscodeInput);
console.log('Input:', JSON.stringify(vscodeInput, null, 2));
console.log('Response:', JSON.stringify(vscodeResponse, null, 2));
console.log('');

// Example 3: Process Discord activity
console.log('=== Example 3: Process Discord Activity ===');
const discordInput = {
    title: "Discord",
    app: "Discord",
    timestamp: Math.floor(Date.now() / 1000)
};

const discordResponse = processActivityJSON(discordInput);
console.log('Input:', JSON.stringify(discordInput, null, 2));
console.log('Response:', JSON.stringify(discordResponse, null, 2));
console.log('');

// Example 4: Process GitHub activity
console.log('=== Example 4: Process GitHub Activity ===');
const githubInput = {
    title: "GitHub - Pull Requests",
    app: "Google Chrome",
    url: "https://github.com/user/repo/pulls",
    timestamp: Math.floor(Date.now() / 1000)
};

const githubResponse = processActivityJSON(githubInput);
console.log('Input:', JSON.stringify(githubInput, null, 2));
console.log('Response:', JSON.stringify(githubResponse, null, 2));
console.log('');

// Example 5: Get insights (after processing multiple activities)
console.log('=== Example 5: Get Insights ===');
// Process a few more activities to generate data
processActivityJSON({ title: "VS Code", app: "Code", timestamp: Date.now() });
processActivityJSON({ title: "Chrome", app: "Google Chrome", url: "https://github.com", timestamp: Date.now() });
processActivityJSON({ title: "Spotify", app: "Spotify", timestamp: Date.now() });

const insights = getInsights();
console.log('Insights:', JSON.stringify(insights, null, 2));
console.log('');

// Example 6: Get time usage
console.log('=== Example 6: Get Time Usage ===');
const timeUsage = getTimeUsage();
console.log('Time Usage:', JSON.stringify(timeUsage, null, 2));
console.log('');

// Example 7: Get summaries
console.log('=== Example 7: Get Summaries ===');
const summaries = getSummaries();
console.log('Summaries:');
summaries.forEach(summary => console.log('  -', summary));
