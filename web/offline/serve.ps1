# FleetOps offline for Windows: a tiny static server using only built-in PowerShell / .NET.
# Listens on http://localhost:8765/ for this computer only. Close the window to stop.
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "app"
$prefix = "http://localhost:8765/"
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript"; ".mjs"="text/javascript"; ".css"="text/css";
  ".json"="application/json"; ".webmanifest"="application/manifest+json"; ".wasm"="application/wasm"; ".png"="image/png";
  ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".parquet"="application/octet-stream";
  ".gz"="application/gzip"; ".md"="text/markdown; charset=utf-8"; ".txt"="text/plain; charset=utf-8" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Start-Process "${prefix}"
Write-Host "FleetOps is running at ${prefix}  (close this window to stop)"
$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd([char]92) + [char]92
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    $path = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    # refuse anything outside the app folder (path traversal)
    if (-not $path.StartsWith($rootFull)) { $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue }
    if (Test-Path $path -PathType Container) { $path = Join-Path $path "index.html" }
    if (-not (Test-Path $path -PathType Leaf)) { $ctx.Response.StatusCode = 404; $ctx.Response.Close(); continue }
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" })
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.ContentLength64 = $bytes.Length
    if ($ctx.Request.HttpMethod -ne "HEAD") { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
