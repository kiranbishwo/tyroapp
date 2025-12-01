export enum AppView {
    LOGIN = 'LOGIN',
    CHECK_IN_OUT = 'CHECK_IN_OUT',
    DASHBOARD = 'DASHBOARD',
    SCREENCAST = 'SCREENCAST',
    INSIGHTS = 'INSIGHTS'
}

export interface User {
    id: string;
    name: string;
    avatar: string;
    isCheckedIn: boolean;
    checkInTime?: Date;
}

export interface Project {
    id: string;
    name: string;
    color: string;
}

export interface TimeEntry {
    id: string;
    description: string;
    projectId: string;
    startTime: Date;
    endTime?: Date;
    duration: number; // in seconds
    screenshot?: string; // base64
}

export interface ScreenShot {
    id: string;
    timestamp: Date;
    dataUrl: string;
    type: 'SCREEN' | 'CAM';
}

export interface ActivityLog {
    id: string;
    timestamp: Date;
    projectId: string;
    keyboardEvents: number;
    mouseEvents: number;
    productivityScore: number; // 0-100
    activeWindow: string; // "VS Code", "Chrome", etc.
    activeUrl?: string; // Current URL if browser window
    screenshotUrl?: string;
    webcamUrl?: string;
}

export interface AppUsage {
    appName: string;
    percentage: number;
    icon: string;
    color: string;
    keystrokes?: number;
    clicks?: number;
    timeSpent?: number;
    urls?: Array<{ url: string; timestamp: Date; count: number }>;
    isActive?: boolean; // Is this app currently active?
}