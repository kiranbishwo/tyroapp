import React from 'react';

interface CalculationDetailsProps {
    onClose: () => void;
}

export const CalculationDetails: React.FC<CalculationDetailsProps> = ({ onClose }) => {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col font-sans">
            <div className="w-full max-w-6xl bg-gray-900 shadow-2xl flex flex-col overflow-hidden border-x border-gray-800 mx-auto h-screen">
                {/* Header */}
                <header className="bg-gray-800 p-3 sm:p-4 flex items-center justify-between shadow-md">
                    <h2 className="text-lg sm:text-xl font-bold text-white">Metrics Explained</h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center transition-colors"
                    >
                        <i className="fas fa-times text-xs sm:text-sm"></i>
                    </button>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 custom-scrollbar space-y-4 sm:space-y-6">
                    {/* Introduction */}
                    <section className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-500/30">
                        <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-brain text-blue-400 text-xl"></i>
                            <h3 className="text-lg font-bold text-white">TyroDesk Productivity Metrics</h3>
                        </div>
                        <p className="text-sm text-gray-300">
                            This page explains how your productivity metrics are calculated and what they mean. 
                            Understanding these metrics helps you improve your work habits and productivity.
                        </p>
                    </section>

                    {/* Composite Score */}
                    <section className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-2 sm:mb-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                                <i className="fas fa-chart-line text-white text-xs sm:text-sm"></i>
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base sm:text-lg font-bold text-white">Composite Score</h3>
                                <p className="text-[10px] sm:text-xs text-gray-400">Overall Productivity (0-100%)</p>
                            </div>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-300 mb-2 sm:mb-3">
                            The <strong className="text-yellow-400">Composite Score</strong> is your overall productivity rating. 
                            It combines all individual metrics into a single number that represents how productive you were.
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Formula:</p>
                            <p className="text-sm text-gray-300 font-mono">
                                Composite = (Activity × 25%) + (App × 25%) + (URL × 20%) + (Focus × 30%)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-gray-300"><strong>85-100%:</strong> Exceptional Productivity</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-lime-500"></span>
                                <span className="text-gray-300"><strong>70-84%:</strong> High Productivity</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                <span className="text-gray-300"><strong>50-69%:</strong> Moderate Productivity</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                <span className="text-gray-300"><strong>30-49%:</strong> Low Productivity</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-gray-300"><strong>0-29%:</strong> Very Low Productivity</span>
                            </div>
                        </div>
                    </section>

                    {/* Activity Score */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                                <i className="fas fa-keyboard text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Activity Score</h3>
                                <p className="text-xs text-gray-400">Weight: 25%</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Measures how <strong className="text-blue-400">actively</strong> you were using your computer. 
                            Based on keystrokes and mouse clicks.
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Calculation:</p>
                            <p className="text-sm text-gray-300">
                                Activity = (Keystrokes + Mouse Clicks) / Expected Activity Level
                            </p>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                            <p><strong>High (80-100%):</strong> Very active computer use</p>
                            <p><strong>Moderate (50-79%):</strong> Normal activity level</p>
                            <p><strong>Low (0-49%):</strong> Minimal activity (may indicate idle time)</p>
                        </div>
                        <div className="mt-3 p-2 bg-blue-900/20 rounded border border-blue-500/30">
                            <p className="text-xs text-blue-300">
                                <i className="fas fa-info-circle mr-1"></i>
                                <strong>Note:</strong> Thinking time (no typing) is valuable but won't increase this score. 
                                This metric focuses on physical activity.
                            </p>
                        </div>
                    </section>

                    {/* App Score */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                <i className="fas fa-window-maximize text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">App Score</h3>
                                <p className="text-xs text-gray-400">Weight: 25%</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Measures the <strong className="text-green-400">productivity</strong> of applications you used. 
                            Each app is classified as productive, neutral, or unproductive.
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Classification:</p>
                            <div className="space-y-1 text-xs text-gray-300">
                                <p><span className="text-green-400">●</span> <strong>Productive (100%):</strong> VS Code, Office, Design tools</p>
                                <p><span className="text-yellow-400">●</span> <strong>Neutral (50%):</strong> Browsers, Communication apps</p>
                                <p><span className="text-red-400">●</span> <strong>Unproductive (0%):</strong> Entertainment, Social media</p>
                            </div>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                            <p><strong>High (80-100%):</strong> Mostly productive apps</p>
                            <p><strong>Moderate (50-79%):</strong> Mix of productive and neutral apps</p>
                            <p><strong>Low (0-49%):</strong> Mostly unproductive apps</p>
                        </div>
                        <div className="mt-3 p-2 bg-green-900/20 rounded border border-green-500/30">
                            <p className="text-xs text-green-300">
                                <i className="fas fa-lightbulb mr-1"></i>
                                <strong>Tip:</strong> Use more productive apps (VS Code, Office tools) to increase this score.
                            </p>
                        </div>
                    </section>

                    {/* URL Score */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center">
                                <i className="fas fa-globe text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">URL Score</h3>
                                <p className="text-xs text-gray-400">Weight: 20%</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Measures the <strong className="text-yellow-400">productivity</strong> of websites you visited. 
                            Only applies when using browsers (Chrome, Firefox, Edge, etc.).
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Classification:</p>
                            <div className="space-y-1 text-xs text-gray-300">
                                <p><span className="text-green-400">●</span> <strong>Productive (100%):</strong> GitHub, Stack Overflow, Documentation</p>
                                <p><span className="text-yellow-400">●</span> <strong>Neutral (50%):</strong> Google Search, News sites</p>
                                <p><span className="text-red-400">●</span> <strong>Unproductive (0%):</strong> Social media, Entertainment</p>
                            </div>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                            <p><strong>High (80-100%):</strong> Mostly productive websites</p>
                            <p><strong>Moderate (50-79%):</strong> Mix of productive and neutral sites</p>
                            <p><strong>Low (0-49%):</strong> Mostly unproductive sites</p>
                        </div>
                        <div className="mt-3 p-2 bg-yellow-900/20 rounded border border-yellow-500/30">
                            <p className="text-xs text-yellow-300">
                                <i className="fas fa-lightbulb mr-1"></i>
                                <strong>Tip:</strong> Visit more work-related sites (GitHub, Stack Overflow) to increase this score.
                            </p>
                        </div>
                    </section>

                    {/* Focus Score */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
                                <i className="fas fa-bullseye text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Focus Score</h3>
                                <p className="text-xs text-gray-400">Weight: 30%</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Measures how <strong className="text-purple-400">focused</strong> you were by tracking app switching. 
                            Fewer switches = higher focus = better productivity.
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Calculation:</p>
                            <p className="text-sm text-gray-300">
                                Focus = 100% - (Context Switches × Penalty) - (Short Sessions × Penalty)
                            </p>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                            <p><strong>Excellent (80-100%):</strong> Minimal app switching, long sessions</p>
                            <p><strong>Good (60-79%):</strong> Moderate switching, decent session lengths</p>
                            <p><strong>Moderate (40-59%):</strong> Frequent switching, short sessions</p>
                            <p><strong>Low (0-39%):</strong> Very frequent switching, very short sessions</p>
                        </div>
                        <div className="mt-3 p-2 bg-purple-900/20 rounded border border-purple-500/30">
                            <p className="text-xs text-purple-300">
                                <i className="fas fa-info-circle mr-1"></i>
                                <strong>Research:</strong> Each context switch costs ~23 minutes to regain full focus. 
                                Minimizing switches improves productivity significantly.
                            </p>
                        </div>
                    </section>

                    {/* Context Switches */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                                <i className="fas fa-exchange-alt text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Context Switches</h3>
                                <p className="text-xs text-gray-400">Number of App Changes</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Counts how many times you <strong className="text-orange-400">switched</strong> between different applications. 
                            Lower is better for productivity.
                        </p>
                        <div className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-3">
                            <p className="text-xs font-mono text-gray-400 mb-2">Example:</p>
                            <p className="text-sm text-gray-300">
                                VS Code → Chrome → VS Code → Slack = <strong>3 context switches</strong>
                            </p>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                            <p><strong>0 switches:</strong> Perfect! Stayed focused on same app(s)</p>
                            <p><strong>1-3 switches:</strong> Good focus, minimal switching</p>
                            <p><strong>4-6 switches:</strong> Moderate switching</p>
                            <p><strong>7+ switches:</strong> High switching (may indicate distraction)</p>
                        </div>
                        <div className="mt-3 p-2 bg-orange-900/20 rounded border border-orange-500/30">
                            <p className="text-xs text-orange-300">
                                <i className="fas fa-exclamation-triangle mr-1"></i>
                                <strong>Impact:</strong> Each switch interrupts your flow and requires mental effort to refocus. 
                                Try to batch similar tasks together.
                            </p>
                        </div>
                    </section>

                    {/* Category Distribution */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center">
                                <i className="fas fa-chart-pie text-white"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Category Distribution</h3>
                                <p className="text-xs text-gray-400">Time Split by Category</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">
                            Shows how your time was <strong className="text-indigo-400">distributed</strong> across different 
                            productivity categories (Productive, Neutral, Unproductive).
                        </p>
                        <div className="space-y-3">
                            <div className="bg-green-900/20 p-3 rounded border border-green-500/30">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                    <span className="text-sm font-bold text-green-400">Productive</span>
                                </div>
                                <p className="text-xs text-gray-300">
                                    VS Code, Office apps, Design tools, GitHub, Stack Overflow, Documentation sites
                                </p>
                            </div>
                            <div className="bg-yellow-900/20 p-3 rounded border border-yellow-500/30">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                                    <span className="text-sm font-bold text-yellow-400">Neutral</span>
                                </div>
                                <p className="text-xs text-gray-300">
                                    Browsers, Communication apps (Slack, Teams), Search engines, News sites
                                </p>
                            </div>
                            <div className="bg-red-900/20 p-3 rounded border border-red-500/30">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                    <span className="text-sm font-bold text-red-400">Unproductive</span>
                                </div>
                                <p className="text-xs text-gray-300">
                                    Entertainment apps (Spotify, Netflix), Social media (Facebook, Twitter, Instagram)
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* How to Improve */}
                    <section className="bg-gradient-to-br from-green-900/30 to-blue-900/30 rounded-xl p-4 border border-green-500/30">
                        <div className="flex items-center gap-2 mb-3">
                            <i className="fas fa-rocket text-green-400 text-xl"></i>
                            <h3 className="text-lg font-bold text-white">How to Improve Your Scores</h3>
                        </div>
                        <div className="space-y-3 text-sm text-gray-300">
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <div>
                                    <strong className="text-white">Use Productive Apps:</strong> VS Code, Office tools, Design software
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <div>
                                    <strong className="text-white">Visit Productive Sites:</strong> GitHub, Stack Overflow, Documentation
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <div>
                                    <strong className="text-white">Minimize Context Switching:</strong> Batch similar tasks, stay in one app longer
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fas fa-check-circle text-green-400 mt-0.5"></i>
                                <div>
                                    <strong className="text-white">Maintain Focus:</strong> Avoid frequent app switching, work in longer sessions
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* FAQ */}
                    <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <h3 className="text-lg font-bold text-white mb-3">Frequently Asked Questions</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm font-bold text-gray-200 mb-1">Q: Why is my App Score only 50%?</p>
                                <p className="text-xs text-gray-400">
                                    A: You're using neutral apps (browsers, communication). Use more productive apps like VS Code or Office tools to increase it.
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-200 mb-1">Q: Why is everything "Neutral"?</p>
                                <p className="text-xs text-gray-400">
                                    A: The apps/URLs you used are classified as neutral. If you used VS Code, it should show as "Productive" - if not, the app might not be recognized yet.
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-200 mb-1">Q: Is 70% a good score?</p>
                                <p className="text-xs text-gray-400">
                                    A: Yes! 70% is "High Productivity". Your focus score of 100% is excellent!
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-200 mb-1">Q: How do I increase my score?</p>
                                <p className="text-xs text-gray-400">
                                    A: Use more productive apps (VS Code, Office), visit more productive sites (GitHub, Stack Overflow), and maintain your excellent focus.
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-200 mb-1">Q: Why is Focus 100% but Context Switches 0?</p>
                                <p className="text-xs text-gray-400">
                                    A: This means you stayed in the same app(s) without switching. This is excellent for productivity!
                                </p>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};
