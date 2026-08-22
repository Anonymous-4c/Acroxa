# ================================================
# Setup Script for chess_dark Theme/Layout
# Run this inside the chess_dark folder
# ================================================

Write-Host "♟️  Creating chess_dark theme structure..." -ForegroundColor Cyan

# Create root files
$rootFiles = @(
    "meta.json",
    "layout.js",
    "main.js"
)

foreach ($file in $rootFiles) {
    if (!(Test-Path $file)) {
        New-Item -ItemType File -Path $file -Force | Out-Null
        Write-Host "✅ Created: $file" -ForegroundColor Green
    } else {
        Write-Host "⚡ Already exists: $file" -ForegroundColor Yellow
    }
}

# Create acrx folder and its files
$acrxFiles = @(
    "header.js",
    "footer.js",
    "sidebar.js",
    "homepage.js",
    "post.js",
    "page.js",
    "category.js",
    "404.js"
)

if (!(Test-Path "acrx")) {
    New-Item -ItemType Directory -Path "acrx" -Force | Out-Null
    Write-Host "✅ Created folder: acrx/" -ForegroundColor Green
}

foreach ($file in $acrxFiles) {
    $path = "acrx\$file"
    if (!(Test-Path $path)) {
        New-Item -ItemType File -Path $path -Force | Out-Null
        Write-Host "✅ Created: acrx/$file" -ForegroundColor Green
    } else {
        Write-Host "⚡ Already exists: acrx/$file" -ForegroundColor Yellow
    }
}

# Add basic starter content to important files

# meta.json
$metaContent = @'
{
  "theme": "chess_dark",
  "version": "1.0.0",
  "routes": [],
  "stylesheets": [
    "acrx/styles.css"
  ],
  "customCSS": "",
  "menu": {
    "main": [],
    "footer": []
  }
}
'@

Set-Content -Path "meta.json" -Value $metaContent -Force
Write-Host "✅ Added starter content to meta.json" -ForegroundColor Green

# layout.js
$layoutContent = @'
// layout.js - Template Registry for chess_dark

const path = require('path');

function registerTemplates(acrx) {
    // You can register your templates here
    console.log('♟️  chess_dark layout templates registered');
}

module.exports = { registerTemplates };
'@

Set-Content -Path "layout.js" -Value $layoutContent -Force
Write-Host "✅ Added starter content to layout.js" -ForegroundColor Green

# main.js
$mainContent = @'
// main.js - Entry point for chess_dark theme

const { registerTemplates } = require('./layout.js');

function initialize(acrx) {
    console.log('♟️  Initializing chess_dark theme...');
    
    // Register all templates
    registerTemplates(acrx);
    
    // You can add more initialization here
}

module.exports = { initialize };
'@

Set-Content -Path "main.js" -Value $mainContent -Force
Write-Host "✅ Added starter content to main.js" -ForegroundColor Green

Write-Host "`n🎉 chess_dark structure created successfully!" -ForegroundColor Magenta
Write-Host "Folder structure:" -ForegroundColor White
Write-Host "   chess_dark/" -ForegroundColor Gray
Write-Host "   ├── meta.json" -ForegroundColor Gray
Write-Host "   ├── layout.js" -ForegroundColor Gray
Write-Host "   ├── main.js" -ForegroundColor Gray
Write-Host "   └── acrx/" -ForegroundColor Gray
Write-Host "       ├── header.js" -ForegroundColor Gray
Write-Host "       ├── footer.js" -ForegroundColor Gray
Write-Host "       ├── sidebar.js" -ForegroundColor Gray
Write-Host "       ├── homepage.js" -ForegroundColor Gray
Write-Host "       ├── post.js" -ForegroundColor Gray
Write-Host "       ├── page.js" -ForegroundColor Gray
Write-Host "       ├── category.js" -ForegroundColor Gray
Write-Host "       └── 404.js" -ForegroundColor Gray

Write-Host "`nNext Step: You can now start editing these files." -ForegroundColor Yellow