/**
 * GitHub Stats Loader
 * Fetches GitHub repository links from projects.html and aggregates stats
 */

class GitHubStatsLoader {
    constructor() {
        this.repos = [];
        this.totalStars = 0;
        this.totalForks = 0;
    }

    /**
     * Extract GitHub repository URLs from projects.html
     */
    async extractGitHubRepos() {
        try {
            const response = await fetch('projects.html');
            if (!response.ok) throw new Error('Failed to fetch projects.html');
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const repos = new Set();
            
            // Find all links that point to GitHub
            const links = doc.querySelectorAll('a[href*="github.com"]');
            
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href) return;
                
                // Extract repo path from GitHub URL
                // Format: https://github.com/owner/repo or https://github.com/owner/repo/
                const match = href.match(/github\.com\/([^\/]+\/[^\/]+)/);
                if (match) {
                    const repoPath = match[1].replace(/\/$/, ''); // Remove trailing slash
                    // Skip if it's just github.com or github.com/owner
                    if (repoPath && !repoPath.endsWith('.com') && repoPath.split('/').length === 2) {
                        repos.add(repoPath);
                    }
                }
            });
            
            this.repos = Array.from(repos);
            return this.repos;
        } catch (error) {
            console.error('Error extracting GitHub repos:', error);
            return [];
        }
    }

    /**
     * Fetch stats for a single GitHub repository
     */
    async fetchRepoStats(repoPath) {
        try {
            // GitHub API endpoint for repo info
            const response = await fetch(`https://api.github.com/repos/${repoPath}`, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Repository not found: ${repoPath}`);
                    return null;
                }
                throw new Error(`Failed to fetch stats for ${repoPath}: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                name: data.full_name,
                stars: data.stargazers_count || 0,
                forks: data.forks_count || 0
            };
        } catch (error) {
            console.error(`Error fetching stats for ${repoPath}:`, error);
            return null;
        }
    }

    /**
     * Fetch stats for all repositories
     */
    async fetchAllStats() {
        if (this.repos.length === 0) {
            await this.extractGitHubRepos();
        }
        
        if (this.repos.length === 0) {
            console.warn('No GitHub repositories found');
            return { stars: 0, forks: 0 };
        }
        
        // Fetch stats for all repos in parallel (with rate limiting consideration)
        const statsPromises = this.repos.map(repo => this.fetchRepoStats(repo));
        const results = await Promise.all(statsPromises);
        
        // Sum up all stats
        let totalStars = 0;
        let totalForks = 0;
        
        results.forEach(stat => {
            if (stat) {
                totalStars += stat.stars;
                totalForks += stat.forks;
            }
        });
        
        this.totalStars = totalStars;
        this.totalForks = totalForks;
        
        return {
            stars: totalStars,
            forks: totalForks
        };
    }

    /**
     * Format large numbers (e.g., 12345 -> "12.3K")
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * Render stats on the page
     */
    renderStats(stats) {
        const statsGrid = document.querySelector('.stats .stats-grid');
        if (!statsGrid) return;
        
        statsGrid.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">${this.formatNumber(stats.stars)}</div>
                <div class="stat-label">GitHub Stars</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${this.formatNumber(stats.forks)}</div>
                <div class="stat-label">GitHub Forks</div>
            </div>
        `;
    }

    /**
     * Show loading state
     */
    showLoading() {
        const statsGrid = document.querySelector('.stats .stats-grid');
        if (!statsGrid) return;
        
        statsGrid.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="stat-label">Loading...</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="stat-label">Loading...</div>
            </div>
        `;
    }

    /**
     * Show error state
     */
    showError() {
        const statsGrid = document.querySelector('.stats .stats-grid');
        if (!statsGrid) return;
        
        statsGrid.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">-</div>
                <div class="stat-label">GitHub Stars</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">-</div>
                <div class="stat-label">GitHub Forks</div>
            </div>
        `;
    }

    /**
     * Initialize stats loader
     */
    async init() {
        this.showLoading();
        
        try {
            const stats = await this.fetchAllStats();
            this.renderStats(stats);
        } catch (error) {
            console.error('Error initializing GitHub stats:', error);
            this.showError();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on homepage
    if (document.querySelector('.stats .stats-grid')) {
        const statsLoader = new GitHubStatsLoader();
        statsLoader.init();
    }
});

