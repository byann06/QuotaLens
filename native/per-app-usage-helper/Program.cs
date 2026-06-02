using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

const string parserSourceMethod = "srum-parser-prototype";
const string discoverySourceMethod = "srum-path-discovery";
const string accessCheckSourceMethod = "srum-access-check";
const string dataType = "historical";
const string note = "SRUM data is historical and may not match live session usage exactly.";
const string srumAccessDeniedReason = "SRUM database exists, but access was denied. Run QuotaLens or the helper as Administrator, or implement a privileged safe copy method.";
const string parserNotReadyReason = "SRUM database was copied, but network usage tables could not be parsed yet.";
const string srumNotFoundReason = "SRUM database was not found in known Windows locations.";

object CreateResult(
    bool supported,
    string reason,
    string accessStatus,
    string parseStatus,
    string sourceMethod = parserSourceMethod,
    string srumPath = "",
    string foundPath = "",
    string copiedPath = "",
    string discoveryStatus = "found",
    IEnumerable<string>? checkedPaths = null,
    IEnumerable<string>? tableNames = null,
    IEnumerable<string>? networkTableCandidates = null)
{
    return new
    {
        supported,
        sourceMethod,
        dataType,
        note,
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
        apps = Array.Empty<object>(),
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

static string FindEsentutl()
{
    var systemDirectory = Environment.SystemDirectory;
    var candidate = Path.Combine(systemDirectory, "esentutl.exe");

    return File.Exists(candidate) ? candidate : "esentutl.exe";
}

static (int ExitCode, string Stdout, string Stderr) RunProcess(string fileName, string arguments)
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

        return (-1, "", "ESE investigation timed out.");
    }

    return (process.ExitCode, process.StandardOutput.ReadToEnd(), process.StandardError.ReadToEnd());
}

static string[] ExtractPossibleTableNames(string text)
{
    var tableNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var patterns = new[]
    {
        @"(?im)^\s*Table\s*[:=]\s*(?<name>[A-Za-z0-9_\-{}.$]+)",
        @"(?im)^\s*(?<name>\{[0-9A-Fa-f\-]{36}\})\s",
        @"(?im)^\s*(?<name>[A-Za-z0-9_.$-]+)\s+\d+\s+"
    };

    foreach (var pattern in patterns)
    {
        foreach (Match match in Regex.Matches(text, pattern))
        {
            var name = match.Groups["name"].Value.Trim();

            if (name.Length > 0)
            {
                tableNames.Add(name);
            }
        }
    }

    return tableNames.OrderBy((name) => name, StringComparer.OrdinalIgnoreCase).ToArray();
}

static string[] FindNetworkTableCandidates(IEnumerable<string> tableNames)
{
    var keywords = new[] { "network", "net", "connect", "usage", "energy", "srum" };

    return tableNames
        .Where((tableName) => keywords.Any((keyword) =>
            tableName.Contains(keyword, StringComparison.OrdinalIgnoreCase)))
        .OrderBy((name) => name, StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

object InvestigateCopiedSrum(string srumPath, string copiedPath, string[] checkedPaths)
{
    var esentutl = FindEsentutl();
    var investigation = RunProcess(esentutl, $"/ms \"{copiedPath}\"");
    var combinedOutput = $"{investigation.Stdout}\n{investigation.Stderr}";
    var tableNames = ExtractPossibleTableNames(combinedOutput);
    var networkTableCandidates = FindNetworkTableCandidates(tableNames);
    var parseStatus = tableNames.Length > 0
        ? "tables_listed_parser_not_implemented"
        : "table_list_unavailable_parser_not_implemented";

    return CreateResult(
        false,
        parserNotReadyReason,
        "found_and_copied",
        parseStatus,
        parserSourceMethod,
        srumPath,
        srumPath,
        copiedPath,
        "found",
        checkedPaths,
        tableNames,
        networkTableCandidates);
}

object result;

try
{
    if (!OperatingSystem.IsWindows())
    {
        result = CreateResult(
            false,
            "SRUM is only available on Windows.",
            "unsupported_os",
            "not_started",
            discoverySourceMethod,
            discoveryStatus: "error");
    }
    else
    {
        var discovery = DiscoverSrumPath();

        if (string.IsNullOrWhiteSpace(discovery.FoundPath))
        {
            var reason = discovery.DiscoveryStatus == "access_denied"
                ? srumAccessDeniedReason
                : srumNotFoundReason;
            var accessStatus = discovery.DiscoveryStatus == "access_denied"
                ? "access_denied"
                : "not_found";
            var sourceMethod = discovery.DiscoveryStatus == "access_denied"
                ? accessCheckSourceMethod
                : discoverySourceMethod;

            result = CreateResult(
                false,
                reason,
                accessStatus,
                "not_started",
                sourceMethod,
                discoveryStatus: discovery.DiscoveryStatus,
                checkedPaths: discovery.CheckedPaths);
        }
        else if (discovery.DiscoveryStatus == "access_denied")
        {
            result = CreateResult(
                false,
                srumAccessDeniedReason,
                "access_denied",
                "not_started",
                accessCheckSourceMethod,
                discovery.FoundPath,
                discovery.FoundPath,
                discoveryStatus: "access_denied",
                checkedPaths: discovery.CheckedPaths);
        }
        else
        {
            try
            {
                var tempRoot = Path.Combine(Path.GetTempPath(), "QuotaLens", "srum");
                Directory.CreateDirectory(tempRoot);
                var copiedPath = Path.Combine(tempRoot, $"SRUDB-{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}.dat");

                File.Copy(discovery.FoundPath, copiedPath, true);

                var copiedFile = new FileInfo(copiedPath);
                result = copiedFile.Length > 0
                    ? InvestigateCopiedSrum(discovery.FoundPath, copiedPath, discovery.CheckedPaths)
                    : CreateResult(
                        false,
                        "SRUM database copy is empty or could not be inspected.",
                        "copied_empty",
                        "not_started",
                        parserSourceMethod,
                        discovery.FoundPath,
                        discovery.FoundPath,
                        copiedPath,
                        "found",
                        discovery.CheckedPaths);
            }
            catch (UnauthorizedAccessException)
            {
                result = CreateResult(
                    false,
                    srumAccessDeniedReason,
                    "access_denied",
                    "not_started",
                    accessCheckSourceMethod,
                    discovery.FoundPath,
                    discovery.FoundPath,
                    discoveryStatus: "access_denied",
                    checkedPaths: discovery.CheckedPaths);
            }
            catch (IOException)
            {
                result = CreateResult(
                    false,
                    "SRUM database could not be copied. Admin permission or safe copy method may be required.",
                    "copy_failed_locked_or_io",
                    "not_started",
                    parserSourceMethod,
                    discovery.FoundPath,
                    discovery.FoundPath,
                    discoveryStatus: "found",
                    checkedPaths: discovery.CheckedPaths);
            }
        }
    }
}
catch (Exception error)
{
    result = CreateResult(
        false,
        $"SRUM reader failed safely: {error.Message}",
        "failed",
        "not_started",
        discoverySourceMethod,
        discoveryStatus: "error");
}

Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false
}));
