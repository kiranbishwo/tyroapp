/**
 * Deep Work Calculator Service
 * 
 * Calculates focus metrics based on context switches and work patterns.
 * Uses existing ActivityLog data - no new tracking needed.
 * 
 * Based on research:
 * - Context switches have a 23-minute recovery cost
 * - Uninterrupted work produces better outcomes
 * - Focus score measures quality of attention
 */

import { ActivityLog } from '../types';

export interface FocusMetrics {
  contextSwitches: number;        // Number of app/window changes in recent period
  focusScore: number;             // 0-100 focus score (higher = more focused)
  averageSessionLength: number;  // Average minutes per app session
  longestSession: number;        // Longest uninterrupted session in minutes
}

export interface DeepWorkAnalysis {
  focusScore: number;
  contextSwitches: number;
  averageSessionLength: number;
  longestSession: number;
  recommendations: string[];
}

class DeepWorkCalculator {
  // Research-backed constants
  private readonly CONTEXT_SWITCH_COST_MINUTES = 23;  // Time to regain focus after switch
  private readonly MIN_FOCUS_SESSION_MINUTES = 10;     // Minimum for "focused" session
  private readonly OPTIMAL_FOCUS_SESSION_MINUTES = 25; // Pomodoro technique

  /**
   * Calculate focus metrics for current interval
   * 
   * Uses recent activity logs to determine context switches and focus patterns
   * 
   * @param currentLog - Current activity log being created
   * @param recentLogs - Recent activity logs (last hour = 6 logs)
   * @returns Focus metrics
   */
  calculateFocusMetrics(
    currentLog: ActivityLog,
    recentLogs: ActivityLog[]
  ): FocusMetrics {
    // Count context switches (different apps in recent period)
    const contextSwitches = this.countContextSwitches(recentLogs, currentLog);
    
    // Calculate session lengths
    const sessionLengths = this.calculateSessionLengths(recentLogs, currentLog);
    const averageSessionLength = sessionLengths.length > 0
      ? sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length
      : 0;
    const longestSession = sessionLengths.length > 0
      ? Math.max(...sessionLengths)
      : 0;

    // Calculate focus score (0-100)
    // Higher score = fewer switches, longer sessions
    const focusScore = this.calculateFocusScore(
      contextSwitches,
      averageSessionLength,
      longestSession
    );

    return {
      contextSwitches,
      focusScore,
      averageSessionLength,
      longestSession
    };
  }

  /**
   * Count context switches in recent period
   * 
   * A context switch is when the active app changes between intervals
   */
  private countContextSwitches(
    recentLogs: ActivityLog[],
    currentLog: ActivityLog
  ): number {
    if (recentLogs.length === 0) {
      return 0;
    }

    // Get unique apps in recent period (including current)
    const apps = new Set<string>();
    recentLogs.forEach(log => {
      if (log.activeWindow) {
        apps.add(log.activeWindow.toLowerCase());
      }
    });
    if (currentLog.activeWindow) {
      apps.add(currentLog.activeWindow.toLowerCase());
    }

    // Context switches = number of unique apps - 1
    // (if you used 3 different apps, that's 2 switches)
    return Math.max(0, apps.size - 1);
  }

    /**
     * Calculate session lengths (consecutive intervals with same app)
     */
    private calculateSessionLengths(
        recentLogs: ActivityLog[],
        currentLog: ActivityLog
    ): number[] {
        const allLogs = [...recentLogs, currentLog].reverse(); // Most recent first
        const sessionLengths: number[] = [];
        
        if (allLogs.length === 0) {
            return [];
        }

        // Detect dev mode (1-minute intervals) vs prod (10-minute intervals)
        // Check if timestamps are close together (less than 2 minutes apart = dev mode)
        const isDevMode = allLogs.length > 1 && 
            (allLogs[0].timestamp.getTime() - allLogs[1].timestamp.getTime()) < 2 * 60 * 1000;
        const intervalMinutes = isDevMode ? 1 : 10;

        let currentApp = allLogs[0].activeWindow?.toLowerCase() || '';
        let sessionLength = 1; // 1 interval

        for (let i = 1; i < allLogs.length; i++) {
            const log = allLogs[i];
            const app = log.activeWindow?.toLowerCase() || '';

            if (app === currentApp && app !== '') {
                sessionLength++;
            } else {
                if (sessionLength > 0 && currentApp !== '') {
                    sessionLengths.push(sessionLength * intervalMinutes); // Convert to minutes
                }
                currentApp = app;
                sessionLength = 1;
            }
        }

        // Don't forget the last session
        if (sessionLength > 0 && currentApp !== '') {
            sessionLengths.push(sessionLength * intervalMinutes);
        }

        return sessionLengths;
    }

