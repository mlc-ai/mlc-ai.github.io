document.addEventListener('DOMContentLoaded', function () {
    const headerContainer = document.getElementById('site-header');
    const footerContainer = document.getElementById('site-footer');

    function setActiveNavLink() {
        try {
            const current = location.pathname.split('/').pop() || 'index.html';
            document.querySelectorAll('.nav-link').forEach(link => {
                const href = link.getAttribute('href');
                if (href === current || (current === '' && href === 'index.html')) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        } catch (e) {
            // no-op
        }
    }

    const loadHeader = headerContainer
        ? fetch('partials/header.html')
              .then(r => r.text())
              .then(html => {
                  headerContainer.innerHTML = html;
                  if (window.initNav) window.initNav();
                  setActiveNavLink();
              })
              .catch(() => {})
        : Promise.resolve();

    const loadFooter = footerContainer
        ? fetch('partials/footer.html')
              .then(r => r.text())
              .then(html => {
                  footerContainer.innerHTML = html;
              })
              .catch(() => {})
        : Promise.resolve();

    Promise.all([loadHeader, loadFooter]).then(() => {
        // both loaded
    });
});


