/**
 * URL Classifier Service
 * 
 * Classifies URLs/domains as productive, neutral, or unproductive
 * based on domain and path patterns.
 * 
 * Uses in-memory cache for fast lookups.
 */

import { 
  ProductivityCategory, 
  getDefaultWeight 
} from '../config/appClassifications';
import {
  UrlClassificationRule,
  DEFAULT_URL_CLASSIFICATIONS,
  getUrlDefaultWeight
} from '../config/urlClassifications';

export interface UrlClassificationResult {
  domain: string;
  path: string;
  category: ProductivityCategory;
  weight: number;
  matchType: 'path_pattern' | 'exact_domain' | 'regex_domain' | 'subdomain' | 'none';
  confidence: number;
  matchedRule?: UrlClassificationRule;
}

class UrlClassifier {
  private classificationCache: Map<string, UrlClassificationResult> = new Map();
  private rules: UrlClassificationRule[] = [...DEFAULT_URL_CLASSIFICATIONS];
  private userCustomRules: UrlClassificationRule[] = [];

  constructor() {
    // Pre-compile string patterns to regex for performance
    this.rules = this.rules.map(rule => ({
      ...rule,
      domainPattern: typeof rule.domainPattern === 'string' 
        ? new RegExp(`^${this.escapeRegex(rule.domainPattern)}$`, 'i')
        : rule.domainPattern
    }));
  }

  /**
   * Add user custom classification rules
   * User rules take precedence over default rules
   */
  addCustomRules(rules: UrlClassificationRule[]): void {
    this.userCustomRules = rules.map(rule => ({
      ...rule,
      domainPattern: typeof rule.domainPattern === 'string' 
        ? new RegExp(`^${this.escapeRegex(rule.domainPattern)}$`, 'i')
        : rule.domainPattern
    }));
    // Clear cache when rules change
    this.classificationCache.clear();
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove 'www.' for consistent matching
      return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      // Handle malformed URLs
      return url.toLowerCase();
    }
  }

  /**
   * Extract path from URL (pathname + search)
   */
  extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
      return '';
    }
  }

  /**
   * Classify a URL
   * 
   * @param url - Full URL or domain string
   * @returns Classification result
   */
  classifyUrl(url: string): UrlClassificationResult {
    if (!url || url.trim() === '') {
      return {
        domain: '',
        path: '',
        category: 'neutral',
        weight: getUrlDefaultWeight('neutral'),
        matchType: 'none',
        confidence: 0.0
      };
    }

    // Normalize URL (add https:// if missing)
    let normalizedUrl = url.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const domain = this.extractDomain(normalizedUrl);
    const path = this.extractPath(normalizedUrl);
    
    // Create cache key
    const cacheKey = `${domain}|${path}`;
    
    // Check cache first
    if (this.classificationCache.has(cacheKey)) {
      return this.classificationCache.get(cacheKey)!;
    }

    // Combine user rules (priority) with default rules
    const allRules = [...this.userCustomRules, ...this.rules];

    // Step 1: Check path-specific rules first (most specific)
    for (const rule of allRules) {
      if (rule.pathPattern) {
        const domainMatches = this.matchDomain(rule.domainPattern, domain);
        
        if (domainMatches && rule.pathPattern.test(path)) {
          const result: UrlClassificationResult = {
            domain,
            path,
            category: rule.category,
            weight: rule.weight ?? getUrlDefaultWeight(rule.category),
            matchType: 'path_pattern',
            confidence: 0.95,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Step 2: Check exact domain match
    for (const rule of allRules) {
      if (!rule.pathPattern) {
        const domainMatches = this.matchDomain(rule.domainPattern, domain);
        
        if (domainMatches) {
          const result: UrlClassificationResult = {
            domain,
            path,
            category: rule.category,
            weight: rule.weight ?? getUrlDefaultWeight(rule.category),
            matchType: 'exact_domain',
            confidence: 0.9,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Step 3: Check regex patterns
    for (const rule of allRules) {
      if (rule.domainPattern instanceof RegExp && !rule.pathPattern) {
        if (rule.domainPattern.test(domain)) {
          const result: UrlClassificationResult = {
            domain,
            path,
            category: rule.category,
            weight: rule.weight ?? getUrlDefaultWeight(rule.category),
            matchType: 'regex_domain',
            confidence: 0.8,
            matchedRule: rule
          };
          this.classificationCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // Step 4: Check subdomain patterns (e.g., "docs.company.com")
    const domainParts = domain.split('.');
    if (domainParts.length > 2) {
      const baseDomain = domainParts.slice(-2).join('.');
      
      for (const rule of allRules) {
        if (!rule.pathPattern) {
          const domainMatches = this.matchDomain(rule.domainPattern, baseDomain);
          
          if (domainMatches) {
            const result: UrlClassificationResult = {
              domain,
              path,
              category: rule.category,
              weight: (rule.weight ?? getUrlDefaultWeight(rule.category)) * 0.9, // Slight penalty for subdomain
              matchType: 'subdomain',
              confidence: 0.7,
              matchedRule: rule
            };
            this.classificationCache.set(cacheKey, result);
            return result;
          }
        }
      }
    }

    // Step 5: Unknown URL - default to neutral
    const result: UrlClassificationResult = {
      domain,
      path,
      category: 'neutral',
      weight: getUrlDefaultWeight('neutral'),
      matchType: 'none',
      confidence: 0.0
    };
    this.classificationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Match domain against pattern
   */
  private matchDomain(
    pattern: string | RegExp, 
    domain: string
  ): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(domain);
    }
    if (typeof pattern === 'string') {
      return pattern.toLowerCase() === domain;
    }
    return false;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear classification cache
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
export const urlClassifier = new UrlClassifier();
