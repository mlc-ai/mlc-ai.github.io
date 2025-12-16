/**
 * Dynamic Blog Loader
 * Fetches blog posts from blog.mlc.ai and renders them dynamically
 */

class BlogLoader {
    constructor() {
        this.posts = [];
        this.categories = new Set();
        this.currentCategory = 'all';
    }

    /**
     * Parse date string from blog.mlc.ai format (e.g., "Jan 7, 2025")
     */
    parseDateString(dateStr) {
        if (!dateStr) return null;
        
        try {
            // Handle formats like "Jan 7, 2025" or "January 7, 2025"
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                // Try parsing manually
                const months = {
                    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
                };
                
                const parts = dateStr.toLowerCase().replace(',', '').split(/\s+/);
                if (parts.length >= 3) {
                    const month = months[parts[0].substring(0, 3)];
                    const day = parts[1].padStart(2, '0');
                    const year = parts[2];
                    return `${year}-${month}-${day}`;
                }
                return null;
            }
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (e) {
            console.warn('Error parsing date:', dateStr, e);
            return null;
        }
    }

    /**
     * Fetch and parse blog posts from blog.mlc.ai
     */
    async fetchPostsFromBlog() {
        try {
            const response = await fetch('https://blog.mlc.ai/');
            if (!response.ok) throw new Error('Failed to fetch blog.mlc.ai');
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Find all list items containing blog posts
            const listItems = doc.querySelectorAll('ul li');
            const posts = [];
            
            listItems.forEach(li => {
                try {
                    // Find the link (title)
                    const link = li.querySelector('a');
                    if (!link) return;
                    
                    const title = link.textContent.trim();
                    const href = link.getAttribute('href');
                    
                    // Skip if it's "Home" or other navigation links
                    if (!title || title.toLowerCase() === 'home' || href === '/' || href === '/index.html') {
                        return;
                    }
                    
                    // Skip if the URL doesn't look like a blog post (should have date pattern)
                    // Blog posts typically have URLs like /2025/01/07/post-name
                    if (!/\d{4}\/\d{2}\/\d{2}/.test(href)) {
                        return;
                    }
                    
                    // Handle relative URLs
                    const url = href.startsWith('http') ? href : `https://blog.mlc.ai${href}`;
                    
                    // Find the date span (usually after <br />)
                    const spans = li.querySelectorAll('span');
                    let dateStr = null;
                    
                    // Look for date in spans (usually the second or last span)
                    for (let i = spans.length - 1; i >= 0; i--) {
                        const spanText = spans[i].textContent.trim();
                        // Check if it looks like a date (contains month name and year)
                        if (/\w+\s+\d+,\s+\d{4}/.test(spanText) || /\d{4}/.test(spanText)) {
                            dateStr = spanText;
                            break;
                        }
                    }
                    
                    if (!url) return;
                    
                    const date = this.parseDateString(dateStr);
                    
                    posts.push({
                        title,
                        url,
                        date,
                        formattedDate: this.formatDate(date || dateStr),
                        rawDate: dateStr
                    });
                } catch (e) {
                    console.warn('Error parsing blog post item:', e);
                }
            });
            
            // Sort by date descending (newest first)
            posts.sort((a, b) => {
                if (!a.date && !b.date) return 0;
                if (!a.date) return 1;
                if (!b.date) return -1;
                return new Date(b.date) - new Date(a.date);
            });
            
            return posts;
        } catch (error) {
            console.error('Error fetching posts from blog.mlc.ai:', error);
            throw error;
        }
    }

