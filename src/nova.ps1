# Base path (you can change this)
$base = "layouts\nova_nexus"

# Create folders
$folders = @(
    "$base",
    "$base\preview",
    "$base\acrx",
    "$base\acrx\components",
    "$base\assets"
)

foreach ($folder in $folders) {
    if (-Not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder | Out-Null
    }
}

# List of files to create
$files = @(
    "$base\main.js",
    "$base\layout.js",
    "$base\meta.json",

    "$base\preview\thumbnail.png",
    "$base\preview\screenshot.png",

    "$base\acrx\header.js",
    "$base\acrx\footer.js",
    "$base\acrx\sidebar.js",
    "$base\acrx\homepage.js",
    "$base\acrx\post.js",
    "$base\acrx\page.js",
    "$base\acrx\404.js",

    "$base\acrx\components\card.js",
    "$base\acrx\components\grid.js",
    "$base\acrx\components\hero.js",
    "$base\acrx\components\section.js"
)

# Create empty files
foreach ($file in $files) {
    if (-Not (Test-Path $file)) {
        New-Item -ItemType File -Path $file | Out-Null
    }
}

Write-Host "Nova Nexus layout structure created successfully!" -ForegroundColor Green
