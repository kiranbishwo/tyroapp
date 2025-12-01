/**
 * Activity Analytics Service
 * Provides time tracking, usage statistics, and productivity insights
 * Works entirely offline using JavaScript
 */

import { ActivityCategory, CategorizedActivity } from './activityCategorizer';

export interface ActivityRecord {
    timestamp: number;
    app: string;
    title: string;
    url?: string;
    category: ActivityCategory;
}

export interface TimeUsage {
    app: string;
    category: ActivityCategory;
    seconds: number;
    percentage: number;
}

export interface ProductivityInsights {
    totalTime: number; // in seconds
    workTime: number;
    entertainmentTime: number;
    communicationTime: number;
    productivityPercentage: number;
    topApps: TimeUsage[];
    categoryBreakdown: {
        category: ActivityCategory;
        seconds: number;
        percentage: number;
    }[];
    suggestions: string[];
}

class ActivityAnalytics {
    private records: ActivityRecord[] = [];
    private currentSession: ActivityRecord | null = null;
    private sessionStartTime: number | null = null;

    /**
     * Add a new activity record
     */
    addRecord(activity: {
        title: string;
        app: string;
        url?: string;
        timestamp?: number;
        category: ActivityCategory;
    }): void {
        const timestamp = activity.timestamp || Date.now();
        const record: ActivityRecord = {
            timestamp,
            app: activity.app,
            title: activity.title,
            url: activity.url,
            category: activity.category
        };
        
        // If we have a current session, calculate time spent
        if (this.currentSession && this.sessionStartTime) {
            const duration = timestamp - this.sessionStartTime;
            // Only add if duration is meaningful (at least 1 second)
            if (duration >= 1000) {
                this.records.push({
                    ...this.currentSession,
                    timestamp: this.sessionStartTime
                });
            }
        }
        
        // Start new session
        this.currentSession = record;
        this.sessionStartTime = timestamp;
    }

    /**
     * Get current session duration
     */
    getCurrentSessionDuration(): number {
        if (!this.currentSession || !this.sessionStartTime) {
            return 0;
        }
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }

    /**
     * Calculate time usage by app
     */
    calculateTimeUsage(records: ActivityRecord[] = this.records): TimeUsage[] {
        const appMap = new Map<string, { seconds: number; category: ActivityCategory }>();
        
        // Process all records
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const nextRecord = records[i + 1];
            
            // Calculate duration for this record
            const duration = nextRecord
                ? Math.floor((nextRecord.timestamp - record.timestamp) / 1000)
                : 0;
            
            if (duration > 0) {
                const existing = appMap.get(record.app) || { seconds: 0, category: record.category };
                appMap.set(record.app, {
                    seconds: existing.seconds + duration,
                    category: record.category
                });
            }
        }
        
        // Add current session if active
        if (this.currentSession && this.sessionStartTime) {
            const currentDuration = this.getCurrentSessionDuration();
            if (currentDuration > 0) {
                const existing = appMap.get(this.currentSession.app) || {
                    seconds: 0,
                    category: this.currentSession.category
                };
                appMap.set(this.currentSession.app, {
                    seconds: existing.seconds + currentDuration,
                    category: this.currentSession.category
                });
            }
        }
        
        // Convert to array and calculate percentages
        const totalSeconds = Array.from(appMap.values()).reduce((sum, item) => sum + item.seconds, 0);
        
