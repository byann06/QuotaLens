using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Isam.Esent.Interop;

const string inspectSourceMethod = "srum-ese-inspect";
const string managedEsentSourceMethod = "srum-managed-esent-table-enum";
const string tableEnumSourceMethod = "srum-ese-table-enum";
const string esentutlInspectSourceMethod = "srum-esentutl-inspect";
const string discoverySourceMethod = "srum-path-discovery";
const string accessCheckSourceMethod = "srum-access-check";
const string dataType = "historical";
const string historicalNote = "SRUM data is historical and may not match live session usage exactly.";
const string accessDeniedReason = "SRUM database exists, but access was denied. Run QuotaLens or the helper as Administrator, or implement a privileged safe copy method.";
const string tableEnumCompleteReason = "SRUM tables were enumerated. Network usage table mapping still needs validation.";
const string esentutlInspectCompleteReason = "SRUM metadata was inspected through esentutl. Network usage table mapping still needs validation.";
const string srumNotFoundReason = "SRUM database was not found in known Windows locations.";

var mode = GetMode(args);
var periodWindow = GetPeriodWindow(args);
var result = mode == "srum-inspect"
    ? RunSrumInspect(periodWindow)
    : CreateResult(
        false,
        "Unsupported helper mode. Use --mode srum-inspect.",
        "not_started",
        "not_started",
        discoverySourceMethod,
        discoveryStatus: "error",
        period: periodWindow.Period,
        periodStart: periodWindow.Start?.ToString("O") ?? "",
        periodEnd: periodWindow.End.ToString("O"));

Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false
}));

static string GetMode(string[] args)
{
    for (var index = 0; index < args.Length - 1; index += 1)
    {
        if (args[index].Equals("--mode", StringComparison.OrdinalIgnoreCase))
        {
            return args[index + 1].Trim().ToLowerInvariant();
        }
    }

    return "srum-inspect";
}

static PeriodWindow GetPeriodWindow(string[] args)
{
    var period = "all";

    for (var index = 0; index < args.Length - 1; index += 1)
    {
        if (args[index].Equals("--period", StringComparison.OrdinalIgnoreCase))
        {
            period = NormalizePeriod(args[index + 1]);
            break;
        }
    }

    var now = DateTimeOffset.Now;
    DateTimeOffset? start = period switch
    {
        "today" => new DateTimeOffset(DateTime.Today),
        "7d" => now.AddDays(-7),
        "30d" => now.AddDays(-30),
        _ => null,
    };

    return new PeriodWindow(period, start, now);
}

static string NormalizePeriod(string value)
{
    var normalized = (value ?? "").Trim().ToLowerInvariant();

    return normalized switch
    {
        "today" => "today",
        "7d" => "7d",
        "30d" => "30d",
        "all" => "all",
        _ => "all",
    };
}

