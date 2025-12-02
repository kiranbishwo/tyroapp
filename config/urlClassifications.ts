/**
 * Default URL Classification Rules
 * 
 * Classifies URLs/domains as:
 * - 'productive': Work-related sites (GitHub, Stack Overflow, documentation)
 * - 'neutral': Context-dependent (search engines, email, communication)
 * - 'unproductive': Entertainment, social media, distractions
 * 
 * Users can customize these rules in settings.
 */

import { ProductivityCategory } from './appClassifications';

export interface UrlClassificationRule {
  domainPattern: string | RegExp;      // Domain to match (e.g., "github.com" or /github\.com/i)
  pathPattern?: RegExp;                 // Optional: Match URL path pattern
  category: ProductivityCategory;
  weight?: number;                      // Optional: Custom weight (0.0-1.0)
}

/**
 * Default URL classifications
 * 
 * Priority: Path pattern > Exact domain > Regex domain > Subdomain
 */
export const DEFAULT_URL_CLASSIFICATIONS: UrlClassificationRule[] = [
  // ============================================
  // PRODUCTIVE - Development & Documentation
  // ============================================
  { domainPattern: 'github.com', category: 'productive' },
  { domainPattern: 'gitlab.com', category: 'productive' },
  { domainPattern: 'bitbucket.org', category: 'productive' },
  { domainPattern: 'stackoverflow.com', category: 'productive' },
  { domainPattern: 'stackexchange.com', category: 'productive' },
  { domainPattern: 'developer.mozilla.org', category: 'productive' },
  { domainPattern: 'docs.microsoft.com', category: 'productive' },
  { domainPattern: 'cloud.google.com', category: 'productive' },
  { domainPattern: 'aws.amazon.com', category: 'productive' },
  { domainPattern: 'azure.microsoft.com', category: 'productive' },
  { domainPattern: 'npmjs.com', category: 'productive' },
  { domainPattern: 'pypi.org', category: 'productive' },
  { domainPattern: 'crates.io', category: 'productive' },
  { domainPattern: 'nuget.org', category: 'productive' },
  { domainPattern: /^docs\..+/, category: 'productive' },              // docs.*
  { domainPattern: /.*\.readthedocs\.io/, category: 'productive' },     // *.readthedocs.io
  { domainPattern: /.*\.github\.io/, category: 'productive' },         // GitHub Pages
  { domainPattern: 'dev.to', category: 'productive' },
  { domainPattern: 'medium.com', pathPattern: /\/@.*\/.*(code|dev|tech|programming|software)/i, category: 'productive' },
  { domainPattern: 'hackernoon.com', category: 'productive' },
  { domainPattern: 'freecodecamp.org', category: 'productive' },
  { domainPattern: 'codecademy.com', category: 'productive' },
  { domainPattern: 'w3schools.com', category: 'productive' },
  { domainPattern: 'mdn.io', category: 'productive' },
  { domainPattern: 'caniuse.com', category: 'productive' },

  // ============================================
  // PRODUCTIVE - Design & Productivity Tools
  // ============================================
  { domainPattern: 'figma.com', category: 'productive' },
  { domainPattern: 'notion.so', category: 'productive' },
  { domainPattern: 'airtable.com', category: 'productive' },
  { domainPattern: 'trello.com', category: 'productive' },
  { domainPattern: 'asana.com', category: 'productive' },
  { domainPattern: 'linear.app', category: 'productive' },
  { domainPattern: 'jira.atlassian.com', category: 'productive' },
  { domainPattern: 'confluence.atlassian.com', category: 'productive' },
  { domainPattern: 'monday.com', category: 'productive' },
  { domainPattern: 'clickup.com', category: 'productive' },
  { domainPattern: 'miro.com', category: 'productive' },
  { domainPattern: 'whimsical.com', category: 'productive' },
  { domainPattern: 'draw.io', category: 'productive' },
  { domainPattern: 'diagrams.net', category: 'productive' },

  // ============================================
  // PRODUCTIVE - Learning & Education
  // ============================================
  { domainPattern: 'coursera.org', category: 'productive' },
  { domainPattern: 'udemy.com', category: 'productive' },
  { domainPattern: 'pluralsight.com', category: 'productive' },
  { domainPattern: 'leetcode.com', category: 'productive' },
  { domainPattern: 'hackerrank.com', category: 'productive' },
  { domainPattern: 'codewars.com', category: 'productive' },
  { domainPattern: 'exercism.io', category: 'productive' },
  { domainPattern: 'khanacademy.org', category: 'productive' },
  { domainPattern: 'edx.org', category: 'productive' },
  { domainPattern: 'udacity.com', category: 'productive' },

  // ============================================
  // PRODUCTIVE - Cloud & Infrastructure
  // ============================================
  { domainPattern: 'vercel.com', category: 'productive' },
  { domainPattern: 'netlify.com', category: 'productive' },
  { domainPattern: 'heroku.com', category: 'productive' },
  { domainPattern: 'digitalocean.com', category: 'productive' },
  { domainPattern: 'linode.com', category: 'productive' },
  { domainPattern: 'cloudflare.com', category: 'productive' },
  { domainPattern: 'docker.com', category: 'productive' },
  { domainPattern: 'kubernetes.io', category: 'productive' },

  // ============================================
  // NEUTRAL - Search & Communication
  // ============================================
  { domainPattern: 'google.com', category: 'neutral' },
  { domainPattern: 'duckduckgo.com', category: 'neutral' },
  { domainPattern: 'bing.com', category: 'neutral' },
  { domainPattern: 'mail.google.com', category: 'neutral' },
  { domainPattern: 'gmail.com', category: 'neutral' },
  { domainPattern: 'outlook.office.com', category: 'neutral' },
  { domainPattern: 'outlook.live.com', category: 'neutral' },
  { domainPattern: 'slack.com', category: 'neutral' },
  { domainPattern: 'teams.microsoft.com', category: 'neutral' },
  { domainPattern: 'zoom.us', category: 'neutral' },
  { domainPattern: 'webex.com', category: 'neutral' },
  { domainPattern: 'gotomeeting.com', category: 'neutral' },
  { domainPattern: 'meet.google.com', category: 'neutral' },

  // ============================================
  // NEUTRAL - Reference (context-dependent)
  // ============================================
  { domainPattern: 'wikipedia.org', category: 'neutral' },
  { domainPattern: 'medium.com', category: 'neutral' },                  // Default neutral, path pattern can override
  { domainPattern: 'reddit.com', pathPattern: /\/r\/(programming|webdev|javascript|python|learnprogramming|MachineLearning|web_design)/i, category: 'neutral', weight: 0.6 },
  { domainPattern: 'youtube.com', pathPattern: /\/playlist.*list=.*(learn|tutorial|course|training)/i, category: 'productive', weight: 0.8 },
  { domainPattern: 'youtube.com', pathPattern: /\/watch\?v=.*(tutorial|course|learn|how to|guide)/i, category: 'neutral', weight: 0.6 },

  // ============================================
  // UNPRODUCTIVE - Social Media
  // ============================================
  { domainPattern: 'facebook.com', category: 'unproductive' },
  { domainPattern: 'instagram.com', category: 'unproductive' },
  { domainPattern: 'twitter.com', category: 'unproductive' },
  { domainPattern: 'x.com', category: 'unproductive' },
  { domainPattern: 'tiktok.com', category: 'unproductive' },
  { domainPattern: 'snapchat.com', category: 'unproductive' },
  { domainPattern: 'pinterest.com', category: 'unproductive' },
  { domainPattern: 'reddit.com', category: 'unproductive', weight: 0.3 },  // Default unproductive, path pattern can override
  { domainPattern: 'linkedin.com', pathPattern: /\/feed|\/in\/|\/company\//i, category: 'neutral' }, // LinkedIn feed is neutral
  { domainPattern: 'linkedin.com', category: 'unproductive' },            // Other LinkedIn pages

  // ============================================
  // UNPRODUCTIVE - Entertainment
  // ============================================
  { domainPattern: 'youtube.com', category: 'unproductive', weight: 0.2 }, // Default unproductive, path pattern can override
  { domainPattern: 'netflix.com', category: 'unproductive' },
  { domainPattern: 'twitch.tv', category: 'unproductive' },
  { domainPattern: 'hulu.com', category: 'unproductive' },
  { domainPattern: 'disneyplus.com', category: 'unproductive' },
  { domainPattern: 'primevideo.com', category: 'unproductive' },
  { domainPattern: 'hbo.com', category: 'unproductive' },
  { domainPattern: 'hbonow.com', category: 'unproductive' },
  { domainPattern: 'crunchyroll.com', category: 'unproductive' },
  { domainPattern: 'funimation.com', category: 'unproductive' },

  // ============================================
  // UNPRODUCTIVE - Gaming
  // ============================================
  { domainPattern: 'steamcommunity.com', category: 'unproductive' },
  { domainPattern: 'steampowered.com', category: 'unproductive' },
  { domainPattern: 'epicgames.com', category: 'unproductive' },
  { domainPattern: 'battle.net', category: 'unproductive' },
  { domainPattern: 'origin.com', category: 'unproductive' },
  { domainPattern: 'uplay.com', category: 'unproductive' },
  { domainPattern: 'roblox.com', category: 'unproductive' },
  { domainPattern: 'minecraft.net', category: 'unproductive' },

  // ============================================
  // UNPRODUCTIVE - News & Distractions
  // ============================================
  { domainPattern: 'buzzfeed.com', category: 'unproductive' },
  { domainPattern: 'tmz.com', category: 'unproductive' },
  { domainPattern: 'dailymail.co.uk', category: 'unproductive' },
  { domainPattern: 'thesun.co.uk', category: 'unproductive' },
];

/**
 * Get default weight for a category
 */
export function getUrlDefaultWeight(category: ProductivityCategory): number {
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
