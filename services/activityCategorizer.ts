/**
 * Activity Categorizer
 * Categorizes applications and URLs into Work, Entertainment, Communication, etc.
 * Works entirely offline using JavaScript pattern matching.
 */

export type ActivityCategory = 'Work' | 'Entertainment' | 'Communication' | 'Productivity' | 'Other';

export interface CategorizedActivity {
    category: ActivityCategory;
    description: string;
    suggestion: string;
    appName: string;
    url?: string;
}

// Work Applications
const WORK_APPS = [
    'code', 'vscode', 'visual studio', 'sublime', 'atom', 'webstorm', 'intellij',
    'github desktop', 'git', 'sourcetree', 'bitbucket',
    'chrome devtools', 'firefox developer', 'edge devtools',
    'slack', 'microsoft teams', 'zoom', 'webex', 'jira', 'trello', 'asana',
    'notion', 'obsidian', 'evernote', 'onenote',
    'excel', 'word', 'powerpoint', 'outlook', 'gmail', 'thunderbird',
    'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator',
    'postman', 'insomnia', 'docker', 'kubernetes', 'terminal', 'powershell', 'cmd',
    'mysql', 'mongodb', 'postgresql', 'sql server'
];

// Entertainment Applications
const ENTERTAINMENT_APPS = [
    'youtube', 'netflix', 'spotify', 'discord', 'steam', 'epic games',
    'twitch', 'vimeo', 'dailymotion', 'hulu', 'disney', 'prime video',
    'tiktok', 'instagram', 'facebook', 'twitter', 'reddit', 'pinterest',
    'games', 'game', 'minecraft', 'fortnite', 'valorant', 'league of legends',
    'battle.net', 'origin', 'uplay', 'gog', 'roblox'
];

// Communication Applications
const COMMUNICATION_APPS = [
    'whatsapp', 'telegram', 'signal', 'messenger', 'skype',
    'discord', 'slack', 'microsoft teams', 'zoom', 'webex', 'meet',
    'hangouts', 'wechat', 'line', 'viber'
];

// Productivity Applications (separate from work - personal productivity)
const PRODUCTIVITY_APPS = [
    'calendar', 'reminder', 'todo', 'task', 'habitica', 'todoist',
    'pomodoro', 'focus', 'rescuetime', 'toggl', 'clockify'
];

// Work URLs
const WORK_URLS = [
    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
    'dev.to', 'medium.com', 'developer.mozilla.org', 'w3schools.com',
    'docs.', 'api.', 'console.', 'dashboard.', 'admin.',
    'jira.', 'confluence.', 'atlassian.', 'trello.com', 'asana.com',
    'notion.so', 'figma.com', 'miro.com', 'mural.co',
    'google.com/search?q=', 'stackoverflow.com', 'reddit.com/r/programming'
];

// Entertainment URLs
const ENTERTAINMENT_URLS = [
    'youtube.com', 'youtu.be', 'netflix.com', 'hulu.com', 'disney.com',
    'twitch.tv', 'vimeo.com', 'dailymotion.com',
    'spotify.com', 'soundcloud.com', 'pandora.com',
    'instagram.com', 'tiktok.com', 'facebook.com', 'twitter.com',
    'reddit.com', 'pinterest.com', 'imgur.com', '9gag.com',
    'steamcommunity.com', 'epicgames.com'
];

// Communication URLs
const COMMUNICATION_URLS = [
    'web.whatsapp.com', 'telegram.org', 'messenger.com',
    'discord.com', 'slack.com', 'teams.microsoft.com',
    'zoom.us', 'meet.google.com', 'webex.com'
];

/**
 * Categorize an application name
 */
function categorizeApp(appName: string): ActivityCategory {
    const lowerApp = appName.toLowerCase();
    
    // Check work apps
    if (WORK_APPS.some(app => lowerApp.includes(app))) {
        return 'Work';
    }
    
    // Check entertainment apps
    if (ENTERTAINMENT_APPS.some(app => lowerApp.includes(app))) {
        return 'Entertainment';
    }
    
    // Check communication apps
    if (COMMUNICATION_APPS.some(app => lowerApp.includes(app))) {
        return 'Communication';
    }
    
    // Check productivity apps
    if (PRODUCTIVITY_APPS.some(app => lowerApp.includes(app))) {
        return 'Productivity';
    }
    
    return 'Other';
}

/**
 * Categorize a URL
 */
function categorizeUrl(url: string): ActivityCategory | null {
    if (!url) return null;
    
    const lowerUrl = url.toLowerCase();
    
    // Check work URLs
    if (WORK_URLS.some(workUrl => lowerUrl.includes(workUrl))) {
        return 'Work';
    }
    
    // Check entertainment URLs
    if (ENTERTAINMENT_URLS.some(entUrl => lowerUrl.includes(entUrl))) {
        return 'Entertainment';
    }
    
    // Check communication URLs
    if (COMMUNICATION_URLS.some(commUrl => lowerUrl.includes(commUrl))) {
        return 'Communication';
    }
    
    return null;
}

