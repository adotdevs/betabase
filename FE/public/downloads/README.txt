Windows installer is NOT stored in Git (100MB+ limit).

After building on the VPS:
  npm run electron:pack:win

Publish once (or after each new build):
  mkdir -p /var/www/betabase/downloads
  cp "/var/www/betabase/FE/dist-electron/Betabase Setup 0.1.0.exe" \
     /var/www/betabase/downloads/Betabase-Setup.exe

Every deploy.sh run copies that file into FE/build/downloads/ for the website.
Download URL: https://www.betabase.pro/downloads/Betabase-Setup.exe