  /**
   * Calculate focus score (0-100)
   * 
   * Formula:
   * - Base score: 100
   * - Penalty for context switches: -10 per switch (capped at -50)
   * - Bonus for long sessions: +5 per 10 minutes above 20 minutes (capped at +20)
   * - Bonus for average session length: +2 per minute above 15 minutes (capped at +10)
   */
  private calculateFocusScore(
    contextSwitches: number,
    averageSessionLength: number,
    longestSession: number
  ): number {
    let score = 100;

    // Penalty for context switches
    const switchPenalty = Math.min(50, contextSwitches * 10);
    score -= switchPenalty;

    // Bonus for long sessions
    if (longestSession > 20) {
      const bonus = Math.min(20, Math.floor((longestSession - 20) / 10) * 5);
      score += bonus;
    }

    // Bonus for average session length
    if (averageSessionLength > 15) {
      const bonus = Math.min(10, Math.floor((averageSessionLength - 15)) * 2);
      score += bonus;
    }

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate recommendations based on focus metrics
   */
  generateRecommendations(metrics: FocusMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.contextSwitches > 5) {
      recommendations.push(
        `High context switching detected (${metrics.contextSwitches} switches). ` +
        `Try focusing on one task at a time to improve productivity.`
      );
    }

    if (metrics.averageSessionLength < 15) {
      recommendations.push(
        `Short work sessions (avg ${Math.round(metrics.averageSessionLength)} min). ` +
        `Try blocking 25-30 minute focus sessions for better results.`
      );
    }

    if (metrics.focusScore < 50) {
      recommendations.push(
        `Low focus score (${metrics.focusScore}/100). ` +
        `Consider using time-blocking techniques to reduce distractions.`
      );
    }

    if (metrics.longestSession > 60) {
      recommendations.push(
        `Great focus! You had a ${Math.round(metrics.longestSession)}-minute uninterrupted session. ` +
        `Remember to take breaks every 90 minutes.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Keep up the good work! Maintain your focus patterns.');
    }

    return recommendations;
  }

  /**
   * Calculate effective work time
   * 
   * Accounts for context switch costs (23 minutes per switch)
   * 
   * @param totalMinutes - Total tracked time
   * @param contextSwitches - Number of context switches
   * @returns Effective work time in minutes
   */
  calculateEffectiveWorkTime(
    totalMinutes: number,
    contextSwitches: number
  ): number {
    const lostTime = contextSwitches * this.CONTEXT_SWITCH_COST_MINUTES;
    return Math.max(0, totalMinutes - lostTime);
  }

  /**
   * Analyze deep work patterns
   * 
   * @param recentLogs - Recent activity logs
   * @param currentLog - Current log
   * @returns Deep work analysis
   */
  analyzeDeepWork(
    recentLogs: ActivityLog[],
    currentLog: ActivityLog
  ): DeepWorkAnalysis {
    const metrics = this.calculateFocusMetrics(currentLog, recentLogs);
    const recommendations = this.generateRecommendations(metrics);

    return {
      focusScore: metrics.focusScore,
      contextSwitches: metrics.contextSwitches,
      averageSessionLength: metrics.averageSessionLength,
      longestSession: metrics.longestSession,
      recommendations
    };
  }
}

// Export singleton instance
export const deepWorkCalculator = new DeepWorkCalculator();
