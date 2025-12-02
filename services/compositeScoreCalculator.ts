/**
 * Composite Productivity Score Calculator
 * 
 * Combines all individual metrics into a single weighted productivity score.
 * Uses existing ActivityLog data - no new tracking needed.
 * 
 * Scoring Components:
 * - Activity Rate (25%): Based on keystrokes + mouse clicks
 * - App Productivity (25%): Based on app classification
 * - URL Productivity (20%): Based on URL classification (overrides app for browsers)
 * - Focus Score (30%): Based on context switches and session length
 */

import { ActivityLog, ProductivityCategory } from '../types';

export interface ScoreBreakdown {
  activity: number;        // 0-100
  app: number;            // 0-100
  url: number;            // 0-100
  focus: number;          // 0-100
}

export interface CompositeScoreResult {
  score: number;                    // Final composite score (0-100)
  breakdown: ScoreBreakdown;        // Component scores
  weights: {                        // Weights used
    activity: number;
    app: number;
    url: number;
    focus: number;
  };
  classification: {
    level: 'exceptional' | 'high' | 'moderate' | 'low' | 'very_low';
    label: string;
    description: string;
    color: string;
  };
}

class CompositeScoreCalculator {
  // Default weights (can be customized)
  private defaultWeights = {
    activity: 0.25,    // 25% - Activity rate
    app: 0.25,         // 25% - App productivity
    url: 0.20,         // 20% - URL productivity
    focus: 0.30        // 30% - Focus score
  };

  /**
   * Calculate composite productivity score
   * 
   * @param log - Activity log with all metrics
   * @param customWeights - Optional custom weights
   * @returns Composite score result
   */
  calculateCompositeScore(
    log: ActivityLog,
    customWeights?: Partial<typeof this.defaultWeights>
  ): CompositeScoreResult {
    const weights = { ...this.defaultWeights, ...customWeights };

    // Calculate component scores
    const activityScore = this.calculateActivityScore(log);
    const appScore = this.calculateAppScore(log);
    const urlScore = this.calculateUrlScore(log);
    const focusScore = log.focusScore || 50; // Default to 50 if not calculated

    // Calculate weighted composite score
    const compositeScore = 
      (activityScore * weights.activity) +
      (appScore * weights.app) +
      (urlScore * weights.url) +
      (focusScore * weights.focus);

    // Round to integer
    const finalScore = Math.round(Math.max(0, Math.min(100, compositeScore)));

    // Classify score
    const classification = this.classifyScore(finalScore);

    return {
      score: finalScore,
      breakdown: {
        activity: Math.round(activityScore),
        app: Math.round(appScore),
        url: Math.round(urlScore),
        focus: Math.round(focusScore)
      },
      weights,
      classification
    };
  }

  /**
   * Calculate activity score (0-100)
   * 
   * Based on keystrokes + mouse clicks normalized to 0-100
   */
  private calculateActivityScore(log: ActivityLog): number {
    const totalEvents = log.keyboardEvents + log.mouseEvents;
    
    // Normalize: 0-10 events = 0-30, 10-50 = 30-70, 50+ = 70-100
    if (totalEvents === 0) {
      return 0;
    } else if (totalEvents < 10) {
      return (totalEvents / 10) * 30;
    } else if (totalEvents < 50) {
      return 30 + ((totalEvents - 10) / 40) * 40;
    } else {
      return 70 + Math.min(30, ((totalEvents - 50) / 5));
    }
  }

  /**
   * Calculate app productivity score (0-100)
   * 
   * Based on app classification weight
   */
  private calculateAppScore(log: ActivityLog): number {
    if (!log.appCategory) {
      return 50; // Default neutral
    }

    // Convert weight (0.0-1.0) to score (0-100)
    const weight = log.appCategoryWeight || this.getDefaultWeight(log.appCategory);
    return weight * 100;
  }

  /**
   * Calculate URL productivity score (0-100)
   * 
   * Based on URL classification weight (overrides app for browsers)
   */
  private calculateUrlScore(log: ActivityLog): number {
    // If URL is available, use URL classification (overrides app)
    if (log.urlCategory) {
      const weight = log.urlCategoryWeight || this.getDefaultWeight(log.urlCategory);
      return weight * 100;
    }

    // If no URL, use app score (for non-browser apps)
    return this.calculateAppScore(log);
  }

  /**
   * Get default weight for category
   */
  private getDefaultWeight(category: ProductivityCategory): number {
    switch (category) {
      case 'productive':
        return 1.0;
      case 'neutral':
        return 0.5;
      case 'unproductive':
        return 0.0;
      default:
        return 0.5;
    }
  }

  /**
   * Classify the composite score
   */
  private classifyScore(score: number): {
    level: 'exceptional' | 'high' | 'moderate' | 'low' | 'very_low';
    label: string;
    description: string;
    color: string;
  } {
    if (score >= 85) {
      return {
        level: 'exceptional',
        label: 'Exceptional Productivity',
        description: 'Outstanding focus and output',
        color: '#22c55e' // Green
      };
    } else if (score >= 70) {
      return {
        level: 'high',
        label: 'High Productivity',
        description: 'Strong work engagement',
        color: '#84cc16' // Lime
      };
    } else if (score >= 50) {
      return {
        level: 'moderate',
        label: 'Moderate Productivity',
        description: 'Average work engagement',
        color: '#eab308' // Yellow
      };
    } else if (score >= 30) {
      return {
        level: 'low',
        label: 'Low Productivity',
        description: 'Below average engagement',
        color: '#f97316' // Orange
      };
    } else {
      return {
        level: 'very_low',
        label: 'Very Low Productivity',
        description: 'Minimal work detected',
        color: '#ef4444' // Red
      };
    }
  }

  /**
   * Get score breakdown explanation
   */
  getScoreExplanation(result: CompositeScoreResult): string[] {
    const explanations: string[] = [];

    if (result.breakdown.activity >= 70) {
      explanations.push('High activity level - consistent computer engagement');
    } else if (result.breakdown.activity < 30) {
      explanations.push('Low activity level - consider increasing engagement');
    }

    if (result.breakdown.app >= 70) {
      explanations.push('Using productive applications');
    } else if (result.breakdown.app < 30) {
      explanations.push('Consider switching to more productive apps');
    }

    if (result.breakdown.url >= 70) {
      explanations.push('Focused browsing on work-related sites');
    } else if (result.breakdown.url < 30 && result.breakdown.url > 0) {
      explanations.push('Consider focusing browsing on work-related sites');
    }

    if (result.breakdown.focus >= 70) {
      explanations.push('Excellent focus - minimal context switching');
    } else if (result.breakdown.focus < 50) {
      explanations.push('High context switching - try longer focus sessions');
    }

    return explanations;
  }
}

// Export singleton instance
export const compositeScoreCalculator = new CompositeScoreCalculator();
