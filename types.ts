export enum AppView {
    LOGIN = 'LOGIN',
    CHECK_IN_OUT = 'CHECK_IN_OUT',
    DASHBOARD = 'DASHBOARD',
    SCREENCAST = 'SCREENCAST',
    INSIGHTS = 'INSIGHTS',
    SETTINGS = 'SETTINGS',
    CALCULATION_DETAILS = 'CALCULATION_DETAILS'
}

export interface Settings {
    enableScreenshots: boolean;
    enableUrlTracking: boolean;
    enableScreenshotBlur: boolean;
    idleTimeThreshold: number; // minutes
    // API Configuration
    apiEnabled?: boolean;
    apiBaseUrl?: string;
    apiKey?: string;
    apiSyncInterval?: number; // seconds
    autoSync?: boolean;
}

export interface User {
    id: string;
    name: string;
    avatar: string;
    isCheckedIn: boolean;
    checkInTime?: Date;
}

// Authenticated User from API
export interface AuthenticatedUser {
    id: number;
    company_id: number;
    department_id: number | null;
    department_name: string | null;
    is_admin: boolean;
    is_hr: boolean;
    is_face_registered: boolean;
    name: string;
    email: string;
    phone: string | null;
    avatar: string | null;
}

// Workspace from API
export interface Workspace {
    tenant_id: string | null;
    domain: string;
    company_id: number;
    workspace_id: string | number; // Can be UUID string or number
    workspace_name: string;
    workspace_slug: string;
    workspace_description: string | null;
    workspace_logo_url: string | null;
    workspace_is_active: boolean | number; // Can be 1/0 or true/false
    workspace_is_general: boolean | number; // Can be 1/0 or true/false
    workspace_role: string;
    workspace_joined_at: string | null;
    company_name: string | null;
    company_email: string | null;
    company_phone: string | null;
}

// Auth Response from API
export interface AuthResponse {
    result: boolean;
    message: string;
    data: {
        id: number;
        company_id: number;
        department_id: number | null;
        department_name: string | null;
        is_admin: boolean;
        is_hr: boolean;
        is_face_registered: boolean;
        name: string;
        email: string;
        phone: string | null;
        avatar: string | null;
        workspaces: Workspace[];
        token: string;
        login_token: string;
        token_type: string;
        expires_at: string;
    };
    token?: string;
    login_token?: string;
}

export interface Task {
    id: string;
    name: string;
    projectId: string;
    completed: boolean;
    description?: string;
}

export interface Project {
    id: string;
    name: string;
    color: string;
    tasks?: Task[];
}

export interface TimeEntry {
    id: string;
    description: string;
    projectId: string;
    taskId?: string;
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

export type ProductivityCategory = 'productive' | 'neutral' | 'unproductive';

export interface ActivityLog {
    id: string;
    timestamp: Date;
    projectId: string;
    taskId?: string; // Optional: specific task ID for better filtering
    keyboardEvents: number;
    mouseEvents: number;
    productivityScore: number; // 0-100
    activeWindow: string; // "VS Code", "Chrome", etc.
    activeUrl?: string; // Current URL if browser window
    screenshotUrl?: string; // Keep for backward compatibility
    screenshotUrls?: string[]; // Array of all screenshots
    webcamUrl?: string;
    isIdle?: boolean; // True if this interval was marked as idle
    idleDuration?: number; // Duration of idle time in seconds
    // Hubstaff algorithm fields (lightweight)
    appCategory?: ProductivityCategory; // Classified app category
    appCategoryWeight?: number; // Weight for app category (0.0-1.0)
    urlCategory?: ProductivityCategory; // Classified URL category (overrides app category for browsers)
    urlCategoryWeight?: number; // Weight for URL category (0.0-1.0)
    // Deep work metrics
    contextSwitches?: number; // Number of app/window changes in recent period
    focusScore?: number; // 0-100 focus score (higher = more focused)
    averageSessionLength?: number; // Average minutes per app session
    longestSession?: number; // Longest uninterrupted session in minutes
    // Composite scoring
    compositeScore?: number; // Final weighted composite score (0-100)
    scoreBreakdown?: { // Component breakdown
        activity: number;
        app: number;
        url: number;
        focus: number;
    };
    scoreClassification?: { // Score classification
        level: 'exceptional' | 'high' | 'moderate' | 'low' | 'very_low';
        label: string;
        description: string;
        color: string;
    };
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