    /**
     * Fetch excerpt and determine category from blog post content
     */
    async enrichPostData(post) {
        try {
            // Fetch the actual blog post page to get excerpt
            const response = await fetch(post.url);
            if (!response.ok) return post;
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Try to find excerpt/description from meta tags
            const metaDescription = doc.querySelector('meta[name="description"]');
            let excerpt = metaDescription ? metaDescription.getAttribute('content') : '';
            
            // If no meta description, try to get first paragraph
            if (!excerpt) {
                const firstParagraph = doc.querySelector('article p, .post-content p, main p');
                if (firstParagraph) {
                    excerpt = firstParagraph.textContent.trim();
                }
            }
            
            // Limit excerpt length
            if (excerpt.length > 200) {
                excerpt = excerpt.substring(0, 200) + '...';
            }
            
            // Determine category from title and excerpt
            const category = this.determineCategory(post.title, excerpt);
            
            // Estimate read time (rough estimate based on excerpt)
            const wordCount = excerpt.split(/\s+/).length;
            const readTime = Math.max(3, Math.ceil(wordCount / 200)) + ' min read';
            
            return {
                ...post,
                excerpt: excerpt || 'Read the full article to learn more.',
                category,
                readTime
            };
        } catch (error) {
            console.warn(`Error enriching post data for ${post.title}:`, error);
            // Return post with default values
            return {
                ...post,
                excerpt: 'Read the full article to learn more.',
                category: this.determineCategory(post.title, ''),
                readTime: '5 min read'
            };
        }
    }

