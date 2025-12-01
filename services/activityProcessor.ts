/**
 * Activity Processor
 * Main service that processes JSON input and returns categorized responses
 * This is the entry point for the activity tracking system
 */

import { categorizeActivity, CategorizedActivity } from './activityCategorizer';
import { activityAnalytics, ProductivityInsights } from './activityAnalytics';

export interface ActivityInput {
    title: string;
    app: string;
    url?: string;
    timestamp?: number;
}

export interface ActivityResponse {
    category: string;
    description: string;
    suggestion: string;
}

/**
 * Process a single activity input and return categorized response
 * This is the main function that matches the user's requirements
 */
export function processActivity(input: ActivityInput): ActivityResponse {
    // Categorize the activity
    const categorized = categorizeActivity(input);
    
    // Add to analytics for tracking
    activityAnalytics.addRecord({
        ...input,
        category: categorized.category
    });
    
    // Return in the required format
    return {
        category: categorized.category,
        description: categorized.description,
        suggestion: categorized.suggestion
    };
}

/**
 * Get productivity insights for a time period
 */
export function getInsights(timeWindow?: { start: number; end: number }): ProductivityInsights {
    return activityAnalytics.generateInsights(timeWindow);
}

/**
 * Get time usage summary
 */
export function getTimeUsage() {
    const usage = activityAnalytics.calculateTimeUsage();
    const categoryBreakdown = activityAnalytics.calculateCategoryBreakdown();
    
    return {
        byApp: usage.map(u => ({
            app: u.app,
            time: activityAnalytics.getTimeSummary(u.seconds),
            seconds: u.seconds,
            percentage: Math.round(u.percentage * 10) / 10,
            category: u.category
        })),
        byCategory: categoryBreakdown.map(c => ({
            category: c.category,
            time: activityAnalytics.getTimeSummary(c.seconds),
            seconds: c.seconds,
            percentage: Math.round(c.percentage * 10) / 10
        }))
    };
}

/**
 * Get human-readable summaries
 */
export function getSummaries(): string[] {
    const insights = activityAnalytics.generateInsights();
    const summaries: string[] = [];
    
    // Total time summary
    if (insights.totalTime > 0) {
        summaries.push(`Total tracked time: ${activityAnalytics.getTimeSummary(insights.totalTime)}`);
    }
    
    // Top app summary
    if (insights.topApps.length > 0) {
        const topApp = insights.topApps[0];
        summaries.push(
            `Most time spent on ${topApp.app}: ${activityAnalytics.getTimeSummary(topApp.seconds)}`
        );
    }
    
    // Productivity summary
    summaries.push(`Your productivity was ${insights.productivityPercentage}%`);
    
    // Category summaries
    insights.categoryBreakdown.slice(0, 3).forEach(cat => {
        if (cat.seconds > 0) {
            summaries.push(
                `${cat.category}: ${activityAnalytics.getTimeSummary(cat.seconds)} (${Math.round(cat.percentage)}%)`
            );
        }
    });
    
    return summaries;
}

/**
 * Clear all tracking data
 */
export function clearTracking(): void {
    activityAnalytics.clear();
}
