{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    libuuid
    libpng
    libjpeg
    giflib
    librsvg
    pixman
    cairo
    pango
    freetype
    fontconfig
    glib        # <--- Added for g_memdup2
    pkg-config
    playwright-driver.browsers
    harfbuzz
  ];

  shellHook = ''
    export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath (with pkgs; [
      libuuid
      libpng
      libjpeg
      giflib
      librsvg
      pixman
      cairo
      pango
      freetype
      fontconfig
      glib      # <--- Added for runtime linking
      stdenv.cc.cc
      harfbuzz
    ])}:$LD_LIBRARY_PATH

    echo "NixOS Screenshot Environment: GLib added"
  '';
}
