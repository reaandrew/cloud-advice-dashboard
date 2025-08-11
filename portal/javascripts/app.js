export function appInit() {
    const navButton = document.getElementsByClassName("app-header__nav-button")[0];
    const navBar = document.getElementsByClassName("app-nav")[0];
    const navButtonDefaultDisplay = navButton.style.display;
    const navBarDefaultDisplay = navBar.style.display;

    navButton.addEventListener("click", function(e) {
        navBar.style.display = navBar.style.display == navBarDefaultDisplay ? "none" : navBarDefaultDisplay;
    });

    const mediaQueryList = window.matchMedia("(width <= 800px)");
    function onResize(e) {
        navBar.style.display = e.matches ? "none" : navBarDefaultDisplay;
        navButton.style.display = e.matches ? navButtonDefaultDisplay : "none";
    }
    mediaQueryList.addEventListener("change", onResize);
    document.addEventListener('DOMContentLoaded', () => onResize( { matches: window.innerWidth <= 800 } ));
}
