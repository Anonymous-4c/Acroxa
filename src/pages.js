function renderPage_400() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error 400</title>
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
  
    <link rel="alternate icon" type="image/png" href="/assets/icon.svg">
    <style>
        body { margin:0; padding:0; min-height:100vh; background:var(--bg-gradient); 
            color:var(--text-color); font-family:"Segoe UI", Poppins, sans-serif;
            display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .particles { position:fixed; inset:0; pointer-events:none;
            background: radial-gradient(circle at 30% 30%, #ffffff10, transparent 40%),
                        radial-gradient(circle at 80% 70%, #ffffff08, transparent 40%);
            animation:pulse 6s infinite alternate ease-in-out; }
        @keyframes pulse { 0%{opacity:0.4;} 100%{opacity:0.8;} }
        .error-card { background:var(--bg-post); padding:40px 60px; border-radius:24px;
            backdrop-filter:blur(12px); box-shadow:0 0 25px #0004, 0 0 60px #0002 inset;
            animation:pop 0.6s ease; max-width:600px; text-align:center; }
        @keyframes pop { from{transform:translateY(40px) scale(0.92); opacity:0;}
                         to{transform:translateY(0) scale(1); opacity:1;} }
        .error-code { font-size:90px; font-weight:900; margin-bottom:-10px;
            background:linear-gradient(to right, #fff, var(--icon));
            -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .error-title { font-size:32px; margin-bottom:10px; opacity:0.9; }
        .error-desc { font-size:17px; opacity:0.7; }
    </style>
</head>
<body>
    <div class="particles"></div>
    <div class="error-card">
        <div class="error-code">400</div>
        <div class="error-title">Bad Request</div>
        <div class="error-desc">Your request could not be processed.</div>
    </div>
</body>
</html>
    `;
}

function renderPage_401() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error 401</title>
    <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
  
    <link rel="alternate icon" type="image/png" href="/assets/icon.svg">
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <style>
        body { margin:0; padding:0; min-height:100vh; background:var(--bg-gradient); 
            color:var(--text-color); font-family:"Segoe UI", Poppins, sans-serif;
            display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .particles { position:fixed; inset:0; pointer-events:none;
            background: radial-gradient(circle at 30% 30%, #ffffff10, transparent 40%),
                        radial-gradient(circle at 80% 70%, #ffffff08, transparent 40%);
            animation:pulse 6s infinite alternate ease-in-out; }
        @keyframes pulse { 0%{opacity:0.4;} 100%{opacity:0.8;} }
        .error-card { background:var(--bg-post); padding:40px 60px; border-radius:24px;
            backdrop-filter:blur(12px); box-shadow:0 0 25px #0004, 0 0 60px #0002 inset;
            animation:pop 0.6s ease; max-width:600px; text-align:center; }
        @keyframes pop { from{transform:translateY(40px) scale(0.92); opacity:0;}
                         to{transform:translateY(0) scale(1); opacity:1;} }
        .error-code { font-size:90px; font-weight:900; margin-bottom:-10px;
            background:linear-gradient(to right, #fff, var(--icon));
            -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .error-title { font-size:32px; margin-bottom:10px; opacity:0.9; }
        .error-desc { font-size:17px; opacity:0.7; }
    </style>
</head>
<body>
    <div class="particles"></div>
    <div class="error-card">
        <div class="error-code">401</div>
        <div class="error-title">Unauthorized</div>
        <div class="error-desc">You need proper access rights to continue.</div>
    </div>
</body>
</html>
    `;
}

function renderPage_403() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
  
    <link rel="alternate icon" type="image/png" href="/assets/icon.svg">
    <title>Error 403</title>
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <style>
        body { margin:0; padding:0; min-height:100vh; background:var(--bg-gradient); 
            color:var(--text-color); font-family:"Segoe UI", Poppins, sans-serif;
            display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .particles { position:fixed; inset:0; pointer-events:none;
            background: radial-gradient(circle at 30% 30%, #ffffff10, transparent 40%),
                        radial-gradient(circle at 80% 70%, #ffffff08, transparent 40%);
            animation:pulse 6s infinite alternate ease-in-out; }
        @keyframes pulse { 0%{opacity:0.4;} 100%{opacity:0.8;} }
        .error-card { background:var(--bg-post); padding:40px 60px; border-radius:24px;
            backdrop-filter:blur(12px); box-shadow:0 0 25px #0004, 0 0 60px #0002 inset;
            animation:pop 0.6s ease; max-width:600px; text-align:center; }
        @keyframes pop { from{transform:translateY(40px) scale(0.92); opacity:0;}
                         to{transform:translateY(0) scale(1); opacity:1;} }
        .error-code { font-size:90px; font-weight:900; margin-bottom:-10px;
            background:linear-gradient(to right, #fff, var(--icon));
            -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .error-title { font-size:32px; margin-bottom:10px; opacity:0.9; }
        .error-desc { font-size:17px; opacity:0.7; }
    </style>
</head>
<body>
    <div class="particles"></div>
    <div class="error-card">
        <div class="error-code">403</div>
        <div class="error-title">Forbidden</div>
        <div class="error-desc">You do not have permission to view this page.</div>
    </div>
</body>
</html>
    `;
}

function renderPage_404() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
  
    <link rel="alternate icon" type="image/png" href="/assets/icon.svg">
    <title>Error 404</title>
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <style>
        body { margin:0; padding:0; min-height:100vh; background:var(--bg-gradient); 
            color:var(--text-color); font-family:"Segoe UI", Poppins, sans-serif;
            display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .particles { position:fixed; inset:0; pointer-events:none;
            background: radial-gradient(circle at 30% 30%, #ffffff10, transparent 40%),
                        radial-gradient(circle at 80% 70%, #ffffff08, transparent 40%);
            animation:pulse 6s infinite alternate ease-in-out; }
        @keyframes pulse { 0%{opacity:0.4;} 100%{opacity:0.8;} }
        .error-card { background:var(--bg-post); padding:40px 60px; border-radius:24px;
            backdrop-filter:blur(12px); box-shadow:0 0 25px #0004, 0 0 60px #0002 inset;
            animation:pop 0.6s ease; max-width:600px; text-align:center; }
        @keyframes pop { from{transform:translateY(40px) scale(0.92); opacity:0;}
                         to{transform:translateY(0) scale(1); opacity:1;} }
        .error-code { font-size:90px; font-weight:900; margin-bottom:-10px;
            background:linear-gradient(to right, #fff, var(--icon));
            -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .error-title { font-size:32px; margin-bottom:10px; opacity:0.9; }
        .error-desc { font-size:17px; opacity:0.7; }
    </style>
</head>
<body>
    <div class="particles"></div>
    <div class="error-card">
        <div class="error-code">404</div>
        <div class="error-title">Not Found</div>
        <div class="error-desc">The requested page does not exist.</div>
    </div>
</body>
</html>
    `;
}

function renderPage_500() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
  
    <link rel="alternate icon" type="image/png" href="/assets/icon.svg">
    <title>Error 500</title>
    <link rel="stylesheet" href="/acrx/assets/css/root.css">
    <style>
        body { margin:0; padding:0; min-height:100vh; background:var(--bg-gradient); 
            color:var(--text-color); font-family:"Segoe UI", Poppins, sans-serif;
            display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .particles { position:fixed; inset:0; pointer-events:none;
            background: radial-gradient(circle at 30% 30%, #ffffff10, transparent 40%),
                        radial-gradient(circle at 80% 70%, #ffffff08, transparent 40%);
            animation:pulse 6s infinite alternate ease-in-out; }
        @keyframes pulse { 0%{opacity:0.4;} 100%{opacity:0.8;} }
        .error-card { background:var(--bg-post); padding:40px 60px; border-radius:24px;
            backdrop-filter:blur(12px); box-shadow:0 0 25px #0004, 0 0 60px #0002 inset;
            animation:pop 0.6s ease; max-width:600px; text-align:center; }
        @keyframes pop { from{transform:translateY(40px) scale(0.92); opacity:0;}
                         to{transform:translateY(0) scale(1); opacity:1;} }
        .error-code { font-size:90px; font-weight:900; margin-bottom:-10px;
            background:linear-gradient(to right, #fff, var(--icon));
            -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .error-title { font-size:32px; margin-bottom:10px; opacity:0.9; }
        .error-desc { font-size:17px; opacity:0.7; }
    </style>
</head>
<body>
    <div class="particles"></div>
    <div class="error-card">
        <div class="error-code">500</div>
        <div class="error-title">Internal Server Error</div>
        <div class="error-desc">The server encountered an unexpected issue.</div>
    </div>
</body>
</html>
    `;
}

// Module Exports
module.exports = {
    renderPage_400,
    renderPage_401,
    renderPage_403,
    renderPage_404,
    renderPage_500,
};