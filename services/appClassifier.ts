/**
 * App Classifier Service
 * 
 * Classifies applications as productive, neutral, or unproductive
 * based on process name and window title patterns.
 * 
 * Uses in-memory cache for fast lookups.
 */

import { 
  ProductivityCategory, 
  AppClassificationRule, 
  DEFAULT_APP_CLASSIFICATIONS,
  getDefaultWeight 
} from '../config/appClassifications';

export interface AppClassificationResult {
  category: ProductivityCategory;
  weight: number;
  matchType: 'title_pattern' | 'process_exact' | 'process_partial' | 'none';
  confidence: number;
  matchedRule?: AppClassificationRule;
}

class AppClassifier {
  private classificationCache: Map<string, AppClassificationResult> = new Map();
  private rules: AppClassificationRule[] = [...DEFAULT_APP_CLASSIFICATIONS];
  private userCustomRules: AppClassificationRule[] = [];

  constructor() {
    // Pre-compile regex patterns for performance
    this.rules = this.rules.map(rule => ({
      ...rule,
      processName: typeof rule.processName === 'string' 
        ? new RegExp(`^${rule.processName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        : rule.processName
    }));
  }

  /**
   * Add user custom classification rules
   * User rules take precedence over default rules
   */
  addCustomRules(rules: AppClassificationRule[]): void {
    this.userCustomRules = rules.map(rule => ({
      ...rule,
      processName: typeof rule.processName === 'string' 
        ? new RegExp(`^${rule.processName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        : rule.processName
    }));
    // Clear cache when rules change
    this.classificationCache.clear();
  }

  /**
   * Classify an application
   * 
   * @param processName - Process name (e.g., "code.exe", "chrome")
   * @param windowTitle - Optional window title for context-specific classification
   * @returns Classification result
   */
  classifyApp(
    processName: string, 
    windowTitle?: string
  ): AppClassificationResult {
    // Create cache key
    const cacheKey = `${processName.toLowerCase()}|${windowTitle || ''}`;
    
    // Check cache first
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey)!;
    }

    const normalizedProcessName = processName.toLowerCase().trim();
    const normalizedTitle = windowTitle?.toLowerCase().trim() || '';

    // Combine user rules (priority) with default rules
    const allRules = [...this.userCustomRules, ...this.rules];

    // Step 1: Check title patterns first (most specific)
    for (const rule of allRules) {
      const processMatches = this.matchProcessName(rule.processName, normalizedProcessName);
      
      if (processMatches && rule.titlePattern) {
        if (rule.titlePattern.test(normalizedTitle)) {
          const result: AppClassificationResult = {
            category: rule.category,
            weight: rule.weight ?? getDefaultWeight(rule.category),
            matchType: 'title_pattern',
            confidence: 0.95,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Step 2: Check exact process name match
    for (const rule of allRules) {
      const processMatches = this.matchProcessName(rule.processName, normalizedProcessName);
      
      if (processMatches && !rule.titlePattern) {
        const result: AppClassificationResult = {
          category: rule.category,
          weight: rule.weight ?? getDefaultWeight(rule.category),
          matchType: 'process_exact',
          confidence: 0.9,
          matchedRule: rule
        };
        this.classificationCache.set(cacheKey, result);
        return result;
      }
    }

    // Step 3: Check partial match (e.g., "code" matches "code.exe")
    for (const rule of allRules) {
      if (rule.titlePattern) continue; // Skip title-pattern rules for partial matching
      
      const processPattern = rule.processName;
      if (processPattern instanceof RegExp) {
        if (processPattern.test(normalizedProcessName)) {
          const result: AppClassificationResult = {
            category: rule.category,
            weight: rule.weight ?? getDefaultWeight(rule.category),
            matchType: 'process_partial',
            confidence: 0.7,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      } else if (typeof processPattern === 'string') {
        const patternLower = processPattern.toLowerCase();
        if (normalizedProcessName.includes(patternLower) || patternLower.includes(normalizedProcessName)) {
          const result: AppClassificationResult = {
            category: rule.category,
            weight: rule.weight ?? getDefaultWeight(rule.category),
            matchType: 'process_partial',
            confidence: 0.7,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Step 4: Unknown app - default to neutral
    const result: AppClassificationResult = {
      category: 'neutral',
      weight: getDefaultWeight('neutral'),
      matchType: 'none',
      confidence: 0.0
    };
    this.classificationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Match process name against rule pattern
   */
  private matchProcessName(
    pattern: string | RegExp, 
    processName: string
  ): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(processName);
    }
    if (typeof pattern === 'string') {
      // Exact match (case-insensitive)
      return pattern.toLowerCase() === processName;
    }
    return false;
  }

  /**
   * Clear classification cache
   * Useful when rules are updated
   */
  clearCache(): void {
    this.classificationCache.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.classificationCache.size,
      keys: Array.from(this.classificationCache.keys())
    };
  }
}

// Export singleton instance
export const appClassifier = new AppClassifier();