/**
 * Generate a human-readable description
 */
function generateDescription(appName: string, url: string | null, category: ActivityCategory): string {
    const lowerApp = appName.toLowerCase();
    const lowerUrl = url?.toLowerCase() || '';
    
    // Specific descriptions for common apps
    if (lowerApp.includes('chrome') || lowerApp.includes('firefox') || lowerApp.includes('edge')) {
        if (lowerUrl.includes('youtube')) {
            return "You're watching YouTube";
        }
        if (lowerUrl.includes('netflix')) {
            return "You're watching Netflix";
        }
        if (lowerUrl.includes('github')) {
            return "You're working on GitHub";
        }
        if (lowerUrl.includes('stackoverflow')) {
            return "You're reading Stack Overflow";
        }
        if (lowerUrl.includes('reddit')) {
            return "You're browsing Reddit";
        }
        if (lowerUrl.includes('discord')) {
            return "You're on Discord";
        }
        if (lowerUrl.includes('slack')) {
            return "You're using Slack";
        }
        return `You're browsing in ${appName}`;
    }
    
    if (lowerApp.includes('code') || lowerApp.includes('vscode')) {
        return "You're coding in VS Code";
    }
    
    if (lowerApp.includes('spotify')) {
        return "You're listening to music";
    }
    
    if (lowerApp.includes('discord')) {
        return "You're chatting on Discord";
    }
    
    if (lowerApp.includes('whatsapp')) {
        return "You're messaging on WhatsApp";
    }
    
    if (lowerApp.includes('slack')) {
        return "You're working on Slack";
    }
    
    if (lowerApp.includes('teams')) {
        return "You're in a Teams meeting";
    }
    
    if (lowerApp.includes('zoom')) {
        return "You're in a Zoom meeting";
    }
    
    // Generic descriptions by category
    switch (category) {
        case 'Work':
            return `You're working in ${appName}`;
        case 'Entertainment':
            return `You're using ${appName} for entertainment`;
        case 'Communication':
            return `You're communicating via ${appName}`;
        case 'Productivity':
            return `You're managing tasks in ${appName}`;
        default:
            return `You're using ${appName}`;
    }
}

/**
 * Generate a helpful suggestion based on category and context
 */
function generateSuggestion(appName: string, url: string | null, category: ActivityCategory): string {
    const lowerApp = appName.toLowerCase();
    const lowerUrl = url?.toLowerCase() || '';
    
    // Specific suggestions for entertainment
    if (category === 'Entertainment') {
        if (lowerUrl.includes('youtube') || lowerApp.includes('youtube')) {
            return "Take a short break after 15 minutes";
        }
        if (lowerUrl.includes('netflix') || lowerApp.includes('netflix')) {
            return "Consider setting a viewing limit";
        }
        if (lowerApp.includes('game') || lowerApp.includes('steam')) {
            return "Remember to take breaks every hour";
        }
        return "Consider taking a break soon";
    }
    
    // Suggestions for work
    if (category === 'Work') {
        if (lowerApp.includes('code') || lowerApp.includes('vscode')) {
            return "Great focus! Take a 5-minute break every 25 minutes";
        }
        return "Stay hydrated and take regular breaks";
    }
    
    // Suggestions for communication
    if (category === 'Communication') {
        return "Keep conversations focused and productive";
    }
    
    // Default suggestion
    return "Maintain a healthy balance between work and rest";
}

/**
 * Main function to categorize activity from JSON input
 */
export function categorizeActivity(input: {
    title: string;
    app: string;
    url?: string;
    timestamp?: number;
}): CategorizedActivity {
    const { title, app, url } = input;
    
    // Determine category - URL takes precedence if available
    let category: ActivityCategory = categorizeUrl(url || '') || categorizeApp(app);
    
    // If still Other, try categorizing by title
    if (category === 'Other') {
        const lowerTitle = title.toLowerCase();
        if (WORK_URLS.some(w => lowerTitle.includes(w)) || WORK_APPS.some(w => lowerTitle.includes(w))) {
            category = 'Work';
        } else if (ENTERTAINMENT_URLS.some(e => lowerTitle.includes(e)) || ENTERTAINMENT_APPS.some(e => lowerTitle.includes(e))) {
            category = 'Entertainment';
        } else if (COMMUNICATION_URLS.some(c => lowerTitle.includes(c)) || COMMUNICATION_APPS.some(c => lowerTitle.includes(c))) {
            category = 'Communication';
        }
    }
    
    const description = generateDescription(app, url || null, category);
    const suggestion = generateSuggestion(app, url || null, category);
    
    return {
        category,
        description,
        suggestion,
        appName: app,
        url: url || undefined
    };
}
