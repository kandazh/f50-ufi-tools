# ============================================================
# COMPREHENSIVE RENAME SCRIPT
# minikano -> hotbox | f50_sms -> f50_app | kano -> hotbox
# Case-preserving. URLs are preserved as-is.
# ============================================================

$root = "c:\Users\kak\Desktop\ME\repos\UFI-TOOLS-http-server-version\UFI-TOOLS-http-server-version"
Set-Location $root

$reportFile = Join-Path $root "_rename-findings.txt"
$textExtensions = @(
    ".kt", ".java", ".xml", ".gradle", ".kts", ".properties", ".toml",
    ".json", ".js", ".html", ".css", ".md", ".txt", ".sh", ".go",
    ".yaml", ".yml", ".conf", ".ps1", ".bat", ".pro", ".template"
)
$excludePattern = "\\\.git\\|\\\.gradle\\|\\build\\|\\node_modules\\|\\\.idea\\|_rename-script\.ps1|_rename-findings\.txt|pnpm-lock\.yaml"

# ============================================================
# HELPER: Case-preserving replace that SKIPS URLs
# ============================================================
function Replace-PreservingUrls {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Replacement
    )
    
    # Strategy: split content by URLs, only replace in non-URL parts
    # URL pattern: matches http:// or https:// followed by non-whitespace
    $urlRegex = 'https?://[^\s"''<>\)\]}]+'
    
    # Find all URLs and their positions
    $urlMatches = [regex]::Matches($Content, $urlRegex)
    
    if ($urlMatches.Count -eq 0) {
        # No URLs, just do the replacement directly
        return [regex]::Replace($Content, $Pattern, $Replacement)
    }
    
    # Build result by processing segments between URLs
    $result = New-Object System.Text.StringBuilder
    $lastEnd = 0
    
    foreach ($urlMatch in $urlMatches) {
        # Process text before this URL
        $beforeUrl = $Content.Substring($lastEnd, $urlMatch.Index - $lastEnd)
        $beforeUrl = [regex]::Replace($beforeUrl, $Pattern, $Replacement)
        [void]$result.Append($beforeUrl)
        
        # Keep URL as-is
        [void]$result.Append($urlMatch.Value)
        
        $lastEnd = $urlMatch.Index + $urlMatch.Length
    }
    
    # Process remaining text after last URL
    $afterLastUrl = $Content.Substring($lastEnd)
    $afterLastUrl = [regex]::Replace($afterLastUrl, $Pattern, $Replacement)
    [void]$result.Append($afterLastUrl)
    
    return $result.ToString()
}

# ============================================================
# PHASE 1: SCAN & REPORT
# ============================================================
Write-Host "=== PHASE 1: Scanning patterns ===" -ForegroundColor Cyan

$allFiles = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    $_.FullName -notmatch $excludePattern -and
    $textExtensions -contains $_.Extension.ToLower()
}

$findings = @()
$patternCounts = @{}

foreach ($file in $allFiles) {
    $lines = Get-Content -Path $file.FullName -ErrorAction SilentlyContinue
    if ($null -eq $lines) { continue }
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $lineMatches = [regex]::Matches($lines[$i], '(?i)\w*(minikano|f50_sms|kano)\w*')
        foreach ($m in $lineMatches) {
            $word = $m.Value
            $relPath = $file.FullName.Replace($root + "\", "")
            $findings += "${relPath}:$($i+1)  [$word]"
            if ($patternCounts.ContainsKey($word)) { $patternCounts[$word]++ }
            else { $patternCounts[$word] = 1 }
        }
    }
}

# Write report
$report = @()
$report += "RENAME FINDINGS REPORT - $(Get-Date)"
$report += "Total occurrences: $($findings.Count)"
$report += "Unique words: $($patternCounts.Count)"
$report += ""
$report += "=== UNIQUE PATTERNS (by frequency) ==="
$patternCounts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    $report += "  $($_.Key) (x$($_.Value))"
}
$report += ""
$report += "=== REPLACEMENT RULES ==="
$report += "  minikano -> hotbox (lowercase)"
$report += "  Minikano -> Hotbox (PascalCase)"
$report += "  MINIKANO -> HOTBOX (UPPERCASE)"
$report += "  f50_sms  -> f50_app (all cases)"
$report += "  kano     -> hotbox (lowercase, not in URLs)"
$report += "  Kano     -> Hotbox (PascalCase, not in URLs)"
$report += "  KANO     -> HOTBOX (UPPERCASE, not in URLs)"
$report += ""
$report += "=== URLs PRESERVED (not changed) ==="
$report += "  https://github.com/kanoqwq"
$report += "  https://github.com/kanoqwq/F50-SMS"
$report += "  https://github.com/kanoqwq/UFI-TOOLS"
$report += ""
$report += "=== DETAILED FINDINGS ==="
$findings | ForEach-Object { $report += "  $_" }
$report | Out-File -FilePath $reportFile -Encoding UTF8

Write-Host "  Report: $reportFile" -ForegroundColor Green
Write-Host "  Total: $($findings.Count) occurrences, $($patternCounts.Count) unique words" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# PHASE 2: REPLACE CONTENT
# Order matters: longest/most-specific patterns first
# ============================================================
Write-Host "=== PHASE 2: Replacing content (preserving URLs) ===" -ForegroundColor Cyan

