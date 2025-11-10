export function appInit() {
    // Mobile menu toggle for policy pages (left sidebar)
    const mobileMenuToggle = document.querySelector('[data-module="mobile-menu-toggle"]');
    if (mobileMenuToggle) {
        const menuId = mobileMenuToggle.getAttribute('aria-controls');
        const menu = document.getElementById(menuId);

        mobileMenuToggle.addEventListener('click', function(e) {
            e.preventDefault();
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', String(!isExpanded));

            if (menu) {
                if (isExpanded) {
                    menu.classList.remove('app-subnav--open');
                } else {
                    menu.classList.add('app-subnav--open');
                }
            }
        });
    }
}