static object RunSrumInspect(PeriodWindow periodWindow)
{
    try
    {
        if (!OperatingSystem.IsWindows())
        {
            return CreateResult(
                false,
                "SRUM is only available on Windows.",
                "unsupported_os",
                "not_started",
                discoverySourceMethod,
                discoveryStatus: "error",
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"));
        }

        var discovery = DiscoverSrumPath();

        if (string.IsNullOrWhiteSpace(discovery.FoundPath))
        {
            var reason = discovery.DiscoveryStatus == "access_denied"
                ? accessDeniedReason
                : srumNotFoundReason;
            var accessStatus = discovery.DiscoveryStatus == "access_denied"
                ? "access_denied"
                : "not_found";
            var sourceMethod = discovery.DiscoveryStatus == "access_denied"
                ? accessCheckSourceMethod
                : discoverySourceMethod;

            return CreateResult(
                false,
                reason,
                accessStatus,
                "not_started",
                sourceMethod,
                discoveryStatus: discovery.DiscoveryStatus,
                checkedPaths: discovery.CheckedPaths,
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"));
        }

        try
        {
            var tempRoot = Path.Combine(Path.GetTempPath(), "QuotaLens", "srum");
            Directory.CreateDirectory(tempRoot);
            var copyFolder = Path.Combine(tempRoot, DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmssfff"));
            Directory.CreateDirectory(copyFolder);
            var copiedPath = Path.Combine(copyFolder, "SRUDB.dat");
            var copyResult = CopySrumDatabase(discovery.FoundPath, copiedPath);

            if (!copyResult.Success)
            {
                return CreateResult(
                    false,
                    "SRUM database exists but could not be copied because it is locked or access is restricted. Try running QuotaLens as Administrator.",
                    "copy_failed_locked_or_io",
                    "not_started",
                    accessCheckSourceMethod,
                    discovery.FoundPath,
                    discovery.FoundPath,
                    "",
                    discovery.DiscoveryStatus,
                    discovery.CheckedPaths,
                    copyStrategyUsed: copyResult.CopyStrategyUsed,
                    fileCopyStatus: copyResult.FileCopyStatus,
                    esentutlCopyStatus: copyResult.EsentutlCopyStatus,
                    vssCopyStatus: copyResult.VssCopyStatus,
                    copyError: copyResult.CopyError,
                    copiedSupportFiles: copyResult.CopiedSupportFiles,
                    period: periodWindow.Period,
                    periodStart: periodWindow.Start?.ToString("O") ?? "",
                    periodEnd: periodWindow.End.ToString("O"));
            }

            return InspectCopiedSrumMetadata(discovery.FoundPath, copiedPath, discovery.CheckedPaths, copyResult, periodWindow);
        }
        catch (UnauthorizedAccessException)
        {
            return CreateResult(
                false,
                accessDeniedReason,
                "access_denied",
                "not_started",
                accessCheckSourceMethod,
                discovery.FoundPath,
                discovery.FoundPath,
                discoveryStatus: "access_denied",
                checkedPaths: discovery.CheckedPaths,
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"));
        }
        catch (IOException)
        {
            return CreateResult(
                false,
                "SRUM database could not be copied. Run the helper as Administrator or use a privileged safe copy method.",
                "copy_failed_locked_or_io",
                "not_started",
                accessCheckSourceMethod,
                discovery.FoundPath,
                discovery.FoundPath,
                discoveryStatus: "found",
                checkedPaths: discovery.CheckedPaths,
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"));
        }
    }
    catch (Exception error)
    {
        return CreateResult(
            false,
            $"SRUM reader failed safely: {error.Message}",
            "failed",
            "not_started",
            discoverySourceMethod,
            discoveryStatus: "error",
            period: periodWindow.Period,
            periodStart: periodWindow.Start?.ToString("O") ?? "",
            periodEnd: periodWindow.End.ToString("O"));
    }
}

static object CreateResult(
    bool supported,
    string reason,
    string accessStatus,
    string parseStatus,
    string sourceMethod = inspectSourceMethod,
    string srumPath = "",
    string foundPath = "",
    string copiedPath = "",
    string discoveryStatus = "found",
    IEnumerable<string>? checkedPaths = null,
    IEnumerable<string>? tableNames = null,
    IEnumerable<string>? networkTableCandidates = null,
    IEnumerable<TableSchema>? tableSchemas = null,
    string eseApiStatus = "not_started",
    string esentutlStatus = "not_started",
    string esentutlOutputPreview = "",
    string catalogStatus = "not_started",
    string tableEnumerationStatus = "not_started",
    string managedEsentStatus = "not_started",
    string copyStrategyUsed = "not_started",
    string fileCopyStatus = "not_started",
    string esentutlCopyStatus = "not_started",
    string vssCopyStatus = "not_started",
    string copyError = "",
    string recoveryStatus = "not_needed",
    string recoveryStrategyUsed = "none",
    IEnumerable<string>? copiedSupportFiles = null,
    string recoveryError = "",
    string period = "all",
    string periodStart = "",
    string periodEnd = "",
    IEnumerable<AppUsage>? apps = null)
{
    var isAdministrator = IsRunningAsAdministrator();
    var requiresAdministrator = !supported && !isAdministrator && RequiresAdministratorAccess(
        reason,
        accessStatus,
        discoveryStatus,
        fileCopyStatus,
        esentutlCopyStatus,
        vssCopyStatus,
        copyError,
        recoveryStatus,
        recoveryError);

    return new
    {
        supported,
        sourceMethod,
        dataType,
        note = historicalNote,
        reason,
        srumPath,
        foundPath,
        copiedPath,
        discoveryStatus,
        checkedPaths = (checkedPaths ?? Array.Empty<string>()).ToArray(),
        accessStatus,
        parseStatus,
        tableNames = (tableNames ?? Array.Empty<string>()).ToArray(),
        networkTableCandidates = (networkTableCandidates ?? Array.Empty<string>()).ToArray(),
        tableSchemas = (tableSchemas ?? Array.Empty<TableSchema>()).ToArray(),
        eseApiStatus,
        esentutlStatus,
        esentutlOutputPreview,
        catalogStatus,
        tableEnumerationStatus,
        managedEsentStatus,
        copyStrategyUsed,
        fileCopyStatus,
        esentutlCopyStatus,
        vssCopyStatus,
        copyError,
        recoveryStatus,
        recoveryStrategyUsed,
        copiedSupportFiles = (copiedSupportFiles ?? Array.Empty<string>()).ToArray(),
        recoveryError,
        period,
        periodStart,
        periodEnd,
        isAdministrator,
        requiresAdministrator,
        apps = (apps ?? Array.Empty<AppUsage>()).ToArray(),
        collectedAt = DateTimeOffset.UtcNow.ToString("O")
    };
}

static string[] GetKnownSrumPathCandidates()
{
    var windir = Environment.GetEnvironmentVariable("WINDIR");
    var candidates = new List<string>();

    if (!string.IsNullOrWhiteSpace(windir))
    {
        candidates.Add(Path.Combine(windir, "System32", "sru", "SRUDB.dat"));
    }

    candidates.Add(@"C:\Windows\System32\sru\SRUDB.dat");
    candidates.Add(@"C:\Windows\Sysnative\sru\SRUDB.dat");

    return candidates
        .Where((path) => !string.IsNullOrWhiteSpace(path))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

static bool CanReadFile(string path)
{
    using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

    return stream.Length >= 0;
}

static bool ParentDirectoryExists(string path)
{
    var parentDirectory = Path.GetDirectoryName(path);

    return !string.IsNullOrWhiteSpace(parentDirectory) && Directory.Exists(parentDirectory);
}

static (string FoundPath, string Status) ProbeKnownSrumPath(string candidate)
{
    try
    {
        CanReadFile(candidate);
        return (candidate, "found");
    }
    catch (UnauthorizedAccessException)
    {
        return (candidate, "access_denied");
    }
    catch (FileNotFoundException)
    {
        return ("", "not_found");
    }
    catch (DirectoryNotFoundException)
    {
        return ("", "not_found");
    }
    catch (IOException)
    {
        return (candidate, "found");
    }
}

static (string FoundPath, string DiscoveryStatus, string[] CheckedPaths) DiscoverSrumPath()
{
    var checkedPaths = new List<string>();
    var candidates = GetKnownSrumPathCandidates();
    var accessDeniedSeen = false;

    foreach (var candidate in candidates)
    {
        checkedPaths.Add(candidate);

        if (!ParentDirectoryExists(candidate))
        {
            continue;
        }

        var probe = ProbeKnownSrumPath(candidate);

        if (probe.Status == "access_denied")
        {
            return (probe.FoundPath, "access_denied", checkedPaths.ToArray());
        }

        if (probe.Status == "found")
        {
            return (probe.FoundPath, "found", checkedPaths.ToArray());
        }
    }

    var windir = Environment.GetEnvironmentVariable("WINDIR") ?? @"C:\Windows";
    checkedPaths.Add(Path.Combine(windir, "**", "SRUDB.dat"));

    try
    {
        var stopwatch = Stopwatch.StartNew();
        var pendingDirectories = new Queue<string>();
        pendingDirectories.Enqueue(windir);
        var visitedDirectories = 0;

        while (pendingDirectories.Count > 0 && visitedDirectories < 300 && stopwatch.ElapsedMilliseconds < 1500)
        {
            var directory = pendingDirectories.Dequeue();
            visitedDirectories += 1;

            try
            {
                foreach (var directCandidate in Directory.EnumerateFiles(directory, "SRUDB.dat"))
                {
                    checkedPaths.Add(directCandidate);
                    return (directCandidate, "found", checkedPaths.ToArray());
                }

                foreach (var childDirectory in Directory.EnumerateDirectories(directory))
                {
                    if (pendingDirectories.Count < 300)
                    {
                        pendingDirectories.Enqueue(childDirectory);
                    }
                }
            }
            catch (UnauthorizedAccessException)
            {
                accessDeniedSeen = true;
            }
            catch (IOException)
            {
                // Skip locked or transient directories during limited discovery.
            }
        }
    }
    catch (Exception)
    {
        return ("", "error", checkedPaths.ToArray());
    }

    return ("", accessDeniedSeen ? "access_denied" : "not_found", checkedPaths.ToArray());
}

static SrumCopyResult CopySrumDatabase(string sourcePath, string destinationPath)
{
    var fileCopyStatus = "not_started";
    var esentutlCopyStatus = "not_started";
    var vssCopyStatus = "not_started";
    var copyErrors = new List<string>();

    try
    {
        File.Copy(sourcePath, destinationPath, true);

        if (File.Exists(destinationPath) && new FileInfo(destinationPath).Length > 0)
        {
            return CreateSuccessfulCopyResult(
                sourcePath,
                destinationPath,
                "file_copy",
                "success",
                esentutlCopyStatus,
                vssCopyStatus,
                copyErrors);
        }

        fileCopyStatus = "failed:empty_copy";
        copyErrors.Add("File.Copy produced an empty destination file.");
    }
    catch (Exception error) when (error is UnauthorizedAccessException or IOException)
    {
        fileCopyStatus = $"failed:{error.Message}";
        copyErrors.Add($"File.Copy: {error.Message}");
    }

    var esentutlCopy = RunEsentutlCopy(sourcePath, destinationPath, useVss: false);
    esentutlCopyStatus = esentutlCopy.Status;

    if (esentutlCopy.Success)
    {
        return CreateSuccessfulCopyResult(
            sourcePath,
            destinationPath,
            "esentutl_copy",
            fileCopyStatus,
            esentutlCopyStatus,
            vssCopyStatus,
            copyErrors);
    }

    copyErrors.Add($"esentutl copy: {esentutlCopy.Error}");

    if (IsRunningAsAdministrator())
    {
        var vssCopy = RunEsentutlCopy(sourcePath, destinationPath, useVss: true);
        vssCopyStatus = vssCopy.Status;

        if (vssCopy.Success)
        {
            return CreateSuccessfulCopyResult(
                sourcePath,
                destinationPath,
                "esentutl_vss_copy",
                fileCopyStatus,
                esentutlCopyStatus,
                vssCopyStatus,
                copyErrors);
        }

        copyErrors.Add($"esentutl VSS copy: {vssCopy.Error}");
    }
    else
    {
        vssCopyStatus = "skipped:not_admin";
        copyErrors.Add("esentutl VSS copy skipped because the helper is not running as Administrator.");
    }

    return new SrumCopyResult(
        false,
        "",
        "none",
        fileCopyStatus,
        esentutlCopyStatus,
        vssCopyStatus,
        string.Join(" | ", copyErrors),
        Array.Empty<string>());
}

static SrumCopyResult CreateSuccessfulCopyResult(
    string sourcePath,
    string destinationPath,
    string copyStrategyUsed,
    string fileCopyStatus,
    string esentutlCopyStatus,
    string vssCopyStatus,
    List<string> copyErrors)
{
    var supportCopy = CopySrumSupportFiles(sourcePath, destinationPath);
    copyErrors.AddRange(supportCopy.Errors);

    return new SrumCopyResult(
        true,
        destinationPath,
        copyStrategyUsed,
        fileCopyStatus,
        esentutlCopyStatus,
        vssCopyStatus,
        string.Join(" | ", copyErrors.Where((error) => !string.IsNullOrWhiteSpace(error))),
        supportCopy.CopiedFiles);
}

static (string[] CopiedFiles, string[] Errors) CopySrumSupportFiles(string sourcePath, string destinationPath)
{
    var copiedFiles = new List<string>();
    var errors = new List<string>();
    var sourceDirectory = Path.GetDirectoryName(sourcePath);
    var destinationDirectory = Path.GetDirectoryName(destinationPath);

    if (string.IsNullOrWhiteSpace(sourceDirectory) || string.IsNullOrWhiteSpace(destinationDirectory))
    {
        return (copiedFiles.ToArray(), new[] { "SRUM support files could not be copied because source or destination directory was missing." });
    }

    try
    {
        foreach (var supportFilePath in Directory.EnumerateFiles(sourceDirectory))
        {
            if (!IsSrumSupportFile(supportFilePath) ||
                supportFilePath.Equals(sourcePath, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var destinationSupportPath = Path.Combine(destinationDirectory, Path.GetFileName(supportFilePath));
            var copyResult = CopySupportFile(supportFilePath, destinationSupportPath);

            if (copyResult.Success)
            {
                copiedFiles.Add(Path.GetFileName(destinationSupportPath));
            }
            else
            {
                errors.Add($"Support file {Path.GetFileName(supportFilePath)}: {copyResult.Error}");
            }
        }
    }
    catch (Exception error) when (error is UnauthorizedAccessException or IOException)
    {
        errors.Add($"SRUM support files could not be enumerated: {error.Message}");
    }

    return (
        copiedFiles.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy((name) => name, StringComparer.OrdinalIgnoreCase).ToArray(),
        errors.ToArray());
}

static bool IsSrumSupportFile(string path)
{
    var fileName = Path.GetFileName(path);
    var extension = Path.GetExtension(path);

    return extension.Equals(".log", StringComparison.OrdinalIgnoreCase) ||
        extension.Equals(".jrs", StringComparison.OrdinalIgnoreCase) ||
        extension.Equals(".chk", StringComparison.OrdinalIgnoreCase) ||
        extension.Equals(".pat", StringComparison.OrdinalIgnoreCase) ||
        fileName.StartsWith("edb", StringComparison.OrdinalIgnoreCase) ||
        fileName.StartsWith("sru", StringComparison.OrdinalIgnoreCase);
}

static (bool Success, string Error) CopySupportFile(string sourcePath, string destinationPath)
{
    try
    {
        File.Copy(sourcePath, destinationPath, true);

        if (File.Exists(destinationPath) && new FileInfo(destinationPath).Length > 0)
        {
            return (true, "");
        }
    }
    catch (Exception error) when (error is UnauthorizedAccessException or IOException)
    {
        var esentutlCopy = RunEsentutlCopy(sourcePath, destinationPath, useVss: false);

        if (esentutlCopy.Success)
        {
            return (true, "");
        }

        if (IsRunningAsAdministrator())
        {
            var vssCopy = RunEsentutlCopy(sourcePath, destinationPath, useVss: true);

            if (vssCopy.Success)
            {
                return (true, "");
            }

            return (false, $"{error.Message}; esentutl:{esentutlCopy.Error}; vss:{vssCopy.Error}");
        }

        return (false, $"{error.Message}; esentutl:{esentutlCopy.Error}; vss:skipped_not_admin");
    }

    return (false, "copy produced an empty or missing support file.");
}

static (bool Success, string Status, string Error) RunEsentutlCopy(
    string sourcePath,
    string destinationPath,
    bool useVss)
{
    try
    {
        var esentutl = FindEsentutlExecutable();
        var arguments = useVss
            ? $"/y /vss \"{sourcePath}\" /d \"{destinationPath}\" /o"
            : $"/y \"{sourcePath}\" /d \"{destinationPath}\" /o";
        var processResult = RunProcess(esentutl, arguments, 20000);
        var output = ToPreview($"{processResult.Stdout}\n{processResult.Stderr}", 1024);

        if (processResult.ExitCode == 0 &&
            File.Exists(destinationPath) &&
            new FileInfo(destinationPath).Length > 0)
        {
            return (true, $"success:exit_0{(string.IsNullOrWhiteSpace(output) ? "" : $":{output}")}", "");
        }

        var status = processResult.ExitCode == 0
            ? "failed:empty_or_missing_destination"
            : $"failed:exit_{processResult.ExitCode}";

        return (false, status, output);
    }
    catch (Exception error)
    {
        return (false, $"failed:{error.Message}", error.Message);
    }
}

static string FindEsentutlExecutable()
{
    var systemDirectory = Environment.SystemDirectory;
    var candidate = Path.Combine(systemDirectory, "esentutl.exe");

    return File.Exists(candidate) ? candidate : "esentutl.exe";
}

static (int ExitCode, string Stdout, string Stderr) RunProcess(
    string fileName,
    string arguments,
    int timeoutMilliseconds)
{
    using var process = new Process();
    process.StartInfo = new ProcessStartInfo
    {
        FileName = fileName,
        Arguments = arguments,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };

    process.Start();

    if (!process.WaitForExit(timeoutMilliseconds))
    {
        try
        {
            process.Kill();
        }
        catch
        {
            // Ignore cleanup errors; the helper must never crash QuotaLens.
        }

        return (-1, "", "process timed out.");
    }

    return (process.ExitCode, process.StandardOutput.ReadToEnd(), process.StandardError.ReadToEnd());
}

static string ToPreview(string text, int maxLength = 4096)
{
    var normalized = (text ?? "").Replace("\0", "").Trim();

    return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
}

static bool IsRunningAsAdministrator()
{
    try
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);

        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }
    catch
    {
        return false;
    }
}

static bool RequiresAdministratorAccess(
    string reason,
    string accessStatus,
    string discoveryStatus,
    string fileCopyStatus,
    string esentutlCopyStatus,
    string vssCopyStatus,
    string copyError,
    string recoveryStatus,
    string recoveryError)
{
    var combined = string.Join(
        " ",
        new[]
        {
            reason,
            accessStatus,
            discoveryStatus,
            fileCopyStatus,
            esentutlCopyStatus,
            vssCopyStatus,
            copyError,
            recoveryStatus,
            recoveryError
        });

    return accessStatus.Equals("access_denied", StringComparison.OrdinalIgnoreCase) ||
        accessStatus.Equals("copy_failed_locked_or_io", StringComparison.OrdinalIgnoreCase) ||
        discoveryStatus.Equals("access_denied", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("Access is denied", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("access denied", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("Administrator", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("not_admin", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("locked", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("restricted", StringComparison.OrdinalIgnoreCase) ||
        combined.Contains("inaccessible", StringComparison.OrdinalIgnoreCase);
}

static bool IsEseRecoveryRequired(string error)
{
    if (string.IsNullOrWhiteSpace(error))
    {
        return false;
    }

    return error.Contains("not shutdown cleanly", StringComparison.OrdinalIgnoreCase) ||
        error.Contains("dirty shutdown", StringComparison.OrdinalIgnoreCase) ||
        error.Contains("recovery must", StringComparison.OrdinalIgnoreCase) ||
        error.Contains("log required", StringComparison.OrdinalIgnoreCase) ||
        error.Contains("JET_errDatabaseDirtyShutdown", StringComparison.OrdinalIgnoreCase) ||
        error.Contains("DatabaseDirtyShutdown", StringComparison.OrdinalIgnoreCase);
}

static SrumRecoveryResult RunSrumRecovery(string copiedPath)
{
    var databaseFolder = Path.GetDirectoryName(copiedPath);

    if (string.IsNullOrWhiteSpace(databaseFolder) || !Directory.Exists(databaseFolder))
    {
        return new SrumRecoveryResult(
            false,
            "failed",
            "esentutl_recovery",
            "SRUM recovery folder was missing.");
    }

    var baseNames = DetectEseLogBaseNames(databaseFolder);

    if (baseNames.Length == 0)
    {
        return new SrumRecoveryResult(
            false,
            "failed:missing_logs",
            "esentutl_recovery",
            "No ESE log files were available in the SRUM copy folder.");
    }

    var errors = new List<string>();
    var esentutl = FindEsentutlExecutable();

    foreach (var baseName in baseNames)
    {
        var arguments = $"/r {baseName} /l \"{databaseFolder}\" /s \"{databaseFolder}\" /d \"{databaseFolder}\" /o";
        var processResult = RunProcess(esentutl, arguments, 60000);
        var output = ToPreview($"{processResult.Stdout}\n{processResult.Stderr}", 2048);

        if (processResult.ExitCode == 0)
        {
            return new SrumRecoveryResult(
                true,
                "success",
                $"esentutl_recovery:{baseName}",
                "");
        }

        errors.Add($"{baseName}: exit_{processResult.ExitCode}: {output}");
    }

    return new SrumRecoveryResult(
        false,
        "failed",
        "esentutl_recovery",
        string.Join(" | ", errors));
}

static string[] DetectEseLogBaseNames(string folder)
{
    var candidates = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

    try
    {
        foreach (var logPath in Directory.EnumerateFiles(folder, "*.log"))
        {
            var name = Path.GetFileNameWithoutExtension(logPath);

            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            candidates.Add(name);

            if (name.Length >= 3)
            {
                candidates.Add(name[..3]);
            }

            var trimmed = TrimTrailingHexOrDigits(name);

            if (!string.IsNullOrWhiteSpace(trimmed))
            {
                candidates.Add(trimmed);
            }
        }
    }
    catch
    {
        // If log enumeration fails, return the default candidates below.
    }

    candidates.Add("edb");
    candidates.Add("sru");

    return candidates.ToArray();
}

static string TrimTrailingHexOrDigits(string value)
{
    var index = value.Length - 1;

    while (index >= 3 && Uri.IsHexDigit(value[index]))
    {
        index -= 1;
    }

    return index < value.Length - 1 ? value[..(index + 1)] : value;
}

static object InspectCopiedSrumMetadata(
    string srumPath,
    string copiedPath,
    string[] checkedPaths,
    SrumCopyResult copyResult,
    PeriodWindow periodWindow)
{
    var managedResult = ManagedEsentMetadataReader.Inspect(copiedPath);
    var recoveryResult = SrumRecoveryResult.NotNeeded();

    if (!managedResult.Success && IsEseRecoveryRequired(managedResult.Error))
    {
        recoveryResult = RunSrumRecovery(copiedPath);

        if (!recoveryResult.Success)
        {
            return CreateResult(
                false,
                "SRUM database was copied, but ESE recovery failed because required log files were missing or inaccessible.",
                "copied",
                "recovery_failed",
                managedEsentSourceMethod,
                srumPath,
                srumPath,
                copiedPath,
                "found",
                checkedPaths,
                eseApiStatus: "not_started",
                esentutlStatus: "not_started",
                catalogStatus: "managed_esent",
                tableEnumerationStatus: "recovery_required",
                managedEsentStatus: $"failed:{managedResult.Error}",
                copyStrategyUsed: copyResult.CopyStrategyUsed,
                fileCopyStatus: copyResult.FileCopyStatus,
                esentutlCopyStatus: copyResult.EsentutlCopyStatus,
                vssCopyStatus: copyResult.VssCopyStatus,
                copyError: copyResult.CopyError,
                recoveryStatus: recoveryResult.RecoveryStatus,
                recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
                copiedSupportFiles: copyResult.CopiedSupportFiles,
                recoveryError: recoveryResult.RecoveryError,
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"));
        }

        managedResult = ManagedEsentMetadataReader.Inspect(copiedPath);
    }

    if (managedResult.Success)
    {
        var tableNames = managedResult.TableSchemas
            .Select((schema) => schema.TableName)
            .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var networkTableCandidates = FindNetworkTableCandidates(managedResult.TableSchemas);
        var usageResult = SrumNetworkUsageReader.Read(copiedPath, periodWindow);

        if (usageResult.Success)
        {
            return CreateResult(
                true,
                "SRUM historical network usage was read successfully.",
                "copied",
                "network_usage_read",
                SrumConstants.NetworkUsageSourceMethod,
                srumPath,
                srumPath,
                copiedPath,
                "found",
                checkedPaths,
                tableNames,
                networkTableCandidates,
                managedResult.TableSchemas,
                "not_started",
                "not_started",
                "",
                "managed_esent",
                managedResult.TableEnumerationStatus,
                $"success:{managedResult.Status}; {usageResult.Status}",
                copyStrategyUsed: copyResult.CopyStrategyUsed,
                fileCopyStatus: copyResult.FileCopyStatus,
                esentutlCopyStatus: copyResult.EsentutlCopyStatus,
                vssCopyStatus: copyResult.VssCopyStatus,
                copyError: copyResult.CopyError,
                recoveryStatus: recoveryResult.RecoveryStatus,
                recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
                copiedSupportFiles: copyResult.CopiedSupportFiles,
                recoveryError: recoveryResult.RecoveryError,
                period: periodWindow.Period,
                periodStart: periodWindow.Start?.ToString("O") ?? "",
                periodEnd: periodWindow.End.ToString("O"),
                apps: usageResult.Apps);
        }

        var usageParseStatus = usageResult.Error.Contains("not found", StringComparison.OrdinalIgnoreCase)
            ? "network_usage_table_missing"
            : "network_usage_read_failed";

        return CreateResult(
            false,
            $"SRUM tables were enumerated, but network usage rows could not be read: {usageResult.Error}",
            "copied",
            usageParseStatus,
            managedEsentSourceMethod,
            srumPath,
            srumPath,
            copiedPath,
            "found",
            checkedPaths,
            tableNames,
            networkTableCandidates,
            managedResult.TableSchemas,
            "not_started",
            "not_started",
            "",
            "managed_esent",
            managedResult.TableEnumerationStatus,
            $"success:{managedResult.Status}; failed:{usageResult.Error}",
            copyStrategyUsed: copyResult.CopyStrategyUsed,
            fileCopyStatus: copyResult.FileCopyStatus,
            esentutlCopyStatus: copyResult.EsentutlCopyStatus,
            vssCopyStatus: copyResult.VssCopyStatus,
            copyError: copyResult.CopyError,
            recoveryStatus: recoveryResult.RecoveryStatus,
            recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
            copiedSupportFiles: copyResult.CopiedSupportFiles,
            recoveryError: recoveryResult.RecoveryError,
            period: periodWindow.Period,
            periodStart: periodWindow.Start?.ToString("O") ?? "",
            periodEnd: periodWindow.End.ToString("O"));
    }

    var inspectResult = EseMetadataReader.Inspect(copiedPath);

    if (inspectResult.Success)
    {
        var tableNames = inspectResult.TableSchemas
            .Select((schema) => schema.TableName)
            .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var networkTableCandidates = FindNetworkTableCandidates(inspectResult.TableSchemas);

        return CreateResult(
            false,
            tableEnumCompleteReason,
            "copied",
            "tables_enumerated",
            tableEnumSourceMethod,
            srumPath,
            srumPath,
            copiedPath,
            "found",
            checkedPaths,
            tableNames,
            networkTableCandidates,
            inspectResult.TableSchemas,
            $"success:{inspectResult.Status}",
            "not_started",
            "",
            inspectResult.CatalogStatus,
            inspectResult.TableEnumerationStatus,
            $"failed:{managedResult.Error}",
            copyStrategyUsed: copyResult.CopyStrategyUsed,
            fileCopyStatus: copyResult.FileCopyStatus,
            esentutlCopyStatus: copyResult.EsentutlCopyStatus,
            vssCopyStatus: copyResult.VssCopyStatus,
            copyError: copyResult.CopyError,
            recoveryStatus: recoveryResult.RecoveryStatus,
            recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
            copiedSupportFiles: copyResult.CopiedSupportFiles,
            recoveryError: recoveryResult.RecoveryError,
            period: periodWindow.Period,
            periodStart: periodWindow.Start?.ToString("O") ?? "",
            periodEnd: periodWindow.End.ToString("O"));
    }

    var esentutlResult = EsentutlMetadataReader.Inspect(copiedPath);

    if (esentutlResult.Success && esentutlResult.TableSchemas.Length > 0)
    {
        var tableNames = esentutlResult.TableSchemas
            .Select((schema) => schema.TableName)
            .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var networkTableCandidates = FindNetworkTableCandidates(esentutlResult.TableSchemas);

        return CreateResult(
            false,
            esentutlInspectCompleteReason,
            "copied",
            "metadata_inspected",
            esentutlInspectSourceMethod,
            srumPath,
            srumPath,
            copiedPath,
            "found",
            checkedPaths,
            tableNames,
            networkTableCandidates,
            esentutlResult.TableSchemas,
            $"failed:{inspectResult.Error}",
            $"success:{esentutlResult.Status}",
            esentutlResult.OutputPreview,
            inspectResult.CatalogStatus,
            "esentutl_metadata_parsed",
            $"failed:{managedResult.Error}",
            copyStrategyUsed: copyResult.CopyStrategyUsed,
            fileCopyStatus: copyResult.FileCopyStatus,
            esentutlCopyStatus: copyResult.EsentutlCopyStatus,
            vssCopyStatus: copyResult.VssCopyStatus,
            copyError: copyResult.CopyError,
            recoveryStatus: recoveryResult.RecoveryStatus,
            recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
            copiedSupportFiles: copyResult.CopiedSupportFiles,
            recoveryError: recoveryResult.RecoveryError,
            period: periodWindow.Period,
            periodStart: periodWindow.Start?.ToString("O") ?? "",
            periodEnd: periodWindow.End.ToString("O"));
    }

    var esentutlStatus = esentutlResult.Success
        ? $"success:{esentutlResult.Status}"
        : $"failed:{esentutlResult.Error}";
    var esentutlError = esentutlResult.Success
        ? "esentutl returned metadata output but no table list could be parsed"
        : esentutlResult.Error;

    return CreateResult(
        false,
        $"SRUM table enumeration failed. Managed ESENT: {managedResult.Error}. ESE API: {inspectResult.Error}. esentutl: {esentutlError}.",
        "copied",
        "table_enumeration_failed",
        inspectSourceMethod,
        srumPath,
        srumPath,
        copiedPath,
        "found",
        checkedPaths,
        eseApiStatus: $"failed:{inspectResult.Error}",
        esentutlStatus: esentutlStatus,
        esentutlOutputPreview: esentutlResult.OutputPreview,
        catalogStatus: inspectResult.CatalogStatus,
        tableEnumerationStatus: inspectResult.TableEnumerationStatus,
        managedEsentStatus: $"failed:{managedResult.Error}",
        copyStrategyUsed: copyResult.CopyStrategyUsed,
        fileCopyStatus: copyResult.FileCopyStatus,
        esentutlCopyStatus: copyResult.EsentutlCopyStatus,
        vssCopyStatus: copyResult.VssCopyStatus,
        copyError: copyResult.CopyError,
        recoveryStatus: recoveryResult.RecoveryStatus,
        recoveryStrategyUsed: recoveryResult.RecoveryStrategyUsed,
        copiedSupportFiles: copyResult.CopiedSupportFiles,
        recoveryError: recoveryResult.RecoveryError,
        period: periodWindow.Period,
        periodStart: periodWindow.Start?.ToString("O") ?? "",
        periodEnd: periodWindow.End.ToString("O"));
}

static string[] FindNetworkTableCandidates(IEnumerable<TableSchema> tableSchemas)
{
    var keywords = new[] { "network", "app", "bytes", "interface", "energy", "application" };

    return tableSchemas
        .Where((schema) =>
            keywords.Any((keyword) => schema.TableName.Contains(keyword, StringComparison.OrdinalIgnoreCase)) ||
            schema.Columns.Any((column) =>
                keywords.Any((keyword) => column.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase))))
        .Select((schema) => schema.TableName)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

sealed record ColumnSchema(string Name, string Type);

sealed record TableSchema(string TableName, ColumnSchema[] Columns);

sealed record AppUsage(
    int AppId,
    string AppName,
    string ProcessName,
    string PackageName,
    string RawIdentity,
    string NormalizedIdentity,
    ulong ReceivedBytes,
    ulong SentBytes,
    ulong TotalBytes,
    string LastSeen,
    string SourceMethod);

sealed record ManagedEsentInspectionResult(
    bool Success,
    string Error,
    TableSchema[] TableSchemas,
    string Status,
    string TableEnumerationStatus);

sealed record EseInspectionResult(
    bool Success,
    string Error,
    TableSchema[] TableSchemas,
    string Status,
    string CatalogStatus,
    string TableEnumerationStatus);

sealed record EsentutlInspectionResult(
    bool Success,
    string Error,
    TableSchema[] TableSchemas,
    string Status,
    string OutputPreview);

sealed record SrumNetworkUsageResult(
    bool Success,
    string Error,
    AppUsage[] Apps,
    string Status);

sealed record SrumCopyResult(
    bool Success,
    string CopiedPath,
    string CopyStrategyUsed,
    string FileCopyStatus,
    string EsentutlCopyStatus,
    string VssCopyStatus,
    string CopyError,
    string[] CopiedSupportFiles);

sealed record SrumRecoveryResult(
    bool Success,
    string RecoveryStatus,
    string RecoveryStrategyUsed,
    string RecoveryError)
{
    public static SrumRecoveryResult NotNeeded() => new(true, "not_needed", "none", "");
}

sealed record PeriodWindow(string Period, DateTimeOffset? Start, DateTimeOffset End);

sealed record AppIdMapping(int AppId, string RawIdentity, string NormalizedIdentity, int IdType);

sealed record DecodedIdentity(string RawIdentity, string NormalizedIdentity);

sealed class AppUsageAccumulator
{
    public int AppId { get; init; }

    public string RawIdentity { get; set; } = "";

    public string NormalizedIdentity { get; set; } = "";

    public ulong ReceivedBytes { get; set; }

    public ulong SentBytes { get; set; }

    public DateTimeOffset? LastSeen { get; set; }
}

static class SrumConstants
{
    public const string NetworkUsageSourceMethod = "srum-network-usage";
    public const string NetworkTableName = "{973F5D5C-1D90-4944-BE8E-24B94231A174}";
    public const string IdMapTableName = "SruDbIdMapTable";
}

static class SrumNetworkUsageReader
{
    public static SrumNetworkUsageResult Read(string databasePath, PeriodWindow periodWindow)
    {
        try
        {
            return WithOpenedDatabase(databasePath, (session, dbid) =>
            {
                var tableNames = Api.GetTableNames(session, dbid).ToArray();

                if (!tableNames.Contains(SrumConstants.NetworkTableName, StringComparer.OrdinalIgnoreCase))
                {
                    return Failure($"SRUM network usage table {SrumConstants.NetworkTableName} was not found.");
                }

                var idMap = tableNames.Contains(SrumConstants.IdMapTableName, StringComparer.OrdinalIgnoreCase)
                    ? ReadIdMap(session, dbid)
                    : new Dictionary<int, AppIdMapping>();
                var usage = ReadNetworkUsageRows(session, dbid, idMap, periodWindow);

                if (usage.Count == 0)
                {
                    return Failure($"SRUM network usage table was found, but no readable usage rows were returned for period {periodWindow.Period}.");
                }

                var apps = usage.Values
                    .Select((item) => ToAppUsage(item, idMap))
                    .OrderBy((app) => app.AppName.Equals("Unknown App", StringComparison.OrdinalIgnoreCase))
                    .ThenByDescending((app) => app.TotalBytes)
                    .ThenBy((app) => app.AppName, StringComparer.OrdinalIgnoreCase)
                    .Take(50)
                    .ToArray();

                return new SrumNetworkUsageResult(
                    true,
                    "",
                    apps,
                    $"network_rows_grouped:{usage.Count}; id_map_rows:{idMap.Count}");
            });
        }
        catch (Exception error)
        {
            return Failure(error.Message);
        }
    }

    private static SrumNetworkUsageResult WithOpenedDatabase(
        string databasePath,
        Func<Session, JET_DBID, SrumNetworkUsageResult> action)
    {
        JET_DBID dbid = JET_DBID.Nil;
        var databaseOpened = false;
        var databaseAttached = false;
        var instanceName = $"QuotaLensSrumUsageRead-{Guid.NewGuid():N}";
        var esentRoot = Path.Combine(Path.GetTempPath(), "QuotaLens", "managed-esent", Guid.NewGuid().ToString("N"));
        var systemPath = Path.Combine(esentRoot, "system");
        var logPath = Path.Combine(esentRoot, "logs");
        var tempPath = Path.Combine(esentRoot, "temp");

        Directory.CreateDirectory(systemPath);
        Directory.CreateDirectory(logPath);
        Directory.CreateDirectory(tempPath);

        using var instance = new Instance(instanceName);
        instance.Parameters.SystemDirectory = systemPath;
        instance.Parameters.LogFileDirectory = logPath;
        instance.Parameters.TempDirectory = tempPath;
        instance.Parameters.Recovery = false;
        instance.Parameters.CircularLog = true;
        instance.Parameters.NoInformationEvent = true;
        instance.Init();

        using var session = new Session(instance);

        try
        {
            Api.JetAttachDatabase(session, databasePath, AttachDatabaseGrbit.ReadOnly);
            databaseAttached = true;
            Api.JetOpenDatabase(session, databasePath, null, out dbid, OpenDatabaseGrbit.ReadOnly);
            databaseOpened = true;

            return action(session, dbid);
        }
        finally
        {
            if (databaseOpened)
            {
                try
                {
                    Api.JetCloseDatabase(session, dbid, CloseDatabaseGrbit.None);
                }
                catch
                {
                    // Ignore cleanup errors; this helper must report probe results, not crash on teardown.
                }
            }

            if (databaseAttached)
            {
                try
                {
                    Api.JetDetachDatabase(session, databasePath);
                }
                catch
                {
                    // Ignore cleanup errors; this helper must report probe results, not crash on teardown.
                }
            }
        }
    }

    private static Dictionary<int, AppIdMapping> ReadIdMap(Session session, JET_DBID dbid)
    {
        var mappings = new Dictionary<int, AppIdMapping>();
        JET_TABLEID tableId = JET_TABLEID.Nil;

        try
        {
            Api.JetOpenTable(session, dbid, SrumConstants.IdMapTableName, null, 0, OpenTableGrbit.ReadOnly, out tableId);
            var columns = Api.GetColumnDictionary(session, tableId);

            if (!columns.TryGetValue("IdIndex", out var idIndexColumn) ||
                !columns.TryGetValue("IdBlob", out var idBlobColumn))
            {
                return mappings;
            }

            columns.TryGetValue("IdType", out var idTypeColumn);
            Api.MoveBeforeFirst(session, tableId);

            while (Api.TryMoveNext(session, tableId))
            {
                var appId = ReadInt32(session, tableId, idIndexColumn);

                if (!appId.HasValue)
                {
                    continue;
                }

                var idBlob = Api.RetrieveColumn(session, tableId, idBlobColumn) ?? Array.Empty<byte>();
                var decodedIdentity = DecodeIdBlob(idBlob);
                var idType = idTypeColumn != JET_COLUMNID.Nil
                    ? ReadInt32(session, tableId, idTypeColumn) ?? 0
                    : 0;

                mappings[appId.Value] = new AppIdMapping(
                    appId.Value,
                    decodedIdentity.RawIdentity,
                    decodedIdentity.NormalizedIdentity,
                    idType);
            }
        }
        catch
        {
            return mappings;
        }
        finally
        {
            if (tableId != JET_TABLEID.Nil)
            {
                Api.JetCloseTable(session, tableId);
            }
        }

        return mappings;
    }

    private static Dictionary<int, AppUsageAccumulator> ReadNetworkUsageRows(
        Session session,
        JET_DBID dbid,
        IReadOnlyDictionary<int, AppIdMapping> idMap,
        PeriodWindow periodWindow)
    {
        var usage = new Dictionary<int, AppUsageAccumulator>();
        JET_TABLEID tableId = JET_TABLEID.Nil;

        try
        {
            Api.JetOpenTable(session, dbid, SrumConstants.NetworkTableName, null, 0, OpenTableGrbit.ReadOnly, out tableId);
            var columns = Api.GetColumnDictionary(session, tableId);

            if (!columns.TryGetValue("AppId", out var appIdColumn) ||
                !columns.TryGetValue("BytesRecvd", out var receivedColumn) ||
                !columns.TryGetValue("BytesSent", out var sentColumn))
            {
                throw new InvalidOperationException("SRUM network table is missing AppId, BytesRecvd, or BytesSent columns.");
            }

            columns.TryGetValue("TimeStamp", out var timestampColumn);
            Api.MoveBeforeFirst(session, tableId);

            while (Api.TryMoveNext(session, tableId))
            {
                var appId = ReadInt32(session, tableId, appIdColumn);

                if (!appId.HasValue)
                {
                    continue;
                }

                DateTimeOffset? timestamp = null;

                if (timestampColumn != JET_COLUMNID.Nil)
                {
                    timestamp = ReadTimestamp(session, tableId, timestampColumn);
                }

                if (!ShouldIncludeTimestamp(periodWindow, timestamp))
                {
                    continue;
                }

                if (!usage.TryGetValue(appId.Value, out var accumulator))
                {
                    accumulator = new AppUsageAccumulator
                    {
                        AppId = appId.Value,
                        RawIdentity = idMap.TryGetValue(appId.Value, out var mapping)
                            ? mapping.RawIdentity
                            : "",
                        NormalizedIdentity = idMap.TryGetValue(appId.Value, out var normalizedMapping)
                            ? normalizedMapping.NormalizedIdentity
                            : ""
                    };
                    usage[appId.Value] = accumulator;
                }

                accumulator.ReceivedBytes = AddSaturating(
                    accumulator.ReceivedBytes,
                    ReadUInt64(session, tableId, receivedColumn));
                accumulator.SentBytes = AddSaturating(
                    accumulator.SentBytes,
                    ReadUInt64(session, tableId, sentColumn));

                if (timestamp.HasValue &&
                    (!accumulator.LastSeen.HasValue || timestamp.Value > accumulator.LastSeen.Value))
                {
                    accumulator.LastSeen = timestamp;
                }
            }
        }
        finally
        {
            if (tableId != JET_TABLEID.Nil)
            {
                Api.JetCloseTable(session, tableId);
            }
        }

        return usage;
    }

    private static bool ShouldIncludeTimestamp(PeriodWindow periodWindow, DateTimeOffset? timestamp)
    {
        if (periodWindow.Period == "all")
        {
            return true;
        }

        if (!timestamp.HasValue || !periodWindow.Start.HasValue)
        {
            return false;
        }

        return timestamp.Value >= periodWindow.Start.Value && timestamp.Value <= periodWindow.End;
    }

    private static AppUsage ToAppUsage(
        AppUsageAccumulator accumulator,
        IReadOnlyDictionary<int, AppIdMapping> idMap)
    {
        var rawIdentity = !string.IsNullOrWhiteSpace(accumulator.RawIdentity)
            ? accumulator.RawIdentity
            : idMap.TryGetValue(accumulator.AppId, out var mapping)
                ? mapping.RawIdentity
                : "";
        var normalizedIdentity = !string.IsNullOrWhiteSpace(accumulator.NormalizedIdentity)
            ? accumulator.NormalizedIdentity
            : idMap.TryGetValue(accumulator.AppId, out var normalizedMapping)
                ? normalizedMapping.NormalizedIdentity
                : NormalizeDecodedIdentity(rawIdentity);
        var names = DeriveNames(normalizedIdentity);
        var totalBytes = AddSaturating(accumulator.ReceivedBytes, accumulator.SentBytes);

        return new AppUsage(
            accumulator.AppId,
            names.AppName,
            names.ProcessName,
            names.PackageName,
            rawIdentity,
            normalizedIdentity,
            accumulator.ReceivedBytes,
            accumulator.SentBytes,
            totalBytes,
            accumulator.LastSeen?.ToString("O") ?? "",
            SrumConstants.NetworkUsageSourceMethod);
    }

    private static int? ReadInt32(Session session, JET_TABLEID tableId, JET_COLUMNID columnId)
    {
        try
        {
            return Api.RetrieveColumnAsInt32(session, tableId, columnId);
        }
        catch
        {
            try
            {
                var value = Api.RetrieveColumnAsUInt32(session, tableId, columnId);

                return value.HasValue && value.Value <= int.MaxValue ? (int)value.Value : null;
            }
            catch
            {
                return null;
            }
        }
    }

    private static ulong ReadUInt64(Session session, JET_TABLEID tableId, JET_COLUMNID columnId)
    {
        try
        {
            return Api.RetrieveColumnAsUInt64(session, tableId, columnId) ?? 0UL;
        }
        catch
        {
            try
            {
                var signedValue = Api.RetrieveColumnAsInt64(session, tableId, columnId);

                return signedValue.HasValue && signedValue.Value > 0 ? (ulong)signedValue.Value : 0UL;
            }
            catch
            {
                try
                {
                    return Api.RetrieveColumnAsUInt32(session, tableId, columnId) ?? 0UL;
                }
                catch
                {
                    try
                    {
                        var signedValue = Api.RetrieveColumnAsInt32(session, tableId, columnId);

                        return signedValue.HasValue && signedValue.Value > 0 ? (ulong)signedValue.Value : 0UL;
                    }
                    catch
                    {
                        return 0UL;
                    }
                }
            }
        }
    }

    private static DateTimeOffset? ReadTimestamp(Session session, JET_TABLEID tableId, JET_COLUMNID columnId)
    {
        try
        {
            var dateTime = Api.RetrieveColumnAsDateTime(session, tableId, columnId);

            if (dateTime.HasValue)
            {
                return new DateTimeOffset(DateTime.SpecifyKind(dateTime.Value, DateTimeKind.Utc));
            }
        }
        catch
        {
            // Fall through to integer timestamp decoding.
        }

        try
        {
            var fileTime = Api.RetrieveColumnAsInt64(session, tableId, columnId);

            if (fileTime.HasValue && fileTime.Value > 0)
            {
                return DateTimeOffset.FromFileTime(fileTime.Value);
            }
        }
        catch
        {
            // Ignore timestamp decode failures; bytes are still valid without lastSeen.
        }

        return null;
    }

    private static DecodedIdentity DecodeIdBlob(byte[] blob)
    {
        if (blob.Length == 0)
        {
            return new DecodedIdentity("", "");
        }

        var utf16 = CleanDecodedText(Encoding.Unicode.GetString(blob));
        var utf8 = CleanDecodedText(Encoding.UTF8.GetString(blob));
        var best = ScoreDecodedText(utf16) >= ScoreDecodedText(utf8) ? utf16 : utf8;

        if (!string.IsNullOrWhiteSpace(best) && ScoreDecodedText(best) >= 2)
        {
            return new DecodedIdentity(best, NormalizeDecodedIdentity(best));
        }

        var hexPreview = $"hex:{Convert.ToHexString(blob.Take(48).ToArray())}";

        return new DecodedIdentity(hexPreview, hexPreview);
    }

    private static string CleanDecodedText(string value) =>
        new string(value
            .Replace('\0', ' ')
            .Where((character) => !char.IsControl(character) || char.IsWhiteSpace(character))
            .ToArray())
            .Trim();

    private static int ScoreDecodedText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0;
        }

        var printable = value.Count((character) => !char.IsControl(character));
        var replacements = value.Count((character) => character == '\uFFFD');

        return printable - (replacements * 4);
    }

    private static string NormalizeDecodedIdentity(string value)
    {
        var collapsed = CollapseWhitespace(value);
        var compacted = LooksCharacterSpaced(collapsed)
            ? string.Concat(collapsed.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            : collapsed;

        return compacted
            .Replace("\\\\", "\\")
            .Replace("\\ ", "\\")
            .Replace(" \\", "\\")
            .Replace("/ ", "/")
            .Replace(" /", "/")
            .Replace(". ", ".")
            .Replace(" .", ".")
            .Trim();
    }

    private static string CollapseWhitespace(string value)
    {
        var builder = new StringBuilder();
        var previousWasWhitespace = false;

        foreach (var character in value.Trim())
        {
            if (char.IsWhiteSpace(character))
            {
                if (!previousWasWhitespace)
                {
                    builder.Append(' ');
                }

                previousWasWhitespace = true;
                continue;
            }

            builder.Append(character);
            previousWasWhitespace = false;
        }

        return builder.ToString().Trim();
    }

    private static bool LooksCharacterSpaced(string value)
    {
        var tokens = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        if (tokens.Length < 4)
        {
            return false;
        }

        var singleCharacterTokens = tokens.Count((token) => token.Length == 1);
        var pathLikeTokens = tokens.Count((token) => token is "\\" or "/" or "." or "-" or "_" or ":");

        return (singleCharacterTokens + pathLikeTokens) >= Math.Max(4, tokens.Length * 8 / 10);
    }

    private static (string AppName, string ProcessName, string PackageName) DeriveNames(string rawIdentity)
    {
        var identity = rawIdentity.Trim();

        if (string.IsNullOrWhiteSpace(identity))
        {
            return ("Unknown App", "Unknown", "");
        }

        var serviceName = GetFriendlyServiceName(identity);

        if (!string.IsNullOrWhiteSpace(serviceName))
        {
            return (serviceName, identity, "");
        }

        var normalized = identity.Replace('/', '\\');
        var fileName = Path.GetFileName(normalized);

        if (!string.IsNullOrWhiteSpace(fileName) &&
            fileName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            var friendlyName = GetFriendlyExecutableName(fileName);
            var appName = string.IsNullOrWhiteSpace(friendlyName)
                ? ToDisplayName(Path.GetFileNameWithoutExtension(fileName))
                : friendlyName;

            return (appName, fileName, "");
        }

        var friendlyPackage = GetFriendlyPackageName(identity);

        if (!string.IsNullOrWhiteSpace(friendlyPackage))
        {
            var packageName = identity.Contains("!", StringComparison.Ordinal)
                ? identity.Split('!', 2)[0].Trim()
                : identity;

            return (friendlyPackage, friendlyPackage, packageName);
        }

        if (identity.Contains("!", StringComparison.Ordinal))
        {
            var packageName = identity.Split('!', 2)[0].Trim();
            var appName = ShortenIdentity(packageName);

            return (appName, appName, packageName);
        }

        var fallbackName = ShortenIdentity(identity);

        return (fallbackName, fallbackName, "");
    }

    private static string ShortenIdentity(string identity)
    {
        if (string.IsNullOrWhiteSpace(identity))
        {
            return "Unknown App";
        }

        var trimmed = identity.Trim();

        return trimmed.Length <= 80 ? trimmed : $"{trimmed[..77]}...";
    }

    private static string GetFriendlyExecutableName(string fileName)
    {
        var normalized = fileName.Trim().ToLowerInvariant();
        var mapping = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["steam.exe"] = "Steam",
            ["chrome.exe"] = "Google Chrome",
            ["brave.exe"] = "Brave",
            ["msedge.exe"] = "Microsoft Edge",
            ["onedrive.exe"] = "OneDrive",
            ["spotify.exe"] = "Spotify",
            ["discord.exe"] = "Discord",
            ["whatsapp.exe"] = "WhatsApp",
            ["code.exe"] = "VS Code",
            ["node.exe"] = "Node.js",
            ["obs64.exe"] = "OBS Studio",
            ["capcut.exe"] = "CapCut",
            ["python.exe"] = "Python",
            ["java.exe"] = "Java",
            ["zlauncher.exe"] = "Zepetto / Point Blank Launcher",
            ["riotclientservices.exe"] = "Riot Client",
            ["valorant-win64-shipping.exe"] = "Valorant",
            ["genshinimpact.exe"] = "Genshin Impact",
            ["hyp.exe"] = "HoYoPlay"
        };

        return mapping.TryGetValue(normalized, out var friendlyName) ? friendlyName : "";
    }

    private static string GetFriendlyServiceName(string identity)
    {
        if (identity.Equals("DoSvc", StringComparison.OrdinalIgnoreCase) ||
            identity.Contains("\\DoSvc", StringComparison.OrdinalIgnoreCase))
        {
            return "Delivery Optimization / Windows Update";
        }

        if (identity.Equals("BITS", StringComparison.OrdinalIgnoreCase) ||
            identity.Contains("\\BITS", StringComparison.OrdinalIgnoreCase))
        {
            return "Background Intelligent Transfer Service";
        }

        return "";
    }

    private static string GetFriendlyPackageName(string identity)
    {
        var normalized = identity.ToLowerInvariant();

        if (normalized.Contains("microsoft.yourphone"))
        {
            return "Phone Link";
        }

        if (normalized.Contains("microsoft.gamingservices"))
        {
            return "Gaming Services";
        }

        if (normalized.Contains("microsoftwindows.client.webexperience"))
        {
            return "Windows Web Experience";
        }

        if (normalized.Contains("openai.codex"))
        {
            return "Codex";
        }

        if (normalized.Contains("whatsapp"))
        {
            return "WhatsApp";
        }

        return "";
    }

    private static string ToDisplayName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "Unknown App";
        }

        return string.Join(
            " ",
            value
                .Split(new[] { '-', '_', '.' }, StringSplitOptions.RemoveEmptyEntries)
                .Select((part) =>
                    part.Length <= 1
                        ? part.ToUpperInvariant()
                        : $"{char.ToUpperInvariant(part[0])}{part[1..]}"));
    }

    private static ulong AddSaturating(ulong left, ulong right)
    {
        var result = left + right;

        return result < left ? ulong.MaxValue : result;
    }

    private static SrumNetworkUsageResult Failure(string error) =>
        new(false, error, Array.Empty<AppUsage>(), "failed");
}

static class ManagedEsentMetadataReader
{
    public static ManagedEsentInspectionResult Inspect(string databasePath)
    {
        JET_DBID dbid = JET_DBID.Nil;
        var databaseOpened = false;
        var databaseAttached = false;

        try
        {
            var instanceName = $"QuotaLensSrumManagedInspect-{Guid.NewGuid():N}";
            var esentRoot = Path.Combine(Path.GetTempPath(), "QuotaLens", "managed-esent", Guid.NewGuid().ToString("N"));
            var systemPath = Path.Combine(esentRoot, "system");
            var logPath = Path.Combine(esentRoot, "logs");
            var tempPath = Path.Combine(esentRoot, "temp");

            Directory.CreateDirectory(systemPath);
            Directory.CreateDirectory(logPath);
            Directory.CreateDirectory(tempPath);

            using var instance = new Instance(instanceName);
            instance.Parameters.SystemDirectory = systemPath;
            instance.Parameters.LogFileDirectory = logPath;
            instance.Parameters.TempDirectory = tempPath;
            instance.Parameters.Recovery = false;
            instance.Parameters.CircularLog = true;
            instance.Parameters.NoInformationEvent = true;
            instance.Init();

            using var session = new Session(instance);

            try
            {
                Api.JetAttachDatabase(session, databasePath, AttachDatabaseGrbit.ReadOnly);
                databaseAttached = true;
                Api.JetOpenDatabase(session, databasePath, null, out dbid, OpenDatabaseGrbit.ReadOnly);
                databaseOpened = true;

                var tableNames = Api.GetTableNames(session, dbid)
                    .Where((name) => !string.IsNullOrWhiteSpace(name))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                var tableSchemas = tableNames
                    .Select((tableName) => new TableSchema(tableName, ListColumns(session, dbid, tableName)))
                    .ToArray();

                return tableSchemas.Length > 0
                    ? new ManagedEsentInspectionResult(
                        true,
                        "",
                        tableSchemas,
                        $"tables:{tableSchemas.Length}",
                        "tables_enumerated")
                    : Failure("Managed ESENT opened SRUM copy, but no tables were enumerated.", "no_tables_found");
            }
            finally
            {
                if (databaseOpened)
                {
                    try
                    {
                        Api.JetCloseDatabase(session, dbid, CloseDatabaseGrbit.None);
                    }
                    catch
                    {
                        // Ignore cleanup errors so metadata inspection results are not hidden.
                    }
                }

                if (databaseAttached)
                {
                    try
                    {
                        Api.JetDetachDatabase(session, databasePath);
                    }
                    catch
                    {
                        // Ignore cleanup errors so metadata inspection results are not hidden.
                    }
                }
            }
        }
        catch (Exception error)
        {
            return Failure(error.Message);
        }
    }

    private static ColumnSchema[] ListColumns(Session session, JET_DBID dbid, string tableName)
    {
        try
        {
            return Api.GetTableColumns(session, dbid, tableName)
                .Select((column) => new ColumnSchema(column.Name, column.Coltyp.ToString()))
                .OrderBy((column) => column.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return Array.Empty<ColumnSchema>();
        }
    }

    private static ManagedEsentInspectionResult Failure(
        string error,
        string tableEnumerationStatus = "failed") =>
        new(false, error, Array.Empty<TableSchema>(), "failed", tableEnumerationStatus);
}

static class EsentutlMetadataReader
{
    private static string FindEsentutl()
    {
        var systemDirectory = Environment.SystemDirectory;
        var candidate = Path.Combine(systemDirectory, "esentutl.exe");

        return File.Exists(candidate) ? candidate : "esentutl.exe";
    }

    private static (int ExitCode, string Stdout, string Stderr) RunProcess(string fileName, string arguments)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        process.Start();

        if (!process.WaitForExit(8000))
        {
            try
            {
                process.Kill();
            }
            catch
            {
                // Ignore cleanup errors; the helper must never crash QuotaLens.
            }

            return (-1, "", "esentutl metadata inspection timed out.");
        }

        return (process.ExitCode, process.StandardOutput.ReadToEnd(), process.StandardError.ReadToEnd());
    }

    private static string ToPreview(string text, int maxLength = 4096)
    {
        var normalized = (text ?? "").Replace("\0", "").Trim();

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    public static EsentutlInspectionResult Inspect(string databasePath)
    {
        try
        {
            var esentutl = FindEsentutl();
            var result = RunProcess(esentutl, $"/m \"{databasePath}\"");
            var combinedOutput = $"{result.Stdout}\n{result.Stderr}";
            var preview = ToPreview(combinedOutput);

            if (result.ExitCode != 0)
            {
                return new EsentutlInspectionResult(
                    false,
                    $"esentutl exited with code {result.ExitCode}.",
                    Array.Empty<TableSchema>(),
                    $"exit_{result.ExitCode}",
                    preview);
            }

            var tableSchemas = ParseTableSchemasFromOutput(combinedOutput);

            return new EsentutlInspectionResult(
                true,
                "",
                tableSchemas,
                tableSchemas.Length > 0 ? "metadata_output_parsed" : "metadata_output_available",
                preview);
        }
        catch (Exception error)
        {
            return new EsentutlInspectionResult(
                false,
                error.Message,
                Array.Empty<TableSchema>(),
                "failed",
                "");
        }
    }

    private static TableSchema[] ParseTableSchemasFromOutput(string output)
    {
        var tableNames = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var rawLine in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var line = rawLine.Trim();

            if (line.StartsWith("Table", StringComparison.OrdinalIgnoreCase) && line.Contains(':'))
            {
                var name = line[(line.IndexOf(':') + 1)..].Trim();

                if (!string.IsNullOrWhiteSpace(name))
                {
                    tableNames.Add(name.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0]);
                }
            }

            if (line.StartsWith("{", StringComparison.Ordinal) && line.Contains('}'))
            {
                var endIndex = line.IndexOf('}');

                if (endIndex > 0)
                {
                    tableNames.Add(line[..(endIndex + 1)]);
                }
            }
        }

        return tableNames.Select((tableName) => new TableSchema(tableName, Array.Empty<ColumnSchema>())).ToArray();
    }
}

static class EseMetadataReader
{
    private const int JetErrSuccess = 0;
    private const int JetErrNoCurrentRecord = -1603;
    private const int JetMoveFirst = int.MinValue;
    private const int JetMoveNext = 1;
    private const uint JetObjInfoList = 1;
    private const uint JetColInfoList = 1;
    private const uint JetObjtypTable = 1;
    private const uint JetBitDbReadOnly = 0x00000001;
    private const uint JetParamSystemPath = 0;
    private const uint JetParamTempPath = 1;
    private const uint JetParamLogFilePath = 2;
    private const uint JetParamRecovery = 34;

    public static EseInspectionResult Inspect(string databasePath)
    {
        IntPtr instance = IntPtr.Zero;
        IntPtr sesid = IntPtr.Zero;
        uint dbid = 0;
        var attached = false;
        var opened = false;

        try
        {
            var err = NativeEsent.JetCreateInstanceW(out instance, $"QuotaLensSrumInspect{Guid.NewGuid():N}");

            if (err != JetErrSuccess)
            {
                return Failure($"JetCreateInstance failed with error {err}.");
            }

            _ = NativeEsent.JetSetSystemParameterW(
                ref instance,
                IntPtr.Zero,
                JetParamRecovery,
                UIntPtr.Zero,
                "Off");
            var instanceTempPath = Path.Combine(Path.GetTempPath(), "QuotaLens", "esent");
            Directory.CreateDirectory(instanceTempPath);

            _ = NativeEsent.JetSetSystemParameterW(
                ref instance,
                IntPtr.Zero,
                JetParamSystemPath,
                UIntPtr.Zero,
                instanceTempPath);
            _ = NativeEsent.JetSetSystemParameterW(
                ref instance,
                IntPtr.Zero,
                JetParamTempPath,
                UIntPtr.Zero,
                instanceTempPath);
            _ = NativeEsent.JetSetSystemParameterW(
                ref instance,
                IntPtr.Zero,
                JetParamLogFilePath,
                UIntPtr.Zero,
                instanceTempPath);

            err = NativeEsent.JetInit(ref instance);

            if (err != JetErrSuccess)
            {
                return Failure($"JetInit failed with error {err}.");
            }

            err = NativeEsent.JetBeginSessionW(instance, out sesid, null, null);

            if (err != JetErrSuccess)
            {
                return Failure($"JetBeginSession failed with error {err}.");
            }

            err = NativeEsent.JetAttachDatabaseW(sesid, databasePath, JetBitDbReadOnly);

            if (err != JetErrSuccess)
            {
                return Failure($"JetAttachDatabase failed with error {err}.");
            }

            attached = true;
            err = NativeEsent.JetOpenDatabaseW(sesid, databasePath, null, out dbid, JetBitDbReadOnly);

            if (err != JetErrSuccess)
            {
                return Failure($"JetOpenDatabase failed with error {err}.");
            }

            opened = true;
            var tableNames = ListTableNames(sesid, dbid);
            var tableSchemas = tableNames
                .Select((tableName) => new TableSchema(tableName, ListColumns(sesid, dbid, tableName)))
                .OrderBy((schema) => schema.TableName, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return new EseInspectionResult(
                true,
                "",
                tableSchemas,
                "metadata_inspected",
                "object_info_list",
                tableSchemas.Length > 0 ? "tables_enumerated" : "no_tables_found");
        }
        catch (Exception error)
        {
            return Failure(error.Message);
        }
        finally
        {
            if (opened && sesid != IntPtr.Zero)
            {
                _ = NativeEsent.JetCloseDatabase(sesid, dbid, 0);
            }

            if (attached && sesid != IntPtr.Zero)
            {
                _ = NativeEsent.JetDetachDatabaseW(sesid, databasePath);
            }

            if (sesid != IntPtr.Zero)
            {
                _ = NativeEsent.JetEndSession(sesid, 0);
            }

            if (instance != IntPtr.Zero)
            {
                _ = NativeEsent.JetTerm(instance);
            }
        }
    }

    private static EseInspectionResult Failure(
        string error,
        string catalogStatus = "failed",
        string tableEnumerationStatus = "failed") =>
        new(false, error, Array.Empty<TableSchema>(), "failed", catalogStatus, tableEnumerationStatus);

    private static string[] ListTableNames(IntPtr sesid, uint dbid)
    {
        var objectListSize = Marshal.SizeOf<JetObjectList>();
        var objectListPointer = Marshal.AllocHGlobal(objectListSize);

        try
        {
            Marshal.StructureToPtr(
                new JetObjectList { StructSize = (uint)objectListSize },
                objectListPointer,
                false);
            var err = NativeEsent.JetGetObjectInfoW(
                sesid,
                dbid,
                0,
                null,
                null,
                objectListPointer,
                (uint)objectListSize,
                JetObjInfoList);

            if (err != JetErrSuccess)
            {
                throw new InvalidOperationException($"JetGetObjectInfo failed with error {err}.");
            }

            var objectList = Marshal.PtrToStructure<JetObjectList>(objectListPointer);
            var tableNames = new List<string>();

            try
            {
                err = NativeEsent.JetMove(sesid, objectList.TableId, JetMoveFirst, 0);

                while (err == JetErrSuccess)
                {
                    var objectType = RetrieveUInt32(sesid, objectList.TableId, objectList.ColumnIdObjectType);
                    var objectName = RetrieveString(sesid, objectList.TableId, objectList.ColumnIdObjectName);

                    if (objectType == JetObjtypTable && !string.IsNullOrWhiteSpace(objectName))
                    {
                        tableNames.Add(objectName);
                    }

                    err = NativeEsent.JetMove(sesid, objectList.TableId, JetMoveNext, 0);
                }

                if (err != JetErrNoCurrentRecord)
                {
                    throw new InvalidOperationException($"JetMove object list failed with error {err}.");
                }
            }
            finally
            {
                _ = NativeEsent.JetCloseTable(sesid, objectList.TableId);
            }

            return tableNames
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        finally
        {
            Marshal.FreeHGlobal(objectListPointer);
        }
    }

    private static ColumnSchema[] ListColumns(IntPtr sesid, uint dbid, string tableName)
    {
        var err = NativeEsent.JetOpenTableW(sesid, dbid, tableName, IntPtr.Zero, 0, 0, out var tableId);

        if (err != JetErrSuccess)
        {
            return Array.Empty<ColumnSchema>();
        }

        try
        {
            var columnListSize = Marshal.SizeOf<JetColumnList>();
            var columnListPointer = Marshal.AllocHGlobal(columnListSize);

            try
            {
                Marshal.StructureToPtr(
                    new JetColumnList { StructSize = (uint)columnListSize },
                    columnListPointer,
                    false);
                err = NativeEsent.JetGetTableColumnInfoW(
                    sesid,
                    tableId,
                    null,
                    columnListPointer,
                    (uint)columnListSize,
                    JetColInfoList);

                if (err != JetErrSuccess)
                {
                    return Array.Empty<ColumnSchema>();
                }

                var columnList = Marshal.PtrToStructure<JetColumnList>(columnListPointer);
                var columns = new List<ColumnSchema>();

                try
                {
                    err = NativeEsent.JetMove(sesid, columnList.TableId, JetMoveFirst, 0);

                    while (err == JetErrSuccess)
                    {
                        var columnName = RetrieveString(sesid, columnList.TableId, columnList.ColumnIdColumnName);
                        var columnType = RetrieveUInt32(sesid, columnList.TableId, columnList.ColumnIdColumnType);

                        if (!string.IsNullOrWhiteSpace(columnName))
                        {
                            columns.Add(new ColumnSchema(columnName, FormatColumnType(columnType)));
                        }

                        err = NativeEsent.JetMove(sesid, columnList.TableId, JetMoveNext, 0);
                    }
                }
                finally
                {
                    _ = NativeEsent.JetCloseTable(sesid, columnList.TableId);
                }

                return columns
                    .OrderBy((column) => column.Name, StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }
            finally
            {
                Marshal.FreeHGlobal(columnListPointer);
            }
        }
        finally
        {
            _ = NativeEsent.JetCloseTable(sesid, tableId);
        }
    }

    private static string RetrieveString(IntPtr sesid, IntPtr tableId, uint columnId)
    {
        var buffer = new byte[4096];
        var err = NativeEsent.JetRetrieveColumn(
            sesid,
            tableId,
            columnId,
            buffer,
            (uint)buffer.Length,
            out var actualSize,
            0,
            IntPtr.Zero);

        if (err != JetErrSuccess || actualSize == 0)
        {
            return "";
        }

        var count = Math.Min((int)actualSize, buffer.Length);
        var value = Encoding.Unicode.GetString(buffer, 0, count).TrimEnd('\0');

        if (value.Count((character) => character == '\0') > Math.Max(1, value.Length / 4))
        {
            value = Encoding.UTF8.GetString(buffer, 0, count).TrimEnd('\0');
        }

        return value.Trim();
    }

    private static uint RetrieveUInt32(IntPtr sesid, IntPtr tableId, uint columnId)
    {
        var buffer = new byte[sizeof(uint)];
        var err = NativeEsent.JetRetrieveColumn(
            sesid,
            tableId,
            columnId,
            buffer,
            (uint)buffer.Length,
            out var actualSize,
            0,
            IntPtr.Zero);

        return err == JetErrSuccess && actualSize >= sizeof(uint)
            ? BitConverter.ToUInt32(buffer, 0)
            : 0;
    }

    private static string FormatColumnType(uint columnType) =>
        columnType switch
        {
            1 => "Bit",
            2 => "UnsignedByte",
            3 => "Short",
            4 => "Long",
            5 => "Currency",
            6 => "IEEESingle",
            7 => "IEEEDouble",
            8 => "DateTime",
            9 => "Binary",
            10 => "Text",
            11 => "LongBinary",
            12 => "LongText",
            14 => "UnsignedLong",
            15 => "LongLong",
            16 => "Guid",
            17 => "UnsignedShort",
            _ => $"Unknown({columnType})",
        };

    [StructLayout(LayoutKind.Sequential)]
    private struct JetObjectList
    {
        public uint StructSize;
        public IntPtr TableId;
        public uint RecordCount;
        public uint ColumnIdContainerName;
        public uint ColumnIdObjectName;
        public uint ColumnIdObjectType;
        public uint ColumnIdCreatedAt;
        public uint ColumnIdUpdatedAt;
        public uint Grbit;
        public uint Flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JetColumnList
    {
        public uint StructSize;
        public IntPtr TableId;
        public uint RecordCount;
        public uint ColumnIdPresentationOrder;
        public uint ColumnIdColumnName;
        public uint ColumnIdColumnId;
        public uint ColumnIdColumnType;
        public uint ColumnIdCountry;
        public uint ColumnIdLanguage;
        public uint ColumnIdCodePage;
        public uint ColumnIdCollate;
        public uint ColumnIdMaxLength;
        public uint ColumnIdGrbit;
        public uint ColumnIdDefault;
        public uint ColumnIdBaseTableName;
        public uint ColumnIdBaseColumnName;
        public uint ColumnIdDefinitionName;
    }
}

static class NativeEsent
{
    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetCreateInstanceW(out IntPtr instance, string name);

    [DllImport("esent.dll")]
    public static extern int JetInit(ref IntPtr instance);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetSetSystemParameterW(
        ref IntPtr instance,
        IntPtr sesid,
        uint paramid,
        UIntPtr lParam,
        string? param);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetBeginSessionW(
        IntPtr instance,
        out IntPtr sesid,
        string? username,
        string? password);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetAttachDatabaseW(IntPtr sesid, string database, uint grbit);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetOpenDatabaseW(
        IntPtr sesid,
        string database,
        string? connect,
        out uint dbid,
        uint grbit);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetGetObjectInfoW(
        IntPtr sesid,
        uint dbid,
        uint objectType,
        string? containerName,
        string? objectName,
        IntPtr result,
        uint maxResultSize,
        uint infoLevel);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetOpenTableW(
        IntPtr sesid,
        uint dbid,
        string tableName,
        IntPtr parameters,
        uint parameterSize,
        uint grbit,
        out IntPtr tableid);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetGetTableColumnInfoW(
        IntPtr sesid,
        IntPtr tableid,
        string? columnName,
        IntPtr result,
        uint maxResultSize,
        uint infoLevel);

    [DllImport("esent.dll")]
    public static extern int JetMove(IntPtr sesid, IntPtr tableid, int rows, uint grbit);

    [DllImport("esent.dll")]
    public static extern int JetRetrieveColumn(
        IntPtr sesid,
        IntPtr tableid,
        uint columnid,
        byte[] data,
        uint dataSize,
        out uint actualDataSize,
        uint grbit,
        IntPtr retrieveInfo);

    [DllImport("esent.dll")]
    public static extern int JetCloseTable(IntPtr sesid, IntPtr tableid);

    [DllImport("esent.dll")]
    public static extern int JetCloseDatabase(IntPtr sesid, uint dbid, uint grbit);

    [DllImport("esent.dll", CharSet = CharSet.Unicode)]
    public static extern int JetDetachDatabaseW(IntPtr sesid, string database);

    [DllImport("esent.dll")]
    public static extern int JetEndSession(IntPtr sesid, uint grbit);

    [DllImport("esent.dll")]
    public static extern int JetTerm(IntPtr instance);
}