        return Array.from(appMap.entries())
            .map(([app, data]) => ({
                app,
                category: data.category,
                seconds: data.seconds,
                percentage: totalSeconds > 0 ? (data.seconds / totalSeconds) * 100 : 0
            }))
            .sort((a, b) => b.seconds - a.seconds);
    }

    /**
     * Calculate category breakdown
     */
    calculateCategoryBreakdown(records: ActivityRecord[] = this.records): {
        category: ActivityCategory;
        seconds: number;
        percentage: number;
    }[] {
        const categoryMap = new Map<ActivityCategory, number>();
        
        // Process all records
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const nextRecord = records[i + 1];
            
            const duration = nextRecord
                ? Math.floor((nextRecord.timestamp - record.timestamp) / 1000)
                : 0;
            
            if (duration > 0) {
                const existing = categoryMap.get(record.category) || 0;
                categoryMap.set(record.category, existing + duration);
            }
        }
        
        // Add current session
        if (this.currentSession && this.sessionStartTime) {
            const currentDuration = this.getCurrentSessionDuration();
            if (currentDuration > 0) {
                const existing = categoryMap.get(this.currentSession.category) || 0;
                categoryMap.set(this.currentSession.category, existing + currentDuration);
            }
        }
        
        const totalSeconds = Array.from(categoryMap.values()).reduce((sum, sec) => sum + sec, 0);
        
        return Array.from(categoryMap.entries())
            .map(([category, seconds]) => ({
                category,
                seconds,
                percentage: totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0
            }))
            .sort((a, b) => b.seconds - a.seconds);
    }

    /**
     * Generate productivity insights
     */
    generateInsights(timeWindow?: { start: number; end: number }): ProductivityInsights {
        // Filter records by time window if provided
        let filteredRecords = this.records;
        if (timeWindow) {
            filteredRecords = this.records.filter(
                r => r.timestamp >= timeWindow.start && r.timestamp <= timeWindow.end
            );
        }
        
        const categoryBreakdown = this.calculateCategoryBreakdown(filteredRecords);
        const topApps = this.calculateTimeUsage(filteredRecords);
        
        const workTime = categoryBreakdown.find(c => c.category === 'Work')?.seconds || 0;
        const entertainmentTime = categoryBreakdown.find(c => c.category === 'Entertainment')?.seconds || 0;
        const communicationTime = categoryBreakdown.find(c => c.category === 'Communication')?.seconds || 0;
        const totalTime = categoryBreakdown.reduce((sum, c) => sum + c.seconds, 0);
        
        // Calculate productivity percentage (Work + Communication + Productivity)
        const productivityTime = categoryBreakdown
            .filter(c => ['Work', 'Communication', 'Productivity'].includes(c.category))
            .reduce((sum, c) => sum + c.seconds, 0);
        
        const productivityPercentage = totalTime > 0
            ? Math.round((productivityTime / totalTime) * 100)
            : 0;
        
        // Generate suggestions
        const suggestions: string[] = [];
        
        if (entertainmentTime > workTime && entertainmentTime > 3600) {
            suggestions.push("You've spent more time on entertainment than work. Consider focusing on work tasks.");
        }
        
        if (productivityPercentage < 50 && totalTime > 1800) {
            suggestions.push("Your productivity is below 50%. Try to focus more on work-related activities.");
        }
        
        if (topApps.length > 0 && topApps[0].category === 'Entertainment' && topApps[0].seconds > 3600) {
            suggestions.push(`You've spent over an hour on ${topApps[0].app}. Consider taking a break.`);
        }
        
        if (workTime > 14400) { // 4 hours
            suggestions.push("You've been working for over 4 hours. Remember to take regular breaks!");
        }
        
        if (suggestions.length === 0) {
            suggestions.push("Keep up the good work! Maintain a healthy balance.");
        }
        
        return {
            totalTime,
            workTime,
            entertainmentTime,
            communicationTime,
            productivityPercentage,
            topApps: topApps.slice(0, 10), // Top 10 apps
            categoryBreakdown,
            suggestions
        };
    }

    /**
     * Get human-readable time summary
     */
    getTimeSummary(seconds: number): string {
        if (seconds < 60) {
            return `${seconds}s`;
        }
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
        
        return `${minutes}m`;
    }

    /**
     * Clear all records
     */
    clear(): void {
        this.records = [];
        this.currentSession = null;
        this.sessionStartTime = null;
    }

    /**
     * Get all records
     */
    getRecords(): ActivityRecord[] {
        return [...this.records];
    }
}

// Export singleton instance
export const activityAnalytics = new ActivityAnalytics();