    /**
     * Parse Jekyll front matter from markdown content
     */
    parseFrontMatter(content) {
        const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
        const match = content.match(frontMatterRegex);
        
        if (!match) {
            return { frontMatter: {}, body: content };
        }

        const frontMatterText = match[1];
        const body = match[2];
        const frontMatter = {};

        // Simple YAML parser for basic key-value pairs
        frontMatterText.split('\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();
                
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                
                frontMatter[key] = value;
            }
        });

        return { frontMatter, body };
    }

    /**
     * Extract excerpt from markdown body
     */
    extractExcerpt(body, maxLength = 200) {
        // Remove markdown formatting
        let text = body
            .replace(/^#+\s+/gm, '') // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links
            .replace(/`([^`]+)`/g, '$1') // Remove code
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .trim();

        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        return text;
    }

    /**
     * Determine category from title/content
     */
    determineCategory(title, body) {
        const lowerTitle = title.toLowerCase();
        const lowerBody = body.toLowerCase();

        if (lowerTitle.includes('tutorial') || lowerTitle.includes('guide') || lowerTitle.includes('how to')) {
            return 'tutorials';
        } else if (lowerTitle.includes('optimization') || lowerTitle.includes('optimizing') || lowerTitle.includes('performance')) {
            return 'optimization';
        } else if (lowerTitle.includes('deployment') || lowerTitle.includes('deploy') || lowerTitle.includes('serving') || 
                   lowerTitle.includes('mobile') || lowerTitle.includes('android') || lowerTitle.includes('gpu')) {
            return 'deployment';
        } else if (lowerTitle.includes('research') || lowerTitle.includes('paper') || lowerTitle.includes('study')) {
            return 'research';
        }
        return 'deployment'; // Default category
    }

    /**
     * Get icon based on category
     */
    getCategoryIcon(category) {
        const icons = {
            'tutorials': 'fa-book',
            'optimization': 'fa-tachometer-alt',
            'deployment': 'fa-server',
            'research': 'fa-brain'
        };
        return icons[category] || 'fa-file-alt';
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return '';
        
        try {
            // If it's already in a readable format (e.g., "Jan 7, 2025"), return as is
            if (/\w+\s+\d+,\s+\d{4}/.test(dateString)) {
                // Convert "Jan 7, 2025" to "January 7, 2025"
                const months = {
                    'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
                    'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
                    'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
                };
                
                const parts = dateString.split(' ');
                if (parts.length >= 3 && months[parts[0]]) {
                    return `${months[parts[0]]} ${parts[1]} ${parts[2]}`;
                }
                return dateString;
            }
            
            // If it's in YYYY-MM-DD format, parse it
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
            
            return dateString;
        } catch (e) {
            return dateString;
        }
    }


    /**
     * Fetch all blog posts from blog.mlc.ai
     */
    async fetchAllPosts() {
        try {
            // Fetch posts from blog.mlc.ai
            const posts = await this.fetchPostsFromBlog();
            
            if (posts.length === 0) {
                return [];
            }
            
            // Enrich posts with excerpt and category (fetch in batches to avoid overwhelming)
            // Process first 5 immediately, then batch the rest
            const batchSize = 5;
            const enrichedPosts = [];
            
            for (let i = 0; i < posts.length; i += batchSize) {
                const batch = posts.slice(i, i + batchSize);
                const enrichedBatch = await Promise.all(
                    batch.map(post => this.enrichPostData(post))
                );
                enrichedPosts.push(...enrichedBatch);
                
                // Small delay between batches to be respectful
                if (i + batchSize < posts.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            this.posts = enrichedPosts;
            
            // Extract categories
            this.posts.forEach(post => {
                this.categories.add(post.category);
            });
            
            return this.posts;
        } catch (error) {
            console.error('Error fetching blog posts:', error);
            return [];
        }
    }

    /**
     * Render featured article
     */
    renderFeaturedArticle(post) {
        const featuredSection = document.querySelector('.featured-article .featured-card .featured-content');
        if (!featuredSection || !post) return;

        const dateParts = post.date ? post.date.split('-') : [];
        const year = dateParts[0] || new Date().getFullYear();
        const month = dateParts[1] || '01';
        const day = dateParts[2] || '01';

        featuredSection.innerHTML = `
            <div class="featured-badge">
                <i class="fas fa-star"></i>
                <span>Latest</span>
            </div>
            <h2>${post.title}</h2>
            <p class="featured-excerpt">${post.excerpt}</p>
            <div class="featured-meta">
                <span class="author">
                    <i class="fas fa-user"></i>
                    MLC Team
                </span>
                <span class="date">
                    <i class="fas fa-calendar"></i>
                    ${post.formattedDate}
                </span>
                <span class="read-time">
                    <i class="fas fa-clock"></i>
                    ${post.readTime}
                </span>
            </div>
            <a href="${post.url}" class="btn btn-primary" target="_blank" rel="noopener">Read Full Article</a>
        `;

        // Update chart with actual post count
        const chartBars = document.querySelector('.chart-bars');
        if (chartBars) {
            const totalPosts = this.posts.length;
            const posts2024 = this.posts.filter(p => p.date && p.date.startsWith('2024')).length;
            const posts2025 = this.posts.filter(p => p.date && p.date.startsWith('2025')).length;
            
            chartBars.innerHTML = `
                <div class="bar-item">
                    <span class="bar-label">Total Posts</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: 100%; background: var(--primary-color);">
                            <span class="bar-value">${totalPosts}</span>
                        </div>
                    </div>
                </div>
                <div class="bar-item">
                    <span class="bar-label">2024 Posts</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${(posts2024 / totalPosts * 100)}%; background: var(--accent-color);">
                            <span class="bar-value">${posts2024}</span>
                        </div>
                    </div>
                </div>
                <div class="bar-item">
                    <span class="bar-label">2025 Posts</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${(posts2025 / totalPosts * 100)}%; background: var(--secondary-color);">
                            <span class="bar-value">${posts2025}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render blog post card
     */
    renderPostCard(post) {
        const icon = this.getCategoryIcon(post.category);
        const monthYear = post.date ? new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';

        return `
            <article class="blog-card" data-category="${post.category}">
                <div class="blog-card-image">
                    <div class="image-placeholder">
                        <i class="fas ${icon}"></i>
                    </div>
                </div>
                <div class="blog-card-content">
                    <div class="blog-meta">
                        <span class="blog-category">${post.category.charAt(0).toUpperCase() + post.category.slice(1)}</span>
                        <span class="blog-date">${monthYear}</span>
                    </div>
                    <h3>${post.title}</h3>
                    <p>${post.excerpt}</p>
                    <div class="blog-footer">
                        <span class="read-time">${post.readTime}</span>
                        <a href="${post.url}" class="read-more" target="_blank" rel="noopener">Read More <i class="fas fa-arrow-right"></i></a>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * Render news card for homepage
     */
    renderNewsCard(post) {
        const monthYear = post.date ? new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';
        const category = post.category ? post.category.charAt(0).toUpperCase() + post.category.slice(1) : 'Blog';

        return `
            <article class="news-card">
                <div class="news-meta">
                    <span class="news-date">${monthYear}</span>
                    <span class="news-category">${category}</span>
                </div>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <a href="${post.url}" class="news-link" target="_blank" rel="noopener">Read More</a>
            </article>
        `;
    }

    /**
     * Render latest blog posts on homepage
     */
    renderHomepageBlogs(count = 2) {
        const newsGrid = document.querySelector('.latest-news .news-grid');
        if (!newsGrid) return;

        if (this.posts.length === 0) {
            newsGrid.innerHTML = `
                <article class="news-card">
                    <div class="news-meta">
                        <span class="news-date">Loading...</span>
                        <span class="news-category">Blog</span>
                    </div>
                    <h3>Loading blog posts...</h3>
                    <p>Please wait while we fetch the latest blog posts.</p>
                    <a href="blog.html" class="news-link">View Blog</a>
                </article>
            `;
            return;
        }

        // Get the latest posts (up to count)
        const latestPosts = this.posts.slice(0, count);
        newsGrid.innerHTML = latestPosts.map(post => this.renderNewsCard(post)).join('');
    }

    /**
     * Initialize homepage blog section
     */
    async initHomepage() {
        try {
            await this.fetchAllPosts();

            if (this.posts.length === 0) {
                console.warn('No blog posts found for homepage');
                return;
            }

            // Render latest 2 posts on homepage
            this.renderHomepageBlogs(2);
        } catch (error) {
            console.error('Error initializing homepage blog:', error);
            // Show fallback content
            const newsGrid = document.querySelector('.latest-news .news-grid');
            if (newsGrid) {
                newsGrid.innerHTML = `
                    <article class="news-card">
                        <div class="news-meta">
                            <span class="news-date">Error</span>
                            <span class="news-category">Blog</span>
                        </div>
                        <h3>Unable to load blog posts</h3>
                        <p>Please visit our blog page to see the latest articles.</p>
                        <a href="blog.html" class="news-link">View Blog</a>
                    </article>
                `;
            }
        }
    }

    /**
     * Render all blog posts
     */
    renderPosts() {
        const postsGrid = document.querySelector('.posts-grid');
        if (!postsGrid) return;

        // Filter posts by category
        const filteredPosts = this.currentCategory === 'all' 
            ? this.posts 
            : this.posts.filter(post => post.category === this.currentCategory);

        // Skip the first post (featured)
        const postsToRender = filteredPosts.slice(1);

        if (postsToRender.length === 0) {
            postsGrid.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No posts found in this category.</p>';
            return;
        }

        postsGrid.innerHTML = postsToRender.map(post => this.renderPostCard(post)).join('');
    }

    /**
     * Initialize category filtering
     */
    initCategoryFilter() {
        const categoryButtons = document.querySelectorAll('.category-btn');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update current category
                this.currentCategory = btn.dataset.category;
                this.renderPosts();
            });
        });
    }

    /**
     * Show loading state
     */
    showLoading() {
        const postsGrid = document.querySelector('.posts-grid');
        if (postsGrid) {
            postsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-secondary);">Loading blog posts...</p>
                </div>
            `;
        }
    }

    /**
     * Show error state
     */
    showError(message) {
        const postsGrid = document.querySelector('.posts-grid');
        if (postsGrid) {
            postsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--accent-color); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-secondary);">${message}</p>
                    <p style="color: var(--text-light); margin-top: 0.5rem; font-size: 0.875rem;">
                        Please check your internet connection and try again.
                    </p>
                </div>
            `;
        }
    }

    /**
     * Initialize blog loader
     */
    async init() {
        this.showLoading();

        try {
            await this.fetchAllPosts();

            if (this.posts.length === 0) {
                this.showError('No blog posts found.');
                return;
            }

            // Render featured article (latest post)
            this.renderFeaturedArticle(this.posts[0]);

            // Render all posts
            this.renderPosts();

            // Initialize category filtering
            this.initCategoryFilter();

        } catch (error) {
            console.error('Error initializing blog loader:', error);
            this.showError('Failed to load blog posts. Please try again later.');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const blogLoader = new BlogLoader();
    
    // Check if we're on the blog page or homepage
    const isBlogPage = document.querySelector('.blog-posts') !== null;
    const isHomepage = document.querySelector('.latest-news .news-grid') !== null;
    
    if (isBlogPage) {
        // Initialize full blog page
        blogLoader.init();
    } else if (isHomepage) {
        // Initialize homepage blog section (only latest 2 posts)
        blogLoader.initHomepage();
    }
});