$changedFiles = 0
foreach ($file in $allFiles) {
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) { continue }
    
    $newContent = $content
    
    # --- Step 1: f50_sms -> f50_app (case-sensitive, exact match, no URL concern) ---
    $newContent = $newContent -creplace 'f50_sms', 'f50_app'
    $newContent = $newContent -creplace 'F50_SMS', 'F50_APP'
    
    # --- Step 2: minikano -> hotbox (case-preserving, skip URLs) ---
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'MINIKANO' -Replacement 'HOTBOX'
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'Minikano' -Replacement 'Hotbox'
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'minikano' -Replacement 'hotbox'
    
    # --- Step 3: kano -> hotbox (case-preserving, skip URLs) ---
    # These run AFTER minikano to avoid partial matches
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'KANO' -Replacement 'HOTBOX'
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'Kano' -Replacement 'Hotbox'
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern '(?<![A-Za-z])kano(?![A-Za-z])' -Replacement 'hotbox'
    # kano as part of a word (but not in a URL - already handled)
    $newContent = Replace-PreservingUrls -Content $newContent -Pattern 'kano' -Replacement 'hotbox'
    
    if ($newContent -ne $content) {
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        $relPath = $file.FullName.Replace($root + "\", "")
        Write-Host "  [CONTENT] $relPath" -ForegroundColor Green
        $changedFiles++
    }
}
Write-Host "  -> $changedFiles files updated.`n" -ForegroundColor Yellow

# ============================================================
# PHASE 3: RENAME FILES
# ============================================================
Write-Host "=== PHASE 3: Renaming files ===" -ForegroundColor Cyan

$filesToRename = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    ($_.Name -match '(?i)minikano|f50_sms|kano') -and $_.FullName -notmatch $excludePattern
}

foreach ($file in $filesToRename) {
    $newName = $file.Name
    $newName = $newName -creplace 'MINIKANO','HOTBOX' -creplace 'Minikano','Hotbox' -creplace 'minikano','hotbox'
    $newName = $newName -creplace 'F50_SMS','F50_APP' -creplace 'f50_sms','f50_app'
    $newName = $newName -creplace 'KANO','HOTBOX' -creplace 'Kano','Hotbox' -creplace 'kano','hotbox'
    if ($newName -ne $file.Name) {
        Rename-Item -Path $file.FullName -NewName $newName
        Write-Host "  [FILE] $($file.Name) -> $newName" -ForegroundColor Green
    }
}

# ============================================================
# PHASE 4: RENAME DIRECTORIES (deepest first, multiple passes)
# ============================================================
Write-Host "`n=== PHASE 4: Renaming directories ===" -ForegroundColor Cyan

for ($pass = 0; $pass -lt 10; $pass++) {
    $dirsToRename = Get-ChildItem -Path $root -Recurse -Directory | Where-Object {
        ($_.Name -match '(?i)minikano|f50_sms|kano') -and $_.FullName -notmatch $excludePattern
    } | Sort-Object { $_.FullName.Length } -Descending

    if ($dirsToRename.Count -eq 0) { break }

    foreach ($dir in $dirsToRename) {
        if (-not (Test-Path $dir.FullName)) { continue }
        $newName = $dir.Name
        $newName = $newName -creplace 'MINIKANO','HOTBOX' -creplace 'Minikano','Hotbox' -creplace 'minikano','hotbox'
        $newName = $newName -creplace 'F50_SMS','F50_APP' -creplace 'f50_sms','f50_app'
        $newName = $newName -creplace 'KANO','HOTBOX' -creplace 'Kano','Hotbox' -creplace 'kano','hotbox'
        if ($newName -ne $dir.Name) {
            Rename-Item -Path $dir.FullName -NewName $newName
            Write-Host "  [DIR] $($dir.Name) -> $newName" -ForegroundColor Green
        }
    }
}

# ============================================================
# PHASE 5: VERIFY
# ============================================================
Write-Host "`n=== PHASE 5: Verification ===" -ForegroundColor Cyan

$remaining = 0
$verifyFiles = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    $_.FullName -notmatch $excludePattern -and
    $textExtensions -contains $_.Extension.ToLower()
}

foreach ($file in $verifyFiles) {
    $lines = Get-Content -Path $file.FullName -ErrorAction SilentlyContinue
    if ($null -eq $lines) { continue }
    for ($i = 0; $i -lt $lines.Count; $i++) {
        # Skip lines that are URLs
        if ($lines[$i] -match 'https?://[^\s]*[Kk]ano') { continue }
        if ($lines[$i] -cmatch 'minikano|f50_sms|(?<![/\.])kano(?!qwq)' -and $lines[$i] -notmatch 'https?://') {
            $relPath = $file.FullName.Replace($root + "\", "")
            $snippet = $lines[$i].Trim()
            if ($snippet.Length -gt 120) { $snippet = $snippet.Substring(0, 120) + "..." }
            Write-Host "  [REMAINING] ${relPath}:$($i+1)  $snippet" -ForegroundColor Red
            $remaining++
        }
    }
}

# Check file/dir names
$remainingNames = Get-ChildItem -Path $root -Recurse | Where-Object {
    ($_.Name -match '(?i)minikano|f50_sms|kano') -and $_.FullName -notmatch $excludePattern
}
foreach ($f in $remainingNames) {
    Write-Host "  [REMAINING NAME] $($f.FullName.Replace($root + '\', ''))" -ForegroundColor Red
    $remaining++
}

if ($remaining -eq 0) {
    Write-Host "  ALL CLEAR - Zero references remain (URLs preserved)!" -ForegroundColor Green
} else {
    Write-Host "  $remaining remaining references need review." -ForegroundColor Yellow
}

Write-Host "`n=== COMPLETE ===" -ForegroundColor Cyan
Write-Host "Package is now: com.hotbox.f50_app" -ForegroundColor White
