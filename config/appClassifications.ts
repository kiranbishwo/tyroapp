/**
 * Default App Classification Rules
 * 
 * Classifies applications as:
 * - 'productive': Work-related apps (IDEs, Office, Design tools)
 * - 'neutral': Context-dependent (browsers, communication - depends on usage)
 * - 'unproductive': Entertainment, social media, games
 * 
 * Users can customize these rules in settings.
 */

export type ProductivityCategory = 'productive' | 'neutral' | 'unproductive';

export interface AppClassificationRule {
  processName: string | RegExp;        // Process name to match (case-insensitive)
  titlePattern?: RegExp;               // Optional: Match window title pattern
  category: ProductivityCategory;
  weight?: number;                      // Optional: Custom weight (0.0-1.0, default based on category)
}

/**
 * Default app classifications
 * 
 * Priority: Title pattern > Process name exact match > Process name partial match
 */
export const DEFAULT_APP_CLASSIFICATIONS: AppClassificationRule[] = [
  // ============================================
  // PRODUCTIVE - Development Tools
  // ============================================
  { processName: /^code$/i, category: 'productive' },                    // VS Code
  { processName: /^code\.exe$/i, category: 'productive' },              // VS Code (Windows)
  { processName: /^webstorm/i, category: 'productive' },                // WebStorm
  { processName: /^intellij/i, category: 'productive' },                // IntelliJ IDEA
  { processName: /^pycharm/i, category: 'productive' },                  // PyCharm
  { processName: /^sublime_text/i, category: 'productive' },             // Sublime Text
  { processName: /^atom$/i, category: 'productive' },                    // Atom
  { processName: /^vim$/i, category: 'productive' },                    // Vim
  { processName: /^nvim$/i, category: 'productive' },                    // Neovim
  { processName: /^emacs/i, category: 'productive' },                    // Emacs
  { processName: /^cursor$/i, category: 'productive' },                   // Cursor IDE
  { processName: /^rider/i, category: 'productive' },                     // JetBrains Rider
  { processName: /^clion/i, category: 'productive' },                     // CLion
  { processName: /^goland/i, category: 'productive' },                    // GoLand
  { processName: /^phpstorm/i, category: 'productive' },                 // PhpStorm
  { processName: /^rubymine/i, category: 'productive' },                  // RubyMine
  { processName: /^android studio/i, category: 'productive' },            // Android Studio
  { processName: /^xcode/i, category: 'productive' },                    // Xcode
  { processName: /^visual studio/i, category: 'productive' },           // Visual Studio
  { processName: /^eclipse/i, category: 'productive' },                  // Eclipse
  { processName: /^netbeans/i, category: 'productive' },                 // NetBeans

  // ============================================
  // PRODUCTIVE - Office & Productivity
  // ============================================
  { processName: /^winword/i, category: 'productive' },                  // Microsoft Word
  { processName: /^word$/i, category: 'productive' },
  { processName: /^excel/i, category: 'productive' },                     // Microsoft Excel
  { processName: /^powerpnt/i, category: 'productive' },                  // Microsoft PowerPoint
  { processName: /^powerpoint$/i, category: 'productive' },
  { processName: /^outlook/i, category: 'productive' },                  // Microsoft Outlook
  { processName: /^onenote/i, category: 'productive' },                  // OneNote
  { processName: /^notion/i, category: 'productive' },                    // Notion
  { processName: /^obsidian/i, category: 'productive' },                 // Obsidian
  { processName: /^roam research/i, category: 'productive' },           // Roam Research
  { processName: /^logseq/i, category: 'productive' },                    // Logseq
  { processName: /^remnote/i, category: 'productive' },                   // RemNote
  { processName: /^evernote/i, category: 'productive' },                 // Evernote
  { processName: /^onenote/i, category: 'productive' },                   // OneNote

  // ============================================
  // PRODUCTIVE - Design Tools
  // ============================================
  { processName: /^figma/i, category: 'productive' },                    // Figma
  { processName: /^sketch/i, category: 'productive' },                    // Sketch
  { processName: /^photoshop/i, category: 'productive' },                // Adobe Photoshop
  { processName: /^illustrator/i, category: 'productive' },              // Adobe Illustrator
  { processName: /^indesign/i, category: 'productive' },                  // Adobe InDesign
  { processName: /^xd$/i, category: 'productive' },                     // Adobe XD
  { processName: /^after effects/i, category: 'productive' },             // After Effects
  { processName: /^premiere/i, category: 'productive' },                 // Premiere Pro
  { processName: /^blender/i, category: 'productive' },                   // Blender
  { processName: /^cinema 4d/i, category: 'productive' },                 // Cinema 4D
  { processName: /^maya/i, category: 'productive' },                     // Maya
  { processName: /^3ds max/i, category: 'productive' },                  // 3ds Max

  // ============================================
  // PRODUCTIVE - Terminal & DevOps
  // ============================================
  { processName: /^terminal$/i, category: 'productive' },                 // Terminal (macOS)
  { processName: /^iterm/i, category: 'productive' },                    // iTerm2
  { processName: /^windows terminal/i, category: 'productive' },         // Windows Terminal
  { processName: /^wt\.exe$/i, category: 'productive' },                  // Windows Terminal
  { processName: /^powershell/i, category: 'productive' },                // PowerShell
  { processName: /^pwsh/i, category: 'productive' },                     // PowerShell Core
  { processName: /^cmd\.exe$/i, category: 'productive' },                 // Command Prompt
  { processName: /^wsl/i, category: 'productive' },                      // WSL
  { processName: /^docker/i, category: 'productive' },                   // Docker Desktop
  { processName: /^postman/i, category: 'productive' },                  // Postman
  { processName: /^insomnia/i, category: 'productive' },                 // Insomnia
  { processName: /^dbeaver/i, category: 'productive' },                  // DBeaver
  { processName: /^tableplus/i, category: 'productive' },                // TablePlus
  { processName: /^datagrip/i, category: 'productive' },                 // DataGrip

  // ============================================
  // PRODUCTIVE - Project Management & Collaboration
  // ============================================
  { processName: /^jira/i, category: 'productive' },                    // Jira
  { processName: /^confluence/i, category: 'productive' },                // Confluence
  { processName: /^linear/i, category: 'productive' },                    // Linear
  { processName: /^asana/i, category: 'productive' },                    // Asana
  { processName: /^trello/i, category: 'productive' },                   // Trello
  { processName: /^monday/i, category: 'productive' },                   // Monday.com
  { processName: /^clickup/i, category: 'productive' },                   // ClickUp
  { processName: /^airtable/i, category: 'productive' },                 // Airtable

  // ============================================
  // NEUTRAL - Browsers (URL classification will override)
  // ============================================
  { processName: /^chrome/i, category: 'neutral' },                      // Google Chrome
  { processName: /^firefox/i, category: 'neutral' },                    // Firefox
  { processName: /^safari/i, category: 'neutral' },                      // Safari
  { processName: /^msedge/i, category: 'neutral' },                     // Microsoft Edge
  { processName: /^edge/i, category: 'neutral' },
  { processName: /^brave/i, category: 'neutral' },                      // Brave
  { processName: /^opera/i, category: 'neutral' },                      // Opera
  { processName: /^vivaldi/i, category: 'neutral' },                    // Vivaldi
  { processName: /^arc/i, category: 'neutral' },                        // Arc Browser

  // ============================================
  // NEUTRAL - Communication (context-dependent)
  // ============================================
  { processName: /^slack/i, category: 'neutral' },                        // Slack
  { processName: /^teams/i, category: 'neutral' },                        // Microsoft Teams
  { processName: /^zoom/i, category: 'neutral' },                       // Zoom
  { processName: /^discord/i, category: 'neutral' },                    // Discord
  { processName: /^whatsapp/i, category: 'neutral' },                   // WhatsApp
  { processName: /^telegram/i, category: 'neutral' },                   // Telegram
  { processName: /^signal/i, category: 'neutral' },                     // Signal
  { processName: /^skype/i, category: 'neutral' },                      // Skype
  { processName: /^webex/i, category: 'neutral' },                      // WebEx
  { processName: /^gotomeeting/i, category: 'neutral' },                // GoToMeeting
  { processName: /^google meet/i, category: 'neutral' },                 // Google Meet
  { processName: /^microsoft teams/i, category: 'neutral' },              // Microsoft Teams

  // ============================================
  // UNPRODUCTIVE - Entertainment & Social Media
  // ============================================
  { processName: /^spotify/i, category: 'unproductive', weight: 0.8 },   // Spotify (music while working is OK)
  { processName: /^netflix/i, category: 'unproductive' },                // Netflix
  { processName: /^steam/i, category: 'unproductive' },                  // Steam
  { processName: /^epicgameslauncher/i, category: 'unproductive' },     // Epic Games
  { processName: /^battle\.net/i, category: 'unproductive' },            // Battle.net
  { processName: /^origin/i, category: 'unproductive' },                 // Origin
  { processName: /^uplay/i, category: 'unproductive' },                 // Uplay
  { processName: /^discord/i, titlePattern: /gaming|game|stream/i, category: 'unproductive' }, // Discord gaming
  { processName: /^twitch/i, category: 'unproductive' },                  // Twitch
  { processName: /^obs$/i, category: 'neutral' },                        // OBS Studio (could be work-related)

  // ============================================
  // UNPRODUCTIVE - Social Media Apps
  // ============================================
  { processName: /^instagram/i, category: 'unproductive' },              // Instagram
  { processName: /^facebook/i, category: 'unproductive' },               // Facebook
  { processName: /^twitter/i, category: 'unproductive' },                // Twitter
  { processName: /^tiktok/i, category: 'unproductive' },                 // TikTok
  { processName: /^snapchat/i, category: 'unproductive' },                // Snapchat
  { processName: /^reddit/i, category: 'unproductive' },                 // Reddit (can be productive, but default unproductive)
  { processName: /^pinterest/i, category: 'unproductive' },             // Pinterest
  { processName: /^linkedin/i, category: 'neutral' },                    // LinkedIn (professional, but can be distraction)

  // ============================================
  // Browser Title Patterns (for context-specific classification)
  // ============================================
  // These override browser classification based on title
  { 
    processName: /^(chrome|firefox|safari|msedge|edge|brave|opera)/i, 
    titlePattern: /youtube|netflix|twitch|hulu|disney\+|prime video/i, 
    category: 'unproductive' 
  },
  { 
    processName: /^(chrome|firefox|safari|msedge|edge|brave|opera)/i, 
    titlePattern: /github|stackoverflow|docs\.|developer\.|learn\.|tutorial/i, 
    category: 'productive' 
  },
  { 
    processName: /^(chrome|firefox|safari|msedge|edge|brave|opera)/i, 
    titlePattern: /facebook|instagram|twitter|tiktok|snapchat/i, 
    category: 'unproductive' 
  },
];

/**
 * Get default weight for a category
 */
export function getDefaultWeight(category: ProductivityCategory): number {
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
